import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/d1";
import * as authSchema from "../db/auth-schema";

const db = drizzle(env.DB);

export const auth = betterAuth({
  baseURL: env.PANEL_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    usePlural: true,
    schema: {
      user: authSchema.users,
      session: authSchema.sessions,
      account: authSchema.accounts,
      verification: authSchema.verifications,
    },
  }),
  user: {
    additionalFields: {
      role: {
        type: ["user", "admin"] as const,
        required: false,
        defaultValue: "user",
        input: false,
      },
      username: {
        type: "string",
        required: false,
        defaultValue: "",
        input: false,
      },
    },
    modelName: "users",
  },
  session: {
    modelName: "sessions",
  },
  account: {
    modelName: "accounts",
  },
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "pocket-id",
          clientId: env.OIDC_CLIENT_ID,
          clientSecret: env.OIDC_CLIENT_SECRET,
          discoveryUrl: env.OIDC_DISCOVERY_URL,
          scopes: ["openid", "email", "profile"],
          mapProfileToUser: (profile) => ({
            name: profile.name || profile.preferred_username || "",
            username:
              profile.preferred_username || profile.email?.split("@")[0] || "",
          }),
        },
      ],
    }),
  ],
});

export type Auth = typeof auth;
