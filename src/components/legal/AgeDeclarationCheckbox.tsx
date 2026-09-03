import { cn } from "@/lib/utils";
import { LEGAL_POLICY_SNIPPETS } from "@/lib/legal";

/** Contractual age declaration — not a claim of full age-assurance compliance. */
export function AgeDeclarationCheckbox({
  checked,
  onCheckedChange,
  id = "age-18-plus",
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
        <span className="font-medium text-foreground">{LEGAL_POLICY_SNIPPETS.ageDeclaration}</span>
        <span className="mt-1 block text-xs">
          Contas e assinaturas do PetID destinam-se a pessoas com 18 anos ou mais. Esta declaração
          não substitui, sozinha, eventuais requisitos adicionais de verificação de idade previstos
          em lei.
        </span>
      </span>
    </label>
  );
}
