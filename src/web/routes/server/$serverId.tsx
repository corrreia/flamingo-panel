import { useEffect, useState, useRef, useCallback } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@web/lib/api";
import { Layout } from "@web/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card";
import { Badge } from "@web/components/ui/badge";
import { Button } from "@web/components/ui/button";
import { Input } from "@web/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@web/components/ui/tabs";
import { ScrollArea } from "@web/components/ui/scroll-area";
import { Skeleton } from "@web/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@web/components/ui/table";
import {
  Play, Square, RotateCcw, Skull, Terminal, FolderOpen,
  Settings, Cpu, MemoryStick, HardDrive, Wifi, WifiOff,
  File, Folder, ChevronRight, ArrowLeft, Save, X, Trash2,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@web/components/ui/alert-dialog";

interface ServerDetail {
  id: string;
  name: string;
  uuid: string;
  status: string | null;
  memory: number;
  cpu: number;
  disk: number;
  resources?: {
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
  } | null;
}

interface FileEntry {
  name: string;
  size: number;
  directory: boolean;
  modified: string;
  mime: string;
}

export const Route = createFileRoute("/server/$serverId")({
  component: ServerPage,
});

function ServerPage() {
  const { serverId } = Route.useParams();

  const { data: server, isLoading } = useQuery({
    queryKey: ["server", serverId],
    queryFn: () => api.get<ServerDetail>(`/servers/${serverId}`),
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64" />
        </div>
      </Layout>
    );
  }

  if (!server) {
    return (
      <Layout>
        <div className="text-muted-foreground">Server not found.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <h1 className="text-2xl font-bold">{server.name}</h1>
            <Badge variant={server.resources?.state === "running" ? "default" : "secondary"}>
              {server.resources?.state || server.status || "offline"}
            </Badge>
          </div>
          <PowerControls serverId={server.id} state={server.resources?.state || "offline"} />
        </div>

        {server.resources?.utilization && (
          <div className="grid grid-cols-4 gap-4">
            <StatCard icon={<Cpu className="h-4 w-4" />} label="CPU" value={`${server.resources.utilization.cpu_absolute.toFixed(1)}%`} />
            <StatCard icon={<MemoryStick className="h-4 w-4" />} label="Memory" value={formatBytes(server.resources.utilization.memory_bytes)} />
            <StatCard icon={<HardDrive className="h-4 w-4" />} label="Disk" value={formatBytes(server.resources.utilization.disk_bytes)} />
            <StatCard icon={<Wifi className="h-4 w-4" />} label="Network" value={`${formatBytes(server.resources.utilization.network.rx_bytes)} / ${formatBytes(server.resources.utilization.network.tx_bytes)}`} />
          </div>
        )}

        <Tabs defaultValue="console">
          <TabsList>
            <TabsTrigger value="console"><Terminal className="mr-2 h-4 w-4" /> Console</TabsTrigger>
            <TabsTrigger value="files"><FolderOpen className="mr-2 h-4 w-4" /> Files</TabsTrigger>
            <TabsTrigger value="settings"><Settings className="mr-2 h-4 w-4" /> Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="console">
            <ConsoleTab serverId={server.id} />
          </TabsContent>
          <TabsContent value="files">
            <FilesTab serverId={server.id} />
          </TabsContent>
          <TabsContent value="settings">
            <SettingsTab serverId={server.id} serverName={server.name} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function PowerControls({ serverId, state }: { serverId: string; state: string }) {
  const powerMutation = useMutation({
    mutationFn: (action: string) => api.post(`/servers/${serverId}/power`, { action }),
  });

  return (
    <div className="flex gap-2">
      <Button size="sm" variant="default" onClick={() => powerMutation.mutate("start")} disabled={powerMutation.isPending || state === "running"}>
        <Play className="h-4 w-4 mr-1" /> Start
      </Button>
      <Button size="sm" variant="secondary" onClick={() => powerMutation.mutate("restart")} disabled={powerMutation.isPending || state === "offline"}>
        <RotateCcw className="h-4 w-4 mr-1" /> Restart
      </Button>
      <Button size="sm" variant="secondary" onClick={() => powerMutation.mutate("stop")} disabled={powerMutation.isPending || state === "offline"}>
        <Square className="h-4 w-4 mr-1" /> Stop
      </Button>
      <Button size="sm" variant="destructive" onClick={() => powerMutation.mutate("kill")} disabled={powerMutation.isPending || state === "offline"}>
        <Skull className="h-4 w-4 mr-1" /> Kill
      </Button>
    </div>
  );
}

function ConsoleTab({ serverId }: { serverId: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const [command, setCommand] = useState("");
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<{ ticket: string }>(`/servers/${serverId}/console-ticket`).then(({ ticket }) => {
      if (cancelled) return;
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
            setLines((prev) => [...prev.slice(-500), ...msg.args]);
          } else if (msg.event === "status") {
            setLines((prev) => [...prev, `[Status] ${msg.args[0]}`]);
          } else if (msg.event === "daemon error") {
            setLines((prev) => [...prev, `[Error] ${msg.args?.[0] || "Connection lost"}`]);
          }
        } catch {}
      };
      ws.onclose = () => setConnected(false);
    });
    return () => { cancelled = true; wsRef.current?.close(); };
  }, [serverId]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [lines]);

  const sendCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ event: "send command", args: [command] }));
    setCommand("");
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Console</CardTitle>
          <Badge variant={connected ? "default" : "secondary"}>
            {connected ? <><Wifi className="h-3 w-3 mr-1" /> Connected</> : <><WifiOff className="h-3 w-3 mr-1" /> Disconnected</>}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-80 rounded-md border bg-zinc-950 p-3 font-mono text-xs" ref={scrollRef}>
          {lines.map((line, i) => (
            <div key={i} className="text-zinc-300 whitespace-pre-wrap">{line}</div>
          ))}
          {lines.length === 0 && <div className="text-zinc-600">Waiting for output...</div>}
        </ScrollArea>
        <form onSubmit={sendCommand} className="mt-2 flex gap-2">
          <Input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="Type a command..." className="font-mono text-sm" disabled={!connected} />
          <Button type="submit" disabled={!connected}>Send</Button>
        </form>
      </CardContent>
    </Card>
  );
}

const TEXT_EXTENSIONS = new Set([
  ".txt", ".log", ".cfg", ".conf", ".ini", ".yml", ".yaml", ".json",
  ".xml", ".properties", ".toml", ".env", ".sh", ".bash", ".bat",
  ".cmd", ".ps1", ".py", ".js", ".ts", ".lua", ".java", ".md", ".csv",
]);

function isTextFile(name: string): boolean {
  const ext = name.substring(name.lastIndexOf(".")).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

function FilesTab({ serverId }: { serverId: string }) {
  const [currentDir, setCurrentDir] = useState("/");
  const queryClient = useQueryClient();

  const { data: files, isLoading } = useQuery({
    queryKey: ["server-files", serverId, currentDir],
    queryFn: () => api.get<FileEntry[]>(`/servers/${serverId}/files/list?directory=${encodeURIComponent(currentDir)}`),
  });

  // Editor state
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loadingFile, setLoadingFile] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"" | "saved" | "error">("");

  const saveMutation = useMutation({
    mutationFn: async ({ file, content }: { file: string; content: string }) => {
      const token = localStorage.getItem("session_token");
      const res = await fetch(`/api/servers/${serverId}/files/write?file=${encodeURIComponent(file)}`, {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "text/plain" },
        body: content,
      });
      if (!res.ok) throw new Error("Failed to save");
    },
    onSuccess: () => {
      setOriginalContent(fileContent);
      setSaveStatus("saved");
      queryClient.invalidateQueries({ queryKey: ["server-files", serverId] });
    },
    onError: () => setSaveStatus("error"),
  });

  const navigateUp = () => {
    const parent = currentDir.replace(/\/[^/]+\/?$/, "") || "/";
    setCurrentDir(parent);
    setEditingFile(null);
  };

  const navigateDir = (dir: string) => {
    setCurrentDir(dir);
    setEditingFile(null);
  };

  const openFile = async (fileName: string) => {
    const filePath = currentDir === "/" ? `/${fileName}` : `${currentDir}/${fileName}`;
    setLoadingFile(true);
    setSaveStatus("");
    try {
      const token = localStorage.getItem("session_token");
      const res = await fetch(`/api/servers/${serverId}/files/contents?file=${encodeURIComponent(filePath)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load file");
      const text = await res.text();
      setFileContent(text);
      setOriginalContent(text);
      setEditingFile(filePath);
    } catch {
      alert("Failed to open file");
    } finally {
      setLoadingFile(false);
    }
  };

  const closeEditor = () => {
    if (fileContent !== originalContent) {
      if (!confirm("You have unsaved changes. Close anyway?")) return;
    }
    setEditingFile(null);
  };

  if (editingFile) {
    const fileName = editingFile.split("/").pop() || editingFile;
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={closeEditor}><X className="h-4 w-4" /></Button>
              <File className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">{fileName}</CardTitle>
              <Badge variant="secondary" className="font-mono text-xs">{editingFile}</Badge>
              {fileContent !== originalContent && <Badge variant="default" className="text-xs">Modified</Badge>}
              {saveStatus === "saved" && <Badge variant="secondary" className="text-xs text-green-500">Saved</Badge>}
              {saveStatus === "error" && <Badge variant="destructive" className="text-xs">Save failed</Badge>}
            </div>
            <Button size="sm" onClick={() => saveMutation.mutate({ file: editingFile, content: fileContent })} disabled={saveMutation.isPending || fileContent === originalContent}>
              <Save className="h-4 w-4 mr-1" /> {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingFile ? (
            <Skeleton className="h-80" />
          ) : (
            <textarea
              value={fileContent}
              onChange={(e) => { setFileContent(e.target.value); setSaveStatus(""); }}
              className="w-full h-96 rounded-md border bg-zinc-950 p-3 font-mono text-xs text-zinc-300 resize-y focus:outline-none focus:ring-2 focus:ring-primary"
              spellCheck={false}
            />
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Files</CardTitle>
          <Badge variant="secondary" className="font-mono text-xs">{currentDir}</Badge>
          {currentDir !== "/" && (
            <Button variant="ghost" size="sm" onClick={navigateUp}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-24 text-right">Size</TableHead>
                <TableHead className="w-40 text-right">Modified</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files?.map((f) => (
                <TableRow
                  key={f.name}
                  className={f.directory || isTextFile(f.name) ? "cursor-pointer hover:bg-accent" : ""}
                  onClick={() => {
                    if (f.directory) {
                      navigateDir(currentDir === "/" ? `/${f.name}` : `${currentDir}/${f.name}`);
                    } else if (isTextFile(f.name)) {
                      openFile(f.name);
                    }
                  }}
                >
                  <TableCell className="flex items-center gap-2">
                    {f.directory ? <Folder className="h-4 w-4 text-primary" /> : <File className="h-4 w-4 text-muted-foreground" />}
                    {f.name}
                    {f.directory && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{f.directory ? "-" : formatBytes(f.size)}</TableCell>
                  <TableCell className="text-right text-muted-foreground text-xs">{new Date(f.modified).toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {files?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">Empty directory</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function SettingsTab({ serverId, serverName }: { serverId: string; serverName: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/servers/${serverId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      navigate({ to: "/" });
    },
  });

  return (
    <Card className="border-destructive">
      <CardHeader>
        <CardTitle className="text-destructive">Danger Zone</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <div>
          <p className="font-medium">Delete this server</p>
          <p className="text-sm text-muted-foreground">
            Permanently remove this server and all its data. This cannot be undone.
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">
              <Trash2 className="h-4 w-4 mr-2" /> Delete Server
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete server "{serverName}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove the server and all its data from both the panel and the node. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete Server"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="text-primary">{icon}</div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-sm font-medium">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
