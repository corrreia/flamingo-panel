// Wings HTTP client for Panel → Wings communication via Cloudflare Tunnel.
// Each Wings node runs cloudflared, so we reach it via its tunnel hostname.
// The node URL can be https://wings.example.com, http://10.0.0.5:8080, etc.

interface WingsNode {
  url: string;         // Full Wings URL (e.g., https://wings.example.com)
  tokenId: string;
  token: string;
}

export class WingsClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(node: WingsNode) {
    this.baseUrl = node.url.replace(/\/+$/, ""); // strip trailing slash
    this.authHeader = `Bearer ${node.tokenId}.${node.token}`;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Authorization": this.authHeader,
        "Content-Type": "application/json",
        "Accept": "application/json",
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
  async getSystemInfo() {
    return this.request<SystemInfo>("GET", "/api/system?v=2");
  }

  async getSystemUtilization() {
    return this.request<SystemUtilization>("GET", "/api/system/utilization");
  }

  async getSystemIps() {
    return this.request<{ ip_addresses: string[] }>("GET", "/api/system/ips");
  }

  // Server management
  async listServers() {
    return this.request<ServerApiResponse[]>("GET", "/api/servers");
  }

  async getServer(uuid: string) {
    return this.request<ServerApiResponse>("GET", `/api/servers/${uuid}`);
  }

  async createServer(details: CreateServerRequest) {
    return this.request<void>("POST", "/api/servers", details);
  }

  async deleteServer(uuid: string) {
    return this.request<void>("DELETE", `/api/servers/${uuid}`);
  }

  async syncServer(uuid: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/sync`);
  }

  // Power management
  async powerAction(uuid: string, action: "start" | "stop" | "restart" | "kill") {
    return this.request<void>("POST", `/api/servers/${uuid}/power`, { action });
  }

  async sendCommand(uuid: string, commands: string[]) {
    return this.request<void>("POST", `/api/servers/${uuid}/commands`, { commands });
  }

  // Server logs
  async getServerLogs(uuid: string, size = 100) {
    return this.request<{ data: string[] }>("GET", `/api/servers/${uuid}/logs?size=${size}`);
  }

  // File management
  async listDirectory(uuid: string, directory: string) {
    return this.request<FileStat[]>("GET", `/api/servers/${uuid}/files/list-directory?directory=${encodeURIComponent(directory)}`);
  }

  async getFileContents(uuid: string, file: string) {
    const res = await fetch(`${this.baseUrl}/api/servers/${uuid}/files/contents?file=${encodeURIComponent(file)}`, {
      headers: { Authorization: this.authHeader },
    });
    if (!res.ok) throw new WingsError(res.status, await res.text());
    return res;
  }

  async writeFile(uuid: string, file: string, content: string | ReadableStream) {
    const res = await fetch(`${this.baseUrl}/api/servers/${uuid}/files/write?file=${encodeURIComponent(file)}`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/octet-stream",
      },
      body: content,
    });
    if (!res.ok) throw new WingsError(res.status, await res.text());
  }

  async renameFiles(uuid: string, root: string, files: Array<{ from: string; to: string }>) {
    return this.request<void>("PUT", `/api/servers/${uuid}/files/rename`, { root, files });
  }

  async copyFile(uuid: string, location: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/files/copy`, { location });
  }

  async deleteFiles(uuid: string, root: string, files: string[]) {
    return this.request<void>("POST", `/api/servers/${uuid}/files/delete`, { root, files });
  }

  async createDirectory(uuid: string, name: string, path: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/files/create-directory`, { name, path });
  }

  async compressFiles(uuid: string, root: string, files: string[], name?: string, extension?: string) {
    return this.request<FileStat>("POST", `/api/servers/${uuid}/files/compress`, { root, files, name, extension });
  }

  async decompressFile(uuid: string, root: string, file: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/files/decompress`, { root, file });
  }

  async chmodFiles(uuid: string, root: string, files: Array<{ file: string; mode: string }>) {
    return this.request<void>("POST", `/api/servers/${uuid}/files/chmod`, { root, files });
  }

  // Backups
  async createBackup(uuid: string, backupUuid: string, adapter: "wings" | "s3", ignore: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/backup`, { uuid: backupUuid, adapter, ignore });
  }

  async deleteBackup(uuid: string, backupUuid: string) {
    return this.request<void>("DELETE", `/api/servers/${uuid}/backup/${backupUuid}`);
  }

  async restoreBackup(uuid: string, backupUuid: string, adapter: "wings" | "s3", truncateDirectory: boolean, downloadUrl?: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/backup/${backupUuid}/restore`, {
      adapter, truncate_directory: truncateDirectory, download_url: downloadUrl,
    });
  }

  // Installation
  async installServer(uuid: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/install`);
  }

  async reinstallServer(uuid: string) {
    return this.request<void>("POST", `/api/servers/${uuid}/reinstall`);
  }
}

export class WingsError extends Error {
  constructor(public status: number, message: string) {
    super(`Wings error (${status}): ${message}`);
  }
}

// Types matching Wings API responses
export interface SystemInfo {
  architecture: string;
  cpu_count: number;
  kernel_version: string;
  os: string;
  version: string;
}

export interface SystemUtilization {
  memory_total: number;
  memory_used: number;
  cpu_usage: number;
  disk_total: number;
  disk_used: number;
}

export interface ServerApiResponse {
  state: string;
  is_suspended: boolean;
  utilization: {
    memory_bytes: number;
    memory_limit_bytes: number;
    cpu_absolute: number;
    network: { rx_bytes: number; tx_bytes: number };
    uptime: number;
    disk_bytes: number;
    state: string;
  };
  configuration: Record<string, unknown>;
}

export interface FileStat {
  name: string;
  created: string;
  modified: string;
  mode: string;
  mode_bits: string;
  size: number;
  directory: boolean;
  file: boolean;
  symlink: boolean;
  mime: string;
}

export interface CreateServerRequest {
  uuid: string;
  start_on_completion: boolean;
  [key: string]: unknown;
}
