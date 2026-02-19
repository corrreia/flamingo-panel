-- Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Nodes (Wings instances)
CREATE TABLE nodes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  fqdn TEXT NOT NULL,
  scheme TEXT NOT NULL DEFAULT 'https' CHECK (scheme IN ('http', 'https')),
  daemon_port INTEGER NOT NULL DEFAULT 8080,
  daemon_sftp_port INTEGER NOT NULL DEFAULT 2022,
  token_id TEXT NOT NULL,
  token TEXT NOT NULL,
  memory INTEGER NOT NULL DEFAULT 0,
  memory_overallocate INTEGER NOT NULL DEFAULT 0,
  disk INTEGER NOT NULL DEFAULT 0,
  disk_overallocate INTEGER NOT NULL DEFAULT 0,
  upload_size INTEGER NOT NULL DEFAULT 100,
  behind_proxy INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Eggs (game/service templates)
CREATE TABLE eggs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  docker_image TEXT NOT NULL DEFAULT '',
  startup TEXT NOT NULL DEFAULT '',
  stop_command TEXT NOT NULL DEFAULT 'stop',
  stop_signal TEXT NOT NULL DEFAULT 'SIGTERM',
  config_startup TEXT DEFAULT '{}',
  config_files TEXT DEFAULT '[]',
  config_logs TEXT DEFAULT '{}',
  script_install TEXT DEFAULT '',
  script_container TEXT DEFAULT 'ghcr.io/pelican-dev/installer:latest',
  script_entry TEXT DEFAULT 'bash',
  file_denylist TEXT DEFAULT '[]',
  features TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Servers
CREATE TABLE servers (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  uuid TEXT NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  node_id TEXT NOT NULL REFERENCES nodes(id),
  owner_id TEXT NOT NULL REFERENCES users(id),
  egg_id TEXT REFERENCES eggs(id),
  memory INTEGER NOT NULL DEFAULT 512,
  disk INTEGER NOT NULL DEFAULT 1024,
  cpu INTEGER NOT NULL DEFAULT 100,
  swap INTEGER NOT NULL DEFAULT 0,
  io INTEGER NOT NULL DEFAULT 500,
  threads TEXT DEFAULT NULL,
  oom_killer INTEGER NOT NULL DEFAULT 1,
  startup TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  default_allocation_ip TEXT NOT NULL DEFAULT '0.0.0.0',
  default_allocation_port INTEGER NOT NULL DEFAULT 25565,
  additional_allocations TEXT DEFAULT '[]',
  status TEXT DEFAULT NULL CHECK (status IN (NULL, 'installing', 'install_failed', 'reinstall_failed', 'suspended', 'restoring_backup', 'transferring')),
  installed_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Egg variables
CREATE TABLE egg_variables (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  egg_id TEXT NOT NULL REFERENCES eggs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  env_variable TEXT NOT NULL,
  default_value TEXT DEFAULT '',
  user_viewable INTEGER NOT NULL DEFAULT 0,
  user_editable INTEGER NOT NULL DEFAULT 0,
  rules TEXT NOT NULL DEFAULT 'required|string',
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Server variables (overrides for egg defaults)
CREATE TABLE server_variables (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  variable_id TEXT NOT NULL REFERENCES egg_variables(id) ON DELETE CASCADE,
  variable_value TEXT NOT NULL DEFAULT '',
  UNIQUE(server_id, variable_id)
);

-- API keys for remote access
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  identifier TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  memo TEXT DEFAULT '',
  allowed_ips TEXT DEFAULT '[]',
  last_used_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Server subusers
CREATE TABLE subusers (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  permissions TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, server_id)
);

-- Activity logs
CREATE TABLE activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  server_id TEXT REFERENCES servers(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  ip TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX idx_servers_node ON servers(node_id);
CREATE INDEX idx_servers_owner ON servers(owner_id);
CREATE INDEX idx_servers_uuid ON servers(uuid);
CREATE INDEX idx_activity_server ON activity_logs(server_id);
CREATE INDEX idx_activity_user ON activity_logs(user_id);
CREATE INDEX idx_egg_variables_egg ON egg_variables(egg_id);
CREATE INDEX idx_server_variables_server ON server_variables(server_id);
CREATE INDEX idx_subusers_user ON subusers(user_id);
CREATE INDEX idx_subusers_server ON subusers(server_id);
