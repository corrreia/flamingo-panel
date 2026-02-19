import { defineConfig } from "drizzle-kit";
import fs from "node:fs";
import path from "node:path";

// Find the local D1 SQLite file created by wrangler/miniflare
function findLocalD1(): string {
  const d1Dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
  if (!fs.existsSync(d1Dir)) {
    return d1Dir + "/placeholder.sqlite"; // will error clearly if missing
  }
  const files = fs.readdirSync(d1Dir).filter(f => f.endsWith(".sqlite"));
  if (files.length === 0) {
    throw new Error("No local D1 database found. Run `bun run db:migrate:dev` first.");
  }
  return path.join(d1Dir, files[0]);
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: findLocalD1(),
  },
});
