import { Link } from "wouter";
import { Bell, ArrowRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const IMPORTANT_NOTIFICATION_TYPES = new Set([
  "free_preview_ready",
  "letter_approved",
  "client_revision_requested",
  "letter_sent",
  "payment_required",
]);

export function NotificationsPanel() {
  const { data: notifications, isLoading } = trpc.notifications.list.useQuery(
    { unreadOnly: false },
    { refetchInterval: 10000 }
  );

  const importantNotifications = (notifications ?? [])
    .filter(notification => IMPORTANT_NOTIFICATION_TYPES.has(notification.type))
    .slice(0, 5);

  if (isLoading || importantNotifications.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
            <Bell className="w-4 h-4 text-amber-700" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
            <p className="text-xs text-muted-foreground">Recent updates about your letters.</p>
          </div>
        </div>

        <div className="space-y-2">
          {importantNotifications.map(notification => (
            <div
              key={notification.id}
              className={`rounded-lg border bg-background p-3 ${
                notification.readAt ? "opacity-70" : "border-amber-300"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {!notification.readAt && (
                      <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                    )}
                    <p className="text-sm font-medium text-foreground">{notification.title}</p>
                  </div>
                  {notification.body && (
                    <p className="text-xs text-muted-foreground mt-1">{notification.body}</p>
                  )}
                </div>

                {notification.link && (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0"
                    data-testid={`button-open-notification-${notification.id}`}
                  >
                    <Link href={notification.link}>
                      Open
                      <ArrowRight className="w-3 h-3 ml-1" />
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
