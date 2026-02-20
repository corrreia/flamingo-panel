import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, schema } from "../db";
import { type SystemInfo, WingsClient } from "../lib/wings-client";
import { generateApiKey } from "../services/api-keys";
import { requireAdmin, requireAuth } from "./middleware/auth";

export const nodeRoutes = new Hono<{ Bindings: Env }>();

nodeRoutes.use("*", requireAuth);

const createNodeSchema = z.object({
  name: z.string().min(1).max(255),
  url: z.string().default(""),
});

// List all nodes
nodeRoutes.get("/", requireAdmin, async (c) => {
  const db = getDb(c.env.DB);
  const allNodes = await db
    .select({
      id: schema.nodes.id,
      name: schema.nodes.name,
      url: schema.nodes.url,
      memory: schema.nodes.memory,
      disk: schema.nodes.disk,
      cpuThreads: schema.nodes.cpuThreads,
      createdAt: schema.nodes.createdAt,
    })
    .from(schema.nodes)
    .all();
  return c.json(allNodes);
});

// Get single node with live stats from Wings
nodeRoutes.get("/:id", requireAdmin, async (c) => {
  const db = getDb(c.env.DB);
  const node = await db
    .select()
    .from(schema.nodes)
    .where(eq(schema.nodes.id, Number(c.req.param("id"))))
    .get();
  if (!node) {
    return c.json({ error: "Node not found" }, 404);
  }

  let stats: SystemInfo | null = null;
  if (node.url) {
    try {
      const client = new WingsClient(node);
      const [sysInfo, utilization] = await Promise.all([
        client.getSystemInfo(),
        client.getSystemUtilization(),
      ]);
      stats = sysInfo;

      // Sync detected hardware stats to DB (non-blocking)
      const detectedMemory = Math.round(
        sysInfo.system.memory_bytes / 1024 / 1024
      );
      const detectedDisk = Math.round(utilization.disk_total / 1024 / 1024);
      const detectedCpu = sysInfo.system.cpu_threads;

      if (
        node.memory !== detectedMemory ||
        node.disk !== detectedDisk ||
        node.cpuThreads !== detectedCpu
      ) {
        c.executionCtx.waitUntil(
          db
            .update(schema.nodes)
            .set({
              memory: detectedMemory,
              disk: detectedDisk,
              cpuThreads: detectedCpu,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(schema.nodes.id, node.id))
            .run()
        );
      }
    } catch {
      // Node might be offline
    }
  }

  return c.json({ ...node, token: undefined, stats });
});

// Create node — auto-generates tokenId + token for Wings auth,
// plus a one-time API key so the response includes the full wings configure command
nodeRoutes.post(
  "/",
  requireAdmin,
  zValidator("json", createNodeSchema),
  async (c) => {
    const data = c.req.valid("json");
    const db = getDb(c.env.DB);
    const user = c.get("user" as never) as { id: string };

    // Generate Wings node credentials
    const tokenId = `node_${crypto.randomUUID().replace(/-/g, "")}`;
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const node = await db
      .insert(schema.nodes)
      .values({
        ...data,
        tokenId,
        token,
      })
      .returning()
      .get();

    // Auto-generate a one-time application API key for wings configure
    const { token: apiToken } = await generateApiKey(
      db,
      user.id,
      `node-configure:${node.id}`
    );

    return c.json(
      {
        ...node,
        token: undefined,
        configureCommand: `wings configure --panel-url ${c.env.PANEL_URL} --token ${apiToken} --node ${node.id}`,
      },
      201
    );
  }
);

const updateNodeSchema = z
  .object({
    name: z.string().min(1).max(255),
    url: z.string(),
    memoryOverallocate: z.number().int(),
    diskOverallocate: z.number().int(),
  })
  .partial();

// Update node
nodeRoutes.put(
  "/:id",
  requireAdmin,
  zValidator("json", updateNodeSchema),
  async (c) => {
    const db = getDb(c.env.DB);
    const data = c.req.valid("json");
    const node = await db
      .update(schema.nodes)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(schema.nodes.id, Number(c.req.param("id"))))
      .returning()
      .get();

    if (!node) {
      return c.json({ error: "Node not found" }, 404);
    }
    return c.json(node);
  }
);

// Regenerate configure command — creates a new one-time API key
nodeRoutes.post("/:id/reconfigure", requireAdmin, async (c) => {
  const db = getDb(c.env.DB);
  const user = c.get("user" as never) as { id: string };
  const node = await db
    .select()
    .from(schema.nodes)
    .where(eq(schema.nodes.id, Number(c.req.param("id"))))
    .get();
  if (!node) {
    return c.json({ error: "Node not found" }, 404);
  }

  const { token: apiToken } = await generateApiKey(
    db,
    user.id,
    `node-configure:${node.id}`
  );

  return c.json({
    configureCommand: `wings configure --panel-url ${c.env.PANEL_URL} --token ${apiToken} --node ${node.id}`,
  });
});

// Issue a short-lived metrics ticket (admin only)
nodeRoutes.get("/:id/metrics-ticket", requireAdmin, async (c) => {
  const db = getDb(c.env.DB);
  const node = await db
    .select()
    .from(schema.nodes)
    .where(eq(schema.nodes.id, Number(c.req.param("id"))))
    .get();
  if (!node) {
    return c.json({ error: "Node not found" }, 404);
  }
  if (!node.url) {
    return c.json({ error: "Node has no Wings URL configured" }, 400);
  }

  const ticket = crypto.randomUUID();
  await c.env.KV.put(
    `metrics-ticket:${ticket}`,
    JSON.stringify({
      nodeId: node.id,
      wingsUrl: node.url,
      wingsToken: node.token,
    }),
    { expirationTtl: 60 }
  );

  return c.json({ ticket });
});

// Delete node
nodeRoutes.delete("/:id", requireAdmin, async (c) => {
  const db = getDb(c.env.DB);
  const nodeId = Number(c.req.param("id"));
  const servers = await db
    .select()
    .from(schema.servers)
    .where(eq(schema.servers.nodeId, nodeId))
    .all();
  if (servers.length > 0) {
    return c.json({ error: "Cannot delete node with active servers" }, 409);
  }
  await db.delete(schema.nodes).where(eq(schema.nodes.id, nodeId));
  return c.body(null, 204);
});
