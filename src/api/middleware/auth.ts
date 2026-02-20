import { createMiddleware } from "hono/factory";
import { getSession, type Session } from "../../lib/auth";

export interface AuthUser {
  email: string;
  id: string;
  role: "admin" | "user";
}

interface AuthEnv {
  Bindings: Env;
  Variables: {
    session: Session;
    sessionId: string;
    user: AuthUser;
  };
}

// Middleware that requires a valid session
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Missing authorization header" }, 401);
  }

  const sessionId = header.slice(7);
  const session = await getSession(c.env.KV, sessionId);
  if (!session) {
    return c.json({ error: "Invalid or expired session" }, 401);
  }

  c.set("session", session);
  c.set("sessionId", sessionId);
  c.set("user", {
    id: session.userId,
    email: session.email,
    role: session.role,
  });
  await next();
});

// Middleware that requires admin role
export const requireAdmin = createMiddleware<AuthEnv>(async (c, next) => {
  const user = c.get("user");
  if (!user || user.role !== "admin") {
    return c.json({ error: "Admin access required" }, 403);
  }
  await next();
});
