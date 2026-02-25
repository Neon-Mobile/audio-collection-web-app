import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  data: unknown;
  read: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const [, setLocation] = useLocation();
  const { data: notifs = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 30000,
  });

  const unreadCount = notifs.filter((n) => !n.read).length;

  const markAllRead = useMutation({
    mutationFn: () => apiRequest("POST", "/api/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-5 p-0 flex items-center justify-center text-xs">
              {unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-sm">Notifications</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-auto py-1"
              onClick={() => markAllRead.mutate()}
            >
              Mark all read
            </Button>
          )}
        </div>
        {notifs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No notifications</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {notifs.slice(0, 20).map((n) => (
              <div
                key={n.id}
                className={`p-2 rounded text-sm cursor-pointer hover:bg-muted/50 ${!n.read ? "bg-muted" : ""}`}
                onClick={() => {
                  if (!n.read) markRead.mutate(n.id);
                  const data = n.data as Record<string, string> | null;
                  if (data?.roomId && (n.type === "task_room_invitation" || n.type === "room_invitation")) {
                    setLocation(`/room/${data.roomId}`);
                  }
                }}
              >
                <p className="font-medium text-xs">{n.title}</p>
                <p className="text-muted-foreground text-xs">{n.message}</p>
                <p className="text-muted-foreground text-[10px] mt-1">
                  {new Date(n.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
