import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, schema } from "../db";
import {
  abortMultipartUpload,
  backupKey,
  completeMultipartUpload,
  createMultipartUpload,
  getPresignedUploadUrls,
  getR2Client,
} from "../lib/r2";
import {
  buildBootConfig,
  buildServerEnvironment,
} from "../services/wings-payload";

type NodeRow = typeof schema.nodes.$inferSelect;

interface RemoteEnv {
  Bindings: Env;
  Variables: { node: NodeRow };
}

export const remoteRoutes = new Hono<RemoteEnv>();

// Wings authenticates with "Bearer {tokenId}.{token}" - verify against stored node tokens
remoteRoutes.use("*", async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const tokenParts = auth.slice(7).split(".");
  if (tokenParts.length !== 2) {
    return c.json({ error: "Invalid token format" }, 401);
  }
  const [tokenId, token] = tokenParts;
  if (!tokenId) {
    return c.json({ error: "Invalid token format" }, 401);
  }
  const db = getDb(c.env.DB);
  const node = await db
    .select()
    .from(schema.nodes)
    .where(eq(schema.nodes.tokenId, tokenId))
    .get();
  if (!node || node.token !== token) {
    return c.json({ error: "Forbidden" }, 403);
  }
  c.set("node", node);
  await next();
});

// GET /api/remote/servers - Wings fetches all server configs for this node
remoteRoutes.get("/servers", async (c) => {
  const node = c.get("node");
  const db = getDb(c.env.DB);

  const page = Math.max(1, Number.parseInt(c.req.query("page") || "1", 10));
  const perPage = Number.parseInt(c.req.query("per_page") || "50", 10);
  const offset = (page - 1) * perPage;

  const servers = await db
    .select()
    .from(schema.servers)
    .where(eq(schema.servers.nodeId, node.id))
    .limit(perPage)
    .offset(offset)
    .all();

  const totalCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.servers)
    .where(eq(schema.servers.nodeId, node.id))
    .get();

  const data = await Promise.all(
    servers.map(async (s) => {
      const egg = s.eggId
        ? await db
            .select()
            .from(schema.eggs)
            .where(eq(schema.eggs.id, s.eggId))
            .get()
        : null;

      const eggVars = s.eggId
        ? await db
            .select()
            .from(schema.eggVariables)
            .where(eq(schema.eggVariables.eggId, s.eggId))
            .all()
        : [];

      const serverVars = await db
        .select()
        .from(schema.serverVariables)
        .where(eq(schema.serverVariables.serverId, s.id))
        .all();

      const environment = buildServerEnvironment(s, eggVars, serverVars);
      return buildBootConfig(s, egg ?? null, environment);
    })
  );

  return c.json({
    data,
    meta: {
      current_page: page,
      from: offset + 1,
      last_page: Math.max(1, Math.ceil((totalCount?.count ?? 0) / perPage)),
      per_page: perPage,
      to: offset + data.length,
      total: totalCount?.count ?? 0,
    },
  });
});

// GET /api/remote/servers/:uuid - Wings fetches single server config
remoteRoutes.get("/servers/:uuid", async (c) => {
  const db = getDb(c.env.DB);
  const server = await db
    .select()
    .from(schema.servers)
    .where(eq(schema.servers.uuid, c.req.param("uuid")))
    .get();
  if (!server) {
    return c.json({ error: "Not found" }, 404);
  }

  const egg = server.eggId
    ? await db
        .select()
        .from(schema.eggs)
        .where(eq(schema.eggs.id, server.eggId))
        .get()
    : null;

  const eggVars = server.eggId
    ? await db
        .select()
        .from(schema.eggVariables)
        .where(eq(schema.eggVariables.eggId, server.eggId))
        .all()
    : [];

  const serverVars = await db
    .select()
    .from(schema.serverVariables)
    .where(eq(schema.serverVariables.serverId, server.id))
    .all();

  const environment = buildServerEnvironment(server, eggVars, serverVars);
  return c.json(buildBootConfig(server, egg ?? null, environment));
});

// GET /api/remote/servers/:uuid/install - Wings fetches install script
remoteRoutes.get("/servers/:uuid/install", async (c) => {
  const db = getDb(c.env.DB);
  const server = await db
    .select()
    .from(schema.servers)
    .where(eq(schema.servers.uuid, c.req.param("uuid")))
    .get();
  if (!server?.eggId) {
    return c.json({ error: "Not found" }, 404);
  }

  const egg = await db
    .select()
    .from(schema.eggs)
    .where(eq(schema.eggs.id, server.eggId))
    .get();
  if (!egg) {
    return c.json({ error: "Egg not found" }, 404);
  }

  return c.json({
    container_image: egg.scriptContainer,
    entrypoint: egg.scriptEntry,
    script: egg.scriptInstall,
  });
});

// POST /api/remote/servers/:uuid/install - Wings reports install status
remoteRoutes.post("/servers/:uuid/install", async (c) => {
  const db = getDb(c.env.DB);
  const body = (await c.req.json()) as {
    successful: boolean;
    reinstall: boolean;
  };
  const server = await db
    .select()
    .from(schema.servers)
    .where(eq(schema.servers.uuid, c.req.param("uuid")))
    .get();
  if (!server) {
    return c.json({ error: "Not found" }, 404);
  }

  await db
    .update(schema.servers)
    .set({
      status: body.successful ? null : "install_failed",
      containerStatus: "offline",
      installedAt: body.successful
        ? new Date().toISOString()
        : server.installedAt,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.servers.id, server.id));

  return c.body(null, 204);
});

// POST /api/remote/servers/reset - Wings reports boot, clear stuck states
remoteRoutes.post("/servers/reset", async (c) => {
  const node = c.get("node");
  const db = getDb(c.env.DB);
  const now = new Date().toISOString();

  // Clear stuck installation/restore statuses only (preserve install_failed, suspended, etc.)
  await db
    .update(schema.servers)
    .set({ status: null, updatedAt: now })
    .where(
      and(
        eq(schema.servers.nodeId, node.id),
        inArray(schema.servers.status, ["installing", "restoring_backup"])
      )
    );

  // Mark all containers as offline (Wings just booted, nothing is running)
  await db
    .update(schema.servers)
    .set({ containerStatus: "offline", updatedAt: now })
    .where(eq(schema.servers.nodeId, node.id));

  return c.body(null, 204);
});

// POST /api/remote/servers/:uuid/container/status - Wings reports state change
remoteRoutes.post("/servers/:uuid/container/status", async (c) => {
  const db = getDb(c.env.DB);
  const body = (await c.req.json()) as {
    data: { previous_state: string; new_state: string };
  };
  const newState = body.data?.new_state;
  if (!newState) {
    return c.body(null, 204);
  }

  const server = await db
    .select({ id: schema.servers.id })
    .from(schema.servers)
    .where(eq(schema.servers.uuid, c.req.param("uuid")))
    .get();

  if (!server) {
    return c.json({ error: "Not found" }, 404);
  }

  await db
    .update(schema.servers)
    .set({
      containerStatus: newState,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.servers.id, server.id));

  return c.body(null, 204);
});

// POST /api/remote/activity - Wings sends activity logs
remoteRoutes.post("/activity", async (c) => {
  const node = c.get("node");
  const body = (await c.req.json()) as {
    data: Array<{
      server: string; // server UUID
      event: string;
      metadata: Record<string, unknown>;
      ip: string;
      user: string | null;
    }>;
  };
  const db = getDb(c.env.DB);

  // Build a map of server UUIDs to server IDs (avoid repeated lookups)
  const serverUuids = [
    ...new Set(body.data.map((a) => a.server).filter(Boolean)),
  ];
  const serverMap = new Map<string, string>();
  for (const uuid of serverUuids) {
    const server = await db
      .select({ id: schema.servers.id })
      .from(schema.servers)
      .where(eq(schema.servers.uuid, uuid))
      .get();
    if (server) {
      serverMap.set(uuid, server.id);
    }
  }

  for (const activity of body.data) {
    await db.insert(schema.wingsActivityLogs).values({
      serverId: serverMap.get(activity.server) ?? null,
      nodeId: node.id,
      event: activity.event,
      metadata: JSON.stringify(activity.metadata),
      ip: activity.ip,
    });
  }

  return c.body(null, 204);
});

// Max upload size: 50 GB
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024 * 1024;

// GET /api/remote/backups/:uuid — Wings requests presigned upload URLs for multipart
remoteRoutes.get(
  "/backups/:uuid",
  zValidator(
    "query",
    z.object({
      size: z.coerce.number().int().min(1).max(MAX_UPLOAD_SIZE),
    })
  ),
  async (c) => {
    const node = c.get("node");
    const db = getDb(c.env.DB);
    const { size } = c.req.valid("query");

    const backup = await db
      .select()
      .from(schema.backups)
      .where(eq(schema.backups.uuid, c.req.param("uuid")))
      .get();
    if (!backup) {
      return c.json({ error: "Backup not found" }, 404);
    }

    // Verify the backup belongs to a server on this node
    const server = await db
      .select()
      .from(schema.servers)
      .where(
        and(
          eq(schema.servers.id, backup.serverId),
          eq(schema.servers.nodeId, node.id)
        )
      )
      .get();
    if (!server) {
      return c.json({ error: "Server not found on this node" }, 404);
    }

    const r2 = getR2Client(c.env);
    const key = backupKey(server.uuid, backup.uuid);

    // Reuse existing uploadId if present, otherwise create new
    let uploadId = backup.uploadId;
    if (!uploadId) {
      uploadId = await createMultipartUpload(r2, key);
      try {
        // Conditionally store uploadId (only if not set by a concurrent request)
        const result = await db
          .update(schema.backups)
          .set({ uploadId })
          .where(
            and(
              eq(schema.backups.id, backup.id),
              isNull(schema.backups.uploadId)
            )
          );
        // If no rows updated, another request set the uploadId — reload it
        if (result.meta.changes === 0) {
          await abortMultipartUpload(r2, key, uploadId);
          const refreshed = await db
            .select({ uploadId: schema.backups.uploadId })
            .from(schema.backups)
            .where(eq(schema.backups.id, backup.id))
            .get();
          if (refreshed?.uploadId) {
            uploadId = refreshed.uploadId;
          }
        }
      } catch (err) {
        // Clean up the R2 multipart upload we just created
        try {
          await abortMultipartUpload(r2, key, uploadId);
        } catch (_abortErr) {
          // Log but don't swallow the original error
          console.error("Failed to abort multipart upload after DB error");
        }
        throw err;
      }
    }

    const urls = await getPresignedUploadUrls(r2, key, uploadId, size);
    return c.json(urls);
  }
);

// POST /api/remote/backups/:uuid — Wings reports backup completion
remoteRoutes.post(
  "/backups/:uuid",
  zValidator(
    "json",
    z.object({
      successful: z.boolean(),
      checksum: z.string().optional().default(""),
      checksum_type: z.string().optional().default("sha1"),
      size: z.number().int().min(0),
      parts: z.array(
        z.object({
          etag: z.string(),
          part_number: z.number().int().min(1),
        })
      ),
    })
  ),
  async (c) => {
    const node = c.get("node");
    const db = getDb(c.env.DB);
    const body = c.req.valid("json");

    const backup = await db
      .select()
      .from(schema.backups)
      .where(eq(schema.backups.uuid, c.req.param("uuid")))
      .get();
    if (!backup) {
      return c.json({ error: "Backup not found" }, 404);
    }

    const server = await db
      .select()
      .from(schema.servers)
      .where(
        and(
          eq(schema.servers.id, backup.serverId),
          eq(schema.servers.nodeId, node.id)
        )
      )
      .get();
    if (!server) {
      return c.json({ error: "Server not found on this node" }, 404);
    }

    const r2 = getR2Client(c.env);
    const key = backupKey(server.uuid, backup.uuid);

    if (body.successful && backup.uploadId) {
      await completeMultipartUpload(r2, key, backup.uploadId, body.parts);
    } else if (!body.successful && backup.uploadId) {
      try {
        await abortMultipartUpload(r2, key, backup.uploadId);
      } catch {
        // Abort may fail if upload never started
      }
    }

    const checksumValue = body.checksum
      ? `${body.checksum_type}:${body.checksum}`
      : null;

    // Clear uploadId after completion/abort to avoid stale references
    await db
      .update(schema.backups)
      .set({
        isSuccessful: body.successful ? 1 : 0,
        isLocked: body.successful ? backup.isLocked : 0,
        checksum: checksumValue,
        bytes: body.size || 0,
        uploadId: null,
        completedAt: new Date().toISOString(),
      })
      .where(eq(schema.backups.id, backup.id));

    return c.body(null, 204);
  }
);

// POST /api/remote/backups/:uuid/restore — Wings reports restore completion
remoteRoutes.post(
  "/backups/:uuid/restore",
  zValidator(
    "json",
    z.object({
      successful: z.boolean(),
    })
  ),
  async (c) => {
    const node = c.get("node");
    const db = getDb(c.env.DB);
    const { successful } = c.req.valid("json");

    const backup = await db
      .select()
      .from(schema.backups)
      .where(eq(schema.backups.uuid, c.req.param("uuid")))
      .get();
    if (!backup) {
      return c.json({ error: "Backup not found" }, 404);
    }

    const server = await db
      .select()
      .from(schema.servers)
      .where(
        and(
          eq(schema.servers.id, backup.serverId),
          eq(schema.servers.nodeId, node.id)
        )
      )
      .get();
    if (!server) {
      return c.json({ error: "Server not found on this node" }, 404);
    }

    // Only clear restoring state on success; set error state on failure
    await db
      .update(schema.servers)
      .set({
        status: successful ? null : "restore_failed",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.servers.id, server.id));

    return c.body(null, 204);
  }
);

// POST /api/remote/sftp/auth - Wings validates SFTP credentials
remoteRoutes.post("/sftp/auth", async (c) => {
  const body = (await c.req.json()) as {
    type: string;
    username: string;
    password: string;
    ip: string;
  };

  // Username format: "username.server_uuid"
  const parts = body.username.split(".");
  if (parts.length !== 2) {
    return c.json({ error: "Invalid credentials" }, 403);
  }

  const [username, _serverUuid] = parts;
  if (!username) {
    return c.json({ error: "Invalid credentials" }, 403);
  }
  const db = getDb(c.env.DB);

  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, username))
    .get();
  if (!user) {
    return c.json({ error: "Invalid credentials" }, 403);
  }

  // TODO: SFTP auth needs an API-key or token-based mechanism now that
  // passwords are removed (OIDC-only auth). For now, reject all SFTP
  // password attempts.
  return c.json({ error: "SFTP password auth is disabled — use OIDC" }, 403);
});
