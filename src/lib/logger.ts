import {
  configure,
  getConsoleSink,
  getLogger,
  jsonLinesFormatter,
} from "@logtape/logtape";

let configured = false;

/**
 * Initialize LogTape. Safe to call multiple times — only configures once.
 * Call this at Worker startup (in server.ts fetch handler).
 */
export async function setupLogger() {
  if (configured) {
    return;
  }
  configured = true;

  await configure({
    sinks: {
      console: getConsoleSink({
        formatter: jsonLinesFormatter,
      }),
    },
    loggers: [
      {
        category: ["flamingo"],
        sinks: ["console"],
        lowestLevel: "info",
      },
    ],
  });
}

/**
 * Create a logger for a specific module.
 *
 * Usage:
 *   const logger = createLogger("api", "servers");
 *   logger.info`Server ${serverId} created`;
 *
 * Categories are hierarchical: ["flamingo", "api", "servers"]
 */
export function createLogger(...categories: string[]) {
  return getLogger(["flamingo", ...categories]);
}
