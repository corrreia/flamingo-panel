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

// Build the Wings-compatible server creation/install payload
function buildWingsPayload(
  server: typeof schema.servers.$inferSelect,
  egg: typeof schema.eggs.$inferSelect,
  environment: Record<string, string>,
) {
  return {
    uuid: server.uuid,
    start_on_completion: false,
    environment,
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
  };
}

// Create server (admin only)
serverRoutes.post("/", zValidator("json", z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  nodeId: z.number().int(),
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
  const eggVarsList = await db.select().from(schema.eggVariables)
    .where(eq(schema.eggVariables.eggId, data.eggId)).all();
  const environment: Record<string, string> = {};
  for (const ev of eggVarsList) {
    environment[ev.envVariable] = data.variables?.[ev.envVariable] || ev.defaultValue || "";
  }
  // Always include startup command variables
  environment["STARTUP"] = server.startup;
  environment["P_SERVER_LOCATION"] = "home";
  environment["P_SERVER_UUID"] = server.uuid;

  try {
    const client = new WingsClient(node);
    await client.createServer(buildWingsPayload(server, egg, environment));
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

// Reinstall server on Wings (re-sends the full create payload)
serverRoutes.post("/:id/reinstall", async (c) => {
  const user = c.get("user");
  if (user.role !== "admin") return c.json({ error: "Forbidden" }, 403);

  const db = getDb(c.env.DB);
  const server = await db.select().from(schema.servers)
    .where(eq(schema.servers.id, c.req.param("id"))).get();
  if (!server) return c.json({ error: "Server not found" }, 404);

  const node = await db.select().from(schema.nodes)
    .where(eq(schema.nodes.id, server.nodeId)).get();
  if (!node?.url) return c.json({ error: "Node not configured" }, 400);

  const egg = await db.select().from(schema.eggs)
    .where(eq(schema.eggs.id, server.eggId!)).get();
  if (!egg) return c.json({ error: "Egg not found" }, 404);

  // Build environment from server variables
  const serverVars = await db.select().from(schema.serverVariables)
    .where(eq(schema.serverVariables.serverId, server.id)).all();
  const eggVars = await db.select().from(schema.eggVariables)
    .where(eq(schema.eggVariables.eggId, egg.id)).all();

  const environment: Record<string, string> = {};
  for (const ev of eggVars) {
    const sv = serverVars.find(s => s.variableId === ev.id);
    environment[ev.envVariable] = sv?.variableValue || ev.defaultValue || "";
  }
  environment["STARTUP"] = server.startup;
  environment["P_SERVER_LOCATION"] = "home";
  environment["P_SERVER_UUID"] = server.uuid;

  const client = new WingsClient(node);
  await client.createServer(buildWingsPayload(server, egg, environment));
  return c.json({ ok: true });
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

// Issue a short-lived console ticket (authenticated via session)
serverRoutes.get("/:id/console-ticket", async (c) => {
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

  const wingsToken = await signWingsWebsocketToken(
    { user_uuid: user.id, server_uuid: server.uuid, permissions },
    node.token,
  );

  // Create one-time ticket stored in KV (60s TTL — KV minimum)
  const ticket = crypto.randomUUID();
  await c.env.KV.put(`console-ticket:${ticket}`, JSON.stringify({
    serverId: server.id,
    serverUuid: server.uuid,
    userId: user.id,
    wingsUrl: `${node.url.replace(/^http/, "ws").replace(/\/+$/, "")}/api/servers/${server.uuid}/ws`,
    wingsToken,
  }), { expirationTtl: 60 });

  return c.json({ ticket });
});

// WebSocket console proxy via Durable Object (ticket-authenticated)
serverRoutes.get("/:id/console", async (c) => {
  const ticket = c.req.query("ticket");
  if (!ticket) return c.json({ error: "Missing ticket" }, 401);

  // Validate and consume the one-time ticket
  const ticketKey = `console-ticket:${ticket}`;
  const ticketData = await c.env.KV.get(ticketKey);
  if (!ticketData) return c.json({ error: "Invalid or expired ticket" }, 401);

  // Delete immediately (one-time use)
  await c.env.KV.delete(ticketKey);

  const data = JSON.parse(ticketData) as {
    serverId: string;
    serverUuid: string;
    userId: string;
    wingsUrl: string;
    wingsToken: string;
  };

  // Verify the URL param matches the ticket's server
  if (data.serverId !== c.req.param("id")) {
    return c.json({ error: "Ticket/server mismatch" }, 403);
  }

  // Forward WebSocket upgrade to the DO
  const doId = c.env.CONSOLE_SESSION.idFromName(data.serverUuid);
  const stub = c.env.CONSOLE_SESSION.get(doId);

  return stub.fetch(new Request("https://internal/connect", {
    method: "POST",
    headers: c.req.raw.headers,
    body: JSON.stringify({
      wingsUrl: data.wingsUrl,
      wingsToken: data.wingsToken,
      userId: data.userId,
      serverId: data.serverId,
    }),
  }));
});

// Delete server
serverRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const server = await db.select().from(schema.servers)
    .where(eq(schema.servers.id, c.req.param("id"))).get();

  if (!server) return c.json({ error: "Server not found" }, 404);
  if (user.role !== "admin" && server.ownerId !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  // Remove from Wings node
  const node = await db.select().from(schema.nodes)
    .where(eq(schema.nodes.id, server.nodeId)).get();
  if (node) {
    try {
      const client = new WingsClient(node);
      await client.deleteServer(server.uuid);
    } catch {
      // Wings might be offline, proceed with DB deletion
    }
  }

  await db.delete(schema.servers).where(eq(schema.servers.id, server.id));
  return c.body(null, 204);
});
