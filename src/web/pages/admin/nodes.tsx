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
  Key, Copy, Globe, Check,
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

interface CreatedNode extends NodeItem {
  configureCommand: string;
}

export function NodesPage() {
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [apiTokenDialogOpen, setApiTokenDialogOpen] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdNode, setCreatedNode] = useState<CreatedNode | null>(null);

  // Create form state
  const [name, setName] = useState("");
  const [memory, setMemory] = useState("0");
  const [disk, setDisk] = useState("0");

  // API token state
  const [apiToken, setApiToken] = useState("");
  const [generatingToken, setGeneratingToken] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);

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
        memory: parseInt(memory) || 0,
        disk: parseInt(disk) || 0,
      });
      setCreatedNode(result);
      setDialogOpen(false);
      setResultDialogOpen(true);
      setName(""); setMemory("0"); setDisk("0");
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

  const handleGenerateApiToken = async () => {
    setGeneratingToken(true);
    try {
      const result = await api.post<{ token: string; identifier: string }>("/auth/api-keys", {
        memo: "Wings configure token",
      });
      setApiToken(result.token);
      setTokenCopied(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setGeneratingToken(false);
    }
  };

  const copyToClipboard = (text: string, setCopied?: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    if (setCopied) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
        <div className="flex gap-2">
          {/* Generate API Token */}
          <Dialog open={apiTokenDialogOpen} onOpenChange={(open) => {
            setApiTokenDialogOpen(open);
            if (!open) setApiToken("");
          }}>
            <DialogTrigger asChild>
              <Button variant="outline"><Key className="h-4 w-4 mr-2" /> API Token</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Application API Token</DialogTitle>
                <DialogDescription>
                  Generate a token for <code>wings configure --token</code>. This token is only shown once.
                </DialogDescription>
              </DialogHeader>
              {apiToken ? (
                <div className="space-y-3">
                  <Alert>
                    <AlertDescription className="font-mono text-xs break-all select-all">
                      {apiToken}
                    </AlertDescription>
                  </Alert>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => copyToClipboard(apiToken, setTokenCopied)}>
                    {tokenCopied ? <><Check className="h-4 w-4 mr-2" /> Copied</> : <><Copy className="h-4 w-4 mr-2" /> Copy Token</>}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Save this token now. It cannot be retrieved later.
                  </p>
                </div>
              ) : (
                <DialogFooter>
                  <Button onClick={handleGenerateApiToken} disabled={generatingToken}>
                    {generatingToken ? "Generating..." : "Generate Token"}
                  </Button>
                </DialogFooter>
              )}
            </DialogContent>
          </Dialog>

          {/* Add Node */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Add Node</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Node</DialogTitle>
                <DialogDescription>
                  Create a node and get the <code>wings configure</code> command.
                  The tunnel hostname can be set later after cloudflared is running.
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
      </div>

      {/* Result dialog after node creation */}
      <Dialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Node Created</DialogTitle>
            <DialogDescription>
              Run this on your Wings machine to auto-configure it. Replace <code>&lt;APP_API_TOKEN&gt;</code> with your API token.
            </DialogDescription>
          </DialogHeader>
          {createdNode && (
            <div className="space-y-3">
              <div className="rounded-md bg-muted p-3 font-mono text-xs break-all select-all">
                {createdNode.configureCommand}
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={() => copyToClipboard(createdNode.configureCommand)}>
                <Copy className="h-4 w-4 mr-2" /> Copy Command
              </Button>
              <p className="text-xs text-muted-foreground">
                After Wings connects, set up cloudflared and paste the tunnel hostname on this node.
              </p>
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
                <TableHead>Name</TableHead>
                <TableHead>Hostname</TableHead>
                <TableHead className="text-right">Memory</TableHead>
                <TableHead className="text-right">Disk</TableHead>
                <TableHead className="text-right">Created</TableHead>
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
  const [fqdnDialogOpen, setFqdnDialogOpen] = useState(false);
  const [fqdn, setFqdn] = useState(node.fqdn);
  const [saving, setSaving] = useState(false);

  const checkStatus = () => {
    setChecking(true);
    api.get<NodeDetail>(`/nodes/${node.id}`)
      .then(setDetail)
      .finally(() => setChecking(false));
  };

  const handleSetFqdn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/nodes/${node.id}`, { fqdn });
      setFqdnDialogOpen(false);
      onUpdate();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
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
      <TableCell>
        {node.fqdn ? (
          <span className="font-mono text-sm text-muted-foreground">{node.fqdn}</span>
        ) : (
          <Dialog open={fqdnDialogOpen} onOpenChange={setFqdnDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs">
                <Globe className="h-3 w-3 mr-1" /> Set Hostname
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Set Tunnel Hostname</DialogTitle>
                <DialogDescription>
                  Enter the cloudflared tunnel hostname for node "{node.name}".
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSetFqdn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fqdn-input">Tunnel Hostname</Label>
                  <Input id="fqdn-input" value={fqdn} onChange={(e) => setFqdn(e.target.value)} placeholder="wings-node1.example.com" required />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </TableCell>
      <TableCell className="text-right text-muted-foreground">{node.memory > 0 ? `${node.memory} MB` : "-"}</TableCell>
      <TableCell className="text-right text-muted-foreground">{node.disk > 0 ? `${node.disk} MB` : "-"}</TableCell>
      <TableCell className="text-right text-muted-foreground text-xs">
        {new Date(node.createdAt).toLocaleDateString()}
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          {node.fqdn && (
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
