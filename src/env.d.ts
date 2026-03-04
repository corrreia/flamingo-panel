// Augment the auto-generated Env interface with secret bindings
// that are set via `wrangler secret` and not present in wrangler.jsonc vars.
interface Env {
  BETTER_AUTH_SECRET: string;
  OIDC_CLIENT_ID: string;
  OIDC_CLIENT_SECRET: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
}
