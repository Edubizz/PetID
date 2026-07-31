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

/** Units that mean "one event" — always log +1, no amount picker. */
const COUNT_UNITS = new Set([
  "refeições", "refeicoes", "meals", "doses", "passeios", "walks",
  "vezes", "sessões", "sessoes", "sessions", "trocas", "times",
]);

/**
 * Categories that should stay one-tap forever (meals / walks / medication),
 * regardless of whatever unit string the owner typed.
 */
const COUNT_CATEGORIES = new Set<TrackerCategory>(["food", "medication", "walk"]);

/** Categories that always use the quantity picker. */
const QUANTITY_CATEGORIES = new Set<TrackerCategory>(["water", "exercise"]);

const QUANTITY_UNIT_RE = /^(ml|l|g|kg|min|mins?|minutes?|minutos?|km|m|oz|lb|lbs|cal|kcal|h|hrs?|horas?)$/i;

export function isQuantityUnit(unit: string | null | undefined): boolean {
  if (!unit) return false;
  const u = unit.trim().toLowerCase();
  if (!u || COUNT_UNITS.has(u)) return false;
  return QUANTITY_UNIT_RE.test(u);
}

/**
 * Whether this tracker should show the amount picker beside the quick-log
 * button. Count trackers (meals, walks, medication, "vezes", …) stay one-tap.
 */
export function usesQuantityQuickLog(
  category: TrackerCategory,
  unit: string | null | undefined,
): boolean {
  if (COUNT_CATEGORIES.has(category)) return false;
  if (QUANTITY_CATEGORIES.has(category)) return true;
  return isQuantityUnit(unit ?? CATEGORY_META[category].unit);
}

/** Preset amounts for the quantity dropdown, keyed by unit family. */
export function getQuantityPresets(unit: string | null | undefined): number[] {
  const u = (unit ?? "").trim().toLowerCase();
  if (u === "ml") return [100, 150, 250, 300, 400, 500];
  if (u === "l" || u === "litros" || u === "litro") return [0.25, 0.5, 1, 1.5, 2];
  if (u === "min" || u === "mins" || u === "minute" || u === "minutes" || u === "minuto" || u === "minutos") {
    return [10, 15, 20, 30, 45, 60];
  }
  if (u === "g" || u === "gramas" || u === "grams") return [50, 100, 150, 200, 250, 500];
  if (u === "kg") return [0.5, 1, 1.5, 2, 2.5, 5];
  if (u === "km") return [0.5, 1, 2, 3, 5, 10];
  if (u === "m" || u === "metros") return [100, 250, 500, 1000, 2000];
  // Generic numeric unit — a sensible ladder around the category default.
  return [1, 2, 5, 10, 15, 20];
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
export function getLastQuickValue(trackerId: string, fallback: number): number {
  const n = readLastQuickMap()[trackerId];
  return n && n > 0 ? n : fallback;
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

/** Value the primary quick-log button should use right now. */
export function resolveQuickValue(
  trackerId: string,
  category: TrackerCategory,
  unit: string | null | undefined,
): number {
  const fallback = CATEGORY_META[category].quickValue;
  if (!usesQuantityQuickLog(category, unit)) return fallback;
  return getLastQuickValue(trackerId, fallback);
}

export function formatQuickLogLabel(value: number, unit: string | null | undefined): string {
  const u = (unit ?? "").trim();
  // Avoid "1.5 km" becoming "1,5" inconsistently — keep a short decimal.
  const n = Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  return u ? `+${n} ${u}` : `+${n}`;
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
      { title: "Água", category: "water", target_per_day: 1500, unit: "ml" },
      { title: "Passeio", category: "walk", target_per_day: 2, unit: "passeios" },
      { title: "Exercício", category: "exercise", target_per_day: 60, unit: "min" },
    ],
  },
  cat: {
    label: "Gato",
    trackers: [
      { title: "Alimentação", category: "food", target_per_day: 3, unit: "refeições" },
      { title: "Água", category: "water", target_per_day: 250, unit: "ml" },
      { title: "Caixa de areia", category: "bathroom", target_per_day: 2, unit: "vezes" },
      { title: "Brincadeira", category: "exercise", target_per_day: 20, unit: "min" },
    ],
  },
  bird: {
    label: "Ave",
    trackers: [
      { title: "Alimentação", category: "food", target_per_day: 2, unit: "refeições" },
      { title: "Água", category: "water", target_per_day: 50, unit: "ml" },
      { title: "Tempo fora da gaiola", category: "exercise", target_per_day: 30, unit: "min" },
    ],
  },
  rabbit: {
    label: "Coelho",
    trackers: [
      { title: "Feno / Alimentação", category: "food", target_per_day: 2, unit: "refeições" },
      { title: "Água", category: "water", target_per_day: 100, unit: "ml" },
      { title: "Tempo livre", category: "exercise", target_per_day: 30, unit: "min" },
    ],
  },
  other: {
    label: "Outro",
    trackers: [
      { title: "Alimentação", category: "food", target_per_day: 2, unit: "refeições" },
      { title: "Água", category: "water", target_per_day: 2, unit: "trocas" },
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

export function dayKey(value: Date | string): string {
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

function dayCompletion(dateKey: string, activeTrackers: TrackerLike[], entriesByDay: Map<string, EntryLike[]>): number {
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
