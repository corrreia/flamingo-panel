import { DurableObject } from "cloudflare:workers";
import { createLogger, setupLogger } from "../lib/logger";

const logger = createLogger("durable-objects", "console");
const WSS_RE = /^wss:/;
const WS_RE = /^ws:/;

export class ConsoleSession extends DurableObject {
  private wingsSocket: WebSocket | null = null;
  private buffer: string[] = [];
  private static readonly BUFFER_SIZE = 200;

  // Stored for reconnection
  private wingsUrl = "";
  private wingsToken = "";
  private panelUrl = "";
  private reconnectAttempts = 0;
  private static readonly MAX_RECONNECT_ATTEMPTS = 5;
  private static readonly RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000];

  // On reconnect, Wings replays its console buffer. Clients already have those
  // lines, so we suppress broadcasting the first N messages (= our pre-reconnect
  // buffer size) and just let them silently refill the buffer.
  private skipReplayCount = 0;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    // biome-ignore lint/suspicious/useAwait: blockConcurrencyWhile requires async callback
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          event TEXT NOT NULL,
          data TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
    });
  }

  async fetch(request: Request): Promise<Response> {
    await setupLogger();
    const url = new URL(request.url);

    if (url.pathname === "/connect") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }

      const wingsUrl = url.searchParams.get("wingsUrl") ?? "";
      const wingsToken = url.searchParams.get("wingsToken") ?? "";
      const userId = url.searchParams.get("userId") ?? "";
      const serverId = url.searchParams.get("serverId") ?? "";
      const panelUrl = url.searchParams.get("panelUrl") ?? "";

      // Accept the WebSocket from the client side of the pair
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Tag with user info for identification
      this.ctx.acceptWebSocket(server, [userId, serverId]);

      logger.info("client connected", { userId, serverId });

      // Send buffered lines to the new client immediately
      for (const line of this.buffer) {
        server.send(line);
      }

      // Store connection params for reconnection
      this.wingsUrl = wingsUrl;
      this.wingsToken = wingsToken;
      this.panelUrl = panelUrl;

      // Connect to Wings if not already connected.
      // Use waitUntil so we return the 101 immediately — the browser gets
      // "Connected" right away and console output flows once Wings is ready.
      if (!this.wingsSocket || this.wingsSocket.readyState !== WebSocket.OPEN) {
        // Let the user know we're establishing the Wings connection
        server.send(
          JSON.stringify({
            event: "daemon message",
            args: ["Connecting to server console..."],
          })
        );
        this.reconnectAttempts = 0;
        this.ctx.waitUntil(this.connectToWings(wingsUrl, wingsToken, panelUrl));
      }

      // Log the connection
      this.ctx.storage.sql.exec(
        "INSERT INTO audit_log (user_id, event, data) VALUES (?, ?, ?)",
        userId,
        "console.connect",
        null
      );

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  }

  private async connectToWings(
    wingsUrl: string,
    wingsToken: string,
    panelUrl: string
  ) {
    if (this.wingsSocket) {
      try {
        this.wingsSocket.close();
      } catch {
        // Ignore close errors on stale socket
      }
      this.wingsSocket = null;
    }

    // On reconnect, Wings will replay its console buffer. Suppress broadcasting
    // those messages (clients already have them) and let them just refill ours.
    this.skipReplayCount = this.buffer.length;
    this.buffer = [];

    // Workers fetch() only supports http(s):// — convert wss:// back to https://
    // (the wingsUrl was built with wss:// for browser WebSocket, but DOs use fetch + Upgrade)
    const fetchUrl = wingsUrl.replace(WSS_RE, "https:").replace(WS_RE, "http:");

    // Use fetch() with Upgrade header so we can set Origin.
    // Wings checks Origin against its configured panel URL.
    // Abort after 10s if Wings is unreachable.
    let resp: Response;
    try {
      resp = await fetch(fetchUrl, {
        headers: {
          Upgrade: "websocket",
          Origin: panelUrl,
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      const reason =
        err instanceof DOMException && err.name === "TimeoutError"
          ? "Connection to Wings timed out (10s)"
          : `Failed to connect to Wings: ${err instanceof Error ? err.message : String(err)}`;
      logger.error("wings connection failed", {
        wingsUrl: fetchUrl,
        error: reason,
      });
      this.broadcastError(reason);
      return;
    }

    const ws = resp.webSocket;
    if (!ws) {
      logger.error("wings websocket upgrade failed", {
        wingsUrl: fetchUrl,
        status: resp.status,
      });
      this.broadcastError(
        `Wings WebSocket upgrade failed (HTTP ${resp.status})`
      );
      return;
    }

    ws.accept();

    // Authenticate with Wings
    ws.send(JSON.stringify({ event: "auth", args: [wingsToken] }));

    ws.addEventListener("message", (event) => {
      const data = typeof event.data === "string" ? event.data : "";

      // Buffer for new-client replay
      this.buffer.push(data);
      if (this.buffer.length > ConsoleSession.BUFFER_SIZE) {
        this.buffer = this.buffer.slice(-ConsoleSession.BUFFER_SIZE);
      }

      // After reconnect, suppress Wings' replay — clients already have it
      if (this.skipReplayCount > 0) {
        this.skipReplayCount--;
        return;
      }

      // Fan out to all connected browser clients
      for (const client of this.ctx.getWebSockets()) {
        try {
          if (client.readyState === WebSocket.OPEN) {
            client.send(data);
          }
        } catch {
          // Client may have disconnected
        }
      }
    });

    ws.addEventListener("close", () => {
      this.wingsSocket = null;
      this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      logger.error("wings websocket error");
      this.wingsSocket = null;
      this.scheduleReconnect();
    });

    this.wingsSocket = ws;
    this.reconnectAttempts = 0;
  }

  private broadcastError(message: string) {
    const payload = JSON.stringify({ event: "daemon error", args: [message] });
    for (const client of this.ctx.getWebSockets()) {
      try {
        client.send(payload);
      } catch {
        /* client gone */
      }
    }
  }

  private scheduleReconnect() {
    const clients = this.ctx.getWebSockets();
    if (clients.length === 0 || !this.wingsUrl) {
      logger.warn("wings connection lost, no clients to reconnect for");
      return;
    }

    if (this.reconnectAttempts >= ConsoleSession.MAX_RECONNECT_ATTEMPTS) {
      logger.error("wings reconnect failed after max attempts", {
        attempts: this.reconnectAttempts,
      });
      this.broadcastError("Wings connection lost");
      return;
    }

    const delay =
      ConsoleSession.RECONNECT_DELAYS[this.reconnectAttempts] ??
      ConsoleSession.RECONNECT_DELAYS[ConsoleSession.RECONNECT_DELAYS.length - 1];
    this.reconnectAttempts++;
    logger.info("wings reconnecting", {
      attempt: this.reconnectAttempts,
      delayMs: delay,
    });

    this.ctx.waitUntil(
      new Promise<void>((resolve) => {
        setTimeout(async () => {
          // Check again — clients may have left during the delay
          if (this.ctx.getWebSockets().length === 0) {
            resolve();
            return;
          }
          await this.connectToWings(
            this.wingsUrl,
            this.wingsToken,
            this.panelUrl
          );
          resolve();
        }, delay);
      })
    );
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const data =
      typeof message === "string" ? message : new TextDecoder().decode(message);

    // Log commands to audit trail
    try {
      const parsed = JSON.parse(data);
      if (parsed.event === "send command" && parsed.args?.[0]) {
        const tags = this.ctx.getTags(ws);
        const userId = tags[0] || "unknown";
        this.ctx.storage.sql.exec(
          "INSERT INTO audit_log (user_id, event, data) VALUES (?, ?, ?)",
          userId,
          "console.command",
          parsed.args[0]
        );
      }
    } catch {
      // Not valid JSON or not a command event — ignore
    }

    // Relay to Wings
    if (this.wingsSocket?.readyState === WebSocket.OPEN) {
      this.wingsSocket.send(data);
    }
  }

  webSocketClose(ws: WebSocket) {
    const tags = this.ctx.getTags(ws);
    const userId = tags[0] || "unknown";
    logger.info("client disconnected", { userId });
    this.ctx.storage.sql.exec(
      "INSERT INTO audit_log (user_id, event, data) VALUES (?, ?, ?)",
      userId,
      "console.disconnect",
      null
    );

    // If no more clients, close Wings connection
    const remaining = this.ctx.getWebSockets();
    if (remaining.length === 0 && this.wingsSocket) {
      this.wingsSocket.close();
      this.wingsSocket = null;
    }
  }

  webSocketError(_ws: WebSocket) {
    const remaining = this.ctx.getWebSockets();
    if (remaining.length === 0 && this.wingsSocket) {
      this.wingsSocket.close();
      this.wingsSocket = null;
    }
  }
}
