import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, schema } from "../db";
import { type NormalizedEgg, normalizeEgg } from "../lib/egg-import";
import { requireAdmin, requireAuth } from "./middleware/auth";

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
  const egg = await db
    .select()
    .from(schema.eggs)
    .where(eq(schema.eggs.id, c.req.param("id")))
    .get();
  if (!egg) {
    return c.json({ error: "Egg not found" }, 404);
  }
  const variables = await db
    .select()
    .from(schema.eggVariables)
    .where(eq(schema.eggVariables.eggId, egg.id))
    .all();
  return c.json({ ...egg, variables });
});

// Create egg with inline variables
const createEggSchema = z.object({
  name: z.string().min(1).max(255),
  author: z.string().default(""),
  description: z.string().default(""),
  dockerImage: z.string().min(1),
  dockerImages: z.record(z.string()).default({}),
  startup: z.string().min(1),
  stopCommand: z.string().default("stop"),
  configStartup: z.string().default("{}"),
  configFiles: z.string().default("[]"),
  configLogs: z.string().default("{}"),
  scriptInstall: z.string().default(""),
  scriptContainer: z.string().default("ghcr.io/pelican-dev/installer:latest"),
  scriptEntry: z.string().default("bash"),
  fileDenylist: z.array(z.string()).default([]),
  features: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  variables: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().default(""),
        envVariable: z.string().min(1),
        defaultValue: z.string().default(""),
        userViewable: z.boolean().default(false),
        userEditable: z.boolean().default(false),
        rules: z.string().default("required|string"),
      })
    )
    .default([]),
});

eggRoutes.post(
  "/",
  requireAdmin,
  zValidator("json", createEggSchema),
  async (c) => {
    const db = getDb(c.env.DB);
    const data = c.req.valid("json");

    const egg = await db
      .insert(schema.eggs)
      .values({
        name: data.name,
        author: data.author,
        description: data.description,
        dockerImage: data.dockerImage,
        dockerImages: JSON.stringify(data.dockerImages),
        startup: data.startup,
        stopCommand: data.stopCommand,
        configStartup: data.configStartup,
        configFiles: data.configFiles,
        configLogs: data.configLogs,
        scriptInstall: data.scriptInstall,
        scriptContainer: data.scriptContainer,
        scriptEntry: data.scriptEntry,
        fileDenylist: JSON.stringify(data.fileDenylist),
        features: JSON.stringify(data.features),
        tags: JSON.stringify(data.tags),
      })
      .returning()
      .get();

    // Insert variables
    for (let i = 0; i < data.variables.length; i++) {
      const v = data.variables[i];
      await db.insert(schema.eggVariables).values({
        eggId: egg.id,
        name: v.name,
        description: v.description,
        envVariable: v.envVariable,
        defaultValue: v.defaultValue,
        userViewable: v.userViewable ? 1 : 0,
        userEditable: v.userEditable ? 1 : 0,
        rules: v.rules,
        sortOrder: i,
      });
    }

    const variables = await db
      .select()
      .from(schema.eggVariables)
      .where(eq(schema.eggVariables.eggId, egg.id))
      .all();
    return c.json({ ...egg, variables }, 201);
  }
);

// Update egg
const updateEggSchema = createEggSchema.partial();

/** Build a partial update record from the validated input, only including defined fields. */
function buildEggUpdates(
  data: z.infer<typeof updateEggSchema>
): Record<string, unknown> {
  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  // Direct-copy fields
  const directFields = [
    "name",
    "author",
    "description",
    "dockerImage",
    "startup",
    "stopCommand",
    "configStartup",
    "configFiles",
    "configLogs",
    "scriptInstall",
    "scriptContainer",
    "scriptEntry",
  ] as const;

  for (const field of directFields) {
    if (data[field] !== undefined) {
      updates[field] = data[field];
    }
  }

  // JSON-stringified fields
  const jsonFields = [
    "dockerImages",
    "fileDenylist",
    "features",
    "tags",
  ] as const;

  for (const field of jsonFields) {
    if (data[field] !== undefined) {
      updates[field] = JSON.stringify(data[field]);
    }
  }

  return updates;
}

eggRoutes.put(
  "/:id",
  requireAdmin,
  zValidator("json", updateEggSchema),
  async (c) => {
    const db = getDb(c.env.DB);
    const eggId = c.req.param("id");
    const data = c.req.valid("json");

    const existing = await db
      .select()
      .from(schema.eggs)
      .where(eq(schema.eggs.id, eggId))
      .get();
    if (!existing) {
      return c.json({ error: "Egg not found" }, 404);
    }

    const updates = buildEggUpdates(data);

    const egg = await db
      .update(schema.eggs)
      .set(updates)
      .where(eq(schema.eggs.id, eggId))
      .returning()
      .get();

    // Sync variables if provided
    if (data.variables !== undefined) {
      await db
        .delete(schema.eggVariables)
        .where(eq(schema.eggVariables.eggId, eggId));

      for (let i = 0; i < data.variables.length; i++) {
        const v = data.variables[i];
        await db.insert(schema.eggVariables).values({
          eggId,
          name: v.name,
          description: v.description || "",
          envVariable: v.envVariable,
          defaultValue: v.defaultValue || "",
          userViewable: v.userViewable ? 1 : 0,
          userEditable: v.userEditable ? 1 : 0,
          rules: v.rules || "required|string",
          sortOrder: i,
        });
      }
    }

    const variables = await db
      .select()
      .from(schema.eggVariables)
      .where(eq(schema.eggVariables.eggId, eggId))
      .all();
    return c.json({ ...egg, variables });
  }
);

// Import egg from Pelican/Pterodactyl format (any version)
eggRoutes.post("/import", requireAdmin, async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json();

  let normalized: NormalizedEgg;
  try {
    normalized = normalizeEgg(body);
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : "Invalid egg format" },
      400
    );
  }

  const egg = await db
    .insert(schema.eggs)
    .values({
      name: normalized.name,
      author: normalized.author,
      description: normalized.description,
      dockerImage: normalized.dockerImage,
      dockerImages: JSON.stringify(normalized.dockerImages),
      startup: normalized.startup,
      stopCommand: normalized.stopCommand,
      configStartup: normalized.configStartup,
      configFiles: normalized.configFiles,
      configLogs: normalized.configLogs,
      scriptInstall: normalized.scriptInstall,
      scriptContainer: normalized.scriptContainer,
      scriptEntry: normalized.scriptEntry,
      fileDenylist: JSON.stringify(normalized.fileDenylist),
      features: JSON.stringify(normalized.features),
      tags: JSON.stringify(normalized.tags),
    })
    .returning()
    .get();

  // Insert variables
  for (const v of normalized.variables) {
    await db.insert(schema.eggVariables).values({
      eggId: egg.id,
      name: v.name,
      description: v.description,
      envVariable: v.envVariable,
      defaultValue: v.defaultValue,
      userViewable: v.userViewable ? 1 : 0,
      userEditable: v.userEditable ? 1 : 0,
      rules: v.rules,
      sortOrder: v.sortOrder,
    });
  }

  const variables = await db
    .select()
    .from(schema.eggVariables)
    .where(eq(schema.eggVariables.eggId, egg.id))
    .all();
  return c.json({ ...egg, variables }, 201);
});

// Export egg as PLCN_v3 JSON
eggRoutes.get("/:id/export", async (c) => {
  const db = getDb(c.env.DB);
  const egg = await db
    .select()
    .from(schema.eggs)
    .where(eq(schema.eggs.id, c.req.param("id")))
    .get();
  if (!egg) {
    return c.json({ error: "Egg not found" }, 404);
  }

  const variables = await db
    .select()
    .from(schema.eggVariables)
    .where(eq(schema.eggVariables.eggId, egg.id))
    .all();

  const dockerImages = JSON.parse(egg.dockerImages || "{}");
  const startupCommands: Record<string, string> =
    Object.keys(dockerImages).length > 0
      ? { Default: egg.startup }
      : { Default: egg.startup };

  const exported = {
    _comment: "DO NOT EDIT: FILE GENERATED AUTOMATICALLY BY FLAMINGO PANEL",
    meta: { version: "PLCN_v3" },
    exported_at: new Date().toISOString(),
    name: egg.name,
    author: egg.author || "",
    description: egg.description || "",
    tags: JSON.parse(egg.tags || "[]"),
    features: JSON.parse(egg.features || "{}"),
    docker_images: dockerImages,
    file_denylist: JSON.parse(egg.fileDenylist || "[]"),
    startup_commands: startupCommands,
    config: {
      files: egg.configFiles || "[]",
      startup: egg.configStartup || "{}",
      logs: egg.configLogs || "{}",
      stop: egg.stopCommand,
    },
    scripts: {
      installation: {
        script: egg.scriptInstall || "",
        container:
          egg.scriptContainer || "ghcr.io/pelican-dev/installer:latest",
        entrypoint: egg.scriptEntry || "bash",
      },
    },
    variables: variables.map((v) => ({
      name: v.name,
      description: v.description || "",
      env_variable: v.envVariable,
      default_value: v.defaultValue || "",
      user_viewable: v.userViewable === 1,
      user_editable: v.userEditable === 1,
      rules: v.rules.includes("|") ? v.rules.split("|") : [v.rules],
      sort: v.sortOrder,
    })),
  };

  return c.json(exported);
});

// Delete egg (blocks if servers are using it)
eggRoutes.delete("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const egg = await db
    .select()
    .from(schema.eggs)
    .where(eq(schema.eggs.id, c.req.param("id")))
    .get();

  if (!egg) {
    return c.json({ error: "Egg not found" }, 404);
  }

  const serversUsingEgg = await db
    .select()
    .from(schema.servers)
    .where(eq(schema.servers.eggId, egg.id))
    .all();

  if (serversUsingEgg.length > 0) {
    return c.json({ error: "Cannot delete egg with active servers" }, 409);
  }

  await db.delete(schema.eggs).where(eq(schema.eggs.id, egg.id));
  return c.body(null, 204);
});
