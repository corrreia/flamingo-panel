import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { getDb, schema } from "../db";
import { requireAuth, requireAdmin } from "./middleware/auth";
import { WingsClient } from "../lib/wings-client";

export const nodeRoutes = new Hono<{ Bindings: Env }>();

nodeRoutes.use("*", requireAuth);

const createNodeSchema = z.object({
  name: z.string().min(1).max(255),
  fqdn: z.string().default(""),  // filled in later after cloudflared setup
  memory: z.number().int().min(0).default(0),
  memoryOverallocate: z.number().int().default(0),
  disk: z.number().int().min(0).default(0),
  diskOverallocate: z.number().int().default(0),
});

// List all nodes
nodeRoutes.get("/", requireAdmin, async (c) => {
  const db = getDb(c.env.DB);
  const allNodes = await db.select({
    id: schema.nodes.id,
    name: schema.nodes.name,
    fqdn: schema.nodes.fqdn,
    memory: schema.nodes.memory,
    disk: schema.nodes.disk,
    createdAt: schema.nodes.createdAt,
  }).from(schema.nodes).all();
  return c.json(allNodes);
});

// Get single node with live stats from Wings
nodeRoutes.get("/:id", requireAdmin, async (c) => {
  const db = getDb(c.env.DB);
  const node = await db.select().from(schema.nodes).where(eq(schema.nodes.id, c.req.param("id"))).get();
  if (!node) return c.json({ error: "Node not found" }, 404);

  let stats = null;
  try {
    const client = new WingsClient(node);
    stats = await client.getSystemInfo();
  } catch {
    // Node might be offline
  }

  return c.json({ ...node, token: undefined, stats });
});

// Create node — auto-generates tokenId + token for Wings auth
nodeRoutes.post("/", requireAdmin, zValidator("json", createNodeSchema), async (c) => {
  const data = c.req.valid("json");
  const db = getDb(c.env.DB);

  const tokenId = `node_${crypto.randomUUID().replace(/-/g, "")}`;
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  const node = await db.insert(schema.nodes).values({
    ...data,
    tokenId,
    token,
  }).returning().get();

  return c.json({
    ...node,
    configureCommand: `wings configure --panel-url ${c.env.PANEL_URL} --token <APP_API_TOKEN> --node ${node.id}`,
  }, 201);
});

const updateNodeSchema = z.object({
  name: z.string().min(1).max(255),
  fqdn: z.string(),
  memory: z.number().int().min(0),
  memoryOverallocate: z.number().int(),
  disk: z.number().int().min(0),
  diskOverallocate: z.number().int(),
}).partial();

// Update node
nodeRoutes.put("/:id", requireAdmin, zValidator("json", updateNodeSchema), async (c) => {
  const db = getDb(c.env.DB);
  const data = c.req.valid("json");
  const node = await db.update(schema.nodes)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(schema.nodes.id, c.req.param("id")))
    .returning().get();

  if (!node) return c.json({ error: "Node not found" }, 404);
  return c.json(node);
});

// Delete node
nodeRoutes.delete("/:id", requireAdmin, async (c) => {
  const db = getDb(c.env.DB);
  const servers = await db.select().from(schema.servers)
    .where(eq(schema.servers.nodeId, c.req.param("id"))).all();
  if (servers.length > 0) {
    return c.json({ error: "Cannot delete node with active servers" }, 409);
  }
  await db.delete(schema.nodes).where(eq(schema.nodes.id, c.req.param("id")));
  return c.body(null, 204);
});
