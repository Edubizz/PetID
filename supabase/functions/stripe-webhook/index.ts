/**
 * stripe-webhook — Verify Stripe signatures and sync billing_subscriptions.
 * Idempotent via billing_stripe_events.primary key on event_id.
 *
 * Stripe is authoritative. Handlers reconcile from LIVE customer subscription
 * state so an old canceled/deleted subscription cannot downgrade a user who
 * still has a different active/trialing subscription.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import {
  ACTIVE_SUB_STATUSES,
  createStripeClient,
  listActiveSubscriptionsForCustomer,
  planFromPriceId,
  subscriptionItemPriceId,
  type PaidPlan,
} from "../_shared/stripe.ts";

type AdminClient = SupabaseClient;
type StripeClient = ReturnType<typeof createStripeClient>;

function unixToIso(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

function metaFlagTrue(value: string | undefined | null): boolean {
  return value === "true" || value === "1";
}

function isPaidPlanFromMeta(plan: string | undefined): boolean {
  return plan === "guardiao" || plan === "familia";
}

async function resolveUserId(
  admin: AdminClient,
  opts: {
    metadataUserId?: string | null;
    clientReferenceId?: string | null;
    customerId?: string | null;
    subscriptionId?: string | null;
  },
): Promise<string | null> {
  const meta = opts.metadataUserId?.trim();
  if (meta && /^[0-9a-f-]{36}$/i.test(meta)) return meta;

  const ref = opts.clientReferenceId?.trim();
  if (ref && /^[0-9a-f-]{36}$/i.test(ref)) return ref;

  if (opts.subscriptionId) {
    const { data } = await admin
      .from("billing_subscriptions")
      .select("user_id")
      .eq("stripe_subscription_id", opts.subscriptionId)
      .maybeSingle();
    if (data?.user_id) return data.user_id;
  }

  if (opts.customerId) {
    const { data } = await admin
      .from("billing_subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", opts.customerId)
      .maybeSingle();
    if (data?.user_id) return data.user_id;
  }

  return null;
}

async function loadBillingRow(admin: AdminClient, userId: string) {
  const { data, error } = await admin
    .from("billing_subscriptions")
    .select(
      "user_id, plan, status, stripe_customer_id, stripe_subscription_id, updated_at, founder_offer",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Write Essencial when Stripe confirms zero active/trialing subscriptions. */
async function writeEssencial(
  admin: AdminClient,
  userId: string,
  customerId: string | null,
): Promise<void> {
  const { error } = await admin.from("billing_subscriptions").upsert(
    {
      user_id: userId,
      plan: "essencial",
      billing_interval: null,
      stripe_customer_id: customerId,
      stripe_subscription_id: null,
      status: "canceled",
      current_period_end: null,
      cancel_at_period_end: false,
      stripe_price_id: null,
      founder_offer: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    console.error("writeEssencial failed", error);
    throw error;
  }
}

/** Persist one active/trialing subscription as the user's current plan. */
async function writeFromActiveSubscription(
  admin: AdminClient,
  userId: string,
  subscription: Stripe.Subscription,
  extras: { founderOffer?: boolean } = {},
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;

  const priceId = subscriptionItemPriceId(subscription);
  const mapped = planFromPriceId(priceId);
  const status = subscription.status ?? "none";

  if (!ACTIVE_SUB_STATUSES.has(status)) {
    throw new Error(
      `writeFromActiveSubscription called with non-active status=${status}`,
    );
  }

  let plan: PaidPlan | "essencial" = "essencial";
  let interval: "month" | "year" | null = null;
  let founderOffer = Boolean(extras.founderOffer);

  if (mapped) {
    plan = mapped.plan;
    interval = mapped.interval;
    founderOffer = founderOffer || mapped.founder;
  } else if (isPaidPlanFromMeta(subscription.metadata?.plan)) {
    plan = subscription.metadata.plan as PaidPlan;
    const iv = subscription.metadata?.interval;
    interval = iv === "month" || iv === "year" ? iv : null;
    founderOffer = founderOffer || metaFlagTrue(subscription.metadata?.founder);
  } else {
    console.error("writeFromActiveSubscription: unmapped price — refusing Essencial downgrade", {
      subscriptionId: subscription.id,
      priceId,
    });
    throw new Error(
      `Active subscription ${subscription.id} has unmapped price ${priceId ?? "null"}`,
    );
  }

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
      founder_offer: founderOffer,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("writeFromActiveSubscription failed", error);
    throw error;
  }
}

type ReconcileResult = "essencial" | "synced" | "conflict" | "unresolved_user";

/**
 * Reconcile PetID billing from LIVE Stripe customer state.
 * Never trusts a single deleted/canceled payload alone.
 */
async function reconcileFromStripeCustomer(
  admin: AdminClient,
  stripe: StripeClient,
  opts: {
    userId?: string | null;
    customerId?: string | null;
    metadataUserId?: string | null;
    hintSubscriptionId?: string | null;
    founderOffer?: boolean;
    eventType?: string;
  },
): Promise<ReconcileResult> {
  const customerId = opts.customerId?.trim() || null;
  if (!customerId) {
    console.error("reconcile: missing customerId", opts.eventType);
    return "unresolved_user";
  }

  const userId =
    opts.userId ??
    (await resolveUserId(admin, {
      metadataUserId: opts.metadataUserId,
      customerId,
      subscriptionId: opts.hintSubscriptionId,
    }));

  if (!userId) {
    console.error("reconcile: could not resolve user", {
      customerId,
      hintSubscriptionId: opts.hintSubscriptionId,
      eventType: opts.eventType,
    });
    return "unresolved_user";
  }

  const active = await listActiveSubscriptionsForCustomer(stripe, customerId);

  if (active.length === 0) {
    await writeEssencial(admin, userId, customerId);
    console.info("reconcile: no active/trialing → Essencial", {
      userId,
      customerId,
      eventType: opts.eventType,
    });
    return "essencial";
  }

  if (active.length === 1) {
    await writeFromActiveSubscription(admin, userId, active[0], {
      founderOffer: opts.founderOffer,
    });
    console.info("reconcile: synced single active subscription", {
      userId,
      customerId,
      subscriptionId: active[0].id,
      eventType: opts.eventType,
    });
    return "synced";
  }

  // 2+ active/trialing — fail closed; do not pick arbitrarily or downgrade.
  console.error("reconcile: multiple_active_subscriptions — leaving local billing unchanged", {
    userId,
    customerId,
    subscriptionIds: active.map((s) => s.id),
    eventType: opts.eventType,
  });
  return "conflict";
}

async function incrementFounderRedeemed(admin: AdminClient): Promise<void> {
  const { data: promo, error } = await admin
    .from("billing_promo_config")
    .select("subscriptions_redeemed")
    .eq("id", "founder")
    .maybeSingle();

  if (error) {
    console.error("founder promo read failed", error);
    throw error;
  }

  const next = (promo?.subscriptions_redeemed ?? 0) + 1;
  const { error: updErr } = await admin
    .from("billing_promo_config")
    .update({
      subscriptions_redeemed: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "founder");

  if (updErr) {
    console.error("founder promo increment failed", updErr);
    throw updErr;
  }
}

async function handleCheckoutCompleted(
  admin: AdminClient,
  stripe: StripeClient,
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (session.mode !== "subscription") return;

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  if (!subscriptionId) {
    console.error("checkout.session.completed missing subscription", session.id);
    return;
  }

  // Fresh retrieve — do not trust only the session snapshot.
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ??
        (typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id ?? null);

  const userId = await resolveUserId(admin, {
    metadataUserId: session.metadata?.user_id ?? subscription.metadata?.user_id,
    clientReferenceId: session.client_reference_id,
    customerId,
    subscriptionId,
  });

  const founder =
    metaFlagTrue(session.metadata?.founder) ||
    metaFlagTrue(subscription.metadata?.founder) ||
    Boolean(planFromPriceId(subscriptionItemPriceId(subscription))?.founder);

  const result = await reconcileFromStripeCustomer(admin, stripe, {
    userId,
    customerId,
    metadataUserId: session.metadata?.user_id ?? subscription.metadata?.user_id,
    hintSubscriptionId: subscriptionId,
    founderOffer: founder,
    eventType: "checkout.session.completed",
  });

  if (result === "synced" && founder) {
    await incrementFounderRedeemed(admin);
  }
}

/**
 * customer.subscription.deleted — NEVER force Essencial from the deleted payload alone.
 * Reconcile live Stripe customer state.
 */
async function handleSubscriptionDeleted(
  admin: AdminClient,
  stripe: StripeClient,
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;

  const userId = await resolveUserId(admin, {
    metadataUserId: subscription.metadata?.user_id,
    customerId,
    subscriptionId: subscription.id,
  });

  if (userId) {
    const row = await loadBillingRow(admin, userId);
    const trackedId = row?.stripe_subscription_id ?? null;

    // Old / non-tracked subscription deleted while we track a different id:
    // still reconcile (may sync the remaining active), but never assume Essencial.
    if (trackedId && trackedId !== subscription.id) {
      console.info(
        "subscription.deleted for non-tracked subscription — reconciling live Stripe state",
        {
          userId,
          deletedId: subscription.id,
          trackedId,
        },
      );
    }
  }

  await reconcileFromStripeCustomer(admin, stripe, {
    userId,
    customerId,
    metadataUserId: subscription.metadata?.user_id,
    hintSubscriptionId: subscription.id,
    eventType: "customer.subscription.deleted",
  });
}

/**
 * customer.subscription.updated — reconcile from live customer state so a
 * canceled/stale update on an old subscription cannot overwrite a newer active plan.
 */
async function handleSubscriptionUpdated(
  admin: AdminClient,
  stripe: StripeClient,
  subscription: Stripe.Subscription,
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;

  const userId = await resolveUserId(admin, {
    metadataUserId: subscription.metadata?.user_id,
    customerId,
    subscriptionId: subscription.id,
  });

  await reconcileFromStripeCustomer(admin, stripe, {
    userId,
    customerId,
    metadataUserId: subscription.metadata?.user_id,
    hintSubscriptionId: subscription.id,
    founderOffer: metaFlagTrue(subscription.metadata?.founder),
    eventType: "customer.subscription.updated",
  });
}

async function handleInvoicePaid(
  admin: AdminClient,
  stripe: StripeClient,
  invoice: Stripe.Invoice,
): Promise<void> {
  const subscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id;

  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id ?? null;

  // Always reconcile live customer state (covers invoices on old/canceled subs).
  let metadataUserId: string | null = null;
  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      metadataUserId = sub.metadata?.user_id ?? null;
    } catch (err) {
      console.warn("invoice.paid: could not retrieve subscription", subscriptionId, err);
    }
  }

  const userId = await resolveUserId(admin, {
    metadataUserId,
    customerId,
    subscriptionId: subscriptionId ?? null,
  });

  await reconcileFromStripeCustomer(admin, stripe, {
    userId,
    customerId,
    metadataUserId,
    hintSubscriptionId: subscriptionId ?? null,
    eventType: "invoice.paid",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const stripe = createStripeClient();
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")?.trim();
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET missing");
    return new Response("Server misconfigured", { status: 500 });
  }

  const signature = req.headers.get("Stripe-Signature");
  if (!signature) {
    return new Response("Missing Stripe-Signature", { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
    );
  } catch (err) {
    console.error("Webhook signature verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response("Server misconfigured", { status: 500 });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // Idempotency: insert event id first; duplicates are ignored.
  const { error: insertError } = await admin
    .from("billing_stripe_events")
    .insert({ event_id: event.id, type: event.type });

  if (insertError) {
    const code = (insertError as { code?: string }).code;
    const msg = String(insertError.message ?? "").toLowerCase();
    if (code === "23505" || msg.includes("duplicate") || msg.includes("unique")) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("billing_stripe_events insert failed", insertError);
    return new Response("Event log failed", { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(admin, stripe, session);
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(admin, stripe, subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(admin, stripe, subscription);
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(admin, stripe, invoice);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(`Error handling ${event.type}`, err);
    // Event was logged; return 500 so Stripe retries. On retry, duplicate insert
    // short-circuits — so delete the log row on failure for true retries.
    await admin.from("billing_stripe_events").delete().eq("event_id", event.id);
    return new Response("Handler failed", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
