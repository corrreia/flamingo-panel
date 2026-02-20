import { env } from "cloudflare:workers";
import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiRoutes } from "../api";

// Hono API app — handles /api/* routes
const api = new Hono<{ Bindings: Env }>();
api.use("/api/*", cors());
api.route("/api", apiRoutes);

// TanStack Start handler — handles SSR pages
const startHandler = createStartHandler(defaultStreamHandler);

export default {
  fetch(request: Request): Response | Promise<Response> {
    const url = new URL(request.url);

    // Route /api/* to Hono
    if (url.pathname.startsWith("/api/")) {
      return api.fetch(request, env as Env);
    }

    // Everything else → TanStack Start SSR
    return startHandler(request);
  },
};

export { ConsoleSession } from "../durable-objects/console-session";
