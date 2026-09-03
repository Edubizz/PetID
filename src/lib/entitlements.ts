/**
 * Central plan / entitlement matrix (Sprint 7 + beta access).
 * UI and hooks must use these helpers — never scatter `plan === "familia"` checks.
 *
 * Effective plan = highest of (real subscription plan, active beta grant).
 * Beta never mutates Stripe state.
 */

export type PlanId = "essencial" | "guardiao" | "familia";
export type BillingInterval = "month" | "year";

export type PlanLimits = {
  petLimit: number;
  /** Max rows in `caretakers` per pet (cotutores / contatos de cuidado). */
  caretakersPerPet: number;
  /** Max secondary/emergency-style contacts exposed via Identity (1 field today). */
  protectedContacts: number;
  /** null = unlimited */
  documentsPerPet: number | null;
  /** null = full history */
  historyDays: number | null;
  reminders: boolean;
  assistant: boolean;
  reports: boolean;
  vetAccess: boolean;
  familyPermissions: boolean;
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  essencial: {
    petLimit: 1,
    caretakersPerPet: 0,
    protectedContacts: 1,
    documentsPerPet: 3,
    historyDays: 30,
    reminders: false,
    assistant: false,
    reports: false,
    vetAccess: false,
    familyPermissions: false,
  },
  guardiao: {
    petLimit: 1,
    caretakersPerPet: 1,
    protectedContacts: 3,
    documentsPerPet: null,
    historyDays: null,
    reminders: true,
    assistant: true,
    reports: true,
    vetAccess: true,
    familyPermissions: false,
  },
  familia: {
    petLimit: 3,
    caretakersPerPet: 5,
    protectedContacts: 5,
    documentsPerPet: null,
    historyDays: null,
    reminders: true,
    assistant: true,
    reports: true,
    vetAccess: true,
    familyPermissions: true,
  },
};

export const PLAN_META: Record<
  PlanId,
  {
    name: string;
    tagline: string;
    monthlyPriceLabel: string | null;
    yearlyPriceLabel: string | null;
  }
> = {
  essencial: {
    name: "Essencial",
    tagline: "Identidade digital e segurança básica — grátis.",
    monthlyPriceLabel: null,
    yearlyPriceLabel: null,
  },
  guardiao: {
    name: "Guardião",
    tagline: "Lembretes, assistente, relatórios e acesso veterinário.",
    monthlyPriceLabel: "R$ 9,90",
    yearlyPriceLabel: "R$ 99",
  },
  familia: {
    name: "Família",
    tagline: "Até 3 pets e colaboração completa da família.",
    monthlyPriceLabel: "R$ 14,90",
    yearlyPriceLabel: "R$ 149",
  },
};

export type EntitlementKey =
  | "reminders"
  | "assistant"
  | "reports"
  | "vet_access"
  | "family_permissions";

export type CheckoutPlanKey = "guardiao" | "familia";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export type SubscriptionSnapshot = {
  plan: PlanId;
  billing_interval: BillingInterval | null;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  founder_offer: boolean;
};

/** Active beta grant returned by get_my_entitlements (never includes code plaintext/hash). */
export type BetaGrantSnapshot = {
  active: true;
  grant_id: string;
  plan: CheckoutPlanKey;
  expires_at: string;
  granted_at: string;
  label: string | null;
};

export function normalizePlanId(raw: unknown): PlanId {
  if (raw === "guardiao" || raw === "familia" || raw === "essencial") return raw;
  return "essencial";
}

export function planRank(plan: PlanId): number {
  switch (plan) {
    case "familia":
      return 2;
    case "guardiao":
      return 1;
    default:
      return 0;
  }
}

/** Highest entitlement between two plans (Família > Guardião > Essencial). */
export function highestPlan(a: PlanId, b: PlanId): PlanId {
  return planRank(a) >= planRank(b) ? a : b;
}

/**
 * Resolve plan from Stripe/local subscription only (ignore beta).
 * Missing / inactive subscription → Essencial.
 */
export function resolveSubscriptionPlan(sub: SubscriptionSnapshot | null | undefined): PlanId {
  if (!sub) return "essencial";
  const plan = normalizePlanId(sub.plan);
  if (plan === "essencial") return "essencial";
  if (!ACTIVE_STATUSES.has(String(sub.status || "").toLowerCase())) return "essencial";
  if (sub.current_period_end) {
    const end = new Date(sub.current_period_end).getTime();
    if (Number.isFinite(end) && end < Date.now()) return "essencial";
  }
  return plan;
}

/** @deprecated Prefer resolveSubscriptionPlan — subscription-only (same behavior). */
export function resolveEffectivePlan(sub: SubscriptionSnapshot | null | undefined): PlanId {
  return resolveSubscriptionPlan(sub);
}

export function isBetaGrantActive(
  beta: BetaGrantSnapshot | null | undefined,
  now = new Date(),
): beta is BetaGrantSnapshot {
  if (!beta?.active) return false;
  if (beta.plan !== "guardiao" && beta.plan !== "familia") return false;
  const end = new Date(beta.expires_at).getTime();
  return Number.isFinite(end) && end > now.getTime();
}

/**
 * Effective plan = max(subscription, active beta).
 * Expired/revoked beta is ignored (pass null).
 */
export function resolveCombinedEffectivePlan(
  subscription: SubscriptionSnapshot | null | undefined,
  beta: BetaGrantSnapshot | null | undefined,
  now = new Date(),
): PlanId {
  const paid = resolveSubscriptionPlan(subscription);
  const betaPlan = isBetaGrantActive(beta, now) ? normalizePlanId(beta.plan) : "essencial";
  return highestPlan(paid, betaPlan);
}

export function getPlanLimits(plan: PlanId): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.essencial;
}

export function hasEntitlement(plan: PlanId, key: EntitlementKey): boolean {
  const L = getPlanLimits(plan);
  switch (key) {
    case "reminders":
      return L.reminders;
    case "assistant":
      return L.assistant;
    case "reports":
      return L.reports;
    case "vet_access":
      return L.vetAccess;
    case "family_permissions":
      return L.familyPermissions;
    default:
      return false;
  }
}

export function getPlanLimit(
  plan: PlanId,
  key: keyof PlanLimits,
): PlanLimits[keyof PlanLimits] {
  return getPlanLimits(plan)[key];
}

export function canCreatePet(plan: PlanId, currentPetCount: number): boolean {
  return currentPetCount < getPlanLimits(plan).petLimit;
}

export function canUploadDocument(plan: PlanId, currentDocCount: number): boolean {
  const max = getPlanLimits(plan).documentsPerPet;
  if (max == null) return true;
  return currentDocCount < max;
}

export function canAddCaretaker(plan: PlanId, currentCaretakerCount: number): boolean {
  return currentCaretakerCount < getPlanLimits(plan).caretakersPerPet;
}

export function canUseAssistant(plan: PlanId): boolean {
  return hasEntitlement(plan, "assistant");
}

export function canUseVetAccess(plan: PlanId): boolean {
  return hasEntitlement(plan, "vet_access");
}

export function canUseReminders(plan: PlanId): boolean {
  return hasEntitlement(plan, "reminders");
}

export function canUseReports(plan: PlanId): boolean {
  return hasEntitlement(plan, "reports");
}

/** History older than this remains stored; free plan only hides it in UI. */
export function historyCutoffIso(plan: PlanId, now = new Date()): string | null {
  const days = getPlanLimits(plan).historyDays;
  if (days == null) return null;
  const d = new Date(now);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export function isOverPetLimit(plan: PlanId, petCount: number): boolean {
  return petCount > getPlanLimits(plan).petLimit;
}

export function planUnlockLabel(feature: EntitlementKey | "pets" | "documents" | "caretakers"): string {
  switch (feature) {
    case "reminders":
    case "assistant":
    case "reports":
    case "vet_access":
      return "Disponível no plano Guardião ou Família.";
    case "family_permissions":
    case "pets":
      return "Disponível no plano Família.";
    case "documents":
    case "caretakers":
      return "Faça upgrade para aumentar o limite.";
    default:
      return "Faça upgrade para desbloquear.";
  }
}

/** Checkout selection keys sent to the edge function (never raw price IDs from the client as authority). */
export type CheckoutSelection = {
  plan: CheckoutPlanKey;
  interval: BillingInterval;
  founder?: boolean;
};

/** Normalize beta code input the same way the server does (alphanumeric upper). */
export function normalizeBetaCodeInput(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
