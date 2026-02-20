import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, schema } from "../db";
import { WingsClient } from "../lib/wings-client";
import { logActivity } from "../lib/activity";
import { type AuthUser, requireAuth } from "./middleware/auth";

interface FileEnv {
  Bindings: Env;
  Variables: { user: AuthUser };
}

export const fileRoutes = new Hono<FileEnv>();

fileRoutes.use("*", requireAuth);

// Helper to get server + wings client with auth check
async function getServerAndClient(c: Context<FileEnv>) {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const server = await db
    .select()
    .from(schema.servers)
    .where(eq(schema.servers.id, c.req.param("serverId")))
    .get();
  if (!server) {
    return { error: c.json({ error: "Server not found" }, 404) };
  }
  if (user.role !== "admin" && server.ownerId !== user.id) {
    return { error: c.json({ error: "Forbidden" }, 403) };
  }
  const node = await db
    .select()
    .from(schema.nodes)
    .where(eq(schema.nodes.id, server.nodeId))
    .get();
  if (!node) {
    return { error: c.json({ error: "Node not found" }, 404) };
  }
  return { server, client: new WingsClient(node) };
}

// List directory
fileRoutes.get("/:serverId/files/list", async (c) => {
  const result = await getServerAndClient(c);
  if ("error" in result) {
    return result.error;
  }
  const dir = c.req.query("directory") || "/";
  const files = await result.client.listDirectory(result.server.uuid, dir);
  return c.json(files);
});

// Get file contents
fileRoutes.get("/:serverId/files/contents", async (c) => {
  const result = await getServerAndClient(c);
  if ("error" in result) {
    return result.error;
  }
  const file = c.req.query("file");
  if (!file) {
    return c.json({ error: "file parameter required" }, 400);
  }
  const res = await result.client.getFileContents(result.server.uuid, file);
  return new Response(res.body, {
    headers: {
      "Content-Type":
        res.headers.get("Content-Type") || "application/octet-stream",
      "X-Mime-Type": res.headers.get("X-Mime-Type") || "",
    },
  });
});

// Write file
fileRoutes.post("/:serverId/files/write", async (c) => {
  const result = await getServerAndClient(c);
  if ("error" in result) {
    return result.error;
  }
  const file = c.req.query("file");
  if (!file) {
    return c.json({ error: "file parameter required" }, 400);
  }
  const body = await c.req.text();
  await result.client.writeFile(result.server.uuid, file, body);
  logActivity(c, { event: "file:write", serverId: result.server.id, nodeId: result.server.nodeId, metadata: { file } });
  return c.body(null, 204);
});

// Rename/move files
fileRoutes.put(
  "/:serverId/files/rename",
  zValidator(
    "json",
    z.object({
      root: z.string(),
      files: z.array(z.object({ from: z.string(), to: z.string() })),
    })
  ),
  async (c) => {
    const result = await getServerAndClient(c);
    if ("error" in result) {
      return result.error;
    }
    const { root, files } = c.req.valid("json");
    await result.client.renameFiles(result.server.uuid, root, files);
    logActivity(c, { event: "file:rename", serverId: result.server.id, nodeId: result.server.nodeId, metadata: { root, files } });
    return c.body(null, 204);
  }
);

// Copy file
fileRoutes.post(
  "/:serverId/files/copy",
  zValidator(
    "json",
    z.object({
      location: z.string(),
    })
  ),
  async (c) => {
    const result = await getServerAndClient(c);
    if ("error" in result) {
      return result.error;
    }
    await result.client.copyFile(
      result.server.uuid,
      c.req.valid("json").location
    );
    logActivity(c, { event: "file:copy", serverId: result.server.id, nodeId: result.server.nodeId, metadata: { location: c.req.valid("json").location } });
    return c.body(null, 204);
  }
);

// Delete files
fileRoutes.post(
  "/:serverId/files/delete",
  zValidator(
    "json",
    z.object({
      root: z.string(),
      files: z.array(z.string()),
    })
  ),
  async (c) => {
    const result = await getServerAndClient(c);
    if ("error" in result) {
      return result.error;
    }
    const { root, files } = c.req.valid("json");
    await result.client.deleteFiles(result.server.uuid, root, files);
    logActivity(c, { event: "file:delete", serverId: result.server.id, nodeId: result.server.nodeId, metadata: { root, files } });
    return c.body(null, 204);
  }
);

// Create directory
fileRoutes.post(
  "/:serverId/files/create-directory",
  zValidator(
    "json",
    z.object({
      name: z.string(),
      path: z.string(),
    })
  ),
  async (c) => {
    const result = await getServerAndClient(c);
    if ("error" in result) {
      return result.error;
    }
    const { name, path } = c.req.valid("json");
    await result.client.createDirectory(result.server.uuid, name, path);
    logActivity(c, { event: "file:create-directory", serverId: result.server.id, nodeId: result.server.nodeId, metadata: { name, path } });
    return c.body(null, 204);
  }
);

// Compress files
fileRoutes.post(
  "/:serverId/files/compress",
  zValidator(
    "json",
    z.object({
      root: z.string(),
      files: z.array(z.string()),
    })
  ),
  async (c) => {
    const result = await getServerAndClient(c);
    if ("error" in result) {
      return result.error;
    }
    const { root, files } = c.req.valid("json");
    const stat = await result.client.compressFiles(
      result.server.uuid,
      root,
      files
    );
    logActivity(c, { event: "file:compress", serverId: result.server.id, nodeId: result.server.nodeId, metadata: { root, files } });
    return c.json(stat);
  }
);

// Decompress file
fileRoutes.post(
  "/:serverId/files/decompress",
  zValidator(
    "json",
    z.object({
      root: z.string(),
      file: z.string(),
    })
  ),
  async (c) => {
    const result = await getServerAndClient(c);
    if ("error" in result) {
      return result.error;
    }
    const { root, file } = c.req.valid("json");
    await result.client.decompressFile(result.server.uuid, root, file);
    logActivity(c, { event: "file:decompress", serverId: result.server.id, nodeId: result.server.nodeId, metadata: { root, file } });
    return c.body(null, 204);
  }
);
