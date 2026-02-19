import { useEffect, useState } from "react";
import { api } from "@web/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card";
import { Badge } from "@web/components/ui/badge";
import { Button } from "@web/components/ui/button";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import { Skeleton } from "@web/components/ui/skeleton";
import { Alert, AlertDescription } from "@web/components/ui/alert";
import {
  ArrowLeft, Wifi, WifiOff, Cpu, HardDrive, MemoryStick,
  Server, Globe, Save, RefreshCw, Terminal, Copy, Check,
} from "lucide-react";

interface NodeDetail {
  id: number;
  name: string;
  url: string;
  tokenId: string;
  memory: number;
  memoryOverallocate: number;
  disk: number;
  diskOverallocate: number;
  uploadSize: number;
  createdAt: string;
  updatedAt: string;
  stats: {
    version: string;
    system: {
      architecture: string;
      cpu_threads: number;
      memory_bytes: number;
      kernel_version: string;
      os: string;
      os_type: string;
    };
    docker: {
      version: string;
      containers: { total: number; running: number; paused: number; stopped: number };
    };
  } | null;
}

export function NodeDetailPage({ nodeId }: { nodeId: string }) {
  const [node, setNode] = useState<NodeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Editable fields
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [memory, setMemory] = useState("0");
  const [disk, setDisk] = useState("0");

  // Reconfigure
  const [configureCommand, setConfigureCommand] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [commandCopied, setCommandCopied] = useState(false);

  const load = () => {
    setLoading(true);
    api.get<NodeDetail>(`/nodes/${nodeId}`)
      .then((data) => {
        setNode(data);
        setName(data.name);
        setUrl(data.url);
        setMemory(String(data.memory));
        setDisk(String(data.disk));
      })
      .catch(() => setError("Failed to load node"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [nodeId]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await api.put(`/nodes/${nodeId}`, {
        name,
        url,
        memory: parseInt(memory) || 0,
        disk: parseInt(disk) || 0,
      });
      setSuccess("Node updated");
      setTimeout(() => setSuccess(""), 3000);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReconfigure = async () => {
    setRegenerating(true);
    setError("");
    try {
      const res = await api.post<{ configureCommand: string }>(`/nodes/${nodeId}/reconfigure`);
      setConfigureCommand(res.configureCommand);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRegenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCommandCopied(true);
    setTimeout(() => setCommandCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!node) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <a href="/admin/nodes"><ArrowLeft className="h-4 w-4 mr-2" /> Back to Nodes</a>
        </Button>
        <Alert variant="destructive"><AlertDescription>Node not found.</AlertDescription></Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <a href="/admin/nodes"><ArrowLeft className="h-4 w-4" /></a>
          </Button>
          <h1 className="text-2xl font-bold">Node #{node.id} — {node.name}</h1>
          <Badge variant={node.stats ? "default" : "secondary"}>
            {node.stats ? (
              <><Wifi className="h-3 w-3 mr-1" /> Online</>
            ) : (
              <><WifiOff className="h-3 w-3 mr-1" /> Offline</>
            )}
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {success && <Alert><AlertDescription>{success}</AlertDescription></Alert>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="h-4 w-4" /> System Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            {node.stats ? (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Wings Version</span>
                  <span className="font-mono">{node.stats.version}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">OS</span>
                  <span className="font-mono">{node.stats.system.os}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kernel</span>
                  <span className="font-mono">{node.stats.system.kernel_version}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Architecture</span>
                  <span className="font-mono">{node.stats.system.architecture}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CPU Threads</span>
                  <span className="font-mono flex items-center gap-1"><Cpu className="h-3 w-3" /> {node.stats.system.cpu_threads}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Memory</span>
                  <span className="font-mono flex items-center gap-1"><MemoryStick className="h-3 w-3" /> {Math.round(node.stats.system.memory_bytes / 1024 / 1024 / 1024)} GB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Docker</span>
                  <span className="font-mono">{node.stats.docker.version}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Containers</span>
                  <span className="font-mono">{node.stats.docker.containers.running} running / {node.stats.docker.containers.total} total</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {node.url
                  ? "Could not connect to Wings. Make sure the node is running and the URL is correct."
                  : "Set the Wings URL below to connect to this node."
                }
              </p>
            )}
          </CardContent>
        </Card>

        {/* Connection Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" /> Connection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Token ID</span>
              <span className="font-mono text-xs">{node.tokenId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{new Date(node.createdAt).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Updated</span>
              <span>{new Date(node.updatedAt).toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        {/* Reconfigure */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Terminal className="h-4 w-4" /> Reconfigure Wings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Generate a new one-time <code>wings configure</code> command. Use this if you rebuilt the Wings machine or need to re-sync the configuration.
            </p>
            {configureCommand ? (
              <div className="space-y-3">
                <div className="rounded-md bg-muted p-3 font-mono text-xs break-all select-all">
                  {configureCommand}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(configureCommand)}
                >
                  {commandCopied
                    ? <><Check className="h-4 w-4 mr-2" /> Copied</>
                    : <><Copy className="h-4 w-4 mr-2" /> Copy Command</>
                  }
                </Button>
                <p className="text-xs text-muted-foreground">
                  This token is one-time use and will be consumed when Wings configures. Remember to restart Wings after running the command.
                </p>
              </div>
            ) : (
              <Button variant="outline" onClick={handleReconfigure} disabled={regenerating}>
                <Terminal className="h-4 w-4 mr-2" />
                {regenerating ? "Generating..." : "Generate Configure Command"}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Edit Node */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Node Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-url">Wings URL</Label>
                <Input
                  id="edit-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://wings-node1.example.com"
                />
                <p className="text-xs text-muted-foreground">
                  Full URL with protocol. Use <code>https://</code> for production, <code>http://host:port</code> for dev.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-memory">Memory (MB)</Label>
                <Input id="edit-memory" type="number" value={memory} onChange={(e) => setMemory(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-disk">Disk (MB)</Label>
                <Input id="edit-disk" type="number" value={disk} onChange={(e) => setDisk(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
