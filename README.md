<p align="center">
  <img src="public/flamingo.svg" width="200" />
</p>

<h1 align="center">Flamingo Panel</h1>

<p align="center">
  <strong>Game server management on Cloudflare's edge.</strong>
</p>

> **Early development — functional but not production-hardened.** Core features work: server management, console, files, backups, power controls. Missing: server schedules, Cloudflare Tunnel auto-setup.

An open-source game server management panel built entirely on Cloudflare's stack. Drop-in replacement for [Pelican Panel](https://pelican.dev) — reuses existing Pelican Wings nodes, eggs, and the same server management workflow, but runs serverless on Cloudflare Workers.

## Why

Pelican Panel requires a PHP server, MySQL database, Redis, and a reverse proxy. Flamingo replaces all of that with a single Cloudflare Worker — no servers to manage, no infrastructure to maintain.

## What Works

- Admin UI for managing nodes (create, edit, delete, view system info)
- `wings configure` auto-setup (one-time API key, configure command generation)
- Wings connectivity check (online/offline status, OS/kernel/Docker info)
- Egg management (import from Pelican JSON, create, edit, export, list, detail)
- User management (registration, login, admin user list)
- Activity logging (admin page with filters/pagination, server activity tab, Wings activity)
- Notification system (in-app notifications with bell icon)
- User resource allocations and port management
- Subuser management (add/remove subusers with permissions)
- Server file manager (list, edit, upload, download, rename, copy, compress, delete)
- Server console (WebSocket terminal via Durable Objects)
- Server power actions (start, stop, restart, kill)
- Real-time node metrics (CPU, memory, disk via WebSocket)
- Server creation and installation on Wings
- Server backups (R2: create, restore, lock/unlock, delete, presigned downloads)

## TODO

- [ ] Server schedules / tasks
- [ ] Cloudflare Tunnel integration for automatic Wings connectivity
- [ ] Multi-provider OAuth / admin configuration UI
- [ ] Production hardening

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) via Drizzle ORM |
| Sessions/Cache | Cloudflare KV |
| File Storage | Cloudflare R2 |
| WebSockets | Durable Objects |
| API | Hono + Zod |
| Auth | Better Auth |
| Frontend | TanStack Start (SSR) + TanStack Router + TanStack Query |
| UI | React 19 + Tailwind CSS v4 + shadcn/ui + Radix UI |
| Terminal | xterm.js |
| Code Editor | CodeMirror 6 |
| Linting | Biome |
| Build | Vite |
| Package Manager | Bun |

## Getting Started

```bash
bun install
bun run db:generate
bun run db:migrate:dev
bun run dev
```

Set `PANEL_URL` in `wrangler.jsonc` to the URL where your panel is reachable (e.g. a cloudflared tunnel URL).

Copy `.env.example` to `.env` and fill in `BETTER_AUTH_SECRET` and any OIDC credentials.

## Wings Setup

1. Create a node in the admin UI
2. Copy the `wings configure` command shown after creation
3. Run it on your Wings machine
4. Set the Wings URL on the node (the cloudflared tunnel or direct URL)
5. Create servers and manage them as usual

## Production Deployment

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) on the **Workers Paid** plan (required for D1, KV, R2, Durable Objects)
- [Bun](https://bun.sh) installed locally
- An OIDC provider (e.g. [Pocket ID](https://github.com/stonith404/pocket-id), [Authentik](https://goauthentik.io/), [Keycloak](https://www.keycloak.org/)) with a client configured for your panel's callback URL: `https://<your-domain>/api/auth/callback/pocket-id`

### 1. Create Cloudflare resources

```bash
# Install wrangler if you haven't
bun add -g wrangler

# Authenticate
wrangler login

# Create D1 database
wrangler d1 create flamingo-d1

# Create KV namespace
wrangler kv namespace create KV

# Create R2 bucket
wrangler r2 bucket create flamingo-r2
```

Save the IDs from each command — you'll need them in the next step.

### 2. Configure

Clone the repo and update `wrangler.jsonc`:

```jsonc
{
  "routes": [{ "pattern": "your-domain.com", "custom_domain": true }],
  "vars": {
    "PANEL_URL": "https://your-domain.com",
    "OIDC_DISCOVERY_URL": "https://your-oidc-provider/.well-known/openid-configuration",
    "CF_ACCOUNT_ID": "<your-account-id>",
    "R2_BUCKET_NAME": "flamingo-r2"
  },
  "d1_databases": [{ "binding": "DB", "database_name": "flamingo-d1", "database_id": "<from-step-1>" }],
  "kv_namespaces": [{ "binding": "KV", "id": "<from-step-1>" }],
  "r2_buckets": [{ "binding": "R2", "bucket_name": "flamingo-r2" }]
}
```

### 3. Set secrets

```bash
# Auth secret — generate with: openssl rand -base64 32
wrangler secret put BETTER_AUTH_SECRET

# OIDC credentials from your provider
wrangler secret put OIDC_CLIENT_ID
wrangler secret put OIDC_CLIENT_SECRET

# R2 S3-compatible API credentials (create in CF dashboard → R2 → Manage R2 API Tokens)
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
```

### 4. Deploy

```bash
bun install
bun run db:migrate:prod
bun run deploy
```

Your panel is now live. The first registered user becomes admin.

### 5. Add Wings nodes

See [Wings Setup](#wings-setup) above. Wings nodes connect back to your panel via `PANEL_URL`, so make sure it's reachable from your node machines.

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start local dev server (Vite + Miniflare with all CF bindings) |
| `bun run build` | Build client + server bundles |
| `bun run deploy` | Build + deploy to Cloudflare |
| `bun run test` | Run Vitest tests |
| `bun run lint` | Biome lint |
| `bun run format` | Biome auto-format |
| `bun run check` | Biome check with auto-fix |
| `bun run db:generate` | Generate migrations from schema |
| `bun run db:migrate:dev` | Apply migrations locally |
| `bun run db:migrate:prod` | Apply migrations to production |
| `bun run db:studio` | Open Drizzle Studio |

## License

MIT
