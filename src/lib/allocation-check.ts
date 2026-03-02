import { eq, sql } from "drizzle-orm";
import type { Database } from "../db";
import { schema } from "../db";

interface AllocationCheckResult {
  allowed: boolean;
  overprovisioned: boolean;
  violations: string[];
}

/**
 * Check whether creating a server with the given resources would exceed the
 * user's allocation limits. Returns whether the action is allowed and any
 * violations found.
 */
export async function checkUserAllocations(
  db: Database,
  userId: string,
  requested: { cpu: number; memory: number; disk: number }
): Promise<AllocationCheckResult> {
  const allocation = await db
    .select()
    .from(schema.userAllocations)
    .where(eq(schema.userAllocations.userId, userId))
    .get();

  // No allocation row means no limits are set — always allowed
  if (!allocation) {
    return { allowed: true, overprovisioned: false, violations: [] };
  }

  const usage = await db
    .select({
      serverCount: sql<number>`count(*)`,
      cpuUsed: sql<number>`coalesce(sum(${schema.servers.cpu}), 0)`,
      memoryUsed: sql<number>`coalesce(sum(${schema.servers.memory}), 0)`,
      diskUsed: sql<number>`coalesce(sum(${schema.servers.disk}), 0)`,
    })
    .from(schema.servers)
    .where(eq(schema.servers.ownerId, userId))
    .get();

  const violations: string[] = [];
  const currentServers = usage?.serverCount ?? 0;
  const currentCpu = usage?.cpuUsed ?? 0;
  const currentMemory = usage?.memoryUsed ?? 0;
  const currentDisk = usage?.diskUsed ?? 0;

  if (allocation.servers > 0 && currentServers + 1 > allocation.servers) {
    violations.push(
      `Server limit exceeded (${currentServers}/${allocation.servers})`
    );
  }
  if (
    allocation.cpu > 0 &&
    currentCpu + requested.cpu > allocation.cpu
  ) {
    violations.push(
      `CPU limit exceeded (${currentCpu + requested.cpu}% / ${allocation.cpu}% allowed)`
    );
  }
  if (
    allocation.memory > 0 &&
    currentMemory + requested.memory > allocation.memory
  ) {
    violations.push(
      `Memory limit exceeded (${currentMemory + requested.memory} MB / ${allocation.memory} MB allowed)`
    );
  }
  if (
    allocation.disk > 0 &&
    currentDisk + requested.disk > allocation.disk
  ) {
    violations.push(
      `Disk limit exceeded (${currentDisk + requested.disk} MB / ${allocation.disk} MB allowed)`
    );
  }

  if (violations.length === 0) {
    return { allowed: true, overprovisioned: false, violations: [] };
  }

  // If overprovisioning is allowed, permit the action but flag it
  if (allocation.allowOverprovision === 1) {
    return { allowed: true, overprovisioned: true, violations };
  }

  return { allowed: false, overprovisioned: false, violations };
}
