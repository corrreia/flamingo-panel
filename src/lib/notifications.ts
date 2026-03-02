import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { getDb, schema } from "../db";
import type { Database } from "../db";

export type NotificationCategory = "resource" | "node" | "server" | "system";
export type NotificationLevel = "info" | "warning" | "critical";

interface CreateNotificationOpts {
  userId: string;
  category: NotificationCategory;
  level: NotificationLevel;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create a notification for a specific user.
 */
export async function createNotification(
  db: Database,
  opts: CreateNotificationOpts
) {
  const [row] = await db
    .insert(schema.notifications)
    .values({
      userId: opts.userId,
      category: opts.category,
      level: opts.level,
      title: opts.title,
      message: opts.message,
      metadata: JSON.stringify(opts.metadata ?? {}),
    })
    .returning();

  return row;
}

/**
 * Create a notification using a Hono context (non-blocking via waitUntil).
 */
export function queueNotification(
  // biome-ignore lint/suspicious/noExplicitAny: accepts any Hono context with Env bindings
  c: Context<any>,
  opts: CreateNotificationOpts
) {
  const db = getDb(c.env.DB);
  const promise = createNotification(db, opts)
    .then(() => undefined)
    .catch(() => undefined);

  try {
    c.executionCtx.waitUntil(promise);
  } catch {
    // executionCtx may not be available in tests
  }
}

/**
 * Create a notification for all admin users (e.g., node alerts).
 */
export async function notifyAdmins(
  db: Database,
  opts: Omit<CreateNotificationOpts, "userId">
) {
  const admins = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.role, "admin"))
    .all();

  await Promise.all(
    admins.map((admin) =>
      createNotification(db, { ...opts, userId: admin.id })
    )
  );
}
