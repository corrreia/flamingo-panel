import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import type { AllocationResponse } from "./types";

export interface DashboardServerItem {
  containerStatus: string | null;
  cpu: number;
  disk: number;
  id: string;
  memory: number;
  name: string;
  role: "admin" | "owner" | "subuser";
  status: string | null;
  uuid: string;
}

export interface ServerDetail {
  containerStatus: string | null;
  cpu: number;
  disk: number;
  id: string;
  memory: number;
  name: string;
  resources?: {
    state: string;
    utilization: {
      cpu_absolute: number;
      disk_bytes: number;
      memory_bytes: number;
      memory_limit_bytes: number;
      network: { rx_bytes: number; tx_bytes: number };
      state: string;
      uptime: number;
    };
  } | null;
  role: "admin" | "owner" | "subuser";
  status: string | null;
  uuid: string;
}

export interface NodeItem {
  createdAt: string;
  id: number;
  name: string;
  url: string;
}

function getForwardedHeaders(): HeadersInit {
  const request = getRequest();

  return {
    cookie: request.headers.get("cookie") ?? "",
    origin: request.headers.get("origin") ?? new URL(request.url).origin,
  };
}

async function fetchApi<T>(path: string): Promise<T> {
  const request = getRequest();
  const url = new URL(`/api${path}`, request.url);
  const response = await fetch(url, {
    headers: getForwardedHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status}`);
  }

  return response.json();
}

export const fetchServers = createServerFn({ method: "GET" }).handler(() =>
  fetchApi<DashboardServerItem[]>("/servers")
);

export const fetchMyAllocations = createServerFn({ method: "GET" }).handler(
  () => fetchApi<AllocationResponse>("/allocations/me")
);

export const fetchServer = createServerFn({ method: "GET" })
  .inputValidator((serverId: string) => serverId)
  .handler(({ data }) => fetchApi<ServerDetail>(`/servers/${data}`));

export const fetchNodes = createServerFn({ method: "GET" }).handler(() =>
  fetchApi<NodeItem[]>("/nodes")
);

export const serversQueryOptions = () =>
  queryOptions({
    queryKey: ["servers"],
    queryFn: () => fetchServers(),
    refetchInterval: 15_000,
  });

export const allocationsQueryOptions = () =>
  queryOptions({
    queryKey: ["my-allocations"],
    queryFn: () => fetchMyAllocations(),
  });

export const serverQueryOptions = (serverId: string) =>
  queryOptions({
    queryKey: ["server", serverId],
    queryFn: () => fetchServer({ data: serverId }),
    refetchInterval: 10_000,
  });

export const nodesQueryOptions = () =>
  queryOptions({
    queryKey: ["nodes"],
    queryFn: () => fetchNodes(),
  });
