import { env } from "cloudflare:workers";
import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiRoutes } from "../api";

const REQUIRED_ENV = [
  "BETTER_AUTH_SECRET",
  "OIDC_CLIENT_ID",
  "OIDC_CLIENT_SECRET",
  "OIDC_DISCOVERY_URL",
  "PANEL_URL",
] as const;

let missingEnv: string[] | null = null;
let envChecked = false;

function checkEnv(): string[] | null {
  if (envChecked) {
    return missingEnv;
  }
  envChecked = true;
  const missing = REQUIRED_ENV.filter(
    (key) => !(env as unknown as Record<string, unknown>)[key]
  );
  missingEnv = missing.length > 0 ? missing : null;
  return missingEnv;
}

// Hono API app — handles /api/* routes
const api = new Hono<{ Bindings: Env }>();
api.use(
  "/api/*",
  cors({
    credentials: true,
    origin: (origin) => {
      const allowedOrigins = new Set<string>([env.PANEL_URL]);

      if (origin?.startsWith("http://localhost:")) {
        allowedOrigins.add(origin);
      }

      if (!origin) {
        return env.PANEL_URL;
      }

      return allowedOrigins.has(origin) ? origin : null;
    },
  })
);
api.route("/api", apiRoutes);

// TanStack Start handler — handles SSR pages
const startHandler = createStartHandler(defaultStreamHandler);

export default {
  fetch(request: Request): Response | Promise<Response> {
    const missing = checkEnv();
    if (missing) {
      console.error(
        `Missing required environment variables: ${missing.join(", ")}`
      );
      return new Response("Server misconfigured", { status: 500 });
    }

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
export { NodeMetrics } from "../durable-objects/node-metrics";
