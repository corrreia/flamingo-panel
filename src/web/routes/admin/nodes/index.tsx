import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@web/lib/api";
import { Layout } from "@web/components/layout";
import { Card, CardContent } from "@web/components/ui/card";
import { Badge } from "@web/components/ui/badge";
import { Button } from "@web/components/ui/button";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import { Skeleton } from "@web/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader,
  DialogTitle, DialogTrigger, DialogFooter,
} from "@web/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@web/components/ui/table";
import { Alert, AlertDescription } from "@web/components/ui/alert";
import {
  Network, Plus, Trash2, ArrowLeft, Wifi, WifiOff,
  Copy, Globe, Check,
} from "lucide-react";

interface NodeItem {
  id: number;
  name: string;
  url: string;
  memory: number;
  disk: number;
  createdAt: string;
}

interface NodeDetail extends NodeItem {
  stats: {
    version: string;
    kernel_version: string;
    architecture: string;
    os: string;
    cpu_count: number;
  } | null;
}

interface CreatedNode extends NodeItem {
  configureCommand: string;
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
  const [memory, setMemory] = useState("0");
  const [disk, setDisk] = useState("0");

  const { data: nodes, isLoading } = useQuery({
    queryKey: ["nodes"],
    queryFn: () => api.get<NodeItem[]>("/nodes"),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; url?: string; memory: number; disk: number }) =>
      api.post<CreatedNode>("/nodes", data),
    onSuccess: (result) => {
      setCreatedNode(result);
      setDialogOpen(false);
      setResultDialogOpen(true);
      setName(""); setNodeUrl(""); setMemory("0"); setDisk("0");
      queryClient.invalidateQueries({ queryKey: ["nodes"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/nodes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nodes"] }),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    createMutation.mutate({
      name,
      url: nodeUrl || undefined,
      memory: parseInt(memory) || 0,
      disk: parseInt(disk) || 0,
    });
  };

  const handleDelete = (id: number, nodeName: string) => {
    if (!confirm(`Delete node "${nodeName}"? This cannot be undone.`)) return;
    deleteMutation.mutate(id);
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
            <Button variant="ghost" size="sm" asChild>
              <Link to="/"><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <h1 className="text-2xl font-bold">Nodes</h1>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Add Node</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Node</DialogTitle>
                <DialogDescription>Create a node to get the <code>wings configure</code> command.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
                <div className="space-y-2">
                  <Label htmlFor="node-name">Name</Label>
                  <Input id="node-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="US East 1" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="node-url">Wings URL (optional)</Label>
                  <Input id="node-url" value={nodeUrl} onChange={(e) => setNodeUrl(e.target.value)} placeholder="https://wings-node1.example.com" />
                  <p className="text-xs text-muted-foreground">Full URL including protocol and port.</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="node-memory">Memory (MB)</Label>
                    <Input id="node-memory" type="number" value={memory} onChange={(e) => setMemory(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="node-disk">Disk (MB)</Label>
                    <Input id="node-disk" type="number" value={disk} onChange={(e) => setDisk(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Creating..." : "Create Node"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Dialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Node Created</DialogTitle>
              <DialogDescription>Run this command on your Wings machine. The API token is one-time use.</DialogDescription>
            </DialogHeader>
            {createdNode && (
              <div className="space-y-4">
                <div className="rounded-md bg-muted p-3 font-mono text-xs break-all select-all">{createdNode.configureCommand}</div>
                <Button variant="outline" size="sm" className="w-full" onClick={() => copyToClipboard(createdNode.configureCommand)}>
                  {commandCopied ? <><Check className="h-4 w-4 mr-2" /> Copied</> : <><Copy className="h-4 w-4 mr-2" /> Copy Command</>}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {isLoading ? (
          <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-16" />)}</div>
        ) : !nodes?.length ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Network className="h-12 w-12 mb-4 text-primary/30" />
              <p>No nodes configured yet.</p>
              <p className="text-sm">Add a Wings node to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Wings URL</TableHead>
                  <TableHead className="text-right">Memory</TableHead>
                  <TableHead className="text-right">Disk</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nodes.map((node) => (
                  <TableRow key={node.id}>
                    <TableCell className="font-mono text-muted-foreground">
                      <Link to="/admin/nodes/$nodeId" params={{ nodeId: String(node.id) }}>{node.id}</Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Network className="h-4 w-4 text-primary" />
                        <Link to="/admin/nodes/$nodeId" params={{ nodeId: String(node.id) }} className="font-medium hover:underline">{node.name}</Link>
                      </div>
                    </TableCell>
                    <TableCell>
                      {node.url ? (
                        <span className="font-mono text-sm text-muted-foreground">{node.url}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not set</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{node.memory > 0 ? `${node.memory} MB` : "-"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{node.disk > 0 ? `${node.disk} MB` : "-"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(node.id, node.name)} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </Layout>
  );
}
