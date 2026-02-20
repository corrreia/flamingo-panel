import { createMiddleware } from "hono/factory";
import { auth } from "../../lib/auth";

export interface AuthUser {
  email: string;
  id: string;
  role: "admin" | "user";
}

interface AuthEnv {
  Bindings: Env;
  Variables: {
    user: AuthUser;
  };
}

// Middleware that requires a valid Better Auth session (cookie-based)
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("user", {
    id: session.user.id,
    email: session.user.email,
    role: (session.user as Record<string, unknown>).role as "admin" | "user",
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
