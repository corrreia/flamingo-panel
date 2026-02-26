import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@web/components/ui/alert-dialog";
import { Button } from "@web/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@web/components/ui/card";
import { api } from "@web/lib/api";
import { Trash2 } from "lucide-react";

/**
 * Renders the Settings tab containing a "Danger Zone" card that allows deletion of a server.
 *
 * The component shows explanatory text and a confirmation dialog; confirming deletion sends a
 * DELETE request for the provided `serverId`, invalidates the cached "servers" query, and
 * navigates to the application root on success.
 *
 * @param serverId - The identifier of the server to delete.
 * @param serverName - The display name used in the confirmation dialog.
 * @returns The settings tab UI as a React element.
 */
export function SettingsTab({
  serverId,
  serverName,
}: {
  serverId: string;
  serverName: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/servers/${serverId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      router.push("/");
    },
  });

  return (
    <Card className="border-destructive">
      <CardHeader>
        <CardTitle className="text-destructive">Danger Zone</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Delete this server</p>
          <p className="text-muted-foreground text-sm">
            Permanently remove this server and all its data. This cannot be
            undone.
          </p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">
              <Trash2 className="mr-2 h-4 w-4" /> Delete Server
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete server "{serverName}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove the server and all its data from
                both the panel and the node. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete Server"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
