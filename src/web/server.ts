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
  "CF_ACCOUNT_ID",
  "OIDC_CLIENT_ID",
  "OIDC_CLIENT_SECRET",
  "OIDC_DISCOVERY_URL",
  "PANEL_URL",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
] as const;

let missingEnv: string[] | null = null;
let envChecked = false;

function checkEnv(): string[] | null {
  if (envChecked) {
    return missingEnv;
  }
  envChecked = true;
  const missing = REQUIRED_ENV.filter(
    (key) => !(env as Record<string, unknown>)[key]
  );
  missingEnv = missing.length > 0 ? missing : null;
  return missingEnv;
}

// Hono API app — handles /api/* routes
const api = new Hono<{ Bindings: Env }>();
api.use("/api/*", cors());
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
      return new Response(
        `Server misconfigured — missing env: ${missing.join(", ")}`,
        { status: 500 }
      );
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
