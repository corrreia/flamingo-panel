
Default to using Bun instead of Node.js.

- Use `bun install` instead of `npm install`
- Use `bun run <script>` instead of `npm run <script>`
- Use `bunx <package>` instead of `npx <package>`
- Do NOT edit `.sql` files, generate migrations, or run migrations. Database schema changes are handled manually by the user.

## Stack

- **Runtime:** Cloudflare Workers (via `@cloudflare/vite-plugin` + Miniflare in dev)
- **Frontend:** Vinext (Next.js App Router on Vite) + React Query (data fetching)
- **UI:** React + Tailwind CSS v4 + shadcn/ui + Radix UI
- **API:** Hono + Zod (all routes under `src/api/`)
- **Database:** Cloudflare D1 via Drizzle ORM
- **Sessions:** Cloudflare KV
- **Storage:** Cloudflare R2
- **WebSockets:** Durable Objects

## Project Layout

- `worker/index.ts` — Worker entry point. Routes `/api/*` to Hono, everything else to Vinext.
- `app/` — Next.js App Router pages (via Vinext). Each route is a `page.tsx` file.
- `app/layout.tsx` — Root layout (HTML shell, meta, CSS import)
- `app/providers.tsx` — Client-side providers (QueryClient, AuthProvider)
- `src/web/components/` — shadcn/ui components + Layout
- `src/web/lib/` — Frontend utilities (API client, auth context)
- `src/web/hooks/` — Custom React hooks (e.g. use-node-metrics)
- `src/api/` — Hono API routes (auth, servers, nodes, eggs, files, remote, activity)
- `src/lib/` — Shared utilities (auth, wings-client, wings-jwt, egg-import, activity)
- `src/db/schema.ts` — Drizzle schema
- `src/db/auth-schema.ts` — Better Auth tables (users, sessions, accounts, verifications)
- `src/durable-objects/` — Durable Object classes (console-session, node-metrics)
- `src/services/` — Service layer (api-keys, wings-payload)
- `vite.config.ts` — Vite + Vinext + RSC + Cloudflare plugin config
- `wrangler.jsonc` — Cloudflare Worker config (D1, KV, R2, DO bindings)
- `next.config.ts` — Vinext/Next.js config (minimal)

## Scripts

- `bun run dev` — Start dev server (Vinext + Miniflare with all CF bindings)
- `bun run build` — Production build (RSC + SSR + client bundles)
- `bun run start` — Start local production server
- `bun run deploy` — Build + deploy to Cloudflare Workers
- `bun run test` — Run Vitest tests
- `bun run lint` — Biome lint
- `bun run format` — Biome auto-format
- `bun run check` — Biome check with auto-fix

## Frontend Conventions

- Routes go in `app/` using Next.js App Router conventions (`page.tsx`, `layout.tsx`)
- Use `"use client"` directive for pages that use hooks (most pages)
- Use `<Link href="...">` from `next/link` for navigation
- Use `useRouter()` from `next/navigation` for programmatic navigation
- Use `useParams()` from `next/navigation` or page `params` prop for route params
- Use `useQuery` / `useMutation` from TanStack Query for all data fetching — not `useEffect` + `useState`
- Use `queryClient.invalidateQueries()` after mutations to refresh data
- Wrap authenticated pages in `<Layout>` component
- Access CF bindings in server code via `import { env } from "cloudflare:workers"`

## API Conventions

- All API routes are Hono handlers under `src/api/`
- Auth middleware at `src/api/middleware/auth.ts`
- Zod for request validation
- Wings communication via `src/lib/wings-client.ts`
- API routes are NOT in `app/api/` — Hono handles all `/api/*` requests via the worker entry

## Code Quality

- Use Biome for linting and formatting (not ESLint/Prettier)
- Run `bun run check` before committing
