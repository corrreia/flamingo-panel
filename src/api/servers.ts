import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { getDb, schema } from "../db";
import { requireAuth, type AuthUser } from "./middleware/auth";
import { WingsClient } from "../lib/wings-client";
import { signWingsWebsocketToken, WS_PERMISSIONS } from "../lib/wings-jwt";

export const serverRoutes = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

serverRoutes.use("*", requireAuth);

// Create server (admin only)
serverRoutes.post("/", zValidator("json", z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  nodeId: z.string().min(1),
  ownerId: z.string().min(1),
  eggId: z.string().min(1),
  memory: z.number().int().min(64).default(512),
  disk: z.number().int().min(128).default(1024),
  cpu: z.number().int().min(10).default(100),
  swap: z.number().int().default(0),
  io: z.number().int().default(500),
  defaultAllocationPort: z.number().int().min(1).max(65535).default(25565),
  startup: z.string().optional(),
  image: z.string().optional(),
  variables: z.record(z.string()).optional(),
})), async (c) => {
  const user = c.get("user");
  if (user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const data = c.req.valid("json");
  const db = getDb(c.env.DB);

  // Validate node exists
  const node = await db.select().from(schema.nodes)
    .where(eq(schema.nodes.id, data.nodeId)).get();
  if (!node) return c.json({ error: "Node not found" }, 404);

  // Validate egg exists
  const egg = await db.select().from(schema.eggs)
    .where(eq(schema.eggs.id, data.eggId)).get();
  if (!egg) return c.json({ error: "Egg not found" }, 404);

  // Validate owner exists
  const owner = await db.select().from(schema.users)
    .where(eq(schema.users.id, data.ownerId)).get();
  if (!owner) return c.json({ error: "User not found" }, 404);

  const server = await db.insert(schema.servers).values({
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
  }).returning().get();

  // Save egg variables with defaults
  if (data.variables || egg) {
    const eggVars = await db.select().from(schema.eggVariables)
      .where(eq(schema.eggVariables.eggId, data.eggId)).all();
    for (const ev of eggVars) {
      await db.insert(schema.serverVariables).values({
        serverId: server.id,
        variableId: ev.id,
        variableValue: data.variables?.[ev.envVariable] || ev.defaultValue || "",
      });
    }
  }

  // Tell Wings to install the server
  try {
    const client = new WingsClient(node);
    await client.createServer({
      uuid: server.uuid,
      start_on_completion: false,
      settings: {
        uuid: server.uuid,
        meta: {
          name: server.name,
          description: server.description || "",
        },
        suspended: false,
        invocation: server.startup,
        skip_egg_scripts: false,
        build: {
          memory_limit: server.memory,
          swap: server.swap,
          io_weight: server.io,
          cpu_limit: server.cpu,
          threads: server.threads || null,
          disk_space: server.disk,
          oom_killer: server.oomKiller === 1,
        },
        container: {
          image: server.image,
          requires_rebuild: false,
        },
        allocations: {
          default: {
            ip: server.defaultAllocationIp,
            port: server.defaultAllocationPort,
          },
          mappings: {
            [server.defaultAllocationIp]: [server.defaultAllocationPort],
          },
        },
        mounts: [],
        egg: {
          id: egg.id,
          file_denylist: JSON.parse(egg.fileDenylist || "[]"),
        },
      },
      process_configuration: {
        startup: JSON.parse(egg.configStartup || "{}"),
        stop: { type: "command", value: egg.stopCommand },
        configs: JSON.parse(egg.configFiles || "[]"),
      },
    });
  } catch {
    // Wings might be offline, server record is still created
  }

  return c.json(server, 201);
});

// List servers (admin sees all, user sees own)
serverRoutes.get("/", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  let serverList;
  if (user.role === "admin") {
    serverList = await db.select().from(schema.servers).all();
  } else {
    serverList = await db.select().from(schema.servers)
      .where(eq(schema.servers.ownerId, user.id)).all();
  }

  return c.json(serverList);
});

// Get single server with live stats from Wings
serverRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const server = await db.select().from(schema.servers)
    .where(eq(schema.servers.id, c.req.param("id"))).get();

  if (!server) return c.json({ error: "Server not found" }, 404);
  if (user.role !== "admin" && server.ownerId !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const node = await db.select().from(schema.nodes)
    .where(eq(schema.nodes.id, server.nodeId)).get();

  let resources = null;
  if (node) {
    try {
      const client = new WingsClient(node);
      resources = await client.getServer(server.uuid);
    } catch {
      // Node offline
    }
  }

  return c.json({ ...server, resources });
});

// Power actions
serverRoutes.post("/:id/power", zValidator("json", z.object({
  action: z.enum(["start", "stop", "restart", "kill"]),
})), async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const { action } = c.req.valid("json");

  const server = await db.select().from(schema.servers)
    .where(eq(schema.servers.id, c.req.param("id"))).get();
  if (!server) return c.json({ error: "Server not found" }, 404);
  if (user.role !== "admin" && server.ownerId !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const node = await db.select().from(schema.nodes)
    .where(eq(schema.nodes.id, server.nodeId)).get();
  if (!node) return c.json({ error: "Node not found" }, 404);

  const client = new WingsClient(node);
  await client.powerAction(server.uuid, action);
  return c.body(null, 204);
});

// Send command
serverRoutes.post("/:id/command", zValidator("json", z.object({
  command: z.string().min(1),
})), async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const { command } = c.req.valid("json");

  const server = await db.select().from(schema.servers)
    .where(eq(schema.servers.id, c.req.param("id"))).get();
  if (!server) return c.json({ error: "Server not found" }, 404);
  if (user.role !== "admin" && server.ownerId !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const node = await db.select().from(schema.nodes)
    .where(eq(schema.nodes.id, server.nodeId)).get();
  if (!node) return c.json({ error: "Node not found" }, 404);

  const client = new WingsClient(node);
  await client.sendCommand(server.uuid, [command]);
  return c.body(null, 204);
});

// Get WebSocket token for console
serverRoutes.get("/:id/websocket", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  const server = await db.select().from(schema.servers)
    .where(eq(schema.servers.id, c.req.param("id"))).get();
  if (!server) return c.json({ error: "Server not found" }, 404);
  if (user.role !== "admin" && server.ownerId !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const node = await db.select().from(schema.nodes)
    .where(eq(schema.nodes.id, server.nodeId)).get();
  if (!node) return c.json({ error: "Node not found" }, 404);

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
      WS_PERMISSIONS.ADMIN_TRANSFER,
    );
  }

  const token = await signWingsWebsocketToken(
    { user_uuid: user.id, server_uuid: server.uuid, permissions },
    node.token,
  );

  // WebSocket URL goes through the tunnel
  return c.json({
    token,
    socket: `wss://${node.fqdn}/api/servers/${server.uuid}/ws`,
  });
});

// WebSocket console proxy via Durable Object
serverRoutes.get("/:id/console", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  const server = await db.select().from(schema.servers)
    .where(eq(schema.servers.id, c.req.param("id"))).get();
  if (!server) return c.json({ error: "Server not found" }, 404);
  if (user.role !== "admin" && server.ownerId !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const node = await db.select().from(schema.nodes)
    .where(eq(schema.nodes.id, server.nodeId)).get();
  if (!node) return c.json({ error: "Node not found" }, 404);

  const permissions = [
    WS_PERMISSIONS.CONNECT,
    WS_PERMISSIONS.SEND_COMMAND,
    WS_PERMISSIONS.POWER_START,
    WS_PERMISSIONS.POWER_STOP,
    WS_PERMISSIONS.POWER_RESTART,
    WS_PERMISSIONS.BACKUP_READ,
  ];
  if (user.role === "admin") {
    permissions.push(WS_PERMISSIONS.ADMIN_ERRORS, WS_PERMISSIONS.ADMIN_INSTALL);
  }

  const wingsToken = await signWingsWebsocketToken(
    { user_uuid: user.id, server_uuid: server.uuid, permissions },
    node.token,
  );

  const wingsUrl = `wss://${node.fqdn}/api/servers/${server.uuid}/ws`;

  // Get or create Durable Object for this server
  const doId = c.env.CONSOLE_SESSION.idFromName(server.uuid);
  const stub = c.env.CONSOLE_SESSION.get(doId);

  // Configure the DO with Wings connection info
  await stub.fetch(new Request("https://internal/connect", {
    method: "POST",
    body: JSON.stringify({ wingsUrl, wingsToken }),
  }));

  // Proxy the WebSocket upgrade to the DO
  return stub.fetch(new Request("https://internal/websocket", {
    headers: c.req.raw.headers,
  }));
});
