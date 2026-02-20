import { DurableObject } from "cloudflare:workers";
import type { SystemUtilization } from "../lib/wings-client";

const POLL_INTERVAL_MS = 5000;
const TRAILING_SLASH_RE = /\/+$/;

export class NodeMetrics extends DurableObject {
  private wingsUrl: string | null = null;
  private wingsToken: string | null = null;
  private utilization: SystemUtilization | null = null;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/connect") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }

      const wingsUrl = url.searchParams.get("wingsUrl");
      const wingsToken = url.searchParams.get("wingsToken");
      if (wingsUrl) {
        this.wingsUrl = wingsUrl.replace(TRAILING_SLASH_RE, "");
      }
      if (wingsToken) {
        this.wingsToken = wingsToken;
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      this.ctx.acceptWebSocket(server);

      // Send cached data immediately
      if (this.utilization) {
        server.send(
          JSON.stringify({
            event: "utilization",
            data: {
              cpu_percent: this.utilization.cpu_percent,
              memory_used: this.utilization.memory_used,
              memory_total: this.utilization.memory_total,
              disk_used: this.utilization.disk_used,
              disk_total: this.utilization.disk_total,
            },
          })
        );
      }

      // Start alarm chain if not already running
      const currentAlarm = await this.ctx.storage.getAlarm();
      if (currentAlarm === null) {
        await this.ctx.storage.setAlarm(Date.now() + POLL_INTERVAL_MS);
      }

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  }

  async alarm() {
    const clients = this.ctx.getWebSockets();
    if (clients.length === 0) {
      return; // No clients, stop alarm chain
    }

    await this.fetchUtilization();

    // Schedule next alarm
    await this.ctx.storage.setAlarm(Date.now() + POLL_INTERVAL_MS);
  }

  webSocketClose() {
    this.stopIfEmpty();
  }

  webSocketError() {
    this.stopIfEmpty();
  }

  private async stopIfEmpty() {
    const remaining = this.ctx.getWebSockets();
    if (remaining.length === 0) {
      await this.ctx.storage.deleteAlarm();
    }
  }

  private async fetchUtilization() {
    if (!(this.wingsUrl && this.wingsToken)) {
      return;
    }

    try {
      const res = await fetch(`${this.wingsUrl}/api/system/utilization`, {
        headers: {
          Authorization: `Bearer ${this.wingsToken}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        throw new Error(`Wings ${res.status}`);
      }
      const raw = (await res.json()) as SystemUtilization;
      this.utilization = raw;
      this.broadcast({
        event: "utilization",
        data: {
          cpu_percent: raw.cpu_percent,
          memory_used: raw.memory_used,
          memory_total: raw.memory_total,
          disk_used: raw.disk_used,
          disk_total: raw.disk_total,
        },
      });
    } catch (err) {
      this.broadcast({
        event: "error",
        data: `Failed to fetch utilization: ${err instanceof Error ? err.message : "unknown"}`,
      });
    }
  }

  private broadcast(message: { event: string; data: unknown }) {
    const payload = JSON.stringify(message);
    for (const client of this.ctx.getWebSockets()) {
      try {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      } catch {
        // Client may have disconnected
      }
    }
  }
}
