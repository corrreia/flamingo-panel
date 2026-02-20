# Pelican Panel: Egg Creation & Management

Reference documentation derived from the Pelican Panel source code at `/panel`.

---

## Table of Contents

- [Overview](#overview)
- [Database Schema](#database-schema)
  - [Eggs Table](#eggs-table)
  - [Egg Variables Table](#egg-variables-table)
- [Egg Model](#egg-model)
  - [Fillable Fields](#fillable-fields)
  - [Casts](#casts)
  - [Validation Rules](#validation-rules)
  - [Relationships](#relationships)
  - [Config & Script Inheritance](#config--script-inheritance)
  - [Lifecycle Hooks](#lifecycle-hooks)
- [Egg Variables](#egg-variables)
  - [Reserved Environment Variable Names](#reserved-environment-variable-names)
- [Admin Panel (Filament)](#admin-panel-filament)
  - [Egg Creation Form](#egg-creation-form)
  - [List View & Actions](#list-view--actions)
- [Import / Export](#import--export)
  - [Export Format (PLCN_v3)](#export-format-plcn_v3)
  - [Import Sources](#import-sources)
  - [Legacy Format Conversion](#legacy-format-conversion)
- [API Endpoints](#api-endpoints)
  - [Application API](#application-api)
  - [API Response Format](#api-response-format)
  - [Client API](#client-api)
- [Key Services](#key-services)
  - [EggImporterService](#eggimporterservice)
  - [EggExporterService](#eggexporterservice)
  - [EggChangerService](#eggchangerservice)
  - [EggConfigurationService](#eggconfigurationservice)
- [File Map](#file-map)

---

## Overview

In Pelican Panel, an **Egg** is a template that defines how a game server (or any containerized process) is configured, installed, and run. Eggs specify:

- Docker images to use
- Startup commands
- Environment variables (with validation rules)
- Install scripts (bash)
- Process management configuration (stop commands, log parsing, config file manipulation)
- Feature flags and file access controls

Eggs are the core abstraction that lets the panel manage many different types of game servers (Minecraft, Rust, CS2, etc.) with a single unified system.

---

## Database Schema

### Eggs Table

| Column                | Type                    | Notes                                                       |
| --------------------- | ----------------------- | ----------------------------------------------------------- |
| `id`                  | int (auto-increment PK) |                                                             |
| `uuid`                | string(36)              | Auto-generated UUID                                         |
| `author`              | string                  | Email address of egg author                                 |
| `name`                | string(255)             |                                                             |
| `description`         | string, nullable        |                                                             |
| `image`               | longText, nullable      | Egg icon (stored as file on disk, virtual accessor)         |
| `features`            | json, nullable          | Array of feature flags (e.g. `["eula", "java_version"]`)   |
| `docker_images`       | json (required)         | Key-value map: `{"Java 21": "ghcr.io/pelican-eggs/yolks:java_21"}` |
| `update_url`          | string, nullable        | URL for auto-updating egg definition                        |
| `force_outgoing_ip`   | boolean                 | Forces outgoing traffic to NAT to server IP                 |
| `file_denylist`       | json, nullable          | Array of filenames users cannot edit                        |
| `config_files`        | text/json, nullable     | JSON config for file modification by daemon                 |
| `config_startup`      | text/json, nullable     | JSON startup detection config                               |
| `config_logs`         | text/json, nullable     | JSON log configuration                                      |
| `config_stop`         | string(255), nullable   | Stop command (e.g. `stop`, `^C`)                            |
| `config_from`         | int, nullable (FK→eggs) | Inherit process config from another egg                     |
| `startup_commands`    | json (required)         | Key-value map: `{"Default": "java -Xms128M -XX:MaxRAMPercentage=95.0 -jar {{SERVER_JARFILE}}"}` |
| `script_is_privileged`| boolean                 | Whether install script runs privileged                      |
| `script_install`      | text, nullable          | The bash install script                                     |
| `script_entry`        | string                  | Script entrypoint (`bash`, `ash`, `/bin/bash`)              |
| `script_container`    | string                  | Docker image for install script                             |
| `copy_script_from`    | int, nullable (FK→eggs) | Inherit install script from another egg                     |
| `tags`                | json                    | Array of string tags, defaults to `[]`                      |
| `created_at`          | timestamp               |                                                             |
| `updated_at`          | timestamp               |                                                             |

### Egg Variables Table

| Column          | Type                       | Notes                                          |
| --------------- | -------------------------- | ---------------------------------------------- |
| `id`            | int (PK)                   |                                                |
| `egg_id`        | int (FK→eggs)              |                                                |
| `sort`          | unsignedTinyInteger, nullable | Ordering column                             |
| `name`          | string(1-255)              |                                                |
| `description`   | string                     |                                                |
| `env_variable`  | string(1-255)              | Alpha-dash, must not be a reserved name        |
| `default_value` | string                     |                                                |
| `user_viewable` | boolean (default 0)        | Can users see this variable?                   |
| `user_editable` | boolean (default 0)        | Can users modify this variable?                |
| `rules`         | json (array)               | Laravel validation rules as array              |
| `created_at`    | immutable_datetime         |                                                |
| `updated_at`    | immutable_datetime         |                                                |

---

## Egg Model

**File:** `app/Models/Egg.php`

### Constants

```php
RESOURCE_NAME    = 'egg'
EXPORT_VERSION   = 'PLCN_v3'
ICON_STORAGE_PATH = 'icons/egg'
IMAGE_FORMATS    = ['png', 'jpg', 'jpeg', 'webp', 'svg']
```

### Fillable Fields

```php
protected $fillable = [
    'uuid', 'name', 'author', 'description', 'features', 'docker_images',
    'force_outgoing_ip', 'file_denylist', 'config_files', 'config_startup',
    'config_logs', 'config_stop', 'config_from', 'startup_commands',
    'update_url', 'script_is_privileged', 'script_install', 'script_entry',
    'script_container', 'copy_script_from', 'tags',
];
```

### Casts

```php
'config_from'         => 'integer',
'script_is_privileged'=> 'boolean',
'force_outgoing_ip'   => 'boolean',
'copy_script_from'    => 'integer',
'features'            => 'array',
'docker_images'       => 'array',
'file_denylist'       => 'array',
'startup_commands'    => 'array',
'tags'                => 'array',
```

### Validation Rules

```php
'uuid'            => ['required', 'string', 'size:36'],
'name'            => ['required', 'string', 'max:255'],
'description'     => ['string', 'nullable'],
'features'        => ['array', 'nullable'],
'author'          => ['required', 'string', 'email'],
'file_denylist'   => ['array', 'nullable'],
'file_denylist.*' => ['string'],
'docker_images'   => ['required', 'array', 'min:1'],
'docker_images.*' => ['required', 'string'],
'startup_commands'   => ['required', 'array', 'min:1'],
'startup_commands.*' => ['required', 'string', 'distinct'],
'config_from'     => ['sometimes', 'bail', 'nullable', 'numeric', 'exists:eggs,id'],
'config_stop'     => ['required_without:config_from', 'nullable', 'string', 'max:255'],
'config_startup'  => ['required_without:config_from', 'nullable', 'json'],
'config_logs'     => ['required_without:config_from', 'nullable', 'json'],
'config_files'    => ['required_without:config_from', 'nullable', 'json'],
'update_url'      => ['sometimes', 'nullable', 'string'],
'force_outgoing_ip' => ['sometimes', 'boolean'],
'tags'            => ['array'],
```

### Relationships

| Method         | Type           | Target           | Foreign Key          |
| -------------- | -------------- | ---------------- | -------------------- |
| `servers()`    | HasMany        | `Server`         | `egg_id`             |
| `variables()`  | HasMany        | `EggVariable`    | `egg_id`             |
| `scriptFrom()` | BelongsTo      | `Egg` (self)     | `copy_script_from`   |
| `configFrom()` | BelongsTo      | `Egg` (self)     | `config_from`        |
| `children()`   | HasMany        | `Egg` (self)     | `config_from`        |
| `mounts()`     | MorphToMany    | `Mount`          | polymorphic `mountable` |

### Config & Script Inheritance

The Egg model supports inheriting configuration and install scripts from another egg via self-referential foreign keys. Virtual accessors handle the fallback:

| Accessor                   | Falls back to                          |
| -------------------------- | -------------------------------------- |
| `copy_script_install`      | `scriptFrom->script_install`           |
| `copy_script_entry`        | `scriptFrom->script_entry`             |
| `copy_script_container`    | `scriptFrom->script_container`         |
| `inherit_config_files`     | `configFrom->config_files`             |
| `inherit_config_startup`   | `configFrom->config_startup`           |
| `inherit_config_logs`      | `configFrom->config_logs`              |
| `inherit_config_stop`      | `configFrom->config_stop`              |
| `inherit_features`         | `configFrom->features`                 |
| `inherit_file_denylist`    | `configFrom->file_denylist`            |

### Lifecycle Hooks

- **Creating:** Auto-generates UUID if not provided.
- **Deleting:** Throws `HasActiveServersException` if the egg has servers. Throws `HasChildrenException` if egg has child eggs (via `config_from`).

---

## Egg Variables

**File:** `app/Models/EggVariable.php`

Egg variables define the environment variables available to a server. Each variable acts as a template — when a server is created from an egg, `ServerVariable` records are created with per-server values.

### Key Fields

- **`name`** — Human-readable name (e.g. "Server Jar File")
- **`env_variable`** — The actual env var name (e.g. `SERVER_JARFILE`)
- **`default_value`** — Default value if user doesn't set one
- **`user_viewable`** — Whether end users can see this variable
- **`user_editable`** — Whether end users can modify this variable
- **`rules`** — Array of Laravel validation rules (e.g. `["required", "regex:/^[\\w\\d._-]+\\.jar$/"]`)
- **`sort`** — Display ordering

### Reserved Environment Variable Names

These names cannot be used for egg variables:

```
P_SERVER_UUID, P_SERVER_ALLOCATION_LIMIT, SERVER_MEMORY, SERVER_IP,
SERVER_PORT, ENV, HOME, USER, STARTUP, MODIFIED_STARTUP, SERVER_UUID,
UUID, INTERNAL_IP, HOSTNAME, TERM, LANG, PWD, TZ, TIMEZONE
```

### Virtual Attribute

- `required` — Returns `true` if `'required'` is in the `rules` array.

---

## Admin Panel (Filament)

Pelican uses Laravel Filament for the admin panel. Egg management is at `/admin/eggs/`.

### Egg Creation Form

The create/edit form has **4 tabs**:

#### Tab 1: Configuration

| Field                  | Type       | Required | Notes                                              |
| ---------------------- | ---------- | -------- | -------------------------------------------------- |
| `name`                 | Text       | Yes      | Max 255 chars                                      |
| `author`               | Email      | Yes      | Max 255 chars                                      |
| `description`          | Textarea   | No       |                                                    |
| `startup_commands`     | Key-Value  | Yes      | Name → command, at least 1. Supports `{{VAR}}` placeholders |
| `file_denylist`        | Tags       | No       | Files users cannot edit via file manager            |
| `features`             | Tags       | No       | Feature flags (e.g. `eula`, `java_version`, `pid_limit`) |
| `force_outgoing_ip`    | Toggle     | No       |                                                    |
| `tags`                 | Tags       | No       | Categorization tags                                |
| `update_url`           | URL        | No       | For auto-update from remote source                 |
| `docker_images`        | Key-Value  | Yes      | Name → image URI, at least 1                       |

#### Tab 2: Process Management

| Field              | Type     | Required                    | Notes                          |
| ------------------ | -------- | --------------------------- | ------------------------------ |
| `config_from`      | Select   | No                          | Inherit config from another egg |
| `config_stop`      | Text     | Yes (unless inheriting)     | Max 255 chars                  |
| `config_startup`   | Textarea | Yes (unless inheriting)     | JSON format, defaults to `{}`  |
| `config_files`     | Textarea | Yes (unless inheriting)     | JSON format, defaults to `{}`  |
| `config_logs`      | Textarea | Yes (unless inheriting)     | JSON format, defaults to `{}`  |

#### Tab 3: Egg Variables (Repeater)

Each variable entry has:

| Field            | Type     | Required | Notes                                        |
| ---------------- | -------- | -------- | -------------------------------------------- |
| `name`           | Text     | Yes      | Auto-generates `env_variable` as UPPER_SNAKE_CASE |
| `description`    | Textarea | No       |                                              |
| `env_variable`   | Text     | Yes      | Alpha-dash, unique per egg, no reserved names |
| `default_value`  | Text     | No       |                                              |
| `user_viewable`  | Checkbox | No       |                                              |
| `user_editable`  | Checkbox | No       |                                              |
| `rules`          | Tags     | No       | Suggestions: `required`, `nullable`, `string`, `integer`, `numeric`, `boolean`, `regex:`, `min:`, `max:`, `between:`, `in:` |

#### Tab 4: Install Script

| Field              | Type           | Required | Notes                                           |
| ------------------ | -------------- | -------- | ----------------------------------------------- |
| `copy_script_from` | Select         | No       | Inherit script from another egg                 |
| `script_container` | Text           | Yes      | Defaults to `ghcr.io/pelican-eggs/installers:debian` |
| `script_entry`     | Select         | Yes      | `bash`, `ash`, `/bin/bash` — defaults to `bash` |
| `script_install`   | Monaco Editor  | No       | Shell language, the actual install script        |

### List View & Actions

The list page (`/admin/eggs/`) provides:

- **Table columns:** Name, UUID, tags, servers count
- **Search:** By name
- **Filter:** By tags
- **Header actions:**
  - **Import Egg** — From file upload, URL, or GitHub egg index
  - **Update All** — Bulk update eggs that have `update_url` set
- **Row actions:**
  - **Edit** — Open edit form
  - **Export** — Download as JSON or YAML
  - **Update** — Update from `update_url` (single egg)
  - **Replicate** — Clone/duplicate egg
  - **Delete** — Delete (disabled if servers are using it)
- **Bulk actions:**
  - **Update** — Update selected eggs from their `update_url`s

---

## Import / Export

### Export Format (PLCN_v3)

Eggs can be exported as YAML (default) or JSON. The current format version is `PLCN_v3`.

```yaml
_comment: "DO NOT EDIT: FILE GENERATED AUTOMATICALLY BY PANEL"
meta:
  version: PLCN_v3
  update_url: <url or null>
exported_at: "2025-01-15T12:00:00+00:00"
name: "Vanilla Minecraft"
author: "panel@example.com"
uuid: "9ac39f3d-..."
description: "Minecraft server using the default Mojang jar"
image: "data:image/png;base64,..." # Egg icon embedded as base64, or null
tags:
  - minecraft
  - java
features:
  - eula
  - java_version
docker_images:
  Java 21: "ghcr.io/pelican-eggs/yolks:java_21"
  Java 17: "ghcr.io/pelican-eggs/yolks:java_17"
file_denylist:
  - "server.properties"
startup_commands:
  Default: "java -Xms128M -XX:MaxRAMPercentage=95.0 -jar {{SERVER_JARFILE}}"
config:
  files: '{"server.properties":{"parser":"properties","find":{"server-ip":"0.0.0.0","server-port":"{{server.build.default.port}}"}}}'
  startup: '{"done":"Done"}'
  logs: '{}'
  stop: "stop"
scripts:
  installation:
    script: |
      #!/bin/ash
      apk add --no-cache curl jq
      # ... rest of install script
    container: "ghcr.io/pelican-eggs/installers:alpine"
    entrypoint: ash
variables:
  - name: "Server Jar File"
    description: "The name of the server jarfile to run the server with."
    env_variable: SERVER_JARFILE
    default_value: "server.jar"
    user_viewable: true
    user_editable: true
    rules:
      - required
      - "regex:/^[\\w\\d._-]+\\.jar$/"
    sort: 0
  - name: "Server Version"
    description: "The version of Minecraft to install."
    env_variable: MINECRAFT_VERSION
    default_value: "latest"
    user_viewable: true
    user_editable: true
    rules:
      - required
      - string
    sort: 1
```

### Import Sources

The importer (`EggImporterService`) supports three input methods:

1. **File upload** — `.json`, `.yaml`, or `.yml` files
2. **URL** — Direct URL to a raw egg file (downloads and parses)
3. **GitHub egg index** — Fetches from cached `pelican-eggs` repository index, dispatches `InstallEgg` jobs

### Import Logic

1. Wraps in a database transaction
2. Finds existing egg by UUID or creates a new one
3. Uses `forceFill()` to set all fields
4. Creates/updates variables via `updateOrCreate` on `env_variable`
5. Deletes variables no longer present in the import
6. Handles reserved env variable name conflicts by prefixing with `SERVER_`
7. Saves base64-encoded images from the import to disk

### Legacy Format Conversion

The importer supports automatic conversion from older formats:

| Format    | Origin          | Conversion Path                       |
| --------- | --------------- | ------------------------------------- |
| `PTDL_v1` | Pterodactyl v1  | `convertLegacy()` → `convertToV3()`  |
| `PTDL_v2` | Pterodactyl v2  | `convertToV3()`                       |
| `PLCN_v1` | Pelican v1      | `convertToV3()`                       |
| `PLCN_v2` | Pelican v2      | `convertToV3()`                       |
| `PLCN_v3` | Pelican current | Used as-is                            |

Key conversion difference: V1/V2 had a single `startup` string; V3 has a `startup_commands` map (key-value).

Variable reference upgrades (Pterodactyl → Pelican):

```
server.build.env.SERVER_IP     → server.allocations.default.ip
server.build.env.SERVER_PORT   → server.allocations.default.port
server.build.env.SERVER_MEMORY → server.build.memory_limit
server.build.env.              → server.environment.
```

---

## API Endpoints

### Application API

All endpoints require admin API key with appropriate permissions.

| Method   | Endpoint                                  | Description                 | Permission |
| -------- | ----------------------------------------- | --------------------------- | ---------- |
| `GET`    | `/api/application/eggs/`                  | List all eggs               | READ       |
| `GET`    | `/api/application/eggs/{id}`              | View single egg by ID       | READ       |
| `GET`    | `/api/application/eggs/{id}/export?format=yaml\|json` | Export egg as file download | READ |
| `POST`   | `/api/application/eggs/import`            | Import egg from request body (YAML/JSON) | WRITE |
| `DELETE` | `/api/application/eggs/{id}`              | Delete egg by ID            | READ       |
| `DELETE` | `/api/application/eggs/uuid/{uuid}`       | Delete egg by UUID          | READ       |

**Mount-related endpoints:**

| Method   | Endpoint                                         | Description              |
| -------- | ------------------------------------------------ | ------------------------ |
| `GET`    | `/api/application/mounts/{id}/eggs`              | Get eggs for a mount     |
| `POST`   | `/api/application/mounts/{id}/eggs`              | Add eggs to a mount      |
| `DELETE` | `/api/application/mounts/{id}/eggs/{egg_id}`     | Remove egg from mount    |

### API Response Format

**Application API (EggTransformer):**

```json
{
  "id": 1,
  "uuid": "9ac39f3d-...",
  "name": "Vanilla Minecraft",
  "author": "panel@example.com",
  "description": "...",
  "image": "https://panel.example.com/storage/icons/egg/9ac39f3d.png",
  "features": ["eula", "java_version"],
  "tags": ["minecraft"],
  "docker_image": "ghcr.io/pelican-eggs/yolks:java_21",
  "docker_images": {
    "Java 21": "ghcr.io/pelican-eggs/yolks:java_21",
    "Java 17": "ghcr.io/pelican-eggs/yolks:java_17"
  },
  "config": {
    "files": {},
    "startup": {},
    "stop": "stop",
    "logs": {},
    "file_denylist": [],
    "extends": null
  },
  "startup": "java -Xms128M ...",
  "startup_commands": {
    "Default": "java -Xms128M ..."
  },
  "script": {
    "privileged": true,
    "install": "#!/bin/ash\n...",
    "entry": "ash",
    "container": "ghcr.io/pelican-eggs/installers:alpine",
    "extends": null
  },
  "created_at": "2025-01-15T12:00:00+00:00",
  "updated_at": "2025-01-15T12:00:00+00:00"
}
```

> `docker_image` and `startup` are deprecated scalar fields kept for backward compatibility (they return the first value from their respective maps).

Available includes: `servers`, `config`, `script`, `variables`

### Client API

The client API exposes minimal egg data:

**EggTransformer:** Returns only `uuid` and `name`.

**EggVariableTransformer:** Only exposes variables where `user_viewable = true`:

```json
{
  "name": "Server Jar File",
  "description": "...",
  "env_variable": "SERVER_JARFILE",
  "default_value": "server.jar",
  "server_value": "server.jar",
  "is_editable": true,
  "rules": "required|regex:/^([\\w\\d._-]+)(\\.jar)$/"
}
```

---

## Key Services

### EggImporterService

**File:** `app/Services/Eggs/Sharing/EggImporterService.php`

Entry points:

- `fromContent(string $content, EggFormat $format, ?Egg $egg)` — Parse raw YAML/JSON content
- `fromFile(UploadedFile $file, ?Egg $egg)` — Parse uploaded file (auto-detects format)
- `fromUrl(string $url, ?Egg $egg)` — Download from URL and parse

Handles legacy format conversion, variable upsert/delete, reserved name collision resolution, and base64 image extraction.

### EggExporterService

**File:** `app/Services/Eggs/Sharing/EggExporterService.php`

Generates the `PLCN_v3` export structure. Embeds egg icons as base64 data URIs.

### EggChangerService

**File:** `app/Services/Eggs/EggChangerService.php`

Changes a server's egg assignment:

1. Updates `egg_id`, `image` (first docker image from new egg), and `startup` (first startup command)
2. Optionally preserves old variable values if `env_variable` names match between old and new egg
3. Deletes old `ServerVariable` records, creates new ones from new egg's variables

### EggConfigurationService

**File:** `app/Services/Eggs/EggConfigurationService.php`

Generates the daemon configuration payload from an egg's process management settings. Handles config inheritance resolution.

---

## File Map

### Models

| File | Purpose |
| ---- | ------- |
| `app/Models/Egg.php` | Main Egg model |
| `app/Models/EggVariable.php` | Egg variable (env var template) model |
| `app/Models/ServerVariable.php` | Per-server variable value model |

### Services

| File | Purpose |
| ---- | ------- |
| `app/Services/Eggs/EggChangerService.php` | Change a server's egg |
| `app/Services/Eggs/EggConfigurationService.php` | Generate daemon config from egg |
| `app/Services/Eggs/Sharing/EggExporterService.php` | Export egg to YAML/JSON |
| `app/Services/Eggs/Sharing/EggImporterService.php` | Import egg from various sources |

### API Layer

| File | Purpose |
| ---- | ------- |
| `app/Http/Controllers/Api/Application/Eggs/EggController.php` | API CRUD controller |
| `app/Http/Requests/Api/Application/Eggs/GetEggRequest.php` | View/delete request |
| `app/Http/Requests/Api/Application/Eggs/GetEggsRequest.php` | List request |
| `app/Http/Requests/Api/Application/Eggs/ExportEggRequest.php` | Export request |
| `app/Http/Requests/Api/Application/Eggs/ImportEggRequest.php` | Import request |
| `app/Transformers/Api/Application/EggTransformer.php` | Full egg data for admin API |
| `app/Transformers/Api/Application/EggVariableTransformer.php` | Variable data for admin API |
| `app/Transformers/Api/Client/EggTransformer.php` | Minimal egg data for client API |
| `app/Transformers/Api/Client/EggVariableTransformer.php` | User-visible variables for client API |

### Admin Panel (Filament)

| File | Purpose |
| ---- | ------- |
| `app/Filament/Admin/Resources/Eggs/EggResource.php` | Resource registration |
| `app/Filament/Admin/Resources/Eggs/Pages/CreateEgg.php` | Create form (4 tabs) |
| `app/Filament/Admin/Resources/Eggs/Pages/EditEgg.php` | Edit form (4 tabs + image upload) |
| `app/Filament/Admin/Resources/Eggs/Pages/ListEggs.php` | List table with actions |
| `app/Filament/Admin/Resources/Eggs/RelationManagers/ServersRelationManager.php` | Servers relation |
| `app/Filament/Components/Actions/ImportEggAction.php` | Import (file/URL/GitHub) |
| `app/Filament/Components/Actions/ExportEggAction.php` | Export (JSON/YAML) |
| `app/Filament/Components/Actions/UpdateEggAction.php` | Update from URL (single) |
| `app/Filament/Components/Actions/UpdateEggBulkAction.php` | Update from URL (bulk) |

### Console Commands

| File | Purpose |
| ---- | ------- |
| `app/Console/Commands/Egg/CheckEggUpdatesCommand.php` | `p:egg:check-updates` — Compares local vs remote |
| `app/Console/Commands/Egg/UpdateEggIndexCommand.php` | Updates cached GitHub egg index |

### Jobs & Enums

| File | Purpose |
| ---- | ------- |
| `app/Jobs/InstallEgg.php` | Queued job to install egg from URL |
| `app/Enums/EggFormat.php` | `YAML = 'yaml'`, `JSON = 'json'` |

### Routes

| File | Purpose |
| ---- | ------- |
| `routes/api-application.php` | Egg API route definitions |
