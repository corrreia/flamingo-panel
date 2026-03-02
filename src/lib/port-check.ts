import { and, eq } from "drizzle-orm";
import type { Database } from "../db";
import { schema } from "../db";

/**
 * Get all ports currently in use on a given node by querying servers'
 * defaultAllocationPort and additionalAllocations fields.
 */
export async function getUsedPortsOnNode(
  db: Database,
  nodeId: number
): Promise<Set<number>> {
  const servers = await db
    .select({
      defaultAllocationPort: schema.servers.defaultAllocationPort,
      additionalAllocations: schema.servers.additionalAllocations,
    })
    .from(schema.servers)
    .where(eq(schema.servers.nodeId, nodeId))
    .all();

  const usedPorts = new Set<number>();
  for (const s of servers) {
    usedPorts.add(s.defaultAllocationPort);
    try {
      const extra = JSON.parse(s.additionalAllocations || "[]") as unknown[];
      for (const port of extra) {
        if (typeof port === "number") {
          usedPorts.add(port);
        }
      }
    } catch {
      // invalid JSON — skip
    }
  }
  return usedPorts;
}

/**
 * Check if a specific port is available (not already used) on a node.
 */
export async function isPortAvailableOnNode(
  db: Database,
  nodeId: number,
  port: number
): Promise<boolean> {
  const usedPorts = await getUsedPortsOnNode(db, nodeId);
  return !usedPorts.has(port);
}

/**
 * Check whether the given port falls within one of the user's allocated
 * port ranges for the specified node. If the user has no port allocations
 * at all, any port is allowed (no restrictions).
 */
export async function isPortInUserRange(
  db: Database,
  userId: string,
  nodeId: number,
  port: number
): Promise<{ hasRanges: boolean; allowed: boolean }> {
  const ranges = await db
    .select()
    .from(schema.portAllocations)
    .where(
      and(
        eq(schema.portAllocations.userId, userId),
        eq(schema.portAllocations.nodeId, nodeId)
      )
    )
    .all();

  // No port ranges assigned for this user on this node — allow any port
  if (ranges.length === 0) {
    return { hasRanges: false, allowed: true };
  }

  const allowed = ranges.some((r) => port >= r.startPort && port <= r.endPort);
  return { hasRanges: true, allowed };
}

/**
 * Check if a new port range overlaps with any existing port allocation on the
 * same node (from any user). Returns the conflicting ranges if any.
 */
export async function findOverlappingRanges(
  db: Database,
  nodeId: number,
  startPort: number,
  endPort: number,
  excludeId?: string
): Promise<
  Array<{
    id: string;
    userId: string;
    startPort: number;
    endPort: number;
  }>
> {
  const allRanges = await db
    .select({
      id: schema.portAllocations.id,
      userId: schema.portAllocations.userId,
      startPort: schema.portAllocations.startPort,
      endPort: schema.portAllocations.endPort,
    })
    .from(schema.portAllocations)
    .where(eq(schema.portAllocations.nodeId, nodeId))
    .all();

  return allRanges.filter((r) => {
    if (excludeId && r.id === excludeId) {
      return false;
    }
    // Two ranges overlap if start1 <= end2 AND start2 <= end1
    return startPort <= r.endPort && r.startPort <= endPort;
  });
}
