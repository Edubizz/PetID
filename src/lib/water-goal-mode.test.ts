import { describe, expect, it } from "vitest";
import {
  WATER_BOWL_UNIT,
  buildGoalQuickOptions,
  defaultWaterTargetForMode,
  entryUnitMetadata,
  formatLoggedAmount,
  formatPoteCount,
  formatPotePerDay,
  formatTrackerGoalPerDay,
  formatTrackerProgress,
  isWaterBowlsTracker,
  isWaterBowlsUnit,
  parseRoutineQuantity,
  resolveEntryUnit,
  resolveWaterGoalMode,
  usesQuantityQuickLog,
  waterUnitForMode,
} from "./daily-care";

describe("water goal modes", () => {
  it("new bowls goals use pote unit and default target", () => {
    expect(waterUnitForMode("bowls")).toBe(WATER_BOWL_UNIT);
    expect(defaultWaterTargetForMode("bowls")).toBe(3);
    expect(resolveWaterGoalMode(WATER_BOWL_UNIT)).toBe("bowls");
    expect(isWaterBowlsUnit("potes")).toBe(true);
  });

  it('formats 1 as "1 pote" and >1 as "potes"', () => {
    expect(formatPoteCount(1)).toBe("1 pote");
    expect(formatPoteCount(2)).toBe("2 potes");
    expect(formatPotePerDay(1)).toBe("1 pote/dia");
    expect(formatPotePerDay(3)).toBe("3 potes/dia");
  });

  it("formats bowls progress and allows exceeding the target", () => {
    expect(formatTrackerProgress(2, 3, "pote")).toBe("2 de 3 potes");
    expect(formatTrackerProgress(3, 3, "pote")).toBe("3 de 3 potes");
    expect(formatTrackerProgress(4, 3, "pote")).toBe("4 de 3 potes");
    expect(formatTrackerGoalPerDay(3, "pote")).toBe("3 potes/dia");
  });

  it("bowls mode is count-like for quick log (no ml presets)", () => {
    expect(isWaterBowlsTracker("water", "pote")).toBe(true);
    expect(usesQuantityQuickLog("water", "pote")).toBe(false);
    expect(buildGoalQuickOptions(3, "pote")).toEqual([]);
  });

  it("volume mode preserves dynamic ml/L options", () => {
    expect(resolveWaterGoalMode("ml")).toBe("volume");
    expect(resolveWaterGoalMode(null)).toBe("volume");
    expect(usesQuantityQuickLog("water", "ml")).toBe(true);
    expect(buildGoalQuickOptions(190, "ml").map((o) => o.value)).toEqual([45, 95, 190]);
  });

  it("existing water goals without pote default safely to volume", () => {
    expect(resolveWaterGoalMode("ml")).toBe("volume");
    expect(resolveWaterGoalMode("l")).toBe("volume");
    expect(resolveWaterGoalMode("")).toBe("volume");
    expect(resolveWaterGoalMode(undefined)).toBe("volume");
  });

  it("mode switch does not convert historical entry units", () => {
    const loggedAsMl = entryUnitMetadata("ml");
    const loggedAsPote = entryUnitMetadata("pote");
    // Tracker switched to bowls, but yesterday's entry still reads as ml.
    expect(resolveEntryUnit(loggedAsMl, "pote")).toBe("ml");
    expect(formatLoggedAmount(750, resolveEntryUnit(loggedAsMl, "pote"))).toBe("750 ml");
    // Tracker switched to volume, but today's bowl entry still reads as potes.
    expect(resolveEntryUnit(loggedAsPote, "ml")).toBe("pote");
    expect(formatLoggedAmount(3, resolveEntryUnit(loggedAsPote, "ml"))).toBe("3 potes");
    // Legacy entries without snapshot fall back to current tracker unit.
    expect(resolveEntryUnit({}, "ml")).toBe("ml");
  });

  it("mobile summary helpers support both labels", () => {
    expect(formatTrackerGoalPerDay(3, "pote")).toBe("3 potes/dia");
    expect(formatTrackerGoalPerDay(750, "ml")).toBe("750 ml/dia");
    expect(formatTrackerProgress(500, 750, "ml")).toBe("500 ml de 750 ml");
  });

  it("temporary empty numeric input still works", () => {
    expect(parseRoutineQuantity("").ok).toBe(false);
    expect(parseRoutineQuantity("3")).toEqual({ ok: true, value: 3 });
  });

  it("+1 bowl and custom bowl counts are valid positive amounts", () => {
    expect(parseRoutineQuantity("1")).toEqual({ ok: true, value: 1 });
    expect(parseRoutineQuantity("2")).toEqual({ ok: true, value: 2 });
  });
});
