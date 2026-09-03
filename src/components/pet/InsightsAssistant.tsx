import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Droplet,
  FileWarning,
  HeartPulse,
  Info,
  Lightbulb,
  ShieldAlert,
  Sparkles as SparklesIcon,
  Stethoscope,
  Syringe,
  TrendingUp,
  Weight,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_ASSISTANT_CARDS, type InsightPriority, type PetInsight } from "@/lib/pet-insights";
import { cn } from "@/lib/utils";

const PRIORITY_META: Record<
  InsightPriority,
  { label: string; icon: LucideIcon; accent: string; chip: string }
> = {
  critical: {
    label: "Atenção",
    icon: AlertTriangle,
    accent: "border-destructive/30 bg-destructive/5",
    chip: "bg-destructive/15 text-destructive",
  },
  attention: {
    label: "Atenção",
    icon: AlertTriangle,
    accent: "border-amber-500/30 bg-amber-500/5",
    chip: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  },
  reminder: {
    label: "Lembrete",
    icon: Info,
    accent: "border-amber-500/20 bg-card",
    chip: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
  },
  tip: {
    label: "Dica",
    icon: Lightbulb,
    accent: "border-sky-500/25 bg-sky-500/5",
    chip: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  },
  great: {
    label: "Ótimo",
    icon: CheckCircle2,
    accent: "border-emerald-500/30 bg-emerald-500/5",
    chip: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  },
};

const CATEGORY_ICON: Record<string, LucideIcon> = {
  lost: ShieldAlert,
  weight: Weight,
  vaccine: Syringe,
  appointment: CalendarClock,
  daily_care: Droplet,
  profile: HeartPulse,
  documents: FileWarning,
  veterinary: Stethoscope,
  trend: TrendingUp,
  habit: Clock,
  celebration: SparklesIcon,
};

export function InsightsAssistant({
  insights,
  onAction,
  onDismiss,
  title = "Assistente PetID",
  emptyLabel = "Nenhuma recomendação no momento. Seu pet está em dia!",
  className,
}: {
  insights: PetInsight[];
  onAction: (insight: PetInsight) => void;
  /** Hides this specific insight until tomorrow — reused by the Assistant's memory to avoid repeating itself. */
  onDismiss?: (insight: PetInsight) => void;
  title?: string;
  emptyLabel?: string;
  className?: string;
}) {
  const visible = insights.slice(0, MAX_ASSISTANT_CARDS);

  return (
    <section className={cn("rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]", className)}>
      <div className="mb-3 flex items-center gap-2">
        <SparklesGlyph />
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2.5">
          {visible.map((insight, index) => {
            const meta = PRIORITY_META[insight.priority];
            const Icon = CATEGORY_ICON[insight.category] ?? meta.icon;
            return (
              <li
                key={insight.id}
                className={cn(
                  "animate-in fade-in slide-in-from-bottom-2 flex flex-wrap items-start gap-3 rounded-xl border px-3.5 py-3 duration-300 fill-mode-both",
                  meta.accent,
                )}
                style={{ animationDelay: `${Math.min(index, 4) * 60}ms` }}
              >
                <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", meta.chip)}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", meta.chip)}>
                      {meta.label}
                    </span>
                    {insight.petName && (
                      <span className="text-xs text-muted-foreground">{insight.petName}</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-semibold leading-snug">{insight.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{insight.description}</p>
                  {insight.why && (
                    <p className="mt-1 text-[11px] italic text-muted-foreground/80">{insight.why}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {insight.action && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full bg-background"
                      onClick={() => onAction(insight)}
                    >
                      {insight.action.label}
                    </Button>
                  )}
                  {onDismiss && (
                    <button
                      type="button"
                      onClick={() => onDismiss(insight)}
                      aria-label={`Ocultar recomendação "${insight.title}" por hoje`}
                      title="Ocultar por hoje"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-all hover:bg-background hover:text-foreground active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SparklesGlyph() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
      <HeartPulse className="h-4 w-4" />
    </span>
  );
}
