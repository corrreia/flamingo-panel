const LOG_ENDPOINT = "/api/logs";

interface ClientLogEntry {
  error?: {
    message: string;
    stack?: string;
    filename?: string;
    lineno?: number;
  };
  event: string;
  level: "error" | "warn" | "info";
  metadata?: Record<string, unknown>;
  url: string;
}

function send(entry: ClientLogEntry) {
  try {
    const body = JSON.stringify(entry);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(LOG_ENDPOINT, body);
    } else {
      fetch(LOG_ENDPOINT, {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      });
    }
  } catch {
    // Logging should never throw
  }
}

/**
 * Call once in the app root to capture unhandled errors and rejections.
 */
export function initClientErrorCapture() {
  window.addEventListener("error", (event) => {
    send({
      level: "error",
      event: "window.error",
      url: window.location.href,
      error: {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        stack: event.error?.stack,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    send({
      level: "error",
      event: "unhandled.rejection",
      url: window.location.href,
      error: {
        message:
          event.reason instanceof Error
            ? event.reason.message
            : String(event.reason),
        stack: event.reason instanceof Error ? event.reason.stack : undefined,
      },
    });
  });
}

/**
 * Log a client-side event manually (for API errors, etc.)
 */
export function logClientError(
  event: string,
  error: Error,
  metadata?: Record<string, unknown>
) {
  send({
    level: "error",
    event,
    url: window.location.href,
    error: { message: error.message, stack: error.stack },
    metadata,
  });
}
