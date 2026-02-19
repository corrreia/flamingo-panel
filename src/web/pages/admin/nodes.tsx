import { useEffect, useState } from "react";
import { api } from "@web/lib/api";
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

export function NodesPage() {
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdNode, setCreatedNode] = useState<CreatedNode | null>(null);
  const [commandCopied, setCommandCopied] = useState(false);

  // Create form state
  const [name, setName] = useState("");
  const [nodeUrl, setNodeUrl] = useState("");
  const [memory, setMemory] = useState("0");
  const [disk, setDisk] = useState("0");

  const load = () => {
    setLoading(true);
    api.get<NodeItem[]>("/nodes").then(setNodes).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const result = await api.post<CreatedNode>("/nodes", {
        name,
        url: nodeUrl || undefined,
        memory: parseInt(memory) || 0,
        disk: parseInt(disk) || 0,
      });
      setCreatedNode(result);
      setDialogOpen(false);
      setResultDialogOpen(true);
      setName(""); setNodeUrl(""); setMemory("0"); setDisk("0");
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number, nodeName: string) => {
    if (!confirm(`Delete node "${nodeName}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/nodes/${id}`);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCommandCopied(true);
    setTimeout(() => setCommandCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <a href="/"><ArrowLeft className="h-4 w-4" /></a>
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
              <DialogDescription>
                Create a node to get the <code>wings configure</code> command.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="node-name">Name</Label>
                <Input id="node-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="US East 1" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="node-url">Wings URL (optional — set after cloudflared is running)</Label>
                <Input
                  id="node-url"
                  value={nodeUrl}
                  onChange={(e) => setNodeUrl(e.target.value)}
                  placeholder="https://wings-node1.example.com"
                />
                <p className="text-xs text-muted-foreground">
                  Full URL including protocol and port. Use <code>https://</code> in production.
                  HTTP and custom ports (e.g. <code>http://10.0.0.5:8080</code>) are fine for dev.
                </p>
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
                <Button type="submit" disabled={creating}>
                  {creating ? "Creating..." : "Create Node"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Result dialog after node creation — shows wings configure command */}
      <Dialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Node Created</DialogTitle>
            <DialogDescription>
              Run this command on your Wings machine. The API token is one-time use
              and will be consumed when Wings configures.
            </DialogDescription>
          </DialogHeader>
          {createdNode && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted p-3 font-mono text-xs break-all select-all">
                {createdNode.configureCommand}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => copyToClipboard(createdNode.configureCommand)}
              >
                {commandCopied
                  ? <><Check className="h-4 w-4 mr-2" /> Copied</>
                  : <><Copy className="h-4 w-4 mr-2" /> Copy Command</>
                }
              </Button>
              {!createdNode.url && (
                <p className="text-xs text-muted-foreground">
                  After Wings is configured and cloudflared is running, set the Wings URL on this node.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : nodes.length === 0 ? (
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
                <NodeRow key={node.id} node={node} onDelete={() => handleDelete(node.id, node.name)} onUpdate={load} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function NodeRow({ node, onDelete, onUpdate }: { node: NodeItem; onDelete: () => void; onUpdate: () => void }) {
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [checking, setChecking] = useState(false);
  const [urlDialogOpen, setUrlDialogOpen] = useState(false);
  const [url, setUrl] = useState(node.url);
  const [saving, setSaving] = useState(false);

  const checkStatus = () => {
    setChecking(true);
    api.get<NodeDetail>(`/nodes/${node.id}`)
      .then(setDetail)
      .finally(() => setChecking(false));
  };

  const handleSetUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/nodes/${node.id}`, { url });
      setUrlDialogOpen(false);
      onUpdate();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <TableRow>
      <TableCell className="font-mono text-muted-foreground">{node.id}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-primary" />
          <span className="font-medium">{node.name}</span>
          {detail && (
            <Badge variant={detail.stats ? "default" : "secondary"} className="ml-1">
              {detail.stats ? (
                <><Wifi className="h-3 w-3 mr-1" /> Online</>
              ) : (
                <><WifiOff className="h-3 w-3 mr-1" /> Offline</>
              )}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        {node.url ? (
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{node.url}</span>
            <Dialog open={urlDialogOpen} onOpenChange={setUrlDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 px-1">
                  <Globe className="h-3 w-3" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Update Wings URL</DialogTitle>
                  <DialogDescription>
                    Full URL for node "{node.name}" including protocol and port.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSetUrl} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="url-input">Wings URL</Label>
                    <Input id="url-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://wings-node1.example.com" required />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        ) : (
          <Dialog open={urlDialogOpen} onOpenChange={setUrlDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs">
                <Globe className="h-3 w-3 mr-1" /> Set URL
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Set Wings URL</DialogTitle>
                <DialogDescription>
                  Enter the full Wings URL for node "{node.name}". Use <code>https://</code> for production.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSetUrl} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="url-input">Wings URL</Label>
                  <Input id="url-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://wings-node1.example.com" required />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </TableCell>
      <TableCell className="text-right text-muted-foreground">{node.memory > 0 ? `${node.memory} MB` : "-"}</TableCell>
      <TableCell className="text-right text-muted-foreground">{node.disk > 0 ? `${node.disk} MB` : "-"}</TableCell>
      <TableCell>
        <div className="flex gap-1">
          {node.url && (
            <Button variant="ghost" size="sm" onClick={checkStatus} disabled={checking}>
              {checking ? "..." : "Check"}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
