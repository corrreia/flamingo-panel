import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { getDb, schema } from "../db";
import { requireAuth, type AuthUser } from "./middleware/auth";
import { WingsClient } from "../lib/wings-client";
import { signWingsWebsocketToken, WS_PERMISSIONS } from "../lib/wings-jwt";

export const serverRoutes = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

serverRoutes.use("*", requireAuth);

// List servers (admin sees all, user sees own)
serverRoutes.get("/", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  let serverList;
  if (user.role === "admin") {
    serverList = await db.select().from(schema.servers).all();
  } else {
    serverList = await db.select().from(schema.servers)
      .where(eq(schema.servers.ownerId, user.id)).all();
  }

  return c.json(serverList);
});

// Get single server with live stats from Wings
serverRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const server = await db.select().from(schema.servers)
    .where(eq(schema.servers.id, c.req.param("id"))).get();

  if (!server) return c.json({ error: "Server not found" }, 404);
  if (user.role !== "admin" && server.ownerId !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const node = await db.select().from(schema.nodes)
    .where(eq(schema.nodes.id, server.nodeId)).get();

  let resources = null;
  if (node) {
    try {
      const client = new WingsClient(node);
      resources = await client.getServer(server.uuid);
    } catch {
      // Node offline
    }
  }

  return c.json({ ...server, resources });
});

// Power actions
serverRoutes.post("/:id/power", zValidator("json", z.object({
  action: z.enum(["start", "stop", "restart", "kill"]),
})), async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const { action } = c.req.valid("json");

  const server = await db.select().from(schema.servers)
    .where(eq(schema.servers.id, c.req.param("id"))).get();
  if (!server) return c.json({ error: "Server not found" }, 404);
  if (user.role !== "admin" && server.ownerId !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const node = await db.select().from(schema.nodes)
    .where(eq(schema.nodes.id, server.nodeId)).get();
  if (!node) return c.json({ error: "Node not found" }, 404);

  const client = new WingsClient(node);
  await client.powerAction(server.uuid, action);
  return c.body(null, 204);
});

// Send command
serverRoutes.post("/:id/command", zValidator("json", z.object({
  command: z.string().min(1),
})), async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const { command } = c.req.valid("json");

  const server = await db.select().from(schema.servers)
    .where(eq(schema.servers.id, c.req.param("id"))).get();
  if (!server) return c.json({ error: "Server not found" }, 404);
  if (user.role !== "admin" && server.ownerId !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const node = await db.select().from(schema.nodes)
    .where(eq(schema.nodes.id, server.nodeId)).get();
  if (!node) return c.json({ error: "Node not found" }, 404);

  const client = new WingsClient(node);
  await client.sendCommand(server.uuid, [command]);
  return c.body(null, 204);
});

// Get WebSocket token for console
serverRoutes.get("/:id/websocket", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  const server = await db.select().from(schema.servers)
    .where(eq(schema.servers.id, c.req.param("id"))).get();
  if (!server) return c.json({ error: "Server not found" }, 404);
  if (user.role !== "admin" && server.ownerId !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const node = await db.select().from(schema.nodes)
    .where(eq(schema.nodes.id, server.nodeId)).get();
  if (!node) return c.json({ error: "Node not found" }, 404);

  const permissions = [
    WS_PERMISSIONS.CONNECT,
    WS_PERMISSIONS.SEND_COMMAND,
    WS_PERMISSIONS.POWER_START,
    WS_PERMISSIONS.POWER_STOP,
    WS_PERMISSIONS.POWER_RESTART,
    WS_PERMISSIONS.BACKUP_READ,
  ];

  if (user.role === "admin") {
    permissions.push(
      WS_PERMISSIONS.ADMIN_ERRORS,
      WS_PERMISSIONS.ADMIN_INSTALL,
      WS_PERMISSIONS.ADMIN_TRANSFER,
    );
  }

  const token = await signWingsWebsocketToken(
    { user_uuid: user.id, server_uuid: server.uuid, permissions },
    node.token,
  );

  // WebSocket URL goes through the tunnel
  return c.json({
    token,
    socket: `wss://${node.fqdn}/api/servers/${server.uuid}/ws`,
  });
});
