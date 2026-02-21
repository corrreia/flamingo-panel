import { and, eq } from "drizzle-orm";
import { type getDb, schema } from "../db";

export type ServerRole = "admin" | "owner" | "subuser";

export interface ServerAccess {
  role: ServerRole;
  server: typeof schema.servers.$inferSelect;
}

export async function getServerAccess(
  db: ReturnType<typeof getDb>,
  serverId: string,
  user: { id: string; role: string }
): Promise<ServerAccess | null> {
  const server = await db
    .select()
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .get();

  if (!server) {
    return null;
  }

  if (user.role === "admin") {
    return { server, role: "admin" };
  }
  if (server.ownerId === user.id) {
    return { server, role: "owner" };
  }

  const subuser = await db
    .select()
    .from(schema.subusers)
    .where(
      and(
        eq(schema.subusers.serverId, serverId),
        eq(schema.subusers.userId, user.id)
      )
    )
    .get();

  if (subuser) {
    return { server, role: "subuser" };
  }

  return null;
}
