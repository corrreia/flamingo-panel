import { DurableObject } from "cloudflare:workers";

interface ConsoleSessionState {
  wingsUrl: string;
  wingsToken: string;
}

export class ConsoleSession extends DurableObject {
  private wingsSocket: WebSocket | null = null;
  private clientSockets: Set<WebSocket> = new Set();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/connect") {
      // Initialize the session with Wings connection details
      const body = await request.json() as ConsoleSessionState;
      this.ctx.storage.put("wingsUrl", body.wingsUrl);
      this.ctx.storage.put("wingsToken", body.wingsToken);
      return new Response("ok");
    }

    if (url.pathname === "/websocket") {
      // Client WebSocket upgrade
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      this.ctx.acceptWebSocket(server);
      this.clientSockets.add(server);

      // Connect to Wings if not already connected
      if (!this.wingsSocket || this.wingsSocket.readyState !== WebSocket.OPEN) {
        await this.connectToWings();
      }

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  }

  private async connectToWings() {
    const wingsUrl = await this.ctx.storage.get<string>("wingsUrl");
    const wingsToken = await this.ctx.storage.get<string>("wingsToken");

    if (!wingsUrl || !wingsToken) {
      throw new Error("Wings connection not configured");
    }

    const ws = new WebSocket(wingsUrl);

    ws.addEventListener("open", () => {
      // Send auth token to Wings
      ws.send(JSON.stringify({
        event: "auth",
        args: [wingsToken],
      }));
    });

    ws.addEventListener("message", (event) => {
      // Relay Wings messages to all connected clients
      for (const client of this.clientSockets) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(typeof event.data === "string" ? event.data : "");
        }
      }
    });

    ws.addEventListener("close", () => {
      this.wingsSocket = null;
      for (const client of this.clientSockets) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ event: "daemon error", args: ["Wings connection lost"] }));
        }
      }
    });

    ws.addEventListener("error", () => {
      this.wingsSocket = null;
    });

    this.wingsSocket = ws;
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    // Relay client messages to Wings
    if (this.wingsSocket?.readyState === WebSocket.OPEN) {
      const data = typeof message === "string" ? message : new TextDecoder().decode(message);
      this.wingsSocket.send(data);
    }
  }

  webSocketClose(ws: WebSocket) {
    this.clientSockets.delete(ws);
    if (this.clientSockets.size === 0 && this.wingsSocket) {
      this.wingsSocket.close();
      this.wingsSocket = null;
    }
  }

  webSocketError(ws: WebSocket) {
    this.clientSockets.delete(ws);
  }
}
