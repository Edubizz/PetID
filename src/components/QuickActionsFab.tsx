import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuickPetAction, type QuickActionKind } from "@/hooks/useQuickPetAction";
import { Weight, Syringe, CalendarClock, ShieldAlert, QrCode, ListChecks, Plus, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ACTIONS: { kind: QuickActionKind; label: string; icon: LucideIcon; tone?: "destructive" }[] = [
  { kind: "weight", label: "Registrar peso", icon: Weight },
  { kind: "vaccine", label: "Adicionar vacina", icon: Syringe },
  { kind: "appointment", label: "Criar consulta", icon: CalendarClock },
  { kind: "daily-care", label: "Rotina de hoje", icon: ListChecks },
  { kind: "qr", label: "Gerar QR Code", icon: QrCode },
  { kind: "lost", label: "Modo perdido", icon: ShieldAlert, tone: "destructive" },
];

const FAB_TIP_KEY = "petid:fab-tip-dismissed";

/**
 * Global floating action button, mounted once in the authenticated layout.
 * Delegates all "which pet / which tab / which dialog" decisions to
 * useQuickPetAction so every entry point shares identical behavior.
 */
export function QuickActionsFab() {
  const [open, setOpen] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const { trigger, picker } = useQuickPetAction();

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && !window.localStorage.getItem(FAB_TIP_KEY)) {
        setShowTip(true);
      }
    } catch {
      // localStorage may be unavailable — skip tip silently.
    }
  }, []);

  const dismissTip = () => {
    setShowTip(false);
    try {
      window.localStorage.setItem(FAB_TIP_KEY, "1");
    } catch {
      // ignore
    }
  };

  return (
    <>
      <div className="fixed bottom-6 right-5 z-40 md:bottom-8 md:right-8">
        {showTip && !open && (
          <div
            role="status"
            className="absolute bottom-full right-0 mb-3 w-max max-w-[14rem] animate-in fade-in slide-in-from-bottom-2 rounded-2xl border border-border bg-card px-3.5 py-2.5 text-sm shadow-[var(--shadow-elegant)] duration-300"
          >
            <div className="flex items-start gap-2">
              <p className="font-medium leading-snug">Toque aqui para registrar cuidados</p>
              <button
                type="button"
                onClick={dismissTip}
                aria-label="Dispensar dica"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <span className="absolute -bottom-1.5 right-6 h-3 w-3 rotate-45 border-b border-r border-border bg-card" />
          </div>
        )}

        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (next && showTip) dismissTip();
          }}
        >
          <PopoverTrigger asChild>
            <button
              aria-label={open ? "Fechar registro rápido" : "Registro rápido"}
              className={cn(
                "relative flex h-16 w-16 items-center justify-center rounded-full text-primary-foreground shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                !open && "fab-pulse",
              )}
              style={{ background: "var(--gradient-brand)" }}
            >
              {!open && (
                <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full bg-primary/25 fab-ring" />
              )}
              {open ? <X className="relative h-7 w-7" /> : <Plus className="relative h-7 w-7" />}
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="end"
            sideOffset={14}
            className="w-64 rounded-2xl border-border p-2 shadow-xl"
          >
            <p className="px-2 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Registro rápido
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
                    "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
