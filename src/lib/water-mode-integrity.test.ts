import { describe, expect, it } from "vitest";
import {
  formatLoggedAmount,
  mergeEntryUnitSnapshot,
  normalizeCompatibleWaterValue,
  planLegacyEntryUnitSnapshots,
  resolveEntryUnit,
  sumTrackerEntriesCompatible,
  toMilliliters,
} from "./daily-care";
import { runModeSwitchPreservationGate } from "./water-mode-switch";

describe("legacy entry unit snapshot before mode switch", () => {
  it("plans ml snapshots for legacy entries missing metadata.unit", () => {
    const plans = planLegacyEntryUnitSnapshots(
      [
        { id: "a", metadata: {} },
        { id: "b", metadata: null },
        { id: "c" },
      ],
      "ml",
    );
    expect(plans).toEqual([
      { id: "a", metadata: { unit: "ml" } },
      { id: "b", metadata: { unit: "ml" } },
      { id: "c", metadata: { unit: "ml" } },
    ]);
  });

  it("never overwrites an existing metadata.unit", () => {
    expect(mergeEntryUnitSnapshot({ unit: "pote", note: "keep" }, "ml")).toBeNull();
    const plans = planLegacyEntryUnitSnapshots(
      [
        { id: "keep", metadata: { unit: "pote" } },
        { id: "fill", metadata: { foo: 1 } },
      ],
      "ml",
    );
    expect(plans).toEqual([{ id: "fill", metadata: { foo: 1, unit: "ml" } }]);
  });

  it("keeps bowls snapshots when switching to volume", () => {
    const plans = planLegacyEntryUnitSnapshots(
      [
        { id: "1", metadata: {} },
        { id: "2", metadata: { unit: "pote" } },
      ],
      "pote",
    );
    expect(plans).toEqual([{ id: "1", metadata: { unit: "pote" } }]);
    expect(resolveEntryUnit({ unit: "pote" }, "ml")).toBe("pote");
    expect(formatLoggedAmount(2, resolveEntryUnit({ unit: "pote" }, "ml"))).toBe("2 potes");
  });

  it("failed legacy preservation prevents unsafe mode switch", () => {
    expect(() =>
      runModeSwitchPreservationGate({
        entries: [{ id: "a", metadata: {} }],
        previousUnit: "ml",
        fail: true,
      }),
    ).toThrow(/preservar o histórico/i);

    const ok = runModeSwitchPreservationGate({
      entries: [{ id: "a", metadata: {} }],
      previousUnit: "ml",
    });
    expect(ok.maySwitch).toBe(true);
    expect(ok.snapshots[0]?.metadata.unit).toBe("ml");
  });
});

describe("water aggregate unit compatibility", () => {
  it("ml + L may aggregate after normalization", () => {
    expect(toMilliliters(1, "l")).toBe(1000);
    expect(normalizeCompatibleWaterValue(1, "l", "ml")).toBe(1000);
    expect(normalizeCompatibleWaterValue(500, "ml", "l")).toBe(0.5);

    const sum = sumTrackerEntriesCompatible(
      [
        { tracker_id: "w", value: 500, completed_at: "2026-08-30T10:00:00Z", metadata: { unit: "ml" } },
        { tracker_id: "w", value: 0.5, completed_at: "2026-08-30T11:00:00Z", metadata: { unit: "l" } },
      ],
      "w",
      "ml",
    );
    expect(sum).toBe(1000);
  });

  it("ml + pote never aggregate together", () => {
    expect(normalizeCompatibleWaterValue(500, "ml", "pote")).toBeNull();
    expect(normalizeCompatibleWaterValue(2, "pote", "ml")).toBeNull();

    const sumBowls = sumTrackerEntriesCompatible(
      [
        { tracker_id: "w", value: 500, completed_at: "2026-08-30T10:00:00Z", metadata: { unit: "ml" } },
        { tracker_id: "w", value: 2, completed_at: "2026-08-30T11:00:00Z", metadata: { unit: "pote" } },
      ],
      "w",
      "pote",
    );
    expect(sumBowls).toBe(2);

    const sumVolume = sumTrackerEntriesCompatible(
      [
        { tracker_id: "w", value: 500, completed_at: "2026-08-30T10:00:00Z", metadata: { unit: "ml" } },
        { tracker_id: "w", value: 2, completed_at: "2026-08-30T11:00:00Z", metadata: { unit: "pote" } },
      ],
      "w",
      "ml",
    );
    expect(sumVolume).toBe(500);
  });

  it("history can display old ml and new pote entries correctly", () => {
    expect(formatLoggedAmount(500, resolveEntryUnit({ unit: "ml" }, "pote"))).toBe("500 ml");
    expect(formatLoggedAmount(1, resolveEntryUnit({ unit: "pote" }, "ml"))).toBe("1 pote");
  });
});
