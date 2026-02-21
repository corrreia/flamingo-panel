import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Layout } from "@web/components/layout";
import { PageHeader } from "@web/components/page-header";
import { TablePagination } from "@web/components/table-pagination";
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
import { ClipboardList, X } from "lucide-react";
import { useState } from "react";

interface ActivityEntry {
  createdAt: string;
  event: string;
  id: number;
  ip: string | null;
  metadata: string | null;
  nodeId: number | null;
  nodeName: string | null;
  serverId: string | null;
  serverName: string | null;
  userId: string | null;
  userName: string | null;
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
  email: string;
  id: string;
  username: string;
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
  if (serverId) {
    params.set("server_id", serverId);
  }
  if (nodeId) {
    params.set("node_id", nodeId);
  }
  if (userId) {
    params.set("user_id", userId);
  }
  if (event) {
    params.set("event", event);
  }

  const { data, isLoading } = useQuery({
    queryKey: ["admin-activity", page, serverId, nodeId, userId, event],
    queryFn: () => api.get<ActivityResponse>(`/activity?${params.toString()}`),
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
        <PageHeader backTo="/" title="Activity Log" />

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <Select
            onValueChange={(v) => {
              setServerId(v);
              setPage(0);
            }}
            value={serverId}
          >
            <SelectTrigger className="w-full sm:w-48">
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
            onValueChange={(v) => {
              setNodeId(v);
              setPage(0);
            }}
            value={nodeId}
          >
            <SelectTrigger className="w-full sm:w-48">
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
            onValueChange={(v) => {
              setUserId(v);
              setPage(0);
            }}
            value={userId}
          >
            <SelectTrigger className="w-full sm:w-48">
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
            className="w-full sm:w-48"
            onChange={(e) => {
              setEvent(e.target.value);
              setPage(0);
            }}
            placeholder="Filter by event..."
            value={event}
          />

          {hasFilters && (
            <Button onClick={clearFilters} size="sm" variant="ghost">
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
                  <TableHead className="hidden md:table-cell">Node</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead className="hidden md:table-cell">IP</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <Badge className="font-mono text-xs" variant="secondary">
                        {entry.event}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {entry.serverName ? (
                        <Link
                          className="text-primary hover:underline"
                          params={{ serverId: entry.serverId ?? "" }}
                          to="/server/$serverId"
                        >
                          {entry.serverName}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {entry.nodeName || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.userName || entry.userId || "System"}
                    </TableCell>
                    <TableCell className="hidden font-mono text-muted-foreground text-xs md:table-cell">
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
                      className="py-16 text-center text-muted-foreground"
                      colSpan={6}
                    >
                      <ClipboardList className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
                      No activity logs found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {data && (
              <TablePagination
                onPageChange={setPage}
                page={page}
                perPage={data.meta.perPage}
                total={data.meta.total}
              />
            )}
          </Card>
        )}
      </div>
    </Layout>
  );
}
