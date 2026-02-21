import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Re-export Better Auth tables from dedicated schema file
export { accounts, sessions, users, verifications } from "./auth-schema";

import { users } from "./auth-schema";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const timestamps = {
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
};

// ─── Application tables ──────────────────────────────────────────────────────

export const nodes = sqliteTable("nodes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  url: text("url").notNull().default(""), // full Wings URL e.g. https://wings.example.com
  tokenId: text("token_id").notNull(),
  token: text("token").notNull(),
  uploadSize: integer("upload_size").notNull().default(100),
  ...timestamps,
});

export const eggs = sqliteTable("eggs", {
  id: id(),
  name: text("name").notNull(),
  author: text("author").default(""),
  description: text("description").default(""),
  dockerImage: text("docker_image").notNull().default(""),
  dockerImages: text("docker_images").default("{}"),
  startup: text("startup").notNull().default(""),
  stopCommand: text("stop_command").notNull().default("stop"),
  stopSignal: text("stop_signal").notNull().default("SIGTERM"),
  configStartup: text("config_startup").default("{}"),
  configFiles: text("config_files").default("[]"),
  configLogs: text("config_logs").default("{}"),
  scriptInstall: text("script_install").default(""),
  scriptContainer: text("script_container").default(
    "ghcr.io/pelican-dev/installer:latest"
  ),
  scriptEntry: text("script_entry").default("bash"),
  fileDenylist: text("file_denylist").default("[]"),
  features: text("features").default("{}"),
  tags: text("tags").default("[]"),
  ...timestamps,
});

export const servers = sqliteTable(
  "servers",
  {
    id: id(),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    description: text("description").default(""),
    nodeId: integer("node_id")
      .notNull()
      .references(() => nodes.id),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
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
    defaultAllocationIp: text("default_allocation_ip")
      .notNull()
      .default("0.0.0.0"),
    defaultAllocationPort: integer("default_allocation_port")
      .notNull()
      .default(25_565),
    additionalAllocations: text("additional_allocations").default("[]"),
    status: text("status"),
    containerStatus: text("container_status").default("offline"),
    installedAt: text("installed_at"),
    ...timestamps,
  },
  (table) => [
    index("idx_servers_node").on(table.nodeId),
    index("idx_servers_owner").on(table.ownerId),
  ]
);

export const eggVariables = sqliteTable(
  "egg_variables",
  {
    id: id(),
    eggId: text("egg_id")
      .notNull()
      .references(() => eggs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").default(""),
    envVariable: text("env_variable").notNull(),
    defaultValue: text("default_value").default(""),
    userViewable: integer("user_viewable").notNull().default(0),
    userEditable: integer("user_editable").notNull().default(0),
    rules: text("rules").notNull().default("required|string"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("idx_egg_variables_egg").on(table.eggId)]
);

export const serverVariables = sqliteTable(
  "server_variables",
  {
    id: id(),
    serverId: text("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    variableId: text("variable_id")
      .notNull()
      .references(() => eggVariables.id, { onDelete: "cascade" }),
    variableValue: text("variable_value").notNull().default(""),
  },
  (table) => [
    index("idx_server_variables_server").on(table.serverId),
    uniqueIndex("idx_sv_unique").on(table.serverId, table.variableId),
  ]
);

export const subusers = sqliteTable(
  "subusers",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serverId: text("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    permissions: text("permissions").notNull().default("[]"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [uniqueIndex("idx_su_unique").on(table.userId, table.serverId)]
);

export const apiKeys = sqliteTable("api_keys", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  identifier: text("identifier").notNull().unique(),
  tokenHash: text("token_hash").notNull(),
  memo: text("memo").default(""),
  allowedIps: text("allowed_ips").default("[]"),
  lastUsedAt: text("last_used_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const activityLogs = sqliteTable(
  "activity_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    serverId: text("server_id").references(() => servers.id, {
      onDelete: "cascade",
    }),
    nodeId: integer("node_id").references(() => nodes.id, {
      onDelete: "set null",
    }),
    event: text("event").notNull(),
    metadata: text("metadata").default("{}"),
    ip: text("ip").default(""),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_activity_server").on(table.serverId),
    index("idx_activity_user").on(table.userId),
    index("idx_activity_node").on(table.nodeId),
    index("idx_activity_event").on(table.event),
    index("idx_activity_created").on(table.createdAt),
  ]
);
