import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@web/components/empty-state";
import { Layout } from "@web/components/layout";
import { PageHeader } from "@web/components/page-header";
import { Alert, AlertDescription } from "@web/components/ui/alert";
import { Badge } from "@web/components/ui/badge";
import { Button } from "@web/components/ui/button";
import { Card } from "@web/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@web/components/ui/dialog";
import { Input } from "@web/components/ui/input";
import { Label } from "@web/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@web/components/ui/select";
import { Separator } from "@web/components/ui/separator";
import { Skeleton } from "@web/components/ui/skeleton";
import { Switch } from "@web/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@web/components/ui/table";
import { api } from "@web/lib/api";
import { Plus, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";

interface UserItem {
  id: string;
  email: string;
  username: string;
  role: string;
  createdAt: string;
  serverCount: number;
}

interface AllocationLimits {
  id: string;
  userId: string;
  cpu: number;
  memory: number;
  disk: number;
  servers: number;
  databases: number;
  backups: number;
  allocations: number;
  allowOverprovision: number;
}

interface PortRange {
  id: string;
  userId: string;
  nodeId: number;
  startPort: number;
  endPort: number;
}

interface AllocationResponse {
  limits: AllocationLimits | null;
  usage: {
    servers: number;
    cpu: number;
    memory: number;
    disk: number;
  };
  portRanges: PortRange[];
}

interface NodeItem {
  id: number;
  name: string;
}

export const Route = createFileRoute("/admin/users")({
  component: UsersPage,
});

function UsersPage() {
  const queryClient = useQueryClient();
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editUsername, setEditUsername] = useState("");

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<UserItem[]>("/users"),
  });

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader backTo="/" title="Users" />

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton className="h-16" key={i} />
            ))}
          </div>
        ) : users?.length ? (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="hidden md:table-cell">Role</TableHead>
                  <TableHead className="hidden text-right md:table-cell">
                    Servers
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{u.username || "-"}</div>
                        <div className="text-muted-foreground text-xs">
                          {u.email}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge
                        variant={
                          u.role === "admin" ? "default" : "secondary"
                        }
                      >
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-right md:table-cell">
                      {u.serverCount}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        onClick={() => {
                          setEditUserId(u.id);
                          setEditUsername(u.username || u.email);
                        }}
                        size="sm"
                        variant="outline"
                      >
                        Allocations
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ) : (
          <EmptyState icon={Users} title="No users found." />
        )}
      </div>

      {editUserId && (
        <AllocationDialog
          onClose={() => {
            setEditUserId(null);
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
          }}
          userId={editUserId}
          username={editUsername}
        />
      )}
    </Layout>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: allocation dialog with port ranges requires many fields
function AllocationDialog({
  userId,
  username,
  onClose,
}: {
  userId: string;
  username: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");

  const [cpu, setCpu] = useState("0");
  const [memory, setMemory] = useState("0");
  const [disk, setDisk] = useState("0");
  const [servers, setServers] = useState("0");
  const [databases, setDatabases] = useState("0");
  const [backups, setBackups] = useState("0");
  const [allocations, setAllocations] = useState("0");
  const [allowOverprovision, setAllowOverprovision] = useState(false);

  // Port range form
  const [portNodeId, setPortNodeId] = useState("");
  const [portStart, setPortStart] = useState("");
  const [portEnd, setPortEnd] = useState("");
  const [portError, setPortError] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["allocations", userId],
    queryFn: () => api.get<AllocationResponse>(`/allocations/${userId}`),
  });

  const { data: nodes } = useQuery({
    queryKey: ["nodes"],
    queryFn: () => api.get<NodeItem[]>("/nodes"),
  });

  // Populate form when data loads
  useEffect(() => {
    if (data?.limits) {
      setCpu(String(data.limits.cpu));
      setMemory(String(data.limits.memory));
      setDisk(String(data.limits.disk));
      setServers(String(data.limits.servers));
      setDatabases(String(data.limits.databases));
      setBackups(String(data.limits.backups));
      setAllocations(String(data.limits.allocations));
      setAllowOverprovision(data.limits.allowOverprovision === 1);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api.put(`/allocations/${userId}`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allocations", userId] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: () => api.delete(`/allocations/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allocations", userId] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  const addPortMutation = useMutation({
    mutationFn: (values: {
      nodeId: number;
      startPort: number;
      endPort: number;
    }) => api.post(`/allocations/${userId}/ports`, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allocations", userId] });
      setPortStart("");
      setPortEnd("");
      setPortError("");
    },
    onError: (err: Error) => setPortError(err.message),
  });

  const deletePortMutation = useMutation({
    mutationFn: (portId: string) =>
      api.delete(`/allocations/${userId}/ports/${portId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allocations", userId] });
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    saveMutation.mutate({
      cpu: Number(cpu),
      memory: Number(memory),
      disk: Number(disk),
      servers: Number(servers),
      databases: Number(databases),
      backups: Number(backups),
      allocations: Number(allocations),
      allowOverprovision,
    });
  };

  const handleAddPort = () => {
    setPortError("");
    const start = Number(portStart);
    const end = Number(portEnd);
    const nodeIdNum = Number(portNodeId);
    if (!nodeIdNum || !start || !end) {
      setPortError("All fields are required");
      return;
    }
    if (start > end) {
      setPortError("Start port must be less than or equal to end port");
      return;
    }
    addPortMutation.mutate({
      nodeId: nodeIdNum,
      startPort: start,
      endPort: end,
    });
  };

  const usage = data?.usage;
  const portRanges = data?.portRanges ?? [];

  // Map node IDs to names for display
  const nodeNameMap = new Map((nodes ?? []).map((n) => [n.id, n.name]));

  return (
    <Dialog onOpenChange={() => onClose()} open>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resource Allocations</DialogTitle>
          <DialogDescription>
            Set resource limits for {username}. Use 0 for unlimited.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSave}>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {usage && (
              <div className="grid grid-cols-3 gap-2 rounded-md bg-muted p-3 text-center text-xs">
                <div>
                  <div className="text-muted-foreground">CPU Used</div>
                  <div className="font-medium">{usage.cpu}%</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Memory Used</div>
                  <div className="font-medium">{usage.memory} MB</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Disk Used</div>
                  <div className="font-medium">{usage.disk} MB</div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="alloc-cpu">CPU (%)</Label>
                <Input
                  id="alloc-cpu"
                  min="0"
                  onChange={(e) => setCpu(e.target.value)}
                  type="number"
                  value={cpu}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="alloc-mem">Memory (MB)</Label>
                <Input
                  id="alloc-mem"
                  min="0"
                  onChange={(e) => setMemory(e.target.value)}
                  type="number"
                  value={memory}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="alloc-disk">Disk (MB)</Label>
                <Input
                  id="alloc-disk"
                  min="0"
                  onChange={(e) => setDisk(e.target.value)}
                  type="number"
                  value={disk}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="alloc-servers">Max Servers</Label>
                <Input
                  id="alloc-servers"
                  min="0"
                  onChange={(e) => setServers(e.target.value)}
                  type="number"
                  value={servers}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="alloc-db">Max Databases</Label>
                <Input
                  id="alloc-db"
                  min="0"
                  onChange={(e) => setDatabases(e.target.value)}
                  type="number"
                  value={databases}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="alloc-backups">Max Backups</Label>
                <Input
                  id="alloc-backups"
                  min="0"
                  onChange={(e) => setBackups(e.target.value)}
                  type="number"
                  value={backups}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="alloc-allocs">Max Extra Allocations</Label>
              <Input
                id="alloc-allocs"
                min="0"
                onChange={(e) => setAllocations(e.target.value)}
                type="number"
                value={allocations}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="font-medium text-sm">
                  Allow Overprovisioning
                </div>
                <p className="text-muted-foreground text-xs">
                  If enabled, the user can exceed limits with a warning instead
                  of being blocked.
                </p>
              </div>
              <Switch
                checked={allowOverprovision}
                onCheckedChange={setAllowOverprovision}
              />
            </div>

            <DialogFooter className="gap-2">
              {data?.limits && (
                <Button
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate()}
                  type="button"
                  variant="destructive"
                >
                  Remove Limits
                </Button>
              )}
              <Button disabled={saveMutation.isPending} type="submit">
                {saveMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {!isLoading && (
          <>
            <Separator />

            <div className="space-y-3">
              <h3 className="font-medium text-sm">Port Ranges</h3>
              <p className="text-muted-foreground text-xs">
                Assign port ranges per node. The user can only create servers
                using ports within their allocated ranges. Ranges cannot overlap
                between users on the same node. If no ranges are set, any port
                is allowed.
              </p>

              {portRanges.length > 0 && (
                <div className="space-y-1">
                  {portRanges.map((pr) => (
                    <div
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                      key={pr.id}
                    >
                      <div>
                        <span className="font-medium">
                          {nodeNameMap.get(pr.nodeId) ?? `Node ${pr.nodeId}`}
                        </span>
                        <span className="ml-2 font-mono text-muted-foreground">
                          {pr.startPort}–{pr.endPort}
                        </span>
                        <span className="ml-1 text-muted-foreground text-xs">
                          ({pr.endPort - pr.startPort + 1}{" "}
                          {pr.endPort - pr.startPort + 1 === 1
                            ? "port"
                            : "ports"}
                          )
                        </span>
                      </div>
                      <Button
                        disabled={deletePortMutation.isPending}
                        onClick={() => deletePortMutation.mutate(pr.id)}
                        size="icon"
                        variant="ghost"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {portError && (
                <Alert variant="destructive">
                  <AlertDescription>{portError}</AlertDescription>
                </Alert>
              )}

              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <Label className="text-xs">Node</Label>
                  <Select onValueChange={setPortNodeId} value={portNodeId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Node..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(nodes ?? []).map((n) => (
                        <SelectItem key={n.id} value={String(n.id)}>
                          {n.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-24 space-y-1">
                  <Label className="text-xs">Start</Label>
                  <Input
                    className="h-8 text-xs"
                    max="65535"
                    min="1"
                    onChange={(e) => setPortStart(e.target.value)}
                    placeholder="25565"
                    type="number"
                    value={portStart}
                  />
                </div>
                <div className="w-24 space-y-1">
                  <Label className="text-xs">End</Label>
                  <Input
                    className="h-8 text-xs"
                    max="65535"
                    min="1"
                    onChange={(e) => setPortEnd(e.target.value)}
                    placeholder="25575"
                    type="number"
                    value={portEnd}
                  />
                </div>
                <Button
                  className="h-8"
                  disabled={addPortMutation.isPending}
                  onClick={handleAddPort}
                  size="sm"
                  type="button"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
