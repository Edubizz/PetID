/**
 * create-checkout — Start Stripe Checkout OR safely change an existing subscription.
 *
 * Rule: a PetID account may have at most ONE active/trialing Stripe subscription.
 * If one already exists (including cancel_at_period_end=true), update that
 * subscription instead of creating a parallel Checkout subscription.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import {
  jsonResponse,
  optionsResponse,
} from "../_shared/cors.ts";
import {
  ACTIVE_SUB_STATUSES,
  appOrigin,
  createStripeClient,
  isPaidPlan,
  listActiveSubscriptionsForCustomer,
  planFromPriceId,
  resolvePriceId,
  subscriptionItemPriceId,
  type BillingInterval,
  type PaidPlan,
} from "../_shared/stripe.ts";

type CheckoutBody = {
  plan?: string;
  interval?: string;
  founder?: boolean;
  returnOrigin?: string;
};

function unixToIso(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

async function syncBillingRow(
  admin: ReturnType<typeof createClient>,
  userId: string,
  subscription: Stripe.Subscription,
  extras: { plan: PaidPlan; interval: BillingInterval; founder: boolean },
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;
  const priceId = subscriptionItemPriceId(subscription);
  const mapped = planFromPriceId(priceId);
  const status = subscription.status ?? "none";
  const active = ACTIVE_SUB_STATUSES.has(status);

  const plan = active ? (mapped?.plan ?? extras.plan) : ("essencial" as const);
  const interval = active ? (mapped?.interval ?? extras.interval) : null;

  const { error } = await admin.from("billing_subscriptions").upsert(
    {
      user_id: userId,
      plan,
      billing_interval: interval,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      status,
      current_period_end: unixToIso(subscription.current_period_end),
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      stripe_price_id: priceId,
      founder_offer: Boolean(extras.founder || mapped?.founder),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("create-checkout: billing sync failed", error);
    throw error;
  }
}

type PlanChangeOk = {
  ok: true;
  unchanged: boolean;
  subscription: Stripe.Subscription;
};

type PlanChangeErr = {
  ok: false;
  status: number;
  body: Record<string, unknown>;
};

/**
 * Update the single active/trialing subscription to the target price and
 * clear scheduled cancellation. Caller must ensure activeSubs.length === 1.
 */
async function changePlanOnExistingSubscription(opts: {
  stripe: ReturnType<typeof createStripeClient>;
  admin: ReturnType<typeof createClient>;
  userId: string;
  priceId: string;
  plan: PaidPlan;
  interval: BillingInterval;
  founder: boolean;
  subscription: Stripe.Subscription;
}): Promise<PlanChangeOk | PlanChangeErr> {
  const { stripe, admin, userId, priceId, plan, interval, founder, subscription } =
    opts;

  const itemId = subscription.items?.data?.[0]?.id;
  if (!itemId) {
    return {
      ok: false,
      status: 500,
      body: { error: "Existing subscription has no line items to update." },
    };
  }

  const currentPriceId = subscriptionItemPriceId(subscription);
  const alreadyOnTarget =
    currentPriceId === priceId && !subscription.cancel_at_period_end;

  if (alreadyOnTarget) {
    await syncBillingRow(admin, userId, subscription, { plan, interval, founder });
    return { ok: true, unchanged: true, subscription };
  }

  const updated = await stripe.subscriptions.update(subscription.id, {
    cancel_at_period_end: false,
    proration_behavior: "create_prorations",
    items: [{ id: itemId, price: priceId }],
    metadata: {
      user_id: userId,
      plan,
      interval,
      founder: founder ? "true" : "false",
    },
  });

  await syncBillingRow(admin, userId, updated, { plan, interval, founder });
  return { ok: true, unchanged: false, subscription: updated };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return optionsResponse();
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    let body: CheckoutBody;
    try {
      body = (await req.json()) as CheckoutBody;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    // Never accept client-supplied Stripe price IDs.
    const rawBody = body as Record<string, unknown>;
    if (
      typeof rawBody.price === "string" ||
      typeof rawBody.price_id === "string" ||
      typeof rawBody.priceId === "string" ||
      typeof rawBody.stripe_price_id === "string"
    ) {
      return jsonResponse(
        {
          error: "Client-supplied price IDs are not accepted.",
          code: "price_id_not_allowed",
        },
        400,
      );
    }

    const plan = body.plan;
    const interval = body.interval;
    const founder = Boolean(body.founder);

    if (!isPaidPlan(plan)) {
      return jsonResponse(
        { error: 'Invalid plan. Use "guardiao" or "familia".' },
        400,
      );
    }
    if (interval !== "month" && interval !== "year") {
      return jsonResponse(
        { error: 'Invalid interval. Use "month" or "year".' },
        400,
      );
    }

    if (founder && interval !== "year") {
      return jsonResponse(
        { error: "Founder offer is available for yearly plans only." },
        400,
      );
    }

    const admin = createClient(supabaseUrl, serviceKey);

    if (founder) {
      const { data: promo, error: promoError } = await admin
        .from("billing_promo_config")
        .select(
          "active, ends_at, max_subscriptions, subscriptions_redeemed",
        )
        .eq("id", "founder")
        .maybeSingle();

      if (promoError) {
        console.error("founder promo lookup failed", promoError);
        return jsonResponse({ error: "Could not verify founder offer" }, 500);
      }

      const now = Date.now();
      const endsOk =
        !promo?.ends_at || new Date(promo.ends_at).getTime() > now;
      const capOk =
        promo?.max_subscriptions == null ||
        (promo.subscriptions_redeemed ?? 0) < promo.max_subscriptions;
      const founderActive = Boolean(promo?.active) && endsOk && capOk;

      if (!founderActive) {
        return jsonResponse(
          { error: "Founder offer is not currently available." },
          400,
        );
      }
    }

    let priceId: string;
    try {
      priceId = resolvePriceId(
        plan as PaidPlan,
        interval as BillingInterval,
        founder,
      );
    } catch (e) {
      console.error("price resolve failed", e);
      return jsonResponse({ error: "Billing prices are not configured" }, 500);
    }

    const stripe = createStripeClient();

    const { data: existing } = await admin
      .from("billing_subscriptions")
      .select(
        "user_id, stripe_customer_id, stripe_subscription_id, status, cancel_at_period_end",
      )
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = existing?.stripe_customer_id ?? null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      if (existing?.user_id) {
        const { error: updErr } = await admin
          .from("billing_subscriptions")
          .update({
            stripe_customer_id: customerId,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id);

        if (updErr) {
          console.error("customer update failed", updErr);
          return jsonResponse({ error: "Could not save billing customer" }, 500);
        }
      } else {
        const { error: insertErr } = await admin
          .from("billing_subscriptions")
          .insert({
            user_id: user.id,
            stripe_customer_id: customerId,
            plan: "essencial",
            status: "none",
            updated_at: new Date().toISOString(),
          });

        if (insertErr) {
          console.error("customer insert failed", insertErr);
          return jsonResponse({ error: "Could not save billing customer" }, 500);
        }
      }
    }

    // Authoritative: any active/trialing Stripe subscription for this customer?
    const activeOnStripe = await listActiveSubscriptionsForCustomer(
      stripe,
      customerId,
    );

    if (activeOnStripe.length > 1) {
      // Fail closed — never auto-cancel, never create Checkout, never mutate DB.
      console.error("create-checkout: multiple active subscriptions", {
        userId: user.id,
        customerId,
        subscriptionIds: activeOnStripe.map((s) => s.id),
      });
      return jsonResponse(
        {
          error:
            "Há mais de uma assinatura ativa nesta conta. Contate o suporte para revisão da cobrança antes de alterar o plano.",
          code: "multiple_active_subscriptions",
        },
        409,
      );
    }

    if (activeOnStripe.length === 1) {
      const result = await changePlanOnExistingSubscription({
        stripe,
        admin,
        userId: user.id,
        priceId,
        plan: plan as PaidPlan,
        interval: interval as BillingInterval,
        founder,
        subscription: activeOnStripe[0],
      });

      if (!result.ok) {
        return jsonResponse(result.body, result.status);
      }

      return jsonResponse({
        updated: true,
        unchanged: result.unchanged,
        mode: "plan_change",
        plan,
        interval,
        subscription_id: result.subscription.id,
        cancel_at_period_end: Boolean(result.subscription.cancel_at_period_end),
      });
    }

    const origin = appOrigin(body.returnOrigin);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/settings?billing=success`,
      cancel_url: `${origin}/settings?billing=cancel`,
      metadata: {
        user_id: user.id,
        plan,
        interval,
        founder: founder ? "true" : "false",
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan,
          interval,
          founder: founder ? "true" : "false",
        },
      },
    });

    if (!session.url) {
      return jsonResponse({ error: "Checkout session missing URL" }, 500);
    }

    return jsonResponse({ url: session.url, mode: "checkout" });
  } catch (err) {
    console.error("create-checkout error", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Checkout failed" },
      500,
    );
  }
});
