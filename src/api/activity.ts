import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { getDb, schema } from "../db";
import { type AuthUser, requireAdmin, requireAuth } from "./middleware/auth";

export const activityRoutes = new Hono<{
  Bindings: Env;
  Variables: { user: AuthUser };
}>();

activityRoutes.use("*", requireAuth);

// GET /api/activity — admin-only global view
activityRoutes.get("/", requireAdmin, async (c) => {
  const db = getDb(c.env.DB);

  const page = Math.max(0, Number.parseInt(c.req.query("page") || "0", 10));
  const perPage = Math.min(100, Math.max(1, Number.parseInt(c.req.query("per_page") || "50", 10)));
  const offset = page * perPage;

  // Optional filters
  const filterServer = c.req.query("server_id");
  const filterNode = c.req.query("node_id");
  const filterUser = c.req.query("user_id");
  const filterEvent = c.req.query("event");
  const filterFrom = c.req.query("from");
  const filterTo = c.req.query("to");

  const conditions = [];
  if (filterServer) conditions.push(eq(schema.activityLogs.serverId, filterServer));
  if (filterNode) conditions.push(eq(schema.activityLogs.nodeId, Number(filterNode)));
  if (filterUser) conditions.push(eq(schema.activityLogs.userId, filterUser));
  if (filterEvent) conditions.push(eq(schema.activityLogs.event, filterEvent));
  if (filterFrom) conditions.push(gte(schema.activityLogs.createdAt, filterFrom));
  if (filterTo) conditions.push(lte(schema.activityLogs.createdAt, filterTo));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: schema.activityLogs.id,
      event: schema.activityLogs.event,
      metadata: schema.activityLogs.metadata,
      ip: schema.activityLogs.ip,
      createdAt: schema.activityLogs.createdAt,
      userId: schema.activityLogs.userId,
      userName: schema.users.username,
      serverId: schema.activityLogs.serverId,
      serverName: schema.servers.name,
      nodeId: schema.activityLogs.nodeId,
      nodeName: schema.nodes.name,
    })
    .from(schema.activityLogs)
    .leftJoin(schema.users, eq(schema.activityLogs.userId, schema.users.id))
    .leftJoin(schema.servers, eq(schema.activityLogs.serverId, schema.servers.id))
    .leftJoin(schema.nodes, eq(schema.activityLogs.nodeId, schema.nodes.id))
    .where(where)
    .orderBy(desc(schema.activityLogs.createdAt))
    .limit(perPage)
    .offset(offset)
    .all();

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.activityLogs)
    .where(where)
    .all();

  return c.json({
    data: rows,
    meta: {
      page,
      perPage,
      total: countResult?.count ?? 0,
    },
  });
});

// GET /api/activity/server/:serverId — per-server view
activityRoutes.get("/server/:serverId", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const serverId = c.req.param("serverId");

  // Check access
  const server = await db
    .select()
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .get();
  if (!server) return c.json({ error: "Server not found" }, 404);
  if (user.role !== "admin" && server.ownerId !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const page = Math.max(0, Number.parseInt(c.req.query("page") || "0", 10));
  const perPage = Math.min(100, Math.max(1, Number.parseInt(c.req.query("per_page") || "50", 10)));
  const offset = page * perPage;

  const filterEvent = c.req.query("event");
  const conditions = [eq(schema.activityLogs.serverId, serverId)];
  if (filterEvent) conditions.push(eq(schema.activityLogs.event, filterEvent));

  const where = and(...conditions);

  const rows = await db
    .select({
      id: schema.activityLogs.id,
      event: schema.activityLogs.event,
      metadata: schema.activityLogs.metadata,
      ip: schema.activityLogs.ip,
      createdAt: schema.activityLogs.createdAt,
      userId: schema.activityLogs.userId,
      userName: schema.users.username,
    })
    .from(schema.activityLogs)
    .leftJoin(schema.users, eq(schema.activityLogs.userId, schema.users.id))
    .where(where)
    .orderBy(desc(schema.activityLogs.createdAt))
    .limit(perPage)
    .offset(offset)
    .all();

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.activityLogs)
    .where(where)
    .all();

  return c.json({
    data: rows,
    meta: {
      page,
      perPage,
      total: countResult?.count ?? 0,
    },
  });
});
