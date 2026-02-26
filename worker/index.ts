/**
 * Cloudflare Worker entry point.
 *
 * Routes /api/* requests to the Hono API layer,
 * and everything else to Vinext for SSR/RSC rendering.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import handler from "vinext/server/app-router-entry";
import { apiRoutes } from "../src/api";

// Hono API app — handles /api/* routes
const api = new Hono<{ Bindings: Env }>();
api.use("/api/*", cors());
api.route("/api", apiRoutes);

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// Route /api/* to Hono
		if (url.pathname.startsWith("/api/")) {
			return api.fetch(request, env);
		}

		// Everything else → Vinext (App Router SSR/RSC)
		return handler.fetch(request);
	},
};

// Export Durable Object classes for Cloudflare
export { ConsoleSession } from "../src/durable-objects/console-session";
export { NodeMetrics } from "../src/durable-objects/node-metrics";
