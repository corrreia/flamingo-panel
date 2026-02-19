import { readdirSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "drizzle-kit";

function findLocalD1Url(): string {
  const dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
  const file = readdirSync(dir).find((f) => f.endsWith(".sqlite"));
  if (!file)
    throw new Error("Local D1 not found — run `bun run dev` first.");
  return join(dir, file);
}

export default defineConfig({
  out: "./migrations",
  schema: "./src/db/schema.ts",
  dialect: "sqlite",
  ...(process.env.LOCAL
    ? {
        // Local: point at the wrangler D1 SQLite file for Drizzle Studio
        dbCredentials: { url: findLocalD1Url() },
      }
    : {
        // Production: apply migrations via D1 HTTP API
        driver: "d1-http",
        dbCredentials: {
          accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
          databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID!,
          token: process.env.CLOUDFLARE_API_TOKEN!,
        },
      }),
});
