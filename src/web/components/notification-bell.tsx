import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@web/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@web/components/ui/popover";
import { ScrollArea } from "@web/components/ui/scroll-area";
import { api } from "@web/lib/api";
import { cn } from "@web/lib/utils";
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  Cpu,
  Info,
  Network,
  OctagonAlert,
  Server,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface Notification {
  category: string;
  createdAt: string;
  id: string;
  level: string;
  message: string;
  metadata: string;
  readAt: string | null;
  title: string;
  userId: string;
}

const categoryIcons: Record<string, React.ElementType> = {
  resource: Cpu,
  node: Network,
  server: Server,
  system: Info,
};

const levelStyles: Record<string, string> = {
  info: "text-blue-400",
  warning: "text-yellow-400",
  critical: "text-red-400",
};

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d ago`;
  }

  return new Date(dateStr).toLocaleDateString();
}

export function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: countData } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => api.get<{ count: number }>("/notifications/unread-count"),
    refetchInterval: 30_000,
  });

  const { data: notificationsData, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ data: Notification[] }>("/notifications?limit=20"),
    enabled: open,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.put(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({
        queryKey: ["notifications", "unread-count"],
      });
    },
    onError: () => toast.error("Failed to mark notification as read"),
  });

  const markAllRead = useMutation({
    mutationFn: () => api.put("/notifications/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({
        queryKey: ["notifications", "unread-count"],
      });
    },
    onError: () => toast.error("Failed to mark all notifications as read"),
  });

  const deleteNotification = useMutation({
    mutationFn: (id: string) => api.delete(`/notifications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({
        queryKey: ["notifications", "unread-count"],
      });
    },
    onError: () => toast.error("Failed to delete notification"),
  });

  const unreadCount = countData?.count ?? 0;
  const notifications = notificationsData?.data ?? [];

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button className="relative h-8 w-8" size="icon" variant="ghost">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-bold text-[10px] text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              className="h-7 text-xs"
              disabled={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
              size="sm"
              variant="ghost"
            >
              <CheckCheck className="mr-1 h-3 w-3" />
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-96">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-muted-foreground text-sm">Loading...</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Bell className="mb-2 h-8 w-8 text-muted-foreground/50" />
              <span className="text-muted-foreground text-sm">
                No notifications
              </span>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => {
                const Icon = categoryIcons[n.category] || Info;
                const LevelIcon =
                  n.level === "critical"
                    ? OctagonAlert
                    : n.level === "warning"
                      ? AlertTriangle
                      : null;

                return (
                  <div
                    className={cn(
                      "group flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50",
                      !n.readAt && "bg-muted/30"
                    )}
                    key={n.id}
                  >
                    <div
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted",
                        levelStyles[n.level]
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm leading-tight">
                            {n.title}
                          </span>
                          {LevelIcon && (
                            <LevelIcon
                              className={cn(
                                "h-3 w-3 shrink-0",
                                levelStyles[n.level]
                              )}
                            />
                          )}
                        </div>
                        <span className="shrink-0 text-muted-foreground text-xs">
                          {formatRelativeTime(n.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
                        {n.message}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {!n.readAt && (
                          <Button
                            className="h-6 px-2 text-xs"
                            disabled={markRead.isPending}
                            onClick={() => markRead.mutate(n.id)}
                            size="sm"
                            variant="ghost"
                          >
                            <Check className="mr-1 h-3 w-3" />
                            Read
                          </Button>
                        )}
                        <Button
                          className="h-6 px-2 text-destructive text-xs hover:text-destructive"
                          disabled={deleteNotification.isPending}
                          onClick={() => deleteNotification.mutate(n.id)}
                          size="sm"
                          variant="ghost"
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          Delete
                        </Button>
                      </div>
                    </div>
                    {!n.readAt && (
                      <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
