/**
 * Server-side Stripe price ID mapping.
 * NEVER accept price IDs from the client — resolve only from env.
 */

import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";

export type PaidPlan = "guardiao" | "familia";
export type BillingInterval = "month" | "year";
export type PlanId = "essencial" | PaidPlan;

export type PriceMapping = {
  plan: PaidPlan;
  interval: BillingInterval;
  founder: boolean;
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

/** Env var names for each (plan, interval, founder) combination. */
export function priceEnvKey(
  plan: PaidPlan,
  interval: BillingInterval,
  founder = false,
): string {
  if (founder) {
    if (interval !== "year") {
      throw new Error("Founder pricing is yearly only");
    }
    return plan === "guardiao"
      ? "STRIPE_PRICE_GUARDIAO_FOUNDER_YEARLY"
      : "STRIPE_PRICE_FAMILIA_FOUNDER_YEARLY";
  }

  if (plan === "guardiao" && interval === "month") {
    return "STRIPE_PRICE_GUARDIAO_MONTHLY";
  }
  if (plan === "guardiao" && interval === "year") {
    return "STRIPE_PRICE_GUARDIAO_YEARLY";
  }
  if (plan === "familia" && interval === "month") {
    return "STRIPE_PRICE_FAMILIA_MONTHLY";
  }
  return "STRIPE_PRICE_FAMILIA_YEARLY";
}

/** Resolve Stripe Price ID from plan/interval/founder flags (server env only). */
export function resolvePriceId(
  plan: PaidPlan,
  interval: BillingInterval,
  founder = false,
): string {
  return requireEnv(priceEnvKey(plan, interval, founder));
}

/** Build reverse map: price_id → plan/interval/founder. */
export function buildPriceIdMap(): Map<string, PriceMapping> {
  const entries: Array<[string, PriceMapping]> = [
    [
      Deno.env.get("STRIPE_PRICE_GUARDIAO_MONTHLY")?.trim() ?? "",
      { plan: "guardiao", interval: "month", founder: false },
    ],
    [
      Deno.env.get("STRIPE_PRICE_GUARDIAO_YEARLY")?.trim() ?? "",
      { plan: "guardiao", interval: "year", founder: false },
    ],
    [
      Deno.env.get("STRIPE_PRICE_FAMILIA_MONTHLY")?.trim() ?? "",
      { plan: "familia", interval: "month", founder: false },
    ],
    [
      Deno.env.get("STRIPE_PRICE_FAMILIA_YEARLY")?.trim() ?? "",
      { plan: "familia", interval: "year", founder: false },
    ],
    [
      Deno.env.get("STRIPE_PRICE_GUARDIAO_FOUNDER_YEARLY")?.trim() ?? "",
      { plan: "guardiao", interval: "year", founder: true },
    ],
    [
      Deno.env.get("STRIPE_PRICE_FAMILIA_FOUNDER_YEARLY")?.trim() ?? "",
      { plan: "familia", interval: "year", founder: true },
    ],
  ];

  const map = new Map<string, PriceMapping>();
  for (const [priceId, mapping] of entries) {
    if (priceId) map.set(priceId, mapping);
  }
  return map;
}

export function planFromPriceId(
  priceId: string | null | undefined,
): PriceMapping | null {
  if (!priceId) return null;
  return buildPriceIdMap().get(priceId) ?? null;
}

export function createStripeClient(): Stripe {
  const key = requireEnv("STRIPE_SECRET_KEY");
  return new Stripe(key, {
    apiVersion: "2024-11-20.acacia",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

/**
 * Resolve the public app origin for Stripe success/cancel/portal return URLs.
 * Prefer PUBLIC_APP_URL (production) so clients cannot redirect to preview hosts.
 * Optional returnOrigin is only used as a local-dev fallback when PUBLIC_APP_URL is unset.
 */
export function appOrigin(returnOrigin?: string | null): string {
  const fromEnv = Deno.env.get("PUBLIC_APP_URL")?.trim().replace(/\/+$/, "");
  if (fromEnv && /^https?:\/\//i.test(fromEnv)) {
    return fromEnv;
  }
  const fromBody = returnOrigin?.trim().replace(/\/+$/, "");
  if (fromBody && /^https?:\/\//i.test(fromBody)) {
    return fromBody;
  }
  throw new Error("PUBLIC_APP_URL is not configured");
}

/** Active Stripe statuses that grant paid plan entitlements. */
export const ACTIVE_SUB_STATUSES = new Set(["active", "trialing"]);

export function isPaidPlan(plan: string | null | undefined): plan is PaidPlan {
  return plan === "guardiao" || plan === "familia";
}

export function subscriptionItemPriceId(
  subscription: Stripe.Subscription,
): string | null {
  const item = subscription.items?.data?.[0];
  const price = item?.price;
  if (!price) return null;
  return typeof price === "string" ? price : price.id;
}

/** List active/trialing subscriptions for a Stripe customer (authoritative). */
export async function listActiveSubscriptionsForCustomer(
  stripe: Stripe,
  customerId: string,
): Promise<Stripe.Subscription[]> {
  const result: Stripe.Subscription[] = [];
  for (const status of ["active", "trialing"] as const) {
    const page = await stripe.subscriptions.list({
      customer: customerId,
      status,
      limit: 20,
    });
    result.push(...page.data);
  }
  return result;
}

/**
 * Prefer the subscription id we already track in PetID; otherwise the newest.
 */
export function pickPrimarySubscription(
  subs: Stripe.Subscription[],
  preferredId: string | null | undefined,
): Stripe.Subscription | null {
  if (subs.length === 0) return null;
  if (preferredId) {
    const preferred = subs.find((s) => s.id === preferredId);
    if (preferred) return preferred;
  }
  return [...subs].sort((a, b) => (b.created ?? 0) - (a.created ?? 0))[0] ?? null;
}
