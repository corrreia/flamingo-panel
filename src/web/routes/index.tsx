import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { EmptyState } from "@web/components/empty-state";
import { Layout } from "@web/components/layout";
import { Badge } from "@web/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@web/components/ui/card";
import { Skeleton } from "@web/components/ui/skeleton";
import { api } from "@web/lib/api";
import { Cpu, HardDrive, MemoryStick, Network, Server } from "lucide-react";

interface ServerItem {
  containerStatus: string | null;
  cpu: number;
  disk: number;
  id: string;
  memory: number;
  name: string;
  role: "admin" | "owner" | "subuser";
  status: string | null;
  uuid: string;
}

interface AllocationLimits {
  cpu: number;
  memory: number;
  disk: number;
  servers: number;
  allowOverprovision: number;
}

interface PortRange {
  id: string;
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

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function getStatusVariant(
  s: ServerItem
): "default" | "destructive" | "secondary" {
  if (s.containerStatus === "running") {
    return "default";
  }
  if (s.status === "install_failed") {
    return "destructive";
  }
  return "secondary";
}

function getStatusLabel(s: ServerItem): string {
  if (s.status === "installing") {
    return "Installing";
  }
  if (s.status === "install_failed") {
    return "Install Failed";
  }
  return s.containerStatus || "offline";
}

function UsageBar({
  label,
  icon,
  used,
  limit,
  unit,
}: {
  label: string;
  icon: React.ReactNode;
  used: number;
  limit: number;
  unit: string;
}) {
  const unlimited = limit === 0;
  const percent = unlimited ? 0 : Math.min((used / limit) * 100, 100);
  const overprovisioned = !unlimited && used > limit;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className="font-medium">
          {used}
          {unit} / {unlimited ? "Unlimited" : `${limit}${unit}`}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${
            overprovisioned
              ? "bg-destructive"
              : percent > 80
                ? "bg-yellow-500"
                : "bg-primary"
          }`}
          style={{ width: unlimited ? "0%" : `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

function ResourceUsageCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-allocations"],
    queryFn: () => api.get<AllocationResponse>("/allocations/me"),
  });

  // Don't show anything if no limits and no port ranges are set
  if (isLoading || (!data?.limits && (!data?.portRanges || data.portRanges.length === 0))) {
    return null;
  }

  const { limits, usage, portRanges } = data;

  // Group port ranges by nodeId
  const portsByNode = new Map<number, PortRange[]>();
  for (const pr of portRanges) {
    const existing = portsByNode.get(pr.nodeId) ?? [];
    existing.push(pr);
    portsByNode.set(pr.nodeId, existing);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Resource Usage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {limits && (
          <>
            <UsageBar
              icon={<Server className="h-3.5 w-3.5" />}
              label="Servers"
              limit={limits.servers}
              unit=""
              used={usage.servers}
            />
            <UsageBar
              icon={<Cpu className="h-3.5 w-3.5" />}
              label="CPU"
              limit={limits.cpu}
              unit="%"
              used={usage.cpu}
            />
            <UsageBar
              icon={<MemoryStick className="h-3.5 w-3.5" />}
              label="Memory"
              limit={limits.memory}
              unit=" MB"
              used={usage.memory}
            />
            <UsageBar
              icon={<HardDrive className="h-3.5 w-3.5" />}
              label="Disk"
              limit={limits.disk}
              unit=" MB"
              used={usage.disk}
            />
            {limits.allowOverprovision === 1 && (
              <p className="text-muted-foreground text-xs">
                Overprovisioning is enabled — you may exceed limits with a
                warning.
              </p>
            )}
          </>
        )}
        {portRanges.length > 0 && (
          <div className="space-y-1 pt-1">
            <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
              <Network className="h-3.5 w-3.5" />
              Assigned Ports
            </div>
            <div className="flex flex-wrap gap-1.5">
              {portRanges.map((pr) => (
                <span
                  className="rounded bg-muted px-2 py-0.5 font-mono text-xs"
                  key={pr.id}
                >
                  {pr.startPort === pr.endPort
                    ? pr.startPort
                    : `${pr.startPort}–${pr.endPort}`}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DashboardPage() {
  const { data: servers, isLoading } = useQuery({
    queryKey: ["servers"],
    queryFn: () => api.get<ServerItem[]>("/servers"),
    refetchInterval: 15_000,
  });

  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="font-bold text-2xl tracking-tight">Your Servers</h1>
        <ResourceUsageCard />
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-20" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {servers?.map((s) => (
              <Link
                key={s.id}
                params={{ serverId: s.id }}
                to="/server/$serverId"
              >
                <Card className="cursor-pointer transition-colors hover:border-primary/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Server className="h-4 w-4 text-primary" />
                        {s.name}
                      </CardTitle>
                      <div className="flex gap-2">
                        {s.role === "subuser" && (
                          <Badge className="text-xs" variant="outline">
                            Shared
                          </Badge>
                        )}
                        <Badge variant={getStatusVariant(s)}>
                          {getStatusLabel(s)}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-4 text-muted-foreground text-sm">
                      <span className="flex items-center gap-1">
                        <MemoryStick className="h-3 w-3" /> {s.memory} MB
                      </span>
                      <span className="flex items-center gap-1">
                        <Cpu className="h-3 w-3" /> {s.cpu}%
                      </span>
                      <span className="flex items-center gap-1">
                        <HardDrive className="h-3 w-3" /> {s.disk} MB
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
            {servers?.length === 0 && (
              <EmptyState
                className="col-span-full"
                icon={Server}
                title="No servers yet."
              />
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
