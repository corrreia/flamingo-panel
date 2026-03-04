import { zValidator } from "@hono/zod-validator";
import { and, eq, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, schema } from "../db";
import { logActivity } from "../lib/activity";
import { backupKey, getPresignedDownloadUrl, getS3Client } from "../lib/r2";
import { getServerAccess } from "../lib/server-access";
import { WingsClient } from "../lib/wings-client";
import { type AuthUser, requireAuth } from "./middleware/auth";

export const backupRoutes = new Hono<{
  Bindings: Env;
  Variables: { user: AuthUser };
}>();

backupRoutes.use("*", requireAuth);

// GET /api/servers/:serverId/backups — list backups for a server
backupRoutes.get("/:serverId/backups", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  const access = await getServerAccess(db, c.req.param("serverId"), user);
  if (!access) {
    return c.json({ error: "Server not found" }, 404);
  }

  const list = await db
    .select()
    .from(schema.backups)
    .where(eq(schema.backups.serverId, access.server.id))
    .all();

  return c.json({
    backups: list,
    backupLimit: access.server.backupLimit,
  });
});

// POST /api/servers/:serverId/backups — create a backup
backupRoutes.post(
  "/:serverId/backups",
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).max(255),
      ignored: z.string().optional().default(""),
    })
  ),
  async (c) => {
    const user = c.get("user");
    const db = getDb(c.env.DB);
    const data = c.req.valid("json");

    const access = await getServerAccess(db, c.req.param("serverId"), user);
    if (!access) {
      return c.json({ error: "Server not found" }, 404);
    }
    const { server } = access;

    if (server.backupLimit <= 0) {
      return c.json({ error: "Backups are disabled for this server" }, 403);
    }

    // Count non-failed backups (in-progress or successful)
    const existing = await db
      .select()
      .from(schema.backups)
      .where(
        and(
          eq(schema.backups.serverId, server.id),
          or(
            sql`${schema.backups.completedAt} IS NULL`,
            eq(schema.backups.isSuccessful, 1)
          )
        )
      )
      .all();

    if (existing.length >= server.backupLimit) {
      // Try to delete the oldest unlocked non-failed backup
      const oldest = existing
        .filter((b) => !b.isLocked && b.completedAt !== null)
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )[0];

      if (!oldest) {
        return c.json(
          {
            error:
              "Backup limit reached and all existing backups are locked or in progress",
          },
          400
        );
      }

      // Delete oldest backup from R2 + DB
      try {
        await c.env.R2.delete(backupKey(server.uuid, oldest.uuid));
      } catch {
        // R2 object may not exist (failed backup)
      }
      await db.delete(schema.backups).where(eq(schema.backups.id, oldest.id));
    }

    const ignoredArray = data.ignored
      ? data.ignored
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
      : [];

    const backup = await db
      .insert(schema.backups)
      .values({
        serverId: server.id,
        name: data.name,
        ignoredFiles: JSON.stringify(ignoredArray),
      })
      .returning()
      .get();

    // Tell Wings to create the backup
    const node = await db
      .select()
      .from(schema.nodes)
      .where(eq(schema.nodes.id, server.nodeId))
      .get();

    if (node) {
      try {
        const client = new WingsClient(node);
        await client.createBackup(
          server.uuid,
          backup.uuid,
          "s3",
          data.ignored || ""
        );
      } catch {
        // Wings offline — mark backup as failed
        await db
          .update(schema.backups)
          .set({
            isSuccessful: 0,
            completedAt: new Date().toISOString(),
          })
          .where(eq(schema.backups.id, backup.id));
      }
    }

    logActivity(c, {
      event: "backup:create",
      serverId: server.id,
      nodeId: server.nodeId,
      metadata: { name: data.name, backupId: backup.id },
    });

    return c.json(backup, 201);
  }
);

// GET /api/servers/:serverId/backups/:backupId/download — presigned download URL
backupRoutes.get("/:serverId/backups/:backupId/download", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  const access = await getServerAccess(db, c.req.param("serverId"), user);
  if (!access) {
    return c.json({ error: "Server not found" }, 404);
  }

  const backup = await db
    .select()
    .from(schema.backups)
    .where(
      and(
        eq(schema.backups.id, c.req.param("backupId")),
        eq(schema.backups.serverId, access.server.id)
      )
    )
    .get();

  if (!backup) {
    return c.json({ error: "Backup not found" }, 404);
  }
  if (!(backup.completedAt && backup.isSuccessful)) {
    return c.json({ error: "Backup is not ready for download" }, 400);
  }

  const s3 = getS3Client(c.env);
  const url = await getPresignedDownloadUrl(
    s3,
    backupKey(access.server.uuid, backup.uuid)
  );

  logActivity(c, {
    event: "backup:download",
    serverId: access.server.id,
    metadata: { backupId: backup.id },
  });

  return c.json({ url });
});

// POST /api/servers/:serverId/backups/:backupId/lock — toggle lock
backupRoutes.post("/:serverId/backups/:backupId/lock", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  const access = await getServerAccess(db, c.req.param("serverId"), user);
  if (!access) {
    return c.json({ error: "Server not found" }, 404);
  }

  const backup = await db
    .select()
    .from(schema.backups)
    .where(
      and(
        eq(schema.backups.id, c.req.param("backupId")),
        eq(schema.backups.serverId, access.server.id)
      )
    )
    .get();

  if (!backup) {
    return c.json({ error: "Backup not found" }, 404);
  }

  const newLocked = backup.isLocked ? 0 : 1;
  await db
    .update(schema.backups)
    .set({ isLocked: newLocked })
    .where(eq(schema.backups.id, backup.id));

  logActivity(c, {
    event: newLocked ? "backup:lock" : "backup:unlock",
    serverId: access.server.id,
    metadata: { backupId: backup.id },
  });

  return c.json({ isLocked: !!newLocked });
});

// POST /api/servers/:serverId/backups/:backupId/restore — restore from backup
backupRoutes.post(
  "/:serverId/backups/:backupId/restore",
  zValidator(
    "json",
    z.object({
      truncate: z.boolean().optional().default(false),
    })
  ),
  async (c) => {
    const user = c.get("user");
    const db = getDb(c.env.DB);
    const { truncate } = c.req.valid("json");

    const access = await getServerAccess(db, c.req.param("serverId"), user);
    if (!access) {
      return c.json({ error: "Server not found" }, 404);
    }
    const { server } = access;

    if (server.status) {
      return c.json({ error: "Server has an operation in progress" }, 409);
    }

    const backup = await db
      .select()
      .from(schema.backups)
      .where(
        and(
          eq(schema.backups.id, c.req.param("backupId")),
          eq(schema.backups.serverId, server.id)
        )
      )
      .get();

    if (!backup) {
      return c.json({ error: "Backup not found" }, 404);
    }
    if (!(backup.completedAt && backup.isSuccessful)) {
      return c.json({ error: "Backup is not ready for restore" }, 400);
    }

    const node = await db
      .select()
      .from(schema.nodes)
      .where(eq(schema.nodes.id, server.nodeId))
      .get();
    if (!node) {
      return c.json({ error: "Node not found" }, 404);
    }

    // Generate presigned download URL for Wings
    const s3 = getS3Client(c.env);
    const downloadUrl = await getPresignedDownloadUrl(
      s3,
      backupKey(server.uuid, backup.uuid)
    );

    // Mark server as restoring
    await db
      .update(schema.servers)
      .set({
        status: "restoring_backup",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.servers.id, server.id));

    // Tell Wings to restore
    const client = new WingsClient(node);
    await client.restoreBackup(
      server.uuid,
      backup.uuid,
      "s3",
      truncate,
      downloadUrl
    );

    logActivity(c, {
      event: "backup:restore",
      serverId: server.id,
      nodeId: server.nodeId,
      metadata: { backupId: backup.id, truncate },
    });

    return c.body(null, 204);
  }
);

// DELETE /api/servers/:serverId/backups/:backupId — delete a backup
backupRoutes.delete("/:serverId/backups/:backupId", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  const access = await getServerAccess(db, c.req.param("serverId"), user);
  if (!access) {
    return c.json({ error: "Server not found" }, 404);
  }

  const backup = await db
    .select()
    .from(schema.backups)
    .where(
      and(
        eq(schema.backups.id, c.req.param("backupId")),
        eq(schema.backups.serverId, access.server.id)
      )
    )
    .get();

  if (!backup) {
    return c.json({ error: "Backup not found" }, 404);
  }

  if (backup.isLocked && backup.isSuccessful) {
    return c.json({ error: "Backup is locked" }, 403);
  }

  // Delete from R2
  try {
    await c.env.R2.delete(backupKey(access.server.uuid, backup.uuid));
  } catch {
    // Object may not exist
  }

  // Delete DB row
  await db.delete(schema.backups).where(eq(schema.backups.id, backup.id));

  logActivity(c, {
    event: "backup:delete",
    serverId: access.server.id,
    metadata: { backupId: backup.id, name: backup.name },
  });

  return c.body(null, 204);
});
