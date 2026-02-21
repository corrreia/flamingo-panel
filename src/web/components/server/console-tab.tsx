import { Badge } from "@web/components/ui/badge";
import { Button } from "@web/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@web/components/ui/card";
import { Input } from "@web/components/ui/input";
import { api } from "@web/lib/api";
import { Wifi, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ConsoleLine {
  id: number;
  text: string;
}

let nextLineId = 0;

function addLine(text: string): ConsoleLine {
  return { id: nextLineId++, text };
}

function handleWsMessage(
  msg: { event: string; args?: string[] },
  ws: WebSocket,
  setLines: React.Dispatch<React.SetStateAction<ConsoleLine[]>>
) {
  switch (msg.event) {
    case "auth success":
      ws.send(JSON.stringify({ event: "send logs" }));
      break;
    case "console output":
      setLines((prev) => [
        ...prev.slice(-500),
        ...(msg.args as string[]).map((text) => addLine(text)),
      ]);
      break;
    case "status":
      setLines((prev) => [...prev, addLine(`[Status] ${msg.args?.[0]}`)]);
      break;
    case "daemon error":
      setLines((prev) => [
        ...prev,
        addLine(`[Error] ${msg.args?.[0] || "Connection lost"}`),
      ]);
      break;
    case "daemon message":
      setLines((prev) => [...prev, addLine(`[Daemon] ${msg.args?.[0] || ""}`)]);
      break;
    default:
      break;
  }
}

export function ConsoleTab({ serverId }: { serverId: string }) {
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [command, setCommand] = useState("");
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ ticket: string }>(`/servers/${serverId}/console-ticket`)
      .then(({ ticket }) => {
        if (cancelled) {
          return;
        }
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(
          `${protocol}//${window.location.host}/api/servers/${serverId}/console?ticket=${ticket}`
        );
        wsRef.current = ws;
        ws.onopen = () => setConnected(true);
        ws.onmessage = (e) => {
          try {
            handleWsMessage(JSON.parse(e.data), ws, setLines);
          } catch {
            // WebSocket parse error, ignore
          }
        };
        ws.onclose = () => setConnected(false);
      });
    return () => {
      cancelled = true;
      wsRef.current?.close();
    };
  }, [serverId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to bottom when new lines arrive
  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [lines.length]);

  const sendCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!(command.trim() && wsRef.current)) {
      return;
    }
    wsRef.current.send(
      JSON.stringify({ event: "send command", args: [command] })
    );
    setCommand("");
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Console</CardTitle>
          <Badge variant={connected ? "default" : "secondary"}>
            {connected ? (
              <>
                <Wifi className="mr-1 h-3 w-3" /> Connected
              </>
            ) : (
              <>
                <WifiOff className="mr-1 h-3 w-3" /> Disconnected
              </>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className="h-80 overflow-y-auto rounded-md border bg-zinc-950 p-3 font-mono text-xs"
          ref={scrollRef}
        >
          {lines.map((line) => (
            <div className="whitespace-pre-wrap text-zinc-300" key={line.id}>
              {line.text}
            </div>
          ))}
          {lines.length === 0 && (
            <div className="text-zinc-600">Waiting for output...</div>
          )}
        </div>
        <form className="mt-2 flex gap-2" onSubmit={sendCommand}>
          <Input
            className="font-mono text-sm"
            disabled={!connected}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Type a command..."
            value={command}
          />
          <Button disabled={!connected} type="submit">
            Send
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
