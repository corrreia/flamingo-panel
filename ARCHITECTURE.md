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

**Users never talk to Wings directly.** All communication flows through the Worker. Wings nodes don't need to be publicly exposed to end users — only the Worker needs to reach them.

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
Browser → Metrics:  WebSocket via Durable Object → Wings WebSocket
```

- **Panel to Wings:** Worker makes HTTP calls to Wings using the node's raw `token` for auth. The node URL is typically a cloudflared tunnel.
- **Wings to Panel:** Wings calls `/api/remote/*` endpoints on the Worker using `tokenId.token` format. This is how Wings syncs server state, reports activity, etc.
- **Console WebSocket:** Browser connects to a Durable Object on the Worker, which proxies the WebSocket to Wings using a signed JWT. The browser never connects to Wings directly.
- **Metrics WebSocket:** Same pattern as console — browser connects to a Durable Object that streams real-time node metrics from Wings.

## Project Structure

```
src/
├── env.d.ts                     # Environment type definitions
├── api/
│   ├── index.ts                 # API router + top-level routes
│   ├── auth.ts                  # Login, register, sessions (Better Auth)
│   ├── servers.ts               # Server CRUD, power, reinstall
│   ├── nodes.ts                 # Node CRUD, Wings status checks
│   ├── eggs.ts                  # Egg import, export, CRUD
│   ├── files.ts                 # File manager (proxies to Wings)
│   ├── remote.ts                # Wings → Panel callback endpoints
│   ├── application.ts           # Application API (wings configure)
│   ├── activity.ts              # Activity log endpoints
│   ├── allocations.ts           # User resource allocations + ports
│   ├── notifications.ts         # In-app notification endpoints
│   ├── subusers.ts              # Server subuser management
│   └── middleware/
│       ├── auth.ts              # requireAuth, requireAdmin middleware
│       └── request-logger.ts    # Request logging + error handling
├── lib/
│   ├── auth.ts                  # Better Auth setup (KV sessions)
│   ├── wings-client.ts          # HTTP client for Panel → Wings
│   ├── wings-jwt.ts             # JWT signing for WebSocket tokens
│   ├── egg-import.ts            # Pelican egg JSON parser
│   ├── activity.ts              # Activity logging helpers
│   ├── allocation-check.ts      # User resource allocation checks
│   ├── logger.ts                # Structured logging (logtape)
│   ├── notifications.ts         # Notification queue management
│   ├── port-check.ts            # Port allocation checking
│   └── server-access.ts         # User server access checks
├── db/
│   ├── schema.ts                # Drizzle schema (all tables)
│   ├── auth-schema.ts           # Better Auth tables (users, sessions, accounts)
│   └── index.ts                 # DB helper
├── durable-objects/
│   ├── console-session.ts       # WebSocket proxy to Wings console
│   └── node-metrics.ts          # Node metrics streaming
├── services/
│   ├── api-keys.ts              # API key generation + hashing
│   └── wings-payload.ts         # Wings server payload builder
└── web/
    ├── server.ts                # Worker entry — routes /api/* to Hono, /* to SSR
    ├── app.tsx                  # React app root
    ├── main.tsx                 # Client hydration entry
    ├── router.tsx               # TanStack Router config + QueryClient
    ├── routeTree.gen.ts         # Auto-generated route tree (do not edit)
    ├── index.css                # Tailwind CSS entry
    ├── lib/
    │   ├── api.ts               # Frontend API client (fetch wrapper)
    │   ├── auth.tsx             # Auth context + provider
    │   ├── auth-client.ts       # Better Auth client
    │   ├── codemirror-theme.ts  # CodeMirror theme
    │   ├── format.ts            # Formatting utilities (bytes, dates)
    │   ├── types.ts             # Frontend type definitions
    │   └── utils.ts             # General utilities (cn)
    ├── hooks/
    │   ├── use-file-manager.ts  # File manager state + operations
    │   └── use-node-metrics.ts  # Node metrics WebSocket hook
    ├── components/
    │   ├── ui/                  # shadcn/ui components
    │   ├── layout.tsx           # Main layout wrapper
    │   ├── page-header.tsx      # Page title + breadcrumbs
    │   ├── data-table.tsx       # Reusable table component
    │   ├── table-pagination.tsx # Pagination controls
    │   ├── stat-card.tsx        # Statistics display card
    │   ├── status-dot.tsx       # Status indicator
    │   ├── empty-state.tsx      # Empty state placeholder
    │   ├── notification-bell.tsx # Notification bell + dropdown
    │   ├── code-editor.tsx      # CodeMirror wrapper
    │   └── server/
    │       ├── console-tab.tsx      # Terminal (xterm.js)
    │       ├── files-tab.tsx        # File manager interface
    │       ├── activity-tab.tsx     # Server activity log
    │       ├── power-controls.tsx   # Start/stop/restart/kill
    │       ├── settings-tab.tsx     # Server settings
    │       └── file-manager/
    │           ├── file-table.tsx        # File list
    │           ├── file-toolbar.tsx      # Upload/create/delete toolbar
    │           ├── file-upload.tsx       # Upload handler
    │           ├── file-dialogs.tsx      # Create/rename/delete dialogs
    │           └── file-context-menu.tsx # Right-click menu
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
            ├── activity.tsx         # Activity log (admin)
            └── users.tsx            # User management
```

## Database Schema

### Authentication (Better Auth)
- `users` — id, email, username, role, name, image, verified
- `sessions` — token-based sessions (backed by KV)
- `accounts` — OAuth/OIDC linked accounts
- `verifications` — email verification tokens

### Infrastructure
- `nodes` — game server nodes (id, name, url, token_id, token, upload_size)
- `eggs` — game server configs from Pelican (docker images, startup, scripts, config)
- `egg_variables` — per-egg environment variables with validation rules

### Servers
- `servers` — game servers (uuid, node, owner, egg, resource limits, status, allocations)
- `server_variables` — per-server variable values
- `subusers` — server access with permissions

### Access Control
- `api_keys` — application API keys (hashed tokens, allowed IPs, memo)
- `user_allocations` — resource quotas per user (cpu, memory, disk, server count)
- `port_allocations` — port ranges per user per node

### Logging
- `activity_logs` — user action audit trail
- `wings_activity_logs` — server events reported by Wings
- `notifications` — in-app notifications per user

## Cloudflare Bindings

| Binding | Type | Purpose |
|---------|------|---------|
| `DB` | D1 | SQLite database |
| `KV` | KV | Sessions, WebSocket tickets |
| `R2` | R2 | File storage |
| `CONSOLE_SESSION` | Durable Object | Console WebSocket proxy |
| `NODE_METRICS` | Durable Object | Node metrics streaming |
| `AUTH_RATE_LIMIT` | Rate Limiting | 10 req/60s on auth endpoints |

Environment variables: `PANEL_URL`, `BETTER_AUTH_SECRET`, `OIDC_DISCOVERY_URL`.

## Frontend Conventions

- Routes in `src/web/routes/` using TanStack Router file-based routing
- `useQuery` / `useMutation` from TanStack Query for all data fetching — not `useEffect` + `useState`
- `<Link to="...">` from `@tanstack/react-router` for navigation — not `<a href>`
- `useNavigate()` for programmatic navigation
- `queryClient.invalidateQueries()` after mutations to refresh data
- Wrap authenticated pages in `<Layout>` component
- Access CF bindings in server code via `import { env } from "cloudflare:workers"`

## API Conventions

- All API routes are Hono handlers under `src/api/`
- Auth middleware: `requireAuth` and `requireAdmin` at `src/api/middleware/auth.ts`
- Zod for request validation
- Wings communication via `src/lib/wings-client.ts`
- Remote endpoints (`/api/remote/*`) authenticated by node token, not user session

## Key Design Decisions

- **Single URL field for Wings nodes** instead of separate fqdn/scheme/port fields. Simpler and more flexible.
- **Integer node IDs** because Wings requires numeric `--node` parameters.
- **One-time API keys** for `wings configure` — tagged with `node-configure:{id}` and deleted after use.
- **KV sessions** instead of JWTs for user auth — simpler invalidation.
- **Durable Objects** only for WebSocket proxying (console, metrics) — everything else is stateless Worker requests.
- **Hono for API, TanStack Start for frontend** — clean separation. The API is a real REST API consumed by both the frontend and Wings nodes.
- **Better Auth** for authentication — handles user registration, login, sessions, and OAuth/OIDC account linking.
