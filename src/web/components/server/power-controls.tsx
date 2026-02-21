import { useMutation } from "@tanstack/react-query";
import { Button } from "@web/components/ui/button";
import { api } from "@web/lib/api";
import { Play, RotateCcw, Skull, Square } from "lucide-react";

export function PowerControls({
  serverId,
  state,
}: {
  serverId: string;
  state: string;
}) {
  const powerMutation = useMutation({
    mutationFn: (action: string) =>
      api.post(`/servers/${serverId}/power`, { action }),
  });

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        disabled={powerMutation.isPending || state === "running"}
        onClick={() => powerMutation.mutate("start")}
        size="sm"
        variant="default"
      >
        <Play className="h-4 w-4 sm:mr-1" />{" "}
        <span className="hidden sm:inline">Start</span>
      </Button>
      <Button
        disabled={powerMutation.isPending || state === "offline"}
        onClick={() => powerMutation.mutate("restart")}
        size="sm"
        variant="secondary"
      >
        <RotateCcw className="h-4 w-4 sm:mr-1" />{" "}
        <span className="hidden sm:inline">Restart</span>
      </Button>
      <Button
        disabled={powerMutation.isPending || state === "offline"}
        onClick={() => powerMutation.mutate("stop")}
        size="sm"
        variant="secondary"
      >
        <Square className="h-4 w-4 sm:mr-1" />{" "}
        <span className="hidden sm:inline">Stop</span>
      </Button>
      <Button
        disabled={powerMutation.isPending || state === "offline"}
        onClick={() => powerMutation.mutate("kill")}
        size="sm"
        variant="destructive"
      >
        <Skull className="h-4 w-4 sm:mr-1" />{" "}
        <span className="hidden sm:inline">Kill</span>
      </Button>
    </div>
  );
}
