# Architecture

## Overview

Flamingo is a single Cloudflare Worker that serves both the API and the frontend. The frontend is a React SPA served as static assets. The API is a Hono app that talks to D1, KV, R2, and Wings nodes.

```
Browser ──→ Cloudflare Worker ──→ Wings Node(s)
               │
               ├── D1 (database)
               ├── KV (sessions, tickets)
               ├── R2 (file storage)
               └── Durable Objects (WebSocket proxy)
```

**Users never talk to Wings directly.** All communication flows through the Worker:

```
Wings ──→ DO/Worker ──→ Frontend
```

The frontend only talks to the Cloudflare Worker API. The Worker proxies everything to/from Wings. This means Wings nodes don't need to be publicly exposed to end users — only the Worker needs to reach them.

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
├── index.ts                 # Worker entrypoint, mounts all routes
├── env.ts                   # Environment type definitions
├── api/
│   ├── index.ts             # API router
│   ├── auth.ts              # Login, register, sessions, API keys
│   ├── servers.ts           # Server CRUD, power, console, files
│   ├── nodes.ts             # Node CRUD, Wings status checks
│   ├── eggs.ts              # Egg import and management
│   ├── files.ts             # File manager (proxies to Wings)
│   ├── remote.ts            # Wings → Panel endpoints
│   ├── application.ts       # Application API (wings configure)
│   └── middleware/           # Auth middleware
├── lib/
│   ├── auth.ts              # Session management (KV-based)
│   ├── wings-client.ts      # HTTP client for Panel → Wings
│   ├── wings-jwt.ts         # JWT signing for WebSocket tokens
│   └── rate-limit.ts        # KV-based rate limiting
├── db/
│   ├── schema.ts            # Drizzle schema (all tables)
│   └── index.ts             # DB helper
├── durable-objects/
│   └── console-session.ts   # WebSocket proxy to Wings console
└── web/
    ├── App.tsx               # Router and layout
    ├── lib/                  # Frontend utilities
    ├── components/           # shadcn/ui components
    └── pages/
        ├── login.tsx         # Auth page
        ├── dashboard.tsx     # Server list
        ├── server.tsx        # Server detail (console, files, power)
        └── admin/
            ├── nodes.tsx         # Node list
            ├── node-detail.tsx   # Node detail + settings
            ├── eggs.tsx          # Egg management
            └── create-server.tsx # Server creation wizard
```

## Key Design Decisions

- **Single URL field for Wings nodes** instead of separate fqdn/scheme/port fields. Simpler and more flexible.
- **Integer node IDs** because Wings requires numeric `--node` parameters.
- **One-time API keys** for `wings configure` — tagged with `node-configure:{id}` and deleted after use.
- **KV sessions** instead of JWTs for user auth — simpler invalidation.
- **Durable Objects** only for WebSocket proxying (console) — everything else is stateless Worker requests.
