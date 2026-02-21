import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, schema } from "../db";
import { logActivity } from "../lib/activity";
import { getServerAccess } from "../lib/server-access";
import { type AuthUser, requireAuth } from "./middleware/auth";

export const subuserRoutes = new Hono<{
  Bindings: Env;
  Variables: { user: AuthUser };
}>();

subuserRoutes.use("*", requireAuth);

// List subusers (owner/admin only)
subuserRoutes.get("/:serverId/subusers", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const serverId = c.req.param("serverId");

  const access = await getServerAccess(db, serverId, user);
  if (!access) {
    return c.json({ error: "Server not found" }, 404);
  }
  if (access.role !== "admin" && access.role !== "owner") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const subusers = await db
    .select({
      id: schema.subusers.id,
      userId: schema.subusers.userId,
      email: schema.users.email,
      username: schema.users.username,
      createdAt: schema.subusers.createdAt,
    })
    .from(schema.subusers)
    .innerJoin(schema.users, eq(schema.subusers.userId, schema.users.id))
    .where(eq(schema.subusers.serverId, serverId))
    .all();

  return c.json(subusers);
});

// Add subuser (owner/admin only)
subuserRoutes.post(
  "/:serverId/subusers",
  zValidator(
    "json",
    z
      .object({
        email: z.string().email().optional(),
        username: z.string().optional(),
      })
      .refine((d) => d.email || d.username, {
        message: "Either email or username is required",
      })
  ),
  async (c) => {
    const user = c.get("user");
    const db = getDb(c.env.DB);
    const serverId = c.req.param("serverId");

    const access = await getServerAccess(db, serverId, user);
    if (!access) {
      return c.json({ error: "Server not found" }, 404);
    }
    if (access.role !== "admin" && access.role !== "owner") {
      return c.json({ error: "Forbidden" }, 403);
    }

    const data = c.req.valid("json");

    // Look up user by email first, then username
    let targetUser = data.email
      ? await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.email, data.email))
          .get()
      : null;

    if (!targetUser && data.username) {
      targetUser = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.username, data.username))
        .get();
    }

    if (!targetUser) {
      return c.json({ error: "User not found" }, 404);
    }

    // Cannot add the server owner as a subuser
    if (targetUser.id === access.server.ownerId) {
      return c.json({ error: "Cannot add the server owner as a subuser" }, 400);
    }

    // Check if already a subuser
    const existing = await db
      .select()
      .from(schema.subusers)
      .where(
        and(
          eq(schema.subusers.serverId, serverId),
          eq(schema.subusers.userId, targetUser.id)
        )
      )
      .get();

    if (existing) {
      return c.json({ error: "User is already a subuser" }, 409);
    }

    const created = await db
      .insert(schema.subusers)
      .values({
        userId: targetUser.id,
        serverId,
        permissions: '["*"]',
      })
      .returning()
      .get();

    logActivity(c, {
      event: "subuser:add",
      serverId,
      metadata: { email: targetUser.email },
    });

    return c.json(
      {
        id: created.id,
        userId: created.userId,
        email: targetUser.email,
        username: targetUser.username,
        createdAt: created.createdAt,
      },
      201
    );
  }
);

// Remove subuser (owner/admin only)
subuserRoutes.delete("/:serverId/subusers/:subuserId", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const serverId = c.req.param("serverId");
  const subuserId = c.req.param("subuserId");

  const access = await getServerAccess(db, serverId, user);
  if (!access) {
    return c.json({ error: "Server not found" }, 404);
  }
  if (access.role !== "admin" && access.role !== "owner") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const subuser = await db
    .select()
    .from(schema.subusers)
    .where(eq(schema.subusers.id, subuserId))
    .get();

  if (!subuser) {
    return c.json({ error: "Subuser not found" }, 404);
  }

  await db.delete(schema.subusers).where(eq(schema.subusers.id, subuserId));

  logActivity(c, {
    event: "subuser:remove",
    serverId,
    metadata: { userId: subuser.userId },
  });

  return c.body(null, 204);
});
