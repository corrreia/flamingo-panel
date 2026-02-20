# Pelican Wings Agent -- Complete API Reference

This document provides a comprehensive reference for the **Pelican Wings** HTTP and WebSocket API. Wings is the server control-plane daemon that runs on game server machines, managing Docker containers, file systems, backups, and more. Flamingo Panel communicates with unmodified Wings instances to manage game servers.

> **Source:** This reference is derived from the [pelican-dev/wings](https://github.com/pelican-dev/wings) Go codebase (Gin router).

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Authentication](#authentication)
  - [Bearer Token (Panel-to-Wings)](#bearer-token-panel-to-wings)
  - [JWT Signed Tokens (One-Time Use)](#jwt-signed-tokens-one-time-use)
  - [WebSocket JWT Authentication](#websocket-jwt-authentication)
- [Global Middleware](#global-middleware)
- [Public Endpoints (No Auth / Signed URL)](#public-endpoints)
  - [GET /download/backup](#get-downloadbackup)
  - [GET /download/file](#get-downloadfile)
  - [POST /upload/file](#post-uploadfile)
- [WebSocket Endpoint](#websocket-endpoint)
  - [GET /api/servers/:server/ws](#get-apiserversserverws)
  - [WebSocket Authentication Flow](#websocket-authentication-flow)
  - [Client-to-Server Events (Inbound)](#client-to-server-events-inbound)
  - [Server-to-Client Events (Outbound)](#server-to-client-events-outbound)
  - [WebSocket Rate Limiting](#websocket-rate-limiting)
  - [WebSocket Permissions](#websocket-permissions)
  - [Token Expiration and Renewal](#token-expiration-and-renewal)
  - [Token Denylist](#token-denylist)
- [Transfer Endpoint (JWT Auth)](#transfer-endpoint)
  - [POST /api/transfers](#post-apitransfers)
- [Protected Endpoints (Bearer Token)](#protected-endpoints)
  - [System](#system-endpoints)
    - [POST /api/update](#post-apiupdate)
    - [GET /api/system](#get-apisystem)
    - [GET /api/diagnostics](#get-apidiagnostics)
    - [GET /api/system/docker/disk](#get-apisystemdockerdisk)
    - [DELETE /api/system/docker/image/prune](#delete-apisystemdockerimageprune)
    - [GET /api/system/ips](#get-apisystemips)
    - [GET /api/system/utilization](#get-apisystemutilization)
  - [Server Collection](#server-collection-endpoints)
    - [GET /api/servers](#get-apiservers)
    - [POST /api/servers](#post-apiservers)
  - [User Management](#user-management-endpoints)
    - [POST /api/deauthorize-user](#post-apideauthorize-user)
  - [Transfer Management](#transfer-management-endpoints)
    - [DELETE /api/transfers/:server](#delete-apitransfersserver)
- [Server-Specific Endpoints (Bearer + Server Exists)](#server-specific-endpoints)
  - [Server Info](#server-info)
    - [GET /api/servers/:server](#get-apiserversserver)
    - [DELETE /api/servers/:server](#delete-apiserversserver)
  - [Logs](#server-logs)
    - [GET /api/servers/:server/logs](#get-apiserversserverlogs)
    - [GET /api/servers/:server/install-logs](#get-apiserversserverinstall-logs)
  - [Power & Commands](#power--commands)
    - [POST /api/servers/:server/power](#post-apiserversserverpower)
    - [POST /api/servers/:server/commands](#post-apiserversservercommands)
  - [Lifecycle](#server-lifecycle)
    - [POST /api/servers/:server/install](#post-apiserversserverinstall)
    - [POST /api/servers/:server/reinstall](#post-apiserversserverreinstall)
    - [POST /api/servers/:server/sync](#post-apiserversserversync)
  - [WebSocket Token Management](#websocket-token-management)
    - [POST /api/servers/:server/ws/deny](#post-apiserversserverwsdeny)
  - [Transfer](#server-transfer)
    - [POST /api/servers/:server/transfer](#post-apiserversservertransfer)
    - [DELETE /api/servers/:server/transfer](#delete-apiserversservertransfer)
  - [Backup Management](#backup-management)
    - [DELETE /api/servers/:server/deleteAllBackups](#delete-apiserversserverdeleteallbackups)
  - [File Management](#file-management)
    - [GET /api/servers/:server/files/contents](#get-apiserversserverfilescontents)
    - [GET /api/servers/:server/files/list-directory](#get-apiserversserverfileslist-directory)
    - [PUT /api/servers/:server/files/rename](#put-apiserversserverfilesrename)
    - [POST /api/servers/:server/files/copy](#post-apiserversserverfilescopy)
    - [POST /api/servers/:server/files/write](#post-apiserversserverfileswrite)
    - [POST /api/servers/:server/files/create-directory](#post-apiserversserverfilescreate-directory)
    - [POST /api/servers/:server/files/delete](#post-apiserversserverfilesdelete)
    - [POST /api/servers/:server/files/compress](#post-apiserversserverfilescompress)
    - [POST /api/servers/:server/files/decompress](#post-apiserversserverfilesdecompress)
    - [POST /api/servers/:server/files/chmod](#post-apiserversserverfileschmod)
    - [GET /api/servers/:server/files/search](#get-apiserversserverfilessearch)
    - [GET /api/servers/:server/files/pull](#get-apiserversserverfilespull)
    - [POST /api/servers/:server/files/pull](#post-apiserversserverfilespull)
    - [DELETE /api/servers/:server/files/pull/:download](#delete-apiserversserverfilespulldownload)
  - [Backup Operations](#backup-operations)
    - [POST /api/servers/:server/backup](#post-apiserversserverbackup)
    - [POST /api/servers/:server/backup/:backup/restore](#post-apiserversserverbackupbackuprestore)
    - [DELETE /api/servers/:server/backup/:backup](#delete-apiserversserverbackupbackup)
- [Data Structures](#data-structures)
  - [Server APIResponse](#server-apiresponse)
  - [ResourceUsage (Stats)](#resourceusage-stats)
  - [Filesystem Stat](#filesystem-stat)
  - [SystemInformation](#systeminformation)
  - [SystemUtilization](#systemutilization)
  - [DockerDiskUsage](#dockerdiskusage)
- [Error Handling](#error-handling)
- [CORS Configuration](#cors-configuration)

---

## Architecture Overview

```
Panel (Flamingo/Pelican)
    |
    |-- HTTPS (Bearer token) -----> Wings HTTP API
    |                                  |
    |-- Signed JWT (one-time) -----> /download/*, /upload/file
    |
    |
Browser
    |
    |-- WebSocket (via Panel proxy) --> Wings /api/servers/:server/ws
         Auth: JWT sent as first message after connection
```

Wings exposes a single HTTP server (default port 8080) with:
- **Public endpoints** authenticated via signed JWTs (downloads, uploads, WebSocket)
- **Protected endpoints** authenticated via Bearer token (all Panel-to-Wings API calls)
- **WebSocket endpoint** for real-time server console and status updates

All protected endpoints require the `Authorization: Bearer <token>` header where `<token>` matches the node's configured authentication token.

---

## Authentication

### Bearer Token (Panel-to-Wings)

All protected API endpoints require the Panel's node token in the `Authorization` header:

```
Authorization: Bearer <node_token>
```

The token is compared using constant-time comparison against the value stored in Wings' `config.yml`. This token is configured when a node is set up in the Panel.

**Response on failure:**
- Missing/malformed header: `401 Unauthorized` with `WWW-Authenticate: Bearer`
- Invalid token: `403 Forbidden`

### JWT Signed Tokens (One-Time Use)

Download, upload, and transfer endpoints use signed JWTs instead of Bearer tokens. These JWTs are signed by the Panel using the node's token as the HMAC secret (HS256). Each JWT contains a `unique_id` field that is consumed on first use, making them one-time-use tokens.

**JWT Payload Types:**

| Type | Fields | Used By |
|------|--------|---------|
| `BackupPayload` | `server_uuid`, `backup_uuid`, `unique_id` | `GET /download/backup` |
| `FilePayload` | `file_path`, `server_uuid`, `unique_id` | `GET /download/file` |
| `UploadPayload` | `server_uuid`, `user_uuid`, `unique_id` | `POST /upload/file` |
| `TransferPayload` | `sub` (server UUID in subject) | `POST /api/transfers` |
| `WebsocketPayload` | `user_uuid`, `server_uuid`, `permissions[]` | WebSocket auth event |

All JWTs include standard claims: `iat` (issued at), `exp` (expiration), `jti` (JWT ID).

### WebSocket JWT Authentication

WebSocket connections require a JWT sent as the first message after the WebSocket upgrade completes. The JWT is **not** passed in the URL or headers -- it is sent as a WebSocket message with event type `"auth"`. See the [WebSocket section](#websocket-endpoint) for details.

---

## Global Middleware

Every request to Wings passes through these middleware layers:

| Middleware | Purpose |
|-----------|---------|
| `AttachRequestID` | Generates a UUID for each request, set as `X-Request-Id` response header |
| `CaptureErrors` | Standardized error handling; returns JSON errors with `request_id` |
| `SetAccessControlHeaders` | CORS headers (origin validation, methods, credentials) |
| `AttachServerManager` | Makes the server manager available to all routes |
| `AttachApiClient` | Makes the Panel API client available to all routes |
| `gin.LoggerWithFormatter` | Debug-level request logging with client IP, status, latency |
| `gin.Recovery` | Panic recovery |

---

## Public Endpoints

These endpoints use signed JWT tokens passed as query parameters. They do **not** require Bearer authentication.

### GET /download/backup

Downloads a server backup file.

**Authentication:** JWT token in `?token=` query parameter (`BackupPayload`).

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | Signed JWT containing `server_uuid`, `backup_uuid`, `unique_id` |

**Response:**
- `200 OK` -- Binary backup file with headers:
  - `Content-Length`: file size in bytes
  - `Content-Disposition`: `attachment; filename="<backup_filename>"`
  - `Content-Type`: `application/octet-stream`
- `404 Not Found` -- Server or backup not found

---

### GET /download/file

Downloads a specific file from a server's filesystem.

**Authentication:** JWT token in `?token=` query parameter (`FilePayload`).

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | Signed JWT containing `file_path`, `server_uuid`, `unique_id` |

**Response:**
- `200 OK` -- Binary file content with headers:
  - `Content-Length`: file size in bytes
  - `Content-Disposition`: `attachment; filename="<filename>"`
  - `Content-Type`: `application/octet-stream`
- `404 Not Found` -- Server or file not found

Files on the denylist (`.env`, etc.) cannot be downloaded and will return an error.

---

### POST /upload/file

Uploads one or more files to a server via multipart form data.

**Authentication:** JWT token in `?token=` query parameter (`UploadPayload`).

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | string | Yes | Signed JWT containing `server_uuid`, `user_uuid`, `unique_id` |
| `directory` | string | No | Target directory within the server (default: root) |

**Request Body:** `multipart/form-data` with files in the `files` field.

**Limits:**
- Individual file size is limited by `api.upload_limit` config (in MB, default varies)
- Files on the denylist cannot be overwritten

**Response:**
- `200 OK` -- All files uploaded successfully
- `400 Bad Request` -- File exceeds size limit or missing files field
- `404 Not Found` -- Server not found or token already used

---

## WebSocket Endpoint

### GET /api/servers/:server/ws

Upgrades an HTTP connection to a WebSocket for real-time server console interaction.

**Authentication:** JWT-based, sent as the first WebSocket message (not in headers). The `ServerExists` middleware validates the server UUID in the URL path.

**Connection Limits:**
- Maximum **30 concurrent WebSocket connections** per server (across all users)
- If the server is **suspended**, the connection is immediately closed with close code `4409` and message `"server is suspended"`

**WebSocket Configuration:**
- Compression: enabled (level 5)
- Max message size: 4096 bytes (compressed)
- Message format: JSON text frames only
- Max decompressed message size: 32,768 bytes (messages larger are silently dropped)

**Security Headers Set:**
- `Content-Security-Policy: default-src 'self'`
- `X-Frame-Options: DENY`

**Origin Validation:**
The WebSocket upgrader validates the `Origin` header against:
1. The configured `panel_location` in Wings config
2. Any additional origins in the `allowed_origins` config array
3. A wildcard `"*"` entry in `allowed_origins` allows any origin

---

### WebSocket Authentication Flow

After the WebSocket connection is established, the client **must** send an authentication message before any other interaction:

```json
{
  "event": "auth",
  "args": ["<jwt_token_string>"]
}
```

**JWT Payload (`WebsocketPayload`):**

```json
{
  "user_uuid": "uuid-of-user",
  "server_uuid": "uuid-of-server",
  "permissions": ["websocket.connect", "control.console", "control.start", "control.stop", "control.restart"],
  "iat": 1708387200,
  "exp": 1708390800,
  "jti": "md5(user_id + server_uuid)"
}
```

**On successful authentication:**
```json
{"event": "auth success"}
```

Followed immediately by the current server status:
```json
{"event": "status", "args": ["running"]}
```

If the server is offline and not installing/transferring, a stats event is also sent:
```json
{"event": "stats", "args": ["{\"memory_bytes\":0,\"memory_limit_bytes\":0,...}"]}
```

**On authentication failure:**
```json
{"event": "jwt error", "args": ["error description"]}
```

**Token Refresh:** The client can re-send `"auth"` events on an already-authenticated connection to refresh the JWT. This does **not** re-register event listeners or re-send the initial status.

---

### Client-to-Server Events (Inbound)

These are events the client sends to Wings over the WebSocket:

#### `auth` -- Authenticate

Authenticates or re-authenticates the WebSocket connection.

```json
{"event": "auth", "args": ["<jwt_token>"]}
```

| Field | Description |
|-------|-------------|
| `args[0]` | The complete JWT token string |

**Rate Limit:** 2 per 5 seconds.

---

#### `set state` -- Power Action

Sends a power action to the server. Requires appropriate permission.

```json
{"event": "set state", "args": ["start"]}
```

| Value | Required Permission |
|-------|-------------------|
| `start` | `control.start` |
| `stop` | `control.stop` |
| `restart` | `control.restart` |
| `kill` | `control.stop` |

**Rate Limit:** 4 per second (default).

If another power action is already in progress, an error event is returned:
```json
{"event": "daemon error", "args": ["Error Event [uuid]: another power action is currently being processed..."]}
```

---

#### `send command` -- Console Command

Sends a command to the server's stdin.

```json
{"event": "send command", "args": ["say Hello World"]}
```

**Required Permission:** `control.console`

**Restrictions:**
- Server must be in `running` state (not `offline`)
- If server is in `starting` state, the Docker container must be attached
- Command string is `args` joined with empty string

**Rate Limit:** 10 per second.

---

#### `send logs` -- Request Console Logs

Requests the most recent console output lines.

```json
{"event": "send logs"}
```

The server responds with multiple `console output` events, one per line. The number of lines is configured by `system.websocket_log_count` in Wings config (typically 100-200 lines).

**Restrictions:** Server must be running.

**Rate Limit:** 2 per 5 seconds.

---

#### `send stats` -- Request Stats

Requests current resource utilization stats.

```json
{"event": "send stats"}
```

**Response:**
```json
{"event": "stats", "args": ["{\"memory_bytes\":512000000,\"memory_limit_bytes\":1073741824,\"cpu_absolute\":45.2,\"network\":{\"rx_bytes\":1234,\"tx_bytes\":5678},\"uptime\":3600000,\"state\":\"running\",\"disk_bytes\":2048000000}"]}
```

**Rate Limit:** 4 per second (default).

---

### Server-to-Client Events (Outbound)

These events are pushed from Wings to all connected WebSocket clients:

#### `console output`

Real-time console/log output from the server process.

```json
{"event": "console output", "args": ["[14:30:01 INFO]: Player joined the game"]}
```

Sent continuously while the server is running.

---

#### `status`

Server state changes.

```json
{"event": "status", "args": ["running"]}
```

**Possible States:**

| State | Description |
|-------|-------------|
| `offline` | Server is stopped |
| `starting` | Server is booting up |
| `running` | Server is running normally |
| `stopping` | Server is shutting down |

---

#### `stats`

Periodic resource utilization updates (sent while the server is running by the resource polling loop).

```json
{
  "event": "stats",
  "args": ["{\"memory_bytes\":512000000,\"memory_limit_bytes\":1073741824,\"cpu_absolute\":45.2,\"network\":{\"rx_bytes\":1234567,\"tx_bytes\":7654321},\"uptime\":3600000,\"state\":\"running\",\"disk_bytes\":2048000000}"]
}
```

**Stats JSON Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `memory_bytes` | int64 | Current memory usage in bytes |
| `memory_limit_bytes` | int64 | Memory limit in bytes |
| `cpu_absolute` | float64 | CPU usage percentage |
| `network.rx_bytes` | int64 | Network bytes received |
| `network.tx_bytes` | int64 | Network bytes transmitted |
| `uptime` | int64 | Uptime in milliseconds |
| `state` | string | Current process state |
| `disk_bytes` | int64 | Disk usage in bytes |

---

#### `install output`

Installation script output lines. **Requires permission:** `admin.websocket.install`.

```json
{"event": "install output", "args": ["Installing dependencies..."]}
```

---

#### `install started`

Emitted when server installation begins.

```json
{"event": "install started"}
```

---

#### `install completed`

Emitted when server installation completes.

```json
{"event": "install completed"}
```

---

#### `daemon message`

Informational messages from the Wings daemon.

```json
{"event": "daemon message", "args": ["Server marked as starting..."]}
```

---

#### `backup completed`

Emitted when a backup operation completes. **Requires permission:** `backup.read`.

```json
{"event": "backup completed", "args": ["{\"uuid\":\"backup-uuid\",\"is_successful\":true,\"checksum\":\"sha256:...\",\"checksum_type\":\"sha256\",\"file_size\":1048576}"]}
```

---

#### `backup restore completed`

Emitted when a backup restore operation completes. **Requires permission:** `backup.read`.

```json
{"event": "backup restore completed"}
```

---

#### `transfer logs`

Transfer progress output. **Requires permission:** `admin.websocket.transfer`.

```json
{"event": "transfer logs", "args": ["Streaming archive to target node..."]}
```

---

#### `transfer status`

Transfer state changes. **Requires permission:** `admin.websocket.transfer`.

```json
{"event": "transfer status", "args": ["success"]}
```

Values: `"success"`, `"failure"`, `"completed"`.

---

#### `deleted`

Emitted when the server is being deleted from Wings. Clients should disconnect.

```json
{"event": "deleted"}
```

---

#### `token expiring`

Sent when the JWT will expire within 60 seconds. The client should request a new JWT from the Panel and send a new `auth` event.

```json
{"event": "token expiring"}
```

Checked every 30 seconds.

---

#### `token expired`

Sent when the JWT has expired. The client **must** re-authenticate.

```json
{"event": "token expired"}
```

---

#### `jwt error`

Sent when a JWT validation error occurs (expired, denylisted, missing permissions, server UUID mismatch).

```json
{"event": "jwt error", "args": ["jwt: missing connect permission"]}
```

---

#### `daemon error`

General error from the daemon. If the user has `admin.websocket.errors` permission, the actual error message is included. Otherwise, a generic message with a tracking UUID is sent.

```json
{"event": "daemon error", "args": ["Error Event [tracking-uuid]: actual error message"]}
```

---

#### `throttled`

Sent when the client is being rate-limited.

```json
{"event": "throttled", "args": ["send command"]}
```

The `args[0]` value is either the specific event name being throttled or `"global"` for the global rate limit.

---

### WebSocket Rate Limiting

Wings implements a **two-tier rate limiting** system:

#### Global Rate Limit (Message Parsing)

Before any JSON parsing occurs, a global rate limiter restricts to **10 messages per 200ms** (50/second burst). This prevents flooding attacks.

When triggered, a single `throttled` event with `args: ["global"]` is sent. Subsequent throttled messages are silently dropped until the limiter allows again.

#### Per-Event Rate Limits

After JSON parsing, each event type has its own rate limiter:

| Event | Rate | Burst |
|-------|------|-------|
| `auth` | 1 per 5 seconds | 2 |
| `send logs` | 1 per 5 seconds | 2 |
| `send command` | 1 per second | 10 |
| All others | 1 per second | 4 |

When an event-specific limiter triggers, a `throttled` event is sent with the event name. The inbound message is silently dropped.

---

### WebSocket Permissions

Permissions are embedded in the JWT and checked on each relevant action:

| Permission | Required For |
|-----------|--------------|
| `websocket.connect` | Connecting to the WebSocket at all (checked on auth) |
| `control.console` | Sending commands (`send command` event) |
| `control.start` | Starting/restarting the server (`set state` with `start`) |
| `control.stop` | Stopping/killing the server (`set state` with `stop` or `kill`) |
| `control.restart` | Restarting the server (`set state` with `restart`) |
| `admin.websocket.errors` | Receiving detailed error messages |
| `admin.websocket.install` | Receiving installation output |
| `admin.websocket.transfer` | Receiving transfer logs and status |
| `backup.read` | Receiving backup completion events |
| `*` (wildcard) | Grants all non-admin permissions |

---

### Token Denylist

Wings maintains an in-memory denylist to revoke WebSocket tokens:

1. **Boot-time denylist**: Any JWT issued before Wings was started is automatically rejected
2. **JTI denylist** (deprecated): Specific JTI values can be denied via `POST /api/servers/:server/ws/deny`
3. **User denylist**: Per-server, per-user denial via `POST /api/deauthorize-user`

When a token is denylisted, `HasPermission()` returns `false` for all permission checks, effectively revoking all access.

---

## Transfer Endpoint

### POST /api/transfers

Receives a server transfer from another Wings node. This is **not** called by the Panel -- it is called directly by the source Wings node.

**Authentication:** Bearer JWT in `Authorization` header (`TransferPayload`). The JWT subject (`sub`) contains the server UUID.

**Content-Type:** `multipart/form-data`

**Multipart Parts:**

| Part Name | Description |
|-----------|-------------|
| `archive` | The server archive (tar.gz) streamed directly to extraction |
| `checksum_archive` | SHA-256 hex checksum of the archive |
| `install_logs` | The server's installation log file |
| `backup_<filename>` | Backup file (can be multiple) |
| `checksum_backup_<filename>` | SHA-256 hex checksum for each backup |

**Process:**
1. Creates or retrieves a transfer instance for the server
2. Streams the archive directly to the server's data directory while computing checksums
3. Verifies all checksums match
4. Creates the Docker environment
5. Notifies the Panel of transfer success/failure

**Response:**
- `200 OK` -- Transfer completed successfully
- Various error codes on failure (checksum mismatch, missing archive, etc.)

On failure, the server files are cleaned up and the Panel is notified.

---

## Protected Endpoints

All endpoints in this section require `Authorization: Bearer <node_token>`.

---

### System Endpoints

#### POST /api/update

Updates the Wings daemon configuration remotely (typically called by the Panel).

**Request Body:** The full Wings `Configuration` struct as JSON.

**Behavior:**
- If `ignore_panel_config_updates` is `true` in the current config, returns `{"applied": false}` without making changes
- SSL certificate paths starting with `/etc/letsencrypt/live/` are preserved (not overwritten)
- The new config is written to disk before updating the in-memory state

**Response:**
```json
{"applied": true}
```

---

#### GET /api/system

Returns system information about the Wings host.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `v` | string | Version flag. Use `v=2` for the full response format |

**Response (v=2):**
```json
{
  "version": "1.x.x",
  "docker": {
    "version": "24.0.7",
    "cgroups": {"driver": "systemd", "version": "2"},
    "containers": {"total": 5, "running": 3, "paused": 0, "stopped": 2},
    "storage": {"driver": "overlay2", "filesystem": "extfs"},
    "runc": {"version": "1.1.12"}
  },
  "system": {
    "architecture": "amd64",
    "cpu_threads": 8,
    "memory_bytes": 17179869184,
    "kernel_version": "6.1.0",
    "os": "Ubuntu 22.04",
    "os_type": "linux"
  }
}
```

**Response (legacy, no `v` param):**
```json
{
  "architecture": "amd64",
  "cpu_count": 8,
  "kernel_version": "6.1.0",
  "os": "linux",
  "version": "1.x.x"
}
```

---

#### GET /api/diagnostics

Returns a plaintext diagnostics report for troubleshooting.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `include_endpoints` | bool | `false` | Include endpoint connectivity checks |
| `include_logs` | bool | `true` | Include recent log output |
| `log_lines` | int | `200` | Number of log lines to include (max 500) |

**Response:** `200 OK` with `Content-Type: text/plain; charset=utf-8`

---

#### GET /api/system/docker/disk

Returns Docker disk usage statistics.

**Response:**
```json
{
  "containers_size": 1073741824,
  "images_total": 15,
  "images_active": 5,
  "images_size": 5368709120,
  "build_cache_size": 2147483648
}
```

---

#### DELETE /api/system/docker/image/prune

Prunes unused Docker images to reclaim disk space.

**Response:** `200 OK` with pruning results.

---

#### GET /api/system/ips

Returns all IP addresses on the host machine.

**Response:**
```json
{
  "ip_addresses": ["192.168.1.100", "10.0.0.1", "172.17.0.1"]
}
```

Includes both detected network interfaces and any manually configured IPs from `docker.system_ips` in the Wings config.

---

#### GET /api/system/utilization

Returns current system resource utilization.

**Response:**
```json
{
  "memory_total": 17179869184,
  "memory_used": 8589934592,
  "swap_total": 4294967296,
  "swap_used": 0,
  "load_average1": 0.5,
  "load_average5": 0.3,
  "load_average15": 0.2,
  "cpu_percent": 12.5,
  "disk_total": 500107862016,
  "disk_used": 250053931008,
  "disk_details": [
    {
      "device": "/dev/sda1",
      "mountpoint": "/",
      "total_space": 500107862016,
      "used_space": 250053931008,
      "tags": ["root", "data", "backups"]
    }
  ]
}
```

Disk details include tagged entries for: `root` (Wings root), `logs` (log directory), `data` (server data), `archive` (archive directory), `backups` (backup directory), `tmp` (temp directory).

---

### Server Collection Endpoints

#### GET /api/servers

Returns all servers registered on this Wings instance.

**Response:** Array of `APIResponse` objects:
```json
[
  {
    "state": "running",
    "is_suspended": false,
    "utilization": {
      "memory_bytes": 512000000,
      "cpu_absolute": 25.4,
      "disk_bytes": 1073741824,
      "state": "running",
      "network": {"rx_bytes": 0, "tx_bytes": 0},
      "uptime": 3600000
    },
    "configuration": { ... }
  }
]
```

---

#### POST /api/servers

Creates a new server on this Wings instance and begins the installation process.

**Request Body:** Server details JSON (the `installer.ServerDetails` struct, which mirrors the Panel's server configuration format including UUID, build limits, container image, environment variables, etc.).

**Behavior:**
1. Validates the server configuration
2. Adds the server to the manager
3. Creates the Docker environment (async)
4. Runs the installation script (async)
5. Optionally starts the server after installation if `start_on_completion` is set

**Response:**
- `202 Accepted` -- Server creation started (installation runs in background)
- `422 Unprocessable Entity` -- Validation error

---

### User Management Endpoints

#### POST /api/deauthorize-user

Deauthorizes a user from one or more servers, canceling their WebSocket connections and SFTP sessions.

**Request Body:**
```json
{
  "user": "user-uuid",
  "servers": ["server-uuid-1", "server-uuid-2"]
}
```

If `servers` is empty or omitted, the user is deauthorized from **all** servers on this node.

**Behavior:**
- Cancels all WebSocket connections for affected servers
- Cancels the user's SFTP sessions
- Adds the user+server combination to the JWT denylist

**Response:** `204 No Content`

---

### Transfer Management Endpoints

#### DELETE /api/transfers/:server

Cancels an incoming server transfer.

**URL Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `server` | string | Server UUID |

**Response:**
- `202 Accepted` -- Transfer cancellation initiated
- `409 Conflict` -- Server is not currently being transferred

---

## Server-Specific Endpoints

All endpoints in this section require both `Authorization: Bearer <token>` and a valid `:server` UUID in the URL path. The `ServerExists` middleware validates the server exists and attaches it to the request context.

The `:server` parameter is always the server's **UUID** (not an integer ID).

---

### Server Info

#### GET /api/servers/:server

Returns detailed information about a specific server.

**Response:**
```json
{
  "state": "running",
  "is_suspended": false,
  "utilization": {
    "memory_bytes": 512000000,
    "memory_limit_bytes": 1073741824,
    "cpu_absolute": 25.4,
    "disk_bytes": 1073741824,
    "state": "running",
    "network": {"rx_bytes": 1234567, "tx_bytes": 7654321},
    "uptime": 3600000
  },
  "configuration": { ... }
}
```

---

#### DELETE /api/servers/:server

Deletes a server from Wings. This is a destructive operation.

**Process:**
1. Suspends the server immediately
2. Publishes `deleted` event to all WebSocket clients
3. If transferring, publishes `transfer status: completed`
4. Cleans up server resources
5. Cancels any pending remote file downloads
6. Removes installation logs
7. Optionally removes all backups (if `system.backups.remove_backups_on_server_delete` is enabled)
8. Destroys the Docker container and environment
9. Removes server files from disk (async)
10. Removes the machine-id file (async)
11. Removes the server from the manager

**Response:** `204 No Content`

---

### Server Logs

#### GET /api/servers/:server/logs

Returns recent console output from the server.

**Query Parameters:**

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `size` | int | `100` | `100` | Number of lines to return |

**Response:**
```json
{
  "data": ["line 1", "line 2", "..."]
}
```

---

#### GET /api/servers/:server/install-logs

Returns the installation script output log.

**Response:**
```json
{
  "data": "Script output content after the header...\n..."
}
```

The response strips the installation header and returns only the script output section. Returns `500` if the log file cannot be read.

---

### Power & Commands

#### POST /api/servers/:server/power

Sends a power action to the server.

**Request Body:**
```json
{
  "action": "start",
  "wait_seconds": 30
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | One of: `start`, `stop`, `restart`, `kill` |
| `wait_seconds` | int | No | Seconds to wait for the action (0-300, default 30) |

**Validation:**
- `start` and `restart` are blocked if the server is suspended
- Invalid actions return `422 Unprocessable Entity`

**Response:**
- `202 Accepted` -- Power action started (runs asynchronously)
- `400 Bad Request` -- Server is suspended
- `422 Unprocessable Entity` -- Invalid power action

---

#### POST /api/servers/:server/commands

Sends one or more commands to the server's stdin.

**Request Body:**
```json
{
  "commands": ["say Hello", "list"]
}
```

**Restrictions:** Server must be running. Returns `502 Bad Gateway` if the server is stopped.

**Response:** `204 No Content`

---

### Server Lifecycle

#### POST /api/servers/:server/install

Triggers the server installation process. Syncs with the Panel first, then runs the install script.

**Response:** `202 Accepted` (installation runs in background)

---

#### POST /api/servers/:server/reinstall

Triggers a server reinstallation.

**Restrictions:** Cannot run while another power action is in progress.

**Response:**
- `202 Accepted` -- Reinstallation started
- `409 Conflict` -- Another power action is running

---

#### POST /api/servers/:server/sync

Triggers a re-sync of the server configuration with the Panel. This fetches the latest server configuration from the Panel and applies it.

**Response:** `204 No Content`

---

### WebSocket Token Management

#### POST /api/servers/:server/ws/deny

> **Deprecated:** Prefer `POST /api/deauthorize-user`.

Adds JTI values to the WebSocket token denylist, preventing JWTs with those JTIs (issued before the current time) from being used.

**Request Body:**
```json
{
  "jtis": ["jti-value-1", "jti-value-2"]
}
```

**Response:** `204 No Content`

---

### Server Transfer

#### POST /api/servers/:server/transfer

Initiates the archive creation process for transferring a server to another node. This should only be triggered by the Panel.

**Response:** `202 Accepted`

---

#### DELETE /api/servers/:server/transfer

Cancels a server transfer for a server that is not the target.

**Response:**
- `204 No Content`
- `409 Conflict` -- Server is not transferring

---

### Backup Management

#### DELETE /api/servers/:server/deleteAllBackups

Deletes all local backup files for the server.

**Response:** `204 No Content`

---

### File Management

All file endpoints operate within the server's sandboxed filesystem. Files on the denylist (e.g., `.env` files, sensitive configs) are protected from read/write/rename operations.

#### GET /api/servers/:server/files/contents

Returns the contents of a file.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file` | string | Yes | Path to the file (relative to server root) |
| `download` | string | No | If present, sets download headers |

**Response Headers:**
- `X-Mime-Type`: Detected MIME type of the file
- `Content-Length`: File size in bytes
- If `download` param is present:
  - `Content-Disposition: attachment; filename="<name>"`
  - `Content-Type: application/octet-stream`

**Response:** Raw file contents as the response body.

**Errors:**
- `404 Not Found` -- File does not exist
- `400 Bad Request` -- Path is a directory or a named pipe

---

#### GET /api/servers/:server/files/list-directory

Lists the contents of a directory.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `directory` | string | Yes | Path to the directory |

**Response:** Array of file stat objects:
```json
[
  {
    "name": "server.properties",
    "created": "2024-01-15T10:30:00Z",
    "modified": "2024-01-20T14:22:00Z",
    "mode": "-rw-r--r--",
    "mode_bits": "644",
    "size": 1234,
    "directory": false,
    "file": true,
    "symlink": false,
    "mime": "text/plain; charset=utf-8"
  },
  {
    "name": "plugins",
    "created": "2024-01-15T10:30:00Z",
    "modified": "2024-01-18T09:15:00Z",
    "mode": "drwxr-xr-x",
    "mode_bits": "755",
    "size": 4096,
    "directory": true,
    "file": false,
    "symlink": false,
    "mime": "inode/directory"
  }
]
```

---

#### PUT /api/servers/:server/files/rename

Renames or moves one or more files.

**Request Body:**
```json
{
  "root": "/",
  "files": [
    {"from": "old-name.txt", "to": "new-name.txt"},
    {"from": "config.yml", "to": "backups/config.yml.bak"}
  ]
}
```

Paths in `from` and `to` are relative to `root`.

**Response:**
- `204 No Content`
- `400 Bad Request` -- Destination already exists
- `422 Unprocessable Entity` -- No files provided

---

#### POST /api/servers/:server/files/copy

Copies a file. The copy is created alongside the original with a unique suffix.

**Request Body:**
```json
{
  "location": "path/to/file.txt"
}
```

**Response:** `204 No Content`

---

#### POST /api/servers/:server/files/write

Writes content to a file (creates or overwrites).

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file` | string | Yes | Path to the file (with leading `/`) |

**Request Body:** Raw file contents as the request body. `Content-Length` header is **required**.

**Response:**
- `204 No Content`
- `400 Bad Request` -- Missing Content-Length or path is a directory

---

#### POST /api/servers/:server/files/create-directory

Creates a new directory.

**Request Body:**
```json
{
  "name": "new-folder",
  "path": "/path/to/parent"
}
```

**Response:**
- `204 No Content`
- `400 Bad Request` -- Parent path is not a directory, or name conflicts with existing file

---

#### POST /api/servers/:server/files/delete

Deletes one or more files or directories.

**Request Body:**
```json
{
  "root": "/",
  "files": ["file1.txt", "directory1"]
}
```

Paths are relative to `root`. Directories are deleted recursively.

**Response:**
- `204 No Content`
- `422 Unprocessable Entity` -- No files specified

---

#### POST /api/servers/:server/files/compress

Compresses files into an archive.

**Request Body:**
```json
{
  "root": "/",
  "files": ["file1.txt", "directory1"],
  "name": "archive",
  "extension": "tar.gz"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `root` | string | Yes | Root directory containing the files |
| `files` | string[] | Yes | Files/directories to compress |
| `name` | string | No | Archive name (without extension) |
| `extension` | string | No | Format: `zip`, `tar.gz`, `tar.bz2`, `tar.xz` (default: `tar.gz`) |

**Response:** `200 OK` with the archive's file stat:
```json
{
  "name": "archive.tar.gz",
  "created": "2024-01-20T14:22:00Z",
  "modified": "2024-01-20T14:22:00Z",
  "mode": "-rw-r--r--",
  "mode_bits": "644",
  "size": 1048576,
  "directory": false,
  "file": true,
  "symlink": false,
  "mime": "application/gzip"
}
```

**Errors:**
- `409 Conflict` -- Not enough disk space
- `422 Unprocessable Entity` -- No files specified

---

#### POST /api/servers/:server/files/decompress

Extracts an archive into a directory.

**Request Body:**
```json
{
  "root": "/",
  "file": "archive.tar.gz"
}
```

**Supported Formats:** tar.gz, tar.bz2, tar.xz, zip, and other formats supported by the archiver library.

**Behavior:**
1. Checks if there's enough disk space for decompression
2. Extracts the archive into `root`

**Response:**
- `204 No Content`
- `400 Bad Request` -- Unknown archive format or file busy

---

#### POST /api/servers/:server/files/chmod

Changes file permissions (chmod) on one or more files.

**Request Body:**
```json
{
  "root": "/",
  "files": [
    {"file": "script.sh", "mode": "755"},
    {"file": "config.yml", "mode": "644"}
  ]
}
```

The `mode` field is an octal string (e.g., `"755"`, `"644"`).

**Response:**
- `204 No Content`
- `400 Bad Request` -- Invalid file mode
- `422 Unprocessable Entity` -- No files specified

---

#### GET /api/servers/:server/files/search

Searches for files by name pattern within a directory tree.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `directory` | string | Yes | Root directory to search from |
| `pattern` | string | Yes | Search pattern (min 3 characters) |

**Pattern Matching:**
- Supports glob patterns (`*`, `?`)
- Case-insensitive
- Matches against filename, extension, or full name
- Searches recursively up to `search_recursion.max_recursion_depth` levels

**Blacklisted Directories** (skipped during search):
`node_modules`, `.wine`, `.git`, `appcache`, `depotcache`, `vendor`

**Response:** Array of matching file stat objects (same format as `list-directory`), but with `name` containing the full relative path.

---

#### GET /api/servers/:server/files/pull

> **Requires:** Remote downloads enabled in config (`api.disable_remote_download` must be `false`)

Returns the list of currently in-progress remote file downloads for this server.

**Response:**
```json
{
  "downloads": [
    {
      "identifier": "download-uuid",
      "progress": 0.75
    }
  ]
}
```

---

#### POST /api/servers/:server/files/pull

> **Requires:** Remote downloads enabled in config

Initiates a remote file download to the server's filesystem.

**Request Body:**
```json
{
  "root": "/plugins",
  "url": "https://example.com/plugin.jar",
  "file_name": "plugin.jar",
  "use_header": false,
  "foreground": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `root` | string | Yes | Target directory |
| `url` | string | Yes | URL to download from |
| `file_name` | string | No | Override filename |
| `use_header` | bool | No | Use Content-Disposition header for filename |
| `foreground` | bool | No | If `true`, blocks until download completes |

**Limits:** Maximum 3 simultaneous downloads per server.

**Response (background):** `202 Accepted`
```json
{"identifier": "download-uuid"}
```

**Response (foreground):** `200 OK` with the downloaded file's stat object.

---

#### DELETE /api/servers/:server/files/pull/:download

Cancels an in-progress remote file download.

**URL Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `download` | string | Download identifier |

**Response:** `204 No Content`

---

### Backup Operations

#### POST /api/servers/:server/backup

Creates a new backup of the server.

**Request Body:**
```json
{
  "adapter": "wings",
  "uuid": "backup-uuid",
  "ignore": "*.log\n*.tmp"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `adapter` | string | Yes | `"wings"` (local) or `"s3"` (S3-compatible) |
| `uuid` | string | Yes | UUID for the backup |
| `ignore` | string | No | Newline-separated list of glob patterns to exclude |

**Response:** `202 Accepted` (backup runs in background)

The backup completion status is reported via:
1. WebSocket `backup completed` event
2. Panel callback API

---

#### POST /api/servers/:server/backup/:backup/restore

Restores a server from a backup.

**URL Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `backup` | string | Backup UUID |

**Request Body:**
```json
{
  "adapter": "wings",
  "truncate_directory": true,
  "download_url": "https://s3.example.com/backup.tar.gz"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `adapter` | string | Yes | `"wings"` or `"s3"` |
| `truncate_directory` | bool | No | Delete all server files before restoring |
| `download_url` | string | Conditional | Required when `adapter` is `"s3"` |

**Behavior:**
1. Sets server to restoring state
2. Optionally truncates the server directory
3. For local backups: locates and extracts from disk
4. For S3 backups: downloads from `download_url` and streams to extraction

**Response:** `202 Accepted` (restore runs in background)

On completion, publishes:
- `daemon message` event: `"Completed server restoration from [local/S3] backup."`
- `backup restore completed` event

---

#### DELETE /api/servers/:server/backup/:backup

Deletes a specific local backup.

**URL Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `backup` | string | Backup UUID |

**Response:**
- `204 No Content`
- `404 Not Found` -- Backup not found

---

## Data Structures

### Server APIResponse

```typescript
interface APIResponse {
  state: "offline" | "starting" | "running" | "stopping";
  is_suspended: boolean;
  utilization: ResourceUsage;
  configuration: ServerConfiguration; // Full server config from Panel
}
```

### ResourceUsage (Stats)

```typescript
interface ResourceUsage {
  state: string;
  memory_bytes: number;
  memory_limit_bytes: number;
  cpu_absolute: number;       // Percentage (0-100+)
  disk_bytes: number;
  network: {
    rx_bytes: number;
    tx_bytes: number;
  };
  uptime: number;             // Milliseconds
}
```

### Filesystem Stat

```typescript
interface FileStat {
  name: string;               // Filename (or full path in search results)
  created: string;            // RFC 3339 timestamp
  modified: string;           // RFC 3339 timestamp
  mode: string;               // Unix permission string (e.g., "-rw-r--r--")
  mode_bits: string;          // Octal permission bits (e.g., "644")
  size: number;               // Size in bytes
  directory: boolean;
  file: boolean;
  symlink: boolean;
  mime: string;               // MIME type (e.g., "text/plain", "inode/directory")
}
```

### SystemInformation

```typescript
interface SystemInformation {
  version: string;
  docker: {
    version: string;
    cgroups: { driver: string; version: string };
    containers: { total: number; running: number; paused: number; stopped: number };
    storage: { driver: string; filesystem: string };
    runc: { version: string };
  };
  system: {
    architecture: string;
    cpu_threads: number;
    memory_bytes: number;
    kernel_version: string;
    os: string;
    os_type: string;
  };
}
```

### SystemUtilization

```typescript
interface SystemUtilization {
  memory_total: number;       // Bytes
  memory_used: number;        // Bytes
  swap_total: number;         // Bytes
  swap_used: number;          // Bytes
  load_average1: number;      // 1-minute load average
  load_average5: number;      // 5-minute load average
  load_average15: number;     // 15-minute load average
  cpu_percent: number;        // Current CPU usage percentage
  disk_total: number;         // Bytes
  disk_used: number;          // Bytes
  disk_details: DiskInfo[];
}

interface DiskInfo {
  device: string;             // e.g., "/dev/sda1"
  mountpoint: string;         // e.g., "/"
  total_space: number;        // Bytes
  used_space: number;         // Bytes
  tags: string[];             // e.g., ["root", "data", "backups"]
}
```

### DockerDiskUsage

```typescript
interface DockerDiskUsage {
  containers_size: number;    // Bytes
  images_total: number;
  images_active: number;
  images_size: number;        // Bytes
  build_cache_size: number;   // Bytes
}
```

---

## Error Handling

Wings uses a standardized error response format:

```json
{
  "error": "Human-readable error message",
  "request_id": "uuid-from-x-request-id-header"
}
```

**Common HTTP Status Codes:**

| Code | Usage |
|------|-------|
| `200 OK` | Successful request with response body |
| `202 Accepted` | Async operation started (power actions, installs, backups) |
| `204 No Content` | Successful request with no response body |
| `400 Bad Request` | Invalid input, missing parameters, or blocked operation |
| `401 Unauthorized` | Missing or malformed Authorization header |
| `403 Forbidden` | Invalid authentication token |
| `404 Not Found` | Server or resource not found |
| `409 Conflict` | Operation conflict (e.g., reinstall during power action, insufficient disk space) |
| `422 Unprocessable Entity` | Validation error (invalid power action, empty file list) |
| `500 Internal Server Error` | Unexpected server error (includes request_id for tracking) |
| `502 Bad Gateway` | Server is not in the correct state (e.g., sending commands to stopped server) |

Filesystem-specific errors are automatically converted to appropriate HTTP responses with descriptive messages (e.g., "does not exist", "is a directory", "disk space exceeded").

---

## CORS Configuration

Wings sets CORS headers on all responses:

| Header | Value |
|--------|-------|
| `Access-Control-Allow-Origin` | Panel URL (or matched allowed origin) |
| `Access-Control-Allow-Credentials` | `true` |
| `Access-Control-Allow-Methods` | `GET, POST, PATCH, PUT, DELETE, OPTIONS` |
| `Access-Control-Allow-Headers` | `Accept, Accept-Encoding, Authorization, Cache-Control, Content-Type, Content-Length, Origin, X-Real-IP, X-CSRF-Token` |
| `Access-Control-Max-Age` | `7200` (2 hours) |

If `allow_cors_private_network` is enabled:
| `Access-Control-Request-Private-Network` | `true` |

**Origin Matching:**
1. If the request `Origin` matches `panel_location`, it is allowed
2. If the `Origin` matches any entry in `allowed_origins`, it is allowed
3. A `"*"` in `allowed_origins` matches any origin
4. `OPTIONS` requests receive `204 No Content` immediately

---

## Additional Response Headers

| Header | Description |
|--------|-------------|
| `X-Request-Id` | Unique UUID for every request (useful for log correlation) |
| `User-Agent` | Set to `Pelican Wings/v<version> (id:<token_id>)` on auth middleware |
