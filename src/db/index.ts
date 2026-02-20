import { drizzle } from "drizzle-orm/d1";
// biome-ignore lint/style/noExportedImports: schema is used both locally and re-exported as a convenience
import * as schema from "./schema";

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Database = ReturnType<typeof getDb>;
export { schema };
