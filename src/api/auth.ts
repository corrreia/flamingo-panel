import { Hono } from "hono";
import { auth } from "../lib/auth";

export const authRoutes = new Hono<{ Bindings: Env }>();

// Forward all /auth/* requests to Better Auth handler
authRoutes.all("/*", (c) => {
  return auth.handler(c.req.raw);
});
