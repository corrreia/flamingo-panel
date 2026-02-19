import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { authRoutes } from "./auth";
import { nodeRoutes } from "./nodes";
import { serverRoutes } from "./servers";
import { fileRoutes } from "./files";
import { eggRoutes } from "./eggs";
import { remoteRoutes } from "./remote";
import { requireAuth, requireAdmin } from "./middleware/auth";
import { getDb, schema } from "../db";

export const apiRoutes = new Hono<{ Bindings: Env }>();

apiRoutes.get("/health", (c) => c.json({ status: "ok", version: "0.1.0" }));

apiRoutes.route("/auth", authRoutes);
apiRoutes.route("/nodes", nodeRoutes);
apiRoutes.route("/servers", serverRoutes);
apiRoutes.route("/servers", fileRoutes);  // mounts /:serverId/files/*
apiRoutes.route("/eggs", eggRoutes);
apiRoutes.route("/remote", remoteRoutes);

// Admin: list users (for server creation wizard)
apiRoutes.get("/users", requireAuth, requireAdmin, async (c) => {
  const db = getDb(c.env.DB);
  const users = await db.select({
    id: schema.users.id,
    email: schema.users.email,
    username: schema.users.username,
    role: schema.users.role,
  }).from(schema.users).all();
  return c.json(users);
});
