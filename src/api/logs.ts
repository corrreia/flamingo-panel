import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { createLogger } from "../lib/logger";

const logger = createLogger("client");

const logSchema = z.object({
  level: z.enum(["error", "warn", "info"]),
  event: z.string().max(100),
  url: z.string().max(2000),
  error: z
    .object({
      message: z.string().max(2000),
      stack: z.string().max(5000).optional(),
      filename: z.string().max(500).optional(),
      lineno: z.number().optional(),
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const logRoutes = new Hono<{ Bindings: Env }>();

logRoutes.post("/", zValidator("json", logSchema), (c) => {
  const body = c.req.valid("json");

  logger[body.level](body.event, {
    source: "client",
    url: body.url,
    error: body.error,
    metadata: body.metadata,
    userAgent: c.req.header("user-agent"),
    ip: c.req.header("cf-connecting-ip"),
  });

  return c.json({ ok: true });
});
