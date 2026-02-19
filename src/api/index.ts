import { Hono } from "hono";
import type { Env } from "../env";
import { authRoutes } from "./auth";

export const apiRoutes = new Hono<{ Bindings: Env }>();

apiRoutes.get("/health", (c) => c.json({ status: "ok", version: "0.1.0" }));
apiRoutes.route("/auth", authRoutes);
