import type { ConsoleSession } from "./durable-objects/console-session";

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  CONSOLE_SESSION: DurableObjectNamespace<ConsoleSession>;
  PANEL_URL: string;
  JWT_SECRET: string;
}
