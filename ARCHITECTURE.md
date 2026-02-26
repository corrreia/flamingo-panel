# Architecture

## Overview

Flamingo is a single Cloudflare Worker that serves both the API and the frontend. The frontend uses **Vinext** (a Vite plugin that reimplements the Next.js App Router) for server-side rendering with React Server Components. The API is a Hono app that talks to D1, KV, R2, and Wings nodes.

```
Browser ──→ Cloudflare Worker ──→ Wings Node(s)
               │
               ├── D1 (database)
               ├── KV (sessions, tickets)
               ├── R2 (file storage)
               └── Durable Objects (WebSocket proxy, node metrics)
```

**Users never talk to Wings directly.** All communication flows through the Worker:

```
Wings ──→ DO/Worker ──→ Frontend
```

The frontend only talks to the Cloudflare Worker API. The Worker proxies everything to/from Wings. This means Wings nodes don't need to be publicly exposed to end users — only the Worker needs to reach them.

## Request Routing

The Worker entry (`worker/index.ts`) splits incoming requests:

```
Request ──→ /api/*  ──→ Hono (REST API)
         └─ /*      ──→ Vinext (App Router SSR/RSC + static assets)
```

Hono handles all backend logic (auth, CRUD, Wings proxy). Vinext renders the React frontend using the Next.js App Router conventions (RSC pipeline, streaming SSR, client hydration).

## Communication Flow

```
Panel → Wings:  HTTP via node URL (Bearer token auth)
Wings → Panel:  HTTP via PANEL_URL (Bearer tokenId.token auth)
Browser → Console:  WebSocket via Durable Object → Wings WebSocket
```

- **Panel to Wings:** Worker makes HTTP calls to Wings using the node's raw `token` for auth. The node URL is typically a cloudflared tunnel.
- **Wings to Panel:** Wings calls `/api/remote/*` endpoints on the Worker using `tokenId.token` format. This is how Wings syncs server state, reports activity, etc.
- **Console WebSocket:** Browser connects to a Durable Object on the Worker, which proxies the WebSocket to Wings using a signed JWT. The browser never connects to Wings directly.

## Project Structure

```
app/                                 # Next.js App Router pages (via Vinext)
├── layout.tsx                       # Root layout (HTML shell, providers)
├── providers.tsx                    # Client-side providers (QueryClient, Auth)
├── page.tsx                         # Dashboard (server list)
├── login/page.tsx                   # Auth page
├── eggs/page.tsx                    # User egg list
├── server/[serverId]/page.tsx       # Server detail (console, files, power)
└── admin/
    ├── nodes/page.tsx               # Node list
    ├── nodes/[nodeId]/page.tsx      # Node detail + settings
    ├── eggs/page.tsx                # Egg list
    ├── eggs/create/page.tsx         # Egg creation
    ├── eggs/[eggId]/page.tsx        # Egg detail + variables
    ├── create-server/page.tsx       # Server creation wizard
    └── activity/page.tsx            # Activity log (admin)
worker/
└── index.ts                         # CF Worker entry — routes /api/* to Hono, /* to Vinext
src/
├── env.d.ts                         # Environment type definitions
├── api/
│   ├── index.ts                     # API router
│   ├── auth.ts                      # Login, register, sessions, API keys
│   ├── servers.ts                   # Server CRUD, power, console, files
│   ├── nodes.ts                     # Node CRUD, Wings status checks
│   ├── eggs.ts                      # Egg import and management
│   ├── files.ts                     # File manager (proxies to Wings)
│   ├── remote.ts                    # Wings → Panel endpoints
│   ├── application.ts               # Application API (wings configure)
│   ├── activity.ts                  # Activity log endpoints
│   └── middleware/                   # Auth middleware
├── lib/
│   ├── auth.ts                      # Session management (KV-based)
│   ├── wings-client.ts              # HTTP client for Panel → Wings
│   ├── wings-jwt.ts                 # JWT signing for WebSocket tokens
│   ├── egg-import.ts                # Pelican egg JSON parser
│   └── activity.ts                  # Activity logging helpers
├── db/
│   ├── schema.ts                    # Drizzle schema (all tables)
│   ├── auth-schema.ts               # Better Auth tables (users, sessions, accounts)
│   └── index.ts                     # DB helper
├── durable-objects/
│   ├── console-session.ts           # WebSocket proxy to Wings console
│   └── node-metrics.ts              # Node metrics streaming
├── services/
│   ├── api-keys.ts                  # API key generation
│   └── wings-payload.ts             # Wings server payload builder
└── web/
    ├── index.css                    # Tailwind CSS entry
    ├── lib/
    │   ├── api.ts                   # Frontend API client
    │   ├── auth.tsx                 # Auth context + provider
    │   ├── auth-client.ts           # Better Auth client
    │   ├── format.ts                # Formatting utilities
    │   └── utils.ts                 # General utilities
    ├── hooks/
    │   └── use-node-metrics.ts      # Node metrics WebSocket hook
    └── components/
        ├── ui/                      # shadcn/ui components
        ├── layout.tsx               # Main layout wrapper (nav, sidebar)
        ├── page-header.tsx          # Reusable page header
        └── server/                  # Server detail components
```

## Frontend Architecture

**Vinext** provides the Next.js App Router experience on Vite. Pages in `app/` are rendered using React Server Components (RSC) and streamed to the browser, then hydrated for client-side interactivity. All page components are marked `"use client"` since they use React Query hooks for data fetching.

**React Query** (`@tanstack/react-query`) manages all data fetching and mutations. Each page uses `useQuery` for loading data and `useMutation` for actions (create, update, delete). Query invalidation keeps the UI in sync after mutations.

**Hono** remains the API layer — Vinext doesn't replace it. The API serves external clients (Wings nodes call `/api/remote/*`), not just the frontend, so it needs to be a standalone REST API.

**Routing** uses Next.js App Router conventions:
- `app/page.tsx` → `/`
- `app/server/[serverId]/page.tsx` → `/server/:serverId`
- `app/admin/nodes/[nodeId]/page.tsx` → `/admin/nodes/:nodeId`
- Navigation uses `<Link href="...">` from `next/link`
- Programmatic navigation uses `useRouter()` from `next/navigation`

## Key Design Decisions

- **Vinext over TanStack Start** — Vinext reimplements the Next.js API surface on Vite, deploying to Cloudflare Workers. This gives us the well-known Next.js App Router conventions while keeping the Vite build toolchain.
- **Hono stays as the API layer** — The API serves both the browser frontend and Wings nodes. Vinext/Next.js API routes are not used.
- **Custom worker entry** — `worker/index.ts` splits requests between Hono (API) and Vinext (frontend), and exports Durable Object classes.
- **Single URL field for Wings nodes** instead of separate fqdn/scheme/port fields. Simpler and more flexible.
- **Integer node IDs** because Wings requires numeric `--node` parameters.
- **One-time API keys** for `wings configure` — tagged with `node-configure:{id}` and deleted after use.
- **KV sessions** instead of JWTs for user auth — simpler invalidation.
- **Durable Objects** only for WebSocket proxying (console, metrics) — everything else is stateless Worker requests.
