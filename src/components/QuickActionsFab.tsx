import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuickPetAction, type QuickActionKind } from "@/hooks/useQuickPetAction";
import { Weight, Syringe, CalendarClock, ShieldAlert, QrCode, ListChecks, Plus, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ACTIONS: { kind: QuickActionKind; label: string; icon: LucideIcon; tone?: "destructive" }[] = [
  { kind: "weight", label: "Registrar peso", icon: Weight },
  { kind: "vaccine", label: "Adicionar vacina", icon: Syringe },
  { kind: "appointment", label: "Criar consulta", icon: CalendarClock },
  { kind: "daily-care", label: "Cuidados de hoje", icon: ListChecks },
  { kind: "qr", label: "Gerar QR Code", icon: QrCode },
  { kind: "lost", label: "Modo perdido", icon: ShieldAlert, tone: "destructive" },
];

/**
 * Global floating action button, mounted once in the authenticated layout.
 * Delegates all "which pet / which tab / which dialog" decisions to
 * useQuickPetAction so every entry point (this FAB, the pet Dashboard tab)
 * shares identical behavior.
 */
export function QuickActionsFab() {
  const [open, setOpen] = useState(false);
  const { trigger, picker } = useQuickPetAction();

  return (
    <>
      <div className="fixed bottom-6 right-5 z-40 md:bottom-8 md:right-8">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              aria-label={open ? "Fechar ações rápidas" : "Ações rápidas"}
              className="flex h-14 w-14 items-center justify-center rounded-full text-primary-foreground shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl active:scale-95"
              style={{ background: "var(--gradient-brand)" }}
            >
              {open ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="end"
            sideOffset={14}
            className="w-64 rounded-2xl border-border p-2 shadow-xl"
          >
            <p className="px-2 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ações rápidas
            </p>
            <div className="flex flex-col gap-0.5">
              {ACTIONS.map((a) => (
                <button
                  key={a.kind}
                  onClick={() => {
                    setOpen(false);
                    trigger(a.kind);
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-secondary",
                    a.tone === "destructive" && "text-destructive hover:bg-destructive/10",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      a.tone === "destructive" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
                    )}
                  >
                    <a.icon className="h-4 w-4" />
                  </span>
                  {a.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {picker}
    </>
  );
}
