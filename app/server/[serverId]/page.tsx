"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@web/components/layout";
import { PageHeader } from "@web/components/page-header";
import { ActivityTab } from "@web/components/server/activity-tab";
import { ConsoleTab } from "@web/components/server/console-tab";
import { FilesTab } from "@web/components/server/files-tab";
import { PowerControls } from "@web/components/server/power-controls";
import { SettingsTab } from "@web/components/server/settings-tab";
import { StatCard } from "@web/components/stat-card";
import { Badge } from "@web/components/ui/badge";
import { Button } from "@web/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@web/components/ui/card";
import { Input } from "@web/components/ui/input";
import { Skeleton } from "@web/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@web/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@web/components/ui/tabs";
import { api } from "@web/lib/api";
import { formatBytes } from "@web/lib/format";
import {
  ClipboardList,
  Cpu,
  FolderOpen,
  HardDrive,
  MemoryStick,
  Settings,
  Terminal,
  Trash2,
  Users,
  Wifi,
} from "lucide-react";
import { useState } from "react";

interface ServerDetail {
  containerStatus: string | null;
  cpu: number;
  disk: number;
  id: string;
  memory: number;
  name: string;
  resources?: {
    state: string;
    utilization: {
      memory_bytes: number;
      memory_limit_bytes: number;
      cpu_absolute: number;
      network: { rx_bytes: number; tx_bytes: number };
      uptime: number;
      disk_bytes: number;
      state: string;
    };
  } | null;
  role: "admin" | "owner" | "subuser";
  status: string | null;
  uuid: string;
}

/**
 * Selects a UI badge variant representing the server's operational status.
 *
 * @param s - The server detail used to determine the status variant
 * @returns `default` if the server is running, `destructive` if the server's status is `install_failed`, `secondary` otherwise
 */
function getStatusVariant(
  s: ServerDetail
): "default" | "destructive" | "secondary" {
  if (s.containerStatus === "running" || s.resources?.state === "running") {
    return "default";
  }
  if (s.status === "install_failed") {
    return "destructive";
  }
  return "secondary";
}

/**
 * Compute a human-readable status label for a server.
 *
 * @param s - The server detail object used to determine the label
 * @returns `Installing` if `s.status` is `"installing"`, `Install Failed` if `s.status` is `"install_failed"`, otherwise `s.containerStatus` if present, else `s.resources?.state` if present, else `"offline"`
 */
function getStatusLabel(s: ServerDetail): string {
  if (s.status === "installing") {
    return "Installing";
  }
  if (s.status === "install_failed") {
    return "Install Failed";
  }
  return s.containerStatus || s.resources?.state || "offline";
}

/**
 * Renders the server dashboard page for a given server, including status badge, resource utilization, and tabbed sections (Console, Files, Activity, Settings, Users).
 *
 * Fetches server details and updates them every 10 seconds; shows loading and "Server not found." states when appropriate. Management-only tabs (Settings, Users) are shown for users with role "owner" or "admin".
 *
 * @param params - Route parameters object
 * @param params.serverId - The ID of the server to display
 * @returns The React element rendering the server dashboard for the specified server
 */
export default function ServerPage({ params }: { params: { serverId: string } }) {
  const { serverId } = params;

  const { data: server, isLoading } = useQuery({
    queryKey: ["server", serverId],
    queryFn: () => api.get<ServerDetail>(`/servers/${serverId}`),
    refetchInterval: 10_000,
  });

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

  if (!server) {
    return (
      <Layout>
        <div className="text-muted-foreground">Server not found.</div>
      </Layout>
    );
  }

  const canManage = server.role === "owner" || server.role === "admin";

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          actions={
            <PowerControls
              serverId={server.id}
              state={server.resources?.state || "offline"}
            />
          }
          backTo="/"
          title={server.name}
        >
          <Badge variant={getStatusVariant(server)}>
            {getStatusLabel(server)}
          </Badge>
        </PageHeader>

        {server.resources?.utilization && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            <StatCard
              icon={<Cpu className="h-4 w-4" />}
              label="CPU"
              value={`${server.resources.utilization.cpu_absolute.toFixed(1)}%`}
            />
            <StatCard
              icon={<MemoryStick className="h-4 w-4" />}
              label="Memory"
              value={formatBytes(server.resources.utilization.memory_bytes)}
            />
            <StatCard
              icon={<HardDrive className="h-4 w-4" />}
              label="Disk"
              value={formatBytes(server.resources.utilization.disk_bytes)}
            />
            <StatCard
              icon={<Wifi className="h-4 w-4" />}
              label="Network"
              value={`${formatBytes(server.resources.utilization.network.rx_bytes)} / ${formatBytes(server.resources.utilization.network.tx_bytes)}`}
            />
          </div>
        )}

        <Tabs defaultValue="console">
          <TabsList>
            <TabsTrigger value="console">
              <Terminal className="mr-2 h-4 w-4" /> Console
            </TabsTrigger>
            <TabsTrigger value="files">
              <FolderOpen className="mr-2 h-4 w-4" /> Files
            </TabsTrigger>
            {canManage && (
              <TabsTrigger value="settings">
                <Settings className="mr-2 h-4 w-4" /> Settings
              </TabsTrigger>
            )}
            <TabsTrigger value="activity">
              <ClipboardList className="mr-2 h-4 w-4" /> Activity
            </TabsTrigger>
            {canManage && (
              <TabsTrigger value="users">
                <Users className="mr-2 h-4 w-4" /> Users
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="console">
            <ConsoleTab serverId={server.id} />
          </TabsContent>
          <TabsContent value="files">
            <FilesTab serverId={server.id} />
          </TabsContent>
          {canManage && (
            <TabsContent value="settings">
              <SettingsTab serverId={server.id} serverName={server.name} />
            </TabsContent>
          )}
          <TabsContent value="activity">
            <ActivityTab serverId={server.id} />
          </TabsContent>
          {canManage && (
            <TabsContent value="users">
              <UsersTab serverId={server.id} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </Layout>
  );
}

interface SubuserItem {
  createdAt: string;
  email: string;
  id: string;
  userId: string;
  username: string;
}

function UsersTab({ serverId }: { serverId: string }) {
  const queryClient = useQueryClient();
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState("");

  const { data: subusers, isLoading } = useQuery({
    queryKey: ["server-subusers", serverId],
    queryFn: () => api.get<SubuserItem[]>(`/servers/${serverId}/subusers`),
  });

  const addMutation = useMutation({
    mutationFn: (id: string) => {
      const isEmail = id.includes("@");
      return api.post(
        `/servers/${serverId}/subusers`,
        isEmail ? { email: id } : { username: id }
      );
    },
    onSuccess: () => {
      setIdentifier("");
      setError("");
      queryClient.invalidateQueries({
        queryKey: ["server-subusers", serverId],
      });
    },
    onError: (err: Error) => setError(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: (subuserId: string) =>
      api.delete(`/servers/${serverId}/subusers/${subuserId}`),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["server-subusers", serverId],
      }),
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (identifier.trim()) {
      addMutation.mutate(identifier.trim());
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Shared Users</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="flex gap-2" onSubmit={handleAdd}>
          <Input
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="Email or username"
            value={identifier}
          />
          <Button
            disabled={addMutation.isPending || !identifier.trim()}
            type="submit"
          >
            {addMutation.isPending ? "Adding..." : "Add"}
          </Button>
        </form>
        {error && <p className="text-destructive text-sm">{error}</p>}
        {isLoading && <Skeleton className="h-20" />}
        {!isLoading && subusers?.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="hidden sm:table-cell">Added</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {subusers.map((su) => (
                <TableRow key={su.id}>
                  <TableCell className="font-medium">
                    {su.username || "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {su.email}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground text-xs sm:table-cell">
                    {new Date(su.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      className="text-destructive hover:text-destructive"
                      disabled={removeMutation.isPending}
                      onClick={() => removeMutation.mutate(su.id)}
                      size="sm"
                      variant="ghost"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
        {!(isLoading || subusers?.length) && (
          <p className="py-4 text-center text-muted-foreground text-sm">
            No users have been added to this server yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
