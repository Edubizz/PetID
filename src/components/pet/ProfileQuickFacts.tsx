import { cn } from "@/lib/utils";
import type { QuickFact } from "@/lib/pet-profile";

const TONE: Record<NonNullable<QuickFact["tone"]>, string> = {
  default: "border-border bg-secondary/70 text-foreground",
  success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function ProfileQuickFacts({ facts }: { facts: QuickFact[] }) {
  if (facts.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {facts.map((f) => (
        <span
          key={f.id}
          className={cn(
            "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium",
            TONE[f.tone ?? "default"],
          )}
        >
          {f.label}
        </span>
      ))}
    </div>
  );
}
