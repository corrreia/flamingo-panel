import { sql } from "drizzle-orm";
import {
  customType,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

// ─── Better Auth core tables ─────────────────────────────────────────────────
// These match the schema Better Auth expects when using the Drizzle adapter
// with `usePlural: true`. Additional custom fields (role, username) are added
// to the users table for application-specific needs.

// D1 rejects JavaScript Date objects — only primitives are allowed.
// Better Auth passes Date objects for timestamp fields, so we use a custom
// column type that serializes them to ISO strings before they reach D1.
const dateText = customType<{ data: string; driverData: string }>({
  dataType() {
    return "text";
  },
  toDriver(value): string {
    if (value instanceof Date) return value.toISOString();
    return String(value);
  },
});

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const timestamps = {
  createdAt: dateText("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: dateText("updated_at").notNull().default(sql`(datetime('now'))`),
};

export const users = sqliteTable("users", {
  id: id(),
  name: text("name").notNull().default(""),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  // ── Custom fields (not part of Better Auth core) ──
  role: text("role", { enum: ["admin", "user"] })
    .notNull()
    .default("user"),
  username: text("username").notNull().default(""),
  ...timestamps,
});

export const sessions = sqliteTable("sessions", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: dateText("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  ...timestamps,
});

export const accounts = sqliteTable("accounts", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: dateText("access_token_expires_at"),
  refreshTokenExpiresAt: dateText("refresh_token_expires_at"),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  ...timestamps,
});

export const verifications = sqliteTable("verifications", {
  id: id(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: dateText("expires_at").notNull(),
  ...timestamps,
});
