# Panel-Side Activity Logging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add activity log inserts to all 21 user-initiated panel actions so admins can audit who did what.

**Architecture:** A small `logActivity` helper in `src/lib/activity.ts` extracts userId and IP from the Hono context and inserts into `activity_logs`. Each API handler calls it after the action succeeds. Fire-and-forget (uses `c.executionCtx.waitUntil` so it doesn't block the response).

**Tech Stack:** Hono, Drizzle ORM, Cloudflare Workers (D1)

---

### Task 1: Create the logActivity helper

**Files:**
- Create: `src/lib/activity.ts`

**Step 1: Create the helper**

```typescript
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
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-forwarded-for") ||
    "";
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
    .then(() => {})
    .catch(() => {});

  // Use waitUntil so the log insert doesn't block the response
  // and survives after the response is sent
  try {
    c.executionCtx.waitUntil(promise);
  } catch {
    // executionCtx may not be available in tests
  }
}
```

**Step 2: Commit**

```bash
git add src/lib/activity.ts
git commit -m "feat: add logActivity helper for panel-side audit logging"
```

---

### Task 2: Wire up server actions (5 log points)

**Files:**
- Modify: `src/api/servers.ts`

**Step 1: Add the import at the top of the file (after existing imports)**

```typescript
import { logActivity } from "../lib/activity";
```

**Step 2: Add log calls to each mutating endpoint**

**POST / (create server)** — add after `return c.json(server, 201)` is about to be called. Insert before the return at line 147:

```typescript
    logActivity(c, { event: "server:create", serverId: server.id, nodeId: data.nodeId, metadata: { name: data.name } });
```

**POST /:id/reinstall** — add before `return c.json({ ok: true })` at line 257:

```typescript
    logActivity(c, { event: "server:reinstall", serverId: server.id, nodeId: server.nodeId });
```

**POST /:id/power** — add before `return c.body(null, 204)` at line 297:

```typescript
    logActivity(c, { event: "server:power", serverId: server.id, nodeId: server.nodeId, metadata: { action } });
```

**POST /:id/command** — add before `return c.body(null, 204)` at line 338:

```typescript
    logActivity(c, { event: "server:command", serverId: server.id, nodeId: server.nodeId, metadata: { command } });
```

**DELETE /:id** — add before `return c.body(null, 204)` at line 443. Note: log BEFORE the delete so serverId is still valid in the DB:

```typescript
    logActivity(c, { event: "server:delete", serverId: server.id, nodeId: server.nodeId, metadata: { name: server.name } });
```

**Step 3: Commit**

```bash
git add src/api/servers.ts
git commit -m "feat: log server create, power, command, reinstall, delete actions"
```

---

### Task 3: Wire up node actions (4 log points)

**Files:**
- Modify: `src/api/nodes.ts`

**Step 1: Add the import**

```typescript
import { logActivity } from "../lib/activity";
```

**Step 2: Add log calls**

**POST / (create node)** — add before `return c.json(...)` at line 94:

```typescript
    logActivity(c, { event: "node:create", nodeId: node.id, metadata: { name: data.name } });
```

**PUT /:id (update node)** — add before `return c.json(node)` at line 130:

```typescript
    logActivity(c, { event: "node:update", nodeId: node.id, metadata: { name: node.name } });
```

**POST /:id/reconfigure** — add before `return c.json(...)` at line 153:

```typescript
    logActivity(c, { event: "node:reconfigure", nodeId: node.id });
```

**DELETE /:id** — add before `return c.body(null, 204)` at line 200. Log before the delete:

```typescript
    logActivity(c, { event: "node:delete", nodeId: nodeId, metadata: { name: "node" } });
```

Note for delete: the node name isn't fetched in the current handler. Fetch it first:

```typescript
    const nodeToDelete = await db.select({ name: schema.nodes.name }).from(schema.nodes).where(eq(schema.nodes.id, nodeId)).get();
    logActivity(c, { event: "node:delete", nodeId: nodeId, metadata: { name: nodeToDelete?.name } });
```

**Step 3: Commit**

```bash
git add src/api/nodes.ts
git commit -m "feat: log node create, update, reconfigure, delete actions"
```

---

### Task 4: Wire up egg actions (4 log points)

**Files:**
- Modify: `src/api/eggs.ts`

**Step 1: Add the import**

```typescript
import { logActivity } from "../lib/activity";
```

**Step 2: Add log calls**

**POST / (create egg)** — add before `return c.json(...)` at line 123:

```typescript
    logActivity(c, { event: "egg:create", metadata: { name: data.name } });
```

**PUT /:id (update egg)** — add before `return c.json(...)` at line 231:

```typescript
    logActivity(c, { event: "egg:update", metadata: { name: egg?.name } });
```

**POST /import** — add before `return c.json(...)` at line 293:

```typescript
    logActivity(c, { event: "egg:import", metadata: { name: normalized.name } });
```

**DELETE /:id** — add before `return c.body(null, 204)` at line 385:

```typescript
    logActivity(c, { event: "egg:delete", metadata: { name: egg.name } });
```

**Step 3: Commit**

```bash
git add src/api/eggs.ts
git commit -m "feat: log egg create, update, import, delete actions"
```

---

### Task 5: Wire up file actions (7 log points)

**Files:**
- Modify: `src/api/files.ts`

**Step 1: Add the import**

```typescript
import { logActivity } from "../lib/activity";
```

**Step 2: Add log calls to each file operation**

Each file handler uses `getServerAndClient(c)` which returns `{ server, client }`. Use `result.server.id` and `result.server.nodeId` for context.

**POST /:serverId/files/write** — add before `return c.body(null, 204)` at line 88:

```typescript
  logActivity(c, { event: "file:write", serverId: result.server.id, nodeId: result.server.nodeId, metadata: { file } });
```

**PUT /:serverId/files/rename** — add before `return c.body(null, 204)` at line 108:

```typescript
    logActivity(c, { event: "file:rename", serverId: result.server.id, nodeId: result.server.nodeId, metadata: { root, files } });
```

**POST /:serverId/files/copy** — add before `return c.body(null, 204)` at line 130:

```typescript
    logActivity(c, { event: "file:copy", serverId: result.server.id, nodeId: result.server.nodeId, metadata: { location: c.req.valid("json").location } });
```

**POST /:serverId/files/delete** — add before `return c.body(null, 204)` at line 151:

```typescript
    logActivity(c, { event: "file:delete", serverId: result.server.id, nodeId: result.server.nodeId, metadata: { root, files } });
```

**POST /:serverId/files/create-directory** — add before `return c.body(null, 204)` at line 172:

```typescript
    logActivity(c, { event: "file:create-directory", serverId: result.server.id, nodeId: result.server.nodeId, metadata: { name, path } });
```

**POST /:serverId/files/compress** — add before `return c.json(stat)` at line 197:

```typescript
    logActivity(c, { event: "file:compress", serverId: result.server.id, nodeId: result.server.nodeId, metadata: { root, files } });
```

**POST /:serverId/files/decompress** — add before `return c.body(null, 204)` at line 218:

```typescript
    logActivity(c, { event: "file:decompress", serverId: result.server.id, nodeId: result.server.nodeId, metadata: { root, file } });
```

**Step 3: Commit**

```bash
git add src/api/files.ts
git commit -m "feat: log file write, rename, copy, delete, mkdir, compress, decompress actions"
```

---

### Task 6: Wire up API key creation (1 log point)

**Files:**
- Modify: `src/api/index.ts`

**Step 1: Add the import**

```typescript
import { logActivity } from "../lib/activity";
```

**Step 2: Add log call in POST /api-keys**

Add before `return c.json(...)` at line 137:

```typescript
  logActivity(c, { event: "api-key:create", metadata: { memo: body.memo } });
```

**Step 3: Commit**

```bash
git add src/api/index.ts
git commit -m "feat: log API key creation"
```
