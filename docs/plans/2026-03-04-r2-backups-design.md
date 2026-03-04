# R2 Backups — Design Document

## Overview

Add a full backup lifecycle to Flamingo Panel using Cloudflare R2 as storage. Users can create, list, download, restore, lock, and delete server backups. Wings creates the archive and uploads directly to R2 via presigned URLs — the Panel never handles backup data, only orchestrates the flow.

## Architecture

```
User clicks "Create Backup"
    │
    ▼
Panel API: POST /api/servers/:id/backups
    │  Creates backup row (status: pending)
    │  Calls Wings: POST /api/servers/:uuid/backup { adapter: "s3", uuid, ignore }
    │
    ▼
Wings creates tar.gz archive locally, then:
    │  GET /api/remote/backups/:uuid?size=<bytes>
    │  Panel generates R2 presigned multipart upload URLs
    │  Returns { parts: [url1, url2, ...], part_size }
    │
    ▼
Wings uploads each part directly to R2 using presigned URLs
    │  Deletes local temp file after upload
    │
    ▼
Wings reports completion: POST /api/remote/backups/:uuid
    │  { successful, checksum, checksum_type, size, parts: [{etag, part_number}] }
    │
    ▼
Panel calls R2 CompleteMultipartUpload, updates DB row
    │
    ▼
User interacts with backup:
    ├── Download → Panel generates presigned R2 GET URL (5 min), browser downloads directly
    ├── Restore → Panel generates presigned R2 GET URL, passes to Wings, Wings downloads & extracts
    └── Delete  → Panel deletes from R2 (via binding) + deletes DB row
```

## Database Schema

### New `backups` table

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | TEXT PK | uuid() | |
| `server_id` | TEXT NOT NULL | | FK → servers.id, CASCADE delete |
| `uuid` | TEXT NOT NULL | uuid() | UNIQUE, used in R2 key path |
| `name` | TEXT NOT NULL | | User-provided or auto-generated |
| `is_successful` | INTEGER NOT NULL | 0 | 0 = false, 1 = true |
| `is_locked` | INTEGER NOT NULL | 0 | Prevents user deletion |
| `ignored_files` | TEXT | "[]" | JSON array of ignore patterns |
| `checksum` | TEXT | | Format: "sha1:<hex>" |
| `bytes` | INTEGER NOT NULL | 0 | File size in bytes |
| `upload_id` | TEXT | | R2 multipart upload ID |
| `completed_at` | TEXT | | null = still in progress |
| `created_at` | TEXT NOT NULL | datetime('now') | |

Indexes:
- `idx_backups_server` on `server_id`
- `idx_backups_uuid` on `uuid` (UNIQUE)

R2 object key pattern: `backups/{server-uuid}/{backup-uuid}.tar.gz`

### Modify `servers` table

Add column: `backup_limit` INTEGER NOT NULL DEFAULT 3

- `0` = backups disabled for this server
- Admin sets this during server creation

## API Endpoints

### User-facing (authenticated, server access required)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/servers/:id/backups` | List backups for server |
| `POST` | `/api/servers/:id/backups` | Create a backup |
| `GET` | `/api/servers/:id/backups/:backupId/download` | Get presigned R2 download URL |
| `POST` | `/api/servers/:id/backups/:backupId/lock` | Toggle lock status |
| `POST` | `/api/servers/:id/backups/:backupId/restore` | Restore from backup |
| `DELETE` | `/api/servers/:id/backups/:backupId` | Delete backup |

### Remote (Wings → Panel callbacks, node token auth)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/remote/backups/:uuid` | Return presigned R2 upload URLs for multipart |
| `POST` | `/api/remote/backups/:uuid` | Report backup completion (success/failure) |
| `POST` | `/api/remote/backups/:uuid/restore` | Report restore completion |

## Endpoint Details

### POST /api/servers/:id/backups (Create)

Request body:
```json
{ "name": "My Backup", "ignored": "*.log\n*.tmp" }
```

Logic:
1. Verify server access (owner, admin, or subuser)
2. Check `server.backupLimit > 0` (else 403)
3. Count non-failed backups (completed_at IS NULL OR is_successful = 1)
4. If count >= limit: delete oldest unlocked non-failed backup, or reject if all locked
5. Insert backup row with `is_successful=0`, `completed_at=null`
6. Call Wings: `POST /api/servers/:uuid/backup { adapter: "s3", uuid: backup.uuid, ignore }`
7. Return backup object

### GET /api/remote/backups/:uuid (Presigned Upload URLs)

Query params: `size` (backup file size in bytes)

Logic:
1. Look up backup by UUID, get server, get node — verify request comes from the correct node
2. Create R2 multipart upload via S3 API: `CreateMultipartUpload`
3. Store `upload_id` on the backup row
4. Calculate number of parts: `ceil(size / partSize)` where `partSize = 100MB` (R2-friendly)
5. Generate presigned `UploadPart` URL for each part
6. Return `{ parts: [...urls], part_size: partSize }`

### POST /api/remote/backups/:uuid (Completion Callback)

Request body:
```json
{
  "successful": true,
  "checksum": "abc123...",
  "checksum_type": "sha1",
  "size": 1073741824,
  "parts": [{ "etag": "\"abc\"", "part_number": 1 }]
}
```

Logic:
1. Look up backup by UUID
2. If successful: call `CompleteMultipartUpload` with the ETags/part numbers
3. If failed: call `AbortMultipartUpload`
4. Update backup: `is_successful`, `checksum` ("sha1:<hex>"), `bytes`, `completed_at`
5. If failed: also set `is_locked = 0`
6. Log activity event
7. Return 204

### GET /api/servers/:id/backups/:backupId/download

Logic:
1. Verify backup exists and is completed + successful
2. Generate presigned R2 GET URL (5 min expiry) for `backups/{serverUuid}/{backupUuid}.tar.gz`
3. Return `{ url: "https://..." }`

### POST /api/servers/:id/backups/:backupId/restore

Request body:
```json
{ "truncate": true }
```

Logic:
1. Verify backup is completed + successful
2. Verify server.status is null (no other operation in progress)
3. Generate presigned R2 download URL
4. Set server status to "restoring_backup"
5. Call Wings: `POST /api/servers/:uuid/backup/:backupUuid/restore { adapter: "s3", truncate_directory, download_url }`
6. Return 204

### POST /api/remote/backups/:uuid/restore (Restore Callback)

Request body:
```json
{ "successful": true }
```

Logic:
1. Look up backup, get server
2. Set `server.status = null` (clear restoring state)
3. Log activity event
4. Return 204

### DELETE /api/servers/:id/backups/:backupId

Logic:
1. Verify backup is not locked (or not successful — failed backups can always be deleted)
2. Delete R2 object via `env.R2.delete()` (binding, no credentials needed)
3. Delete DB row
4. Return 204

## Dependencies

### New packages
- `@aws-sdk/client-s3` — S3Client, CreateMultipartUpload, CompleteMultipartUpload, AbortMultipartUpload
- `@aws-sdk/s3-request-presigner` — getSignedUrl for presigned URLs

### New Worker secrets
- `R2_ACCESS_KEY_ID` — R2 API token access key
- `R2_SECRET_ACCESS_KEY` — R2 API token secret key
- `CF_ACCOUNT_ID` — Cloudflare account ID (for S3 endpoint: `https://{accountId}.r2.cloudflarestorage.com`)

The existing `env.R2` binding (R2Bucket) is used for delete operations where no presigned URL is needed.

## Frontend

### Backups Tab (server detail page)

Location: New tab on `/server/:serverId` between Files and Settings.

Components:
- Backup list table: name, size (formatted), status badge (in-progress/success/failed), date, lock icon
- Header shows usage: "2 of 3 backups used"
- "Create Backup" button opens dialog with name input and ignored files textarea
- Per-row actions: Download, Restore, Lock/Unlock, Delete
- Restore action shows confirmation dialog with truncate checkbox
- Delete shows confirmation dialog (blocked if locked)
- Auto-refresh via `refetchInterval: 5000` when any backup has `completed_at === null`

### Server Creation Form

Add "Backup Limit" number input to the admin create-server page (default: 3, min: 0).

## Files to Create

| File | Purpose |
|------|---------|
| `src/api/backups.ts` | All user-facing backup API routes |
| `src/lib/r2.ts` | R2/S3 client setup + presigned URL helpers |
| `src/web/components/server/backups-tab.tsx` | Backup tab UI component |

## Files to Modify

| File | Change |
|------|--------|
| `src/db/schema.ts` | Add `backups` table, add `backupLimit` to `servers` |
| `src/api/remote.ts` | Replace backup stubs with real handlers (upload URLs, completion, restore) |
| `src/api/index.ts` | Mount backup routes |
| `src/web/routes/server/$serverId.tsx` | Add Backups tab |
| `src/web/routes/admin/create-server.tsx` | Add backup limit field |
| `src/env.d.ts` | Add `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `CF_ACCOUNT_ID` |
| `package.json` | Add `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` |

## Key Design Decisions

1. **R2-only** — No local Wings adapter. Simplifies the codebase since we only need one storage path. R2 is already bound in the Worker.

2. **Presigned URLs for upload AND download** — Wings uploads directly to R2, users download directly from R2. The Panel Worker never touches backup data, only signs URLs.

3. **Multipart uploads** — Wings uses the same S3 multipart flow that Pelican supports. Handles arbitrarily large backups. Part size of 100MB is R2-friendly (R2 min part size is 5MB, max 5GB).

4. **Per-server backup limit** — Matches Pelican's model. Admin sets during server creation. Default 3. When at limit, oldest unlocked backup is auto-deleted.

5. **R2 binding for deletes** — Delete operations use `env.R2.delete()` directly (no S3 credentials needed). Only presigned URL generation needs the S3-compatible API.

6. **No soft delete** — Unlike Pelican which uses soft deletes, we hard-delete backup rows. Simpler, and we're not running a scheduled pruner.

7. **Polling for progress** — Rather than WebSocket events for backup status, the UI polls via TanStack Query's `refetchInterval`. Simpler than wiring backup events through the Durable Object console proxy, and backups typically take seconds to minutes.
