import { Hono } from "hono";
import type { Env } from "../env";
import { authRoutes } from "./auth";
import { nodeRoutes } from "./nodes";
import { serverRoutes } from "./servers";
import { fileRoutes } from "./files";
import { eggRoutes } from "./eggs";
import { remoteRoutes } from "./remote";

export const apiRoutes = new Hono<{ Bindings: Env }>();

apiRoutes.get("/health", (c) => c.json({ status: "ok", version: "0.1.0" }));

apiRoutes.route("/auth", authRoutes);
apiRoutes.route("/nodes", nodeRoutes);
apiRoutes.route("/servers", serverRoutes);
apiRoutes.route("/servers", fileRoutes);  // mounts /:serverId/files/*
apiRoutes.route("/eggs", eggRoutes);
apiRoutes.route("/remote", remoteRoutes);
