import { Hono } from "hono";
import { getDb, schema } from "../db";
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
