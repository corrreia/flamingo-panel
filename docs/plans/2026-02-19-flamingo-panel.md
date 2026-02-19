# Flamingo Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Cloudflare-native game server management panel that replaces Pelican Panel while reusing existing Pelican Wings nodes as the backend daemon.

**Architecture:** Single Cloudflare Worker serving both a Hono REST API and a React SPA frontend via Workers Assets. D1 for persistence, KV for sessions/cache, Durable Objects for WebSocket proxying to Wings nodes, R2 for file staging, and Queues for background jobs. The Panel communicates with Wings nodes over HTTPS using Wings' existing Bearer token auth and JWT-signed WebSocket connections.

**Tech Stack:** Hono.js (API), React 18 + TanStack Router + TanStack Query (frontend), TailwindCSS + shadcn/ui (UI), Vite (build), Cloudflare D1/KV/R2/Durable Objects/Queues (infra), Zod (validation), jose (JWT), Drizzle ORM (D1 queries)

---

## Phase 0: Project Scaffolding

### Task 0.1: Initialize monorepo with Hono + Vite + React

**Files:**
- Create: `flamingo-panel/package.json`
- Create: `flamingo-panel/wrangler.toml`
- Create: `flamingo-panel/tsconfig.json`
- Create: `flamingo-panel/src/index.ts` (Worker entry)
- Create: `flamingo-panel/src/web/index.html`
- Create: `flamingo-panel/src/web/main.tsx`
- Create: `flamingo-panel/src/web/App.tsx`
- Create: `flamingo-panel/vite.config.ts`

**Step 1: Initialize package.json**

```bash
cd flamingo-panel && npm init -y
```

**Step 2: Install core dependencies**

```bash
npm install hono @hono/zod-validator zod drizzle-orm jose
npm install -D wrangler @cloudflare/workers-types typescript vite @vitejs/plugin-react react react-dom @types/react @types/react-dom tailwindcss @tailwindcss/vite @tanstack/react-router @tanstack/react-query
```

**Step 3: Create wrangler.toml**

```toml
name = "flamingo-panel"
main = "src/index.ts"
compatibility_date = "2025-12-01"
assets = { directory = "./dist/web" }

[vars]
PANEL_URL = "https://your-flamingo.example.com"

[[d1_databases]]
binding = "DB"
database_name = "flamingo-db"
database_id = "local"

[[kv_namespaces]]
binding = "KV"
id = "local"

[[r2_buckets]]
binding = "R2"
bucket_name = "flamingo-files"

[[durable_objects.bindings]]
name = "CONSOLE_SESSION"
class_name = "ConsoleSession"

[[migrations]]
tag = "v1"
new_classes = ["ConsoleSession"]
```

**Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "paths": {
      "@/*": ["./src/*"],
      "@web/*": ["./src/web/*"],
      "@api/*": ["./src/api/*"]
    },
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 5: Create Worker entry point `src/index.ts`**

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env";
import { apiRoutes } from "./api";

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", cors());
app.route("/api", apiRoutes);

export default app;
export { ConsoleSession } from "./durable-objects/console-session";
```

**Step 6: Create `src/env.ts` (shared Cloudflare bindings type)**

```typescript
export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  CONSOLE_SESSION: DurableObjectNamespace;
  PANEL_URL: string;
  JWT_SECRET: string;
}
```

**Step 7: Create `src/api/index.ts` (stub)**

```typescript
import { Hono } from "hono";
import type { Env } from "../env";

export const apiRoutes = new Hono<{ Bindings: Env }>();

apiRoutes.get("/health", (c) => c.json({ status: "ok", version: "0.1.0" }));
```

**Step 8: Create Vite config for React frontend**

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: "src/web",
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@web": path.resolve(__dirname, "src/web"),
    },
  },
});
```

**Step 9: Create minimal React app**

`src/web/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Flamingo Panel</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/main.tsx"></script>
</body>
</html>
```

`src/web/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

`src/web/App.tsx`:
```tsx
export function App() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
      <h1 className="text-4xl font-bold">Flamingo Panel</h1>
    </div>
  );
}
```

`src/web/index.css`:
```css
@import "tailwindcss";
```

**Step 10: Add scripts to package.json and verify build**

Add to `package.json` scripts:
```json
{
  "scripts": {
    "dev": "wrangler dev",
    "dev:web": "vite dev --config vite.config.ts",
    "build:web": "vite build --config vite.config.ts",
    "build": "npm run build:web",
    "deploy": "npm run build && wrangler deploy",
    "db:migrate": "wrangler d1 migrations apply flamingo-db --local",
    "test": "vitest"
  }
}
```

Run: `npm run build:web`
Expected: Vite builds to `dist/web/` successfully.

**Step 11: Commit**

```bash
git init && git add -A && git commit -m "chore: scaffold flamingo-panel with Hono + Vite + React + Cloudflare Workers"
```

---

## Phase 1: Database Schema & Auth

### Task 1.1: Create D1 database schema

**Files:**
- Create: `src/db/schema.ts` (Drizzle schema)
- Create: `migrations/0001_initial.sql`

**Step 1: Write the D1 migration SQL**

```sql
-- migrations/0001_initial.sql

-- Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Nodes (Wings instances)
CREATE TABLE nodes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  fqdn TEXT NOT NULL,
  scheme TEXT NOT NULL DEFAULT 'https' CHECK (scheme IN ('http', 'https')),
  daemon_port INTEGER NOT NULL DEFAULT 8080,
  daemon_sftp_port INTEGER NOT NULL DEFAULT 2022,
  token_id TEXT NOT NULL,
  token TEXT NOT NULL,
  memory INTEGER NOT NULL DEFAULT 0,
  memory_overallocate INTEGER NOT NULL DEFAULT 0,
  disk INTEGER NOT NULL DEFAULT 0,
  disk_overallocate INTEGER NOT NULL DEFAULT 0,
  upload_size INTEGER NOT NULL DEFAULT 100,
  behind_proxy INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Servers
CREATE TABLE servers (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  node_id TEXT NOT NULL REFERENCES nodes(id),
  owner_id TEXT NOT NULL REFERENCES users(id),
  egg_id TEXT REFERENCES eggs(id),
  memory INTEGER NOT NULL DEFAULT 512,
  disk INTEGER NOT NULL DEFAULT 1024,
  cpu INTEGER NOT NULL DEFAULT 100,
  swap INTEGER NOT NULL DEFAULT 0,
  io INTEGER NOT NULL DEFAULT 500,
  threads TEXT DEFAULT NULL,
  oom_killer INTEGER NOT NULL DEFAULT 1,
  startup TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  default_allocation_ip TEXT NOT NULL DEFAULT '0.0.0.0',
  default_allocation_port INTEGER NOT NULL DEFAULT 25565,
  additional_allocations TEXT DEFAULT '[]',
  status TEXT DEFAULT NULL CHECK (status IN (NULL, 'installing', 'install_failed', 'reinstall_failed', 'suspended', 'restoring_backup', 'transferring')),
  installed_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Eggs (game/service templates)
CREATE TABLE eggs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  docker_image TEXT NOT NULL DEFAULT '',
  startup TEXT NOT NULL DEFAULT '',
  stop_command TEXT NOT NULL DEFAULT 'stop',
  stop_signal TEXT NOT NULL DEFAULT 'SIGTERM',
  config_startup TEXT DEFAULT '{}',
  config_files TEXT DEFAULT '[]',
  config_logs TEXT DEFAULT '{}',
  script_install TEXT DEFAULT '',
  script_container TEXT DEFAULT 'ghcr.io/pelican-dev/installer:latest',
  script_entry TEXT DEFAULT 'bash',
  file_denylist TEXT DEFAULT '[]',
  features TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Egg variables
CREATE TABLE egg_variables (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  egg_id TEXT NOT NULL REFERENCES eggs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  env_variable TEXT NOT NULL,
  default_value TEXT DEFAULT '',
  user_viewable INTEGER NOT NULL DEFAULT 0,
  user_editable INTEGER NOT NULL DEFAULT 0,
  rules TEXT NOT NULL DEFAULT 'required|string',
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Server variables (overrides for egg defaults)
CREATE TABLE server_variables (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  variable_id TEXT NOT NULL REFERENCES egg_variables(id) ON DELETE CASCADE,
  variable_value TEXT NOT NULL DEFAULT '',
  UNIQUE(server_id, variable_id)
);

-- API keys for remote access
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  identifier TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  memo TEXT DEFAULT '',
  allowed_ips TEXT DEFAULT '[]',
  last_used_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Server subusers
CREATE TABLE subusers (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  permissions TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, server_id)
);

-- Activity logs
CREATE TABLE activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  server_id TEXT REFERENCES servers(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  ip TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX idx_servers_node ON servers(node_id);
CREATE INDEX idx_servers_owner ON servers(owner_id);
CREATE INDEX idx_servers_uuid ON servers(uuid);
CREATE INDEX idx_activity_server ON activity_logs(server_id);
CREATE INDEX idx_activity_user ON activity_logs(user_id);
CREATE INDEX idx_egg_variables_egg ON egg_variables(egg_id);
CREATE INDEX idx_server_variables_server ON server_variables(server_id);
CREATE INDEX idx_subusers_user ON subusers(user_id);
CREATE INDEX idx_subusers_server ON subusers(server_id);
```

**Step 2: Write Drizzle schema `src/db/schema.ts`**

```typescript
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const timestamps = {
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
};

export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "user"] }).notNull().default("user"),
  ...timestamps,
});

export const nodes = sqliteTable("nodes", {
  id: id(),
  name: text("name").notNull(),
  fqdn: text("fqdn").notNull(),
  scheme: text("scheme", { enum: ["http", "https"] }).notNull().default("https"),
  daemonPort: integer("daemon_port").notNull().default(8080),
  daemonSftpPort: integer("daemon_sftp_port").notNull().default(2022),
  tokenId: text("token_id").notNull(),
  token: text("token").notNull(),
  memory: integer("memory").notNull().default(0),
  memoryOverallocate: integer("memory_overallocate").notNull().default(0),
  disk: integer("disk").notNull().default(0),
  diskOverallocate: integer("disk_overallocate").notNull().default(0),
  uploadSize: integer("upload_size").notNull().default(100),
  behindProxy: integer("behind_proxy").notNull().default(0),
  ...timestamps,
});

export const eggs = sqliteTable("eggs", {
  id: id(),
  name: text("name").notNull(),
  description: text("description").default(""),
  dockerImage: text("docker_image").notNull().default(""),
  startup: text("startup").notNull().default(""),
  stopCommand: text("stop_command").notNull().default("stop"),
  stopSignal: text("stop_signal").notNull().default("SIGTERM"),
  configStartup: text("config_startup").default("{}"),
  configFiles: text("config_files").default("[]"),
  configLogs: text("config_logs").default("{}"),
  scriptInstall: text("script_install").default(""),
  scriptContainer: text("script_container").default("ghcr.io/pelican-dev/installer:latest"),
  scriptEntry: text("script_entry").default("bash"),
  fileDenylist: text("file_denylist").default("[]"),
  features: text("features").default("{}"),
  ...timestamps,
});

export const servers = sqliteTable("servers", {
  id: id(),
  uuid: text("uuid").notNull().unique().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description").default(""),
  nodeId: text("node_id").notNull().references(() => nodes.id),
  ownerId: text("owner_id").notNull().references(() => users.id),
  eggId: text("egg_id").references(() => eggs.id),
  memory: integer("memory").notNull().default(512),
  disk: integer("disk").notNull().default(1024),
  cpu: integer("cpu").notNull().default(100),
  swap: integer("swap").notNull().default(0),
  io: integer("io").notNull().default(500),
  threads: text("threads"),
  oomKiller: integer("oom_killer").notNull().default(1),
  startup: text("startup").notNull().default(""),
  image: text("image").notNull().default(""),
  defaultAllocationIp: text("default_allocation_ip").notNull().default("0.0.0.0"),
  defaultAllocationPort: integer("default_allocation_port").notNull().default(25565),
  additionalAllocations: text("additional_allocations").default("[]"),
  status: text("status"),
  installedAt: text("installed_at"),
  ...timestamps,
}, (table) => [
  index("idx_servers_node").on(table.nodeId),
  index("idx_servers_owner").on(table.ownerId),
]);

export const eggVariables = sqliteTable("egg_variables", {
  id: id(),
  eggId: text("egg_id").notNull().references(() => eggs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").default(""),
  envVariable: text("env_variable").notNull(),
  defaultValue: text("default_value").default(""),
  userViewable: integer("user_viewable").notNull().default(0),
  userEditable: integer("user_editable").notNull().default(0),
  rules: text("rules").notNull().default("required|string"),
  sortOrder: integer("sort_order").notNull().default(0),
}, (table) => [
  index("idx_egg_variables_egg").on(table.eggId),
]);

export const serverVariables = sqliteTable("server_variables", {
  id: id(),
  serverId: text("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
  variableId: text("variable_id").notNull().references(() => eggVariables.id, { onDelete: "cascade" }),
  variableValue: text("variable_value").notNull().default(""),
}, (table) => [
  index("idx_server_variables_server").on(table.serverId),
  uniqueIndex("idx_sv_unique").on(table.serverId, table.variableId),
]);

export const subusers = sqliteTable("subusers", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  serverId: text("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
  permissions: text("permissions").notNull().default("[]"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  uniqueIndex("idx_su_unique").on(table.userId, table.serverId),
]);

export const apiKeys = sqliteTable("api_keys", {
  id: id(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  identifier: text("identifier").notNull().unique(),
  tokenHash: text("token_hash").notNull(),
  memo: text("memo").default(""),
  allowedIps: text("allowed_ips").default("[]"),
  lastUsedAt: text("last_used_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const activityLogs = sqliteTable("activity_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  serverId: text("server_id").references(() => servers.id, { onDelete: "cascade" }),
  event: text("event").notNull(),
  metadata: text("metadata").default("{}"),
  ip: text("ip").default(""),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index("idx_activity_server").on(table.serverId),
  index("idx_activity_user").on(table.userId),
]);
```

**Step 3: Create DB helper `src/db/index.ts`**

```typescript
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Database = ReturnType<typeof getDb>;
export { schema };
```

**Step 4: Apply migration locally**

Run: `cd flamingo-panel && npx wrangler d1 migrations apply flamingo-db --local`
Expected: Migration applies successfully.

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: add D1 database schema with Drizzle ORM"
```

---

### Task 1.2: Authentication system (JWT + password hashing)

**Files:**
- Create: `src/api/auth.ts`
- Create: `src/lib/auth.ts` (JWT + password utilities)
- Modify: `src/api/index.ts` (mount auth routes)

**Step 1: Create auth utility library `src/lib/auth.ts`**

```typescript
import { SignJWT, jwtVerify } from "jose";

const encoder = new TextEncoder();

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key,
    256
  );
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
  const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(h => parseInt(h, 16)));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key,
    256
  );
  const computed = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  return computed === hashHex;
}

export async function createToken(payload: Record<string, unknown>, secret: string): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(encoder.encode(secret));
}

export async function verifyToken(token: string, secret: string) {
  const { payload } = await jwtVerify(token, encoder.encode(secret));
  return payload;
}
```

**Step 2: Create auth routes `src/api/auth.ts`**

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { getDb, schema } from "../db";
import { hashPassword, verifyPassword, createToken } from "../lib/auth";

export const authRoutes = new Hono<{ Bindings: Env }>();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = loginSchema.extend({
  username: z.string().min(3).max(32),
});

authRoutes.post("/login", zValidator("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");
  const db = getDb(c.env.DB);

  const user = await db.select().from(schema.users).where(eq(schema.users.email, email)).get();
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return c.json({ error: "Invalid credentials" }, 401);
  }

  const token = await createToken(
    { sub: user.id, email: user.email, role: user.role },
    c.env.JWT_SECRET
  );

  return c.json({ token, user: { id: user.id, email: user.email, username: user.username, role: user.role } });
});

authRoutes.post("/register", zValidator("json", registerSchema), async (c) => {
  const { email, username, password } = c.req.valid("json");
  const db = getDb(c.env.DB);

  const existing = await db.select().from(schema.users).where(eq(schema.users.email, email)).get();
  if (existing) {
    return c.json({ error: "Email already registered" }, 409);
  }

  const passwordHash = await hashPassword(password);

  // First user becomes admin
  const count = await db.select().from(schema.users).all();
  const role = count.length === 0 ? "admin" : "user";

  const user = await db.insert(schema.users).values({
    email,
    username,
    passwordHash,
    role,
  }).returning().get();

  const token = await createToken(
    { sub: user.id, email: user.email, role: user.role },
    c.env.JWT_SECRET
  );

  return c.json({ token, user: { id: user.id, email: user.email, username: user.username, role: user.role } }, 201);
});
```

**Step 3: Create auth middleware `src/api/middleware/auth.ts`**

```typescript
import { createMiddleware } from "hono/factory";
import type { Env } from "../../env";
import { verifyToken } from "../../lib/auth";

export type AuthUser = {
  id: string;
  email: string;
  role: "admin" | "user";
};

export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: { user: AuthUser };
}>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const payload = await verifyToken(header.slice(7), c.env.JWT_SECRET);
    c.set("user", {
      id: payload.sub as string,
      email: payload.email as string,
      role: payload.role as "admin" | "user",
    });
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
});

export const requireAdmin = createMiddleware<{
  Bindings: Env;
  Variables: { user: AuthUser };
}>(async (c, next) => {
  const user = c.get("user");
  if (user.role !== "admin") {
    return c.json({ error: "Forbidden: admin access required" }, 403);
  }
  await next();
});
```

**Step 4: Mount auth routes in `src/api/index.ts`**

```typescript
import { Hono } from "hono";
import type { Env } from "../env";
import { authRoutes } from "./auth";

export const apiRoutes = new Hono<{ Bindings: Env }>();

apiRoutes.get("/health", (c) => c.json({ status: "ok", version: "0.1.0" }));
apiRoutes.route("/auth", authRoutes);
```

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: add JWT auth system with login/register endpoints"
```

---

## Phase 2: Wings Communication Layer

### Task 2.1: Wings HTTP client

**Files:**
- Create: `src/lib/wings-client.ts`

This is the core component: a typed HTTP client that speaks to Wings nodes using the same Bearer token auth mechanism Wings expects.

**Step 1: Create Wings client `src/lib/wings-client.ts`**

```typescript
interface WingsNode {
  fqdn: string;
  scheme: "http" | "https";
  daemonPort: number;
  tokenId: string;
  token: string;
}

export class WingsClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(node: WingsNode) {
    this.baseUrl = `${node.scheme}://${node.fqdn}:${node.daemonPort}`;
    this.authHeader = `Bearer ${node.token}`;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Authorization": this.authHeader,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const error = await res.text();
      throw new WingsError(res.status, error);
    }

    if (res.status === 204 || res.status === 202) {
      return undefined as T;
    }

    return res.json();
  }

  // System endpoints
  async getSystemInfo() {
    return this.request<SystemInfo>("GET", "/api/system?v=2");
  }

  async getSystemUtilization() {
    return this.request<SystemUtilization>("GET", "/api/system/utilization");
  }

  async getSystemIps() {
    return this.request<{ ip_addresses: string[] }>("GET", "/api/system/ips");
  }

  // Server management
  async listServers() {
    return this.request<ServerApiResponse[]>("GET", "/api/servers");
  }

  async getServer(uuid: string) {
    return this.request<ServerApiResponse>("GET", `/api/servers/${uuid}`);
  }

  async createServer(details: CreateServerRequest) {
    return this.request<void>("POST", "/api/servers", details);
  }

  async deleteServer(uuid: string) {
    return this.request<void>("DELETE", `/api/servers/${uuid}`);
  }

  async syncServer(uuid: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/sync`);
  }

  // Power management
  async powerAction(uuid: string, action: "start" | "stop" | "restart" | "kill") {
    return this.request<void>("POST", `/api/servers/${uuid}/power`, { action });
  }

  async sendCommand(uuid: string, commands: string[]) {
    return this.request<void>("POST", `/api/servers/${uuid}/commands`, { commands });
  }

  // Server logs
  async getServerLogs(uuid: string, size = 100) {
    return this.request<{ data: string[] }>("GET", `/api/servers/${uuid}/logs?size=${size}`);
  }

  // File management
  async listDirectory(uuid: string, directory: string) {
    return this.request<FileStat[]>("GET", `/api/servers/${uuid}/files/list-directory?directory=${encodeURIComponent(directory)}`);
  }

  async getFileContents(uuid: string, file: string) {
    const res = await fetch(`${this.baseUrl}/api/servers/${uuid}/files/contents?file=${encodeURIComponent(file)}`, {
      headers: { Authorization: this.authHeader },
    });
    if (!res.ok) throw new WingsError(res.status, await res.text());
    return res;
  }

  async writeFile(uuid: string, file: string, content: string | ReadableStream) {
    const res = await fetch(`${this.baseUrl}/api/servers/${uuid}/files/write?file=${encodeURIComponent(file)}`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/octet-stream",
      },
      body: content,
    });
    if (!res.ok) throw new WingsError(res.status, await res.text());
  }

  async renameFiles(uuid: string, root: string, files: Array<{ from: string; to: string }>) {
    return this.request<void>("PUT", `/api/servers/${uuid}/files/rename`, { root, files });
  }

  async copyFile(uuid: string, location: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/files/copy`, { location });
  }

  async deleteFiles(uuid: string, root: string, files: string[]) {
    return this.request<void>("POST", `/api/servers/${uuid}/files/delete`, { root, files });
  }

  async createDirectory(uuid: string, name: string, path: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/files/create-directory`, { name, path });
  }

  async compressFiles(uuid: string, root: string, files: string[], name?: string, extension?: string) {
    return this.request<FileStat>("POST", `/api/servers/${uuid}/files/compress`, { root, files, name, extension });
  }

  async decompressFile(uuid: string, root: string, file: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/files/decompress`, { root, file });
  }

  async chmodFiles(uuid: string, root: string, files: Array<{ file: string; mode: string }>) {
    return this.request<void>("POST", `/api/servers/${uuid}/files/chmod`, { root, files });
  }

  // Backups
  async createBackup(uuid: string, backupUuid: string, adapter: "wings" | "s3", ignore: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/backup`, { uuid: backupUuid, adapter, ignore });
  }

  async deleteBackup(uuid: string, backupUuid: string) {
    return this.request<void>("DELETE", `/api/servers/${uuid}/backup/${backupUuid}`);
  }

  async restoreBackup(uuid: string, backupUuid: string, adapter: "wings" | "s3", truncateDirectory: boolean, downloadUrl?: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/backup/${backupUuid}/restore`, {
      adapter, truncate_directory: truncateDirectory, download_url: downloadUrl,
    });
  }

  // Installation
  async installServer(uuid: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/install`);
  }

  async reinstallServer(uuid: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/reinstall`);
  }
}

export class WingsError extends Error {
  constructor(public status: number, message: string) {
    super(`Wings error (${status}): ${message}`);
  }
}

// Types matching Wings API responses
export interface SystemInfo {
  architecture: string;
  cpu_count: number;
  kernel_version: string;
  os: string;
  version: string;
}

export interface SystemUtilization {
  memory_total: number;
  memory_used: number;
  cpu_usage: number;
  disk_total: number;
  disk_used: number;
}

export interface ServerApiResponse {
  state: string;
  is_suspended: boolean;
  utilization: {
    memory_bytes: number;
    memory_limit_bytes: number;
    cpu_absolute: number;
    network: { rx_bytes: number; tx_bytes: number };
    uptime: number;
    disk_bytes: number;
    state: string;
  };
  configuration: Record<string, unknown>;
}

export interface FileStat {
  name: string;
  created: string;
  modified: string;
  mode: string;
  mode_bits: string;
  size: number;
  directory: boolean;
  file: boolean;
  symlink: boolean;
  mime: string;
}

export interface CreateServerRequest {
  uuid: string;
  start_on_completion: boolean;
  [key: string]: unknown;
}
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: add typed Wings HTTP client for Panel-to-Wings communication"
```

---

### Task 2.2: WebSocket JWT signing for Wings console

**Files:**
- Create: `src/lib/wings-jwt.ts`

Wings expects WebSocket clients to authenticate by sending a JWT as the first message. The Panel signs these JWTs using the node's token as the HMAC key.

**Step 1: Create Wings JWT signer `src/lib/wings-jwt.ts`**

```typescript
import { SignJWT } from "jose";

const encoder = new TextEncoder();

export interface WebsocketTokenPayload {
  user_uuid: string;
  server_uuid: string;
  permissions: string[];
}

export async function signWingsWebsocketToken(
  payload: WebsocketTokenPayload,
  nodeToken: string,
  expiresInSeconds = 600,
): Promise<string> {
  return new SignJWT({
    user_uuid: payload.user_uuid,
    server_uuid: payload.server_uuid,
    permissions: payload.permissions,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .setJti(crypto.randomUUID())
    .sign(encoder.encode(nodeToken));
}

// Permission constants matching Wings expectations
export const WS_PERMISSIONS = {
  CONNECT: "websocket.connect",
  SEND_COMMAND: "control.console",
  POWER_START: "control.start",
  POWER_STOP: "control.stop",
  POWER_RESTART: "control.restart",
  ADMIN_ERRORS: "admin.websocket.errors",
  ADMIN_INSTALL: "admin.websocket.install",
  ADMIN_TRANSFER: "admin.websocket.transfer",
  BACKUP_READ: "backup.read",
} as const;
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: add Wings WebSocket JWT signer for console auth"
```

---

## Phase 3: Node & Server Management API

### Task 3.1: Node CRUD API

**Files:**
- Create: `src/api/nodes.ts`
- Modify: `src/api/index.ts`

**Step 1: Create node routes `src/api/nodes.ts`**

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { getDb, schema } from "../db";
import { requireAuth, requireAdmin } from "./middleware/auth";
import { WingsClient } from "../lib/wings-client";

export const nodeRoutes = new Hono<{ Bindings: Env }>();

nodeRoutes.use("*", requireAuth);

const createNodeSchema = z.object({
  name: z.string().min(1).max(255),
  fqdn: z.string().min(1),
  scheme: z.enum(["http", "https"]).default("https"),
  daemonPort: z.number().int().min(1).max(65535).default(8080),
  daemonSftpPort: z.number().int().min(1).max(65535).default(2022),
  tokenId: z.string().min(1),
  token: z.string().min(1),
  memory: z.number().int().min(0).default(0),
  memoryOverallocate: z.number().int().default(0),
  disk: z.number().int().min(0).default(0),
  diskOverallocate: z.number().int().default(0),
});

// List all nodes
nodeRoutes.get("/", requireAdmin, async (c) => {
  const db = getDb(c.env.DB);
  const allNodes = await db.select({
    id: schema.nodes.id,
    name: schema.nodes.name,
    fqdn: schema.nodes.fqdn,
    scheme: schema.nodes.scheme,
    daemonPort: schema.nodes.daemonPort,
    memory: schema.nodes.memory,
    disk: schema.nodes.disk,
    createdAt: schema.nodes.createdAt,
  }).from(schema.nodes).all();
  return c.json(allNodes);
});

// Get single node with live stats from Wings
nodeRoutes.get("/:id", requireAdmin, async (c) => {
  const db = getDb(c.env.DB);
  const node = await db.select().from(schema.nodes).where(eq(schema.nodes.id, c.req.param("id"))).get();
  if (!node) return c.json({ error: "Node not found" }, 404);

  let stats = null;
  try {
    const client = new WingsClient(node);
    stats = await client.getSystemInfo();
  } catch {
    // Node might be offline
  }

  return c.json({ ...node, token: undefined, stats });
});

// Create node
nodeRoutes.post("/", requireAdmin, zValidator("json", createNodeSchema), async (c) => {
  const data = c.req.valid("json");
  const db = getDb(c.env.DB);

  const node = await db.insert(schema.nodes).values(data).returning().get();
  return c.json(node, 201);
});

// Update node
nodeRoutes.put("/:id", requireAdmin, zValidator("json", createNodeSchema.partial()), async (c) => {
  const db = getDb(c.env.DB);
  const data = c.req.valid("json");
  const node = await db.update(schema.nodes)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(schema.nodes.id, c.req.param("id")))
    .returning().get();

  if (!node) return c.json({ error: "Node not found" }, 404);
  return c.json(node);
});

// Delete node
nodeRoutes.delete("/:id", requireAdmin, async (c) => {
  const db = getDb(c.env.DB);
  // Check no servers on this node
  const servers = await db.select().from(schema.servers)
    .where(eq(schema.servers.nodeId, c.req.param("id"))).all();
  if (servers.length > 0) {
    return c.json({ error: "Cannot delete node with active servers" }, 409);
  }
  await db.delete(schema.nodes).where(eq(schema.nodes.id, c.req.param("id")));
  return c.body(null, 204);
});
```

**Step 2: Mount in `src/api/index.ts`**

Add: `import { nodeRoutes } from "./nodes";`
Add: `apiRoutes.route("/nodes", nodeRoutes);`

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add node CRUD API with Wings connectivity check"
```

---

### Task 3.2: Server CRUD API

**Files:**
- Create: `src/api/servers.ts`
- Modify: `src/api/index.ts`

**Step 1: Create server routes `src/api/servers.ts`**

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import type { Env } from "../env";
import { getDb, schema } from "../db";
import { requireAuth, requireAdmin, type AuthUser } from "./middleware/auth";
import { WingsClient } from "../lib/wings-client";
import { signWingsWebsocketToken, WS_PERMISSIONS } from "../lib/wings-jwt";

export const serverRoutes = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

serverRoutes.use("*", requireAuth);

// List servers (admin sees all, user sees own + subuser)
serverRoutes.get("/", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  let serverList;
  if (user.role === "admin") {
    serverList = await db.select().from(schema.servers).all();
  } else {
    serverList = await db.select().from(schema.servers)
      .where(eq(schema.servers.ownerId, user.id)).all();
  }

  return c.json(serverList);
});

// Get single server with live stats from Wings
serverRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const server = await db.select().from(schema.servers)
    .where(eq(schema.servers.id, c.req.param("id"))).get();

  if (!server) return c.json({ error: "Server not found" }, 404);
  if (user.role !== "admin" && server.ownerId !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  // Get live status from Wings
  const node = await db.select().from(schema.nodes)
    .where(eq(schema.nodes.id, server.nodeId)).get();

  let resources = null;
  if (node) {
    try {
      const client = new WingsClient(node);
      resources = await client.getServer(server.uuid);
    } catch {
      // Node offline
    }
  }

  return c.json({ ...server, resources });
});

// Power actions
serverRoutes.post("/:id/power", zValidator("json", z.object({
  action: z.enum(["start", "stop", "restart", "kill"]),
})), async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const { action } = c.req.valid("json");

  const server = await db.select().from(schema.servers)
    .where(eq(schema.servers.id, c.req.param("id"))).get();
  if (!server) return c.json({ error: "Server not found" }, 404);
  if (user.role !== "admin" && server.ownerId !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const node = await db.select().from(schema.nodes)
    .where(eq(schema.nodes.id, server.nodeId)).get();
  if (!node) return c.json({ error: "Node not found" }, 404);

  const client = new WingsClient(node);
  await client.powerAction(server.uuid, action);
  return c.body(null, 204);
});

// Send command
serverRoutes.post("/:id/command", zValidator("json", z.object({
  command: z.string().min(1),
})), async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const { command } = c.req.valid("json");

  const server = await db.select().from(schema.servers)
    .where(eq(schema.servers.id, c.req.param("id"))).get();
  if (!server) return c.json({ error: "Server not found" }, 404);
  if (user.role !== "admin" && server.ownerId !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const node = await db.select().from(schema.nodes)
    .where(eq(schema.nodes.id, server.nodeId)).get();
  if (!node) return c.json({ error: "Node not found" }, 404);

  const client = new WingsClient(node);
  await client.sendCommand(server.uuid, [command]);
  return c.body(null, 204);
});

// Get WebSocket token for console
serverRoutes.get("/:id/websocket", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  const server = await db.select().from(schema.servers)
    .where(eq(schema.servers.id, c.req.param("id"))).get();
  if (!server) return c.json({ error: "Server not found" }, 404);
  if (user.role !== "admin" && server.ownerId !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const node = await db.select().from(schema.nodes)
    .where(eq(schema.nodes.id, server.nodeId)).get();
  if (!node) return c.json({ error: "Node not found" }, 404);

  const permissions = [
    WS_PERMISSIONS.CONNECT,
    WS_PERMISSIONS.SEND_COMMAND,
    WS_PERMISSIONS.POWER_START,
    WS_PERMISSIONS.POWER_STOP,
    WS_PERMISSIONS.POWER_RESTART,
    WS_PERMISSIONS.BACKUP_READ,
  ];

  if (user.role === "admin") {
    permissions.push(
      WS_PERMISSIONS.ADMIN_ERRORS,
      WS_PERMISSIONS.ADMIN_INSTALL,
      WS_PERMISSIONS.ADMIN_TRANSFER,
    );
  }

  const token = await signWingsWebsocketToken(
    { user_uuid: user.id, server_uuid: server.uuid, permissions },
    node.token,
  );

  return c.json({
    token,
    socket: `wss://${node.fqdn}:${node.daemonPort}/api/servers/${server.uuid}/ws`,
  });
});
```

**Step 2: Mount in `src/api/index.ts`**

Add: `import { serverRoutes } from "./servers";`
Add: `apiRoutes.route("/servers", serverRoutes);`

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add server management API with power, commands, and websocket token"
```

---

### Task 3.3: File management API (proxy to Wings)

**Files:**
- Create: `src/api/files.ts`
- Modify: `src/api/index.ts`

**Step 1: Create file routes `src/api/files.ts`**

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { getDb, schema } from "../db";
import { requireAuth, type AuthUser } from "./middleware/auth";
import { WingsClient } from "../lib/wings-client";

export const fileRoutes = new Hono<{ Bindings: Env; Variables: { user: AuthUser } }>();

fileRoutes.use("*", requireAuth);

// Helper to get server + wings client with auth check
async function getServerAndClient(c: any) {
  const user = c.get("user");
  const db = getDb(c.env.DB);
  const server = await db.select().from(schema.servers)
    .where(eq(schema.servers.id, c.req.param("serverId"))).get();
  if (!server) return { error: c.json({ error: "Server not found" }, 404) };
  if (user.role !== "admin" && server.ownerId !== user.id) {
    return { error: c.json({ error: "Forbidden" }, 403) };
  }
  const node = await db.select().from(schema.nodes)
    .where(eq(schema.nodes.id, server.nodeId)).get();
  if (!node) return { error: c.json({ error: "Node not found" }, 404) };
  return { server, client: new WingsClient(node) };
}

// List directory
fileRoutes.get("/:serverId/files/list", async (c) => {
  const result = await getServerAndClient(c);
  if ("error" in result) return result.error;
  const dir = c.req.query("directory") || "/";
  const files = await result.client.listDirectory(result.server.uuid, dir);
  return c.json(files);
});

// Get file contents
fileRoutes.get("/:serverId/files/contents", async (c) => {
  const result = await getServerAndClient(c);
  if ("error" in result) return result.error;
  const file = c.req.query("file");
  if (!file) return c.json({ error: "file parameter required" }, 400);
  const res = await result.client.getFileContents(result.server.uuid, file);
  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "application/octet-stream",
      "X-Mime-Type": res.headers.get("X-Mime-Type") || "",
    },
  });
});

// Write file
fileRoutes.post("/:serverId/files/write", async (c) => {
  const result = await getServerAndClient(c);
  if ("error" in result) return result.error;
  const file = c.req.query("file");
  if (!file) return c.json({ error: "file parameter required" }, 400);
  const body = await c.req.text();
  await result.client.writeFile(result.server.uuid, file, body);
  return c.body(null, 204);
});

// Rename/move files
fileRoutes.put("/:serverId/files/rename", zValidator("json", z.object({
  root: z.string(),
  files: z.array(z.object({ from: z.string(), to: z.string() })),
})), async (c) => {
  const result = await getServerAndClient(c);
  if ("error" in result) return result.error;
  const { root, files } = c.req.valid("json");
  await result.client.renameFiles(result.server.uuid, root, files);
  return c.body(null, 204);
});

// Copy file
fileRoutes.post("/:serverId/files/copy", zValidator("json", z.object({
  location: z.string(),
})), async (c) => {
  const result = await getServerAndClient(c);
  if ("error" in result) return result.error;
  await result.client.copyFile(result.server.uuid, c.req.valid("json").location);
  return c.body(null, 204);
});

// Delete files
fileRoutes.post("/:serverId/files/delete", zValidator("json", z.object({
  root: z.string(),
  files: z.array(z.string()),
})), async (c) => {
  const result = await getServerAndClient(c);
  if ("error" in result) return result.error;
  const { root, files } = c.req.valid("json");
  await result.client.deleteFiles(result.server.uuid, root, files);
  return c.body(null, 204);
});

// Create directory
fileRoutes.post("/:serverId/files/create-directory", zValidator("json", z.object({
  name: z.string(),
  path: z.string(),
})), async (c) => {
  const result = await getServerAndClient(c);
  if ("error" in result) return result.error;
  const { name, path } = c.req.valid("json");
  await result.client.createDirectory(result.server.uuid, name, path);
  return c.body(null, 204);
});

// Compress files
fileRoutes.post("/:serverId/files/compress", zValidator("json", z.object({
  root: z.string(),
  files: z.array(z.string()),
})), async (c) => {
  const result = await getServerAndClient(c);
  if ("error" in result) return result.error;
  const { root, files } = c.req.valid("json");
  const stat = await result.client.compressFiles(result.server.uuid, root, files);
  return c.json(stat);
});

// Decompress file
fileRoutes.post("/:serverId/files/decompress", zValidator("json", z.object({
  root: z.string(),
  file: z.string(),
})), async (c) => {
  const result = await getServerAndClient(c);
  if ("error" in result) return result.error;
  const { root, file } = c.req.valid("json");
  await result.client.decompressFile(result.server.uuid, root, file);
  return c.body(null, 204);
});
```

**Step 2: Mount in `src/api/index.ts`**

Add: `import { fileRoutes } from "./files";`
Add: `apiRoutes.route("/servers", fileRoutes);` (mounted on /api/servers/:serverId/files/*)

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add file management API proxying to Wings"
```

---

### Task 3.4: Egg management API

**Files:**
- Create: `src/api/eggs.ts`
- Modify: `src/api/index.ts`

**Step 1: Create egg routes `src/api/eggs.ts`**

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { getDb, schema } from "../db";
import { requireAuth, requireAdmin } from "./middleware/auth";

export const eggRoutes = new Hono<{ Bindings: Env }>();

eggRoutes.use("*", requireAuth);

// List eggs
eggRoutes.get("/", async (c) => {
  const db = getDb(c.env.DB);
  return c.json(await db.select().from(schema.eggs).all());
});

// Get egg with variables
eggRoutes.get("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const egg = await db.select().from(schema.eggs).where(eq(schema.eggs.id, c.req.param("id"))).get();
  if (!egg) return c.json({ error: "Egg not found" }, 404);
  const variables = await db.select().from(schema.eggVariables)
    .where(eq(schema.eggVariables.eggId, egg.id)).all();
  return c.json({ ...egg, variables });
});

// Create egg (admin)
eggRoutes.post("/", requireAdmin, zValidator("json", z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  dockerImage: z.string().min(1),
  startup: z.string().min(1),
  stopCommand: z.string().default("stop"),
  configStartup: z.string().optional(),
  configFiles: z.string().optional(),
  scriptInstall: z.string().optional(),
  scriptContainer: z.string().optional(),
  scriptEntry: z.string().optional(),
})), async (c) => {
  const db = getDb(c.env.DB);
  const data = c.req.valid("json");
  const egg = await db.insert(schema.eggs).values(data).returning().get();
  return c.json(egg, 201);
});

// Import egg from Pelican JSON format (admin)
eggRoutes.post("/import", requireAdmin, async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json();

  // Pelican egg format has specific structure
  const egg = await db.insert(schema.eggs).values({
    name: body.name,
    description: body.description || "",
    dockerImage: typeof body.docker_images === "object"
      ? Object.values(body.docker_images)[0] as string
      : body.docker_image || "",
    startup: body.startup || "",
    stopCommand: body.config?.stop || "stop",
    configStartup: JSON.stringify(body.config?.startup || {}),
    configFiles: JSON.stringify(body.config?.files || []),
    scriptInstall: body.scripts?.installation?.script || "",
    scriptContainer: body.scripts?.installation?.container || "ghcr.io/pelican-dev/installer:latest",
    scriptEntry: body.scripts?.installation?.entrypoint || "bash",
    fileDenylist: JSON.stringify(body.file_denylist || []),
    features: JSON.stringify(body.features || {}),
  }).returning().get();

  // Import variables
  if (body.variables && Array.isArray(body.variables)) {
    for (const v of body.variables) {
      await db.insert(schema.eggVariables).values({
        eggId: egg.id,
        name: v.name,
        description: v.description || "",
        envVariable: v.env_variable,
        defaultValue: v.default_value || "",
        userViewable: v.user_viewable ? 1 : 0,
        userEditable: v.user_editable ? 1 : 0,
        rules: v.rules || "required|string",
        sortOrder: v.sort || 0,
      });
    }
  }

  return c.json(egg, 201);
});
```

**Step 2: Mount and commit**

```bash
git add -A && git commit -m "feat: add egg management API with Pelican egg import"
```

---

## Phase 4: Durable Objects - WebSocket Console Proxy

### Task 4.1: Console session Durable Object

**Files:**
- Create: `src/durable-objects/console-session.ts`

The Durable Object acts as a WebSocket relay between the browser client and the Wings WebSocket endpoint. Each console session gets its own DO instance.

**Step 1: Create Durable Object `src/durable-objects/console-session.ts`**

```typescript
import { DurableObject } from "cloudflare:workers";

interface ConsoleSessionState {
  wingsUrl: string;
  wingsToken: string;
}

export class ConsoleSession extends DurableObject {
  private wingsSocket: WebSocket | null = null;
  private clientSockets: Set<WebSocket> = new Set();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/connect") {
      // Initialize the session with Wings connection details
      const body = await request.json() as ConsoleSessionState;
      this.ctx.storage.put("wingsUrl", body.wingsUrl);
      this.ctx.storage.put("wingsToken", body.wingsToken);
      return new Response("ok");
    }

    if (url.pathname === "/websocket") {
      // Client WebSocket upgrade
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      this.ctx.acceptWebSocket(server);
      this.clientSockets.add(server);

      // Connect to Wings if not already connected
      if (!this.wingsSocket || this.wingsSocket.readyState !== WebSocket.OPEN) {
        await this.connectToWings();
      }

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  }

  private async connectToWings() {
    const wingsUrl = await this.ctx.storage.get<string>("wingsUrl");
    const wingsToken = await this.ctx.storage.get<string>("wingsToken");

    if (!wingsUrl || !wingsToken) {
      throw new Error("Wings connection not configured");
    }

    const ws = new WebSocket(wingsUrl);

    ws.addEventListener("open", () => {
      // Send auth token to Wings
      ws.send(JSON.stringify({
        event: "auth",
        args: [wingsToken],
      }));
    });

    ws.addEventListener("message", (event) => {
      // Relay Wings messages to all connected clients
      for (const client of this.clientSockets) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(typeof event.data === "string" ? event.data : "");
        }
      }
    });

    ws.addEventListener("close", () => {
      this.wingsSocket = null;
      // Notify clients
      for (const client of this.clientSockets) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ event: "daemon error", args: ["Wings connection lost"] }));
        }
      }
    });

    ws.addEventListener("error", () => {
      this.wingsSocket = null;
    });

    this.wingsSocket = ws;
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    // Relay client messages to Wings
    if (this.wingsSocket?.readyState === WebSocket.OPEN) {
      const data = typeof message === "string" ? message : new TextDecoder().decode(message);
      this.wingsSocket.send(data);
    }
  }

  webSocketClose(ws: WebSocket) {
    this.clientSockets.delete(ws);
    // If no more clients, close Wings connection
    if (this.clientSockets.size === 0 && this.wingsSocket) {
      this.wingsSocket.close();
      this.wingsSocket = null;
    }
  }

  webSocketError(ws: WebSocket) {
    this.clientSockets.delete(ws);
  }
}
```

**Step 2: Add console WebSocket endpoint to server routes**

In `src/api/servers.ts`, add:

```typescript
// WebSocket console proxy via Durable Object
serverRoutes.get("/:id/console", async (c) => {
  const user = c.get("user");
  const db = getDb(c.env.DB);

  const server = await db.select().from(schema.servers)
    .where(eq(schema.servers.id, c.req.param("id"))).get();
  if (!server) return c.json({ error: "Server not found" }, 404);
  if (user.role !== "admin" && server.ownerId !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const node = await db.select().from(schema.nodes)
    .where(eq(schema.nodes.id, server.nodeId)).get();
  if (!node) return c.json({ error: "Node not found" }, 404);

  // Sign JWT for Wings
  const permissions = [
    WS_PERMISSIONS.CONNECT,
    WS_PERMISSIONS.SEND_COMMAND,
    WS_PERMISSIONS.POWER_START,
    WS_PERMISSIONS.POWER_STOP,
    WS_PERMISSIONS.POWER_RESTART,
    WS_PERMISSIONS.BACKUP_READ,
  ];
  if (user.role === "admin") {
    permissions.push(WS_PERMISSIONS.ADMIN_ERRORS, WS_PERMISSIONS.ADMIN_INSTALL);
  }

  const wingsToken = await signWingsWebsocketToken(
    { user_uuid: user.id, server_uuid: server.uuid, permissions },
    node.token,
  );

  const wingsUrl = `${node.scheme === "https" ? "wss" : "ws"}://${node.fqdn}:${node.daemonPort}/api/servers/${server.uuid}/ws`;

  // Get or create Durable Object for this server
  const doId = c.env.CONSOLE_SESSION.idFromName(server.uuid);
  const stub = c.env.CONSOLE_SESSION.get(doId);

  // Configure the DO with Wings connection info
  await stub.fetch(new Request("https://internal/connect", {
    method: "POST",
    body: JSON.stringify({ wingsUrl, wingsToken }),
  }));

  // Proxy the WebSocket upgrade to the DO
  return stub.fetch(new Request("https://internal/websocket", {
    headers: c.req.raw.headers,
  }));
});
```

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add Durable Object WebSocket proxy for server console"
```

---

## Phase 5: Wings Remote API Compatibility Layer

### Task 5.1: Panel API endpoints that Wings calls back to

Wings makes callbacks to the Panel during operations (install complete, backup done, state changes). We need to implement these endpoints so Wings can report back.

**Files:**
- Create: `src/api/remote.ts` (Wings callback API)
- Modify: `src/api/index.ts`

**Step 1: Create remote API `src/api/remote.ts`**

```typescript
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Env } from "../env";
import { getDb, schema } from "../db";

export const remoteRoutes = new Hono<{ Bindings: Env }>();

// Wings authenticates with "Bearer {tokenId}.{token}" - we verify against stored node tokens
remoteRoutes.use("*", async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const tokenParts = auth.slice(7).split(".");
  if (tokenParts.length !== 2) {
    return c.json({ error: "Invalid token format" }, 401);
  }
  const [tokenId, token] = tokenParts;
  const db = getDb(c.env.DB);
  const node = await db.select().from(schema.nodes)
    .where(eq(schema.nodes.tokenId, tokenId)).get();
  if (!node || node.token !== token) {
    return c.json({ error: "Forbidden" }, 403);
  }
  c.set("node" as never, node);
  await next();
});

// GET /api/remote/servers - Wings fetches all server configs for this node
remoteRoutes.get("/servers", async (c) => {
  const node = c.get("node" as never) as any;
  const db = getDb(c.env.DB);

  const page = parseInt(c.req.query("page") || "0");
  const perPage = parseInt(c.req.query("per_page") || "50");
  const offset = page * perPage;

  const servers = await db.select().from(schema.servers)
    .where(eq(schema.servers.nodeId, node.id))
    .limit(perPage).offset(offset).all();

  const total = servers.length; // simplified - would need COUNT query

  const data = await Promise.all(servers.map(async (s) => {
    const egg = s.eggId ? await db.select().from(schema.eggs)
      .where(eq(schema.eggs.id, s.eggId)).get() : null;

    const variables = s.eggId
      ? await db.select().from(schema.eggVariables)
          .where(eq(schema.eggVariables.eggId, s.eggId)).all()
      : [];

    const serverVars = await db.select().from(schema.serverVariables)
      .where(eq(schema.serverVariables.serverId, s.id)).all();

    // Build environment variables map
    const envVars: Record<string, string> = {};
    for (const v of variables) {
      const override = serverVars.find(sv => sv.variableId === v.id);
      envVars[v.envVariable] = override?.variableValue ?? v.defaultValue ?? "";
    }

    return {
      uuid: s.uuid,
      settings: JSON.stringify({
        uuid: s.uuid,
        meta: { name: s.name, description: s.description },
        suspended: s.status === "suspended",
        invocation: s.startup || egg?.startup || "",
        skip_egg_scripts: false,
        environment: envVars,
        allocations: {
          force_outgoing_ip: false,
          default: { ip: s.defaultAllocationIp, port: s.defaultAllocationPort },
          mappings: { [s.defaultAllocationIp]: [s.defaultAllocationPort] },
        },
        build: {
          memory_limit: s.memory,
          swap: s.swap,
          io_weight: s.io,
          cpu_limit: s.cpu,
          disk_space: s.disk,
          threads: s.threads || "",
          oom_killer: s.oomKiller === 1,
        },
        container: { image: s.image || egg?.dockerImage || "" },
        egg: {
          id: s.eggId || "",
          file_denylist: egg ? JSON.parse(egg.fileDenylist || "[]") : [],
        },
        crash_detection_enabled: true,
      }),
      process_configuration: JSON.stringify({
        startup: {
          done: egg ? JSON.parse(egg.configStartup || "{}").done || [] : [],
          user_interaction: [],
          strip_ansi: false,
        },
        stop: {
          type: "command",
          value: egg?.stopCommand || "stop",
        },
        configs: egg ? JSON.parse(egg.configFiles || "[]") : [],
      }),
    };
  }));

  return c.json({
    data,
    meta: {
      current_page: page,
      from: offset,
      last_page: Math.ceil(total / perPage),
      per_page: perPage,
      to: offset + data.length,
      total,
    },
  });
});

// GET /api/remote/servers/:uuid - Wings fetches single server config
remoteRoutes.get("/servers/:uuid", async (c) => {
  const db = getDb(c.env.DB);
  const server = await db.select().from(schema.servers)
    .where(eq(schema.servers.uuid, c.req.param("uuid"))).get();
  if (!server) return c.json({ error: "Not found" }, 404);

  // Build full config (same as above but for single server)
  // Simplified: return settings + process_configuration
  return c.json({
    settings: "{}",
    process_configuration: null,
  });
});

// GET /api/remote/servers/:uuid/install - Wings fetches install script
remoteRoutes.get("/servers/:uuid/install", async (c) => {
  const db = getDb(c.env.DB);
  const server = await db.select().from(schema.servers)
    .where(eq(schema.servers.uuid, c.req.param("uuid"))).get();
  if (!server || !server.eggId) return c.json({ error: "Not found" }, 404);

  const egg = await db.select().from(schema.eggs)
    .where(eq(schema.eggs.id, server.eggId)).get();
  if (!egg) return c.json({ error: "Egg not found" }, 404);

  return c.json({
    container_image: egg.scriptContainer,
    entrypoint: egg.scriptEntry,
    script: egg.scriptInstall,
  });
});

// POST /api/remote/servers/:uuid/install - Wings reports install status
remoteRoutes.post("/servers/:uuid/install", async (c) => {
  const db = getDb(c.env.DB);
  const body = await c.req.json() as { successful: boolean; reinstall: boolean };
  const server = await db.select().from(schema.servers)
    .where(eq(schema.servers.uuid, c.req.param("uuid"))).get();
  if (!server) return c.json({ error: "Not found" }, 404);

  await db.update(schema.servers).set({
    status: body.successful ? null : "install_failed",
    installedAt: body.successful ? new Date().toISOString() : server.installedAt,
    updatedAt: new Date().toISOString(),
  }).where(eq(schema.servers.id, server.id));

  return c.body(null, 204);
});

// POST /api/remote/servers/reset - Wings reports boot (reset stuck states)
remoteRoutes.post("/servers/reset", async (c) => {
  const node = c.get("node" as never) as any;
  const db = getDb(c.env.DB);
  // Reset any servers stuck in installing/restoring state on this node
  // This is a simplified version
  return c.body(null, 204);
});

// POST /api/remote/servers/:uuid/container/status - Wings reports state change
remoteRoutes.post("/servers/:uuid/container/status", async (c) => {
  // Wings sends state changes here; we can log or push to connected clients
  return c.body(null, 204);
});

// POST /api/remote/activity - Wings sends activity logs
remoteRoutes.post("/activity", async (c) => {
  const body = await c.req.json() as { data: Array<{ event: string; metadata: Record<string, unknown>; ip: string; server: string; user: string | null; timestamp: string }> };
  const db = getDb(c.env.DB);

  for (const activity of body.data) {
    await db.insert(schema.activityLogs).values({
      userId: activity.user || null,
      serverId: null, // Would need to look up by UUID
      event: activity.event,
      metadata: JSON.stringify(activity.metadata),
      ip: activity.ip,
    });
  }

  return c.body(null, 204);
});

// POST /api/remote/backups/:uuid - Wings reports backup status
remoteRoutes.post("/backups/:uuid", async (c) => {
  // Store backup completion status
  return c.body(null, 204);
});

// POST /api/remote/backups/:uuid/restore - Wings reports restore status
remoteRoutes.post("/backups/:uuid/restore", async (c) => {
  return c.body(null, 204);
});

// POST /api/remote/sftp/auth - Wings validates SFTP credentials
remoteRoutes.post("/sftp/auth", async (c) => {
  // Validate SFTP credentials against our user database
  // This is needed for Wings SFTP to work
  const body = await c.req.json() as { type: string; username: string; password: string; ip: string };

  // Username format in Pelican is "username.server_uuid"
  const parts = body.username.split(".");
  if (parts.length !== 2) {
    return c.json({ error: "Invalid credentials" }, 403);
  }

  const [username, serverUuid] = parts;
  const db = getDb(c.env.DB);

  const user = await db.select().from(schema.users)
    .where(eq(schema.users.username, username)).get();
  if (!user) return c.json({ error: "Invalid credentials" }, 403);

  const valid = await (await import("../lib/auth")).verifyPassword(body.password, user.passwordHash);
  if (!valid) return c.json({ error: "Invalid credentials" }, 403);

  const server = await db.select().from(schema.servers)
    .where(eq(schema.servers.uuid, serverUuid)).get();
  if (!server) return c.json({ error: "Invalid credentials" }, 403);

  if (user.role !== "admin" && server.ownerId !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  return c.json({
    server: server.uuid,
    user: user.id,
    permissions: ["*"],
  });
});
```

**Step 2: Mount in `src/api/index.ts`**

Add: `import { remoteRoutes } from "./remote";`
Add: `apiRoutes.route("/remote", remoteRoutes);`

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add Wings remote API compatibility layer for callbacks"
```

---

## Phase 6: React Frontend

### Task 6.1: Frontend routing and layout

**Files:**
- Modify: `src/web/App.tsx`
- Create: `src/web/lib/api.ts` (API client)
- Create: `src/web/lib/auth.tsx` (auth context)
- Create: `src/web/components/layout.tsx`
- Create: `src/web/pages/login.tsx`
- Create: `src/web/pages/dashboard.tsx`
- Create: `src/web/pages/server.tsx`
- Create: `src/web/pages/server-console.tsx`
- Create: `src/web/pages/server-files.tsx`
- Create: `src/web/pages/admin/nodes.tsx`
- Create: `src/web/pages/admin/eggs.tsx`

**Step 1: Create API client `src/web/lib/api.ts`**

```typescript
const BASE = "/api";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
```

**Step 2: Create auth context `src/web/lib/auth.tsx`**

```tsx
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { api } from "./api";

interface User {
  id: string;
  email: string;
  username: string;
  role: "admin" | "user";
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("token"));

  useEffect(() => {
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        setUser({ id: payload.sub, email: payload.email, username: "", role: payload.role });
      } catch {
        localStorage.removeItem("token");
        setToken(null);
      }
    }
  }, [token]);

  const login = async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>("/auth/login", { email, password });
    localStorage.setItem("token", res.token);
    setToken(res.token);
    setUser(res.user);
  };

  const register = async (email: string, username: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>("/auth/register", { email, username, password });
    localStorage.setItem("token", res.token);
    setToken(res.token);
    setUser(res.user);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

**Step 3: Create layout and pages (stub implementations)**

These will be minimal stubs to establish routing. Full UI implementation comes in Phase 7.

`src/web/components/layout.tsx`:
```tsx
import { useAuth } from "../lib/auth";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <a href="/" className="text-xl font-bold text-pink-400">Flamingo</a>
          <a href="/" className="text-sm text-zinc-400 hover:text-zinc-100">Servers</a>
          {user?.role === "admin" && (
            <>
              <a href="/admin/nodes" className="text-sm text-zinc-400 hover:text-zinc-100">Nodes</a>
              <a href="/admin/eggs" className="text-sm text-zinc-400 hover:text-zinc-100">Eggs</a>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-400">{user?.email}</span>
          <button onClick={logout} className="text-sm text-zinc-400 hover:text-zinc-100">Logout</button>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
```

`src/web/pages/dashboard.tsx`:
```tsx
import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Server {
  id: string;
  name: string;
  uuid: string;
  status: string | null;
  memory: number;
  cpu: number;
  disk: number;
}

export function Dashboard() {
  const [servers, setServers] = useState<Server[]>([]);

  useEffect(() => {
    api.get<Server[]>("/servers").then(setServers);
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Your Servers</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {servers.map((s) => (
          <a
            key={s.id}
            href={`/server/${s.id}`}
            className="block p-4 bg-zinc-900 rounded-lg border border-zinc-800 hover:border-pink-500/50 transition-colors"
          >
            <h3 className="font-semibold">{s.name}</h3>
            <p className="text-sm text-zinc-400 mt-1">
              {s.memory} MB RAM &middot; {s.cpu}% CPU &middot; {s.disk} MB Disk
            </p>
            <div className="mt-2">
              <span className={`text-xs px-2 py-0.5 rounded ${
                s.status === null ? "bg-green-900 text-green-300" : "bg-yellow-900 text-yellow-300"
              }`}>
                {s.status || "Active"}
              </span>
            </div>
          </a>
        ))}
        {servers.length === 0 && (
          <p className="text-zinc-500 col-span-full">No servers yet.</p>
        )}
      </div>
    </div>
  );
}
```

**Step 4: Wire up App.tsx with simple hash routing**

```tsx
import { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./lib/auth";
import { Layout } from "./components/layout";
import { Dashboard } from "./pages/dashboard";

function LoginPage() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      if (isRegister) {
        await register(email, username, password);
      } else {
        await login(email, password);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm p-6 bg-zinc-900 rounded-lg border border-zinc-800">
        <h1 className="text-2xl font-bold text-center text-pink-400 mb-6">Flamingo</h1>
        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
        <input
          type="email" placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-3 px-3 py-2 bg-zinc-800 rounded border border-zinc-700 text-sm"
        />
        {isRegister && (
          <input
            type="text" placeholder="Username" value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full mb-3 px-3 py-2 bg-zinc-800 rounded border border-zinc-700 text-sm"
          />
        )}
        <input
          type="password" placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-4 px-3 py-2 bg-zinc-800 rounded border border-zinc-700 text-sm"
        />
        <button type="submit" className="w-full py-2 bg-pink-600 hover:bg-pink-500 rounded font-medium text-sm">
          {isRegister ? "Create Account" : "Sign In"}
        </button>
        <button type="button" onClick={() => setIsRegister(!isRegister)}
          className="w-full mt-3 text-sm text-zinc-400 hover:text-zinc-100">
          {isRegister ? "Already have an account?" : "Create an account"}
        </button>
      </form>
    </div>
  );
}

function Router() {
  const { user } = useAuth();
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  if (!user) return <LoginPage />;

  return (
    <Layout>
      <Dashboard />
    </Layout>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
```

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: add React frontend with auth, layout, and dashboard page"
```

---

## Phase 7: Server Detail & Console UI

### Task 7.1: Server detail page with console

**Files:**
- Create: `src/web/pages/server-detail.tsx`
- Create: `src/web/components/console.tsx`
- Create: `src/web/components/power-controls.tsx`

**Step 1: Create console component `src/web/components/console.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";

interface ConsoleProps {
  serverId: string;
}

export function Console({ serverId }: ConsoleProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [command, setCommand] = useState("");
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    // First, get the websocket connection info
    fetch(`/api/servers/${serverId}/websocket`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then(({ token: wsToken, socket }) => {
        const ws = new WebSocket(socket);
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(JSON.stringify({ event: "auth", args: [wsToken] }));
        };

        ws.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          switch (msg.event) {
            case "auth success":
              setConnected(true);
              ws.send(JSON.stringify({ event: "send logs" }));
              break;
            case "console output":
              setLines((prev) => [...prev.slice(-500), ...msg.args]);
              break;
            case "status":
              setLines((prev) => [...prev, `[Status] Server is ${msg.args[0]}`]);
              break;
            case "daemon error":
              setLines((prev) => [...prev, `[Error] ${msg.args[0]}`]);
              break;
          }
        };

        ws.onclose = () => setConnected(false);
      });

    return () => wsRef.current?.close();
  }, [serverId]);

  useEffect(() => {
    containerRef.current?.scrollTo(0, containerRef.current.scrollHeight);
  }, [lines]);

  const sendCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ event: "send command", args: [command] }));
    setCommand("");
  };

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <span className="text-sm font-medium">Console</span>
        <span className={`text-xs px-2 py-0.5 rounded ${
          connected ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"
        }`}>
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>
      <div
        ref={containerRef}
        className="h-96 overflow-y-auto p-4 font-mono text-xs leading-relaxed text-zinc-300 bg-black/50"
      >
        {lines.map((line, i) => (
          <div key={i} dangerouslySetInnerHTML={{ __html: line }} />
        ))}
      </div>
      <form onSubmit={sendCommand} className="flex border-t border-zinc-800">
        <span className="px-3 py-2 text-zinc-500 text-sm">$</span>
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Type a command..."
          className="flex-1 bg-transparent px-2 py-2 text-sm outline-none"
        />
      </form>
    </div>
  );
}
```

**Step 2: Create power controls `src/web/components/power-controls.tsx`**

```tsx
import { api } from "../lib/api";

interface PowerControlsProps {
  serverId: string;
  status: string;
  onStatusChange: () => void;
}

export function PowerControls({ serverId, status, onStatusChange }: PowerControlsProps) {
  const sendPower = async (action: string) => {
    await api.post(`/servers/${serverId}/power`, { action });
    setTimeout(onStatusChange, 1000);
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={() => sendPower("start")}
        disabled={status === "running"}
        className="px-3 py-1.5 text-sm bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed rounded"
      >
        Start
      </button>
      <button
        onClick={() => sendPower("restart")}
        disabled={status === "offline"}
        className="px-3 py-1.5 text-sm bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded"
      >
        Restart
      </button>
      <button
        onClick={() => sendPower("stop")}
        disabled={status === "offline"}
        className="px-3 py-1.5 text-sm bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed rounded"
      >
        Stop
      </button>
      <button
        onClick={() => sendPower("kill")}
        disabled={status === "offline"}
        className="px-3 py-1.5 text-sm bg-red-700 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed rounded"
      >
        Kill
      </button>
    </div>
  );
}
```

**Step 3: Create server detail page `src/web/pages/server-detail.tsx`**

```tsx
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Console } from "../components/console";
import { PowerControls } from "../components/power-controls";

interface ServerDetailProps {
  serverId: string;
}

export function ServerDetail({ serverId }: ServerDetailProps) {
  const [server, setServer] = useState<any>(null);
  const [tab, setTab] = useState<"console" | "files" | "settings">("console");

  const loadServer = () => {
    api.get(`/servers/${serverId}`).then(setServer);
  };

  useEffect(loadServer, [serverId]);

  if (!server) return <div className="text-zinc-500">Loading...</div>;

  const status = server.resources?.utilization?.state || "offline";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{server.name}</h1>
          <p className="text-sm text-zinc-400">{server.uuid}</p>
        </div>
        <PowerControls serverId={serverId} status={status} onStatusChange={loadServer} />
      </div>

      {/* Resource stats */}
      {server.resources?.utilization && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800">
            <p className="text-xs text-zinc-400">CPU</p>
            <p className="text-lg font-mono">{server.resources.utilization.cpu_absolute.toFixed(1)}%</p>
          </div>
          <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800">
            <p className="text-xs text-zinc-400">Memory</p>
            <p className="text-lg font-mono">{(server.resources.utilization.memory_bytes / 1024 / 1024).toFixed(0)} MB</p>
          </div>
          <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800">
            <p className="text-xs text-zinc-400">Disk</p>
            <p className="text-lg font-mono">{(server.resources.utilization.disk_bytes / 1024 / 1024).toFixed(0)} MB</p>
          </div>
          <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800">
            <p className="text-xs text-zinc-400">Network</p>
            <p className="text-lg font-mono">
              {(server.resources.utilization.network.rx_bytes / 1024).toFixed(0)} KB
            </p>
          </div>
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex gap-1 mb-4 border-b border-zinc-800">
        {(["console", "files", "settings"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize ${
              tab === t ? "border-b-2 border-pink-500 text-pink-400" : "text-zinc-400 hover:text-zinc-100"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "console" && <Console serverId={serverId} />}
      {tab === "files" && <p className="text-zinc-500">File manager coming soon...</p>}
      {tab === "settings" && <p className="text-zinc-500">Settings coming soon...</p>}
    </div>
  );
}
```

**Step 4: Update Router in App.tsx to handle server detail page**

Add route matching for `/server/:id` in the Router component to render `<ServerDetail serverId={id} />`.

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: add server detail page with live console and power controls"
```

---

## Phase 8: File Manager UI

### Task 8.1: File manager component

**Files:**
- Create: `src/web/components/file-manager.tsx`
- Create: `src/web/components/file-editor.tsx`

This is a critical component for UX. Must be fast and responsive (unlike Pelican's).

**Step 1: Create file manager `src/web/components/file-manager.tsx`**

A client-side file browser with directory listing, bread crumbs, right-click context menu for rename/delete/chmod, and file editing. Uses TanStack Query for caching.

**Step 2: Create file editor `src/web/components/file-editor.tsx`**

A simple textarea-based editor for small text files, with save functionality.

**Step 3: Wire into server detail page tab**

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add file manager with directory browsing and text editor"
```

---

## Phase 9: Admin Pages

### Task 9.1: Admin node management UI

**Files:**
- Create: `src/web/pages/admin/nodes.tsx`

Node list with status indicators, create/edit forms, live system info from Wings.

### Task 9.2: Admin egg management UI

**Files:**
- Create: `src/web/pages/admin/eggs.tsx`

Egg list, create form, Pelican egg JSON import, variable management.

### Task 9.3: Admin server creation wizard

**Files:**
- Create: `src/web/pages/admin/create-server.tsx`

Multi-step wizard: select node -> select egg -> configure resources -> configure variables -> create.

**Commit after each:**

```bash
git add -A && git commit -m "feat: add admin node management UI"
git add -A && git commit -m "feat: add admin egg management with Pelican import"
git add -A && git commit -m "feat: add server creation wizard"
```

---

## Phase 10: Polish & Deploy

### Task 10.1: Setup script

**Files:**
- Create: `scripts/setup.sh`

One-command setup that creates D1 database, KV namespace, R2 bucket, and generates secrets.

**Step 1: Create setup script**

```bash
#!/bin/bash
echo "Setting up Flamingo Panel..."
npx wrangler d1 create flamingo-db
npx wrangler kv namespace create FLAMINGO_KV
npx wrangler r2 bucket create flamingo-files
npx wrangler secret put JWT_SECRET
echo "Setup complete! Run 'npm run deploy' to deploy."
```

### Task 10.2: First deploy verification

Run: `npm run build && wrangler deploy`
Expected: Deploys successfully, accessible at workers.dev URL.

### Task 10.3: README and deployment docs

**Files:**
- Create: `README.md` (only when requested by user)

---

## Dependency Graph

```
Phase 0 (Scaffolding)
  └── Phase 1 (DB + Auth)
        ├── Phase 2 (Wings Client)
        │     ├── Phase 3 (Node/Server/File/Egg API)
        │     │     └── Phase 5 (Remote API compatibility)
        │     └── Phase 4 (Durable Objects - Console)
        └── Phase 6 (Frontend shell)
              ├── Phase 7 (Server detail + Console UI)
              ├── Phase 8 (File Manager)
              └── Phase 9 (Admin pages)
                    └── Phase 10 (Deploy)
```

---

## Key Architectural Decisions

1. **Single Worker**: One Worker serves both API and frontend assets. Simpler deployment, single wrangler.toml.
2. **Wings compatibility**: We implement the Panel-side API that Wings expects (`/api/remote/*`) so existing Wings nodes work without modification.
3. **Direct WebSocket to Wings**: For v1, the console connects directly to Wings via the browser (Wings URL must be accessible). The Durable Object proxy is available as an alternative when Wings is behind a firewall.
4. **Drizzle ORM**: Type-safe queries against D1's SQLite. Migrations are plain SQL for Wrangler compatibility.
5. **No SFTP built into Panel**: Wings handles SFTP directly. We just validate credentials via the `/api/remote/sftp/auth` endpoint.
6. **JWT for everything**: Panel auth uses JWTs signed with a panel secret. Wings WebSocket JWTs are signed with the node's token (matching Wings' HMAC verification).
