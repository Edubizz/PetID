import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CreditCard, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useEntitlements } from "@/hooks/useEntitlements";
import { supabase } from "@/integrations/supabase/client";
import { logAndDescribeError } from "@/lib/errors";
import { invokeCheckoutOrPlanChange } from "@/lib/billing-checkout";
import {
  PLAN_META,
  type BillingInterval,
  type CheckoutPlanKey,
} from "@/lib/entitlements";
import { formatDate } from "@/lib/pet-utils";
import { CheckoutLegalDisclosure } from "@/components/legal/CheckoutLegalDisclosure";
import { BetaRedeemDialog } from "@/components/billing/BetaRedeemDialog";
import { LEGAL_POLICY_SNIPPETS, LEGAL_ROUTES, SUPPORT_EMAIL_ACTIVE } from "@/lib/legal";
import { Badge } from "@/components/ui/badge";

function checkoutUrlFromResponse(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (typeof row.url === "string" && row.url.startsWith("http")) return row.url;
  if (typeof row.portal_url === "string" && row.portal_url.startsWith("http")) return row.portal_url;
  return null;
}

export function PlanBillingPanel() {
  const queryClient = useQueryClient();
  const {
    plan,
    underlyingPlan,
    petCount,
    limits,
    subscription,
    beta,
    hasActiveBeta,
    founderOffer,
    isLoading,
    isOverPetLimit,
  } = useEntitlements();
  const [yearly, setYearly] = useState(false);
  const [busy, setBusy] = useState<"checkout" | "portal" | null>(null);
  const [betaOpen, setBetaOpen] = useState(false);

  const interval: BillingInterval = yearly ? "year" : "month";
  const meta = PLAN_META[plan];
  const paidSubscription =
    underlyingPlan === "guardiao" || underlyingPlan === "familia";
  const currentInterval: BillingInterval | null =
    subscription?.billing_interval === "month" || subscription?.billing_interval === "year"
      ? subscription.billing_interval
      : null;
  const needsIntervalChange =
    paidSubscription && currentInterval != null && currentInterval !== interval;

  const startCheckout = async (target: CheckoutPlanKey) => {
    setBusy("checkout");
    try {
      const result = await invokeCheckoutOrPlanChange({
        plan: target,
        interval,
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
          `Plano atualizado para ${PLAN_META[target].name} (${interval === "year" ? "anual" : "mensal"}).`,
        );
      }
    } catch (e: unknown) {
      toast.error(
        logAndDescribeError(
          "PlanBillingPanel: create-checkout",
          e,
          "Não foi possível alterar o plano. Tente novamente.",
        ),
      );
    } finally {
      setBusy(null);
    }
  };

  const openPortal = async () => {
    setBusy("portal");
    try {
      const { data, error } = await supabase.functions.invoke("create-portal", {
        body: {},
      });
      if (error) throw error;
      const url = checkoutUrlFromResponse(data);
      if (!url) throw new Error("Portal URL missing");
      window.location.assign(url);
    } catch (e: unknown) {
      toast.error(
        logAndDescribeError(
          "PlanBillingPanel: create-portal",
          e,
          "Não foi possível abrir o portal de cobrança.",
        ),
      );
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-48 w-full rounded-2xl" />;
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CreditCard className="h-5 w-5 text-primary" />
            Plano e cobrança
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              Plano efetivo:{" "}
              <span className="font-medium text-foreground">{meta.name}</span>
            </span>
            {hasActiveBeta ? (
              <Badge variant="secondary" className="rounded-full text-[10px] uppercase tracking-wide">
                Beta
              </Badge>
            ) : null}
          </p>

          {paidSubscription ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Assinatura:{" "}
              <span className="font-medium text-foreground">
                {PLAN_META[underlyingPlan].name}
                {currentInterval
                  ? ` · ${currentInterval === "year" ? "Anual" : "Mensal"}`
                  : ""}
              </span>
              {subscription?.current_period_end
                ? subscription.cancel_at_period_end
                  ? ` — acesso pago até ${formatDate(subscription.current_period_end)} (renovação cancelada)`
                  : ` — renova em ${formatDate(subscription.current_period_end)}`
                : null}
            </p>
          ) : null}

          {hasActiveBeta && beta ? (
            <div className="mt-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              <p>
                Acesso Beta:{" "}
                <span className="font-medium text-foreground">
                  {PLAN_META[beta.plan].name}
                </span>
                {" — "}
                gratuito, válido até {formatDate(beta.expires_at)}.
              </p>
              <p className="mt-1">
                Nenhuma cobrança ou renovação automática. Este acesso não é uma assinatura.
              </p>
            </div>
          ) : null}
        </div>
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link to="/pricing">
            Ver planos
            <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      {isOverPetLimit ? (
        <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>
            Você tem <strong>{petCount}</strong> pets, mas o plano {meta.name} permite{" "}
            <strong>{limits.petLimit}</strong>. Faça upgrade ou remova pets extras para voltar ao
            limite.
          </p>
        </div>
      ) : null}

      {founderOffer.active ? (
        <p className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
          Oferta fundador ativa
          {founderOffer.ends_at ? ` até ${formatDate(founderOffer.ends_at)}` : ""}. Use no checkout
          para condições especiais.
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
        <div>
          <Label htmlFor="billing-interval" className="text-sm font-medium">
            Cobrança anual
          </Label>
          <p className="text-xs text-muted-foreground">Economize no plano anual.</p>
        </div>
        <Switch
          id="billing-interval"
          checked={yearly}
          onCheckedChange={setYearly}
          aria-label="Alternar cobrança anual"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {needsIntervalChange &&
        (underlyingPlan === "guardiao" || underlyingPlan === "familia") ? (
          <Button
            type="button"
            className="rounded-full"
            disabled={busy !== null}
            onClick={() => void startCheckout(underlyingPlan)}
          >
            {busy === "checkout"
              ? "Processando…"
              : interval === "year"
                ? "Mudar para anual"
                : "Mudar para mensal"}
          </Button>
        ) : null}
        {underlyingPlan !== "guardiao" ? (
          <Button
            type="button"
            className="rounded-full"
            disabled={busy !== null}
            onClick={() => void startCheckout("guardiao")}
          >
            {busy === "checkout"
              ? "Processando…"
              : paidSubscription
                ? "Mudar para Guardião"
                : "Assinar Guardião"}
          </Button>
        ) : null}
        {underlyingPlan !== "familia" ? (
          <Button
            type="button"
            variant={underlyingPlan === "essencial" ? "outline" : "default"}
            className="rounded-full"
            disabled={busy !== null}
            onClick={() => void startCheckout("familia")}
          >
            {busy === "checkout"
              ? "Processando…"
              : paidSubscription
                ? "Mudar para Família"
                : "Assinar Família"}
          </Button>
        ) : null}
        {subscription?.stripe_customer_id ? (
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={busy !== null}
            onClick={() => void openPortal()}
          >
            {busy === "portal" ? "Abrindo…" : "Gerenciar assinatura"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          className="rounded-full"
          onClick={() => setBetaOpen(true)}
        >
          Tenho um código beta
        </Button>
      </div>

      {hasActiveBeta ? (
        <p className="text-xs text-muted-foreground">
          Software em beta pode conter erros.{" "}
          <Link to={LEGAL_ROUTES.support} className="text-primary hover:underline">
            {SUPPORT_EMAIL_ACTIVE ? "Enviar feedback do Beta" : "Ver suporte / feedback"}
          </Link>
          .
        </p>
      ) : null}

      <CheckoutLegalDisclosure
        className="text-left"
        intervalLabel={yearly ? "anual" : "mensal"}
        priceLabel={
          yearly
            ? `Guardião ${PLAN_META.guardiao.yearlyPriceLabel}/ano · Família ${PLAN_META.familia.yearlyPriceLabel}/ano`
            : `Guardião ${PLAN_META.guardiao.monthlyPriceLabel}/mês · Família ${PLAN_META.familia.monthlyPriceLabel}/mês`
        }
      />
      <p className="text-xs text-muted-foreground">
        {LEGAL_POLICY_SNIPPETS.noCardStorage} Use &quot;Gerenciar assinatura&quot; para cancelar
        assinaturas pagas (não se aplica ao Acesso Beta). Trocas entre planos pagos atualizam a
        assinatura existente (sem criar outra em paralelo). {LEGAL_POLICY_SNIPPETS.cancellation}{" "}
        {LEGAL_POLICY_SNIPPETS.refund}{" "}
        <Link to={LEGAL_ROUTES.support} className="text-primary hover:underline">
          Suporte
        </Link>
        .
      </p>

      <BetaRedeemDialog open={betaOpen} onOpenChange={setBetaOpen} />
    </section>
  );
}
