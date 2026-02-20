import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@web/lib/api";
import { Layout } from "@web/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card";
import { Badge } from "@web/components/ui/badge";
import { Skeleton } from "@web/components/ui/skeleton";
import { Server, Cpu, HardDrive, MemoryStick } from "lucide-react";

interface ServerItem {
  id: string;
  name: string;
  uuid: string;
  status: string | null;
  memory: number;
  cpu: number;
  disk: number;
}

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data: servers, isLoading } = useQuery({
    queryKey: ["servers"],
    queryFn: () => api.get<ServerItem[]>("/servers"),
  });

  return (
    <Layout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Your Servers</h1>
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
              <Link key={s.id} to="/server/$serverId" params={{ serverId: s.id }}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Server className="h-4 w-4 text-primary" />
                        {s.name}
                      </CardTitle>
                      <Badge variant={s.status === null ? "default" : "secondary"}>
                        {s.status || "Active"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-4 text-sm text-muted-foreground">
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
              <Card className="col-span-full">
                <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Server className="h-12 w-12 mb-4 text-primary/30" />
                  <p>No servers yet.</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
