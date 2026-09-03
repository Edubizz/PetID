import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  canAddCaretaker as canAddCaretakerFn,
  canCreatePet as canCreatePetFn,
  canUploadDocument as canUploadDocumentFn,
  canUseAssistant,
  canUseReminders,
  canUseReports,
  canUseVetAccess,
  getPlanLimits,
  historyCutoffIso,
  isBetaGrantActive,
  isOverPetLimit,
  normalizePlanId,
  planUnlockLabel,
  resolveCombinedEffectivePlan,
  resolveSubscriptionPlan,
  type BetaGrantSnapshot,
  type BillingInterval,
  type PlanId,
  type PlanLimits,
  type SubscriptionSnapshot,
} from "@/lib/entitlements";

export type FounderOfferSnapshot = {
  active: boolean;
  ends_at: string | null;
  max_subscriptions: number | null;
  subscriptions_redeemed: number;
};

export type EntitlementsPayload = {
  /** Effective plan (subscription ⊕ active beta). */
  plan: PlanId;
  /** Subscription-only plan (ignores beta). */
  underlyingPlan: PlanId;
  petCount: number;
  limits: PlanLimits;
  subscription: SubscriptionSnapshot | null;
  beta: BetaGrantSnapshot | null;
  founderOffer: FounderOfferSnapshot;
};

const FAIL_CLOSED: EntitlementsPayload = {
  plan: "essencial",
  underlyingPlan: "essencial",
  petCount: 0,
  limits: getPlanLimits("essencial"),
  subscription: null,
  beta: null,
  founderOffer: {
    active: false,
    ends_at: null,
    max_subscriptions: null,
    subscriptions_redeemed: 0,
  },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function parseSubscription(raw: unknown): SubscriptionSnapshot | null {
  const row = asRecord(raw);
  if (!row) return null;
  const interval = row.billing_interval;
  return {
    plan: normalizePlanId(row.plan),
    billing_interval:
      interval === "month" || interval === "year" ? (interval as BillingInterval) : null,
    status: typeof row.status === "string" ? row.status : "inactive",
    current_period_end: typeof row.current_period_end === "string" ? row.current_period_end : null,
    cancel_at_period_end: Boolean(row.cancel_at_period_end),
    stripe_customer_id: typeof row.stripe_customer_id === "string" ? row.stripe_customer_id : null,
    stripe_subscription_id:
      typeof row.stripe_subscription_id === "string" ? row.stripe_subscription_id : null,
    founder_offer: Boolean(row.founder_offer),
  };
}

function parseBeta(raw: unknown): BetaGrantSnapshot | null {
  const row = asRecord(raw);
  if (!row || row.active !== true) return null;
  const plan = row.plan;
  if (plan !== "guardiao" && plan !== "familia") return null;
  if (typeof row.grant_id !== "string" || typeof row.expires_at !== "string") return null;
  const snap: BetaGrantSnapshot = {
    active: true,
    grant_id: row.grant_id,
    plan,
    expires_at: row.expires_at,
    granted_at: typeof row.granted_at === "string" ? row.granted_at : row.expires_at,
    label: typeof row.label === "string" ? row.label : null,
  };
  return isBetaGrantActive(snap) ? snap : null;
}

function parseFounderOffer(raw: unknown): FounderOfferSnapshot {
  const row = asRecord(raw);
  if (!row) return FAIL_CLOSED.founderOffer;
  return {
    active: Boolean(row.active),
    ends_at: typeof row.ends_at === "string" ? row.ends_at : null,
    max_subscriptions: typeof row.max_subscriptions === "number" ? row.max_subscriptions : null,
    subscriptions_redeemed:
      typeof row.subscriptions_redeemed === "number" ? row.subscriptions_redeemed : 0,
  };
}

function parseEntitlements(raw: unknown): EntitlementsPayload {
  const row = asRecord(raw);
  if (!row) return FAIL_CLOSED;

  const subscription = parseSubscription(row.subscription);
  const beta = parseBeta(row.beta);
  const underlyingFromRpc =
    typeof row.underlying_plan === "string" ? normalizePlanId(row.underlying_plan) : null;
  const underlyingPlan = underlyingFromRpc ?? resolveSubscriptionPlan(subscription);
  // Prefer server effective plan; fall back to client combine for older payloads.
  const planFromRpc = typeof row.plan === "string" ? normalizePlanId(row.plan) : null;
  const plan = planFromRpc ?? resolveCombinedEffectivePlan(subscription, beta);
  const limits = getPlanLimits(plan);
  const petCount =
    typeof row.pet_count === "number" && Number.isFinite(row.pet_count)
      ? Math.max(0, Math.floor(row.pet_count))
      : 0;

  return {
    plan,
    underlyingPlan,
    petCount,
    limits,
    subscription,
    beta,
    founderOffer: parseFounderOffer(row.founder_offer),
  };
}

async function fetchEntitlements(): Promise<EntitlementsPayload> {
  try {
    const { data, error } = await supabase.rpc("get_my_entitlements");
    if (error) {
      console.error("useEntitlements: get_my_entitlements failed", error);
      return FAIL_CLOSED;
    }
    return parseEntitlements(data);
  } catch (error) {
    console.error("useEntitlements: unexpected error", error);
    return FAIL_CLOSED;
  }
}

export function useEntitlements() {
  const query = useQuery({
    queryKey: ["entitlements"],
    queryFn: fetchEntitlements,
    staleTime: 60_000,
  });

  const payload = query.data ?? FAIL_CLOSED;
  const { plan, underlyingPlan, petCount, limits, subscription, beta, founderOffer } = payload;
  const hasActiveBeta = Boolean(beta);

  return {
    plan,
    underlyingPlan,
    petCount,
    limits,
    subscription,
    beta,
    hasActiveBeta,
    founderOffer,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
    canCreatePet: (count: number) => canCreatePetFn(plan, count),
    canUploadDocument: (count: number) => canUploadDocumentFn(plan, count),
    canAddCaretaker: (count: number) => canAddCaretakerFn(plan, count),
    canUseReminders: canUseReminders(plan),
    canUseAssistant: canUseAssistant(plan),
    canUseReports: canUseReports(plan),
    canUseVetAccess: canUseVetAccess(plan),
    isOverPetLimit: isOverPetLimit(plan, petCount),
    historyCutoffIso: historyCutoffIso(plan),
    historyDays: limits.historyDays,
    planUnlockLabel,
  };
}
