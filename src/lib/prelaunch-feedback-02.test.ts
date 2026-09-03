import { describe, expect, it, vi } from "vitest";
import {
  AGE_OPTIONS,
  DOG_AGE_HELPERS,
  ageHelpersForSpecies,
  buildGoalQuickOptions,
  formatQuantityLabel,
  parseRoutineQuantity,
  toRoutineReviewDisplay,
} from "./daily-care";
import { authCallbackUrl, emailConfirmRedirectUrl } from "./app-url";
import { BREED_SPECIAL, getBreedOptionsForSpecies, isKnownBreed } from "./pet-breeds";
import { closeMobileSidebar } from "./mobile-sidebar";
import {
  COMPLETENESS_DESTINATIONS,
  resolveCompletenessDestination,
} from "./pet-navigation";

describe("goal-based quick quantity options", () => {
  it("190 ml produces ~25% / ~50% / exact 190 + friendly rounding", () => {
    const opts = buildGoalQuickOptions(190, "ml");
    expect(opts.map((o) => o.value)).toEqual([45, 95, 190]);
    expect(opts.map((o) => o.label)).toEqual(["45 ml", "95 ml", "190 ml"]);
  });

  it("1000 ml produces 250 / 500 / 1 L", () => {
    const opts = buildGoalQuickOptions(1000, "ml");
    expect(opts.map((o) => o.value)).toEqual([250, 500, 1000]);
    expect(opts.map((o) => o.label)).toEqual(["250 ml", "500 ml", "1 L"]);
  });

  it("1 L goal normalizes and formats intelligently", () => {
    const opts = buildGoalQuickOptions(1, "l");
    expect(opts.map((o) => o.value)).toEqual([0.25, 0.5, 1]);
    expect(opts.map((o) => o.label)).toEqual(["250 ml", "500 ml", "1 L"]);
  });

  it("full goal is always exact", () => {
    for (const goal of [190, 333, 1000, 47]) {
      const opts = buildGoalQuickOptions(goal, "ml");
      expect(opts[opts.length - 1]?.value).toBe(goal);
    }
  });

  it("removes duplicate quick values and never returns zero", () => {
    const tiny = buildGoalQuickOptions(4, "ml");
    expect(tiny.every((o) => o.value > 0)).toBe(true);
    const values = tiny.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("formats 1500 ml as 1,5 L", () => {
    expect(formatQuantityLabel(1500, "ml")).toBe("1,5 L");
  });

  it("does not invent options for count units", () => {
    expect(buildGoalQuickOptions(3, "refeições")).toEqual([]);
    expect(buildGoalQuickOptions(2, "vezes")).toEqual([]);
  });

  it("improves exercise minutes from goal without unit conversion mistakes", () => {
    const opts = buildGoalQuickOptions(60, "min");
    expect(opts.map((o) => o.value)).toEqual([15, 30, 60]);
  });
});

describe("dog breed selector — Outra first", () => {
  it("pins Outra as the first dog option without duplicates", () => {
    const dogs = getBreedOptionsForSpecies("Cachorro");
    expect(dogs[0]).toBe(BREED_SPECIAL.other);
    expect(dogs.filter((b) => b === BREED_SPECIAL.other)).toHaveLength(1);
    expect(dogs).toContain("Labrador Retriever");
    expect(dogs).toContain(BREED_SPECIAL.srd);
  });

  it("custom Outra mode still treats free-text as unknown breed", () => {
    expect(isKnownBreed("Cachorro", BREED_SPECIAL.other)).toBe(false);
    expect(isKnownBreed("Cachorro", "Minha raça custom")).toBe(false);
    expect(isKnownBreed("Cachorro", "Poodle")).toBe(true);
  });
});

describe("mobile sidebar close", () => {
  it("closes only on mobile", () => {
    const mobile = vi.fn();
    closeMobileSidebar(true, mobile);
    expect(mobile).toHaveBeenCalledWith(false);

    const desktop = vi.fn();
    closeMobileSidebar(false, desktop);
    expect(desktop).not.toHaveBeenCalled();
  });
});

describe("dog age helpers", () => {
  it("exposes dog helper copy for Filhote / Adulto / Idoso", () => {
    expect(DOG_AGE_HELPERS.puppy).toMatch(/1 ano/i);
    expect(DOG_AGE_HELPERS.adult).toMatch(/1 a 7/i);
    expect(DOG_AGE_HELPERS.senior).toMatch(/7 anos/i);
    expect(ageHelpersForSpecies("dog")).toEqual(DOG_AGE_HELPERS);
  });

  it("does not show dog ranges for other species", () => {
    expect(ageHelpersForSpecies("cat")).toBeNull();
    expect(ageHelpersForSpecies("bird")).toBeNull();
  });

  it("age helpers are not used as validation (AGE_OPTIONS stay labels only)", () => {
    expect(AGE_OPTIONS.every((o) => "label" in o && !("minYears" in o) && !("maxYears" in o))).toBe(
      true,
    );
  });
});

describe("routine plan review display", () => {
  it("keeps title and full target/unit as separate wrap-friendly fields", () => {
    const row = toRoutineReviewDisplay(
      {
        key: "water",
        title: "Água",
        category: "water",
        target_per_day: 900,
        unit: "ml",
      },
      "900",
    );
    expect(row.title).toBe("Água");
    expect(row.targetInput).toBe("900");
    expect(row.unitFrequency).toBe("900 ml/dia");
    expect(row.targetInput).not.toContain("…");
  });
});

describe("previous hotfixes still hold", () => {
  it("email confirmation still routes to /auth-callback", () => {
    expect(emailConfirmRedirectUrl()).toBe(authCallbackUrl());
    expect(emailConfirmRedirectUrl()).toMatch(/\/auth-callback\/?$/);
  });

  it("Preencher mappings still resolve to tab + section/action", () => {
    for (const [id, dest] of Object.entries(COMPLETENESS_DESTINATIONS)) {
      expect(resolveCompletenessDestination(id)).toEqual(dest);
      expect(Boolean(dest.section || dest.action)).toBe(true);
    }
  });

  it("routine quantity field still allows temporary empty state", () => {
    expect(parseRoutineQuantity("").ok).toBe(false);
    expect(parseRoutineQuantity("500")).toEqual({ ok: true, value: 500 });
  });
});
