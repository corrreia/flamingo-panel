import { zValidator } from "@hono/zod-validator";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, schema } from "../db";
import { logActivity } from "../lib/activity";
import { type AuthUser, requireAdmin, requireAuth } from "./middleware/auth";

export const allocationRoutes = new Hono<{
  Bindings: Env;
  Variables: { user: AuthUser };
}>();

allocationRoutes.use("*", requireAuth);

// Get allocations for the current user (any authenticated user)
allocationRoutes.get("/me", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  const allocation = await db
    .select()
    .from(schema.userAllocations)
    .where(eq(schema.userAllocations.userId, user.id))
    .get();

  // Calculate current usage
  const usage = await db
    .select({
      serverCount: sql<number>`count(*)`,
      cpuUsed: sql<number>`coalesce(sum(${schema.servers.cpu}), 0)`,
      memoryUsed: sql<number>`coalesce(sum(${schema.servers.memory}), 0)`,
      diskUsed: sql<number>`coalesce(sum(${schema.servers.disk}), 0)`,
    })
    .from(schema.servers)
    .where(eq(schema.servers.ownerId, user.id))
    .get();

  return c.json({
    limits: allocation || null,
    usage: {
      servers: usage?.serverCount ?? 0,
      cpu: usage?.cpuUsed ?? 0,
      memory: usage?.memoryUsed ?? 0,
      disk: usage?.diskUsed ?? 0,
    },
  });
});

// Get allocations for a specific user (admin only)
allocationRoutes.get("/:userId", requireAdmin, async (c) => {
  const db = getDb(c.env.DB);
  const userId = c.req.param("userId");

  const userRow = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .get();
  if (!userRow) {
    return c.json({ error: "User not found" }, 404);
  }

  const allocation = await db
    .select()
    .from(schema.userAllocations)
    .where(eq(schema.userAllocations.userId, userId))
    .get();

  const usage = await db
    .select({
      serverCount: sql<number>`count(*)`,
      cpuUsed: sql<number>`coalesce(sum(${schema.servers.cpu}), 0)`,
      memoryUsed: sql<number>`coalesce(sum(${schema.servers.memory}), 0)`,
      diskUsed: sql<number>`coalesce(sum(${schema.servers.disk}), 0)`,
    })
    .from(schema.servers)
    .where(eq(schema.servers.ownerId, userId))
    .get();

  return c.json({
    limits: allocation || null,
    usage: {
      servers: usage?.serverCount ?? 0,
      cpu: usage?.cpuUsed ?? 0,
      memory: usage?.memoryUsed ?? 0,
      disk: usage?.diskUsed ?? 0,
    },
  });
});

const allocationSchema = z.object({
  cpu: z.number().int().min(0).default(0),
  memory: z.number().int().min(0).default(0),
  disk: z.number().int().min(0).default(0),
  servers: z.number().int().min(0).default(0),
  databases: z.number().int().min(0).default(0),
  backups: z.number().int().min(0).default(0),
  allocations: z.number().int().min(0).default(0),
  allowOverprovision: z.boolean().default(false),
});

// Set/update allocations for a user (admin only)
allocationRoutes.put(
  "/:userId",
  requireAdmin,
  zValidator("json", allocationSchema),
  async (c) => {
    const db = getDb(c.env.DB);
    const userId = c.req.param("userId");
    const data = c.req.valid("json");

    const userRow = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .get();
    if (!userRow) {
      return c.json({ error: "User not found" }, 404);
    }

    const existing = await db
      .select({ id: schema.userAllocations.id })
      .from(schema.userAllocations)
      .where(eq(schema.userAllocations.userId, userId))
      .get();

    const values = {
      cpu: data.cpu,
      memory: data.memory,
      disk: data.disk,
      servers: data.servers,
      databases: data.databases,
      backups: data.backups,
      allocations: data.allocations,
      allowOverprovision: data.allowOverprovision ? 1 : 0,
      updatedAt: new Date().toISOString(),
    };

    let allocation;
    if (existing) {
      allocation = await db
        .update(schema.userAllocations)
        .set(values)
        .where(eq(schema.userAllocations.userId, userId))
        .returning()
        .get();
    } else {
      allocation = await db
        .insert(schema.userAllocations)
        .values({ userId, ...values })
        .returning()
        .get();
    }

    logActivity(c, {
      event: "user:allocations:update",
      metadata: { targetUserId: userId, ...data },
    });

    return c.json(allocation);
  }
);

// Delete allocations for a user (admin only) — removes limits entirely
allocationRoutes.delete("/:userId", requireAdmin, async (c) => {
  const db = getDb(c.env.DB);
  const userId = c.req.param("userId");

  await db
    .delete(schema.userAllocations)
    .where(eq(schema.userAllocations.userId, userId));

  logActivity(c, {
    event: "user:allocations:delete",
    metadata: { targetUserId: userId },
  });

  return c.body(null, 204);
});
