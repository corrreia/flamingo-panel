import { Hono } from "hono";
import { createAuth } from "../lib/auth";

export const authRoutes = new Hono<{ Bindings: Env }>();

// Forward all /auth/* requests to Better Auth handler
authRoutes.all("/*", async (c) => {
  // Rate limit sign-in attempts by IP
  if (c.req.path.includes("sign-in")) {
    const ip = c.req.header("cf-connecting-ip") || "unknown";
    const { success } = await c.env.AUTH_RATE_LIMIT.limit({ key: ip });
    if (!success) {
      return c.json({ error: "Too many requests" }, 429);
    }
  }
  return createAuth(c.env, c.req.url).handler(c.req.raw);
});
