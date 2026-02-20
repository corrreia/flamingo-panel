// Wings HTTP client for Panel -> Wings communication via Cloudflare Tunnel.
// Each Wings node runs cloudflared, so we reach it via its tunnel hostname.
// The node URL can be https://wings.example.com, http://10.0.0.5:8080, etc.

const TRAILING_SLASH_RE = /\/+$/;

interface WingsNode {
  token: string;
  tokenId: string;
  url: string; // Full Wings URL (e.g., https://wings.example.com)
}

export class WingsClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(node: WingsNode) {
    this.baseUrl = node.url.replace(TRAILING_SLASH_RE, "");
    // Panel->Wings uses just the raw token; tokenId.token is only for Wings->Panel
    this.authHeader = `Bearer ${node.token}`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const error = await res.text();
      throw new WingsError(res.status, error);
    }

    if (res.status === 204 || res.status === 202) {
      return undefined as T;
    }

    return res.json();
  }

  // System endpoints
  getSystemInfo() {
    return this.request<SystemInfo>("GET", "/api/system?v=2");
  }

  getSystemUtilization() {
    return this.request<SystemUtilization>("GET", "/api/system/utilization");
  }

  getSystemIps() {
    return this.request<{ ip_addresses: string[] }>("GET", "/api/system/ips");
  }

  // Server management
  listServers() {
    return this.request<ServerApiResponse[]>("GET", "/api/servers");
  }

  getServer(uuid: string) {
    return this.request<ServerApiResponse>("GET", `/api/servers/${uuid}`);
  }

  createServer(details: CreateServerRequest) {
    return this.request<void>("POST", "/api/servers", details);
  }

  deleteServer(uuid: string) {
    return this.request<void>("DELETE", `/api/servers/${uuid}`);
  }

  syncServer(uuid: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/sync`);
  }

  // Power management
  powerAction(uuid: string, action: "start" | "stop" | "restart" | "kill") {
    return this.request<void>("POST", `/api/servers/${uuid}/power`, { action });
  }

  sendCommand(uuid: string, commands: string[]) {
    return this.request<void>("POST", `/api/servers/${uuid}/commands`, {
      commands,
    });
  }

  // Server logs
  getServerLogs(uuid: string, size = 100) {
    return this.request<{ data: string[] }>(
      "GET",
      `/api/servers/${uuid}/logs?size=${size}`
    );
  }

  // File management
  listDirectory(uuid: string, directory: string) {
    return this.request<FileStat[]>(
      "GET",
      `/api/servers/${uuid}/files/list-directory?directory=${encodeURIComponent(directory)}`
    );
  }

  async getFileContents(uuid: string, file: string) {
    const res = await fetch(
      `${this.baseUrl}/api/servers/${uuid}/files/contents?file=${encodeURIComponent(file)}`,
      {
        headers: { Authorization: this.authHeader },
      }
    );
    if (!res.ok) {
      throw new WingsError(res.status, await res.text());
    }
    return res;
  }

  async writeFile(
    uuid: string,
    file: string,
    content: string | ReadableStream
  ) {
    const res = await fetch(
      `${this.baseUrl}/api/servers/${uuid}/files/write?file=${encodeURIComponent(file)}`,
      {
        method: "POST",
        headers: {
          Authorization: this.authHeader,
          "Content-Type": "application/octet-stream",
        },
        body: content,
      }
    );
    if (!res.ok) {
      throw new WingsError(res.status, await res.text());
    }
  }

  renameFiles(
    uuid: string,
    root: string,
    files: Array<{ from: string; to: string }>
  ) {
    return this.request<void>("PUT", `/api/servers/${uuid}/files/rename`, {
      root,
      files,
    });
  }

  copyFile(uuid: string, location: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/files/copy`, {
      location,
    });
  }

  deleteFiles(uuid: string, root: string, files: string[]) {
    return this.request<void>("POST", `/api/servers/${uuid}/files/delete`, {
      root,
      files,
    });
  }

  createDirectory(uuid: string, name: string, path: string) {
    return this.request<void>(
      "POST",
      `/api/servers/${uuid}/files/create-directory`,
      { name, path }
    );
  }

  compressFiles(
    uuid: string,
    root: string,
    files: string[],
    name?: string,
    extension?: string
  ) {
    return this.request<FileStat>(
      "POST",
      `/api/servers/${uuid}/files/compress`,
      { root, files, name, extension }
    );
  }

  decompressFile(uuid: string, root: string, file: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/files/decompress`, {
      root,
      file,
    });
  }

  chmodFiles(
    uuid: string,
    root: string,
    files: Array<{ file: string; mode: string }>
  ) {
    return this.request<void>("POST", `/api/servers/${uuid}/files/chmod`, {
      root,
      files,
    });
  }

  // Backups
  createBackup(
    uuid: string,
    backupUuid: string,
    adapter: "wings" | "s3",
    ignore: string
  ) {
    return this.request<void>("POST", `/api/servers/${uuid}/backup`, {
      uuid: backupUuid,
      adapter,
      ignore,
    });
  }

  deleteBackup(uuid: string, backupUuid: string) {
    return this.request<void>(
      "DELETE",
      `/api/servers/${uuid}/backup/${backupUuid}`
    );
  }

  restoreBackup(
    uuid: string,
    backupUuid: string,
    adapter: "wings" | "s3",
    truncateDirectory: boolean,
    downloadUrl?: string
  ) {
    return this.request<void>(
      "POST",
      `/api/servers/${uuid}/backup/${backupUuid}/restore`,
      {
        adapter,
        truncate_directory: truncateDirectory,
        download_url: downloadUrl,
      }
    );
  }

  // Installation
  installServer(uuid: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/install`);
  }

  reinstallServer(uuid: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/reinstall`);
  }
}

export class WingsError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(`Wings error (${status}): ${message}`);
    this.status = status;
  }
}

// Types matching Wings API responses (/api/system?v=2)
export interface SystemInfo {
  docker: {
    version: string;
    cgroups: { driver: string; version: string };
    containers: {
      total: number;
      running: number;
      paused: number;
      stopped: number;
    };
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
  version: string;
}

export interface SystemUtilization {
  cpu_percent: number;
  disk_details: {
    device: string;
    mountpoint: string;
    total_space: number;
    used_space: number;
    tags: string[];
  }[];
  disk_total: number;
  disk_used: number;
  load_average1: number;
  load_average5: number;
  load_average15: number;
  memory_total: number;
  memory_used: number;
  swap_total: number;
  swap_used: number;
}

export interface ServerApiResponse {
  configuration: Record<string, unknown>;
  is_suspended: boolean;
  state: string;
  utilization: {
    memory_bytes: number;
    memory_limit_bytes: number;
    cpu_absolute: number;
    network: { rx_bytes: number; tx_bytes: number };
    uptime: number;
    disk_bytes: number;
    state: string;
  };
}

export interface FileStat {
  created: string;
  directory: boolean;
  file: boolean;
  mime: string;
  mode: string;
  mode_bits: string;
  modified: string;
  name: string;
  size: number;
  symlink: boolean;
}

export interface CreateServerRequest {
  start_on_completion: boolean;
  uuid: string;
  [key: string]: unknown;
}
