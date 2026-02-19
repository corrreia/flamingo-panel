import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { getDb, schema } from "../db";
import { requireAuth, requireAdmin } from "./middleware/auth";

export const eggRoutes = new Hono<{ Bindings: Env }>();

eggRoutes.use("*", requireAuth);

// List eggs
eggRoutes.get("/", async (c) => {
  const db = getDb(c.env.DB);
  return c.json(await db.select().from(schema.eggs).all());
});

// Get egg with variables
eggRoutes.get("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const egg = await db.select().from(schema.eggs).where(eq(schema.eggs.id, c.req.param("id"))).get();
  if (!egg) return c.json({ error: "Egg not found" }, 404);
  const variables = await db.select().from(schema.eggVariables)
    .where(eq(schema.eggVariables.eggId, egg.id)).all();
  return c.json({ ...egg, variables });
});

// Create egg (admin)
eggRoutes.post("/", requireAdmin, zValidator("json", z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  dockerImage: z.string().min(1),
  startup: z.string().min(1),
  stopCommand: z.string().default("stop"),
  configStartup: z.string().optional(),
  configFiles: z.string().optional(),
  scriptInstall: z.string().optional(),
  scriptContainer: z.string().optional(),
  scriptEntry: z.string().optional(),
})), async (c) => {
  const db = getDb(c.env.DB);
  const data = c.req.valid("json");
  const egg = await db.insert(schema.eggs).values(data).returning().get();
  return c.json(egg, 201);
});

// Import egg from Pelican JSON format (admin)
eggRoutes.post("/import", requireAdmin, async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json();

  const egg = await db.insert(schema.eggs).values({
    name: body.name,
    description: body.description || "",
    dockerImage: typeof body.docker_images === "object"
      ? Object.values(body.docker_images)[0] as string
      : body.docker_image || "",
    startup: body.startup || "",
    stopCommand: body.config?.stop || "stop",
    configStartup: JSON.stringify(body.config?.startup || {}),
    configFiles: JSON.stringify(body.config?.files || []),
    scriptInstall: body.scripts?.installation?.script || "",
    scriptContainer: body.scripts?.installation?.container || "ghcr.io/pelican-dev/installer:latest",
    scriptEntry: body.scripts?.installation?.entrypoint || "bash",
    fileDenylist: JSON.stringify(body.file_denylist || []),
    features: JSON.stringify(body.features || {}),
  }).returning().get();

  // Import variables
  if (body.variables && Array.isArray(body.variables)) {
    for (const v of body.variables) {
      await db.insert(schema.eggVariables).values({
        eggId: egg.id,
        name: v.name,
        description: v.description || "",
        envVariable: v.env_variable,
        defaultValue: v.default_value || "",
        userViewable: v.user_viewable ? 1 : 0,
        userEditable: v.user_editable ? 1 : 0,
        rules: Array.isArray(v.rules) ? v.rules.join("|") : (v.rules || "required|string"),
        sortOrder: v.sort || 0,
      });
    }
  }

  return c.json(egg, 201);
});
