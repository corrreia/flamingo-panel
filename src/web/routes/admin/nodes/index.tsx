import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Layout } from "@web/components/layout";
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
import { api } from "@web/lib/api";
import { ArrowLeft, Check, Copy, Network, Plus } from "lucide-react";
import { useState } from "react";

interface NodeItem {
  createdAt: string;
  disk: number;
  id: number;
  memory: number;
  name: string;
  url: string;
}

interface CreatedNode extends NodeItem {
  configureCommand: string;
}

function renderNodesList(nodes: NodeItem[] | undefined, isLoading: boolean) {
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
              <TableHead>Wings URL</TableHead>
              <TableHead className="text-right">Memory</TableHead>
              <TableHead className="text-right">Disk</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nodes.map((node) => (
              <TableRow key={node.id}>
                <TableCell className="font-mono text-muted-foreground">
                  <Link
                    params={{ nodeId: String(node.id) }}
                    to="/admin/nodes/$nodeId"
                  >
                    {node.id}
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Network className="h-4 w-4 text-primary" />
                    <Link
                      className="font-medium hover:underline"
                      params={{ nodeId: String(node.id) }}
                      to="/admin/nodes/$nodeId"
                    >
                      {node.name}
                    </Link>
                  </div>
                </TableCell>
                <TableCell>
                  {node.url ? (
                    <span className="font-mono text-muted-foreground text-sm">
                      {node.url}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      Not set
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {node.memory > 0 ? `${node.memory} MB` : "-"}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {node.disk > 0 ? `${node.disk} MB` : "-"}
                </TableCell>
              </TableRow>
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
  const [memory, setMemory] = useState("0");
  const [disk, setDisk] = useState("0");

  const { data: nodes, isLoading } = useQuery({
    queryKey: ["nodes"],
    queryFn: () => api.get<NodeItem[]>("/nodes"),
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      name: string;
      url?: string;
      memory: number;
      disk: number;
    }) => api.post<CreatedNode>("/nodes", data),
    onSuccess: (result) => {
      setCreatedNode(result);
      setDialogOpen(false);
      setResultDialogOpen(true);
      setName("");
      setNodeUrl("");
      setMemory("0");
      setDisk("0");
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
      memory: Number.parseInt(memory, 10) || 0,
      disk: Number.parseInt(disk, 10) || 0,
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="node-memory">Memory (MB)</Label>
                    <Input
                      id="node-memory"
                      onChange={(e) => setMemory(e.target.value)}
                      type="number"
                      value={memory}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="node-disk">Disk (MB)</Label>
                    <Input
                      id="node-disk"
                      onChange={(e) => setDisk(e.target.value)}
                      type="number"
                      value={disk}
                    />
                  </div>
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

        {renderNodesList(nodes, isLoading)}
      </div>
    </Layout>
  );
}
