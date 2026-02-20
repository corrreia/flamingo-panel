import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Layout } from "@web/components/layout";
import { StatCard } from "@web/components/stat-card";
import { Alert, AlertDescription } from "@web/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@web/components/ui/alert-dialog";
import { Badge } from "@web/components/ui/badge";
import { Button } from "@web/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@web/components/ui/card";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import { Skeleton } from "@web/components/ui/skeleton";
import { useNodeMetrics } from "@web/hooks/use-node-metrics";
import { api } from "@web/lib/api";
import { formatBytes } from "@web/lib/format";
import {
  ArrowLeft,
  Check,
  Copy,
  Cpu,
  Globe,
  HardDrive,
  MemoryStick,
  Save,
  Server,
  Terminal,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useState } from "react";

interface NodeDetail {
  createdAt: string;
  disk: number;
  diskOverallocate: number;
  id: number;
  memory: number;
  memoryOverallocate: number;
  name: string;
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
      containers: {
        total: number;
        running: number;
        paused: number;
        stopped: number;
      };
    };
  } | null;
  tokenId: string;
  updatedAt: string;
  uploadSize: number;
  url: string;
}

export const Route = createFileRoute("/admin/nodes/$nodeId")({
  component: NodeDetailPage,
});

function NodeDetailPage() {
  const { nodeId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [configureCommand, setConfigureCommand] = useState("");
  const [commandCopied, setCommandCopied] = useState(false);

  const metrics = useNodeMetrics(nodeId);

  const { data: node, isLoading } = useQuery({
    queryKey: ["node", nodeId],
    queryFn: async () => {
      const data = await api.get<NodeDetail>(`/nodes/${nodeId}`);
      setName(data.name);
      setUrl(data.url);
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put(`/nodes/${nodeId}`, {
        name,
        url,
      }),
    onSuccess: () => {
      setSuccess("Node updated");
      setTimeout(() => setSuccess(""), 3000);
      queryClient.invalidateQueries({ queryKey: ["node", nodeId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/nodes/${nodeId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nodes"] });
      navigate({ to: "/admin/nodes" });
    },
  });

  const reconfigureMutation = useMutation({
    mutationFn: () =>
      api.post<{ configureCommand: string }>(`/nodes/${nodeId}/reconfigure`),
    onSuccess: (res) => setConfigureCommand(res.configureCommand),
    onError: (err: Error) => setError(err.message),
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCommandCopied(true);
    setTimeout(() => setCommandCopied(false), 2000);
  };

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

  if (!node) {
    return (
      <Layout>
        <div className="space-y-4">
          <Button asChild size="sm" variant="ghost">
            <Link to="/admin/nodes">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Nodes
            </Link>
          </Button>
          <Alert variant="destructive">
            <AlertDescription>Node not found.</AlertDescription>
          </Alert>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button asChild size="sm" variant="ghost">
              <Link to="/admin/nodes">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="font-bold text-2xl">{node.name}</h1>
              <p className="text-muted-foreground text-sm">Node #{node.id}</p>
            </div>
            <Badge
              variant={
                metrics.connected || node.stats ? "default" : "secondary"
              }
            >
              {metrics.connected || node.stats ? (
                <>
                  <Wifi className="mr-1 h-3 w-3" /> Online
                </>
              ) : (
                <>
                  <WifiOff className="mr-1 h-3 w-3" /> Offline
                </>
              )}
            </Badge>
          </div>
        </div>

        {metrics.utilization && (
          <div className="grid grid-cols-3 gap-4">
            <StatCard
              icon={<Cpu className="h-4 w-4" />}
              label="CPU"
              value={`${metrics.utilization.cpu_percent.toFixed(1)}%`}
            />
            <StatCard
              icon={<MemoryStick className="h-4 w-4" />}
              label="Memory"
              value={`${formatBytes(metrics.utilization.memory_used)} / ${formatBytes(metrics.utilization.memory_total)}`}
            />
            <StatCard
              icon={<HardDrive className="h-4 w-4" />}
              label="Disk"
              value={`${formatBytes(metrics.utilization.disk_used)} / ${formatBytes(metrics.utilization.disk_total)}`}
            />
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Server className="h-4 w-4" /> System Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const info = metrics.systemInfo ?? node.stats;
                if (!info) {
                  return (
                    <p className="text-muted-foreground text-sm">
                      {node.url
                        ? "Could not connect to Wings."
                        : "Set the Wings URL below to connect."}
                    </p>
                  );
                }
                return (
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Wings Version
                      </span>
                      <span className="font-mono">{info.version}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">OS</span>
                      <span className="font-mono">{info.system.os}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Kernel</span>
                      <span className="font-mono">
                        {info.system.kernel_version}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Architecture
                      </span>
                      <span className="font-mono">
                        {info.system.architecture}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">CPU Threads</span>
                      <span className="flex items-center gap-1 font-mono">
                        <Cpu className="h-3 w-3" /> {info.system.cpu_threads}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Memory</span>
                      <span className="flex items-center gap-1 font-mono">
                        <MemoryStick className="h-3 w-3" />{" "}
                        {Math.round(
                          info.system.memory_bytes / 1024 / 1024 / 1024
                        )}{" "}
                        GB
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Docker</span>
                      <span className="font-mono">{info.docker.version}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Containers</span>
                      <span className="font-mono">
                        {info.docker.containers.running} running /{" "}
                        {info.docker.containers.total} total
                      </span>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
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

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Node Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Name</Label>
                  <Input
                    id="edit-name"
                    onChange={(e) => setName(e.target.value)}
                    value={name}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-url">Wings URL</Label>
                  <Input
                    id="edit-url"
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://wings-node1.example.com"
                    value={url}
                  />
                  <p className="text-muted-foreground text-xs">
                    Full URL with protocol.
                  </p>
                </div>
              </div>
              {configureCommand && (
                <div className="space-y-2">
                  <div className="select-all break-all rounded-md bg-muted p-3 font-mono text-xs">
                    {configureCommand}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => copyToClipboard(configureCommand)}
                      size="sm"
                      variant="outline"
                    >
                      {commandCopied ? (
                        <>
                          <Check className="mr-2 h-4 w-4" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="mr-2 h-4 w-4" /> Copy Command
                        </>
                      )}
                    </Button>
                    <span className="text-muted-foreground text-xs">
                      One-time use. Restart Wings after running.
                    </span>
                  </div>
                </div>
              )}
              <div className="flex justify-between">
                <Button
                  disabled={reconfigureMutation.isPending}
                  onClick={() => reconfigureMutation.mutate()}
                  variant="outline"
                >
                  <Terminal className="mr-2 h-4 w-4" />{" "}
                  {reconfigureMutation.isPending
                    ? "Generating..."
                    : "Reconfigure Wings"}
                </Button>
                <Button
                  disabled={saveMutation.isPending}
                  onClick={() => {
                    setError("");
                    saveMutation.mutate();
                  }}
                >
                  <Save className="mr-2 h-4 w-4" />{" "}
                  {saveMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div>
                <p className="font-medium">Delete this node</p>
                <p className="text-muted-foreground text-sm">
                  All servers must be removed from this node before it can be
                  deleted. This action cannot be undone.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 className="mr-2 h-4 w-4" /> Delete Node
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete node "{node.name}"?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove this node. This action cannot
                      be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate()}
                    >
                      {deleteMutation.isPending ? "Deleting..." : "Delete Node"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
