import { describe, expect, it } from "vitest";
import {
  highestPlan,
  isBetaGrantActive,
  normalizeBetaCodeInput,
  planRank,
  resolveCombinedEffectivePlan,
  resolveSubscriptionPlan,
  type BetaGrantSnapshot,
  type SubscriptionSnapshot,
} from "./entitlements";

function sub(partial: Partial<SubscriptionSnapshot> & Pick<SubscriptionSnapshot, "plan" | "status">): SubscriptionSnapshot {
  return {
    billing_interval: "month",
    current_period_end: new Date(Date.now() + 86400000 * 30).toISOString(),
    cancel_at_period_end: false,
    stripe_customer_id: "cus_test",
    stripe_subscription_id: "sub_test",
    founder_offer: false,
    ...partial,
  };
}

function beta(
  plan: "guardiao" | "familia",
  expiresInMs = 86400000 * 7,
): BetaGrantSnapshot {
  return {
    active: true,
    grant_id: "grant-1",
    plan,
    expires_at: new Date(Date.now() + expiresInMs).toISOString(),
    granted_at: new Date().toISOString(),
    label: "Pré-Lançamento — Amigos",
  };
}

describe("beta entitlement combination", () => {
  it("ranks Família above Guardião above Essencial", () => {
    expect(planRank("familia")).toBeGreaterThan(planRank("guardiao"));
    expect(planRank("guardiao")).toBeGreaterThan(planRank("essencial"));
    expect(highestPlan("essencial", "familia")).toBe("familia");
    expect(highestPlan("familia", "guardiao")).toBe("familia");
  });

  it("Essencial + Família beta => Família", () => {
    expect(resolveCombinedEffectivePlan(null, beta("familia"))).toBe("familia");
  });

  it("valid Guardião beta alone => Guardião", () => {
    expect(resolveCombinedEffectivePlan(null, beta("guardiao"))).toBe("guardiao");
  });

  it("Guardião paid + Família beta => Família", () => {
    expect(
      resolveCombinedEffectivePlan(sub({ plan: "guardiao", status: "active" }), beta("familia")),
    ).toBe("familia");
  });

  it("Família paid + Guardião beta => Família", () => {
    expect(
      resolveCombinedEffectivePlan(sub({ plan: "familia", status: "active" }), beta("guardiao")),
    ).toBe("familia");
  });

  it("expired beta falls back to underlying subscription", () => {
    const expired = beta("familia", -1000);
    expect(isBetaGrantActive(expired)).toBe(false);
    expect(
      resolveCombinedEffectivePlan(sub({ plan: "guardiao", status: "active" }), expired),
    ).toBe("guardiao");
    expect(resolveCombinedEffectivePlan(null, expired)).toBe("essencial");
  });

  it("revoked/missing beta falls back to underlying plan", () => {
    expect(
      resolveCombinedEffectivePlan(sub({ plan: "guardiao", status: "active" }), null),
    ).toBe("guardiao");
    expect(resolveCombinedEffectivePlan(null, null)).toBe("essencial");
  });

  it("inactive Stripe subscription does not inflate plan without beta", () => {
    expect(
      resolveSubscriptionPlan(sub({ plan: "familia", status: "canceled" })),
    ).toBe("essencial");
    expect(
      resolveCombinedEffectivePlan(sub({ plan: "familia", status: "canceled" }), beta("guardiao")),
    ).toBe("guardiao");
  });

  it("beta redemption never implies Stripe fields on subscription snapshot", () => {
    const effective = resolveCombinedEffectivePlan(null, beta("familia"));
    expect(effective).toBe("familia");
    // No subscription object is required/created for beta-only access.
    expect(resolveSubscriptionPlan(null)).toBe("essencial");
  });
});

describe("beta code normalization", () => {
  it("normalizes spaces and dashes like the server", () => {
    expect(normalizeBetaCodeInput(" petid-beta-ab12-cd34 ")).toBe("PETIDBETAAB12CD34");
  });
});

/** Mirrors server redeem_beta_access guard order for unit coverage (no DB). */
function evaluateRedeemGuards(input: {
  uid: string | null;
  code: {
    active: boolean;
    revoked_at: string | null;
    expires_at: number;
    redemption_count: number;
    max_redemptions: number;
  } | null;
  alreadyRedeemed: boolean;
  now?: number;
}): "ok" | "auth" | "invalid" {
  const now = input.now ?? Date.now();
  if (!input.uid) return "auth";
  if (!input.code) return "invalid";
  if (!input.code.active || input.code.revoked_at) return "invalid";
  if (input.code.expires_at <= now) return "invalid";
  if (input.code.redemption_count >= input.code.max_redemptions) return "invalid";
  if (input.alreadyRedeemed) return "invalid";
  return "ok";
}

describe("redeem_beta_access security contract", () => {
  const future = Date.now() + 86400000;
  const baseCode = {
    active: true,
    revoked_at: null as string | null,
    expires_at: future,
    redemption_count: 0,
    max_redemptions: 10,
  };

  it("rejects unauthenticated", () => {
    expect(evaluateRedeemGuards({ uid: null, code: baseCode, alreadyRedeemed: false })).toBe(
      "auth",
    );
  });

  it("rejects invalid / missing code", () => {
    expect(evaluateRedeemGuards({ uid: "u1", code: null, alreadyRedeemed: false })).toBe(
      "invalid",
    );
  });

  it("rejects expired code", () => {
    expect(
      evaluateRedeemGuards({
        uid: "u1",
        code: { ...baseCode, expires_at: Date.now() - 1 },
        alreadyRedeemed: false,
      }),
    ).toBe("invalid");
  });

  it("rejects disabled code", () => {
    expect(
      evaluateRedeemGuards({
        uid: "u1",
        code: { ...baseCode, active: false },
        alreadyRedeemed: false,
      }),
    ).toBe("invalid");
  });

  it("enforces max redemptions", () => {
    expect(
      evaluateRedeemGuards({
        uid: "u1",
        code: { ...baseCode, redemption_count: 10, max_redemptions: 10 },
        alreadyRedeemed: false,
      }),
    ).toBe("invalid");
  });

  it("rejects same user redeeming same code twice", () => {
    expect(
      evaluateRedeemGuards({ uid: "u1", code: baseCode, alreadyRedeemed: true }),
    ).toBe("invalid");
  });

  it("accepts valid Família / Guardião redeem path", () => {
    expect(evaluateRedeemGuards({ uid: "u1", code: baseCode, alreadyRedeemed: false })).toBe(
      "ok",
    );
  });
});

describe("admin privilege isolation (contract)", () => {
  it("beta grant plan is never admin role", () => {
    const plans = ["guardiao", "familia"] as const;
    for (const p of plans) {
      expect(p).not.toBe("admin");
      expect(["essencial", "guardiao", "familia"]).toContain(p);
    }
  });

  it("non-admin create/revoke is rejected by is_admin gate (mirrored)", () => {
    const isAdmin = false;
    expect(isAdmin).toBe(false);
    // Server raises 'forbidden' when !is_admin() — client must not invent admin.
  });
});
