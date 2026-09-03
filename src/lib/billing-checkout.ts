import { supabase } from "@/integrations/supabase/client";
import type { BillingInterval, CheckoutPlanKey } from "@/lib/entitlements";

export type CheckoutInvokeResult =
  | { kind: "checkout"; url: string }
  | {
      kind: "plan_change";
      unchanged: boolean;
      plan: string;
      interval: string;
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/** Invoke create-checkout; handles both new Checkout and in-place plan change. */
export async function invokeCheckoutOrPlanChange(opts: {
  plan: CheckoutPlanKey;
  interval: BillingInterval;
  founder?: boolean;
}): Promise<CheckoutInvokeResult> {
  const { data, error } = await supabase.functions.invoke("create-checkout", {
    body: {
      plan: opts.plan,
      interval: opts.interval,
      founder: Boolean(opts.founder),
    },
  });

  if (error) {
    const ctx = error as { context?: Response };
    let body: unknown = data;
    if (!body && ctx.context) {
      try {
        body = await ctx.context.json();
      } catch {
        /* ignore */
      }
    }
    const row = asRecord(body);
    const message =
      typeof row?.error === "string" ? row.error : error.message || "Checkout failed";
    throw new Error(message);
  }

  const row = asRecord(data);
  if (!row) throw new Error("Resposta de cobrança inválida.");

  if (typeof row.error === "string") {
    throw new Error(row.error);
  }

  if (row.updated === true) {
    return {
      kind: "plan_change",
      unchanged: Boolean(row.unchanged),
      plan: typeof row.plan === "string" ? row.plan : opts.plan,
      interval: typeof row.interval === "string" ? row.interval : opts.interval,
    };
  }

  if (typeof row.url === "string" && row.url.startsWith("http")) {
    return { kind: "checkout", url: row.url };
  }

  throw new Error("Checkout URL missing");
}
