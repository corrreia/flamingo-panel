import { useQuery } from "@tanstack/react-query";
import { Badge } from "@web/components/ui/badge";
import { Button } from "@web/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@web/components/ui/card";
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
import { useState } from "react";

interface ActivityEntry {
  createdAt: string;
  event: string;
  id: number;
  ip: string | null;
  metadata: string | null;
  userId: string | null;
  userName: string | null;
}

interface ActivityResponse {
  data: ActivityEntry[];
  meta: { page: number; perPage: number; total: number };
}

export function ActivityTab({ serverId }: { serverId: string }) {
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["server-activity", serverId, page],
    queryFn: () =>
      api.get<ActivityResponse>(
        `/activity/server/${serverId}?page=${page}&per_page=25`
      ),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Activity Log</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton className="h-10" key={i} />
            ))}
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead className="hidden sm:table-cell">IP</TableHead>
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
                    <TableCell className="text-muted-foreground">
                      {entry.userName || entry.userId || "System"}
                    </TableCell>
                    <TableCell className="hidden font-mono text-muted-foreground text-xs sm:table-cell">
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
                      colSpan={4}
                    >
                      No activity recorded yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {data && data.meta.total > data.meta.perPage && (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-muted-foreground text-sm">
                  Page {data.meta.page + 1} of{" "}
                  {Math.ceil(data.meta.total / data.meta.perPage)}
                </span>
                <div className="flex gap-2">
                  <Button
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                    size="sm"
                    variant="outline"
                  >
                    Previous
                  </Button>
                  <Button
                    disabled={(page + 1) * data.meta.perPage >= data.meta.total}
                    onClick={() => setPage((p) => p + 1)}
                    size="sm"
                    variant="outline"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
