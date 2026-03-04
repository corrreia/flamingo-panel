import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@web/components/ui/badge";
import { Button } from "@web/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@web/components/ui/card";
import { Checkbox } from "@web/components/ui/checkbox";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@web/components/ui/table";
import { Textarea } from "@web/components/ui/textarea";
import { api } from "@web/lib/api";
import { formatBytes } from "@web/lib/format";
import {
  Download,
  Loader2,
  Lock,
  Plus,
  RotateCcw,
  Trash2,
  Unlock,
} from "lucide-react";
import { useState } from "react";

interface Backup {
  bytes: number;
  checksum: string | null;
  completedAt: string | null;
  createdAt: string;
  id: string;
  ignoredFiles: string;
  isLocked: number;
  isSuccessful: number;
  name: string;
  serverId: string;
  uploadId: string | null;
  uuid: string;
}

interface BackupsResponse {
  backupLimit: number;
  backups: Backup[];
}

/**
 * Renders a status badge for the given backup.
 *
 * @param backup - The backup whose status will be displayed
 * @returns A JSX element containing a status Badge: `In Progress` if the backup has not completed, `Completed` if it finished successfully, or `Failed` otherwise
 */
function getStatusBadge(backup: Backup) {
  if (!backup.completedAt) {
    return (
      <Badge variant="secondary">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        In Progress
      </Badge>
    );
  }
  if (backup.isSuccessful) {
    return <Badge variant="default">Completed</Badge>;
  }
  return <Badge variant="destructive">Failed</Badge>;
}

/**
 * Render a table row for a backup with actions for download, restore, lock/unlock, and delete.
 *
 * @param backup - The backup entry to display.
 * @param deleteMutation - Deletion controller with `isPending` (loading state) and `mutate(id)` to delete the backup.
 * @param lockMutation - Lock controller with `isPending` (loading state) and `mutate(id)` to toggle lock state.
 * @param onDownload - Callback invoked with the backup `id` to initiate a download.
 * @param onRestore - Callback invoked with the `backup` object to initiate a restore.
 * @returns The table row element representing the provided backup.
 */
function BackupRow({
  backup,
  deleteMutation,
  lockMutation,
  onDownload,
  onRestore,
}: {
  backup: Backup;
  deleteMutation: { isPending: boolean; mutate: (id: string) => void };
  lockMutation: { isPending: boolean; mutate: (id: string) => void };
  onDownload: (id: string) => void;
  onRestore: (backup: Backup) => void;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex items-center gap-1.5">
          {backup.isLocked ? (
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          ) : null}
          {backup.name}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {backup.bytes > 0 ? formatBytes(backup.bytes) : "-"}
      </TableCell>
      <TableCell>{getStatusBadge(backup)}</TableCell>
      <TableCell className="hidden text-muted-foreground text-xs sm:table-cell">
        {new Date(backup.createdAt).toLocaleString()}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          {backup.completedAt && backup.isSuccessful ? (
            <>
              <Button
                onClick={() => onDownload(backup.id)}
                size="sm"
                title="Download"
                variant="ghost"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => onRestore(backup)}
                size="sm"
                title="Restore"
                variant="ghost"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </>
          ) : null}
          <Button
            disabled={lockMutation.isPending}
            onClick={() => lockMutation.mutate(backup.id)}
            size="sm"
            title={backup.isLocked ? "Unlock" : "Lock"}
            variant="ghost"
          >
            {backup.isLocked ? (
              <Lock className="h-4 w-4" />
            ) : (
              <Unlock className="h-4 w-4" />
            )}
          </Button>
          <Button
            className="text-destructive hover:text-destructive"
            disabled={
              deleteMutation.isPending ||
              (!!backup.isLocked && !!backup.isSuccessful)
            }
            onClick={() => deleteMutation.mutate(backup.id)}
            size="sm"
            title="Delete"
            variant="ghost"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

/**
 * Render the backups table or a contextual message when backups are disabled or none exist.
 *
 * @param backupLimit - The maximum number of backups allowed for the server; when this is less than or equal to zero a "Backups are disabled" message is shown.
 * @param backups - The list of backups to display in the table.
 * @param deleteMutation - Controls for the delete action; `isPending` disables delete controls and `mutate(id)` triggers deletion for the given backup id.
 * @param lockMutation - Controls for the lock/unlock action; `isPending` disables the lock control and `mutate(id)` toggles lock state for the given backup id.
 * @param onDownload - Callback invoked with a backup id to initiate a download for that backup.
 * @param onRestore - Callback invoked with a `Backup` object to begin a restore flow for that backup.
 * @returns A React element containing the backups table, or a centered message indicating backups are disabled or none exist.
 */
function BackupContent({
  backupLimit,
  backups,
  deleteMutation,
  lockMutation,
  onDownload,
  onRestore,
}: {
  backupLimit: number;
  backups: Backup[];
  deleteMutation: { isPending: boolean; mutate: (id: string) => void };
  lockMutation: { isPending: boolean; mutate: (id: string) => void };
  onDownload: (id: string) => void;
  onRestore: (backup: Backup) => void;
}) {
  if (backupLimit <= 0) {
    return (
      <p className="py-4 text-center text-muted-foreground text-sm">
        Backups are disabled for this server.
      </p>
    );
  }

  if (backups.length === 0) {
    return (
      <p className="py-4 text-center text-muted-foreground text-sm">
        No backups have been created yet.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="hidden sm:table-cell">Created</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {backups.map((backup) => (
          <BackupRow
            backup={backup}
            deleteMutation={deleteMutation}
            key={backup.id}
            lockMutation={lockMutation}
            onDownload={onDownload}
            onRestore={onRestore}
          />
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Renders the Backups management tab for a server, providing listing, creation, download,
 * lock/unlock, deletion, and restore functionality for backups.
 *
 * @param serverId - The server identifier whose backups are managed
 * @returns A React element containing the backups UI (table, dialogs, and actions)
 */
export function BackupsTab({ serverId }: { serverId: string }) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showRestore, setShowRestore] = useState<Backup | null>(null);
  const [createName, setCreateName] = useState("");
  const [createIgnored, setCreateIgnored] = useState("");
  const [truncate, setTruncate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["server-backups", serverId],
    queryFn: () => api.get<BackupsResponse>(`/servers/${serverId}/backups`),
    refetchInterval: (query) => {
      const backups = query.state.data?.backups;
      if (backups?.some((b) => !b.completedAt)) {
        return 5000;
      }
      return false;
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post(`/servers/${serverId}/backups`, {
        name: createName,
        ignored: createIgnored,
      }),
    onSuccess: () => {
      setShowCreate(false);
      setCreateName("");
      setCreateIgnored("");
      queryClient.invalidateQueries({
        queryKey: ["server-backups", serverId],
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (backupId: string) =>
      api.delete(`/servers/${serverId}/backups/${backupId}`),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["server-backups", serverId],
      }),
  });

  const lockMutation = useMutation({
    mutationFn: (backupId: string) =>
      api.post(`/servers/${serverId}/backups/${backupId}/lock`),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["server-backups", serverId],
      }),
  });

  const restoreMutation = useMutation({
    mutationFn: (backupId: string) =>
      api.post(`/servers/${serverId}/backups/${backupId}/restore`, {
        truncate,
      }),
    onSuccess: () => {
      setShowRestore(null);
      setTruncate(false);
      queryClient.invalidateQueries({
        queryKey: ["server-backups", serverId],
      });
      queryClient.invalidateQueries({ queryKey: ["server", serverId] });
    },
  });

  const handleDownload = async (backupId: string) => {
    const res = await api.get<{ url: string }>(
      `/servers/${serverId}/backups/${backupId}/download`
    );
    window.open(res.url, "_blank");
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-40" />
        </CardContent>
      </Card>
    );
  }

  const backups = data?.backups ?? [];
  const backupLimit = data?.backupLimit ?? 0;
  const activeCount = backups.filter(
    (b) => !b.completedAt || b.isSuccessful
  ).length;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-base">Backups</CardTitle>
            <p className="text-muted-foreground text-sm">
              {activeCount} of {backupLimit} backups used
            </p>
          </div>
          <Button
            disabled={backupLimit <= 0}
            onClick={() => setShowCreate(true)}
            size="sm"
          >
            <Plus className="mr-1 h-4 w-4" /> Create Backup
          </Button>
        </CardHeader>
        <CardContent>
          <BackupContent
            backupLimit={backupLimit}
            backups={backups}
            deleteMutation={deleteMutation}
            lockMutation={lockMutation}
            onDownload={handleDownload}
            onRestore={(backup) => {
              setShowRestore(backup);
              setTruncate(false);
            }}
          />
        </CardContent>
      </Card>

      {/* Create Backup Dialog */}
      <Dialog onOpenChange={setShowCreate} open={showCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Backup</DialogTitle>
            <DialogDescription>
              Create a new backup of your server files.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="backup-name">Backup Name</Label>
              <Input
                id="backup-name"
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="My Backup"
                value={createName}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="backup-ignored">
                Ignored Files (one per line)
              </Label>
              <Textarea
                id="backup-ignored"
                onChange={(e) => setCreateIgnored(e.target.value)}
                placeholder={"*.log\n*.tmp"}
                rows={3}
                value={createIgnored}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowCreate(false)} variant="secondary">
              Cancel
            </Button>
            <Button
              disabled={createMutation.isPending || !createName.trim()}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Backup Dialog */}
      <Dialog
        onOpenChange={(open) => !open && setShowRestore(null)}
        open={!!showRestore}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Backup</DialogTitle>
            <DialogDescription>
              Restore &ldquo;{showRestore?.name}&rdquo; to your server. This
              will overwrite existing files.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={truncate}
              id="truncate"
              onCheckedChange={(v) => setTruncate(v === true)}
            />
            <Label htmlFor="truncate">Delete all files before restoring</Label>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowRestore(null)} variant="secondary">
              Cancel
            </Button>
            <Button
              disabled={restoreMutation.isPending}
              onClick={() =>
                showRestore && restoreMutation.mutate(showRestore.id)
              }
              variant="destructive"
            >
              {restoreMutation.isPending ? "Restoring..." : "Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
