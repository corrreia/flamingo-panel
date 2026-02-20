import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Layout } from "@web/components/layout";
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
import { Card, CardContent } from "@web/components/ui/card";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import { Separator } from "@web/components/ui/separator";
import { Skeleton } from "@web/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@web/components/ui/tabs";
import { useNodeMetrics } from "@web/hooks/use-node-metrics";
import { api } from "@web/lib/api";
import { formatBytes } from "@web/lib/format";
import {
  ArrowLeft,
  Box,
  Check,
  Copy,
  Cpu,
  HardDrive,
  MemoryStick,
  Save,
  Settings,
  Terminal,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useState } from "react";

interface NodeDetail {
  createdAt: string;
  id: number;
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

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        <div className="mt-1 font-semibold text-lg tabular-nums">{value}</div>
        {sub && <div className="text-muted-foreground text-xs">{sub}</div>}
      </CardContent>
    </Card>
  );
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

  const isOnline = metrics.wingsOnline || !!node.stats;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button asChild size="sm" variant="ghost">
            <Link to="/admin/nodes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <h1 className="font-bold text-2xl">{node.name}</h1>
              <Badge variant={isOnline ? "default" : "secondary"}>
                {isOnline ? (
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
            {node.url && (
              <p className="truncate font-mono text-muted-foreground text-xs">
                {node.url}
              </p>
            )}
          </div>
        </div>

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

        {/* Live metrics — always visible */}
        <div className="grid grid-cols-3 gap-4">
          <MetricCard
            icon={<Cpu className="h-4 w-4" />}
            label="CPU"
            sub={
              node.stats
                ? `${node.stats.system.cpu_threads} threads`
                : undefined
            }
            value={
              metrics.utilization
                ? `${metrics.utilization.cpu_percent.toFixed(1)}%`
                : "-"
            }
          />
          <MetricCard
            icon={<MemoryStick className="h-4 w-4" />}
            label="Memory"
            value={
              metrics.utilization
                ? `${formatBytes(metrics.utilization.memory_used)} / ${formatBytes(metrics.utilization.memory_total)}`
                : "-"
            }
          />
          <MetricCard
            icon={<HardDrive className="h-4 w-4" />}
            label="Disk"
            value={
              metrics.utilization
                ? `${formatBytes(metrics.utilization.disk_used)} / ${formatBytes(metrics.utilization.disk_total)}`
                : "-"
            }
          />
        </div>

        {/* Tabs outside card, content inside */}
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="mr-1.5 h-3.5 w-3.5" /> Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <Card>
              <CardContent className="space-y-6 pt-6">
                {node.stats ? (
                  <div className="grid grid-cols-1 gap-x-12 gap-y-0 sm:grid-cols-2">
                    <div className="divide-y">
                      <InfoRow label="OS" value={node.stats.system.os} />
                      <InfoRow
                        label="Kernel"
                        value={node.stats.system.kernel_version}
                      />
                      <InfoRow
                        label="Arch"
                        value={node.stats.system.architecture}
                      />
                      <InfoRow
                        label="CPU Threads"
                        value={node.stats.system.cpu_threads}
                      />
                    </div>
                    <div className="divide-y">
                      <InfoRow label="Wings" value={`v${node.stats.version}`} />
                      <InfoRow
                        label="Docker"
                        value={node.stats.docker.version}
                      />
                      <InfoRow
                        label="Containers"
                        value={
                          <span className="flex items-center gap-1.5">
                            <Box className="h-3 w-3 text-muted-foreground" />
                            {node.stats.docker.containers.running} running /{" "}
                            {node.stats.docker.containers.total} total
                          </span>
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {node.url
                      ? "Could not connect to Wings."
                      : "Set the Wings URL in Settings to connect."}
                  </p>
                )}

                <Separator />

                <div className="divide-y">
                  <InfoRow
                    label="Token ID"
                    value={<span className="text-xs">{node.tokenId}</span>}
                  />
                  <InfoRow
                    label="Created"
                    value={new Date(node.createdAt).toLocaleString()}
                  />
                  <InfoRow
                    label="Updated"
                    value={new Date(node.updatedAt).toLocaleString()}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardContent className="space-y-6 pt-6">
                <div className="space-y-4">
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
                  <div className="flex justify-end">
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
                </div>

                <Separator />

                <div className="space-y-3">
                  <h3 className="font-medium text-sm">Wings Setup</h3>
                  <p className="text-muted-foreground text-sm">
                    Generate a one-time command to configure or reconfigure the
                    Wings daemon on this node.
                  </p>
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
                  <Button
                    disabled={reconfigureMutation.isPending}
                    onClick={() => reconfigureMutation.mutate()}
                    variant="outline"
                  >
                    <Terminal className="mr-2 h-4 w-4" />{" "}
                    {reconfigureMutation.isPending
                      ? "Generating..."
                      : "Generate Configure Command"}
                  </Button>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-destructive text-sm">
                      Delete this node
                    </h3>
                    <p className="text-muted-foreground text-xs">
                      All servers must be removed first. This cannot be undone.
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive">
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Delete node &ldquo;{node.name}&rdquo;?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove this node. This action
                          cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          disabled={deleteMutation.isPending}
                          onClick={() => deleteMutation.mutate()}
                        >
                          {deleteMutation.isPending
                            ? "Deleting..."
                            : "Delete Node"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
