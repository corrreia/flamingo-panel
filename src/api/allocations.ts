import { zValidator } from "@hono/zod-validator";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { type Database, getDb, schema } from "../db";
import { logActivity } from "../lib/activity";
import { type AuthUser, requireAdmin, requireAuth } from "./middleware/auth";

export const allocationRoutes = new Hono<{
  Bindings: Env;
  Variables: { user: AuthUser };
}>();

allocationRoutes.use("*", requireAuth);

async function getUserAllocationsData(db: Database, userId: string) {
  const limits = await db
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

  const portRanges = await db
    .select()
    .from(schema.portAllocations)
    .where(eq(schema.portAllocations.userId, userId))
    .all();

  return {
    limits: limits || null,
    usage: {
      servers: usage?.serverCount ?? 0,
      cpu: usage?.cpuUsed ?? 0,
      memory: usage?.memoryUsed ?? 0,
      disk: usage?.diskUsed ?? 0,
    },
    portRanges,
  };
}

// Get allocations for the current user (any authenticated user)
allocationRoutes.get("/me", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  return c.json(await getUserAllocationsData(db, user.id));
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

  return c.json(await getUserAllocationsData(db, userId));
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

    const allocation = await db
      .insert(schema.userAllocations)
      .values({ userId, ...values })
      .onConflictDoUpdate({
        target: schema.userAllocations.userId,
        set: values,
      })
      .returning()
      .get();

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

// ─── Port Allocation Routes ──────────────────────────────────────────────────

const portRangeSchema = z
  .object({
    nodeId: z.number().int().min(1),
    startPort: z.number().int().min(1).max(65_535),
    endPort: z.number().int().min(1).max(65_535),
  })
  .refine((data) => data.startPort <= data.endPort, {
    message: "Start port must be less than or equal to end port",
    path: ["startPort"],
  });

// Add a port range for a user (admin only)
allocationRoutes.post(
  "/:userId/ports",
  requireAdmin,
  zValidator("json", portRangeSchema),
  async (c) => {
    const db = getDb(c.env.DB);
    const userId = c.req.param("userId");
    const data = c.req.valid("json");

    // Validate user exists
    const userRow = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .get();
    if (!userRow) {
      return c.json({ error: "User not found" }, 404);
    }

    // Validate node exists
    const nodeRow = await db
      .select({ id: schema.nodes.id })
      .from(schema.nodes)
      .where(eq(schema.nodes.id, data.nodeId))
      .get();
    if (!nodeRow) {
      return c.json({ error: "Node not found" }, 404);
    }

    // Atomically check for overlapping ranges and insert
    const txResult = await db.transaction(async (tx) => {
      const allRanges = await tx
        .select({
          id: schema.portAllocations.id,
          userId: schema.portAllocations.userId,
          startPort: schema.portAllocations.startPort,
          endPort: schema.portAllocations.endPort,
        })
        .from(schema.portAllocations)
        .where(eq(schema.portAllocations.nodeId, data.nodeId))
        .all();

      const overlaps = allRanges.filter(
        (r) => data.startPort <= r.endPort && r.startPort <= data.endPort
      );

      if (overlaps.length > 0) {
        return { conflict: overlaps };
      }

      const portRange = await tx
        .insert(schema.portAllocations)
        .values({
          userId,
          nodeId: data.nodeId,
          startPort: data.startPort,
          endPort: data.endPort,
        })
        .returning()
        .get();

      return { portRange };
    });

    if ("conflict" in txResult) {
      return c.json(
        {
          error: "Port range overlaps with existing allocation",
          conflicts: txResult.conflict.map((o) => ({
            userId: o.userId,
            range: `${o.startPort}-${o.endPort}`,
          })),
        },
        409
      );
    }

    const { portRange } = txResult;

    logActivity(c, {
      event: "user:ports:create",
      metadata: {
        targetUserId: userId,
        nodeId: data.nodeId,
        range: `${data.startPort}-${data.endPort}`,
      },
    });

    return c.json(portRange, 201);
  }
);

// List port ranges for a user (admin only)
allocationRoutes.get("/:userId/ports", requireAdmin, async (c) => {
  const db = getDb(c.env.DB);
  const userId = c.req.param("userId");

  const ranges = await db
    .select()
    .from(schema.portAllocations)
    .where(eq(schema.portAllocations.userId, userId))
    .all();

  return c.json(ranges);
});

// Delete a specific port range (admin only)
allocationRoutes.delete("/:userId/ports/:portId", requireAdmin, async (c) => {
  const db = getDb(c.env.DB);
  const userId = c.req.param("userId");
  const portId = c.req.param("portId");

  const existing = await db
    .select()
    .from(schema.portAllocations)
    .where(
      and(
        eq(schema.portAllocations.id, portId),
        eq(schema.portAllocations.userId, userId)
      )
    )
    .get();

  if (!existing) {
    return c.json({ error: "Port allocation not found" }, 404);
  }

  await db
    .delete(schema.portAllocations)
    .where(eq(schema.portAllocations.id, portId));

  logActivity(c, {
    event: "user:ports:delete",
    metadata: {
      targetUserId: userId,
      nodeId: existing.nodeId,
      range: `${existing.startPort}-${existing.endPort}`,
    },
  });

  return c.body(null, 204);
});
