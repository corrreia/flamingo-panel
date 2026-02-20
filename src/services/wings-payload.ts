import type { schema } from "../db";

type Server = typeof schema.servers.$inferSelect;
type Egg = typeof schema.eggs.$inferSelect;
type EggVariable = typeof schema.eggVariables.$inferSelect;
type ServerVariable = typeof schema.serverVariables.$inferSelect;

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

/** Stringified settings + process_configuration Wings fetches at boot. */
export function buildBootConfig(
  server: Server,
  egg: Egg | null,
  environment: Record<string, string>
) {
  return {
    uuid: server.uuid,
    settings: JSON.stringify({
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
        file_denylist: egg ? JSON.parse(egg.fileDenylist || "[]") : [],
      },
      crash_detection_enabled: true,
    }),
    process_configuration: JSON.stringify({
      startup: {
        done: egg ? JSON.parse(egg.configStartup || "{}").done || [] : [],
        user_interaction: [],
        strip_ansi: false,
      },
      stop: {
        type: "command",
        value: egg?.stopCommand || "stop",
      },
      configs: egg ? JSON.parse(egg.configFiles || "[]") : [],
    }),
  };
}
