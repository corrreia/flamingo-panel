import { useEffect, useState } from "react";
import { api } from "@web/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card";
import { Button } from "@web/components/ui/button";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@web/components/ui/select";
import { Alert, AlertDescription } from "@web/components/ui/alert";
import { Skeleton } from "@web/components/ui/skeleton";
import { ArrowLeft, Server, ChevronRight } from "lucide-react";

interface UserItem { id: string; email: string; username: string; role: string; }
interface NodeItem { id: number; name: string; url: string; memory: number; disk: number; }
interface EggItem { id: string; name: string; dockerImage: string; startup: string; }
interface EggVariable {
  id: string; name: string; description: string | null;
  envVariable: string; defaultValue: string | null;
  userViewable: number; userEditable: number; rules: string;
}
interface EggDetail extends EggItem { variables: EggVariable[]; }

export function CreateServerPage() {
  const [step, setStep] = useState(0);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [eggs, setEggs] = useState<EggItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [nodeId, setNodeId] = useState("");
  const [eggId, setEggId] = useState("");
  const [memory, setMemory] = useState("512");
  const [cpu, setCpu] = useState("100");
  const [disk, setDisk] = useState("1024");
  const [port, setPort] = useState("25565");
  const [eggDetail, setEggDetail] = useState<EggDetail | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      api.get<UserItem[]>("/users"),
      api.get<NodeItem[]>("/nodes"),
      api.get<EggItem[]>("/eggs"),
    ]).then(([u, n, e]) => {
      setUsers(u);
      setNodes(n);
      setEggs(e);
    }).finally(() => setLoading(false));
  }, []);

  // Load egg variables when egg changes
  useEffect(() => {
    if (!eggId) { setEggDetail(null); return; }
    api.get<EggDetail>(`/eggs/${eggId}`).then((detail) => {
      setEggDetail(detail);
      const defaults: Record<string, string> = {};
      for (const v of detail.variables) {
        defaults[v.envVariable] = v.defaultValue || "";
      }
      setVariables(defaults);
    });
  }, [eggId]);

  const handleCreate = async () => {
    setError("");
    setCreating(true);
    try {
      await api.post("/servers", {
        name,
        description: description || undefined,
        ownerId,
        nodeId: parseInt(nodeId),
        eggId,
        memory: parseInt(memory),
        cpu: parseInt(cpu),
        disk: parseInt(disk),
        defaultAllocationPort: parseInt(port),
        variables,
      });
      window.location.href = "/";
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-96" /></div>;
  }

  const steps = [
    { label: "Basics", valid: !!name && !!ownerId },
    { label: "Node & Egg", valid: !!nodeId && !!eggId },
    { label: "Resources", valid: true },
    { label: "Variables", valid: true },
    { label: "Review", valid: true },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <a href="/"><ArrowLeft className="h-4 w-4" /></a>
        </Button>
        <h1 className="text-2xl font-bold">Create Server</h1>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            {i > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <button
              onClick={() => setStep(i)}
              className={`text-sm px-3 py-1 rounded-full transition-colors ${
                i === step
                  ? "bg-primary text-primary-foreground"
                  : i < step
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {s.label}
            </button>
          </div>
        ))}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Step 0: Basics */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="srv-name">Server Name</Label>
              <Input id="srv-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Minecraft Server" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="srv-desc">Description (optional)</Label>
              <Input id="srv-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A survival server" />
            </div>
            <div className="space-y-2">
              <Label>Owner</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user..." />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.username} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setStep(1)} disabled={!steps[0].valid}>Next</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Node & Egg */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Node & Egg</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Node</Label>
              {nodes.length === 0 ? (
                <Alert>
                  <AlertDescription>
                    No nodes available. <a href="/admin/nodes" className="underline text-primary">Add a node first.</a>
                  </AlertDescription>
                </Alert>
              ) : (
                <Select value={nodeId} onValueChange={setNodeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a node..." />
                  </SelectTrigger>
                  <SelectContent>
                    {nodes.map((n) => (
                      <SelectItem key={n.id} value={String(n.id)}>
                        {n.name} {n.url ? `(${n.url})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <Label>Egg</Label>
              {eggs.length === 0 ? (
                <Alert>
                  <AlertDescription>
                    No eggs available. <a href="/admin/eggs" className="underline text-primary">Import an egg first.</a>
                  </AlertDescription>
                </Alert>
              ) : (
                <Select value={eggId} onValueChange={setEggId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an egg..." />
                  </SelectTrigger>
                  <SelectContent>
                    {eggs.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep(0)}>Back</Button>
              <Button onClick={() => setStep(2)} disabled={!steps[1].valid}>Next</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Resources */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resource Limits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="srv-memory">Memory (MB)</Label>
                <Input id="srv-memory" type="number" value={memory} onChange={(e) => setMemory(e.target.value)} min="64" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="srv-cpu">CPU Limit (%)</Label>
                <Input id="srv-cpu" type="number" value={cpu} onChange={(e) => setCpu(e.target.value)} min="10" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="srv-disk">Disk (MB)</Label>
                <Input id="srv-disk" type="number" value={disk} onChange={(e) => setDisk(e.target.value)} min="128" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="srv-port">Primary Port</Label>
                <Input id="srv-port" type="number" value={port} onChange={(e) => setPort(e.target.value)} min="1" max="65535" />
              </div>
            </div>
            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)}>Next</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Variables */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Egg Variables</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!eggDetail || eggDetail.variables.length === 0 ? (
              <p className="text-muted-foreground text-sm">No variables for this egg.</p>
            ) : (
              eggDetail.variables.map((v) => (
                <div key={v.id} className="space-y-1">
                  <Label htmlFor={`var-${v.envVariable}`}>{v.name}</Label>
                  {v.description && (
                    <p className="text-xs text-muted-foreground">{v.description}</p>
                  )}
                  <Input
                    id={`var-${v.envVariable}`}
                    value={variables[v.envVariable] || ""}
                    onChange={(e) => setVariables({ ...variables, [v.envVariable]: e.target.value })}
                    placeholder={v.defaultValue || ""}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground font-mono">{v.envVariable}</p>
                </div>
              ))
            )}
            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={() => setStep(4)}>Next</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Review */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review & Create</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Name:</span>
                <span className="ml-2 font-medium">{name}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Owner:</span>
                <span className="ml-2 font-medium">{users.find(u => u.id === ownerId)?.username || "-"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Node:</span>
                <span className="ml-2 font-medium">{nodes.find(n => String(n.id) === nodeId)?.name || "-"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Egg:</span>
                <span className="ml-2 font-medium">{eggs.find(e => e.id === eggId)?.name || "-"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Memory:</span>
                <span className="ml-2 font-medium">{memory} MB</span>
              </div>
              <div>
                <span className="text-muted-foreground">CPU:</span>
                <span className="ml-2 font-medium">{cpu}%</span>
              </div>
              <div>
                <span className="text-muted-foreground">Disk:</span>
                <span className="ml-2 font-medium">{disk} MB</span>
              </div>
              <div>
                <span className="text-muted-foreground">Port:</span>
                <span className="ml-2 font-medium">{port}</span>
              </div>
            </div>
            {eggDetail && eggDetail.variables.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-2">Variables</h3>
                <div className="space-y-1">
                  {eggDetail.variables.map((v) => (
                    <div key={v.id} className="flex text-xs font-mono">
                      <span className="text-muted-foreground w-48">{v.envVariable}:</span>
                      <span>{variables[v.envVariable] || v.defaultValue || "(empty)"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-between pt-4">
              <Button variant="secondary" onClick={() => setStep(3)}>Back</Button>
              <Button onClick={handleCreate} disabled={creating || !name || !ownerId || !nodeId || !eggId}>
                <Server className="h-4 w-4 mr-2" />
                {creating ? "Creating..." : "Create Server"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
