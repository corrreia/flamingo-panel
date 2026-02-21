import type { schema } from "../db";

type Server = typeof schema.servers.$inferSelect;
type Egg = typeof schema.eggs.$inferSelect;
type EggVariable = typeof schema.eggVariables.$inferSelect;
type ServerVariable = typeof schema.serverVariables.$inferSelect;

/** Parse a JSON string that should be an array. Returns [] if it's an object or invalid. */
function parseJsonArray(raw: string | null): unknown[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Resolve {{server.X.Y}}, {{env.X}} placeholders. {{config.X}} passes through for Wings.
 */
function resolvePlaceholder(
  value: string,
  serverSettings: Record<string, unknown>,
  environment: Record<string, string>
): string {
  return value.replace(/\{\{([^}]+)\}\}/g, (fullMatch, path: string) => {
    if (path.startsWith("config.")) {
      return fullMatch;
    }

    if (path.startsWith("env.")) {
      return environment[path.slice(4)] ?? fullMatch;
    }

    if (path.startsWith("server.")) {
      const parts = path.slice(7).split(".");
      let current: unknown = serverSettings;
      for (const part of parts) {
        if (
          current === null ||
          current === undefined ||
          typeof current !== "object"
        ) {
          return fullMatch;
        }
        current = (current as Record<string, unknown>)[part];
      }
      return current !== null && current !== undefined
        ? String(current)
        : fullMatch;
    }

    return fullMatch;
  });
}

/**
 * Transform egg config_files from Pelican's object format to Wings' array format.
 *
 * Input:  { "server.properties": { "parser": "properties", "find": { "server-port": "{{server.build.default.port}}" } } }
 * Output: [{ "file": "server.properties", "parser": "properties", "replace": [{ "match": "server-port", "replace_with": "25565" }] }]
 */
function transformConfigFiles(
  raw: string | null,
  server: Server,
  environment: Record<string, string>
): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    return [];
  }

  // Already in Wings array format
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return [];
  }

  const configObj = parsed as Record<string, unknown>;
  if (Object.keys(configObj).length === 0) {
    return [];
  }

  const serverSettings: Record<string, unknown> = {
    build: {
      default: {
        ip: server.defaultAllocationIp,
        port: server.defaultAllocationPort,
      },
      env: environment,
    },
  };

  const result: unknown[] = [];
  for (const [file, config] of Object.entries(configObj)) {
    if (typeof config !== "object" || config === null) {
      continue;
    }
    const cfg = config as Record<string, unknown>;

    const replace: unknown[] = [];
    const find = cfg.find as Record<string, unknown> | undefined;
    if (find && typeof find === "object") {
      for (const [match, value] of Object.entries(find)) {
        if (typeof value === "object" && value !== null) {
          const cond = value as Record<string, unknown>;
          replace.push({
            match,
            if_value: resolvePlaceholder(
              String(cond.if_value ?? ""),
              serverSettings,
              environment
            ),
            replace_with: resolvePlaceholder(
              String(cond.replace_with ?? ""),
              serverSettings,
              environment
            ),
          });
        } else {
          replace.push({
            match,
            replace_with: resolvePlaceholder(
              String(value ?? ""),
              serverSettings,
              environment
            ),
          });
        }
      }
    }

    result.push({
      file,
      parser: cfg.parser || "file",
      replace,
    });
  }

  return result;
}

/** Build stop configuration — converts ^C to signal type. */
function buildStopConfig(stopCommand: string | null | undefined): {
  type: string;
  value: string;
} {
  const cmd = stopCommand || "stop";
  if (cmd.startsWith("^")) {
    return { type: "signal", value: cmd.slice(1).toUpperCase() };
  }
  return { type: "command", value: cmd };
}

/**
 * Merge egg variable defaults with server-specific overrides,
 * then add standard env vars (STARTUP, P_SERVER_LOCATION, P_SERVER_UUID).
 */
export function buildServerEnvironment(
  server: Server,
  eggVars: EggVariable[],
  serverVars: ServerVariable[],
  overrides?: Record<string, string>
): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const ev of eggVars) {
    const sv = serverVars.find((s) => s.variableId === ev.id);
    environment[ev.envVariable] =
      overrides?.[ev.envVariable] ?? sv?.variableValue ?? ev.defaultValue ?? "";
  }
  environment.STARTUP = server.startup;
  environment.P_SERVER_LOCATION = "home";
  environment.P_SERVER_UUID = server.uuid;
  return environment;
}

/** Full Wings create/reinstall payload. */
export function buildInstallPayload(
  server: Server,
  egg: Egg,
  environment: Record<string, string>
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
        file_denylist: parseJsonArray(egg.fileDenylist),
        features: parseJsonArray(egg.features),
      },
    },
    process_configuration: {
      startup: (() => {
        let raw: unknown = [];
        try {
          const parsed = JSON.parse(egg.configStartup || "{}");
          raw = parsed.done ?? [];
        } catch {
          // noop
        }
        let done: unknown[] = [];
        if (typeof raw === "string") {
          done = [raw];
        } else if (Array.isArray(raw)) {
          done = raw;
        }
        return { done, user_interaction: [], strip_ansi: false };
      })(),
      stop: buildStopConfig(egg.stopCommand),
      configs: transformConfigFiles(egg.configFiles, server, environment),
    },
  };
}

/** Settings + process_configuration Wings fetches at boot. */
export function buildBootConfig(
  server: Server,
  egg: Egg | null,
  environment: Record<string, string>
) {
  return {
    uuid: server.uuid,
    settings: {
      uuid: server.uuid,
      meta: { name: server.name, description: server.description },
      suspended: server.status === "suspended",
      invocation: server.startup || egg?.startup || "",
      skip_egg_scripts: false,
      environment,
      allocations: {
        force_outgoing_ip: false,
        default: {
          ip: server.defaultAllocationIp,
          port: server.defaultAllocationPort,
        },
        mappings: {
          [server.defaultAllocationIp]: [server.defaultAllocationPort],
        },
      },
      build: {
        memory_limit: server.memory,
        swap: server.swap,
        io_weight: server.io,
        cpu_limit: server.cpu,
        disk_space: server.disk,
        threads: server.threads || "",
        oom_killer: server.oomKiller === 1,
      },
      container: { image: server.image || egg?.dockerImage || "" },
      egg: {
        id: server.eggId || "",
        file_denylist: parseJsonArray(egg?.fileDenylist ?? null),
        features: parseJsonArray(egg?.features ?? null),
      },
      crash_detection_enabled: true,
    },
    process_configuration: {
      startup: (() => {
        let raw: unknown = [];
        try {
          const parsed = JSON.parse(egg?.configStartup || "{}");
          raw = parsed.done ?? [];
        } catch {
          // Invalid JSON — use empty done list
        }
        let done: unknown[] = [];
        if (typeof raw === "string") {
          done = [raw];
        } else if (Array.isArray(raw)) {
          done = raw;
        }
        return {
          done,
          user_interaction: [],
          strip_ansi: false,
        };
      })(),
      stop: buildStopConfig(egg?.stopCommand),
      configs: transformConfigFiles(
        egg?.configFiles ?? null,
        server,
        environment
      ),
    },
  };
}
