import { Link } from "@tanstack/react-router";
import { LEGAL_ROUTES } from "@/lib/legal";
import { cn } from "@/lib/utils";

/** Required acceptance checkbox copy for signup / legal gate. */
export function LegalAcceptanceCheckbox({
  checked,
  onCheckedChange,
  id = "legal-accept",
  className,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  id?: string;
  className?: string;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-secondary/20 p-3 text-sm leading-snug",
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 rounded border-border"
      />
      <span className="text-muted-foreground">
        Li e aceito os{" "}
        <Link
          to={LEGAL_ROUTES.terms}
          target="_blank"
          className="font-medium text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Termos de Uso
        </Link>{" "}
        e declaro estar ciente da{" "}
        <Link
          to={LEGAL_ROUTES.privacy}
          target="_blank"
          className="font-medium text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Política de Privacidade
        </Link>
        . Contas e assinaturas destinam-se a pessoas com 18 anos ou mais.
      </span>
    </label>
  );
}
