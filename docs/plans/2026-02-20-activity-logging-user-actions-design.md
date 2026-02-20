# Panel-Side Activity Logging — Design

## Goal

Log every human-initiated action in the panel to the existing `activity_logs` table so admins can audit who did what, when, and from where.

## Approach

A small `logActivity` helper function extracts userId and IP from the Hono context and inserts into `activity_logs`. Called inline in each API handler after the action succeeds. Fire-and-forget — logging failures don't break the action.

## Event Naming

`resource:action` format (matches Wings convention). Filterable by prefix (`server:`, `node:`, `file:`, etc.).

## Events (21 total)

### Servers (5)
- `server:create` — metadata: `{ name, nodeId }`
- `server:power` — metadata: `{ action }` (start/stop/restart/kill)
- `server:command` — metadata: `{ command }`
- `server:reinstall` — no metadata
- `server:delete` — metadata: `{ name }`

### Nodes (4)
- `node:create` — metadata: `{ name }`
- `node:update` — metadata: `{ name }`
- `node:reconfigure` — no metadata
- `node:delete` — metadata: `{ name }`

### Eggs (4)
- `egg:create` — metadata: `{ name }`
- `egg:update` — metadata: `{ name }`
- `egg:import` — metadata: `{ name }`
- `egg:delete` — metadata: `{ name }`

### Files (7)
- `file:write` — metadata: `{ file }`
- `file:rename` — metadata: `{ files }`
- `file:copy` — metadata: `{ location }`
- `file:delete` — metadata: `{ files }`
- `file:create-directory` — metadata: `{ name, path }`
- `file:compress` — metadata: `{ files }`
- `file:decompress` — metadata: `{ file }`

### API Keys (1)
- `api-key:create` — metadata: `{ memo }`

## What is NOT logged

- Wings callbacks (already handled via POST /remote/activity)
- Durable Object internals (console session audit)
- Application API (system-level, wings configure)
- Read-only actions (list, get, view)
