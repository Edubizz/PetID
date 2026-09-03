import {
  CATEGORY_META,
  buildCompatibleDayTotalsMap,
  computeStats,
  dayCompletion,
  dayKey,
  groupEntriesByDay,
  type TrackerCategory,
} from "@/lib/daily-care";
import {
  average,
  buildDayTotalsMap,
  consecutiveCompletedDays,
  daysBetween,
  type InsightsAppointment,
  type InsightsEntry,
  type InsightsTracker,
  type InsightsVaccine,
  type InsightsWeight,
} from "@/lib/pet-insights";

/**
 * Weekly / Health-History report engine — pure analytics derived from the
 * exact same rows `useHealthTimeline` already fetches. No AI, no I/O: feed
 * it rows, get back a fully-computed report for the chosen period.
 */

export type ReportPeriodDays = 7 | 30 | 90;

export const REPORT_PERIODS: { value: ReportPeriodDays; label: string }[] = [
  { value: 7, label: "Últimos 7 dias" },
  { value: 30, label: "Últimos 30 dias" },
  { value: 90, label: "Últimos 90 dias" },
];

export type ReportPoint = { date: string; label: string; value: number };

export type ReportCategorySummary = {
  category: TrackerCategory;
  label: string;
  unit: string;
  averagePerDay: number;
  totalInPeriod: number;
  trend: ReportPoint[];
  /** % change between the first and second half of the period, null if not enough data. */
  changePct: number | null;
};

export type ReportWeightSummary = {
  trend: { date: string; label: string; value: number }[];
  latestKg: number;
  changeKg: number | null;
  changePct: number | null;
  isStable: boolean;
};

export type ReportVaccineSummary = {
  appliedInPeriod: number;
  overdueCount: number;
  upcomingCount: number;
  allUpToDate: boolean;
  hasAny: boolean;
};

export type ReportAppointmentSummary = {
  totalInPeriod: number;
  completedInPeriod: number;
  upcomingCount: number;
};

export type ReportMilestoneIcon = "flame" | "calendar" | "check" | "pill" | "scale" | "trophy";

export type ReportMilestone = {
  id: string;
  title: string;
  description: string;
  achieved: boolean;
  icon: ReportMilestoneIcon;
};

export type PetReportPet = { id: string; name: string; created_at: string };

export type PetReportInput = {
  pet: PetReportPet;
  trackers: InsightsTracker[];
  entries: InsightsEntry[];
  weights: InsightsWeight[];
  vaccines: InsightsVaccine[];
  appointments: InsightsAppointment[];
  now?: Date;
};

export type PetReport = {
  periodDays: ReportPeriodDays;
  rangeFrom: Date;
  rangeTo: Date;
  hasAnyTrackers: boolean;
  completionPct: number;
  averageCompletionPct: number;
  longestStreak: number;
  currentStreak: number;
  completionByDay: ReportPoint[];
  categories: ReportCategorySummary[];
  medicationAdherencePct: number | null;
  weight: ReportWeightSummary | null;
  vaccines: ReportVaccineSummary;
  appointments: ReportAppointmentSummary;
  observations: string[];
  milestones: ReportMilestone[];
};

/* -------------------- Small pure helpers -------------------- */

function round(n: number): number {
  return Math.round(n);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function periodDayKeys(rangeFrom: Date, rangeTo: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(rangeFrom);
  while (cursor.getTime() <= rangeTo.getTime()) {
    keys.push(dayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

function shortDayLabel(key: string, periodDays: ReportPeriodDays): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (periodDays === 7) {
    return date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  }
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function pctChange(before: number, after: number): number | null {
  if (before <= 0) return null;
  return round(((after - before) / before) * 100);
}

function splitHalvesAverage(points: ReportPoint[]): { before: number; after: number } {
  if (points.length < 2) return { before: 0, after: 0 };
  const mid = Math.floor(points.length / 2);
  const first = points.slice(0, mid);
  const second = points.slice(mid);
  return {
    before: average(first.map((p) => p.value)),
    after: average(second.map((p) => p.value)),
  };
}

/* -------------------- Core builder -------------------- */

export function buildPetReport(input: PetReportInput, periodDays: ReportPeriodDays): PetReport {
  const now = input.now ?? new Date();
  const rangeTo = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const rangeFrom = new Date(rangeTo);
  rangeFrom.setDate(rangeFrom.getDate() - (periodDays - 1));

  const trackers = input.trackers;
  const active = trackers.filter((t) => t.is_active);
  const days = periodDayKeys(rangeFrom, rangeTo);
  const entriesByDay = groupEntriesByDay(input.entries);

  const completionByDay: ReportPoint[] = days.map((day) => ({
    date: day,
    label: shortDayLabel(day, periodDays),
    value: round(dayCompletion(day, active, entriesByDay) * 100),
  }));

  const averageCompletionPct =
    completionByDay.length > 0 ? round(average(completionByDay.map((p) => p.value))) : 0;
  const completionPct =
    completionByDay.length > 0 ? completionByDay[completionByDay.length - 1].value : 0;

  const stats = computeStats(trackers, input.entries, periodDays);
  const longestStreak = stats.bestStreak;
  const currentStreak = stats.currentStreak;

  const categories = buildCategorySummaries(active, input.entries, days, periodDays);

  const medTrackers = active.filter((t) => t.category === "medication");
  let medicationAdherencePct: number | null = null;
  if (medTrackers.length > 0) {
    const metDays = days.filter((day) => {
      const dayEntries = entriesByDay.get(day) ?? [];
      const sums = new Map<string, number>();
      for (const e of dayEntries)
        sums.set(e.tracker_id, (sums.get(e.tracker_id) ?? 0) + Number(e.value));
      return medTrackers.every((t) => (sums.get(t.id) ?? 0) >= t.target_per_day);
    });
    medicationAdherencePct = round((metDays.length / days.length) * 100);
  }

  const weight = buildWeightSummary(input.weights, rangeFrom, rangeTo, periodDays);
  const vaccines = buildVaccineSummary(input.vaccines, rangeFrom, now);
  const appointments = buildAppointmentSummary(input.appointments, rangeFrom, now);

  const observations = buildObservations({
    categories,
    weight,
    vaccines,
    appointments,
    averageCompletionPct,
    medicationAdherencePct,
  });

  const milestones = buildMilestones(input, now);

  return {
    periodDays,
    rangeFrom,
    rangeTo,
    hasAnyTrackers: trackers.length > 0,
    completionPct,
    averageCompletionPct,
    longestStreak,
    currentStreak,
    completionByDay,
    categories,
    medicationAdherencePct,
    weight,
    vaccines,
    appointments,
    observations,
    milestones,
  };
}

/* -------------------- Category (water/food/walk/exercise) trends -------------------- */

const REPORTED_CATEGORIES: TrackerCategory[] = ["water", "food", "walk", "exercise"];

function buildCategorySummaries(
  active: InsightsTracker[],
  entries: InsightsEntry[],
  days: string[],
  periodDays: ReportPeriodDays,
): ReportCategorySummary[] {
  const out: ReportCategorySummary[] = [];
  const daySet = new Set(days);

  for (const category of REPORTED_CATEGORIES) {
    const catTrackers = active.filter((t) => t.category === category);
    if (catTrackers.length === 0) continue;

    const dayTotals = new Map<string, number>();
    for (const t of catTrackers) {
      const unit = t.unit ?? CATEGORY_META[category].unit;
      if (category === "water") {
        const compatible = buildCompatibleDayTotalsMap(entries, t.id, unit);
        for (const [day, total] of compatible) {
          if (!daySet.has(day)) continue;
          dayTotals.set(day, (dayTotals.get(day) ?? 0) + total);
        }
      } else {
        for (const e of entries) {
          if (e.tracker_id !== t.id) continue;
          const day = dayKey(e.completed_at);
          if (!daySet.has(day)) continue;
          dayTotals.set(day, (dayTotals.get(day) ?? 0) + Number(e.value));
        }
      }
    }

    const trend: ReportPoint[] = days.map((day) => ({
      date: day,
      label: shortDayLabel(day, periodDays),
      value: round1(dayTotals.get(day) ?? 0),
    }));

    const totalInPeriod = round1(trend.reduce((sum, p) => sum + p.value, 0));
    const averagePerDay = round1(totalInPeriod / Math.max(1, days.length));
    if (totalInPeriod <= 0) continue; // gracefully hide empty categories — no data logged

    const { before, after } = splitHalvesAverage(trend);
    const changePct = pctChange(before, after);
    const unit = catTrackers[0].unit ?? CATEGORY_META[category].unit;

    out.push({
      category,
      label: CATEGORY_META[category].label,
      unit,
      averagePerDay,
      totalInPeriod,
      trend,
      changePct,
    });
  }

  return out;
}

/* -------------------- Weight -------------------- */

function buildWeightSummary(
  weights: InsightsWeight[],
  rangeFrom: Date,
  rangeTo: Date,
  periodDays: ReportPeriodDays,
): ReportWeightSummary | null {
  const inRange = weights
    .filter((w) => {
      const t = new Date(w.measured_at).getTime();
      return t >= rangeFrom.getTime() && t <= rangeTo.getTime() + 86400000;
    })
    .sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime());

  if (inRange.length === 0) return null;

  const trend = inRange.map((w) => ({
    date: w.measured_at,
    label: shortDayLabel(dayKey(w.measured_at), periodDays),
    value: w.weight_kg,
  }));

  const latestKg = inRange[inRange.length - 1].weight_kg;
  const firstKg = inRange[0].weight_kg;
  const changeKg = inRange.length >= 2 ? round1(latestKg - firstKg) : null;
  const changePct =
    inRange.length >= 2 && firstKg > 0 ? round(((latestKg - firstKg) / firstKg) * 100) : null;
  const isStable =
    changeKg !== null &&
    (Math.abs(changeKg) < 0.3 || (changePct !== null && Math.abs(changePct) < 3));

  return { trend, latestKg, changeKg, changePct, isStable };
}

/* -------------------- Vaccines / Appointments -------------------- */

function buildVaccineSummary(
  vaccines: InsightsVaccine[],
  rangeFrom: Date,
  now: Date,
): ReportVaccineSummary {
  const appliedInPeriod = vaccines.filter((v) => {
    if (!v.applied_at) return false;
    const t = new Date(v.applied_at).getTime();
    return t >= rangeFrom.getTime() && t <= now.getTime();
  }).length;

  const overdueCount = vaccines.filter(
    (v) => v.next_dose && new Date(v.next_dose).getTime() < now.getTime(),
  ).length;
  const upcomingCount = vaccines.filter((v) => {
    if (!v.next_dose) return false;
    const days = daysBetween(now, new Date(v.next_dose));
    return days >= 0 && days <= 30;
  }).length;

  const hasAny = vaccines.some((v) => Boolean(v.applied_at));
  return {
    appliedInPeriod,
    overdueCount,
    upcomingCount,
    allUpToDate: hasAny && overdueCount === 0,
    hasAny,
  };
}

function buildAppointmentSummary(
  appointments: InsightsAppointment[],
  rangeFrom: Date,
  now: Date,
): ReportAppointmentSummary {
  const inPeriod = appointments.filter((a) => {
    const t = new Date(a.scheduled_at).getTime();
    return t >= rangeFrom.getTime() && t <= now.getTime();
  });
  const upcomingCount = appointments.filter(
    (a) => new Date(a.scheduled_at).getTime() > now.getTime(),
  ).length;
  return { totalInPeriod: inPeriod.length, completedInPeriod: inPeriod.length, upcomingCount };
}

/* -------------------- Health summary (auto observations) -------------------- */

const CATEGORY_TREND_LABEL: Record<TrackerCategory, { increased: string; decreased: string }> = {
  water: { increased: "Água aumentou", decreased: "Água diminuiu" },
  food: { increased: "Alimentação aumentou", decreased: "Alimentação diminuiu" },
  walk: { increased: "Passeios aumentaram", decreased: "Passeios diminuíram" },
  exercise: { increased: "Exercício aumentou", decreased: "Exercício diminuiu" },
  medication: { increased: "Medicação aumentou", decreased: "Medicação diminuiu" },
  bathroom: { increased: "Aumentou", decreased: "Diminuiu" },
  grooming: { increased: "Higiene aumentou", decreased: "Higiene diminuiu" },
  training: { increased: "Treinos aumentaram", decreased: "Treinos diminuíram" },
  custom: { increased: "Aumentou", decreased: "Diminuiu" },
};

function buildObservations(args: {
  categories: ReportCategorySummary[];
  weight: ReportWeightSummary | null;
  vaccines: ReportVaccineSummary;
  appointments: ReportAppointmentSummary;
  averageCompletionPct: number;
  medicationAdherencePct: number | null;
}): string[] {
  const {
    categories,
    weight,
    vaccines,
    appointments,
    averageCompletionPct,
    medicationAdherencePct,
  } = args;
  const observations: string[] = [];

  for (const c of categories) {
    if (c.changePct === null) continue;
    const meta = CATEGORY_TREND_LABEL[c.category];
    if (c.changePct >= 15) observations.push(`${meta.increased} ${Math.abs(c.changePct)}%.`);
    else if (c.changePct <= -15) observations.push(`${meta.decreased} ${Math.abs(c.changePct)}%.`);
  }

  if (weight) {
    if (weight.isStable) observations.push("Peso está estável.");
    else if (weight.changeKg !== null && weight.changeKg > 0)
      observations.push(`Peso aumentou ${Math.abs(weight.changeKg)} kg no período.`);
    else if (weight.changeKg !== null && weight.changeKg < 0)
      observations.push(`Peso diminuiu ${Math.abs(weight.changeKg)} kg no período.`);
  }

  if (vaccines.hasAny) {
    observations.push(
      vaccines.allUpToDate
        ? "Vacinas continuam em dia."
        : "Há vacinas atrasadas — vale checar a Saúde.",
    );
  }

  observations.push(
    appointments.totalInPeriod === 0
      ? "Não houve consultas no período."
      : `${appointments.totalInPeriod} consulta${appointments.totalInPeriod === 1 ? "" : "s"} no período.`,
  );

  if (medicationAdherencePct !== null) {
    if (medicationAdherencePct >= 90) observations.push("Medicação seguida corretamente.");
    else if (medicationAdherencePct < 70) observations.push("Adesão à medicação caiu no período.");
  }

  if (averageCompletionPct >= 90) observations.push("Rotina excelente no período.");
  else if (averageCompletionPct > 0 && averageCompletionPct < 50)
    observations.push("Rotina abaixo do ideal no período.");

  return observations.slice(0, 7);
}

/* -------------------- Milestones (lifetime achievements, not period-scoped) -------------------- */

function buildMilestones(input: PetReportInput, now: Date): ReportMilestone[] {
  const { pet, trackers, entries, weights } = input;
  const lifetime = computeStats(trackers, entries, 365);
  const petAgeDays = daysBetween(new Date(pet.created_at), now);
  const totalCareEntries = entries.length;

  const milestones: ReportMilestone[] = [
    {
      id: "longest-streak",
      title: "Maior sequência",
      description:
        lifetime.bestStreak > 0
          ? `${lifetime.bestStreak} dias consecutivos com todos os cuidados concluídos.`
          : "Complete os cuidados de um dia para começar sua sequência.",
      achieved: lifetime.bestStreak >= 3,
      icon: "flame",
    },
    {
      id: "first-month",
      title: "Primeiro mês completo",
      description:
        petAgeDays >= 30
          ? `${pet.name} faz parte do PetID há mais de um mês.`
          : `Faltam ${Math.max(0, 30 - petAgeDays)} dia${30 - petAgeDays === 1 ? "" : "s"} para completar o primeiro mês.`,
      achieved: petAgeDays >= 30,
      icon: "calendar",
    },
    {
      id: "100-care-logs",
      title: "100 cuidados registrados",
      description:
        totalCareEntries >= 100
          ? "Mais de 100 cuidados diários já foram registrados."
          : `${totalCareEntries} de 100 cuidados registrados.`,
      achieved: totalCareEntries >= 100,
      icon: "check",
    },
  ];

  const medTrackers = trackers.filter((t) => t.category === "medication" && t.is_active);
  if (medTrackers.length > 0) {
    const bestMedStreak = Math.min(
      ...medTrackers.map((t) =>
        consecutiveCompletedDays(buildDayTotalsMap(entries, t.id), t.target_per_day, now, 365),
      ),
    );
    milestones.push({
      id: "medication-streak",
      title: "30 dias sem perder medicação",
      description:
        bestMedStreak >= 30
          ? "30 dias seguidos sem perder nenhuma dose."
          : `${bestMedStreak} de 30 dias seguidos sem perder dose.`,
      achieved: bestMedStreak >= 30,
      icon: "pill",
    });
  }

  const sortedWeights = [...weights].sort(
    (a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime(),
  );
  if (sortedWeights.length >= 2) {
    const cutoff6mo = new Date(now);
    cutoff6mo.setDate(cutoff6mo.getDate() - 180);
    const within = sortedWeights.filter(
      (w) => new Date(w.measured_at).getTime() >= cutoff6mo.getTime(),
    );
    const ref =
      within.length > 0 ? within[within.length - 1] : sortedWeights[sortedWeights.length - 1];
    const spanDays = daysBetween(new Date(ref.measured_at), now);
    const diff = Math.abs(sortedWeights[0].weight_kg - ref.weight_kg);
    const pctDiff = ref.weight_kg > 0 ? (diff / ref.weight_kg) * 100 : 0;
    const stableMonths = diff < 0.3 || pctDiff < 3 ? Math.round(spanDays / 30) : 0;
    milestones.push({
      id: "weight-stable-6mo",
      title: "Peso estável por 6 meses",
      description:
        stableMonths >= 6
          ? "O peso está estável há pelo menos 6 meses."
          : stableMonths > 0
            ? `Peso estável há ${stableMonths} ${stableMonths === 1 ? "mês" : "meses"} (meta: 6 meses).`
            : "Ainda sem um período estável de 6 meses.",
      achieved: stableMonths >= 6,
      icon: "scale",
    });
  }

  return milestones;
}
