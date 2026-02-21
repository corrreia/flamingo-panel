import { DurableObject } from "cloudflare:workers";

export class ConsoleSession extends DurableObject {
  private wingsSocket: WebSocket | null = null;
  private buffer: string[] = [];
  private static readonly BUFFER_SIZE = 200;

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

  fetch(request: Request): Response {
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

      // Send buffered lines to the new client immediately
      for (const line of this.buffer) {
        server.send(line);
      }

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

    // Workers fetch() only supports http(s):// — convert wss:// back to https://
    // (the wingsUrl was built with wss:// for browser WebSocket, but DOs use fetch + Upgrade)
    const fetchUrl = wingsUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");

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
      const errorMsg = JSON.stringify({
        event: "daemon error",
        args: [reason],
      });
      for (const client of this.ctx.getWebSockets()) {
        try {
          client.send(errorMsg);
        } catch {
          /* client gone */
        }
      }
      return;
    }

    const ws = resp.webSocket;
    if (!ws) {
      const errorMsg = JSON.stringify({
        event: "daemon error",
        args: [`Wings WebSocket upgrade failed (HTTP ${resp.status})`],
      });
      for (const client of this.ctx.getWebSockets()) {
        try {
          client.send(errorMsg);
        } catch {
          /* client gone */
        }
      }
      return;
    }

    ws.accept();

    // Authenticate with Wings
    ws.send(JSON.stringify({ event: "auth", args: [wingsToken] }));

    ws.addEventListener("message", (event) => {
      const data = typeof event.data === "string" ? event.data : "";

      // Buffer for reconnect replay
      this.buffer.push(data);
      if (this.buffer.length > ConsoleSession.BUFFER_SIZE) {
        this.buffer = this.buffer.slice(-ConsoleSession.BUFFER_SIZE);
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
      const msg = JSON.stringify({
        event: "daemon error",
        args: ["Wings connection lost"],
      });
      for (const client of this.ctx.getWebSockets()) {
        try {
          client.send(msg);
        } catch {
          /* client gone */
        }
      }
    });

    ws.addEventListener("error", () => {
      this.wingsSocket = null;
    });

    this.wingsSocket = ws;
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
