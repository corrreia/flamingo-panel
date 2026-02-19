import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { getDb, schema } from "../db";
import {
  hashPassword, verifyPassword, createSession,
  deleteSession, getSession, refreshSession, revokeAllUserSessions,
} from "../lib/auth";
import { checkRateLimit } from "../lib/rate-limit";

export const authRoutes = new Hono<{ Bindings: Env }>();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

const registerSchema = loginSchema.extend({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/, "Alphanumeric, hyphens, underscores only"),
});

authRoutes.post("/login", zValidator("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");
  const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown";

  // Rate limit by IP
  const rateLimit = await checkRateLimit(c.env.KV, `login:${ip}`);
  if (!rateLimit.allowed) {
    c.header("Retry-After", String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)));
    return c.json({ error: "Too many login attempts. Please try again later." }, 429);
  }

  // Also rate limit by email to prevent credential stuffing
  const emailLimit = await checkRateLimit(c.env.KV, `login:${email}`);
  if (!emailLimit.allowed) {
    return c.json({ error: "Too many login attempts for this account." }, 429);
  }

  const db = getDb(c.env.DB);
  const user = await db.select().from(schema.users).where(eq(schema.users.email, email)).get();

  // Constant-time-ish: always verify even if user doesn't exist
  if (!user) {
    await hashPassword("dummy-password-to-prevent-timing-attack");
    return c.json({ error: "Invalid email or password" }, 401);
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const session = await createSession(
    c.env.KV, user.id, user.email, user.role as "admin" | "user",
    ip, c.req.header("User-Agent") || "",
  );

  return c.json({
    session_token: session.sessionId,
    refresh_token: session.refreshToken,
    expires_at: session.expiresAt,
    user: { id: user.id, email: user.email, username: user.username, role: user.role },
  });
});

authRoutes.post("/register", zValidator("json", registerSchema), async (c) => {
  const { email, username, password } = c.req.valid("json");
  const ip = c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown";
  const db = getDb(c.env.DB);

  const existingEmail = await db.select().from(schema.users).where(eq(schema.users.email, email)).get();
  if (existingEmail) return c.json({ error: "Email already registered" }, 409);

  const existingUsername = await db.select().from(schema.users).where(eq(schema.users.username, username)).get();
  if (existingUsername) return c.json({ error: "Username already taken" }, 409);

  const passwordHash = await hashPassword(password);

  // First user becomes admin
  const userCount = await db.select().from(schema.users).all();
  const role = userCount.length === 0 ? "admin" : "user";

  const user = await db.insert(schema.users).values({
    email, username, passwordHash, role,
  }).returning().get();

  const session = await createSession(
    c.env.KV, user.id, user.email, role as "admin" | "user",
    ip, c.req.header("User-Agent") || "",
  );

  return c.json({
    session_token: session.sessionId,
    refresh_token: session.refreshToken,
    expires_at: session.expiresAt,
    user: { id: user.id, email: user.email, username: user.username, role: user.role },
  }, 201);
});

authRoutes.post("/refresh", zValidator("json", z.object({
  session_token: z.string(),
  refresh_token: z.string(),
})), async (c) => {
  const { session_token, refresh_token } = c.req.valid("json");
  const newSession = await refreshSession(c.env.KV, session_token, refresh_token);
  if (!newSession) return c.json({ error: "Invalid or expired session" }, 401);

  return c.json({
    session_token: newSession.sessionId,
    refresh_token: newSession.refreshToken,
    expires_at: newSession.expiresAt,
  });
});

authRoutes.post("/logout", async (c) => {
  const sessionId = c.req.header("Authorization")?.replace("Bearer ", "");
  if (sessionId) await deleteSession(c.env.KV, sessionId);
  return c.body(null, 204);
});

authRoutes.post("/logout-all", async (c) => {
  const sessionId = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!sessionId) return c.json({ error: "Unauthorized" }, 401);
  const session = await getSession(c.env.KV, sessionId);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  await revokeAllUserSessions(c.env.KV, session.userId);
  return c.body(null, 204);
});

// POST /api/auth/api-keys — create an application API key (admin only)
authRoutes.post("/api-keys", async (c) => {
  const sessionId = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!sessionId) return c.json({ error: "Unauthorized" }, 401);
  const session = await getSession(c.env.KV, sessionId);
  if (!session) return c.json({ error: "Unauthorized" }, 401);
  if (session.role !== "admin") return c.json({ error: "Admin access required" }, 403);

  const body = await c.req.json() as { memo?: string };
  const db = getDb(c.env.DB);

  // Generate a token in papp_ format
  const rawBytes = crypto.getRandomValues(new Uint8Array(32));
  const rawToken = Array.from(rawBytes).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 43);
  const token = `papp_${rawToken}`;

  // Hash for storage
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  const identifier = `flam_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

  await db.insert(schema.apiKeys).values({
    userId: session.userId,
    identifier,
    tokenHash,
    memo: body.memo || "Wings configure token",
  });

  // Return the raw token — this is the ONLY time it's shown
  return c.json({ token, identifier }, 201);
});

authRoutes.post("/change-password", zValidator("json", z.object({
  current_password: z.string(),
  new_password: z.string().min(8).max(128),
})), async (c) => {
  const sessionId = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!sessionId) return c.json({ error: "Unauthorized" }, 401);
  const session = await getSession(c.env.KV, sessionId);
  if (!session) return c.json({ error: "Unauthorized" }, 401);

  const { current_password, new_password } = c.req.valid("json");
  const db = getDb(c.env.DB);
  const user = await db.select().from(schema.users).where(eq(schema.users.id, session.userId)).get();
  if (!user) return c.json({ error: "User not found" }, 404);

  if (!(await verifyPassword(current_password, user.passwordHash))) {
    return c.json({ error: "Current password is incorrect" }, 401);
  }

  const newHash = await hashPassword(new_password);
  await db.update(schema.users).set({ passwordHash: newHash, updatedAt: new Date().toISOString() })
    .where(eq(schema.users.id, user.id));

  // Revoke all other sessions (force re-login everywhere)
  await revokeAllUserSessions(c.env.KV, user.id);

  return c.json({ message: "Password changed. All sessions revoked." });
});
