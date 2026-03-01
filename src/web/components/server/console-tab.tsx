import { Badge } from "@web/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@web/components/ui/card";
import { api } from "@web/lib/api";
import { WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/** Handle a single keypress/paste from the terminal and relay commands to the WebSocket. */
function handleTerminalInput(
  data: string,
  terminal: import("@xterm/xterm").Terminal,
  ws: WebSocket,
  getBuffer: () => string,
  setBuffer: (v: string) => void
) {
  if (data === "\r") {
    terminal.write("\r\n");
    const buf = getBuffer();
    if (buf.trim()) {
      ws.send(JSON.stringify({ event: "send command", args: [buf] }));
    }
    setBuffer("");
  } else if (data === "\x7f") {
    if (getBuffer().length > 0) {
      setBuffer(getBuffer().slice(0, -1));
      terminal.write("\b \b");
    }
  } else if (data >= " ") {
    setBuffer(getBuffer() + data);
    terminal.write(data);
  }
}

export function ConsoleTab({ serverId }: { serverId: string }) {
  const [connected, setConnected] = useState(false);
  const termRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Stable callback for writing to terminal — set once terminal is created
  // biome-ignore lint/suspicious/noEmptyBlockStatements: noop initial value
  const writeRef = useRef<(data: string) => void>(() => {});

  const connect = useCallback(async () => {
    const { ticket } = await api.get<{ ticket: string }>(
      `/servers/${serverId}/console-ticket`
    );
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/api/servers/${serverId}/console?ticket=${ticket}`
    );
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        switch (msg.event) {
          case "auth success":
            ws.send(JSON.stringify({ event: "send logs" }));
            break;
          case "console output":
            for (const line of msg.args as string[]) {
              writeRef.current(`${line}\r\n`);
            }
            break;
          case "status":
            writeRef.current(`\x1b[33m[Status] ${msg.args?.[0]}\x1b[0m\r\n`);
            break;
          case "daemon error":
            writeRef.current(
              `\x1b[31m[Error] ${msg.args?.[0] || "Connection lost"}\x1b[0m\r\n`
            );
            break;
          case "daemon message":
            writeRef.current(
              `\x1b[36m[Daemon] ${msg.args?.[0] || ""}\x1b[0m\r\n`
            );
            break;
          default:
            break;
        }
      } catch {
        // parse error
      }
    };
    return ws;
  }, [serverId]);

  useEffect(() => {
    const container = termRef.current;
    if (!container) {
      return;
    }

    let disposed = false;
    let terminal: import("@xterm/xterm").Terminal;
    let fitAddon: import("@xterm/addon-fit").FitAddon;
    let resizeObserver: ResizeObserver;

    async function init() {
      const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all(
        [
          import("@xterm/xterm"),
          import("@xterm/addon-fit"),
          import("@xterm/addon-web-links"),
          import("@xterm/xterm/css/xterm.css"),
        ]
      );

      if (disposed) {
        return;
      }

      terminal = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "ui-monospace, monospace",
        theme: {
          background: "#09090b",
          foreground: "#d4d4d8",
          cursor: "#d4d4d8",
          selectionBackground: "#27272a",
        },
        convertEol: true,
        scrollback: 5000,
        disableStdin: false,
      });

      fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.loadAddon(new WebLinksAddon());

      terminal.open(container);
      fitAddon.fit();

      writeRef.current = (data: string) => terminal.write(data);

      // Line buffer for command input
      let lineBuffer = "";
      terminal.onData((data) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          return;
        }
        handleTerminalInput(
          data,
          terminal,
          ws,
          () => lineBuffer,
          (v) => {
            lineBuffer = v;
          }
        );
      });

      // Resize on container size change
      resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
      });
      resizeObserver.observe(container);

      // Connect WebSocket
      connect();
    }

    init();

    return () => {
      disposed = true;
      wsRef.current?.close();
      resizeObserver?.disconnect();
      terminal?.dispose();
    };
  }, [connect]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CardTitle className="text-base">Console</CardTitle>
            <Badge
              aria-live="polite"
              variant={connected ? "default" : "secondary"}
            >
              {connected ? (
                <>
                  <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                  Connected
                </>
              ) : (
                <>
                  <WifiOff className="mr-1 h-3 w-3" />
                  Disconnected
                </>
              )}
            </Badge>
          </div>
          <p className="hidden text-muted-foreground text-xs sm:block">
            Type commands directly in the terminal
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <section
          aria-label="Server console terminal"
          className="h-[28rem] overflow-hidden rounded-lg border border-border/50 bg-zinc-950"
          ref={termRef}
        />
      </CardContent>
    </Card>
  );
}
