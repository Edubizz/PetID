import { Link } from "@tanstack/react-router";
import { LEGAL_POLICY_SNIPPETS, LEGAL_ROUTES } from "@/lib/legal";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** e.g. "Guardião" — optional context at checkout UI */
  planName?: string;
  /** e.g. "mensal" | "anual" */
  intervalLabel?: string;
  /** e.g. "R$ 9,90/mês" */
  priceLabel?: string;
};

/**
 * Concise checkout disclosure — no extra pre-checked mandatory consent box.
 * Acceptance of Terms/Privacy is handled at signup / legal gate.
 */
export function CheckoutLegalDisclosure({
  className,
  planName,
  intervalLabel,
  priceLabel,
}: Props) {
  const context =
    planName && intervalLabel && priceLabel
      ? `Plano ${planName}, cobrança ${intervalLabel} de ${priceLabel}. `
      : planName && intervalLabel
        ? `Plano ${planName} (${intervalLabel}). `
        : intervalLabel
          ? `Intervalo selecionado: ${intervalLabel}. `
          : "";

  return (
    <div className={cn("space-y-1.5 text-center text-xs leading-relaxed text-muted-foreground", className)}>
      <p>
        {context}
        {LEGAL_POLICY_SNIPPETS.recurringBilling} {LEGAL_POLICY_SNIPPETS.cancellation}{" "}
        {LEGAL_POLICY_SNIPPETS.noCardStorage}
      </p>
      <p>
        Direito de arrependimento do CDC (art. 49), quando aplicável; fora das hipóteses legais, não
        há reembolso proporcional automático pelo tempo não usado. Detalhes nos{" "}
        <Link to={LEGAL_ROUTES.terms} className="text-primary hover:underline">
          Termos de Uso
        </Link>{" "}
        e na{" "}
        <Link to={LEGAL_ROUTES.privacy} className="text-primary hover:underline">
          Política de Privacidade
        </Link>
        .
      </p>
    </div>
  );
}
