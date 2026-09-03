/**
 * create-portal — Open the Stripe Customer Billing Portal for the signed-in user.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  jsonResponse,
  optionsResponse,
} from "../_shared/cors.ts";
import { appOrigin, createStripeClient } from "../_shared/stripe.ts";

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

    let returnOrigin: string | undefined;
    try {
      const body = await req.json();
      if (body && typeof body.returnOrigin === "string") {
        returnOrigin = body.returnOrigin;
      }
    } catch {
      // empty / non-JSON body is fine
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: sub, error: subError } = await admin
      .from("billing_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (subError) {
      console.error("portal subscription lookup failed", subError);
      return jsonResponse({ error: "Could not load billing profile" }, 500);
    }

    const customerId = sub?.stripe_customer_id;
    if (!customerId) {
      return jsonResponse(
        { error: "No Stripe customer on file. Subscribe first." },
        400,
      );
    }

    const stripe = createStripeClient();
    const origin = appOrigin(returnOrigin);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/settings`,
    });

    if (!session.url) {
      return jsonResponse({ error: "Portal session missing URL" }, 500);
    }

    return jsonResponse({ url: session.url });
  } catch (err) {
    console.error("create-portal error", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Portal failed" },
      500,
    );
  }
});
