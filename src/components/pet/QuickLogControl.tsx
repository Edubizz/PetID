import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CATEGORY_META,
  buildGoalQuickOptions,
  formatQuickLogLabel,
  getQuantityPresets,
  isWaterBowlsTracker,
  resolveQuickLogAmount,
  usesQuantityQuickLog,
  type QuickLogEntryLike,
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
  /** Daily goal — drives dynamic quick amounts when present. */
  target_per_day?: number | null;
};

type Props = {
  tracker: QuickLogControlTracker;
  onLog: (value: number) => void;
  pending?: boolean;
  disabled?: boolean;
  /** Optional leading icon (Geral pills). */
  icon?: ReactNode;
  className?: string;
  size?: "sm" | "default";
  /**
   * Bump when external logs (e.g. "Registro personalizado") may have updated
   * the remembered amount so the button label re-reads localStorage / history.
   */
  refreshToken?: string | number;
  /** Already-fetched entries — enables history-based suggested amounts. */
  entries?: QuickLogEntryLike[];
};

/**
 * One-tap quick log for count items; bowls water (+1 pote + Outro);
 * split button for volume quantity items (ml/L / exercise).
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
  entries,
}: Props) {
  const meta = CATEGORY_META[tracker.category];
  const unit = tracker.unit ?? meta.unit;
  const color = tracker.color || meta.color;
  const bowls = isWaterBowlsTracker(tracker.category, unit);
  const quantity = usesQuantityQuickLog(tracker.category, unit);

  const resolveAmount = () =>
    resolveQuickLogAmount({
      trackerId: tracker.id,
      category: tracker.category,
      unit,
      entries,
    });

  const [amount, setAmount] = useState(resolveAmount);
  const [menuOpen, setMenuOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customDraft, setCustomDraft] = useState("");

  useEffect(() => {
    setAmount(resolveAmount());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveAmount closes over tracker/entries
  }, [tracker.id, tracker.category, unit, refreshToken, entries]);

  const quickOptions = useMemo(() => {
    const fromGoal = buildGoalQuickOptions(tracker.target_per_day ?? 0, unit);
    if (fromGoal.length > 0) return fromGoal;
    return getQuantityPresets(unit).map((value) => ({
      value,
      label: formatQuickLogLabel(value, unit).replace(/^\+/, ""),
    }));
  }, [tracker.target_per_day, unit]);

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
    const v = Number(customDraft.replace(",", "."));
    if (!v || v <= 0) return toast.error("Informe um valor válido.");
    log(v);
  };

  if (bowls) {
    return (
      <div className={cn("inline-flex max-w-full items-stretch overflow-hidden rounded-full", className)}>
        <Button
          size={size}
          className="min-h-11 rounded-none rounded-l-full border-r border-white/20 px-3.5"
          style={{ backgroundColor: color }}
          onClick={() => log(1)}
          disabled={pending || disabled}
        >
          {icon}
          + 1 pote
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
              className="min-h-11 min-w-11 rounded-none rounded-r-full px-0"
              style={{ backgroundColor: color }}
              disabled={pending || disabled}
              aria-label="Registrar outro número de potes"
              onClick={(e) => e.stopPropagation()}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[min(12rem,calc(100vw-2rem))] p-1"
            align="end"
            onClick={(e) => e.stopPropagation()}
          >
            {!customMode ? (
              <button
                type="button"
                className="min-h-11 w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                onClick={() => {
                  setCustomDraft("");
                  setCustomMode(true);
                }}
              >
                Outro
              </button>
            ) : (
              <div className="space-y-2 p-2">
                <div>
                  <Label className="text-xs">Quantos potes?</Label>
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    inputMode="numeric"
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
                    placeholder="Ex.: 2"
                  />
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" className="flex-1" onClick={() => setCustomMode(false)}>
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

  if (!quantity) {
    return (
      <Button
        size={size}
        className={cn("min-h-11 rounded-full px-4", className)}
        style={{ backgroundColor: color }}
        onClick={() => log(meta.quickValue)}
        disabled={pending || disabled}
      >
        {icon}
        {meta.quickLabel}
      </Button>
    );
  }

  const label = formatQuickLogLabel(amount, unit);

  return (
    <div className={cn("inline-flex max-w-full items-stretch overflow-hidden rounded-full", className)}>
      <Button
        size={size}
        className="min-h-11 max-w-[min(11rem,calc(100vw-8rem))] truncate rounded-none rounded-l-full border-r border-white/20 px-3.5"
        style={{ backgroundColor: color }}
        onClick={() => log(amount)}
        disabled={pending || disabled}
      >
        {icon}
        <span className="truncate">{label}</span>
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
            className="min-h-11 min-w-11 rounded-none rounded-r-full px-0"
            style={{ backgroundColor: color }}
            disabled={pending || disabled}
            aria-label="Escolher quantidade"
            onClick={(e) => e.stopPropagation()}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[min(12rem,calc(100vw-2rem))] p-1"
          align="end"
          onClick={(e) => e.stopPropagation()}
        >
          {!customMode ? (
            <div className="flex flex-col">
              {quickOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={cn(
                    "min-h-11 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-secondary",
                    opt.value === amount && "bg-secondary font-medium",
                  )}
                  onClick={() => log(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
              <button
                type="button"
                className="min-h-11 rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                onClick={() => {
                  setCustomDraft(String(amount));
                  setCustomMode(true);
                }}
              >
                Outro
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
                  inputMode="decimal"
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
