import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, schema } from "../db";
import { logActivity } from "../lib/activity";
import { getServerAccess } from "../lib/server-access";
import { type ServerApiResponse, WingsClient } from "../lib/wings-client";
import { signWingsWebsocketToken, WS_PERMISSIONS } from "../lib/wings-jwt";
import {
  buildInstallPayload,
  buildServerEnvironment,
} from "../services/wings-payload";
import { type AuthUser, requireAuth } from "./middleware/auth";

const HTTP_PROTOCOL_RE = /^http/;
const TRAILING_SLASHES_RE = /\/+$/;

export const serverRoutes = new Hono<{
  Bindings: Env;
  Variables: { user: AuthUser };
}>();

serverRoutes.use("*", requireAuth);

// Create server (admin only)
serverRoutes.post(
  "/",
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      nodeId: z.number().int(),
      ownerId: z.string().min(1),
      eggId: z.string().min(1),
      memory: z.number().int().min(0).default(512), // 0 = unlimited
      disk: z.number().int().min(0).default(1024), // 0 = unlimited
      cpu: z.number().int().min(0).default(100), // 0 = unlimited
      swap: z.number().int().default(0),
      io: z.number().int().default(500),
      defaultAllocationPort: z
        .number()
        .int()
        .min(1)
        .max(65_535)
        .default(25_565),
      startup: z.string().optional(),
      image: z.string().optional(),
      variables: z.record(z.string(), z.string()).optional(),
    })
  ),
  async (c) => {
    const user = c.get("user");
    if (user.role !== "admin") {
      return c.json({ error: "Forbidden" }, 403);
    }

    const data = c.req.valid("json");
    const db = getDb(c.env.DB);

    // Validate node exists
    const node = await db
      .select()
      .from(schema.nodes)
      .where(eq(schema.nodes.id, data.nodeId))
      .get();
    if (!node) {
      return c.json({ error: "Node not found" }, 404);
    }

    // Validate egg exists
    const egg = await db
      .select()
      .from(schema.eggs)
      .where(eq(schema.eggs.id, data.eggId))
      .get();
    if (!egg) {
      return c.json({ error: "Egg not found" }, 404);
    }

    // Validate owner exists
    const owner = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, data.ownerId))
      .get();
    if (!owner) {
      return c.json({ error: "User not found" }, 404);
    }

    const server = await db
      .insert(schema.servers)
      .values({
        name: data.name,
        description: data.description || "",
        nodeId: data.nodeId,
        ownerId: data.ownerId,
        eggId: data.eggId,
        memory: data.memory,
        disk: data.disk,
        cpu: data.cpu,
        swap: data.swap,
        io: data.io,
        defaultAllocationPort: data.defaultAllocationPort,
        startup: data.startup || egg.startup,
        image: data.image || egg.dockerImage,
        status: "installing",
        containerStatus: "offline",
      })
      .returning()
      .get();

    // Save egg variables with defaults
    if (data.variables || egg) {
      const eggVars = await db
        .select()
        .from(schema.eggVariables)
        .where(eq(schema.eggVariables.eggId, data.eggId))
        .all();
      for (const ev of eggVars) {
        await db.insert(schema.serverVariables).values({
          serverId: server.id,
          variableId: ev.id,
          variableValue:
            data.variables?.[ev.envVariable] || ev.defaultValue || "",
        });
      }
    }

    // Tell Wings to install the server
    const eggVarsList = await db
      .select()
      .from(schema.eggVariables)
      .where(eq(schema.eggVariables.eggId, data.eggId))
      .all();
    const environment = buildServerEnvironment(
      server,
      eggVarsList,
      [],
      data.variables
    );

    try {
      const client = new WingsClient(node);
      await client.createServer(buildInstallPayload(server, egg, environment));
    } catch (err) {
      await db
        .update(schema.servers)
        .set({
          status: "install_failed",
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.servers.id, server.id));

      logActivity(c, {
        event: "server:create",
        serverId: server.id,
        nodeId: data.nodeId,
        metadata: {
          name: data.name,
          wingsError: err instanceof Error ? err.message : "Wings offline",
        },
      });
      return c.json({ ...server, status: "install_failed" }, 201);
    }

    logActivity(c, {
      event: "server:create",
      serverId: server.id,
      nodeId: data.nodeId,
      metadata: { name: data.name },
    });
    return c.json(server, 201);
  }
);

// List servers (admin sees all, user sees owned + shared)
serverRoutes.get("/", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  // For admin: all servers with role "admin"
  if (user.role === "admin") {
    const all = await db.select().from(schema.servers).all();
    return c.json(all.map((s) => ({ ...s, role: "admin" as const })));
  }

  // For regular users: owned + shared
  const owned = await db
    .select()
    .from(schema.servers)
    .where(eq(schema.servers.ownerId, user.id))
    .all();
  const shared = await db
    .select({ server: schema.servers })
    .from(schema.subusers)
    .innerJoin(schema.servers, eq(schema.subusers.serverId, schema.servers.id))
    .where(eq(schema.subusers.userId, user.id))
    .all();

  const serverList = [
    ...owned.map((s) => ({ ...s, role: "owner" as const })),
    ...shared.map((r) => ({ ...r.server, role: "subuser" as const })),
  ];
  return c.json(serverList);
});

// Get single server with live stats from Wings
serverRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  const access = await getServerAccess(db, c.req.param("id"), user);
  if (!access) {
    return c.json({ error: "Server not found" }, 404);
  }
  const { server, role } = access;

  const node = await db
    .select()
    .from(schema.nodes)
    .where(eq(schema.nodes.id, server.nodeId))
    .get();

  let resources: ServerApiResponse | null = null;
  if (node) {
    try {
      const client = new WingsClient(node);
      resources = await client.getServer(server.uuid);
    } catch {
      // Node offline
    }
  }

  return c.json({ ...server, role, resources });
});

// Reinstall server on Wings (re-sends the full create payload)
serverRoutes.post("/:id/reinstall", async (c) => {
  const user = c.get("user");
  if (user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const db = getDb(c.env.DB);
  const server = await db
    .select()
    .from(schema.servers)
    .where(eq(schema.servers.id, c.req.param("id")))
    .get();
  if (!server) {
    return c.json({ error: "Server not found" }, 404);
  }

  const node = await db
    .select()
    .from(schema.nodes)
    .where(eq(schema.nodes.id, server.nodeId))
    .get();
  if (!node?.url) {
    return c.json({ error: "Node not configured" }, 400);
  }

  const egg = await db
    .select()
    .from(schema.eggs)
    .where(eq(schema.eggs.id, server.eggId ?? ""))
    .get();
  if (!egg) {
    return c.json({ error: "Egg not found" }, 404);
  }

  // Build environment from server variables
  const serverVars = await db
    .select()
    .from(schema.serverVariables)
    .where(eq(schema.serverVariables.serverId, server.id))
    .all();
  const eggVars = await db
    .select()
    .from(schema.eggVariables)
    .where(eq(schema.eggVariables.eggId, egg.id))
    .all();

  const environment = buildServerEnvironment(server, eggVars, serverVars);

  await db
    .update(schema.servers)
    .set({
      status: "installing",
      containerStatus: "offline",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.servers.id, server.id));

  const client = new WingsClient(node);
  await client.createServer(buildInstallPayload(server, egg, environment));
  logActivity(c, {
    event: "server:reinstall",
    serverId: server.id,
    nodeId: server.nodeId,
  });
  return c.json({ ok: true });
});

// Power actions
serverRoutes.post(
  "/:id/power",
  zValidator(
    "json",
    z.object({
      action: z.enum(["start", "stop", "restart", "kill"]),
    })
  ),
  async (c) => {
    const user = c.get("user");
    const db = getDb(c.env.DB);
    const { action } = c.req.valid("json");

    const access = await getServerAccess(db, c.req.param("id"), user);
    if (!access) {
      return c.json({ error: "Server not found" }, 404);
    }
    const { server } = access;

    const node = await db
      .select()
      .from(schema.nodes)
      .where(eq(schema.nodes.id, server.nodeId))
      .get();
    if (!node) {
      return c.json({ error: "Node not found" }, 404);
    }

    const client = new WingsClient(node);
    await client.powerAction(server.uuid, action);
    logActivity(c, {
      event: "server:power",
      serverId: server.id,
      nodeId: server.nodeId,
      metadata: { action },
    });
    return c.body(null, 204);
  }
);

// Send command
serverRoutes.post(
  "/:id/command",
  zValidator(
    "json",
    z.object({
      command: z.string().min(1),
    })
  ),
  async (c) => {
    const user = c.get("user");
    const db = getDb(c.env.DB);
    const { command } = c.req.valid("json");

    const access = await getServerAccess(db, c.req.param("id"), user);
    if (!access) {
      return c.json({ error: "Server not found" }, 404);
    }
    const { server } = access;

    const node = await db
      .select()
      .from(schema.nodes)
      .where(eq(schema.nodes.id, server.nodeId))
      .get();
    if (!node) {
      return c.json({ error: "Node not found" }, 404);
    }

    const client = new WingsClient(node);
    await client.sendCommand(server.uuid, [command]);
    logActivity(c, {
      event: "server:command",
      serverId: server.id,
      nodeId: server.nodeId,
      metadata: { command },
    });
    return c.body(null, 204);
  }
);

// Issue a short-lived console ticket (authenticated via session)
serverRoutes.get("/:id/console-ticket", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  const access = await getServerAccess(db, c.req.param("id"), user);
  if (!access) {
    return c.json({ error: "Server not found" }, 404);
  }
  const { server } = access;

  const node = await db
    .select()
    .from(schema.nodes)
    .where(eq(schema.nodes.id, server.nodeId))
    .get();
  if (!node) {
    return c.json({ error: "Node not found" }, 404);
  }

  const permissions = [
    WS_PERMISSIONS.CONNECT,
    WS_PERMISSIONS.SEND_COMMAND,
    WS_PERMISSIONS.POWER_START,
    WS_PERMISSIONS.POWER_STOP,
    WS_PERMISSIONS.POWER_RESTART,
    WS_PERMISSIONS.BACKUP_READ,
  ];
  if (user.role === "admin") {
    permissions.push(
      WS_PERMISSIONS.ADMIN_ERRORS,
      WS_PERMISSIONS.ADMIN_INSTALL,
      WS_PERMISSIONS.ADMIN_TRANSFER
    );
  }

  const wingsToken = await signWingsWebsocketToken(
    { user_uuid: user.id, server_uuid: server.uuid, permissions },
    node.token
  );

  // Create one-time ticket stored in KV (60s TTL — KV minimum)
  const ticket = crypto.randomUUID();
  await c.env.KV.put(
    `console-ticket:${ticket}`,
    JSON.stringify({
      serverId: server.id,
      serverUuid: server.uuid,
      nodeId: server.nodeId,
      userId: user.id,
      clientIp:
        c.req.header("cf-connecting-ip") ||
        c.req.header("x-real-ip") ||
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
        "",
      wingsUrl: `${node.url.replace(HTTP_PROTOCOL_RE, "ws").replace(TRAILING_SLASHES_RE, "")}/api/servers/${server.uuid}/ws`,
      wingsToken,
    }),
    { expirationTtl: 60 }
  );

  return c.json({ ticket });
});

// NOTE: The WebSocket console endpoint (/:id/console) is registered in
// src/api/index.ts to bypass the requireAuth middleware, since browsers
// cannot send Authorization headers on WebSocket upgrade requests.

// Delete server
serverRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  const access = await getServerAccess(db, c.req.param("id"), user);
  if (!access) {
    return c.json({ error: "Server not found" }, 404);
  }
  if (access.role === "subuser") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const { server } = access;

  // Remove from Wings node
  const node = await db
    .select()
    .from(schema.nodes)
    .where(eq(schema.nodes.id, server.nodeId))
    .get();
  if (node) {
    try {
      const client = new WingsClient(node);
      await client.deleteServer(server.uuid);
    } catch {
      // Wings might be offline, proceed with DB deletion
    }
  }

  logActivity(c, {
    event: "server:delete",
    serverId: server.id,
    nodeId: server.nodeId,
    metadata: { name: server.name },
  });
  await db.delete(schema.servers).where(eq(schema.servers.id, server.id));
  return c.body(null, 204);
});
