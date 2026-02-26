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
- Egg management (import from Pelican JSON, list, detail, create)
- User registration and login
- Activity logging (admin page with filters/pagination, server activity tab)

## TODO

- [ ] Server installation on Wings (payload is sent but install flow is incomplete)
- [ ] Server console (WebSocket proxy via Durable Objects — partially built)
- [ ] File manager (proxies to Wings — partially built)
- [ ] Power actions (start/stop/restart/kill)
- [ ] OpenID Connect / OAuth authentication (replace password auth)
- [ ] Cloudflare Tunnel integration for automatic Wings connectivity
- [ ] Server backups (Wings backup API integration)
- [ ] Subuser permissions
- [ ] Server schedules / tasks
- [ ] Server resource usage monitoring
- [ ] Production deployment and setup docs

## Stack

- **Runtime:** Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite)
- **Sessions/Cache:** Cloudflare KV
- **File Storage:** Cloudflare R2
- **WebSocket Proxy:** Durable Objects
- **API:** Hono + Zod
- **Frontend:** Vinext (Next.js App Router on Vite) + React Query + React + Tailwind CSS + shadcn/ui
- **ORM:** Drizzle

## Getting Started

```bash
bun install
bun run db:generate
bun run db:migrate:dev
bun run dev
```

Set `PANEL_URL` in `wrangler.jsonc` to the URL where your panel is reachable (e.g. a cloudflared tunnel URL).

## Wings Setup

1. Create a node in the admin UI
2. Copy the `wings configure` command shown after creation
3. Run it on your Wings machine
4. Set the Wings URL on the node (the cloudflared tunnel or direct URL)
5. Create servers and manage them as usual

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start local dev server (Vinext + Miniflare with all CF bindings) |
| `bun run build` | Production build (RSC + SSR + client bundles) |
| `bun run start` | Start local production server |
| `bun run deploy` | Build + deploy to Cloudflare Workers |
| `bun run db:generate` | Generate migrations from schema |
| `bun run db:migrate:dev` | Apply migrations locally |
| `bun run db:migrate:prod` | Apply migrations to production |
| `bun run db:studio` | Open Drizzle Studio |
| `bun run studio` | Local Drizzle Studio via localflare |
| `bun run test` | Run Vitest tests |
| `bun run lint` | Biome lint |
| `bun run format` | Biome auto-format |
| `bun run check` | Biome check with auto-fix |

## License

MIT
