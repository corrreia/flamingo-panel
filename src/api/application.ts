import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { getDb, schema } from "../db";

export const applicationRoutes = new Hono<{ Bindings: Env }>();

// Auth middleware: accepts "Bearer {token}" where token is a raw API key (papp_...)
// Looks up by comparing SHA-256 hash against stored tokenHash
applicationRoutes.use("*", async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const token = auth.slice(7);
  const db = getDb(c.env.DB);

  // Hash the token and look up
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  const key = await db.select().from(schema.apiKeys)
    .where(eq(schema.apiKeys.tokenHash, tokenHash)).get();
  if (!key) return c.json({ error: "Invalid API token" }, 401);

  // Verify the user is an admin
  const user = await db.select().from(schema.users)
    .where(eq(schema.users.id, key.userId)).get();
  if (!user || user.role !== "admin") {
    return c.json({ error: "Admin access required" }, 403);
  }

  // Update last used
  await db.update(schema.apiKeys)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(eq(schema.apiKeys.id, key.id));

  // Pass key info for downstream handlers (e.g. one-time key cleanup)
  c.set("apiKeyId" as never, key.id);
  c.set("apiKeyMemo" as never, key.memo || "");

  await next();
});

// GET /api/application/nodes/:id/configuration
// This is what `wings configure` calls to get the full config.yml JSON
applicationRoutes.get("/nodes/:id/configuration", async (c) => {
  const db = getDb(c.env.DB);
  const node = await db.select().from(schema.nodes)
    .where(eq(schema.nodes.id, Number(c.req.param("id")))).get();
  if (!node) return c.json({ error: "Node not found" }, 404);

  // If this was a one-time configure key, consume it (delete after use)
  const memo = c.get("apiKeyMemo" as never) as string;
  if (memo?.startsWith("node-configure:")) {
    const keyId = c.get("apiKeyId" as never) as string;
    await db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, keyId));
  }

  // Return Wings-compatible configuration JSON
  return c.json({
    debug: false,
    uuid: node.id,
    token_id: node.tokenId,
    token: node.token,
    api: {
      host: "0.0.0.0",
      port: 8080,
      ssl: { enabled: false, cert: "", key: "" },
      upload_limit: node.uploadSize,
    },
    system: {
      data: "/var/lib/pelican/volumes",
      sftp: { bind_port: 2022 },
    },
    remote: c.env.PANEL_URL,
    remote_query: {
      timeout: 30,
      boot_servers_per_page: 50,
    },
  });
});
