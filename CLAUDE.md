
Default to using Bun instead of Node.js.

- Use `bun install` instead of `npm install`
- Use `bun run <script>` instead of `npm run <script>`
- Use `bunx <package>` instead of `npx <package>`
- Do NOT edit `.sql` files, generate migrations, or run migrations. Database schema changes are handled manually by the user.

## Stack

- **Runtime:** Cloudflare Workers (via `@cloudflare/vite-plugin` + Miniflare in dev)
- **API:** Hono + Zod (all routes under `src/api/`)
- **Frontend:** TanStack Start (SSR) + TanStack Router (file-based routing) + TanStack Query (data fetching)
- **UI:** React + Tailwind CSS v4 + shadcn/ui + Radix UI
- **Database:** Cloudflare D1 via Drizzle ORM
- **Sessions:** Cloudflare KV
- **Storage:** Cloudflare R2
- **WebSockets:** Durable Objects

## Project Layout

- `src/web/server.ts` — Worker entry point. Routes `/api/*` to Hono, everything else to TanStack Start SSR.
- `src/web/routes/` — TanStack Router file-based routes (auto-generates `routeTree.gen.ts`)
- `src/web/router.tsx` — Router config + QueryClient setup
- `src/web/components/` — shadcn/ui components + Layout
- `src/web/lib/` — Frontend utilities (API client, auth context)
- `src/api/` — Hono API routes (auth, servers, nodes, eggs, files, remote, activity)
- `src/lib/` — Shared utilities (auth, wings-client, wings-jwt, egg-import, activity)
- `src/db/schema.ts` — Drizzle schema
- `src/db/auth-schema.ts` — Better Auth tables (users, sessions, accounts, verifications)
- `src/durable-objects/` — Durable Object classes (console-session, node-metrics)
- `src/services/` — Service layer (api-keys, wings-payload)
- `src/web/hooks/` — Custom React hooks (e.g. use-node-metrics)
- `wrangler.jsonc` — Cloudflare Worker config (D1, KV, R2, DO bindings)
- `vite.config.ts` — Vite + TanStack Start + Cloudflare plugin config

## Scripts

- `bun run dev` — Start dev server (Vite + Miniflare with all CF bindings)
- `bun run build` — Production build (client + server bundles)
- `bun run deploy` — Build + deploy to Cloudflare
- `bun run test` — Run Vitest tests
- `bun run lint` — Biome lint
- `bun run format` — Biome auto-format
- `bun run check` — Biome check with auto-fix

## Frontend Conventions

- Routes go in `src/web/routes/` using TanStack Router file-based routing
- Use `useQuery` / `useMutation` from TanStack Query for all data fetching — not `useEffect` + `useState`
- Use `<Link to="...">` from `@tanstack/react-router` for navigation — not `<a href>`
- Use `useNavigate()` for programmatic navigation
- Use `queryClient.invalidateQueries()` after mutations to refresh data
- Wrap authenticated pages in `<Layout>` component
- Access CF bindings in server code via `import { env } from "cloudflare:workers"`

## API Conventions

- All API routes are Hono handlers under `src/api/`
- Auth middleware at `src/api/middleware/auth.ts`
- Zod for request validation
- Wings communication via `src/lib/wings-client.ts`

## Code Quality

- Use Biome for linting and formatting (not ESLint/Prettier)
- Run `bun run check` before committing
