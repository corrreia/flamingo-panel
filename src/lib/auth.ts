import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/d1";
import * as authSchema from "../db/auth-schema";

type AuthRole = "admin" | "user";

interface OidcProfile {
  email?: string;
  groups?: unknown;
  name?: string;
  picture?: string;
  preferred_username?: string;
}

function getAdminGroups(env: Env): Set<string> {
  const groups = env.OIDC_ADMIN_GROUPS?.split(",")
    .map((group: string) => group.trim().toLowerCase())
    .filter(Boolean);

  return new Set(groups?.length ? groups : ["admin"]);
}

function getProfileGroups(profile: OidcProfile): string[] {
  if (!Array.isArray(profile.groups)) {
    return [];
  }

  return profile.groups
    .filter((group): group is string => typeof group === "string")
    .map((group) => group.trim().toLowerCase())
    .filter(Boolean);
}

function getRoleFromProfile(env: Env, profile: OidcProfile): AuthRole {
  const adminGroups = getAdminGroups(env);

  return getProfileGroups(profile).some((group) => adminGroups.has(group))
    ? "admin"
    : "user";
}

/**
 * Create a Better Auth instance per-request.
 * This avoids CSRF origin mismatches between dev (localhost) and production
 * (trycloudflare / custom domain) by deriving baseURL from the request.
 */
export function createAuth(env: Env, requestUrl?: string) {
  const db = drizzle(env.DB);
  const baseURL = requestUrl ? new URL(requestUrl).origin : env.PANEL_URL;

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
    secondaryStorage: {
      get: async (key) => env.KV.get(key),
      set: async (key, value, ttl) => {
        if (ttl) {
          await env.KV.put(key, value, {
            expirationTtl: Math.max(ttl, 60),
          });
          return;
        }

        await env.KV.put(key, value);
      },
      delete: async (key) => {
        await env.KV.delete(key);
      },
    },
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
    },
    session: {},
    account: {
      accountLinking: {
        updateUserInfoOnLink: true,
      },
    },
    plugins: [
      genericOAuth({
        config: [
          {
            providerId: "pocket-id",
            clientId: env.OIDC_CLIENT_ID,
            clientSecret: env.OIDC_CLIENT_SECRET,
            discoveryUrl: env.OIDC_DISCOVERY_URL,
            overrideUserInfo: true,
            scopes: ["openid", "email", "profile", "groups"],
            mapProfileToUser: (profile) => {
              const oidcProfile = profile as OidcProfile;

              return {
                name: oidcProfile.name || oidcProfile.preferred_username || "",
                image: oidcProfile.picture || "",
                role: getRoleFromProfile(env, oidcProfile),
                username:
                  oidcProfile.preferred_username ||
                  oidcProfile.email?.split("@")[0] ||
                  "",
              };
            },
          },
        ],
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
