import {
  Droplet,
  UtensilsCrossed,
  Pill,
  Footprints,
  Dumbbell,
  Sparkles,
  Scissors,
  GraduationCap,
  Star,
  type LucideIcon,
} from "lucide-react";

export type TrackerCategory =
  | "water"
  | "food"
  | "medication"
  | "walk"
  | "exercise"
  | "bathroom"
  | "grooming"
  | "training"
  | "custom";

export type CategoryMeta = {
  label: string;
  icon: LucideIcon;
  color: string;
  unit: string;
  quickValue: number;
  quickLabel: string;
};

export const CATEGORY_META: Record<TrackerCategory, CategoryMeta> = {
  water: { label: "Água", icon: Droplet, color: "#0EA5E9", unit: "ml", quickValue: 250, quickLabel: "+ Água" },
  food: { label: "Alimentação", icon: UtensilsCrossed, color: "#F59E0B", unit: "refeições", quickValue: 1, quickLabel: "+ Alimentar" },
  medication: { label: "Medicação", icon: Pill, color: "#EF4444", unit: "doses", quickValue: 1, quickLabel: "+ Medicar" },
  walk: { label: "Passeio", icon: Footprints, color: "#22C55E", unit: "passeios", quickValue: 1, quickLabel: "+ Passeio" },
  exercise: { label: "Exercício", icon: Dumbbell, color: "#8B5CF6", unit: "min", quickValue: 15, quickLabel: "+ Exercício" },
  bathroom: { label: "Necessidades", icon: Sparkles, color: "#14B8A6", unit: "vezes", quickValue: 1, quickLabel: "+ Registrar" },
  grooming: { label: "Higiene", icon: Scissors, color: "#EC4899", unit: "vezes", quickValue: 1, quickLabel: "+ Higiene" },
  training: { label: "Treino", icon: GraduationCap, color: "#6366F1", unit: "sessões", quickValue: 1, quickLabel: "+ Treino" },
  custom: { label: "Personalizado", icon: Star, color: "#64748B", unit: "vezes", quickValue: 1, quickLabel: "+ Registrar" },
};

export const CATEGORY_OPTIONS: { value: TrackerCategory; label: string }[] = (
  Object.keys(CATEGORY_META) as TrackerCategory[]
).map((value) => ({ value, label: CATEGORY_META[value].label }));

/* -------------------- Smart quick-log (quantity vs count) -------------------- */
/**
 * Single source of truth for Rotina + Assistant quick-log amounts:
 * unit family → presets / default increment → last tap (localStorage) →
 * optional learned-from-history value → category fallback.
 */

/** Units that mean "one event" — always log +1, no amount picker. */
const COUNT_UNITS = new Set([
  "refeições", "refeicoes", "meals", "doses", "passeios", "walks",
  "vezes", "sessões", "sessoes", "sessions", "trocas", "times",
  "pote", "potes",
]);

/**
 * Categories that should stay one-tap forever (meals / walks / medication),
 * regardless of whatever unit string the owner typed.
 */
const COUNT_CATEGORIES = new Set<TrackerCategory>(["food", "medication", "walk"]);

/** Categories that use the quantity picker when in volume / numeric mode. */
const QUANTITY_CATEGORIES = new Set<TrackerCategory>(["water", "exercise"]);

/* -------------------- Water goal modes (bowls vs volume) -------------------- */

/** Canonical unit stored for bowls-mode water goals. */
export const WATER_BOWL_UNIT = "pote";

export type WaterGoalMode = "bowls" | "volume";

export const WATER_MODE_SWITCH_WARNING =
  "A nova forma de acompanhamento será usada daqui para frente. Seus registros anteriores serão preservados.";

export function isWaterBowlsUnit(unit: string | null | undefined): boolean {
  const u = (unit ?? "").trim().toLowerCase();
  return u === "pote" || u === "potes";
}

/**
 * Resolve water tracking mode from the tracker's unit.
 * Missing / ml / L / unknown → volume (safe default for existing goals).
 */
export function resolveWaterGoalMode(unit: string | null | undefined): WaterGoalMode {
  return isWaterBowlsUnit(unit) ? "bowls" : "volume";
}

export function waterUnitForMode(mode: WaterGoalMode, volumeUnit: "ml" | "l" = "ml"): string {
  return mode === "bowls" ? WATER_BOWL_UNIT : volumeUnit;
}

export function defaultWaterTargetForMode(mode: WaterGoalMode): number {
  return mode === "bowls" ? 3 : 500;
}

/** "1 pote" / "3 potes" */
export function formatPoteCount(count: number): string {
  const n = Number.isFinite(count) ? count : 0;
  return n === 1 ? "1 pote" : `${formatBrNumber(n)} potes`;
}

/** "1 pote/dia" / "3 potes/dia" */
export function formatPotePerDay(count: number): string {
  const n = Number.isFinite(count) ? count : 0;
  return n === 1 ? "1 pote/dia" : `${formatBrNumber(n)} potes/dia`;
}

/** Progress line: "2 de 3 potes" or "500 ml de 750 ml". */
export function formatTrackerProgress(
  value: number,
  target: number,
  unit: string | null | undefined,
): string {
  if (isWaterBowlsUnit(unit)) {
    const noun = target === 1 ? "pote" : "potes";
    return `${formatBrNumber(value)} de ${formatBrNumber(target)} ${noun}`;
  }
  const family = classifyUnit(unit);
  if (family === "ml" || family === "l") {
    return `${formatQuantityLabel(value, unit)} de ${formatQuantityLabel(target, unit)}`;
  }
  const u = (unit ?? "").trim();
  return u
    ? `${formatBrNumber(value)} de ${formatBrNumber(target)} ${u}`
    : `${formatBrNumber(value)} de ${formatBrNumber(target)}`;
}

/** Goal summary for review cards: "3 potes/dia" or "750 ml/dia". */
export function formatTrackerGoalPerDay(
  target: number,
  unit: string | null | undefined,
): string {
  if (isWaterBowlsUnit(unit)) return formatPotePerDay(target);
  const family = classifyUnit(unit);
  if (family === "ml" || family === "l") {
    return `${formatQuantityLabel(target, unit)}/dia`;
  }
  const u = (unit ?? "").trim();
  return u ? `${formatBrNumber(target)} ${u}/dia` : `${formatBrNumber(target)}/dia`;
}

/** Unit label for a single logged event (history). */
export function formatLoggedAmount(
  value: number,
  unit: string | null | undefined,
): string {
  if (isWaterBowlsUnit(unit)) return formatPoteCount(value);
  const family = classifyUnit(unit);
  if (family === "ml" || family === "l") return formatQuantityLabel(value, unit);
  const u = (unit ?? "").trim();
  return u ? `${formatBrNumber(value)} ${u}` : formatBrNumber(value);
}

/**
 * Prefer the unit snapshot stored on the entry (mode switches must not
 * re-label historical logs). Fall back to the tracker's current unit.
 */
export function resolveEntryUnit(
  entryMetadata: unknown,
  trackerUnit: string | null | undefined,
): string | null {
  if (entryMetadata && typeof entryMetadata === "object" && !Array.isArray(entryMetadata)) {
    const unit = (entryMetadata as Record<string, unknown>).unit;
    if (typeof unit === "string" && unit.trim()) return unit.trim();
  }
  return trackerUnit ?? null;
}

/** Metadata to stamp on new tracker_entries so history survives mode switches. */
export function entryUnitMetadata(unit: string | null | undefined): { unit: string } | Record<string, never> {
  const u = (unit ?? "").trim();
  return u ? { unit: u } : {};
}

export function entryHasUnitSnapshot(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const unit = (metadata as Record<string, unknown>).unit;
  return typeof unit === "string" && Boolean(unit.trim());
}

/** Merge `unit` into entry metadata without dropping other keys; never overwrites an existing unit. */
export function mergeEntryUnitSnapshot(
  metadata: unknown,
  unit: string,
): Record<string, unknown> | null {
  const u = unit.trim();
  if (!u) return null;
  if (entryHasUnitSnapshot(metadata)) return null;
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  return { ...base, unit: u };
}

export type LegacyEntrySnapshotPlan = {
  id: string;
  metadata: Record<string, unknown>;
};

/**
 * Plan metadata.unit backfills for entries missing a snapshot.
 * Existing metadata.unit values are never overwritten.
 */
export function planLegacyEntryUnitSnapshots(
  entries: { id: string; metadata?: unknown }[],
  previousUnit: string,
): LegacyEntrySnapshotPlan[] {
  const u = previousUnit.trim();
  if (!u) return [];
  const out: LegacyEntrySnapshotPlan[] = [];
  for (const entry of entries) {
    const next = mergeEntryUnitSnapshot(entry.metadata, u);
    if (next) out.push({ id: entry.id, metadata: next });
  }
  return out;
}

export type WaterAmountFamily = "bowls" | "volume" | "other";

export function waterAmountFamily(unit: string | null | undefined): WaterAmountFamily {
  if (isWaterBowlsUnit(unit)) return "bowls";
  const family = classifyUnit(unit);
  if (family === "ml" || family === "l") return "volume";
  return "other";
}

export function areWaterUnitsCompatible(
  entryUnit: string | null | undefined,
  trackerUnit: string | null | undefined,
): boolean {
  const a = waterAmountFamily(entryUnit);
  const b = waterAmountFamily(trackerUnit);
  if (a === "other" || b === "other") return a === b;
  return a === b;
}

/** Convert a volume amount to milliliters; null if not a volume unit. */
export function toMilliliters(value: number, unit: string | null | undefined): number | null {
  if (!Number.isFinite(value)) return null;
  const family = classifyUnit(unit);
  if (family === "ml") return value;
  if (family === "l") return value * 1000;
  return null;
}

/** Convert milliliters into the tracker volume unit; null if tracker is not volume. */
export function fromMilliliters(ml: number, trackerUnit: string | null | undefined): number | null {
  if (!Number.isFinite(ml)) return null;
  const family = classifyUnit(trackerUnit);
  if (family === "ml") return ml;
  if (family === "l") return ml / 1000;
  return null;
}

/**
 * Normalize an entry value into the tracker's unit when families match.
 * Returns null when ml/L must not be mixed with potes (or other incompatible units).
 */
export function normalizeCompatibleWaterValue(
  value: number,
  entryUnit: string | null | undefined,
  trackerUnit: string | null | undefined,
): number | null {
  if (!Number.isFinite(value)) return null;
  const entryFamily = waterAmountFamily(entryUnit);
  const trackerFamily = waterAmountFamily(trackerUnit);
  if (entryFamily !== trackerFamily) return null;
  if (entryFamily === "bowls") return value;
  if (entryFamily === "volume") {
    const ml = toMilliliters(value, entryUnit);
    if (ml == null) return null;
    return fromMilliliters(ml, trackerUnit);
  }
  // Non-water units: pass through when both resolve as "other" with same classify,
  // or when tracker isn't bowls/volume (caller may use this only for water).
  return value;
}

export type EntryWithOptionalMeta = {
  tracker_id: string;
  value: number;
  completed_at: string;
  metadata?: unknown;
};

/**
 * Sum entries for a tracker using only amounts compatible with the current unit.
 * Volume entries (ml/L) normalize together; bowls never mix with volume.
 */
export function sumTrackerEntriesCompatible(
  entries: EntryWithOptionalMeta[],
  trackerId: string,
  trackerUnit: string | null | undefined,
  opts?: { day?: string },
): number {
  const trackingWater = waterAmountFamily(trackerUnit) !== "other";
  let sum = 0;
  for (const e of entries) {
    if (e.tracker_id !== trackerId) continue;
    if (opts?.day && dayKey(e.completed_at) !== opts.day) continue;
    const raw = Number(e.value);
    if (!Number.isFinite(raw)) continue;
    if (!trackingWater) {
      sum += raw;
      continue;
    }
    const entryUnit = resolveEntryUnit(e.metadata, trackerUnit);
    const normalized = normalizeCompatibleWaterValue(raw, entryUnit, trackerUnit);
    if (normalized == null) continue;
    sum += normalized;
  }
  return sum;
}

export function buildCompatibleDayTotalsMap(
  entries: EntryWithOptionalMeta[],
  trackerId: string,
  trackerUnit: string | null | undefined,
): Map<string, number> {
  const map = new Map<string, number>();
  const trackingWater = waterAmountFamily(trackerUnit) !== "other";
  for (const e of entries) {
    if (e.tracker_id !== trackerId) continue;
    const raw = Number(e.value);
    if (!Number.isFinite(raw)) continue;
    let add = raw;
    if (trackingWater) {
      const entryUnit = resolveEntryUnit(e.metadata, trackerUnit);
      const normalized = normalizeCompatibleWaterValue(raw, entryUnit, trackerUnit);
      if (normalized == null) continue;
      add = normalized;
    }
    const key = dayKey(e.completed_at);
    map.set(key, (map.get(key) ?? 0) + add);
  }
  return map;
}

/** Normalized unit families used for presets and defaults. */
export type QuantityUnitFamily =
  | "count"
  | "ml"
  | "l"
  | "g"
  | "kg"
  | "min"
  | "km"
  | "m"
  | "generic";

/**
 * Sensible preset ladders per unit family.
 * Count trackers never use these — they stay at +1.
 */
export const QUANTITY_PRESETS: Record<Exclude<QuantityUnitFamily, "count">, readonly number[]> = {
  ml: [100, 250, 500],
  l: [0.25, 0.5, 1, 1.5, 2],
  g: [50, 100, 200, 500],
  kg: [0.5, 1, 2, 5],
  min: [10, 15, 30, 60],
  km: [0.5, 1, 2, 5],
  m: [100, 250, 500, 1000],
  generic: [1, 2, 5, 10, 15, 20],
};

/** Default one-tap amount when there is no last-used / learned value. */
export const QUANTITY_DEFAULTS: Record<Exclude<QuantityUnitFamily, "count">, number> = {
  ml: 250,
  l: 0.5,
  g: 100,
  kg: 1,
  min: 15,
  km: 1,
  m: 500,
  generic: 1,
};

export function classifyUnit(unit: string | null | undefined): QuantityUnitFamily {
  const u = (unit ?? "").trim().toLowerCase();
  if (!u || COUNT_UNITS.has(u)) return "count";
  if (u === "ml") return "ml";
  if (u === "l" || u === "litro" || u === "litros") return "l";
  if (u === "g" || u === "grama" || u === "gramas" || u === "grams") return "g";
  if (u === "kg") return "kg";
  if (
    u === "min" || u === "mins" || u === "minute" || u === "minutes" ||
    u === "minuto" || u === "minutos"
  ) {
    return "min";
  }
  if (u === "km") return "km";
  if (u === "m" || u === "metro" || u === "metros") return "m";
  if (/^(oz|lb|lbs|cal|kcal|h|hrs?|horas?)$/i.test(u)) return "generic";
  return "count";
}

export function isQuantityUnit(unit: string | null | undefined): boolean {
  return classifyUnit(unit) !== "count";
}

/**
 * Whether this tracker should show the amount picker beside the quick-log
 * button. Count trackers and water-in-bowls mode stay one-tap (+ optional Outro).
 */
export function usesQuantityQuickLog(
  category: TrackerCategory,
  unit: string | null | undefined,
): boolean {
  if (COUNT_CATEGORIES.has(category)) return false;
  // Water bowls mode is count-like (+1 pote), not ml/L presets.
  if (category === "water" && isWaterBowlsUnit(unit)) return false;
  if (QUANTITY_CATEGORIES.has(category)) return true;
  return isQuantityUnit(unit ?? CATEGORY_META[category].unit);
}

/** True when daily logging should use the bowls (+1 pote) control. */
export function isWaterBowlsTracker(
  category: TrackerCategory,
  unit: string | null | undefined,
): boolean {
  return category === "water" && isWaterBowlsUnit(unit);
}

/** Preset amounts for the quantity dropdown — unit-family based. */
export function getQuantityPresets(
  unit: string | null | undefined,
  targetPerDay?: number | null,
): number[] {
  if (targetPerDay != null && Number.isFinite(targetPerDay) && targetPerDay > 0) {
    const fromGoal = buildGoalQuickOptions(targetPerDay, unit);
    if (fromGoal.length > 0) return fromGoal.map((o) => o.value);
  }
  const family = classifyUnit(unit);
  if (family === "count") return [1];
  return [...QUANTITY_PRESETS[family]];
}

export type GoalQuickOption = {
  /** Value to log, in the tracker's unit. */
  value: number;
  /** Display label (no leading +). */
  label: string;
};

/** Convert a daily goal into a base unit for fraction math (ml for liquid, else native). */
export function goalToBaseUnits(
  target: number,
  family: QuantityUnitFamily,
): number | null {
  if (!Number.isFinite(target) || target <= 0) return null;
  if (family === "count") return null;
  if (family === "l") return target * 1000;
  return target;
}

export function baseUnitsToTrackerValue(
  base: number,
  family: QuantityUnitFamily,
): number {
  if (family === "l") {
    const liters = base / 1000;
    // Keep clean fractions (0.25, 0.5, 1) without float noise.
    return Math.round(liters * 1000) / 1000;
  }
  return base;
}

/** Round partial goal fractions to practical increments. */
export function roundGoalFraction(
  baseAmount: number,
  family: QuantityUnitFamily,
): number {
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) return 0;
  if (family === "ml" || family === "l") {
    // Practical 5 ml steps; .5 ties round down so 47.5 → 45 (not 50).
    if (baseAmount >= 10) return roundToStepHalfDown(baseAmount, 5);
    return Math.max(1, Math.round(baseAmount));
  }
  if (family === "min" || family === "m" || family === "g") {
    if (baseAmount >= 10) return roundToStepHalfDown(baseAmount, 5);
    return Math.max(1, Math.round(baseAmount));
  }
  if (family === "kg" || family === "km") {
    return Math.max(0.1, Math.round(baseAmount * 10) / 10);
  }
  // generic
  if (baseAmount >= 1) return Math.round(baseAmount * 10) / 10;
  return Math.round(baseAmount * 100) / 100;
}

/** Round to nearest `step`; exact midpoints round toward zero/down for positives. */
export function roundToStepHalfDown(value: number, step: number): number {
  if (step <= 0) return value;
  const q = value / step;
  const base = Math.floor(q);
  const frac = q - base;
  if (frac > 0.5) return (base + 1) * step;
  return base * step;
}

/** Brazilian-friendly number (1.5 → "1,5"). */
export function formatBrNumber(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return String(value);
  const rounded = Math.round(value * 100) / 100;
  return String(rounded).replace(".", ",");
}

/**
 * Human label for a quantity. Liquids prefer ml / L:
 * 500 → "500 ml", 1000 → "1 L", 1500 → "1,5 L".
 */
export function formatQuantityLabel(
  value: number,
  unit: string | null | undefined,
): string {
  const family = classifyUnit(unit);
  if (family === "ml" || family === "l") {
    const ml = family === "l" ? value * 1000 : value;
    if (ml >= 1000) {
      const liters = ml / 1000;
      return `${formatBrNumber(liters)} L`;
    }
    return `${formatBrNumber(ml)} ml`;
  }
  const u = (unit ?? "").trim();
  const n = formatBrNumber(value);
  return u ? `${n} ${u}` : n;
}

/**
 * Build ~25% / ~50% / 100% quick options from the configured daily goal.
 * Display-time only — does not rewrite stored tracker history.
 * Returns [] for count / non-numeric units (caller keeps static fallback).
 */
export function buildGoalQuickOptions(
  targetPerDay: number,
  unit: string | null | undefined,
): GoalQuickOption[] {
  const family = classifyUnit(unit);
  if (family === "count") return [];

  const baseGoal = goalToBaseUnits(targetPerDay, family);
  if (baseGoal == null) return [];

  const fractions = [0.25, 0.5, 1] as const;
  const seen = new Set<number>();
  const options: GoalQuickOption[] = [];

  for (const fraction of fractions) {
    let base =
      fraction === 1
        ? baseGoal
        : roundGoalFraction(baseGoal * fraction, family);
    if (base <= 0) continue;
    // Never exceed the full goal for partials after rounding.
    if (fraction < 1 && base >= baseGoal) {
      base = roundGoalFraction(baseGoal * fraction, family);
      if (base >= baseGoal) continue;
    }
    const value = baseUnitsToTrackerValue(base, family);
    // Deduplicate by rounded base ml / native units.
    const dedupeKey =
      family === "l" || family === "ml"
        ? Math.round(family === "l" ? value * 1000 : value)
        : Math.round(value * 1000);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    options.push({
      value,
      label: formatQuantityLabel(value, unit),
    });
  }

  return options;
}

/** Default increment for a unit (before last-used / learned overrides). */
export function getDefaultQuantity(
  category: TrackerCategory,
  unit: string | null | undefined,
): number {
  const resolvedUnit = unit ?? CATEGORY_META[category].unit;
  if (!usesQuantityQuickLog(category, resolvedUnit)) {
    return CATEGORY_META[category].quickValue;
  }
  const family = classifyUnit(resolvedUnit);
  if (family === "count") return CATEGORY_META[category].quickValue;
  // Prefer category meta when it matches the unit family (e.g. water → 250 ml).
  const metaDefault = CATEGORY_META[category].quickValue;
  const presets = QUANTITY_PRESETS[family];
  if (presets.includes(metaDefault)) return metaDefault;
  return QUANTITY_DEFAULTS[family];
}

const LAST_QUICK_VALUE_KEY = "petid:quick-log-last";

function readLastQuickMap(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LAST_QUICK_VALUE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

/** Last amount the owner logged for this tracker (client-only, no migration). */
export function getLastQuickValue(trackerId: string): number | null {
  const n = readLastQuickMap()[trackerId];
  return n && n > 0 ? n : null;
}

export function setLastQuickValue(trackerId: string, value: number): void {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(value) || value <= 0) return;
  try {
    const map = readLastQuickMap();
    map[trackerId] = value;
    localStorage.setItem(LAST_QUICK_VALUE_KEY, JSON.stringify(map));
  } catch {
    // private mode / quota — ignore; logging still works with the default
  }
}

export type QuickLogEntryLike = { tracker_id: string; value: number; completed_at: string };

/** Rounding step when learning a preferred amount from history (by unit family). */
export function getLearnRoundTo(unit: string | null | undefined): number {
  const family = classifyUnit(unit);
  switch (family) {
    case "ml":
      return 25;
    case "min":
      return 5;
    case "g":
      return 10;
    case "l":
      return 0.25;
    case "kg":
      return 0.5;
    case "km":
      return 0.5;
    case "m":
      return 50;
    default:
      return 1;
  }
}

/**
 * Median of recent single-log amounts for this routine item — used when the
 * owner hasn't picked a preferred quick-log amount yet.
 * (No network, no AI — pure math over already-fetched entries.)
 */
export function learnPreferredLogAmount(
  entries: QuickLogEntryLike[],
  trackerId: string,
  now: Date = new Date(),
  opts?: { lookbackDays?: number; minSamples?: number; roundTo?: number },
): number | null {
  const lookbackDays = opts?.lookbackDays ?? 30;
  const minSamples = opts?.minSamples ?? 3;
  const roundTo = opts?.roundTo ?? 10;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - lookbackDays);

  const values = entries
    .filter(
      (e) => e.tracker_id === trackerId && new Date(e.completed_at).getTime() >= cutoff.getTime(),
    )
    .map((e) => Number(e.value))
    .filter((v) => Number.isFinite(v) && v > 0);

  if (values.length < minSamples) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  if (median <= 0) return null;
  const rounded = Math.round(median / roundTo) * roundTo;
  // Avoid floating dust (e.g. 0.30000000004).
  const cleaned = Math.round(rounded * 1000) / 1000;
  return Math.max(roundTo, cleaned);
}

export type ResolveQuickLogAmountOpts = {
  trackerId: string;
  category: TrackerCategory;
  unit?: string | null;
  /** Explicit learned value (optional — entries also work). */
  learnedFromHistory?: number | null;
  /** Already-fetched entries; used when localStorage has no last amount. */
  entries?: QuickLogEntryLike[];
  now?: Date;
};

/**
 * One-tap amount for Rotina UI and Assistant — shared priority:
 * 1) last amount the user intentionally selected (localStorage)
 * 2) learned preferred amount from history
 * 3) unit/category default
 */
export function resolveQuickLogAmount(opts: ResolveQuickLogAmountOpts): number {
  const unit = opts.unit ?? CATEGORY_META[opts.category].unit;
  const fallback = getDefaultQuantity(opts.category, unit);
  if (!usesQuantityQuickLog(opts.category, unit)) return fallback;

  const last = getLastQuickValue(opts.trackerId);
  if (last != null) return last;

  let learned = opts.learnedFromHistory ?? null;
  if (learned == null && opts.entries && opts.entries.length > 0) {
    learned = learnPreferredLogAmount(opts.entries, opts.trackerId, opts.now ?? new Date(), {
      roundTo: getLearnRoundTo(unit),
    });
  }
  if (learned != null && Number.isFinite(learned) && learned > 0) return learned;

  return fallback;
}

/** @deprecated Prefer resolveQuickLogAmount — kept for existing call sites. */
export function resolveQuickValue(
  trackerId: string,
  category: TrackerCategory,
  unit: string | null | undefined,
  learnedFromHistory?: number | null,
): number {
  return resolveQuickLogAmount({ trackerId, category, unit, learnedFromHistory });
}

export function formatQuickLogLabel(value: number, unit: string | null | undefined): string {
  return `+${formatQuantityLabel(value, unit)}`;
}

export type TrackerPreset = {
  title: string;
  category: TrackerCategory;
  target_per_day: number;
  unit: string;
};

export type SpeciesPresetKey = "dog" | "cat" | "bird" | "rabbit" | "other";

export const SPECIES_PRESETS: Record<SpeciesPresetKey, { label: string; trackers: TrackerPreset[] }> = {
  dog: {
    label: "Cachorro",
    trackers: [
      { title: "Alimentação", category: "food", target_per_day: 3, unit: "refeições" },
      { title: "Água", category: "water", target_per_day: 3, unit: WATER_BOWL_UNIT },
      { title: "Passeio", category: "walk", target_per_day: 2, unit: "passeios" },
      { title: "Exercício", category: "exercise", target_per_day: 60, unit: "min" },
    ],
  },
  cat: {
    label: "Gato",
    trackers: [
      { title: "Alimentação", category: "food", target_per_day: 3, unit: "refeições" },
      { title: "Água", category: "water", target_per_day: 3, unit: WATER_BOWL_UNIT },
      { title: "Caixa de areia", category: "bathroom", target_per_day: 2, unit: "vezes" },
      { title: "Brincadeira", category: "exercise", target_per_day: 20, unit: "min" },
    ],
  },
  bird: {
    label: "Ave",
    trackers: [
      { title: "Alimentação", category: "food", target_per_day: 2, unit: "refeições" },
      { title: "Água", category: "water", target_per_day: 2, unit: WATER_BOWL_UNIT },
      { title: "Tempo fora da gaiola", category: "exercise", target_per_day: 30, unit: "min" },
    ],
  },
  rabbit: {
    label: "Coelho",
    trackers: [
      { title: "Feno / Alimentação", category: "food", target_per_day: 2, unit: "refeições" },
      { title: "Água", category: "water", target_per_day: 2, unit: WATER_BOWL_UNIT },
      { title: "Tempo livre", category: "exercise", target_per_day: 30, unit: "min" },
    ],
  },
  other: {
    label: "Outro",
    trackers: [
      { title: "Alimentação", category: "food", target_per_day: 2, unit: "refeições" },
      { title: "Água", category: "water", target_per_day: 3, unit: WATER_BOWL_UNIT },
      { title: "Interação / Exercício", category: "exercise", target_per_day: 1, unit: "vezes" },
    ],
  },
};

/* -------------------- Smart onboarding routine -------------------- */

export type PetAgeGroup = "puppy" | "adult" | "senior";
export type PetSize = "small" | "medium" | "large";
export type PetLifestyle = "apartment" | "house" | "active" | "normal" | "senior";

export const AGE_OPTIONS: { value: PetAgeGroup; label: string }[] = [
  { value: "puppy", label: "Filhote" },
  { value: "adult", label: "Adulto" },
  { value: "senior", label: "Idoso" },
];

/** Approximate dog age guidance for routine setup (explanatory only — not validation). */
export const DOG_AGE_HELPERS: Record<PetAgeGroup, string> = {
  puppy: "Até aproximadamente 1 ano",
  adult: "Aproximadamente 1 a 7 anos",
  senior: "A partir de aproximadamente 7 anos",
};

export const DOG_AGE_HELPER_FOOTNOTE =
  "As faixas são aproximadas e podem variar conforme porte e raça.";

export function ageHelpersForSpecies(
  species: SpeciesPresetKey | null | undefined,
): Record<PetAgeGroup, string> | null {
  if (species === "dog") return DOG_AGE_HELPERS;
  return null;
}

export const SIZE_OPTIONS: { value: PetSize; label: string }[] = [
  { value: "small", label: "Pequeno" },
  { value: "medium", label: "Médio" },
  { value: "large", label: "Grande" },
];

export const LIFESTYLE_OPTIONS: { value: PetLifestyle; label: string }[] = [
  { value: "apartment", label: "Apartamento" },
  { value: "house", label: "Casa com quintal" },
  { value: "active", label: "Muito ativo" },
  { value: "normal", label: "Rotina tranquila" },
  { value: "senior", label: "Ritmo mais calmo" },
];

export type RoutineDraftItem = {
  key: string;
  title: string;
  category: TrackerCategory;
  target_per_day: number;
  unit: string;
};

/** Presentational fields for the plan-review row (supports stacked mobile layout). */
export type RoutineReviewDisplay = {
  key: string;
  title: string;
  /** Raw editable target string (may be empty while typing). */
  targetInput: string;
  /** Unit + frequency label, e.g. "ml/dia" — never truncates the numeric target. */
  unitFrequency: string;
};

export function toRoutineReviewDisplay(
  item: RoutineDraftItem,
  targetInput: string,
): RoutineReviewDisplay {
  const parsed = Number(targetInput.replace(",", "."));
  const targetNum = Number.isFinite(parsed) && parsed > 0 ? parsed : item.target_per_day;
  return {
    key: item.key,
    title: item.title,
    targetInput,
    unitFrequency: formatTrackerGoalPerDay(targetNum, item.unit),
  };
}

/** Parse a quantity field for save. Allows empty while editing — reject only at submit. */
export function parseRoutineQuantity(raw: string):
  | { ok: true; value: number }
  | { ok: false; message: string } {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) {
    return { ok: false, message: "Informe uma quantidade válida." };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, message: "Informe uma quantidade válida." };
  }
  return { ok: true, value };
}

/**
 * Turns the 4-question onboarding into a starting set of trackers. Pure
 * client-side heuristics on top of `SPECIES_PRESETS` — no schema change, and
 * the result feeds the exact same `trackers` insert the manual "+ Novo
 * tracker" flow already uses, so nothing forces the user's hand: every value
 * is editable before (and after) creation.
 */
export function buildSmartRoutine(opts: {
  species: SpeciesPresetKey;
  age: PetAgeGroup;
  size: PetSize;
  lifestyle: PetLifestyle;
}): RoutineDraftItem[] {
  const base = SPECIES_PRESETS[opts.species].trackers;

  return base.map((t, i) => {
    let target = t.target_per_day;

    if (t.category === "walk" || t.category === "exercise") {
      if (opts.lifestyle === "active") target = Math.ceil(target * 1.5);
      if (opts.age === "senior" || opts.lifestyle === "senior") target = Math.max(1, Math.round(target * 0.7));
      if (opts.age === "puppy") target += 1;
    }

    if (t.category === "food" && opts.age === "puppy") {
      target += 1;
    }

    if (t.category === "water" && t.unit === "ml") {
      const sizeMult = opts.size === "small" ? 0.6 : opts.size === "large" ? 1.6 : 1;
      target = Math.max(50, Math.round((target * sizeMult) / 50) * 50);
    }

    if (t.category === "water" && isWaterBowlsUnit(t.unit)) {
      if (opts.size === "small") target = Math.max(1, target - 1);
      if (opts.size === "large") target = target + 1;
    }

    if (t.category === "bathroom" && opts.age === "puppy") {
      target += 2;
    }

    return {
      key: `${t.category}-${i}`,
      title: t.title,
      category: t.category,
      target_per_day: Math.max(1, target),
      unit: t.unit,
    };
  });
}

function toDate(value: Date | string): Date {
  return typeof value === "string" ? new Date(value) : value;
}

/**
 * Local calendar day (YYYY-MM-DD) for reminder/care boundaries.
 * Date-only strings are treated as calendar dates — never as UTC midnight
 * (which would shift the day for Americas timezones near midnight).
 * Full timestamps use the device's local timezone via Date getters.
 */
export function dayKey(value: Date | string): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    // Postgres DATE often serialized as midnight UTC — keep the written calendar day.
    const midnightUtc = trimmed.match(
      /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.\d+)?(?:Z|[+-]00:00)?$/,
    );
    if (midnightUtc) return midnightUtc[1];
  }
  const d = toDate(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayKey(): string {
  return dayKey(new Date());
}

export function dayLabel(key: string): string {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (key === todayKey()) return "Hoje";
  if (key === dayKey(y)) return "Ontem";
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

export function formatTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export type TrackerLike = { id: string; target_per_day: number; is_active: boolean };
export type EntryLike = { tracker_id: string; value: number; completed_at: string };

export function groupEntriesByDay<T extends EntryLike>(entries: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const e of entries) {
    const k = dayKey(e.completed_at);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(e);
  }
  return map;
}

/** Fraction (0..1) of daily targets met for a given day — shared by streak/report math. */
export function dayCompletion(dateKey: string, activeTrackers: TrackerLike[], entriesByDay: Map<string, EntryLike[]>): number {
  if (activeTrackers.length === 0) return 0;
  const dayEntries = entriesByDay.get(dateKey) ?? [];
  const sums = new Map<string, number>();
  for (const e of dayEntries) sums.set(e.tracker_id, (sums.get(e.tracker_id) ?? 0) + Number(e.value));
  const fractions = activeTrackers.map((t) => (t.target_per_day > 0 ? Math.min(1, (sums.get(t.id) ?? 0) / t.target_per_day) : 0));
  return fractions.reduce((a, b) => a + b, 0) / fractions.length;
}

export type DailyCareStats = {
  currentStreak: number;
  bestStreak: number;
  todayCompletionPct: number;
  last7Days: { label: string; pct: number }[];
};

/** Computed client-side from a bounded window of entries the caller already fetched. */
export function computeStats(trackers: TrackerLike[], entries: EntryLike[], windowDays = 60): DailyCareStats {
  const entriesByDay = groupEntriesByDay(entries);
  const active = trackers.filter((t) => t.is_active);

  const keys: string[] = [];
  const cursor = new Date();
  for (let i = 0; i < windowDays; i++) {
    keys.push(dayKey(cursor));
    cursor.setDate(cursor.getDate() - 1);
  }

  const completions = keys.map((k) => dayCompletion(k, active, entriesByDay));
  const isDone = (pct: number) => pct >= 0.999;

  let currentStreak = 0;
  if (active.length > 0) {
    for (const pct of completions) {
      if (isDone(pct)) currentStreak++;
      else break;
    }
  }

  let bestStreak = 0;
  let running = 0;
  for (const pct of completions) {
    if (isDone(pct)) {
      running++;
      bestStreak = Math.max(bestStreak, running);
    } else running = 0;
  }

  const last7Days = keys
    .slice(0, 7)
    .reverse()
    .map((k) => {
      const [y, m, d] = k.split("-").map(Number);
      const label = k === todayKey() ? "Hoje" : new Date(y, m - 1, d).toLocaleDateString("pt-BR", { weekday: "short" });
      return { label, pct: Math.round(dayCompletion(k, active, entriesByDay) * 100) };
    });

  return {
    currentStreak,
    bestStreak,
    todayCompletionPct: Math.round((completions[0] ?? 0) * 100),
    last7Days,
  };
}
