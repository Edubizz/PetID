import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, QrCode } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PET_MENU_SECTIONS, petMenuLabel, hasPendingProfileItems } from "@/lib/pet-menu";
import type { CompletenessItem } from "@/lib/pet-profile";
import { PENDING_PROFILE_HINT } from "@/lib/homepage-branding";

type PetSectionMenuProps = {
  value: string;
  onChange: (tab: string) => void;
  isLost?: boolean;
  /** Incomplete items from `computeProfileCompleteness().missing` — same source as overview. */
  pendingItems?: CompletenessItem[];
  onFillPending?: (item: CompletenessItem) => void;
};

/**
 * Collapsible pet navigation — mobile-first, no horizontal scroll.
 * Closes after selecting a section.
 */
export function PetSectionMenu({
  value,
  onChange,
  isLost,
  pendingItems = [],
  onFillPending,
}: PetSectionMenuProps) {
  const [open, setOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const showPending = hasPendingProfileItems(pendingItems);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const currentLabel = petMenuLabel(value);

  const fillItem = (item: CompletenessItem) => {
    setPendingOpen(false);
    setOpen(false);
    onFillPending?.(item);
  };

  return (
    <div ref={rootRef} className="w-full min-w-0 print:hidden">
      <div className="flex w-full min-w-0 items-stretch overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-secondary/40"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Menu do pet
            </p>
            <p className="truncate text-sm font-semibold text-foreground">{currentLabel}</p>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>

        {showPending && (
          <button
            type="button"
            className="flex min-h-11 w-11 shrink-0 items-center justify-center border-l border-border text-amber-600 transition-colors hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            aria-label={PENDING_PROFILE_HINT}
            title={PENDING_PROFILE_HINT}
            onClick={() => setPendingOpen(true)}
          >
            <AlertTriangle className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {open && (
        <nav
          id={panelId}
          aria-label="Seções do pet"
          className="mt-2 max-h-[min(70vh,28rem)] overflow-y-auto overflow-x-hidden rounded-xl border border-border bg-card p-1.5 shadow-[var(--shadow-card)]"
        >
          <ul className="flex w-full min-w-0 flex-col gap-0.5">
            {PET_MENU_SECTIONS.map((section) => {
              const selected = value === section.id;
              const lostStyle = section.id === "lost" && isLost;
              return (
                <li key={section.id} className="min-w-0">
                  <button
                    type="button"
                    aria-current={selected ? "page" : undefined}
                    onClick={() => {
                      onChange(section.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full min-h-11 min-w-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-secondary/70",
                      !selected && lostStyle && "text-destructive",
                      !selected && section.emphasize && "bg-accent-soft/60",
                    )}
                  >
                    {section.id === "qr" && (
                      <QrCode
                        className={cn(
                          "h-4 w-4 shrink-0",
                          selected ? "text-primary-foreground" : "text-primary",
                        )}
                        aria-hidden
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate font-medium">{section.label}</span>
                    {section.badge && (
                      <span
                        className={cn(
                          "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          selected
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : "bg-primary/10 text-primary",
                        )}
                      >
                        {section.badge}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <Dialog open={pendingOpen} onOpenChange={setPendingOpen}>
        <DialogContent className="max-w-sm gap-3 overflow-x-hidden p-4 sm:p-6">
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="pr-8 text-lg">Informações pendentes</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              {PENDING_PROFILE_HINT}
            </DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-[min(55vh,22rem)] flex-col gap-1.5 overflow-y-auto overflow-x-hidden pr-0.5">
            {pendingItems.map((item) => (
              <li
                key={item.id}
                className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-secondary/30 px-3 py-2.5"
              >
                <span className="min-w-0 flex-1 break-words text-sm font-medium leading-snug text-foreground">
                  {item.label}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-10 shrink-0 rounded-full px-3"
                  onClick={() => fillItem(item)}
                >
                  Preencher
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
