import { useEffect, useState } from "react";
import { api } from "@web/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card";
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
} from "lucide-react";

interface NodeItem {
  id: string;
  name: string;
  fqdn: string;
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

export function NodesPage() {
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [fqdn, setFqdn] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [token, setToken] = useState("");
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
      await api.post("/nodes", {
        name,
        fqdn,
        tokenId,
        token,
        memory: parseInt(memory) || 0,
        disk: parseInt(disk) || 0,
      });
      setDialogOpen(false);
      setName(""); setFqdn(""); setTokenId(""); setToken("");
      setMemory("0"); setDisk("0");
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, nodeName: string) => {
    if (!confirm(`Delete node "${nodeName}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/nodes/${id}`);
      load();
    } catch (err: any) {
      alert(err.message);
    }
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
                Connect a Wings node via Cloudflare Tunnel. Paste the tunnel hostname
                (e.g. wings-node1.example.com) from your cloudflared setup.
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
                <Label htmlFor="node-fqdn">Tunnel Hostname (FQDN)</Label>
                <Input id="node-fqdn" value={fqdn} onChange={(e) => setFqdn(e.target.value)} placeholder="wings-node1.example.com" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="node-token-id">Token ID</Label>
                  <Input id="node-token-id" value={tokenId} onChange={(e) => setTokenId(e.target.value)} placeholder="From Wings config.yml" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="node-token">Token</Label>
                  <Input id="node-token" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="From Wings config.yml" required />
                </div>
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
                  {creating ? "Adding..." : "Add Node"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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
                <TableHead>Name</TableHead>
                <TableHead>Hostname</TableHead>
                <TableHead className="text-right">Memory</TableHead>
                <TableHead className="text-right">Disk</TableHead>
                <TableHead className="text-right">Created</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {nodes.map((node) => (
                <NodeRow key={node.id} node={node} onDelete={() => handleDelete(node.id, node.name)} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function NodeRow({ node, onDelete }: { node: NodeItem; onDelete: () => void }) {
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [checking, setChecking] = useState(false);

  const checkStatus = () => {
    setChecking(true);
    api.get<NodeDetail>(`/nodes/${node.id}`)
      .then(setDetail)
      .finally(() => setChecking(false));
  };

  return (
    <TableRow>
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
      <TableCell className="font-mono text-sm text-muted-foreground">{node.fqdn}</TableCell>
      <TableCell className="text-right text-muted-foreground">{node.memory > 0 ? `${node.memory} MB` : "-"}</TableCell>
      <TableCell className="text-right text-muted-foreground">{node.disk > 0 ? `${node.disk} MB` : "-"}</TableCell>
      <TableCell className="text-right text-muted-foreground text-xs">
        {new Date(node.createdAt).toLocaleDateString()}
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={checkStatus} disabled={checking}>
            {checking ? "..." : "Check"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
