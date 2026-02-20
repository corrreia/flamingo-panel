import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDb, schema } from "../db";
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

  const page = Number.parseInt(c.req.query("page") || "0", 10);
  const perPage = Number.parseInt(c.req.query("per_page") || "50", 10);
  const offset = page * perPage;

  const servers = await db
    .select()
    .from(schema.servers)
    .where(eq(schema.servers.nodeId, node.id))
    .limit(perPage)
    .offset(offset)
    .all();

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
      from: offset,
      last_page: Math.ceil(servers.length / perPage),
      per_page: perPage,
      to: offset + data.length,
      total: servers.length,
    },
  });
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
      installedAt: body.successful
        ? new Date().toISOString()
        : server.installedAt,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.servers.id, server.id));

  return c.body(null, 204);
});

// POST /api/remote/servers/reset - Wings reports boot
remoteRoutes.post("/servers/reset", (_c) => {
  return _c.body(null, 204);
});

// POST /api/remote/servers/:uuid/container/status - Wings reports state change
remoteRoutes.post("/servers/:uuid/container/status", (c) => {
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
    await db.insert(schema.activityLogs).values({
      userId: activity.user || null,
      serverId: serverMap.get(activity.server) ?? null,
      nodeId: node.id,
      event: activity.event,
      metadata: JSON.stringify(activity.metadata),
      ip: activity.ip,
    });
  }

  return c.body(null, 204);
});

// POST /api/remote/backups/:uuid - Wings reports backup status
remoteRoutes.post("/backups/:uuid", (c) => {
  return c.body(null, 204);
});

// POST /api/remote/backups/:uuid/restore - Wings reports restore status
remoteRoutes.post("/backups/:uuid/restore", (c) => {
  return c.body(null, 204);
});

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
