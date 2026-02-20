import type { Context } from "hono";
import { getDb, schema } from "../db";

export function logActivity(
  c: Context<{ Bindings: Env }>,
  opts: {
    event: string;
    serverId?: string | null;
    nodeId?: number | null;
    metadata?: Record<string, unknown>;
  }
) {
  const user = c.get("user" as never) as { id: string } | undefined;
  const ip =
    c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "";
  const db = getDb(c.env.DB);

  const promise = db
    .insert(schema.activityLogs)
    .values({
      userId: user?.id ?? null,
      serverId: opts.serverId ?? null,
      nodeId: opts.nodeId ?? null,
      event: opts.event,
      metadata: JSON.stringify(opts.metadata ?? {}),
      ip,
    })
    .then(() => undefined)
    .catch(() => undefined);

  // Use waitUntil so the log insert doesn't block the response
  // and survives after the response is sent
  try {
    c.executionCtx.waitUntil(promise);
  } catch {
    // executionCtx may not be available in tests
  }
}
