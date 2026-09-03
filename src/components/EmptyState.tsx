import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shared "educational" empty state — every empty list in the app should
 * explain *why* the feature matters and offer one clear next step, instead
 * of a bare "no data" message. Reused across pet tabs and top-level routes
 * so every empty state in the product looks and behaves the same way.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = "default",
  className,
}: {
  icon: LucideIcon;
  title?: string;
  description: string;
  action?: { label: string; onClick: () => void; icon?: LucideIcon };
  size?: "default" | "sm";
  className?: string;
}) {
  const compact = size === "sm";
  return (
    <div
      className={cn(
        "animate-in fade-in flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-secondary/20 text-center duration-500",
        compact ? "p-6" : "p-8",
        className,
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-2xl bg-primary/10 text-primary",
          compact ? "h-10 w-10" : "h-12 w-12",
        )}
      >
        <Icon className={compact ? "h-5 w-5" : "h-6 w-6"} />
      </span>
      <div className="max-w-sm">
        {title && <p className="font-semibold text-foreground">{title}</p>}
        <p className={cn("text-sm text-muted-foreground", title && "mt-1")}>{description}</p>
      </div>
      {action && (
        <Button size="sm" onClick={action.onClick} className="mt-1 rounded-full">
          {action.icon && <action.icon className="mr-2 h-4 w-4" />}
          {action.label}
        </Button>
      )}
    </div>
  );
}
