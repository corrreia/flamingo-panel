import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { getDb, schema } from "../db";
import { type AuthUser, requireAuth } from "./middleware/auth";

export const notificationRoutes = new Hono<{
  Bindings: Env;
  Variables: { user: AuthUser };
}>();

notificationRoutes.use("*", requireAuth);

// GET /api/notifications — list current user's notifications
notificationRoutes.get("/", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  const unreadOnly = c.req.query("unread") === "true";
  const limit = Math.min(
    50,
    Math.max(1, Number.parseInt(c.req.query("limit") || "20", 10))
  );

  const conditions = [eq(schema.notifications.userId, user.id)];
  if (unreadOnly) {
    conditions.push(isNull(schema.notifications.readAt));
  }

  const rows = await db
    .select()
    .from(schema.notifications)
    .where(and(...conditions))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit)
    .all();

  return c.json({ data: rows });
});

// GET /api/notifications/unread-count — quick badge count
notificationRoutes.get("/unread-count", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.userId, user.id),
        isNull(schema.notifications.readAt)
      )
    )
    .all();

  return c.json({ count: result?.count ?? 0 });
});

// PUT /api/notifications/:id/read — mark single notification as read
notificationRoutes.put("/:id/read", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const id = c.req.param("id");

  const updated = await db
    .update(schema.notifications)
    .set({ readAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.notifications.id, id),
        eq(schema.notifications.userId, user.id)
      )
    )
    .returning({ id: schema.notifications.id });

  return c.json({ ok: true, affected: updated.length });
});

// PUT /api/notifications/read-all — mark all as read
notificationRoutes.put("/read-all", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  await db
    .update(schema.notifications)
    .set({ readAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.notifications.userId, user.id),
        isNull(schema.notifications.readAt)
      )
    );

  return c.json({ ok: true });
});

// DELETE /api/notifications/:id — delete a notification
notificationRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const id = c.req.param("id");

  const deleted = await db
    .delete(schema.notifications)
    .where(
      and(
        eq(schema.notifications.id, id),
        eq(schema.notifications.userId, user.id)
      )
    )
    .returning({ id: schema.notifications.id });

  return c.json({ ok: true, affected: deleted.length });
});
