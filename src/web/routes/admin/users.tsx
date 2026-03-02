import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Cpu, HardDrive, MemoryStick, Server, Users } from "lucide-react";
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

interface AllocationResponse {
  limits: AllocationLimits | null;
  usage: {
    servers: number;
    cpu: number;
    memory: number;
    disk: number;
  };
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

  const { data, isLoading } = useQuery({
    queryKey: ["allocations", userId],
    queryFn: () => api.get<AllocationResponse>(`/allocations/${userId}`),
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

  const usage = data?.usage;

  return (
    <Dialog onOpenChange={() => onClose()} open>
      <DialogContent className="max-w-lg">
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
      </DialogContent>
    </Dialog>
  );
}
