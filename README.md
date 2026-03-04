<p align="center">
  <img src="public/flamingo.svg" width="200" />
</p>

<h1 align="center">Flamingo Panel</h1>

<p align="center">
  <strong>Game server management on Cloudflare's edge.</strong>
</p>

> **This project is in early development and does not work yet.**
> The only functional piece so far is node management — you can add Wings nodes, configure them via `wings configure`, and see their system info. Server creation, installation, console, and file management are all still broken or incomplete.

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

## TODO

- [ ] Server installation on Wings (payload is sent but install flow is incomplete)
- [ ] OpenID Connect / OAuth authentication (replace password auth)
- [ ] Cloudflare Tunnel integration for automatic Wings connectivity
- [ ] Server backups (Wings backup API integration)
- [ ] Server schedules / tasks
- [ ] Production deployment and setup docs

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
