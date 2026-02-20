import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Layout } from "@web/components/layout";
import { Badge } from "@web/components/ui/badge";
import { Button } from "@web/components/ui/button";
import { Card } from "@web/components/ui/card";
import { Input } from "@web/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@web/components/ui/select";
import { Skeleton } from "@web/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@web/components/ui/table";
import { api } from "@web/lib/api";
import { ArrowLeft, ClipboardList, X } from "lucide-react";
import { useState } from "react";

interface ActivityEntry {
  id: number;
  event: string;
  metadata: string | null;
  ip: string | null;
  createdAt: string;
  userId: string | null;
  userName: string | null;
  serverId: string | null;
  serverName: string | null;
  nodeId: number | null;
  nodeName: string | null;
}

interface ActivityResponse {
  data: ActivityEntry[];
  meta: { page: number; perPage: number; total: number };
}

interface ServerItem {
  id: string;
  name: string;
}

interface NodeItem {
  id: number;
  name: string;
}

interface UserItem {
  id: string;
  username: string;
  email: string;
}

export const Route = createFileRoute("/admin/activity")({
  component: ActivityLogPage,
});

function ActivityLogPage() {
  const [page, setPage] = useState(0);
  const [serverId, setServerId] = useState<string>("");
  const [nodeId, setNodeId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [event, setEvent] = useState("");

  // Fetch filter options
  const { data: servers } = useQuery({
    queryKey: ["servers"],
    queryFn: () => api.get<ServerItem[]>("/servers"),
  });

  const { data: nodes } = useQuery({
    queryKey: ["nodes"],
    queryFn: () => api.get<NodeItem[]>("/nodes"),
  });

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<UserItem[]>("/users"),
  });

  // Build query string
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("per_page", "50");
  if (serverId) { params.set("server_id", serverId); }
  if (nodeId) { params.set("node_id", nodeId); }
  if (userId) { params.set("user_id", userId); }
  if (event) { params.set("event", event); }

  const { data, isLoading } = useQuery({
    queryKey: ["admin-activity", page, serverId, nodeId, userId, event],
    queryFn: () =>
      api.get<ActivityResponse>(`/activity?${params.toString()}`),
  });

  const hasFilters = serverId || nodeId || userId || event;

  const clearFilters = () => {
    setServerId("");
    setNodeId("");
    setUserId("");
    setEvent("");
    setPage(0);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button asChild size="sm" variant="ghost">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="font-bold text-2xl">Activity Log</h1>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={serverId}
            onValueChange={(v) => { setServerId(v); setPage(0); }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All servers" />
            </SelectTrigger>
            <SelectContent>
              {servers?.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={nodeId}
            onValueChange={(v) => { setNodeId(v); setPage(0); }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All nodes" />
            </SelectTrigger>
            <SelectContent>
              {nodes?.map((n) => (
                <SelectItem key={n.id} value={String(n.id)}>
                  {n.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={userId}
            onValueChange={(v) => { setUserId(v); setPage(0); }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All users" />
            </SelectTrigger>
            <SelectContent>
              {users?.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.username || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            className="w-48"
            placeholder="Filter by event..."
            value={event}
            onChange={(e) => { setEvent(e.target.value); setPage(0); }}
          />

          {hasFilters && (
            <Button size="sm" variant="ghost" onClick={clearFilters}>
              <X className="mr-1 h-4 w-4" /> Clear
            </Button>
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton className="h-10" key={i} />
            ))}
          </div>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Server</TableHead>
                  <TableHead>Node</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {entry.event}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {entry.serverName ? (
                        <Link
                          className="text-primary hover:underline"
                          to="/server/$serverId"
                          params={{ serverId: entry.serverId! }}
                        >
                          {entry.serverName}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.nodeName || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.userName || entry.userId || "System"}
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground text-xs">
                      {entry.ip || "-"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-xs">
                      {new Date(entry.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
                {data?.data.length === 0 && (
                  <TableRow>
                    <TableCell
                      className="py-8 text-center text-muted-foreground"
                      colSpan={6}
                    >
                      <ClipboardList className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
                      No activity logs found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {data && data.meta.total > data.meta.perPage && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <span className="text-muted-foreground text-sm">
                  {data.meta.total} entries — Page {data.meta.page + 1} of{" "}
                  {Math.ceil(data.meta.total / data.meta.perPage)}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      (page + 1) * data.meta.perPage >= data.meta.total
                    }
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </Layout>
  );
}
