import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Layout } from "@web/components/layout";
import { ActivityTab } from "@web/components/server/activity-tab";
import { ConsoleTab } from "@web/components/server/console-tab";
import { FilesTab } from "@web/components/server/files-tab";
import { PowerControls } from "@web/components/server/power-controls";
import { SettingsTab } from "@web/components/server/settings-tab";
import { StatCard } from "@web/components/stat-card";
import { Badge } from "@web/components/ui/badge";
import { Button } from "@web/components/ui/button";
import { Skeleton } from "@web/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@web/components/ui/tabs";
import { api } from "@web/lib/api";
import { formatBytes } from "@web/lib/format";
import {
  ArrowLeft,
  ClipboardList,
  Cpu,
  FolderOpen,
  HardDrive,
  MemoryStick,
  Settings,
  Terminal,
  Wifi,
} from "lucide-react";

interface ServerDetail {
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
  status: string | null;
  uuid: string;
}

export const Route = createFileRoute("/server/$serverId")({
  component: ServerPage,
});

function ServerPage() {
  const { serverId } = Route.useParams();

  const { data: server, isLoading } = useQuery({
    queryKey: ["server", serverId],
    queryFn: () => api.get<ServerDetail>(`/servers/${serverId}`),
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

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button asChild size="sm" variant="ghost">
              <Link to="/">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="font-bold text-2xl">{server.name}</h1>
            <Badge
              variant={
                server.resources?.state === "running" ? "default" : "secondary"
              }
            >
              {server.resources?.state || server.status || "offline"}
            </Badge>
          </div>
          <PowerControls
            serverId={server.id}
            state={server.resources?.state || "offline"}
          />
        </div>

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
          <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
            <TabsList>
              <TabsTrigger value="console">
                <Terminal className="mr-2 h-4 w-4" /> Console
              </TabsTrigger>
              <TabsTrigger value="files">
                <FolderOpen className="mr-2 h-4 w-4" /> Files
              </TabsTrigger>
              <TabsTrigger value="settings">
                <Settings className="mr-2 h-4 w-4" /> Settings
              </TabsTrigger>
              <TabsTrigger value="activity">
                <ClipboardList className="mr-2 h-4 w-4" /> Activity
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="console">
            <ConsoleTab serverId={server.id} />
          </TabsContent>
          <TabsContent value="files">
            <FilesTab serverId={server.id} />
          </TabsContent>
          <TabsContent value="settings">
            <SettingsTab serverId={server.id} serverName={server.name} />
          </TabsContent>
          <TabsContent value="activity">
            <ActivityTab serverId={server.id} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
