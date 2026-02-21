# Eggs -- Complete Reference

Eggs are the core abstraction for defining **how a game server is installed, configured, started, and stopped**. An egg is a large structured document (JSON or YAML) that bundles together a Docker image, a startup command, an installation script, configuration file manipulation rules, and user-configurable variables. Every server in Flamingo is backed by exactly one egg.

> **Source:** This reference is derived from the Pelican Panel source at `/panel`, the Wings agent source at `/wings`, and Flamingo's own implementation at `/flamingo-panel`.

---

## Table of Contents

- [Concept Overview](#concept-overview)
- [Egg Lifecycle](#egg-lifecycle)
- [Egg Format Versions](#egg-format-versions)
  - [PLCN_v3 (Current)](#plcn_v3-current)
  - [Legacy Formats](#legacy-formats)
- [Egg Fields Reference](#egg-fields-reference)
  - [Identity & Metadata](#identity--metadata)
  - [Docker Images](#docker-images)
  - [Startup Commands](#startup-commands)
  - [Process Configuration](#process-configuration)
  - [Installation Script](#installation-script)
  - [Variables](#variables)
  - [File Denylist](#file-denylist)
  - [Features](#features)
  - [Tags](#tags)
- [Database Schema](#database-schema)
  - [eggs Table](#eggs-table)
  - [eggVariables Table](#eggvariables-table)
  - [Relationship to Servers](#relationship-to-servers)
- [How Eggs Flow Through the System](#how-eggs-flow-through-the-system)
  - [1. Import / Create](#1-import--create)
  - [2. Server Creation](#2-server-creation)
  - [3. Wings Boot (Server Sync)](#3-wings-boot-server-sync)
  - [4. Wings Install](#4-wings-install)
  - [5. Wings Runtime](#5-wings-runtime)
  - [6. Export](#6-export)
- [The Import Normalizer](#the-import-normalizer)
  - [Version Detection](#version-detection)
  - [Conversion Pipeline](#conversion-pipeline)
  - [Environment Variable Path Upgrades](#environment-variable-path-upgrades)
  - [Reserved Variable Handling](#reserved-variable-handling)
- [Config Files (File Parser Rules)](#config-files-file-parser-rules)
- [Config Startup (Done Detection)](#config-startup-done-detection)
- [Stop Mechanism](#stop-mechanism)
- [API Endpoints](#api-endpoints)
- [Frontend Pages](#frontend-pages)
- [Key Source Files](#key-source-files)
- [Real-World Example: Vanilla Minecraft Egg](#real-world-example-vanilla-minecraft-egg)
- [Common Pitfalls](#common-pitfalls)

---

## Concept Overview

Think of an egg as a **recipe** for a game server. It answers these questions:

1. **What Docker image should the server run in?** -- e.g. `ghcr.io/pelican-eggs/yolks:java_21`
2. **How do you start the server?** -- e.g. `java -Xms128M -XX:MaxRAMPercentage=95.0 -jar {{SERVER_JARFILE}}`
3. **How do you install it?** -- A bash script that runs inside a temporary container to download server files
4. **How do you know when it's done starting?** -- A console output string to watch for (e.g. `")! For help, type "`)
5. **How do you stop it?** -- A command to send (e.g. `stop`) or a signal (e.g. `SIGTERM`)
6. **What config files need to be patched?** -- Parser rules that inject ports, IPs, etc. into game config files
7. **What variables can the user customize?** -- Named environment variables with defaults, validation rules, and visibility controls

Eggs are **format-compatible with Pelican Panel** (and the older Pterodactyl). You can import eggs from the Pelican community egg repository and they work as-is. Flamingo exports eggs in the `PLCN_v3` format, which Pelican can also import.

---

## Egg Lifecycle

```
  Community egg repo (JSON/YAML)
       │
       ▼
  ┌─────────────┐     ┌──────────────┐
  │ Import/Create│────▶│ eggs table   │
  │ (normalize)  │     │ (D1 database)│
  └─────────────┘     └──────┬───────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        Server Create   Wings Boot    Wings Install
              │              │              │
              ▼              ▼              ▼
     servers table    Boot payload    Install script
     + serverVars     (settings +     (container_image +
                      process_config)  entrypoint + script)
              │              │              │
              └──────────────┼──────────────┘
                             ▼
                     Wings runs Docker
                     container with the
                     egg's configuration
```

---

## Egg Format Versions

### PLCN_v3 (Current)

This is the canonical format used by Pelican Panel and Flamingo. It is what Flamingo exports and is the internal target for all import conversions.

**Identifying marker:** `meta.version: "PLCN_v3"`

Key structural traits of v3:
- Docker images are a **named map**: `docker_images: { "Java 21": "ghcr.io/...", "Java 17": "ghcr.io/..." }`
- Startup commands are a **named map**: `startup_commands: { Default: "java -jar ..." }`
- Variables use `env_variable` (not `env_var`) and `rules` as an **array** of strings
- Install script lives under `scripts.installation.script`
- Config under `config: { files, startup, logs, stop }`

### Legacy Formats

| Version | Origin | Key Differences |
|---------|--------|-----------------|
| `PTDL_v1` | Pterodactyl | Single `image` string or `images` array instead of named map; startup is a plain string; variables have `field_type` field |
| `PTDL_v2` | Pterodactyl | `docker_images` map exists; startup is still a plain string (not a map) |
| `PLCN_v1` | Early Pelican | Same structure as PTDL_v2 but with `PLCN_v1` version tag |
| `PLCN_v2` | Pelican | Same structure as PLCN_v1 but with `PLCN_v2` version tag; startup still a string |

All legacy formats are auto-converted to PLCN_v3 shape during import. See [The Import Normalizer](#the-import-normalizer).

---

## Egg Fields Reference

### Identity & Metadata

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name (e.g. "Vanilla Minecraft", "Rust", "Terraria") |
| `author` | string | Author email (e.g. `panel@example.com`) |
| `description` | string | Human-readable description of the game server |
| `uuid` | string | Unique identifier (only in export format; internally we use `id`) |
| `tags` | string[] | Categorization tags (e.g. `["minecraft"]`, `["rust", "survival"]`) |

### Docker Images

Eggs define one or more Docker images that the game server can run in. Each image has a human-readable label and a full image reference:

```json
{
  "docker_images": {
    "Java 21": "ghcr.io/pelican-eggs/yolks:java_21",
    "Java 17": "ghcr.io/pelican-eggs/yolks:java_17",
    "Java 11": "ghcr.io/pelican-eggs/yolks:java_11"
  }
}
```

- The **first entry** is treated as the default image
- When creating a server, the admin picks which image to use; this is stored on the `servers.image` column
- Images are typically from `ghcr.io/pelican-eggs/yolks` (game runtimes) or `ghcr.io/pelican-eggs/games` (full game images)
- In the database, this is stored as a JSON-stringified object in `eggs.dockerImages`

### Startup Commands

The command that Wings executes inside the Docker container to start the game server:

```json
{
  "startup_commands": {
    "Default": "java -Xms128M -XX:MaxRAMPercentage=95.0 -jar {{SERVER_JARFILE}}"
  }
}
```

- Uses `{{VARIABLE_NAME}}` template syntax -- Wings substitutes these with environment variable values at runtime
- The **first entry** in the map is treated as the default startup command
- When creating a server, the admin can override the startup command; this is stored on `servers.startup`
- In the database, only the first/default command is stored in `eggs.startup` as a plain string

### Process Configuration

#### config.startup -- Done Detection

Tells Wings how to detect when the server has finished starting:

```json
{
  "config": {
    "startup": {
      "done": ")! For help, type "
    }
  }
}
```

- `done` is a string (or array of strings) that Wings watches for in the server's console output
- When a line matches, Wings transitions the server from `starting` to `running` state
- Can be a literal substring match or prefixed with `regex:` for regex matching
- Stored in `eggs.configStartup` as a JSON string
- Wings uses `OutputLineMatcher` structs (see `wings/remote/types.go:94-133`) for matching

#### config.files -- File Parser Rules

Defines how Wings should automatically modify game server configuration files at startup:

```json
{
  "config": {
    "files": {
      "server.properties": {
        "parser": "properties",
        "find": {
          "server-ip": "",
          "server-port": "{{server.allocations.default.port}}",
          "query.port": "{{server.allocations.default.port}}"
        }
      }
    }
  }
}
```

- **Keys** are file paths relative to the server root
- **`parser`** specifies the file format: `properties`, `json`, `yaml`, `xml`, `ini`, `file`
- **`find`** maps config keys to values -- Wings rewrites these values on every server start
- Template variables use `{{server.*}}` paths:
  - `{{server.allocations.default.ip}}` -- the server's bound IP
  - `{{server.allocations.default.port}}` -- the server's primary port
  - `{{server.build.memory_limit}}` -- memory limit in MB
  - `{{server.environment.VARIABLE_NAME}}` -- any environment variable
- Stored in `eggs.configFiles` as a JSON string
- Wings processes these via its `parser` package (see `wings/parser/`)

#### config.logs

Log configuration (rarely used):

```json
{
  "config": {
    "logs": {}
  }
}
```

Stored in `eggs.configLogs` as a JSON string. Most eggs leave this empty.

### Installation Script

A bash script that runs inside a temporary Docker container to download and set up the game server files:

```yaml
scripts:
  installation:
    script: |
      #!/bin/ash
      mkdir -p /mnt/server
      cd /mnt/server
      # ... download game server files ...
      echo "Install Complete"
    container: ghcr.io/pelican-eggs/installers:alpine
    entrypoint: ash
```

| Field | DB Column | Description |
|-------|-----------|-------------|
| `script` | `scriptInstall` | The full bash script body |
| `container` | `scriptContainer` | Docker image for the install container (default: `ghcr.io/pelican-dev/installer:latest`) |
| `entrypoint` | `scriptEntry` | Shell entrypoint (default: `bash`; Alpine images use `ash`) |

**How the install works (Wings side):**

1. Wings calls `GET /api/remote/servers/:uuid/install` on the panel to fetch the script
2. Panel returns `{ container_image, entrypoint, script }` from the egg
3. Wings pulls the install container image
4. Wings creates a temporary Docker container with:
   - The server's data directory mounted at `/mnt/server`
   - The install directory mounted at `/mnt/install`
   - All egg environment variables injected
5. Wings writes the script to a temp file and executes it via the entrypoint
6. Wings streams install output to the WebSocket console
7. When done, Wings calls `POST /api/remote/servers/:uuid/install` to report success/failure
8. The `skip_egg_scripts` flag (per-server) can bypass installation entirely

**Source:** `wings/server/install.go`

### Variables

Variables are the **user-configurable parameters** of an egg. Each variable maps to an environment variable that gets injected into the server's Docker container.

```yaml
variables:
  - name: "Server Jar File"
    description: "The name of the server jarfile to run the server with."
    env_variable: SERVER_JARFILE
    default_value: server.jar
    user_viewable: true
    user_editable: true
    rules:
      - required
      - "regex:/^([\\w\\d._-]+)(\\.jar)$/"
    sort: 1
```

| Field | DB Column | Description |
|-------|-----------|-------------|
| `name` | `name` | Human-readable label shown in the UI |
| `description` | `description` | Help text shown below the input |
| `env_variable` | `envVariable` | The actual environment variable name (e.g. `SERVER_JARFILE`) |
| `default_value` | `defaultValue` | Default value if the user doesn't set one |
| `user_viewable` | `userViewable` | Whether non-admin users can see this variable (0/1 in DB, bool in API) |
| `user_editable` | `userEditable` | Whether non-admin users can edit this variable (0/1 in DB, bool in API) |
| `rules` | `rules` | Validation rules, pipe-delimited in DB (e.g. `"required\|string\|max:64"`) |
| `sort` | `sortOrder` | Display order in the UI |

**How variables flow:**

1. Egg defines variables with defaults and validation rules
2. When a server is created, each egg variable gets a corresponding `serverVariables` row with the default (or user-provided) value
3. At boot time, Wings receives the full environment map: egg defaults merged with server-specific overrides plus system variables (`STARTUP`, `P_SERVER_UUID`, `P_SERVER_LOCATION`)
4. Wings injects these as environment variables into the Docker container
5. The startup command's `{{VARIABLE_NAME}}` placeholders are resolved by Wings before execution

**Validation rules format:** Pipe-delimited Laravel-style rules. Common examples:
- `required` -- must have a value
- `string` -- must be a string
- `numeric` -- must be a number
- `max:64` -- max string length or numeric value
- `between:3,15` -- length/value between min and max
- `regex:/^pattern$/` -- must match regex
- `in:value1,value2,value3` -- must be one of the listed values
- `nullable` -- value can be empty

### File Denylist

A list of file paths/patterns that cannot be accessed by any user through the file manager or SFTP:

```json
{
  "file_denylist": ["*.jar"]
}
```

- Enforced at the Wings level in the filesystem layer and middleware
- Stored as a JSON array in `eggs.fileDenylist`
- Wings initializes the filesystem with the denylist: `s.fs, err = filesystem.New(..., s.Config().Egg.FileDenylist)`
- Error message when blocked: `"This file cannot be modified: present in egg denylist."`

### Features

Feature flags that trigger special Wings behavior based on console output:

```json
{
  "features": ["eula", "java_version", "pid_limit"]
}
```

- Wings listens for feature-specific patterns in the console output
- When matched, Wings publishes a `FeatureMatchEvent` over WebSocket
- The frontend can use these events to show prompts (e.g. "Accept EULA?", "Wrong Java version detected")
- Stored as a JSON object in the DB (Pelican uses `map[string][]string` on the Wings side where keys are feature names and values are match patterns)
- Flamingo stores these as a simple JSON array of feature name strings

### Tags

Simple categorization strings for organizing eggs in the UI:

```json
{
  "tags": ["minecraft", "java"]
}
```

Stored as a JSON array in `eggs.tags`. Used for filtering/grouping in the admin egg list page.

---

## Database Schema

### eggs Table

Defined in `src/db/schema.ts:36-58`:

| Column | SQLite Type | Default | Description |
|--------|-------------|---------|-------------|
| `id` | TEXT PK | UUID | Primary key |
| `name` | TEXT NOT NULL | -- | Display name |
| `author` | TEXT | `""` | Author email |
| `description` | TEXT | `""` | Description |
| `docker_image` | TEXT NOT NULL | `""` | Default Docker image |
| `docker_images` | TEXT | `"{}"` | JSON map of label -> image |
| `startup` | TEXT NOT NULL | `""` | Default startup command |
| `stop_command` | TEXT NOT NULL | `"stop"` | Stop command |
| `stop_signal` | TEXT NOT NULL | `"SIGTERM"` | Stop signal (unused by Wings currently) |
| `config_startup` | TEXT | `"{}"` | JSON -- done detection config |
| `config_files` | TEXT | `"[]"` | JSON -- file parser rules |
| `config_logs` | TEXT | `"{}"` | JSON -- log config |
| `script_install` | TEXT | `""` | Bash install script body |
| `script_container` | TEXT | `"ghcr.io/pelican-dev/installer:latest"` | Install container image |
| `script_entry` | TEXT | `"bash"` | Install script entrypoint |
| `file_denylist` | TEXT | `"[]"` | JSON array of denied file patterns |
| `features` | TEXT | `"{}"` | JSON features |
| `tags` | TEXT | `"[]"` | JSON array of tags |
| `created_at` | TEXT NOT NULL | `datetime('now')` | Timestamp |
| `updated_at` | TEXT NOT NULL | `datetime('now')` | Timestamp |

### eggVariables Table

Defined in `src/db/schema.ts:103-120`:

| Column | SQLite Type | Default | Description |
|--------|-------------|---------|-------------|
| `id` | TEXT PK | UUID | Primary key |
| `egg_id` | TEXT NOT NULL | -- | FK -> `eggs.id` (cascade delete) |
| `name` | TEXT NOT NULL | -- | Human-readable label |
| `description` | TEXT | `""` | Help text |
| `env_variable` | TEXT NOT NULL | -- | Environment variable name |
| `default_value` | TEXT | `""` | Default value |
| `user_viewable` | INTEGER NOT NULL | `0` | 1 = visible to users |
| `user_editable` | INTEGER NOT NULL | `0` | 1 = editable by users |
| `rules` | TEXT NOT NULL | `"required\|string"` | Pipe-delimited validation rules |
| `sort_order` | INTEGER NOT NULL | `0` | Display order |

Index: `idx_egg_variables_egg` on `egg_id`.

### Relationship to Servers

```
eggs 1──────────────N servers          (servers.egg_id -> eggs.id)
eggs 1──────────────N eggVariables     (egg_variables.egg_id -> eggs.id, cascade delete)
eggVariables 1──────N serverVariables  (server_variables.variable_id -> egg_variables.id, cascade delete)
servers 1───────────N serverVariables  (server_variables.server_id -> servers.id, cascade delete)
```

When an egg is deleted:
- Its `eggVariables` are cascade-deleted
- Which cascade-deletes the related `serverVariables`
- But the API **blocks deletion** if any servers reference the egg (`src/api/eggs.ts:366-391`)

When a server is created:
- `servers.eggId` references the egg
- `servers.startup` gets the egg's default startup (unless overridden)
- `servers.image` gets the egg's default Docker image (unless overridden)
- A `serverVariables` row is created for **each** egg variable, with the default value (or user-provided override)

---

## How Eggs Flow Through the System

### 1. Import / Create

**Import:** `POST /api/eggs/import` -- Accepts any Pelican/Pterodactyl egg JSON. The `normalizeEgg()` function in `src/lib/egg-import.ts` detects the format version, runs the conversion pipeline, and returns a `NormalizedEgg`. The API handler inserts the egg and its variables into D1.

**Create:** `POST /api/eggs` -- The admin fills out the 4-tab creation form (Configuration, Process Management, Variables, Install Script). The API validates with Zod and inserts directly.

### 2. Server Creation

`POST /api/servers` in `src/api/servers.ts`:

1. Validates the egg exists
2. Creates the server record with `eggId`, `startup` (from egg or override), and `image` (from egg or override)
3. Copies every egg variable into `serverVariables` with defaults or user-provided values
4. Builds an install payload via `buildInstallPayload()` from `src/services/wings-payload.ts`
5. Sends `POST /api/servers` to Wings to create and install the server

### 3. Wings Boot (Server Sync)

When Wings starts (or re-syncs), it calls `GET /api/remote/servers` on the panel. For each server, the panel returns a boot configuration payload built by `buildBootConfig()`:

```json
{
  "uuid": "...",
  "settings": "{...stringified JSON...}",
  "process_configuration": "{...stringified JSON...}"
}
```

The `settings` string contains:
- `uuid`, `meta` (name, description), `suspended`, `invocation` (startup command)
- `environment` -- full env var map (egg defaults + server overrides + system vars)
- `allocations` -- IP/port bindings
- `build` -- resource limits (memory, disk, cpu, swap, io)
- `container` -- Docker image
- `egg` -- `{ id, file_denylist }` (used by Wings for file access control)
- `crash_detection_enabled`

The `process_configuration` string contains:
- `startup.done` -- array of match strings for start detection
- `stop` -- `{ type: "command", value: "stop" }`
- `configs` -- file parser rules

Wings deserializes these into its `Configuration` and `ProcessConfiguration` structs and uses them to manage the server lifecycle.

### 4. Wings Install

When Wings needs to install a server, it calls `GET /api/remote/servers/:uuid/install` on the panel. The panel returns:

```json
{
  "container_image": "ghcr.io/pelican-eggs/installers:alpine",
  "entrypoint": "ash",
  "script": "#!/bin/ash\nmkdir -p /mnt/server\n..."
}
```

Wings then:
1. Pulls the install container image
2. Creates a temporary Docker container with server directory mounted at `/mnt/server`
3. Injects all environment variables
4. Executes the install script
5. Reports success/failure back to `POST /api/remote/servers/:uuid/install`

**Source:** `wings/server/install.go:40-97`

### 5. Wings Runtime

During server runtime, Wings uses egg data for:

- **Start detection:** Watches console output against `processConfiguration.Startup.Done` matchers (`wings/server/listeners.go:156-193`)
- **Feature matching:** Watches console output against `EggConfiguration.Features` patterns and publishes WebSocket events (`wings/server/listeners.go:195-236`)
- **File access control:** Blocks access to files matching `EggConfiguration.FileDenylist` (`wings/server/manager.go:199`)
- **Stop command:** Sends the configured stop command when a stop is requested (`wings/remote/types.go:136-139`)
- **Config file patching:** Applies file parser rules on every server start to inject correct ports/IPs/variables

### 6. Export

`GET /api/eggs/:id/export` produces a PLCN_v3-compatible JSON document that can be imported into any Pelican or Flamingo panel instance. The export includes all egg fields and variables in the canonical format.

---

## The Import Normalizer

**Source:** `src/lib/egg-import.ts` (443 lines)

The normalizer is a pure-function pipeline that converts any egg format into our internal `NormalizedEgg` shape.

### Version Detection

`detectVersion()` at line 156:

1. First checks `meta.version` for an explicit version tag
2. Falls back to shape-based detection:
   - Has `image` or `images` field -> `PTDL_v1`
   - Has `startup` string + `docker_images` object -> `PTDL_v2`
   - Has `startup_commands` object -> `PLCN_v3`
3. Returns `"unknown"` if nothing matches (triggers error)

### Conversion Pipeline

```
PTDL_v1 ──▶ convertLegacy() ──▶ convertToV3() ──▶ normalize
PTDL_v2 ─────────────────────▶ convertToV3() ──▶ normalize
PLCN_v1 ─────────────────────▶ convertToV3() ──▶ normalize
PLCN_v2 ─────────────────────▶ convertToV3() ──▶ normalize
PLCN_v3 ──────────────────────────────────────▶ normalize
```

**`convertLegacy()` (PTDL_v1 only):**
- Converts `image` (string) or `images` (string[]) to `docker_images` map
- Strips `field_type` from variables

**`convertToV3()` (v1/v2 -> v3):**
- Converts `startup` string to `startup_commands: { Default: startup }`

### Environment Variable Path Upgrades

`upgradeEnvPaths()` rewrites old Pterodactyl-style variable paths in `config.files` values to Pelican-style paths:

| Old Path | New Path |
|----------|----------|
| `server.build.env.SERVER_IP` | `server.allocations.default.ip` |
| `server.build.default.ip` | `server.allocations.default.ip` |
| `server.build.env.SERVER_PORT` | `server.allocations.default.port` |
| `server.build.default.port` | `server.allocations.default.port` |
| `server.build.env.SERVER_MEMORY` | `server.build.memory_limit` |
| `server.build.memory` | `server.build.memory_limit` |
| `server.build.env.*` | `server.environment.*` |
| `server.build.environment.*` | `server.environment.*` |

Order matters: longer/more-specific prefixes are replaced first.

### Reserved Variable Handling

`handleReservedVars()` checks each variable's `env_variable` against a reserved list. If a collision is found, the variable is prefixed with `SERVER_` and all references in startup commands are patched accordingly.

Reserved names (19 total):
```
P_SERVER_UUID, P_SERVER_ALLOCATION_LIMIT, SERVER_MEMORY, SERVER_IP,
SERVER_PORT, ENV, HOME, USER, STARTUP, MODIFIED_STARTUP, SERVER_UUID,
UUID, INTERNAL_IP, HOSTNAME, TERM, LANG, PWD, TZ, TIMEZONE
```

---

## Config Files (File Parser Rules)

The `config.files` field tells Wings how to automatically modify game server configuration files on every start. This is critical for injecting the correct port, IP, and other dynamic values.

**Structure:**

```json
{
  "server.properties": {
    "parser": "properties",
    "find": {
      "server-port": "{{server.allocations.default.port}}",
      "server-ip": "",
      "query.port": "{{server.allocations.default.port}}"
    }
  }
}
```

**Supported parsers** (implemented in `wings/parser/`):
- `properties` -- Java .properties files
- `json` -- JSON files
- `yaml` -- YAML files
- `xml` -- XML files
- `ini` -- INI files
- `file` -- Raw line-based replacement

**Template variables** available in `find` values:
- `{{server.allocations.default.ip}}` -- bound IP address
- `{{server.allocations.default.port}}` -- primary port
- `{{server.build.memory_limit}}` -- memory limit in MB
- `{{server.environment.VARIABLE_NAME}}` -- any environment variable value

---

## Config Startup (Done Detection)

The `config.startup` field tells Wings how to detect that a server has successfully started:

```json
{
  "startup": {
    "done": ")! For help, type "
  }
}
```

- `done` can be a single string or an array of strings
- Each string is matched against every line of console output
- Prefix with `regex:` for regex pattern matching (e.g. `"regex:Server started on \\d+\\.\\d+\\.\\d+\\.\\d+:\\d+"`)
- When matched, Wings sets the server state from `starting` to `running`
- This is what makes the "Server is running" indicator work in the UI

**Wings implementation:** `wings/server/listeners.go:170-193` iterates `processConfiguration.Startup.Done` matchers and calls `s.Environment.SetState(environment.ProcessRunningState)` on match.

---

## Stop Mechanism

Eggs define how to stop a server via `config.stop`:

- **Command stop** (most common): Sends a text command to the server's stdin (e.g. `stop` for Minecraft)
- Set `stop_command` in the egg (stored as `eggs.stopCommand`, default `"stop"`)
- Wings sends this as `{ type: "command", value: "stop" }` in `process_configuration.stop`

The `stop_signal` field (`eggs.stopSignal`, default `"SIGTERM"`) is defined in the schema but is not currently used by Wings -- Wings always uses the command-based stop mechanism when a stop command is defined.

---

## API Endpoints

All routes are defined in `src/api/eggs.ts` and mounted at `/api/eggs`:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/eggs` | User | List all eggs |
| `GET` | `/api/eggs/:id` | User | Get egg with variables |
| `POST` | `/api/eggs` | Admin | Create egg with inline variables |
| `PUT` | `/api/eggs/:id` | Admin | Update egg (partial); syncs variables if provided |
| `POST` | `/api/eggs/import` | Admin | Import from any Pelican/Pterodactyl JSON format |
| `GET` | `/api/eggs/:id/export` | User | Export as PLCN_v3 JSON |
| `DELETE` | `/api/eggs/:id` | User* | Delete egg (blocked if servers reference it) |

**Egg-dependent endpoints in other route files:**

| Method | Path | File | Egg Usage |
|--------|------|------|-----------|
| `POST` | `/api/servers` | `servers.ts` | Validates egg, copies startup/image/variables to new server |
| `POST` | `/api/servers/:id/reinstall` | `servers.ts` | Fetches egg for reinstall payload |
| `GET` | `/api/remote/servers` | `remote.ts` | Wings boot: includes egg config in server payloads |
| `GET` | `/api/remote/servers/:uuid/install` | `remote.ts` | Wings install: returns egg's script/container/entry |

---

## Frontend Pages

| Path | File | Description |
|------|------|-------------|
| `/admin/eggs` | `src/web/routes/admin/eggs/index.tsx` | Egg list with expand-for-detail, import dialog, export/delete per row |
| `/admin/eggs/create` | `src/web/routes/admin/eggs/create.tsx` | 4-tab creation form: Configuration, Process Management, Variables, Install Script |
| `/admin/eggs/:eggId` | `src/web/routes/admin/eggs/$eggId.tsx` | 4-tab edit form (same tabs), update via PUT, delete with confirmation |
| `/admin/create-server` | `src/web/routes/admin/create-server.tsx` | Server creation wizard with egg selector, docker image picker, variable overrides |

---

## Key Source Files

| File | Purpose | Lines |
|------|---------|-------|
| `src/db/schema.ts` | `eggs` and `eggVariables` table definitions | 195 |
| `src/api/eggs.ts` | All egg CRUD, import, export API endpoints | 392 |
| `src/lib/egg-import.ts` | Format normalizer (PTDL v1-v2, PLCN v1-v3 -> internal) | 443 |
| `src/services/wings-payload.ts` | Builds install/boot payloads from egg + server data | 140 |
| `src/api/remote.ts` | Wings callback endpoints (boot config, install script) | 261 |
| `src/api/servers.ts` | Server creation (copies egg data to server) | ~300 |
| `src/web/routes/admin/eggs/index.tsx` | Egg list page + import dialog | 429 |
| `src/web/routes/admin/eggs/create.tsx` | Egg creation form (4 tabs) | 591 |
| `src/web/routes/admin/eggs/$eggId.tsx` | Egg edit form (4 tabs) | ~830 |

**Wings (Go) files that consume egg data:**

| File | What it uses |
|------|-------------|
| `wings/server/configuration.go` | `EggConfiguration` struct: `ID`, `FileDenylist`, `Features` |
| `wings/server/install.go` | Fetches + executes install script from panel |
| `wings/server/listeners.go` | Matches console output against startup `done` strings and `Features` patterns |
| `wings/server/manager.go` | Initializes filesystem with `Egg.FileDenylist` |
| `wings/remote/types.go` | `InstallationScript`, `ProcessConfiguration`, `ProcessStopConfiguration` structs |
| `wings/parser/` | Config file parsers (properties, json, yaml, xml, ini) |

---

## Real-World Example: Vanilla Minecraft Egg

From `panel/tests/_fixtures/egg-vanilla-minecraft.yaml` (PLCN_v3 format):

```yaml
meta:
  version: PLCN_v3
name: "Vanilla Minecraft"
author: panel@example.com
description: "Minecraft is a game about placing blocks..."
tags: [minecraft]
features: [eula, java_version, pid_limit]

docker_images:
  "Java 21": "ghcr.io/pelican-eggs/yolks:java_21"
  "Java 17": "ghcr.io/pelican-eggs/yolks:java_17"
  "Java 11": "ghcr.io/pelican-eggs/yolks:java_11"
  "Java 8":  "ghcr.io/pelican-eggs/yolks:java_8"

startup_commands:
  Default: "java -Xms128M -XX:MaxRAMPercentage=95.0 -jar {{SERVER_JARFILE}}"

config:
  files:
    server.properties:
      parser: properties
      find:
        server-ip: ""
        server-port: "{{server.allocations.default.port}}"
        query.port: "{{server.allocations.default.port}}"
  startup:
    done: ")! For help, type "
  logs: {}
  stop: stop

scripts:
  installation:
    script: |
      #!/bin/ash
      mkdir -p /mnt/server
      cd /mnt/server
      # Downloads the correct Minecraft server jar based on VANILLA_VERSION
      LATEST_VERSION=$(curl ... | jq -r '.latest.release')
      curl -o ${SERVER_JARFILE} $DOWNLOAD_URL
      echo "Install Complete"
    container: "ghcr.io/pelican-eggs/installers:alpine"
    entrypoint: ash

variables:
  - name: "Server Jar File"
    env_variable: SERVER_JARFILE
    default_value: server.jar
    user_viewable: true
    user_editable: true
    rules: [required, "regex:/^([\\w\\d._-]+)(\\.jar)$/"]
    sort: 1

  - name: "Server Version"
    env_variable: VANILLA_VERSION
    default_value: latest
    user_viewable: true
    user_editable: true
    rules: [required, string, "between:3,15"]
    sort: 2
```

**What happens with this egg:**

1. Admin imports it or creates a matching configuration
2. Admin creates a server, picks "Java 21" image, leaves variables at defaults
3. Panel sends install payload to Wings with `SERVER_JARFILE=server.jar`, `VANILLA_VERSION=latest`
4. Wings pulls `ghcr.io/pelican-eggs/installers:alpine`, runs the install script
5. Script downloads Minecraft server jar to `/mnt/server/server.jar`
6. Wings reports install success
7. Server starts with `java -Xms128M -XX:MaxRAMPercentage=95.0 -jar server.jar`
8. Wings patches `server.properties` to set `server-port` to the allocated port
9. Wings watches console for `")! For help, type "` to detect startup completion
10. Wings watches for `eula`, `java_version`, `pid_limit` feature patterns
11. When admin stops the server, Wings sends `stop` to the console

---

## Common Pitfalls

1. **JSON string fields in the database.** Several egg columns store JSON as strings (`dockerImages`, `configStartup`, `configFiles`, `configLogs`, `fileDenylist`, `features`, `tags`). Always `JSON.parse()` when reading and `JSON.stringify()` when writing. The API layer handles this conversion.

2. **Variable rules format mismatch.** Pelican eggs use arrays of rules (`["required", "string"]`), but Flamingo stores them as pipe-delimited strings (`"required|string"`). The import normalizer and export endpoint handle this conversion. When working with variables programmatically, be aware of which format you're dealing with.

3. **Boolean/integer mismatch for viewable/editable.** The database uses `0`/`1` integers for `userViewable` and `userEditable`, but the API accepts/returns booleans. Always convert: `v.userViewable ? 1 : 0` for writes, `v.userViewable === 1` for reads.

4. **First-entry semantics.** For `docker_images` and `startup_commands` maps, the first entry is treated as the default. JavaScript `Object.keys()` preserves insertion order, so the order in the import JSON matters.

5. **Install container vs. runtime container.** These are different images. The install container (`scriptContainer`, e.g. `ghcr.io/pelican-eggs/installers:alpine`) is a lightweight image used only during installation. The runtime container (`dockerImage`, e.g. `ghcr.io/pelican-eggs/yolks:java_21`) is what the game server actually runs in.

6. **Egg deletion is blocked.** You cannot delete an egg that has servers using it. The API returns HTTP 409. Servers must be deleted or reassigned first.

7. **Config file paths are case-sensitive.** The file paths in `config.files` (e.g. `server.properties`) must match the actual file name on disk exactly.

8. **Reserved env var collisions.** If an egg defines a variable with a name like `HOME`, `USER`, `STARTUP`, etc., the import normalizer automatically renames it to `SERVER_HOME`, `SERVER_USER`, etc. and patches the startup command references. This can cause subtle issues if not accounted for.
