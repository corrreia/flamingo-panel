import { genericOAuthClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL:
    typeof window !== "undefined"
      ? `${window.location.origin}/api/auth`
      : "http://localhost/api/auth",
  plugins: [genericOAuthClient()],
});

export const { useSession, signOut } = authClient;
