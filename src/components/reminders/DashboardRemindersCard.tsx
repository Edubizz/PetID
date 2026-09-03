import { Link } from "@tanstack/react-router";
import { Bell, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useOwnerReminders } from "@/hooks/useOwnerReminders";
import { useEntitlements } from "@/hooks/useEntitlements";
import { REMINDER_CATEGORY_LABELS } from "@/lib/notification-prefs";

/** Compact due/overdue strip for the owner dashboard — not a full inbox. */
export function DashboardRemindersCard() {
  const { canUseReminders } = useEntitlements();
  const { dashboardItems, isLoading, unreadCount } = useOwnerReminders();

  if (!canUseReminders) return null;

  if (isLoading || dashboardItems.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Bell className="h-4 w-4 text-primary" />
          Lembretes agora
          {unreadCount > 0 ? (
            <Badge variant="destructive" className="font-normal">
              {unreadCount}
            </Badge>
          ) : null}
        </h2>
        <Link
          to="/settings"
          className="text-xs font-medium text-primary hover:underline"
        >
          Preferências
        </Link>
      </div>
      <ul className="space-y-2">
        {dashboardItems.map((item) => (
          <li key={item.key}>
            <Link
              to="/pets/$id"
              params={{ id: item.petId }}
              search={
                item.hrefAction
                  ? { tab: item.hrefTab, action: item.hrefAction }
                  : { tab: item.hrefTab }
              }
              className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 transition hover:border-primary/40"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {item.petName}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    {REMINDER_CATEGORY_LABELS[item.category]}
                  </span>
                </p>
                <p className="truncate text-xs text-muted-foreground">{item.message}</p>
              </div>
              <Badge
                variant={item.status === "overdue" ? "destructive" : "secondary"}
                className="shrink-0 font-normal"
              >
                {item.status === "overdue" ? "Atrasado" : "Agora"}
              </Badge>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
