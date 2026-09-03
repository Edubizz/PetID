import { describe, expect, it } from "vitest";
import { HERO_SLOGAN_CLASS, PETID_SLOGAN, PENDING_PROFILE_HINT } from "./homepage-branding";
import { hasPendingProfileItems } from "./pet-menu";
import {
  computeProfileCompleteness,
  EMPTY_PROFILE_EXTRAS,
  type CompletenessItem,
  type ProfileExtras,
} from "./pet-profile";
import { COMPLETENESS_DESTINATIONS, resolveCompletenessDestination } from "./pet-navigation";

function completenessFixture(
  overrides: Partial<Parameters<typeof computeProfileCompleteness>[0]> = {},
) {
  return computeProfileCompleteness({
    photo_url: null,
    breed: null,
    sex: null,
    birth_date: null,
    weight_kg: null,
    microchip: null,
    secondary_contact_name: null,
    secondary_contact_phone: null,
    extras: EMPTY_PROFILE_EXTRAS,
    hasWeightHistory: false,
    hasVaccine: false,
    hasPrimaryVet: false,
    ...overrides,
  });
}

describe("homepage slogan emphasis", () => {
  it("slogan has emphasized responsive class/style subordinate to hero H1", () => {
    expect(PETID_SLOGAN).toContain("A identidade que cuida de quem você ama");
    expect(HERO_SLOGAN_CLASS).toMatch(/text-base/);
    expect(HERO_SLOGAN_CLASS).toMatch(/sm:text-lg/);
    expect(HERO_SLOGAN_CLASS).toMatch(/md:text-xl/);
    expect(HERO_SLOGAN_CLASS).toMatch(/font-semibold/);
    expect(HERO_SLOGAN_CLASS).toMatch(/text-pretty/);
    expect(HERO_SLOGAN_CLASS).toMatch(/leading-snug/);
    // Must not use H1-scale sizes
    expect(HERO_SLOGAN_CLASS).not.toMatch(/text-\[1\.75rem\]|text-4xl|text-5xl|text-6xl/);
  });
});

describe("pet menu pending indicator", () => {
  it("warning indicator appears when completeness has pending items", () => {
    const { missing } = completenessFixture();
    expect(missing.length).toBeGreaterThan(0);
    expect(hasPendingProfileItems(missing)).toBe(true);
  });

  it("warning indicator hidden when complete", () => {
    const extras: ProfileExtras = {
      ...EMPTY_PROFILE_EXTRAS,
      owner: { name: "João" },
      veterinary: { name: "Dr. Vet" },
      identification: { insurance: "PetPlan" },
    };
    const { missing, pct } = completenessFixture({
      photo_url: "https://example.com/p.jpg",
      breed: "SRD",
      sex: "male",
      birth_date: "2020-01-01",
      weight_kg: 12,
      microchip: "123",
      secondary_contact_name: "Ana",
      secondary_contact_phone: "11999999999",
      extras,
      hasWeightHistory: true,
      hasVaccine: true,
      hasPrimaryVet: true,
    });
    expect(pct).toBe(100);
    expect(missing).toEqual([]);
    expect(hasPendingProfileItems(missing)).toBe(false);
    expect(hasPendingProfileItems([])).toBe(false);
    expect(hasPendingProfileItems(null)).toBe(false);
  });

  it("pending list reuses current completeness data (no duplicate system)", () => {
    const result = completenessFixture({ breed: "Poodle" });
    expect(result.missing.every((i) => !i.done)).toBe(true);
    expect(result.missing.some((i) => i.id === "breed")).toBe(false);
    expect(result.items.find((i) => i.id === "breed")?.done).toBe(true);
  });

  it("every pending item uses the existing destination mapping", () => {
    const { missing } = completenessFixture();
    for (const item of missing) {
      const mapped = resolveCompletenessDestination(item.id);
      expect(COMPLETENESS_DESTINATIONS[item.id]).toBeDefined();
      expect(item.tab).toBe(mapped.tab);
      expect(item.action).toBe(mapped.action);
      expect(item.section).toBe(mapped.section);
    }
  });

  it("selecting an item navigates via tab/action/section from completeness item", () => {
    const { missing } = completenessFixture();
    const photo = missing.find((i) => i.id === "photo");
    const vaccine = missing.find((i) => i.id === "vaccine");
    expect(photo).toMatchObject({ tab: "info", section: "photo" });
    expect(vaccine).toMatchObject({ tab: "health", action: "vaccine" });

    const navigations: Array<{ tab: string; action?: string; section?: string }> = [];
    const onFillPending = (item: CompletenessItem) => {
      navigations.push({ tab: item.tab, action: item.action, section: item.section });
    };
    onFillPending(photo!);
    onFillPending(vaccine!);
    expect(navigations).toEqual([
      { tab: "info", action: undefined, section: "photo" },
      { tab: "health", action: "vaccine", section: undefined },
    ]);
  });

  it("mobile-safe pending UI copy and structure contracts", () => {
    expect(PENDING_PROFILE_HINT).toMatch(/informações do perfil/i);
    expect(PENDING_PROFILE_HINT.toLowerCase()).not.toMatch(/emergência|erro da conta|inseguro/);
    const { missing } = completenessFixture();
    expect(missing.every((i) => i.label.length > 0 && i.label.length < 80)).toBe(true);
  });
});
