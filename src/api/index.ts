import { Hono } from "hono";
import { getDb, schema } from "../db";
import { generateApiKey } from "../services/api-keys";
import { activityRoutes } from "./activity";
import { applicationRoutes } from "./application";
import { authRoutes } from "./auth";
import { eggRoutes } from "./eggs";
import { fileRoutes } from "./files";
import { requireAdmin, requireAuth } from "./middleware/auth";
import { nodeRoutes } from "./nodes";
import { remoteRoutes } from "./remote";
import { serverRoutes } from "./servers";

export const apiRoutes = new Hono<{ Bindings: Env }>();

apiRoutes.get("/health", (c) => c.json({ status: "ok", version: "0.1.0" }));

// WebSocket endpoints: registered BEFORE sub-routers to bypass requireAuth
// (browsers cannot send Authorization headers on WebSocket upgrade requests)

// Node metrics WebSocket (ticket-authenticated)
apiRoutes.get("/nodes/:id/metrics", async (c) => {
  const ticket = c.req.query("ticket");
  if (!ticket) {
    return c.json({ error: "Missing ticket" }, 401);
  }

  const ticketKey = `metrics-ticket:${ticket}`;
  const ticketData = await c.env.KV.get(ticketKey);
  if (!ticketData) {
    return c.json({ error: "Invalid or expired ticket" }, 401);
  }

  await c.env.KV.delete(ticketKey);

  const data = JSON.parse(ticketData) as {
    nodeId: number;
    wingsUrl: string;
    wingsToken: string;
  };

  if (data.nodeId !== Number(c.req.param("id"))) {
    return c.json({ error: "Ticket/node mismatch" }, 403);
  }

  const doId = c.env.NODE_METRICS.idFromName(`node-${data.nodeId}`);
  const stub = c.env.NODE_METRICS.get(doId);

  // Forward the original WebSocket upgrade request to the DO.
  // Pass Wings credentials via URL params (internal Worker→DO only).
  const connectUrl = new URL("https://internal/connect");
  connectUrl.searchParams.set("nodeId", String(data.nodeId));
  connectUrl.searchParams.set("wingsUrl", data.wingsUrl);
  connectUrl.searchParams.set("wingsToken", data.wingsToken);

  return stub.fetch(new Request(connectUrl.toString(), c.req.raw));
});

// Console WebSocket (ticket-authenticated)
apiRoutes.get("/servers/:id/console", async (c) => {
  const ticket = c.req.query("ticket");
  if (!ticket) {
    return c.json({ error: "Missing ticket" }, 401);
  }

  const ticketKey = `console-ticket:${ticket}`;
  const ticketData = await c.env.KV.get(ticketKey);
  if (!ticketData) {
    return c.json({ error: "Invalid or expired ticket" }, 401);
  }

  await c.env.KV.delete(ticketKey);

  const data = JSON.parse(ticketData) as {
    serverId: string;
    serverUuid: string;
    userId: string;
    wingsUrl: string;
    wingsToken: string;
  };

  if (data.serverId !== c.req.param("id")) {
    return c.json({ error: "Ticket/server mismatch" }, 403);
  }

  const doId = c.env.CONSOLE_SESSION.idFromName(data.serverUuid);
  const stub = c.env.CONSOLE_SESSION.get(doId);

  // Forward the original WebSocket upgrade request to the DO.
  const connectUrl = new URL("https://internal/connect");
  connectUrl.searchParams.set("wingsUrl", data.wingsUrl);
  connectUrl.searchParams.set("wingsToken", data.wingsToken);
  connectUrl.searchParams.set("userId", data.userId);
  connectUrl.searchParams.set("serverId", data.serverId);

  return stub.fetch(new Request(connectUrl.toString(), c.req.raw));
});

// Sub-routers (these apply their own auth middleware)
apiRoutes.route("/activity", activityRoutes);
apiRoutes.route("/auth", authRoutes);
apiRoutes.route("/nodes", nodeRoutes);
apiRoutes.route("/servers", serverRoutes);
apiRoutes.route("/servers", fileRoutes); // mounts /:serverId/files/*
apiRoutes.route("/eggs", eggRoutes);
apiRoutes.route("/remote", remoteRoutes);
apiRoutes.route("/application", applicationRoutes);

// Admin: list users (for server creation wizard)
apiRoutes.get("/users", requireAuth, requireAdmin, async (c) => {
  const db = getDb(c.env.DB);
  const users = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      username: schema.users.username,
      role: schema.users.role,
    })
    .from(schema.users)
    .all();
  return c.json(users);
});

// POST /api/api-keys — create an application API key (admin only)
apiRoutes.post("/api-keys", requireAuth, requireAdmin, async (c) => {
  const user = c.get("user" as never) as { id: string };
  const body = (await c.req.json()) as { memo?: string };
  const db = getDb(c.env.DB);

  const { token, identifier } = await generateApiKey(
    db,
    user.id,
    body.memo || "Wings configure token"
  );

  // Return the raw token — this is the ONLY time it's shown
  return c.json({ token, identifier }, 201);
});
