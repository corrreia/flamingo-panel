# Architecture

## Overview

Flamingo is a single Cloudflare Worker that serves both the API and the frontend. The frontend is server-side rendered by TanStack Start and hydrated on the client with TanStack Router for SPA navigation. The API is a Hono app that talks to D1, KV, R2, and Wings nodes.

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

The Worker entry (`src/web/server.ts`) splits incoming requests:

```
Request ──→ /api/*  ──→ Hono (REST API)
         └─ /*      ──→ TanStack Start (SSR + static assets)
```

Hono handles all backend logic (auth, CRUD, Wings proxy). TanStack Start renders the React frontend with SSR and serves code-split client bundles for SPA navigation.

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
src/
├── env.d.ts                     # Environment type definitions
├── api/
│   ├── index.ts                 # API router
│   ├── auth.ts                  # Login, register, sessions, API keys
│   ├── servers.ts               # Server CRUD, power, console, files
│   ├── nodes.ts                 # Node CRUD, Wings status checks
│   ├── eggs.ts                  # Egg import and management
│   ├── files.ts                 # File manager (proxies to Wings)
│   ├── remote.ts                # Wings → Panel endpoints
│   ├── application.ts           # Application API (wings configure)
│   ├── activity.ts              # Activity log endpoints
│   └── middleware/              # Auth middleware
├── lib/
│   ├── auth.ts                  # Session management (KV-based)
│   ├── wings-client.ts          # HTTP client for Panel → Wings
│   ├── wings-jwt.ts             # JWT signing for WebSocket tokens
│   ├── egg-import.ts            # Pelican egg JSON parser
│   └── activity.ts              # Activity logging helpers
├── db/
│   ├── schema.ts                # Drizzle schema (all tables)
│   ├── auth-schema.ts           # Better Auth tables (users, sessions, accounts)
│   └── index.ts                 # DB helper
├── durable-objects/
│   ├── console-session.ts       # WebSocket proxy to Wings console
│   └── node-metrics.ts          # Node metrics streaming
├── services/
│   ├── api-keys.ts              # API key generation
│   └── wings-payload.ts         # Wings server payload builder
└── web/
    ├── server.ts                # Worker entry — routes /api/* to Hono, /* to TanStack Start
    ├── router.tsx               # TanStack Router config + QueryClient
    ├── routeTree.gen.ts         # Auto-generated route tree (do not edit)
    ├── index.css                # Tailwind CSS entry
    ├── lib/
    │   ├── api.ts               # Frontend API client
    │   ├── auth.tsx             # Auth context + provider
    │   ├── auth-client.ts       # Better Auth client
    │   ├── format.ts            # Formatting utilities
    │   └── utils.ts             # General utilities
    ├── hooks/
    │   └── use-node-metrics.ts  # Node metrics WebSocket hook
    ├── components/
    │   ├── ui/                  # shadcn/ui components
    │   └── layout.tsx           # Main layout wrapper
    └── routes/
        ├── __root.tsx               # Root route (HTML shell, providers)
        ├── index.tsx                # Dashboard (server list)
        ├── login.tsx                # Auth page
        ├── server/$serverId.tsx     # Server detail (console, files, power)
        └── admin/
            ├── nodes/index.tsx      # Node list
            ├── nodes/$nodeId.tsx    # Node detail + settings
            ├── eggs/index.tsx       # Egg list
            ├── eggs/$eggId.tsx      # Egg detail + variables
            ├── eggs/create.tsx      # Egg creation
            ├── create-server.tsx    # Server creation wizard
            └── activity.tsx         # Activity log (admin)
```

## Frontend Architecture

**TanStack Start** provides SSR — pages are rendered on the server and streamed to the browser, then hydrated for client-side interactivity.

**TanStack Router** provides file-based routing with type-safe params. Routes are auto-discovered from `src/web/routes/` and compiled into `routeTree.gen.ts`. Navigation between pages is instant (SPA) without full page reloads.

**TanStack Query** manages all data fetching and mutations. Each page uses `useQuery` for loading data and `useMutation` for actions (create, update, delete). Query invalidation keeps the UI in sync after mutations.

**Hono** remains the API layer — TanStack Start doesn't replace it. Server functions aren't used because the API serves external clients (Wings nodes call `/api/remote/*`), not just the frontend.

## Key Design Decisions

- **Single URL field for Wings nodes** instead of separate fqdn/scheme/port fields. Simpler and more flexible.
- **Integer node IDs** because Wings requires numeric `--node` parameters.
- **One-time API keys** for `wings configure` — tagged with `node-configure:{id}` and deleted after use.
- **KV sessions** instead of JWTs for user auth — simpler invalidation.
- **Durable Objects** only for WebSocket proxying (console) — everything else is stateless Worker requests.
- **Hono for API, TanStack Start for frontend** — clean separation. The API is a real REST API consumed by both the frontend and Wings nodes.
