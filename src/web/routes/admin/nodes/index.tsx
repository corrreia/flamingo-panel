import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Layout } from "@web/components/layout";
import { StatCard } from "@web/components/stat-card";
import { Alert, AlertDescription } from "@web/components/ui/alert";
import { Button } from "@web/components/ui/button";
import { Card, CardContent } from "@web/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@web/components/ui/dialog";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import { Skeleton } from "@web/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@web/components/ui/table";
import { type Utilization, useNodeMetrics } from "@web/hooks/use-node-metrics";
import { api } from "@web/lib/api";
import { formatBytes } from "@web/lib/format";
import {
  ArrowLeft,
  Check,
  Copy,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  Plus,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

interface NodeItem {
  createdAt: string;
  id: number;
  name: string;
  url: string;
}

interface CreatedNode extends NodeItem {
  configureCommand: string;
}

interface NodeMetricsReport {
  nodeId: number;
  utilization: Utilization | null;
  wingsOnline: boolean;
}

function NodeRow({
  node,
  onMetrics,
}: {
  node: NodeItem;
  onMetrics: (report: NodeMetricsReport) => void;
}) {
  const metrics = useNodeMetrics(node.url ? node.id : null);

  // Report metrics to parent for aggregation
  const prevRef = useMemo(
    () => ({
      wingsOnline: false,
      utilization: null as Utilization | null,
    }),
    []
  );

  if (
    metrics.wingsOnline !== prevRef.wingsOnline ||
    metrics.utilization !== prevRef.utilization
  ) {
    prevRef.wingsOnline = metrics.wingsOnline;
    prevRef.utilization = metrics.utilization;
    queueMicrotask(() =>
      onMetrics({
        nodeId: node.id,
        wingsOnline: metrics.wingsOnline,
        utilization: metrics.utilization,
      })
    );
  }

  return (
    <TableRow>
      <TableCell className="font-mono text-muted-foreground">
        <Link params={{ nodeId: String(node.id) }} to="/admin/nodes/$nodeId">
          {node.id}
        </Link>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${metrics.wingsOnline ? "bg-green-500" : "bg-gray-400"}`}
          />
          <Link
            className="font-medium hover:underline"
            params={{ nodeId: String(node.id) }}
            to="/admin/nodes/$nodeId"
          >
            {node.name}
          </Link>
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        {node.url ? (
          <span className="font-mono text-muted-foreground text-sm">
            {node.url}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">Not set</span>
        )}
      </TableCell>
      <TableCell className="hidden text-right text-muted-foreground md:table-cell">
        {metrics.utilization
          ? `${metrics.utilization.cpu_percent.toFixed(1)}%`
          : "-"}
      </TableCell>
      <TableCell className="hidden text-right text-muted-foreground md:table-cell">
        {metrics.utilization
          ? `${formatBytes(metrics.utilization.memory_used)} / ${formatBytes(metrics.utilization.memory_total)}`
          : "-"}
      </TableCell>
      <TableCell className="hidden text-right text-muted-foreground md:table-cell">
        {metrics.utilization
          ? `${formatBytes(metrics.utilization.disk_used)} / ${formatBytes(metrics.utilization.disk_total)}`
          : "-"}
      </TableCell>
    </TableRow>
  );
}

function NodesList({
  nodes,
  isLoading,
  onNodeMetrics,
}: {
  nodes: NodeItem[] | undefined;
  isLoading: boolean;
  onNodeMetrics: (report: NodeMetricsReport) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Skeleton className="h-16" key={i} />
        ))}
      </div>
    );
  }

  if (nodes?.length) {
    return (
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">Wings URL</TableHead>
              <TableHead className="hidden text-right md:table-cell">CPU</TableHead>
              <TableHead className="hidden text-right md:table-cell">Memory</TableHead>
              <TableHead className="hidden text-right md:table-cell">Disk</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nodes.map((node) => (
              <NodeRow key={node.id} node={node} onMetrics={onNodeMetrics} />
            ))}
          </TableBody>
        </Table>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Network className="mb-4 h-12 w-12 text-primary/30" />
        <p>No nodes configured yet.</p>
        <p className="text-sm">Add a Wings node to get started.</p>
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute("/admin/nodes/")({
  component: NodesPage,
});

function NodesPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [error, setError] = useState("");
  const [createdNode, setCreatedNode] = useState<CreatedNode | null>(null);
  const [commandCopied, setCommandCopied] = useState(false);
  const [name, setName] = useState("");
  const [nodeUrl, setNodeUrl] = useState("");

  const [metricsMap, setMetricsMap] = useState<Map<number, NodeMetricsReport>>(
    new Map()
  );

  const handleNodeMetrics = useCallback((report: NodeMetricsReport) => {
    setMetricsMap((prev) => {
      const next = new Map(prev);
      next.set(report.nodeId, report);
      return next;
    });
  }, []);

  const aggregate = useMemo(() => {
    let cpuUsageSum = 0;
    let cpuUsageCount = 0;
    let memoryUsed = 0;
    let memoryTotal = 0;
    let diskUsed = 0;
    let diskTotal = 0;

    for (const report of metricsMap.values()) {
      if (report.utilization) {
        cpuUsageSum += report.utilization.cpu_percent;
        cpuUsageCount++;
        memoryUsed += report.utilization.memory_used;
        memoryTotal += report.utilization.memory_total;
        diskUsed += report.utilization.disk_used;
        diskTotal += report.utilization.disk_total;
      }
    }

    return {
      cpuUsage: cpuUsageCount > 0 ? cpuUsageSum / cpuUsageCount : 0,
      memoryUsed,
      memoryTotal,
      diskUsed,
      diskTotal,
      hasData: cpuUsageCount > 0,
    };
  }, [metricsMap]);

  const { data: nodes, isLoading } = useQuery({
    queryKey: ["nodes"],
    queryFn: () => api.get<NodeItem[]>("/nodes"),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; url?: string }) =>
      api.post<CreatedNode>("/nodes", data),
    onSuccess: (result) => {
      setCreatedNode(result);
      setDialogOpen(false);
      setResultDialogOpen(true);
      setName("");
      setNodeUrl("");
      queryClient.invalidateQueries({ queryKey: ["nodes"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    createMutation.mutate({
      name,
      url: nodeUrl || undefined,
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCommandCopied(true);
    setTimeout(() => setCommandCopied(false), 2000);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button asChild size="sm" variant="ghost">
              <Link to="/">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="font-bold text-2xl">Nodes</h1>
          </div>
          <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Add Node
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Node</DialogTitle>
                <DialogDescription>
                  Create a node to get the <code>wings configure</code> command.
                </DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={handleCreate}>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="node-name">Name</Label>
                  <Input
                    id="node-name"
                    onChange={(e) => setName(e.target.value)}
                    placeholder="US East 1"
                    required
                    value={name}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="node-url">Wings URL (optional)</Label>
                  <Input
                    id="node-url"
                    onChange={(e) => setNodeUrl(e.target.value)}
                    placeholder="https://wings-node1.example.com"
                    value={nodeUrl}
                  />
                  <p className="text-muted-foreground text-xs">
                    Full URL including protocol and port.
                  </p>
                </div>
                <DialogFooter>
                  <Button disabled={createMutation.isPending} type="submit">
                    {createMutation.isPending ? "Creating..." : "Create Node"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Dialog onOpenChange={setResultDialogOpen} open={resultDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Node Created</DialogTitle>
              <DialogDescription>
                Run this command on your Wings machine. The API token is
                one-time use.
              </DialogDescription>
            </DialogHeader>
            {createdNode && (
              <div className="space-y-4">
                <div className="select-all break-all rounded-md bg-muted p-3 font-mono text-xs">
                  {createdNode.configureCommand}
                </div>
                <Button
                  className="w-full"
                  onClick={() => copyToClipboard(createdNode.configureCommand)}
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
              </div>
            )}
          </DialogContent>
        </Dialog>

        {aggregate.hasData && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            <StatCard
              icon={<Cpu className="h-4 w-4" />}
              label="CPU Usage"
              value={`${aggregate.cpuUsage.toFixed(1)}%`}
            />
            <StatCard
              icon={<MemoryStick className="h-4 w-4" />}
              label="Memory"
              value={`${formatBytes(aggregate.memoryUsed)} / ${formatBytes(aggregate.memoryTotal)}`}
            />
            <StatCard
              icon={<HardDrive className="h-4 w-4" />}
              label="Disk"
              value={`${formatBytes(aggregate.diskUsed)} / ${formatBytes(aggregate.diskTotal)}`}
            />
          </div>
        )}

        <NodesList
          isLoading={isLoading}
          nodes={nodes}
          onNodeMetrics={handleNodeMetrics}
        />
      </div>
    </Layout>
  );
}
