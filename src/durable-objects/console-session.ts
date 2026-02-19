import { DurableObject } from "cloudflare:workers";

interface ConnectParams {
  wingsUrl: string;
  wingsToken: string;
  userId: string;
  serverId: string;
}

export class ConsoleSession extends DurableObject {
  private wingsSocket: WebSocket | null = null;
  private buffer: string[] = [];
  private static readonly BUFFER_SIZE = 200;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
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
    const url = new URL(request.url);

    if (url.pathname === "/connect" && request.method === "POST") {
      const params = await request.json() as ConnectParams;

      // Accept the WebSocket from the client side of the pair
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Tag with user info for identification
      this.ctx.acceptWebSocket(server, [params.userId, params.serverId]);

      // Send buffered lines to the new client immediately
      for (const line of this.buffer) {
        server.send(line);
      }

      // Connect to Wings if not already connected
      if (!this.wingsSocket || this.wingsSocket.readyState !== WebSocket.OPEN) {
        await this.connectToWings(params.wingsUrl, params.wingsToken);
      }

      // Log the connection
      this.ctx.storage.sql.exec(
        "INSERT INTO audit_log (user_id, event, data) VALUES (?, ?, ?)",
        params.userId, "console.connect", null,
      );

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  }

  private async connectToWings(wingsUrl: string, wingsToken: string) {
    if (this.wingsSocket) {
      try { this.wingsSocket.close(); } catch {}
      this.wingsSocket = null;
    }

    const ws = new WebSocket(wingsUrl);

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ event: "auth", args: [wingsToken] }));
    });

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
        } catch {}
      }
    });

    ws.addEventListener("close", () => {
      this.wingsSocket = null;
      const msg = JSON.stringify({ event: "daemon error", args: ["Wings connection lost"] });
      for (const client of this.ctx.getWebSockets()) {
        try { client.send(msg); } catch {}
      }
    });

    ws.addEventListener("error", () => {
      this.wingsSocket = null;
    });

    this.wingsSocket = ws;
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const data = typeof message === "string" ? message : new TextDecoder().decode(message);

    // Log commands to audit trail
    try {
      const parsed = JSON.parse(data);
      if (parsed.event === "send command" && parsed.args?.[0]) {
        const tags = this.ctx.getTags(ws);
        const userId = tags[0] || "unknown";
        this.ctx.storage.sql.exec(
          "INSERT INTO audit_log (user_id, event, data) VALUES (?, ?, ?)",
          userId, "console.command", parsed.args[0],
        );
      }
    } catch {}

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
      userId, "console.disconnect", null,
    );

    // If no more clients, close Wings connection
    const remaining = this.ctx.getWebSockets();
    if (remaining.length === 0 && this.wingsSocket) {
      this.wingsSocket.close();
      this.wingsSocket = null;
    }
  }

  webSocketError(ws: WebSocket) {
    const remaining = this.ctx.getWebSockets();
    if (remaining.length === 0 && this.wingsSocket) {
      this.wingsSocket.close();
      this.wingsSocket = null;
    }
  }
}
