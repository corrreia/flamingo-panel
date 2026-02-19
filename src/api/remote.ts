import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { getDb, schema } from "../db";

export const remoteRoutes = new Hono<{ Bindings: Env }>();

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
  const db = getDb(c.env.DB);
  const node = await db.select().from(schema.nodes)
    .where(eq(schema.nodes.tokenId, tokenId!)).get();
  if (!node || node.token !== token) {
    return c.json({ error: "Forbidden" }, 403);
  }
  c.set("node" as never, node);
  await next();
});

// GET /api/remote/servers - Wings fetches all server configs for this node
remoteRoutes.get("/servers", async (c) => {
  const node = c.get("node" as never) as any;
  const db = getDb(c.env.DB);

  const page = parseInt(c.req.query("page") || "0");
  const perPage = parseInt(c.req.query("per_page") || "50");
  const offset = page * perPage;

  const servers = await db.select().from(schema.servers)
    .where(eq(schema.servers.nodeId, node.id))
    .limit(perPage).offset(offset).all();

  const data = await Promise.all(servers.map(async (s) => {
    const egg = s.eggId ? await db.select().from(schema.eggs)
      .where(eq(schema.eggs.id, s.eggId)).get() : null;

    const variables = s.eggId
      ? await db.select().from(schema.eggVariables)
          .where(eq(schema.eggVariables.eggId, s.eggId)).all()
      : [];

    const serverVars = await db.select().from(schema.serverVariables)
      .where(eq(schema.serverVariables.serverId, s.id)).all();

    const envVars: Record<string, string> = {};
    for (const v of variables) {
      const override = serverVars.find(sv => sv.variableId === v.id);
      envVars[v.envVariable] = override?.variableValue ?? v.defaultValue ?? "";
    }

    return {
      uuid: s.uuid,
      settings: JSON.stringify({
        uuid: s.uuid,
        meta: { name: s.name, description: s.description },
        suspended: s.status === "suspended",
        invocation: s.startup || egg?.startup || "",
        skip_egg_scripts: false,
        environment: envVars,
        allocations: {
          force_outgoing_ip: false,
          default: { ip: s.defaultAllocationIp, port: s.defaultAllocationPort },
          mappings: { [s.defaultAllocationIp]: [s.defaultAllocationPort] },
        },
        build: {
          memory_limit: s.memory,
          swap: s.swap,
          io_weight: s.io,
          cpu_limit: s.cpu,
          disk_space: s.disk,
          threads: s.threads || "",
          oom_killer: s.oomKiller === 1,
        },
        container: { image: s.image || egg?.dockerImage || "" },
        egg: {
          id: s.eggId || "",
          file_denylist: egg ? JSON.parse(egg.fileDenylist || "[]") : [],
        },
        crash_detection_enabled: true,
      }),
      process_configuration: JSON.stringify({
        startup: {
          done: egg ? JSON.parse(egg.configStartup || "{}").done || [] : [],
          user_interaction: [],
          strip_ansi: false,
        },
        stop: {
          type: "command",
          value: egg?.stopCommand || "stop",
        },
        configs: egg ? JSON.parse(egg.configFiles || "[]") : [],
      }),
    };
  }));

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
  const server = await db.select().from(schema.servers)
    .where(eq(schema.servers.uuid, c.req.param("uuid"))).get();
  if (!server || !server.eggId) return c.json({ error: "Not found" }, 404);

  const egg = await db.select().from(schema.eggs)
    .where(eq(schema.eggs.id, server.eggId)).get();
  if (!egg) return c.json({ error: "Egg not found" }, 404);

  return c.json({
    container_image: egg.scriptContainer,
    entrypoint: egg.scriptEntry,
    script: egg.scriptInstall,
  });
});

// POST /api/remote/servers/:uuid/install - Wings reports install status
remoteRoutes.post("/servers/:uuid/install", async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json() as { successful: boolean; reinstall: boolean };
  const server = await db.select().from(schema.servers)
    .where(eq(schema.servers.uuid, c.req.param("uuid"))).get();
  if (!server) return c.json({ error: "Not found" }, 404);

  await db.update(schema.servers).set({
    status: body.successful ? null : "install_failed",
    installedAt: body.successful ? new Date().toISOString() : server.installedAt,
    updatedAt: new Date().toISOString(),
  }).where(eq(schema.servers.id, server.id));

  return c.body(null, 204);
});

// POST /api/remote/servers/reset - Wings reports boot
remoteRoutes.post("/servers/reset", async (_c) => {
  return _c.body(null, 204);
});

// POST /api/remote/servers/:uuid/container/status - Wings reports state change
remoteRoutes.post("/servers/:uuid/container/status", async (c) => {
  return c.body(null, 204);
});

// POST /api/remote/activity - Wings sends activity logs
remoteRoutes.post("/activity", async (c) => {
  const body = await c.req.json() as { data: Array<{ event: string; metadata: Record<string, unknown>; ip: string; user: string | null }> };
  const db = getDb(c.env.DB);

  for (const activity of body.data) {
    await db.insert(schema.activityLogs).values({
      userId: activity.user || null,
      event: activity.event,
      metadata: JSON.stringify(activity.metadata),
      ip: activity.ip,
    });
  }

  return c.body(null, 204);
});

// POST /api/remote/backups/:uuid - Wings reports backup status
remoteRoutes.post("/backups/:uuid", async (c) => {
  return c.body(null, 204);
});

// POST /api/remote/backups/:uuid/restore - Wings reports restore status
remoteRoutes.post("/backups/:uuid/restore", async (c) => {
  return c.body(null, 204);
});

// POST /api/remote/sftp/auth - Wings validates SFTP credentials
remoteRoutes.post("/sftp/auth", async (c) => {
  const body = await c.req.json() as { type: string; username: string; password: string; ip: string };

  // Username format: "username.server_uuid"
  const parts = body.username.split(".");
  if (parts.length !== 2) {
    return c.json({ error: "Invalid credentials" }, 403);
  }

  const [username, serverUuid] = parts;
  const db = getDb(c.env.DB);

  const user = await db.select().from(schema.users)
    .where(eq(schema.users.username, username!)).get();
  if (!user) return c.json({ error: "Invalid credentials" }, 403);

  const { verifyPassword } = await import("../lib/auth");
  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) return c.json({ error: "Invalid credentials" }, 403);

  const server = await db.select().from(schema.servers)
    .where(eq(schema.servers.uuid, serverUuid!)).get();
  if (!server) return c.json({ error: "Invalid credentials" }, 403);

  if (user.role !== "admin" && server.ownerId !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  return c.json({
    server: server.uuid,
    user: user.id,
    permissions: ["*"],
  });
});
