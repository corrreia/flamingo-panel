// Egg import normalizer — converts any Pelican/Pterodactyl egg JSON
// into our internal NormalizedEgg format. Pure functions, no dependencies.

export interface NormalizedEgg {
  author: string;
  configFiles: string;
  configLogs: string;
  configStartup: string;
  description: string;
  dockerImage: string;
  dockerImages: Record<string, string>;
  features: string[];
  fileDenylist: string[];
  name: string;
  scriptContainer: string;
  scriptEntry: string;
  scriptInstall: string;
  startup: string;
  stopCommand: string;
  tags: string[];
  variables: Array<{
    name: string;
    description: string;
    envVariable: string;
    defaultValue: string;
    userViewable: boolean;
    userEditable: boolean;
    rules: string;
    sortOrder: number;
  }>;
}

// Reserved env var names that must be prefixed with SERVER_ if used by egg variables.
const RESERVED_ENV_VARS = new Set([
  "P_SERVER_UUID",
  "P_SERVER_ALLOCATION_LIMIT",
  "SERVER_MEMORY",
  "SERVER_IP",
  "SERVER_PORT",
  "ENV",
  "HOME",
  "USER",
  "STARTUP",
  "MODIFIED_STARTUP",
  "SERVER_UUID",
  "UUID",
  "INTERNAL_IP",
  "HOSTNAME",
  "TERM",
  "LANG",
  "PWD",
  "TZ",
  "TIMEZONE",
]);

// Environment variable path replacements applied to config.files strings.
// Order matters: longer/more-specific prefixes must come first.
const ENV_PATH_REPLACEMENTS: [string, string][] = [
  ["server.build.env.SERVER_IP", "server.allocations.default.ip"],
  ["server.build.default.ip", "server.allocations.default.ip"],
  ["server.build.env.SERVER_PORT", "server.allocations.default.port"],
  ["server.build.default.port", "server.allocations.default.port"],
  ["server.build.env.SERVER_MEMORY", "server.build.memory_limit"],
  ["server.build.memory", "server.build.memory_limit"],
  ["server.build.env.", "server.environment."],
  ["server.build.environment.", "server.environment."],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") {
    return v;
  }
  if (typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  return fallback;
}

function bool(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") {
    return v;
  }
  if (v === 1 || v === "1" || v === "true") {
    return true;
  }
  if (v === 0 || v === "0" || v === "false") {
    return false;
  }
  return fallback;
}

function arr(v: unknown): unknown[] {
  if (Array.isArray(v)) {
    return v;
  }
  return [];
}

function strArr(v: unknown): string[] {
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) {
        return parsed.map(String);
      }
    } catch {
      /* not JSON */
    }
    return [];
  }
  return arr(v).map(String);
}

function firstValue<T>(map: Record<string, T>): T | undefined {
  const keys = Object.keys(map);
  const firstKey = keys.length > 0 ? keys[0] : undefined;
  return firstKey !== undefined ? map[firstKey] : undefined;
}

function jsonStringify(v: unknown): string {
  if (typeof v === "string") {
    // Already a JSON string — validate it, but pass through.
    try {
      JSON.parse(v);
      return v;
    } catch {
      return JSON.stringify(v);
    }
  }
  if (v === null || v === undefined) {
    return "{}";
  }
  return JSON.stringify(v);
}

// ---------------------------------------------------------------------------
// Version detection
// ---------------------------------------------------------------------------

type EggVersion =
  | "PTDL_v1"
  | "PTDL_v2"
  | "PLCN_v1"
  | "PLCN_v2"
  | "PLCN_v3"
  | "unknown";

function detectVersion(raw: Record<string, unknown>): EggVersion {
  const meta = raw.meta;
  if (isObject(meta) && typeof meta.version === "string") {
    const v = meta.version;
    if (v === "PTDL_v1") {
      return "PTDL_v1";
    }
    if (v === "PTDL_v2") {
      return "PTDL_v2";
    }
    if (v === "PLCN_v1") {
      return "PLCN_v1";
    }
    if (v === "PLCN_v2") {
      return "PLCN_v2";
    }
    if (v === "PLCN_v3") {
      return "PLCN_v3";
    }
  }

  // No recognized version tag — detect by shape.
  if ("image" in raw || "images" in raw) {
    return "PTDL_v1";
  }
  if (typeof raw.startup === "string" && isObject(raw.docker_images)) {
    return "PTDL_v2";
  }
  if (isObject(raw.startup_commands)) {
    return "PLCN_v3";
  }

  return "unknown";
}

// ---------------------------------------------------------------------------
// Conversion stages
// ---------------------------------------------------------------------------

/** PTDL_v1 -> v2: normalize docker images and strip field_type from variables. */
function convertLegacy(egg: Record<string, unknown>): Record<string, unknown> {
  const out = { ...egg };

  // Convert `image` (string) or `images` (string[]) -> docker_images map.
  if (!isObject(out.docker_images)) {
    const images: Record<string, string> = {};

    if (typeof out.image === "string" && out.image) {
      images[out.image] = out.image;
    }

    const rawImages = out.images;
    if (Array.isArray(rawImages)) {
      for (const img of rawImages) {
        const s = str(img);
        if (s) {
          images[s] = s;
        }
      }
    }

    out.docker_images = Object.keys(images).length > 0 ? images : {};
    out.image = undefined;
    out.images = undefined;
  }

  // Strip field_type from variables.
  if (Array.isArray(out.variables)) {
    out.variables = (out.variables as Record<string, unknown>[]).map((v) => {
      if (!isObject(v)) {
        return v;
      }
      const { field_type: _, ...rest } = v;
      return rest;
    });
  }

  return out;
}

/** v2 -> v3: convert startup string to startup_commands map. */
function convertToV3(egg: Record<string, unknown>): Record<string, unknown> {
  const out = { ...egg };

  if (typeof out.startup === "string" && !isObject(out.startup_commands)) {
    out.startup_commands = { Default: out.startup };
    out.startup = undefined;
  }

  return out;
}

/** Apply env-path upgrades to a config.files value. */
function upgradeEnvPaths(configFiles: unknown): unknown {
  if (typeof configFiles === "string") {
    let s = configFiles;
    for (const [oldPath, newPath] of ENV_PATH_REPLACEMENTS) {
      // Use split/join for global replacement without regex escaping headaches.
      s = s.split(oldPath).join(newPath);
    }
    return s;
  }

  if (isObject(configFiles)) {
    // Recursively process object values: the actual path references live in
    // JSON string values within the config.files object.
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(configFiles)) {
      if (typeof val === "string") {
        let s = val;
        for (const [oldPath, newPath] of ENV_PATH_REPLACEMENTS) {
          s = s.split(oldPath).join(newPath);
        }
        out[key] = s;
      } else if (isObject(val)) {
        out[key] = upgradeEnvPaths(val);
      } else {
        out[key] = val;
      }
    }
    return out;
  }

  return configFiles;
}

/** Handle reserved env variable collisions and patch startup references. */
function handleReservedVars(
  variables: Record<string, unknown>[],
  startupCommands: Record<string, string>
): {
  variables: Record<string, unknown>[];
  startupCommands: Record<string, string>;
} {
  const renames: [string, string][] = [];

  const patchedVars = variables.map((v) => {
    if (!isObject(v)) {
      return v;
    }
    const envVar = str(v.env_variable).toUpperCase();
    if (envVar && RESERVED_ENV_VARS.has(envVar)) {
      const newName = `SERVER_${envVar}`;
      renames.push([envVar, newName]);
      return { ...v, env_variable: newName };
    }
    return v;
  });

  const patchedStartup = { ...startupCommands };
  if (renames.length > 0) {
    for (const key of Object.keys(patchedStartup)) {
      let cmd = patchedStartup[key] ?? "";
      for (const [oldName, newName] of renames) {
        cmd = cmd.split(`{{${oldName}}}`).join(`{{${newName}}}`);
      }
      patchedStartup[key] = cmd;
    }
  }

  return { variables: patchedVars, startupCommands: patchedStartup };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function normalizeEgg(raw: unknown): NormalizedEgg {
  if (!isObject(raw)) {
    throw new Error("Unrecognized egg format");
  }

  const version = detectVersion(raw);
  if (version === "unknown") {
    throw new Error("Unrecognized egg format");
  }

  // Run the conversion pipeline.
  let egg: Record<string, unknown> = { ...raw };

  if (version === "PTDL_v1") {
    egg = convertLegacy(egg);
    egg = convertToV3(egg);
  } else if (
    version === "PTDL_v2" ||
    version === "PLCN_v1" ||
    version === "PLCN_v2"
  ) {
    egg = convertToV3(egg);
  }
  // PLCN_v3 is already in the right shape.

  // Apply env-path upgrades to config.files.
  const config = isObject(egg.config) ? egg.config : {};
  const rawConfigFiles = config.files;
  const upgradedConfigFiles = upgradeEnvPaths(rawConfigFiles);

  // Parse startup_commands.
  let startupCommands: Record<string, string> = {};
  if (isObject(egg.startup_commands)) {
    for (const [k, v] of Object.entries(egg.startup_commands)) {
      startupCommands[k] = str(v);
    }
  }

  // Parse variables.
  let variables: Record<string, unknown>[] = [];
  if (Array.isArray(egg.variables)) {
    variables = egg.variables.filter(isObject);
  }

  // Handle reserved env vars.
  const reserved = handleReservedVars(variables, startupCommands);
  variables = reserved.variables;
  startupCommands = reserved.startupCommands;

  // Build docker images map.
  const dockerImages: Record<string, string> = {};
  if (isObject(egg.docker_images)) {
    for (const [k, v] of Object.entries(egg.docker_images)) {
      dockerImages[k] = str(v);
    }
  }

  // Normalize variables.
  const normalizedVars = variables.map((v, idx) => {
    const rawRules = v.rules;
    let rules: string;
    if (Array.isArray(rawRules)) {
      rules = rawRules.map(String).join("|");
    } else {
      rules = str(rawRules);
    }

    let defaultValue: string;
    const dv = v.default_value;
    if (typeof dv === "boolean") {
      defaultValue = dv ? "true" : "false";
    } else {
      defaultValue = str(dv);
    }

    // Strip field_type if still present (belt and suspenders).
    return {
      name: str(v.name),
      description: str(v.description),
      envVariable: str(v.env_variable),
      defaultValue,
      userViewable: bool(v.user_viewable),
      userEditable: bool(v.user_editable),
      rules,
      sortOrder: typeof v.sort === "number" ? v.sort : idx,
    };
  });

  // Extract script fields.
  const scripts = isObject(egg.scripts) ? egg.scripts : {};
  const installation = isObject(scripts.installation)
    ? scripts.installation
    : {};

  // stopCommand: config.stop, then root stop_command, then default.
  const stopCommand = str(config.stop) || str(egg.stop_command) || "stop";

  return {
    name: str(egg.name),
    author: str(egg.author),
    description: str(egg.description),
    dockerImages,
    dockerImage: firstValue(dockerImages) ?? "",
    startup: firstValue(startupCommands) ?? "",
    stopCommand,
    features: strArr(egg.features ?? config.features),
    fileDenylist: strArr(egg.file_denylist),
    tags: Array.isArray(egg.tags) ? egg.tags.map(String) : [],
    configStartup: jsonStringify(config.startup),
    configFiles: jsonStringify(upgradedConfigFiles),
    configLogs: jsonStringify(config.logs),
    scriptInstall: str(installation.script),
    scriptContainer: str(
      installation.container,
      "ghcr.io/pelican-dev/installer:latest"
    ),
    scriptEntry: str(installation.entrypoint, "bash"),
    variables: normalizedVars,
  };
}
