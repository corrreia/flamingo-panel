import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/d1";
import * as authSchema from "../db/auth-schema";

/**
 * Create a Better Auth instance per-request.
 * This avoids CSRF origin mismatches between dev (localhost) and production
 * (trycloudflare / custom domain) by deriving baseURL from the request.
 */
export function createAuth(env: Env, requestUrl?: string) {
  const db = drizzle(env.DB);
  const baseURL = requestUrl
    ? new URL(requestUrl).origin
    : env.PANEL_URL;

  return betterAuth({
    baseURL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      usePlural: true,
      schema: {
        users: authSchema.users,
        sessions: authSchema.sessions,
        accounts: authSchema.accounts,
        verifications: authSchema.verifications,
      },
    }),
    user: {
      additionalFields: {
        role: {
          type: ["user", "admin"] as const,
          required: false,
          defaultValue: "admin",
          input: false,
        },
        username: {
          type: "string",
          required: false,
          defaultValue: "",
          input: false,
        },
      },
    },
    session: {},
    account: {},
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
              image: profile.picture || "",
              username:
                profile.preferred_username ||
                profile.email?.split("@")[0] ||
                "",
            }),
          },
        ],
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
