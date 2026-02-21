import { Badge } from "@web/components/ui/badge";
import { Button } from "@web/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@web/components/ui/card";
import { Input } from "@web/components/ui/input";
import { ScrollArea } from "@web/components/ui/scroll-area";
import { api } from "@web/lib/api";
import { Wifi, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ConsoleLine {
  id: number;
  text: string;
}

let nextLineId = 0;

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
            const msg = JSON.parse(e.data);
            if (msg.event === "auth success") {
              ws.send(JSON.stringify({ event: "send logs" }));
            } else if (msg.event === "console output") {
              const newLines = (msg.args as string[]).map((text: string) => ({
                id: nextLineId++,
                text,
              }));
              setLines((prev) => [...prev.slice(-500), ...newLines]);
            } else if (msg.event === "status") {
              setLines((prev) => [
                ...prev,
                { id: nextLineId++, text: `[Status] ${msg.args[0]}` },
              ]);
            } else if (msg.event === "daemon error") {
              setLines((prev) => [
                ...prev,
                {
                  id: nextLineId++,
                  text: `[Error] ${msg.args?.[0] || "Connection lost"}`,
                },
              ]);
            }
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

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, []);

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
        <ScrollArea
          className="h-80 rounded-md border bg-zinc-950 p-3 font-mono text-xs"
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
        </ScrollArea>
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
