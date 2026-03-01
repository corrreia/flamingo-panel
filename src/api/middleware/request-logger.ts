import { createMiddleware } from "hono/factory";
import { createLogger } from "../../lib/logger";

const logger = createLogger("api");

export const requestLogger = createMiddleware(async (c, next) => {
  const requestId = c.req.header("cf-ray") ?? crypto.randomUUID();
  const start = Date.now();

  c.set("requestId", requestId);
  c.header("x-request-id", requestId);

  logger.info("request started", {
    requestId,
    method: c.req.method,
    path: c.req.path,
    userAgent: c.req.header("user-agent"),
    ip: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for"),
  });

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  if (status >= 500) {
    logger.error("request completed", {
      requestId,
      method: c.req.method,
      path: c.req.path,
      status,
      duration,
    });
  } else if (status >= 400) {
    logger.warn("request completed", {
      requestId,
      method: c.req.method,
      path: c.req.path,
      status,
      duration,
    });
  } else {
    logger.info("request completed", {
      requestId,
      method: c.req.method,
      path: c.req.path,
      status,
      duration,
    });
  }
});

export const errorHandler = createMiddleware(async (c, next) => {
  try {
    await next();
  } catch (err) {
    const requestId = c.get("requestId") as string | undefined;
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;

    logger.error("unhandled error", {
      requestId,
      method: c.req.method,
      path: c.req.path,
      error: message,
      stack,
    });

    return c.json({ error: "Internal Server Error" }, 500);
  }
});
