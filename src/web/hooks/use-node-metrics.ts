import { api } from "@web/lib/api";
import { useEffect, useRef, useState } from "react";
import type { SystemInfo, SystemUtilization } from "../../lib/wings-client";

interface NodeMetricsState {
  connected: boolean;
  error: string | null;
  systemInfo: SystemInfo | null;
  utilization: SystemUtilization | null;
  wingsOnline: boolean;
}

const DEFAULT_STATE: NodeMetricsState = {
  systemInfo: null,
  utilization: null,
  connected: false,
  error: null,
  wingsOnline: false,
};

export function useNodeMetrics(
  nodeId: number | string | null
): NodeMetricsState {
  const [state, setState] = useState<NodeMetricsState>(DEFAULT_STATE);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (nodeId === null) {
      return;
    }

    let cancelled = false;

    api
      .get<{ ticket: string }>(`/nodes/${nodeId}/metrics-ticket`)
      .then(({ ticket }) => {
        if (cancelled) {
          return;
        }

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(
          `${protocol}//${window.location.host}/api/nodes/${nodeId}/metrics?ticket=${ticket}`
        );
        wsRef.current = ws;

        ws.onopen = () => {
          setState((prev) => ({ ...prev, connected: true, error: null }));
        };

        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data) as {
              event: string;
              data: unknown;
            };
            if (msg.event === "system_info") {
              setState((prev) => ({
                ...prev,
                systemInfo: msg.data as SystemInfo,
                wingsOnline: true,
                error: null,
              }));
            } else if (msg.event === "utilization") {
              setState((prev) => ({
                ...prev,
                utilization: msg.data as SystemUtilization,
                wingsOnline: true,
                error: null,
              }));
            } else if (msg.event === "error") {
              setState((prev) => ({
                ...prev,
                error: msg.data as string,
                wingsOnline: false,
              }));
            }
          } catch {
            // Parse error, ignore
          }
        };

        ws.onclose = () => {
          setState((prev) => ({ ...prev, connected: false, wingsOnline: false }));
        };
      })
      .catch(() => {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            error: "Failed to get metrics ticket",
          }));
        }
      });

    return () => {
      cancelled = true;
      wsRef.current?.close();
    };
  }, [nodeId]);

  return state;
}
