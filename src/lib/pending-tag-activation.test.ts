import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_NEXT_KEY,
  PENDING_TAG_ACTIVATION_KEY,
  activateTagHref,
  cancelPendingTagActivation,
  clearPendingTagActivation,
  getPendingTagActivation,
  isValidPublicTagToken,
  navigateAfterAuth,
  navigateToPendingActivation,
  resolveActivationAwareDestination,
  setPendingTagActivation,
} from "./pending-tag-activation";

const SAMPLE_TOKEN = "AbCdEfGhIjKlMnOpQrStUv";

describe("pending-tag-activation", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("stores only the public token (never activation code)", () => {
    setPendingTagActivation(SAMPLE_TOKEN);
    expect(getPendingTagActivation()).toBe(SAMPLE_TOKEN);
    expect(sessionStorage.getItem(PENDING_TAG_ACTIVATION_KEY)).toBe(SAMPLE_TOKEN);
    expect(sessionStorage.getItem(PENDING_TAG_ACTIVATION_KEY)).not.toMatch(/code/i);
  });

  it("rejects invalid tokens", () => {
    expect(isValidPublicTagToken("short")).toBe(false);
    expect(isValidPublicTagToken("has spaces here!!")).toBe(false);
    setPendingTagActivation("nope");
    expect(getPendingTagActivation()).toBeNull();
  });

  it("survives refresh-style re-read from sessionStorage", () => {
    setPendingTagActivation(SAMPLE_TOKEN);
    expect(getPendingTagActivation()).toBe(SAMPLE_TOKEN);
    expect(getPendingTagActivation()).toBe(SAMPLE_TOKEN);
  });

  it("replaces stale pending token when a new tag is started", () => {
    setPendingTagActivation(SAMPLE_TOKEN);
    const other = "ZzYyXxWwVvUuTtSsRrQqPp";
    setPendingTagActivation(other);
    expect(getPendingTagActivation()).toBe(other);
  });

  it("cancel clears pending and activate-tag auth next", () => {
    setPendingTagActivation(SAMPLE_TOKEN);
    sessionStorage.setItem(AUTH_NEXT_KEY, activateTagHref(SAMPLE_TOKEN));
    cancelPendingTagActivation();
    expect(getPendingTagActivation()).toBeNull();
    expect(sessionStorage.getItem(AUTH_NEXT_KEY)).toBeNull();
  });

  it("resolve prefers pending token over dashboard next (post-auth)", () => {
    setPendingTagActivation(SAMPLE_TOKEN);
    const dest = resolveActivationAwareDestination("/dashboard");
    expect(dest).toEqual({ kind: "activate-tag", token: SAMPLE_TOKEN });
  });

  it("resolve parses activate-tag next path and locks token", () => {
    clearPendingTagActivation();
    const dest = resolveActivationAwareDestination(activateTagHref(SAMPLE_TOKEN));
    expect(dest).toEqual({ kind: "activate-tag", token: SAMPLE_TOKEN });
    expect(getPendingTagActivation()).toBe(SAMPLE_TOKEN);
  });

  it("navigateAfterAuth uses search object (does not stuff query into `to`)", () => {
    const calls: unknown[] = [];
    const navigate = (opts: unknown) => {
      calls.push(opts);
    };
    setPendingTagActivation(SAMPLE_TOKEN);
    navigateAfterAuth(navigate, "/dashboard");
    expect(calls).toEqual([
      {
        to: "/activate-tag",
        search: { token: SAMPLE_TOKEN },
        replace: true,
      },
    ]);
  });

  it("navigateAfterAuth parses /activate-tag?token= without pending key", () => {
    const calls: unknown[] = [];
    navigateAfterAuth(calls.push.bind(calls), activateTagHref(SAMPLE_TOKEN));
    expect(calls[0]).toMatchObject({
      to: "/activate-tag",
      search: { token: SAMPLE_TOKEN },
      replace: true,
    });
    expect(getPendingTagActivation()).toBe(SAMPLE_TOKEN);
  });

  it("navigateToPendingActivation returns false when none", () => {
    const navigate = vi.fn();
    expect(navigateToPendingActivation(navigate)).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("navigateToPendingActivation preselects pet after create", () => {
    setPendingTagActivation(SAMPLE_TOKEN);
    const navigate = vi.fn();
    expect(navigateToPendingActivation(navigate, { petId: "pet-1" })).toBe(true);
    expect(navigate).toHaveBeenCalledWith({
      to: "/activate-tag",
      search: { token: SAMPLE_TOKEN, petId: "pet-1" },
      replace: false,
    });
  });

  it("activateTagHref never embeds an activation code", () => {
    const href = activateTagHref(SAMPLE_TOKEN);
    expect(href).toBe(`/activate-tag?token=${encodeURIComponent(SAMPLE_TOKEN)}`);
    expect(href.toLowerCase()).not.toContain("activation");
    expect(href).not.toContain("code=");
  });
});

/** Mirrors server-side activate_physical_tag guard order for unit coverage. */
function evaluateActivateGuards(input: {
  uid: string | null;
  tag: {
    public_token: string;
    status: string;
    activation_code_hash: string;
  } | null;
  petOwnerId: string | null;
  submittedCodeHash: string;
}): string | "ok" {
  if (!input.uid) return "Authentication required";
  if (!input.petOwnerId || input.petOwnerId !== input.uid) {
    return "Pet not found or not owned by you";
  }
  if (!input.tag) return "Tag inválida";
  if (input.tag.status === "active") return "Esta tag já foi ativada";
  if (["disabled", "lost", "replaced"].includes(input.tag.status)) {
    return "Esta tag não está disponível para ativação";
  }
  if (input.submittedCodeHash !== input.tag.activation_code_hash) {
    return "Código de ativação incorreto";
  }
  return "ok";
}

describe("activate_physical_tag security contract", () => {
  const tag = {
    public_token: SAMPLE_TOKEN,
    status: "generated",
    activation_code_hash: "hash-correct",
  };

  it("rejects unauthenticated", () => {
    expect(
      evaluateActivateGuards({
        uid: null,
        tag,
        petOwnerId: "u1",
        submittedCodeHash: "hash-correct",
      }),
    ).toBe("Authentication required");
  });

  it("rejects another user's pet", () => {
    expect(
      evaluateActivateGuards({
        uid: "u1",
        tag,
        petOwnerId: "u2",
        submittedCodeHash: "hash-correct",
      }),
    ).toBe("Pet not found or not owned by you");
  });

  it("rejects wrong activation code", () => {
    expect(
      evaluateActivateGuards({
        uid: "u1",
        tag,
        petOwnerId: "u1",
        submittedCodeHash: "hash-wrong",
      }),
    ).toBe("Código de ativação incorreto");
  });

  it("rejects already active / reused code path", () => {
    expect(
      evaluateActivateGuards({
        uid: "u1",
        tag: { ...tag, status: "active", activation_code_hash: "rotated" },
        petOwnerId: "u1",
        submittedCodeHash: "hash-correct",
      }),
    ).toBe("Esta tag já foi ativada");
  });

  it("accepts owned pet + correct code on generated tag", () => {
    expect(
      evaluateActivateGuards({
        uid: "u1",
        tag,
        petOwnerId: "u1",
        submittedCodeHash: "hash-correct",
      }),
    ).toBe("ok");
  });
});

describe("flow matrix (intent preservation)", () => {
  it("unauthenticated → login → existing pet: pending survives auth next clear", () => {
    setPendingTagActivation(SAMPLE_TOKEN);
    sessionStorage.setItem(AUTH_NEXT_KEY, activateTagHref(SAMPLE_TOKEN));
    // auth clears AUTH_NEXT_KEY after resolve
    sessionStorage.removeItem(AUTH_NEXT_KEY);
    const dest = resolveActivationAwareDestination("/dashboard");
    expect(dest).toEqual({ kind: "activate-tag", token: SAMPLE_TOKEN });
  });

  it("signup → legal → create pet → return: pending + petId navigation", () => {
    setPendingTagActivation(SAMPLE_TOKEN);
    const navigate = vi.fn();
    navigateAfterAuth(navigate, activateTagHref(SAMPLE_TOKEN));
    expect(navigate.mock.calls[0][0].to).toBe("/activate-tag");
    navigate.mockClear();
    navigateToPendingActivation(navigate, { petId: "new-pet" });
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        search: { token: SAMPLE_TOKEN, petId: "new-pet" },
      }),
    );
  });

  it("authenticated zero pets → create → return uses same pending key", () => {
    setPendingTagActivation(SAMPLE_TOKEN);
    expect(getPendingTagActivation()).toBe(SAMPLE_TOKEN);
    const navigate = vi.fn();
    expect(navigateToPendingActivation(navigate, { petId: "p1" })).toBe(true);
  });
});
