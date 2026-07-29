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

export type TrackerPreset = {
  title: string;
  category: TrackerCategory;
  target_per_day: number;
  unit: string;
};

export type SpeciesPresetKey = "dog" | "cat" | "bird" | "rabbit";

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
};

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
