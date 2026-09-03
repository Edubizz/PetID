import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type UpgradeCardProps = {
  title?: string;
  description?: string;
  className?: string;
  compact?: boolean;
};

export function UpgradeCard({
  title = "Desbloqueie mais recursos",
  description = "Planos Guardião e Família liberam lembretes, assistente, relatórios e acesso veterinário.",
  className,
  compact = true,
}: UpgradeCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]",
        compact ? "p-4" : "p-6",
        className,
      )}
    >
      <div className={cn("flex gap-3", compact ? "items-center" : "items-start")}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          <Button asChild size="sm" className="mt-3 h-9 rounded-full">
            <Link to="/pricing">Ver planos</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
