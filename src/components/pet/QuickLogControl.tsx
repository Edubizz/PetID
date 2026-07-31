import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CATEGORY_META,
  formatQuickLogLabel,
  getQuantityPresets,
  resolveQuickValue,
  usesQuantityQuickLog,
  type TrackerCategory,
} from "@/lib/daily-care";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type QuickLogControlTracker = {
  id: string;
  category: TrackerCategory;
  title?: string;
  unit?: string | null;
  color?: string | null;
};

type Props = {
  tracker: QuickLogControlTracker;
  onLog: (value: number) => void;
  pending?: boolean;
  disabled?: boolean;
  /** Optional leading icon (Dashboard pills). */
  icon?: ReactNode;
  className?: string;
  size?: "sm" | "default";
  /**
   * Bump when external logs (e.g. "Registro personalizado") may have updated
   * the remembered amount so the button label re-reads localStorage.
   */
  refreshToken?: string | number;
};

/**
 * One-tap quick log for count trackers; split button (+amount ▾) for
 * quantity trackers (water / exercise / numeric custom units). Remembers the
 * last amount per tracker via localStorage — no schema change.
 */
export function QuickLogControl({
  tracker,
  onLog,
  pending,
  disabled,
  icon,
  className,
  size = "sm",
  refreshToken,
}: Props) {
  const meta = CATEGORY_META[tracker.category];
  const unit = tracker.unit ?? meta.unit;
  const color = tracker.color || meta.color;
  const quantity = usesQuantityQuickLog(tracker.category, unit);

  const [amount, setAmount] = useState(() =>
    resolveQuickValue(tracker.id, tracker.category, unit),
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customDraft, setCustomDraft] = useState("");

  // Sync label when the tracker changes or an external log updates memory.
  useEffect(() => {
    setAmount(resolveQuickValue(tracker.id, tracker.category, unit));
  }, [tracker.id, tracker.category, unit, refreshToken]);

  const log = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Informe um valor válido.");
      return;
    }
    setAmount(value);
    onLog(value);
    setMenuOpen(false);
    setCustomMode(false);
  };

  const submitCustom = () => {
    const v = Number(customDraft);
    if (!v || v <= 0) return toast.error("Informe um valor válido.");
    log(v);
  };

  if (!quantity) {
    return (
      <Button
        size={size}
        className={cn("rounded-full", className)}
        style={{ backgroundColor: color }}
        onClick={() => log(meta.quickValue)}
        disabled={pending || disabled}
      >
        {icon}
        {meta.quickLabel}
      </Button>
    );
  }

  const presets = getQuantityPresets(unit);
  const label = formatQuickLogLabel(amount, unit);

  return (
    <div className={cn("inline-flex items-stretch overflow-hidden rounded-full", className)}>
      <Button
        size={size}
        className="rounded-none rounded-l-full border-r border-white/20"
        style={{ backgroundColor: color }}
        onClick={() => log(amount)}
        disabled={pending || disabled}
      >
        {icon}
        {label}
      </Button>
      <Popover
        open={menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open);
          if (!open) setCustomMode(false);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            size={size}
            className="rounded-none rounded-r-full px-2"
            style={{ backgroundColor: color }}
            disabled={pending || disabled}
            aria-label="Escolher quantidade"
            onClick={(e) => e.stopPropagation()}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-44 p-1"
          align="end"
          onClick={(e) => e.stopPropagation()}
        >
          {!customMode ? (
            <div className="flex flex-col">
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={cn(
                    "rounded-md px-3 py-1.5 text-left text-sm transition-colors hover:bg-secondary",
                    p === amount && "bg-secondary font-medium",
                  )}
                  onClick={() => log(p)}
                >
                  {formatQuickLogLabel(p, unit).replace(/^\+/, "")}
                </button>
              ))}
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                onClick={() => {
                  setCustomDraft(String(amount));
                  setCustomMode(true);
                }}
              >
                Personalizado…
              </button>
            </div>
          ) : (
            <div className="space-y-2 p-2">
              <div>
                <Label className="text-xs">Quantidade{unit ? ` (${unit})` : ""}</Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  autoFocus
                  value={customDraft}
                  onChange={(e) => setCustomDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitCustom();
                    }
                  }}
                  className="mt-1 h-8"
                />
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1"
                  onClick={() => setCustomMode(false)}
                >
                  Voltar
                </Button>
                <Button size="sm" className="flex-1" onClick={submitCustom}>
                  Salvar
                </Button>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
