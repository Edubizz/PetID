import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, Calendar, Check, Lock, Scale, Syringe, Utensils, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useOwnerReminders } from "@/hooks/useOwnerReminders";
import { useEntitlements } from "@/hooks/useEntitlements";
import { UpgradeCard } from "@/components/billing/UpgradeCard";
import { REMINDER_CATEGORY_LABELS } from "@/lib/notification-prefs";
import type { ReminderItem, ReminderStatus } from "@/lib/reminders";
import { cn } from "@/lib/utils";

function statusLabel(status: ReminderStatus): string {
  if (status === "overdue") return "Atrasado";
  if (status === "due") return "Agora";
  if (status === "upcoming") return "Em breve";
  return status;
}

function statusVariant(status: ReminderStatus): "destructive" | "default" | "secondary" {
  if (status === "overdue") return "destructive";
  if (status === "due") return "default";
  return "secondary";
}

function CategoryIcon({ category }: { category: ReminderItem["category"] }) {
  const cls = "h-4 w-4 shrink-0 text-primary";
  if (category === "vaccines") return <Syringe className={cls} />;
  if (category === "appointments") return <Calendar className={cls} />;
  if (category === "weight") return <Scale className={cls} />;
  return <Utensils className={cls} />;
}

export function ReminderBell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { canUseReminders } = useEntitlements();
  const { items, unreadCount, isLoading, dismiss, markRead, markAllVisibleRead } =
    useOwnerReminders();

  const openItem = (item: ReminderItem) => {
    markRead(item);
    setOpen(false);
    navigate({
      to: "/pets/$id",
      params: { id: item.petId },
      search: item.hrefAction
        ? { tab: item.hrefTab, action: item.hrefAction }
        : { tab: item.hrefTab },
    });
  };

  if (!canUseReminders) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("relative h-11 w-11", className)}
            aria-label="Lembretes (plano superior)"
          >
            <Bell className="h-5 w-5 opacity-60" />
            <Lock className="absolute bottom-1.5 right-1.5 h-3 w-3 text-muted-foreground" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="flex w-full flex-col gap-4 p-4 sm:max-w-md">
          <SheetHeader className="text-left">
            <SheetTitle>Lembretes</SheetTitle>
          </SheetHeader>
          <UpgradeCard
            title="Lembretes no Guardião"
            description="Receba avisos de rotina, vacinas e consultas. Disponível nos planos Guardião e Família."
          />
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/pricing">Ver planos</Link>
          </Button>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("relative h-11 w-11", className)}
          aria-label="Lembretes"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 ? (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-4 py-4 text-left">
          <div className="flex items-center justify-between gap-2 pr-8">
            <SheetTitle>Lembretes</SheetTitle>
            {items.some((i) => i.unread) ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => markAllVisibleRead()}
              >
                Marcar lidos
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Baseado na rotina, vacinas, consultas e peso dos seus pets.
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : items.length === 0 ? (
            <div className="py-10 text-center">
              <Bell className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-medium">Nenhum lembrete agora</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Quando algo estiver próximo ou atrasado, aparece aqui.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li
                  key={item.key}
                  className={cn(
                    "rounded-xl border border-border p-3",
                    item.unread ? "bg-card" : "bg-secondary/30 opacity-90",
                  )}
                >
                  <div className="flex gap-3">
                    {item.petPhotoUrl ? (
                      <img
                        src={item.petPhotoUrl}
                        alt=""
                        className="h-10 w-10 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary">
                        <CategoryIcon category={item.category} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-sm font-medium">{item.petName}</p>
                        <Badge variant={statusVariant(item.status)} className="font-normal">
                          {statusLabel(item.status)}
                        </Badge>
                        <Badge variant="outline" className="font-normal">
                          {REMINDER_CATEGORY_LABELS[item.category]}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 rounded-full"
                          onClick={() => openItem(item)}
                        >
                          Abrir
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-full"
                          onClick={() => dismiss(item)}
                        >
                          <X className="mr-1 h-3.5 w-3.5" />
                          Dispensar
                        </Button>
                        {item.category === "routine" || item.category === "medications" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 rounded-full text-xs text-muted-foreground"
                            onClick={() => openItem(item)}
                          >
                            <Check className="mr-1 h-3.5 w-3.5" />
                            Registrar na rotina
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
