import { Hono } from "hono";
import { createAuth } from "../lib/auth";

export const authRoutes = new Hono<{ Bindings: Env }>();

// Forward all /auth/* requests to Better Auth handler
authRoutes.all("/*", (c) => {
  return createAuth(c.env, c.req.url).handler(c.req.raw);
});
