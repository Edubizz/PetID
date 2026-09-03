import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useEntitlements } from "@/hooks/useEntitlements";
import { logAndDescribeError } from "@/lib/errors";
import { invokeCheckoutOrPlanChange } from "@/lib/billing-checkout";
import {
  PLAN_LIMITS,
  PLAN_META,
  type BillingInterval,
  type CheckoutPlanKey,
  type PlanId,
} from "@/lib/entitlements";
import { cn } from "@/lib/utils";
import { CheckoutLegalDisclosure } from "@/components/legal/CheckoutLegalDisclosure";
import { BetaRedeemDialog } from "@/components/billing/BetaRedeemDialog";
import { LEGAL_POLICY_SNIPPETS } from "@/lib/legal";

export const Route = createFileRoute("/_authenticated/pricing")({
  component: PricingPage,
  head: () => ({
    meta: [
      { title: "Planos — PetID" },
      { name: "description", content: "Escolha o plano certo para cuidar do seu pet." },
    ],
  }),
});

const FEATURES: Record<PlanId, string[]> = {
  essencial: [
    "1 pet",
    "Identidade digital e QR",
    "Até 3 documentos",
    "Histórico dos últimos 30 dias",
  ],
  guardiao: [
    "1 pet",
    "Lembretes e assistente",
    "Documentos ilimitados",
    "Relatórios e acesso veterinário",
    "Histórico completo",
  ],
  familia: [
    "Até 3 pets",
    "Tudo do Guardião",
    "Até 5 tutores por pet",
    "Permissões da família",
  ],
};

function PricingPage() {
  const queryClient = useQueryClient();
  const {
    plan: currentPlan,
    subscription,
    founderOffer,
    isLoading,
  } = useEntitlements();
  const [yearly, setYearly] = useState(false);
  const [busyPlan, setBusyPlan] = useState<CheckoutPlanKey | null>(null);
  const [betaOpen, setBetaOpen] = useState(false);
  const selectedInterval: BillingInterval = yearly ? "year" : "month";
  const currentInterval: BillingInterval | null =
    subscription?.billing_interval === "month" || subscription?.billing_interval === "year"
      ? subscription.billing_interval
      : null;
  const paid = currentPlan === "guardiao" || currentPlan === "familia";

  const startCheckout = async (target: CheckoutPlanKey) => {
    setBusyPlan(target);
    try {
      const result = await invokeCheckoutOrPlanChange({
        plan: target,
        interval: selectedInterval,
        founder: Boolean(founderOffer.active),
      });
      if (result.kind === "checkout") {
        window.location.assign(result.url);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["entitlements"] });
      if (result.unchanged) {
        toast.success("Você já está neste plano.");
      } else {
        toast.success(
          `Plano atualizado para ${PLAN_META[target].name} (${selectedInterval === "year" ? "anual" : "mensal"}).`,
        );
      }
    } catch (e: unknown) {
      toast.error(
        logAndDescribeError(
          "pricing: create-checkout",
          e,
          "Não foi possível alterar o plano. Tente novamente.",
        ),
      );
    } finally {
      setBusyPlan(null);
    }
  };

  const paidButtonLabel = (target: CheckoutPlanKey): string => {
    if (busyPlan === target) return "Processando…";
    const samePlan = currentPlan === target;
    const exactCurrent = samePlan && currentInterval === selectedInterval;
    if (exactCurrent) return "Plano atual";
    if (samePlan && currentInterval && currentInterval !== selectedInterval) {
      return selectedInterval === "year" ? "Mudar para anual" : "Mudar para mensal";
    }
    if (paid) return `Mudar para ${PLAN_META[target].name}`;
    return `Assinar ${PLAN_META[target].name}`;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 sm:py-10">
      <div>
        <p className="text-sm font-medium text-primary">Planos PetID</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Escolha seu plano</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Comece no Essencial e evolua quando precisar de lembretes, assistente e mais pets.
        </p>
        {paid && currentInterval ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Plano atual:{" "}
            <span className="font-medium text-foreground">
              {PLAN_META[currentPlan].name} · {currentInterval === "year" ? "Anual" : "Mensal"}
            </span>
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Label htmlFor="pricing-yearly" className={cn("text-sm", !yearly && "font-semibold")}>
          Mensal
        </Label>
        <Switch
          id="pricing-yearly"
          checked={yearly}
          onCheckedChange={setYearly}
          aria-label="Alternar preços anuais"
        />
        <Label htmlFor="pricing-yearly" className={cn("text-sm", yearly && "font-semibold")}>
          Anual
        </Label>
      </div>

      {founderOffer.active ? (
        <p className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-center text-sm text-muted-foreground">
          <Sparkles className="mr-1.5 inline h-4 w-4 text-primary" />
          Oferta fundador disponível no checkout
          {founderOffer.ends_at
            ? ` (até ${new Date(founderOffer.ends_at).toLocaleDateString("pt-BR")})`
            : ""}
          .
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {(["essencial", "guardiao", "familia"] as PlanId[]).map((id) => {
          const meta = PLAN_META[id];
          const limits = PLAN_LIMITS[id];
          const isExactCurrent =
            id === "essencial"
              ? currentPlan === "essencial"
              : currentPlan === id && currentInterval === selectedInterval;
          const isCurrentPlanFamily = currentPlan === id;
          const price =
            id === "essencial"
              ? "Grátis"
              : yearly
                ? meta.yearlyPriceLabel
                : meta.monthlyPriceLabel;
          const priceSuffix =
            id === "essencial" ? "" : yearly ? "/ano" : "/mês";

          return (
            <section
              key={id}
              className={cn(
                "flex flex-col rounded-2xl border bg-card p-6 shadow-[var(--shadow-card)]",
                isExactCurrent
                  ? "border-primary ring-1 ring-primary/30"
                  : isCurrentPlanFamily
                    ? "border-primary/40"
                    : "border-border",
              )}
            >
              <div>
                <h2 className="text-lg font-semibold">{meta.name}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{meta.tagline}</p>
                <p className="mt-4 text-2xl font-bold tracking-tight">
                  {price}
                  {priceSuffix ? (
                    <span className="text-sm font-normal text-muted-foreground">{priceSuffix}</span>
                  ) : null}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Até {limits.petLimit} pet{limits.petLimit > 1 ? "s" : ""}
                </p>
              </div>

              <ul className="mt-5 flex-1 space-y-2">
                {FEATURES[id].map((f) => (
                  <li key={f} className="flex gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                {id === "essencial" ? (
                  <Button
                    asChild
                    variant="outline"
                    className="w-full rounded-full"
                    disabled={isExactCurrent}
                  >
                    <Link to="/settings">
                      {isExactCurrent ? "Plano atual" : "Continuar grátis"}
                    </Link>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="w-full rounded-full"
                    variant={isExactCurrent ? "outline" : "default"}
                    disabled={isLoading || isExactCurrent || busyPlan !== null}
                    onClick={() => void startCheckout(id)}
                  >
                    {paidButtonLabel(id)}
                  </Button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="flex justify-center">
        <Button
          type="button"
          variant="ghost"
          className="rounded-full text-sm text-muted-foreground"
          onClick={() => setBetaOpen(true)}
        >
          Tenho um código beta
        </Button>
      </div>

      <CheckoutLegalDisclosure
        intervalLabel={yearly ? "anual" : "mensal"}
        priceLabel={
          yearly
            ? `Guardião ${PLAN_META.guardiao.yearlyPriceLabel}/ano · Família ${PLAN_META.familia.yearlyPriceLabel}/ano`
            : `Guardião ${PLAN_META.guardiao.monthlyPriceLabel}/mês · Família ${PLAN_META.familia.monthlyPriceLabel}/mês`
        }
      />
      <p className="text-center text-xs text-muted-foreground">
        {LEGAL_POLICY_SNIPPETS.recurringBilling} Trocas entre planos pagos atualizam a assinatura
        existente — não criam uma segunda. Gerencie ou cancele em Configurações.{" "}
        {LEGAL_POLICY_SNIPPETS.cancellation} {LEGAL_POLICY_SNIPPETS.refund}
      </p>

      <BetaRedeemDialog open={betaOpen} onOpenChange={setBetaOpen} />
    </div>
  );
}

