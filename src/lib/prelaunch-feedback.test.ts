import { describe, expect, it } from "vitest";
import { authCallbackUrl, emailConfirmRedirectUrl } from "./app-url";
import {
  COMPLETENESS_DESTINATIONS,
  resolveCompletenessDestination,
} from "./pet-navigation";
import { computeProfileCompleteness } from "./pet-profile";
import { parseRoutineQuantity } from "./daily-care";
import {
  activateTagHref,
  resolveActivationAwareDestination,
  setPendingTagActivation,
  clearPendingTagActivation,
} from "./pending-tag-activation";

/** Mirrors auth-callback post-session routing (legal gate → app). */
function resolvePostVerificationRoute(opts: {
  legalStatus: "accepted" | "pending" | "error";
  nextPath: string;
}): { to: string; search?: Record<string, unknown> } {
  if (opts.legalStatus !== "accepted") {
    return {
      to: "/legal-accept",
      search: {
        next: opts.nextPath,
        ...(opts.legalStatus === "error" ? { checkError: true } : {}),
      },
    };
  }
  return { to: opts.nextPath };
}

describe("email verification auth redirects", () => {
  it("email confirm redirectTo lands on /auth-callback (not bare origin)", () => {
    const url = emailConfirmRedirectUrl();
    expect(url).toBe(authCallbackUrl());
    expect(url).toMatch(/\/auth-callback\/?$/);
    expect(url).not.toMatch(/\/auth\/?$/);
    expect(url.replace(/\/auth-callback\/?$/, "")).not.toBe(url);
  });

  it("confirmed + missing legal acceptance routes to /legal-accept", () => {
    const route = resolvePostVerificationRoute({
      legalStatus: "pending",
      nextPath: "/dashboard",
    });
    expect(route.to).toBe("/legal-accept");
    expect(route.search?.next).toBe("/dashboard");
  });

  it("confirmed + accepted legal routes into the authenticated app", () => {
    const route = resolvePostVerificationRoute({
      legalStatus: "accepted",
      nextPath: "/dashboard",
    });
    expect(route.to).toBe("/dashboard");
    expect(route.search).toBeUndefined();
  });

  it("Google OAuth still uses the same auth-callback URL", () => {
    expect(authCallbackUrl()).toMatch(/\/auth-callback\/?$/);
  });

  it("pending tag activation still wins after verification next", () => {
    clearPendingTagActivation();
    setPendingTagActivation("AbCdEfGhIjKlMnOpQrStUv");
    const dest = resolveActivationAwareDestination("/dashboard");
    expect(dest).toEqual({
      kind: "activate-tag",
      token: "AbCdEfGhIjKlMnOpQrStUv",
    });
    expect(activateTagHref("AbCdEfGhIjKlMnOpQrStUv")).toContain("token=");
    clearPendingTagActivation();
  });
});

describe("pet completeness destinations", () => {
  const KNOWN_TABS = new Set([
    "dashboard",
    "daily-care",
    "health",
    "history",
    "reports",
    "info",
    "documents",
    "lost",
    "timeline",
    "caretakers",
    "veterinarians",
    "qr",
  ]);

  it("every completeness item maps to a valid tab destination", () => {
    for (const [id, dest] of Object.entries(COMPLETENESS_DESTINATIONS)) {
      expect(KNOWN_TABS.has(dest.tab), `${id} → ${dest.tab}`).toBe(true);
    }
  });

  it("computeProfileCompleteness attaches action/section (no scroll-only stubs)", () => {
    const { missing } = computeProfileCompleteness({
      photo_url: null,
      breed: null,
      sex: null,
      birth_date: null,
      weight_kg: null,
      microchip: null,
      secondary_contact_name: null,
      secondary_contact_phone: null,
      extras: {},
      hasWeightHistory: false,
      hasVaccine: false,
      hasPrimaryVet: false,
    });

    expect(missing.length).toBeGreaterThan(0);
    for (const item of missing) {
      const dest = resolveCompletenessDestination(item.id);
      expect(item.tab).toBe(dest.tab);
      expect(item.action).toBe(dest.action);
      expect(item.section).toBe(dest.section);
      // Must deep-link via section and/or action — never bare "same tab scroll top"
      expect(Boolean(item.section || item.action)).toBe(true);
    }
  });

  it("vaccine and weight open health with the matching action", () => {
    expect(resolveCompletenessDestination("vaccine")).toEqual({
      tab: "health",
      action: "vaccine",
    });
    expect(resolveCompletenessDestination("weight")).toEqual({
      tab: "health",
      action: "weight",
    });
  });
});

describe("routine quantity input parsing", () => {
  it("allows empty while editing (invalid only at save)", () => {
    expect(parseRoutineQuantity("")).toEqual({
      ok: false,
      message: "Informe uma quantidade válida.",
    });
    expect(parseRoutineQuantity("   ")).toEqual({
      ok: false,
      message: "Informe uma quantidade válida.",
    });
  });

  it("accepts 500 after typing stepwise values", () => {
    expect(parseRoutineQuantity("5").ok).toBe(true);
    expect(parseRoutineQuantity("50").ok).toBe(true);
    expect(parseRoutineQuantity("500")).toEqual({ ok: true, value: 500 });
  });

  it("accepts decimals when supported", () => {
    expect(parseRoutineQuantity("0.5")).toEqual({ ok: true, value: 0.5 });
    expect(parseRoutineQuantity("1,25")).toEqual({ ok: true, value: 1.25 });
  });

  it("rejects zero and non-numeric without coercing to 1", () => {
    expect(parseRoutineQuantity("0").ok).toBe(false);
    expect(parseRoutineQuantity("-1").ok).toBe(false);
    expect(parseRoutineQuantity("abc").ok).toBe(false);
  });
});
