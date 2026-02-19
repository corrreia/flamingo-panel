# Flamingo Panel

An open-source game server management panel built entirely on Cloudflare's stack. Drop-in replacement for [Pelican Panel](https://pelican.dev) — reuses existing Pelican Wings nodes, eggs, and the same server management workflow, but runs serverless on Cloudflare Workers.

## Why

Pelican Panel requires a PHP server, MySQL database, Redis, and a reverse proxy. Flamingo replaces all of that with a single Cloudflare Worker — no servers to manage, no infrastructure to maintain.

## Stack

- **Runtime:** Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite)
- **Sessions/Cache:** Cloudflare KV
- **File Storage:** Cloudflare R2
- **WebSocket Proxy:** Durable Objects
- **API:** Hono + Zod
- **Frontend:** React + Tailwind CSS + shadcn/ui
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
| `bun run dev` | Start local dev server |
| `bun run build` | Build frontend |
| `bun run deploy` | Build + deploy to Cloudflare |
| `bun run db:generate` | Generate migrations from schema |
| `bun run db:migrate:dev` | Apply migrations locally |
| `bun run db:migrate:prod` | Apply migrations to production |
| `bun run db:studio` | Open Drizzle Studio |

## License

MIT
