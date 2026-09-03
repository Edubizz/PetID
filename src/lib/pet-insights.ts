import {
  CATEGORY_META,
  buildCompatibleDayTotalsMap,
  computeStats,
  dayKey,
  formatLoggedAmount,
  formatQuickLogLabel,
  resolveQuickLogAmount,
  sumTrackerEntriesCompatible,
  todayKey,
  type TrackerCategory,
} from "@/lib/daily-care";
import {
  computeProfileCompleteness,
  DOCUMENT_STATUS_TYPES,
  documentMatchesType,
  parseProfileExtras,
  type ProfileExtras,
} from "@/lib/pet-profile";
import {
  isAdoptionAnniversaryToday,
  isBirthdayToday,
  isInsightSuppressed,
  matchCountMilestone,
  matchStreakMilestone,
  wasPetFoundToday,
} from "@/lib/pet-memory";
import {
  briefingToneFromUrgency,
  evaluatePetCareExpectation,
  urgencyToInsightPriority,
  type TrackerExpectation,
} from "@/lib/daily-expectations";
import type { PetReport } from "@/lib/pet-reports";

/**
 * Higher number = more urgent. Used for sorting only. Display order is
 * Critical -> Attention -> Reminder -> Positive ("great") -> Tip, so a
 * celebratory card never buries an actionable reminder.
 */
export type InsightPriority = "critical" | "attention" | "reminder" | "great" | "tip";

/** Navigates to an existing pet-profile tab (optionally with an FAB-style deep-link action). */
export type InsightNavAction = {
  kind: "navigate";
  label: string;
  tab: string;
  action?: string;
};

/** Completes the recommendation in one tap by reusing the exact Daily Care quick-log mutation. */
export type InsightQuickLogAction = {
  kind: "quick_log";
  label: string;
  trackerId: string;
  trackerTitle: string;
  category: TrackerCategory;
  value: number;
  unit: string | null;
};

export type InsightAction = InsightNavAction | InsightQuickLogAction;

export type PetInsight = {
  id: string;
  priority: InsightPriority;
  category: string;
  title: string;
  /** The trend / explanation ("Luna normalmente bebe ~900ml. Hoje: 250ml."). */
  description: string;
  /** Why this matters to the pet's wellbeing — shown as small supporting context. */
  why?: string;
  action: InsightAction | null;
  petId?: string;
  petName?: string;
};

/** Cards actually rendered at once — keeps the assistant skimmable instead of flooding the screen. */
export const MAX_ASSISTANT_CARDS = 4;

export type InsightsPet = {
  id: string;
  name: string;
  is_lost: boolean;
  photo_url?: string | null;
  breed?: string | null;
  sex?: string | null;
  birth_date?: string | null;
  weight_kg?: number | null;
  microchip?: string | null;
  secondary_contact_name?: string | null;
  secondary_contact_phone?: string | null;
  profile_extras?: unknown;
  /** PetID join date — used as a proxy for "adoption anniversary" milestones. */
  created_at?: string | null;
};

/** Slim shape of a timeline event, used only to detect a same-day "pet found" milestone. */
export type InsightsEvent = { type: string; title: string; date: string };

export type InsightsTracker = {
  id: string;
  category: TrackerCategory;
  title: string;
  is_active: boolean;
  target_per_day: number;
  unit?: string | null;
  /** Optional HH:MM slots from Daily Care — preferred schedule for expectations. */
  reminder_times?: string[] | null;
};

export type InsightsEntry = {
  tracker_id: string;
  value: number;
  completed_at: string;
  metadata?: unknown;
};

export type InsightsWeight = { weight_kg: number; measured_at: string };
export type InsightsVaccine = { id: string; name: string; applied_at: string | null; next_dose: string | null };
export type InsightsAppointment = { id: string; scheduled_at: string; reason: string | null };
export type InsightsDocument = { id: string; title: string; category: string | null };

export type PetInsightsInput = {
  pet: InsightsPet;
  trackers?: InsightsTracker[];
  entries?: InsightsEntry[];
  weights?: InsightsWeight[];
  vaccines?: InsightsVaccine[];
  appointments?: InsightsAppointment[];
  documents?: InsightsDocument[];
  /** Precomputed profile completeness 0–100; computed from pet if omitted and profile fields exist. */
  profileCompletenessPct?: number | null;
  /** Already-fetched timeline events (from useHealthTimeline) — only used to spot a same-day "pet found". */
  events?: InsightsEvent[];
  /**
   * A report already computed by the caller via buildPetReport (reused, not
   * duplicated) — when provided, its health-trend observations feed one
   * "tendência" insight instead of recomputing month-over-month math here.
   */
  report?: PetReport | null;
  now?: Date;
};

const PRIORITY_RANK: Record<InsightPriority, number> = {
  critical: 500,
  attention: 400,
  reminder: 300,
  great: 200,
  tip: 100,
};

/* -------------------- Pure date / math helpers -------------------- */

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function monthLabelPtBR(d: Date): string {
  return d.toLocaleDateString("pt-BR", { month: "long" });
}

function todaySums(
  entries: InsightsEntry[],
  day: string,
  trackers: InsightsTracker[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of trackers) {
    map.set(t.id, sumTrackerEntriesCompatible(entries, t.id, t.unit, { day }));
  }
  return map;
}

/** One pass per tracker: every calendar day that has at least one entry, summed. */
export function buildDayTotalsMap(entries: InsightsEntry[], trackerId: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    if (e.tracker_id !== trackerId) continue;
    const key = dayKey(e.completed_at);
    map.set(key, (map.get(key) ?? 0) + Number(e.value));
  }
  return map;
}

/** Historical daily totals excluding today, within a lookback window — only days with logged data. */
function historyExcludingToday(dayTotals: Map<string, number>, now: Date, lookbackDays: number, todayKeyStr: string): number[] {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - lookbackDays);
  const out: number[] = [];
  for (const [key, total] of dayTotals) {
    if (key === todayKeyStr) continue;
    // dayKey strings are lexicographically sortable (YYYY-MM-DD).
    if (key < dayKey(cutoff)) continue;
    out.push(total);
  }
  return out;
}

/** Zero-filled totals for a fixed day range, oldest to newest (e.g. 4..10 days ago). */
function rangeTotals(dayTotals: Map<string, number>, now: Date, startDaysAgo: number, endDaysAgo: number): number[] {
  const out: number[] = [];
  for (let i = endDaysAgo; i >= startDaysAgo; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    out.push(dayTotals.get(dayKey(d)) ?? 0);
  }
  return out;
}

/** Consecutive fully-completed days counting back from yesterday. */
export function consecutiveCompletedDays(dayTotals: Map<string, number>, targetPerDay: number, now: Date, maxDays = 60): number {
  if (targetPerDay <= 0) return 0;
  let streak = 0;
  const cursor = new Date(now);
  cursor.setDate(cursor.getDate() - 1);
  for (let i = 0; i < maxDays; i++) {
    const total = dayTotals.get(dayKey(cursor)) ?? 0;
    if (total >= targetPerDay) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function fmtAmt(value: number, unit: string | null | undefined): string {
  return formatLoggedAmount(value, unit);
}

/** Reuses the exact one-tap amount Rotina's QuickLogControl would show. */
function buildQuickLogAction(
  t: InsightsTracker,
  entries: { tracker_id: string; value: number; completed_at: string }[],
  now: Date,
  labelOverride?: string,
): InsightQuickLogAction {
  const unit = t.unit ?? CATEGORY_META[t.category].unit;
  const value = resolveQuickLogAmount({
    trackerId: t.id,
    category: t.category,
    unit,
    entries,
    now,
  });
  return {
    kind: "quick_log",
    label: labelOverride ?? formatQuickLogLabel(value, unit),
    trackerId: t.id,
    trackerTitle: t.title,
    category: t.category,
    value,
    unit,
  };
}

/** Same shared resolver as Rotina — localStorage first, then history, then default. */
function buildAdaptiveQuickLogAction(
  t: InsightsTracker,
  entries: { tracker_id: string; value: number; completed_at: string }[],
  now: Date,
): InsightQuickLogAction {
  return buildQuickLogAction(t, entries, now);
}

function greetingSuggestionTitle(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Maps a TrackerExpectation into a PetInsight — suggestions stay calm (tip),
 * while reminders/attention/critical reuse the engine's urgency.
 */
function expectationInsight(
  petId: string,
  petName: string,
  tracker: InsightsTracker,
  exp: TrackerExpectation,
  action: InsightAction,
  copy: {
    tipTitle: string;
    tipDescription: string;
    warnTitle: string;
    warnDescription: string;
    why: string;
  },
): PetInsight {
  const priority = urgencyToInsightPriority(exp.urgency) ?? "tip";
  const isSuggestion = exp.urgency === "suggestion";
  return {
    id: `${petId}:expect:${tracker.category}:${tracker.id}`,
    priority,
    category: isSuggestion ? "habit" : "daily_care",
    title: isSuggestion ? copy.tipTitle : copy.warnTitle,
    description: isSuggestion ? copy.tipDescription : copy.warnDescription,
    why: copy.why,
    action,
    petId,
    petName,
  };
}

function navigateAction(label: string, tab: string, action?: string): InsightNavAction {
  return { kind: "navigate", label, tab, action };
}

function formatApptWhen(iso: string, now: Date): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const days = daysBetween(startOfLocalDay(now), startOfLocalDay(d));
  if (days === 0) return `hoje às ${time}`;
  if (days === 1) return `amanhã às ${time}`;
  const weekday = d.toLocaleDateString("pt-BR", { weekday: "long" });
  return `${weekday} às ${time}`;
}

function resolveProfilePct(pet: InsightsPet, weights: InsightsWeight[], vaccines: InsightsVaccine[], override?: number | null): number | null {
  if (typeof override === "number") return override;
  // Only compute when we have enough identity fields (pet dashboard). Home list pets are slim.
  if (pet.secondary_contact_name === undefined && pet.profile_extras === undefined && pet.microchip === undefined) {
    return null;
  }
  const extras: ProfileExtras = parseProfileExtras(pet.profile_extras);
  return computeProfileCompleteness({
    photo_url: pet.photo_url ?? null,
    breed: pet.breed ?? null,
    sex: pet.sex ?? null,
    birth_date: pet.birth_date ?? null,
    weight_kg: pet.weight_kg ?? null,
    microchip: pet.microchip ?? null,
    secondary_contact_name: pet.secondary_contact_name ?? null,
    secondary_contact_phone: pet.secondary_contact_phone ?? null,
    extras,
    hasWeightHistory: weights.length > 0 || pet.weight_kg != null,
    hasVaccine: vaccines.some((v) => Boolean(v.applied_at)),
    hasPrimaryVet: Boolean(extras.veterinary?.name),
  }).pct;
}

/**
 * Pure, data-driven, personalized recommendation engine. No UI, no I/O, no AI —
 * feed it the rows you already fetched and get a priority-sorted list of
 * insights that compare *today* against each pet's own recent history.
 */
export function buildPetInsights(input: PetInsightsInput): PetInsight[] {
  const now = input.now ?? new Date();
  const pet = input.pet;
  const trackers = input.trackers ?? [];
  const entries = input.entries ?? [];
  const weights = [...(input.weights ?? [])].sort(
    (a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime(),
  );
  const vaccines = input.vaccines ?? [];
  const appointments = input.appointments ?? [];
  const documents = input.documents ?? [];
  const insights: PetInsight[] = [];
  /** Only one positive card ever ships — collect candidates, ship the single best. */
  const positiveCandidates: { rank: number; insight: PetInsight }[] = [];
  const todayKeyStr = todayKey();
  const sums = todaySums(entries, todayKeyStr, trackers);
  const active = trackers.filter((t) => t.is_active);
  const name = pet.name;
  let hasWeightAttention = false;
  // Parsed once and reused for the vet-contact check below and for the
  // dismiss/rotation memory filter at the end — avoids parsing profile_extras twice.
  const extras: ProfileExtras | null = pet.profile_extras !== undefined ? parseProfileExtras(pet.profile_extras) : null;
  const memory = extras?.assistant?.memory;

  // --- Empty state that teaches instead of staying silent ---
  if (trackers.length === 0) {
    insights.push({
      id: `${pet.id}:no-routine`,
      priority: "tip",
      category: "daily_care",
      title: "Nenhuma rotina configurada",
      description: `Crie uma rotina diária para o assistente conseguir monitorar ${name}.`,
      why: "Uma rotina simples já permite receber lembretes e comparações personalizadas com o histórico do pet.",
      action: navigateAction("Criar rotina", "daily-care"),
      petId: pet.id,
      petName: name,
    });
  }

  // --- Lost Mode ---
  if (pet.is_lost) {
    insights.push({
      id: `${pet.id}:lost`,
      priority: "critical",
      category: "lost",
      title: `${name} está em modo perdido`,
      description: "O perfil público exibe alerta de emergência. Acompanhe avistamentos e atualize as informações.",
      why: "Manter os dados atualizados aumenta as chances de reencontro.",
      action: navigateAction("Abrir modo perdido", "lost"),
      petId: pet.id,
      petName: name,
    });
  }

  // --- Weight ---
  if (weights.length === 0 && pet.weight_kg == null) {
    insights.push({
      id: `${pet.id}:never-weighed`,
      priority: "attention",
      category: "weight",
      title: `${name} ainda não foi pesado`,
      description: "Registrar o peso ajuda a acompanhar a saúde e detectar mudanças importantes.",
      why: "Sem um ponto de partida, mudanças de peso passam despercebidas.",
      action: navigateAction("Registrar peso", "health", "weight"),
      petId: pet.id,
      petName: name,
    });
  } else if (weights.length > 0) {
    const days = daysBetween(new Date(weights[0].measured_at), now);
    if (days >= 30) {
      insights.push({
        id: `${pet.id}:stale-weight`,
        priority: days >= 45 ? "attention" : "reminder",
        category: "weight",
        title: `${name} não é pesado há ${days} dias`,
        description: "Uma pesagem recente deixa o painel de saúde mais preciso.",
        why: "Pesagens regulares tornam mais fácil notar tendências antes que se tornem problemas.",
        action: navigateAction("Registrar peso", "health", "weight"),
        petId: pet.id,
        petName: name,
      });
    }

    if (weights.length >= 2) {
      const latest = weights[0].weight_kg;
      const prev = weights[1].weight_kg;
      const daysGap = Math.max(1, daysBetween(new Date(weights[1].measured_at), new Date(weights[0].measured_at)));
      const deltaPct = prev > 0 ? ((latest - prev) / prev) * 100 : 0;
      const weeklyPct = (deltaPct / daysGap) * 7;

      if (deltaPct <= -5 && daysGap <= 60) {
        hasWeightAttention = true;
        insights.push({
          id: `${pet.id}:weight-down`,
          priority: "attention",
          category: "weight",
          title: `Peso de ${name} está caindo`,
          description: `Queda de ${Math.abs(deltaPct).toFixed(1)}% entre as últimas pesagens (${prev} kg → ${latest} kg).`,
          why: "Quedas rápidas de peso podem indicar um problema de saúde — vale conversar com o veterinário.",
          action: navigateAction("Ver saúde", "health"),
          petId: pet.id,
          petName: name,
        });
      } else if (weeklyPct >= 3 && daysGap <= 45) {
        hasWeightAttention = true;
        insights.push({
          id: `${pet.id}:weight-up-fast`,
          priority: "attention",
          category: "weight",
          title: `Peso de ${name} subiu rápido`,
          description: `Aumento acelerado (~${weeklyPct.toFixed(1)}% por semana, ${prev} kg → ${latest} kg).`,
          why: "Ganho de peso acelerado merece atenção à alimentação e ao nível de atividade.",
          action: navigateAction("Ver saúde", "health"),
          petId: pet.id,
          petName: name,
        });
      }
    }

    // Longer-term trend: how has weight moved since the oldest record within ~6 months?
    const cutoffLong = new Date(now);
    cutoffLong.setDate(cutoffLong.getDate() - 180);
    const withinWindow = weights.filter((w) => new Date(w.measured_at).getTime() >= cutoffLong.getTime());
    const longRef = withinWindow.length > 0 ? withinWindow[withinWindow.length - 1] : weights[weights.length - 1];
    const spanDays = daysBetween(new Date(longRef.measured_at), now);
    if (spanDays >= 60 && longRef !== weights[0]) {
      const diff = Number((weights[0].weight_kg - longRef.weight_kg).toFixed(1));
      const pctChange = longRef.weight_kg > 0 ? (Math.abs(diff) / longRef.weight_kg) * 100 : 0;
      if (Math.abs(diff) < 0.3 || pctChange < 3) {
        if (!hasWeightAttention) {
          const months = Math.max(1, Math.round(spanDays / 30));
          positiveCandidates.push({
            rank: 3,
            insight: {
              id: `${pet.id}:weight-stable`,
              priority: "great",
              category: "weight",
              title: "Peso estável",
              description: `O peso de ${name} está estável há ${months} ${months === 1 ? "mês" : "meses"}.`,
              why: "Peso estável é um bom sinal de saúde geral.",
              action: null,
              petId: pet.id,
              petName: name,
            },
          });
        }
      } else {
        insights.push({
          id: `${pet.id}:weight-trend-long`,
          priority: "reminder",
          category: "weight",
          title: diff > 0 ? "Peso subiu ao longo do tempo" : "Peso caiu ao longo do tempo",
          description: `${name} ${diff > 0 ? "ganhou" : "perdeu"} ${Math.abs(diff)} kg desde ${monthLabelPtBR(new Date(longRef.measured_at))}.`,
          why: "Mudanças graduais de peso também merecem acompanhamento do veterinário.",
          action: navigateAction("Ver saúde", "health"),
          petId: pet.id,
          petName: name,
        });
      }
    }
  }

  // --- Vaccines ---
  const appliedVaccines = vaccines.filter((v) => v.applied_at);
  if (vaccines.length === 0 || appliedVaccines.length === 0) {
    insights.push({
      id: `${pet.id}:no-vaccines`,
      priority: "reminder",
      category: "vaccine",
      title: `${name} sem registro de vacinas`,
      description: "Adicionar a carteira de vacinação deixa o histórico completo e evita esquecimentos.",
      why: "Manter as vacinas em dia protege contra doenças graves.",
      action: navigateAction("Adicionar vacina", "health", "vaccine"),
      petId: pet.id,
      petName: name,
    });
  }

  let hasVaccineIssue = false;
  for (const v of vaccines) {
    if (!v.next_dose) continue;
    const daysLeft = daysBetween(startOfLocalDay(now), startOfLocalDay(new Date(v.next_dose)));
    if (daysLeft < 0) {
      hasVaccineIssue = true;
      insights.push({
        id: `${pet.id}:vaccine-overdue:${v.id}`,
        priority: "critical",
        category: "vaccine",
        title: `${v.name} atrasada`,
        description: `A vacina ${v.name} venceu há ${Math.abs(daysLeft)} dia${Math.abs(daysLeft) === 1 ? "" : "s"}.`,
        why: "Manter as vacinas em dia protege contra doenças graves.",
        action: navigateAction("Ir para Saúde", "health", "vaccine"),
        petId: pet.id,
        petName: name,
      });
    } else if (daysLeft <= 30) {
      hasVaccineIssue = true;
      insights.push({
        id: `${pet.id}:vaccine-soon:${v.id}`,
        priority: daysLeft <= 8 ? "attention" : "reminder",
        category: "vaccine",
        title: daysLeft === 0 ? `${v.name} vence hoje` : `${v.name} vence em ${daysLeft} dia${daysLeft === 1 ? "" : "s"}`,
        description: daysLeft === 0 ? `A vacina ${v.name} vence hoje.` : `A vacina ${v.name} vence em ${daysLeft} dia${daysLeft === 1 ? "" : "s"}.`,
        why: "Agendar a próxima dose com antecedência evita atrasos na imunização.",
        action: navigateAction("Adicionar vacina", "health", "vaccine"),
        petId: pet.id,
        petName: name,
      });
    }
  }
  if (!hasVaccineIssue && appliedVaccines.length > 0) {
    positiveCandidates.push({
      rank: 4,
      insight: {
        id: `${pet.id}:vaccines-ok`,
        priority: "great",
        category: "vaccine",
        title: "Vacinas em dia",
        description: `Nenhuma vacina de ${name} está atrasada ou vencendo nos próximos 30 dias.`,
        action: null,
        petId: pet.id,
        petName: name,
      },
    });
  }

  // --- Appointments ---
  const upcoming = appointments
    .filter((a) => new Date(a.scheduled_at).getTime() >= startOfLocalDay(now).getTime())
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  if (upcoming.length === 0) {
    insights.push({
      id: `${pet.id}:no-appointments`,
      priority: "tip",
      category: "appointment",
      title: `Nenhuma consulta agendada para ${name}`,
      description: "Manter um check-up no radar ajuda a prevenir surpresas.",
      why: "Consultas de rotina detectam problemas antes que fiquem sérios.",
      action: navigateAction("Agendar consulta", "dashboard", "appointment"),
      petId: pet.id,
      petName: name,
    });
  } else {
    const next = upcoming[0];
    const daysLeft = daysBetween(startOfLocalDay(now), startOfLocalDay(new Date(next.scheduled_at)));
    if (daysLeft === 0 || daysLeft === 1) {
      const when = formatApptWhen(next.scheduled_at, now);
      insights.push({
        id: `${pet.id}:appt-${daysLeft === 0 ? "today" : "tomorrow"}:${next.id}`,
        priority: daysLeft === 0 ? "attention" : "reminder",
        category: "appointment",
        title: daysLeft === 0 ? `${name} tem consulta hoje` : `Consulta de ${name} é amanhã`,
        description: `Consulta marcada para ${when}.${next.reason ? ` Motivo: ${next.reason}.` : ""}`,
        why: "Chegar preparado evita atrasos e agiliza o atendimento.",
        action: navigateAction("Ver Geral", "dashboard"),
        petId: pet.id,
        petName: name,
      });
    }
  }

  // --- Daily care: time-aware expectations (Phase 5) + longer-term trends ---
  if (active.length > 0) {
    const care = evaluatePetCareExpectation(active, entries, now);
    const completed = active.filter((t) => (sums.get(t.id) ?? 0) >= t.target_per_day).length;
    const pct = Math.round(care.overallActual * 100);

    if (care.overallActual >= 1) {
      positiveCandidates.push({
        rank: 1,
        insight: {
          id: `${pet.id}:care-complete`,
          priority: "great",
          category: "daily_care",
          title: "Rotina de hoje concluída",
          description: `${name} completou todas as metas de hoje. Ótimo trabalho!`,
          action: null,
          petId: pet.id,
          petName: name,
        },
      });
    } else if (care.urgency === "attention" || care.urgency === "critical") {
      // Only when expected schedule has meaningfully diverged — not a morning false alarm.
      insights.push({
        id: `${pet.id}:care-low`,
        priority: care.urgency === "critical" ? "critical" : "attention",
        category: "daily_care",
          title: care.urgency === "critical" ? "A rotina de hoje está atrasada" : `Rotina de ${name} em ${pct}%`,
        description: `${completed} de ${active.length} metas concluídas. O esperado para agora seria cerca de ${Math.round(care.overallExpected * 100)}%.`,
        why: "Manter a rotina em dia evita acúmulo de pendências.",
        action: navigateAction("Abrir rotina", "daily-care"),
        petId: pet.id,
        petName: name,
      });
    }

    const byId = new Map(care.trackers.map((t) => [t.trackerId, t]));

    // Water — schedule-aware first; trend-vs-average only once the day has progressed.
    // Aggregates use only entries compatible with the current water mode (never ml+pote).
    for (const t of active.filter((tr) => tr.category === "water")) {
      const exp = byId.get(t.id);
      if (!exp) continue;
      const unit = t.unit ?? CATEGORY_META.water.unit;
      const dayTotals = buildCompatibleDayTotalsMap(entries, t.id, unit);
      const history = historyExcludingToday(dayTotals, now, 14, todayKeyStr);
      const hasHistory = history.length >= 3;
      const avg = hasHistory ? average(history) : null;
      const todayTotal = sums.get(t.id) ?? 0;
      const gap = avg ? Math.round(avg - todayTotal) : null;
      const gapSentence = gap && gap > 0 ? ` Mais ${fmtAmt(gap, unit)} deixaria ${name} em dia.` : "";

      if (exp.urgency !== "none") {
        insights.push(expectationInsight(pet.id, name, t, exp, buildAdaptiveQuickLogAction(t, entries, now), {
          tipTitle: greetingSuggestionTitle(now),
          tipDescription: avg
            ? `${name} costuma beber cerca de ${fmtAmt(avg, unit)} por dia. ${exp.headline}`
            : `${name}: ${exp.headline}`,
          warnTitle: `${name} ainda precisa beber água`,
          warnDescription: avg
            ? `${name} costuma beber cerca de ${fmtAmt(avg, unit)} por dia. Hoje: ${fmtAmt(todayTotal, unit)}. ${exp.headline}${gapSentence}`
            : `${name}: ${exp.headline} Meta: ${fmtAmt(t.target_per_day, unit)}.`,
          why: "Manter uma boa hidratação ajuda a prevenir problemas urinários.",
        }));
      } else if (avg && todayTotal > 0 && todayTotal < avg * 0.5 && exp.expectedProgress >= 0.45) {
        insights.push({
          id: `${pet.id}:water-below-avg:${t.id}`,
          priority: "attention",
          category: "daily_care",
          title: `${name} bebeu menos água que o normal`,
          description: `${name} costuma beber cerca de ${fmtAmt(avg, unit)} por dia. Hoje está em ${fmtAmt(todayTotal, unit)}.${gapSentence}`,
          why: "Manter uma boa hidratação ajuda a prevenir problemas urinários.",
          action: buildAdaptiveQuickLogAction(t, entries, now),
          petId: pet.id,
          petName: name,
        });
      }
    }

    // Meals — only when the expectation engine says a meal should already have happened.
    for (const t of active.filter((tr) => tr.category === "food")) {
      const exp = byId.get(t.id);
      if (!exp || exp.urgency === "none") continue;
      const dayTotals = buildDayTotalsMap(entries, t.id);
      const history = historyExcludingToday(dayTotals, now, 14, todayKeyStr);
      const hasHistory = history.length >= 3;
      const typical = hasHistory ? Math.round(average(history)) : t.target_per_day;
      const todayCount = sums.get(t.id) ?? 0;
      const mealsGap = Math.max(0, typical - todayCount);
      insights.push(expectationInsight(pet.id, name, t, exp, buildQuickLogAction(t, entries, now, "+1 refeição"), {
        tipTitle: greetingSuggestionTitle(now),
        tipDescription: exp.headline,
        warnTitle: `${name} ainda precisa comer`,
        warnDescription: hasHistory
          ? `${name} normalmente faz ${typical} refeiç${typical === 1 ? "ão" : "ões"}. Hoje: ${todayCount}.${mealsGap > 0 ? ` ${exp.headline}` : ""}`
          : `${exp.headline} Meta: ${t.target_per_day}.`,
        why: "Pular refeições pode afetar a energia e a saúde digestiva.",
      }));
    }

    // Walks — streak risk only after the usual window has passed.
    for (const t of active.filter((tr) => tr.category === "walk")) {
      const exp = byId.get(t.id);
      if (!exp || exp.urgency === "none" || exp.urgency === "suggestion") continue;
      const dayTotals = buildDayTotalsMap(entries, t.id);
      const streak = consecutiveCompletedDays(dayTotals, t.target_per_day, now, 30);
      const todayCount = sums.get(t.id) ?? 0;
      const remaining = Math.max(0, t.target_per_day - todayCount);
      if (remaining <= 0) continue;

      if (streak >= 3) {
        insights.push({
          id: `${pet.id}:walk-streak-gap:${t.id}`,
          priority: urgencyToInsightPriority(exp.urgency) ?? "reminder",
          category: "daily_care",
          title: "Sequência de passeios em risco",
          description: `${name} completou todos os passeios nos últimos ${streak} dias. ${exp.headline}`,
          why: "Manter a rotina de passeios ajuda no bem-estar físico e mental.",
          action: buildQuickLogAction(t, entries, now, "+1 passeio"),
          petId: pet.id,
          petName: name,
        });
      } else {
        insights.push(expectationInsight(pet.id, name, t, exp, buildQuickLogAction(t, entries, now), {
          tipTitle: t.title,
          tipDescription: exp.headline,
          warnTitle: `${name} ainda precisa passear`,
          warnDescription: `${name}: ${exp.headline}`,
          why: "Terminar a meta do dia mantém a rotina consistente.",
        }));
      }
    }

    // Exercise — multi-day trend (not a same-morning checklist); keep as-is.
    for (const t of active.filter((tr) => tr.category === "exercise")) {
      const dayTotals = buildDayTotalsMap(entries, t.id);
      const recent = rangeTotals(dayTotals, now, 1, 3);
      const prior = rangeTotals(dayTotals, now, 4, 10);
      const recentAvg = average(recent);
      const priorAvg = average(prior);
      if (priorAvg > 0 && recentAvg < priorAvg * 0.6) {
        insights.push({
          id: `${pet.id}:activity-drop:${t.id}`,
          priority: "reminder",
          category: "daily_care",
          title: `${name} está se exercitando menos`,
          description: `A atividade caiu nos últimos dias (~${Math.round(recentAvg)} ${t.unit ?? CATEGORY_META.exercise.unit}/dia, antes ~${Math.round(priorAvg)}).`,
          why: "Manter a atividade física ajuda a prevenir ganho de peso e tédio.",
          action: buildAdaptiveQuickLogAction(t, entries, now),
          petId: pet.id,
          petName: name,
        });
      }
    }

    // Medication — escalate only after the reminder grace window (critical when skipped late).
    for (const t of active.filter((tr) => tr.category === "medication")) {
      const exp = byId.get(t.id);
      if (!exp || exp.urgency === "none") continue;
      const todayCount = sums.get(t.id) ?? 0;
      insights.push(expectationInsight(pet.id, name, t, exp, buildQuickLogAction(t, entries, now, "+1 dose"), {
        tipTitle: greetingSuggestionTitle(now),
        tipDescription: `${name}: ${exp.headline}`,
        warnTitle: `Medicação — ${t.title}`,
        warnDescription: `${name}: ${todayCount} de ${t.target_per_day} doses. ${exp.headline}`,
        why: "Doses em atraso podem reduzir a eficácia do tratamento.",
      }));
    }

    // Calm suggestions for other categories near their usual/reminder window.
    for (const t of active) {
      if (t.category === "water" || t.category === "food" || t.category === "walk" || t.category === "medication") continue;
      const exp = byId.get(t.id);
      if (!exp || exp.urgency === "none") continue;
      insights.push(expectationInsight(pet.id, name, t, exp, buildAdaptiveQuickLogAction(t, entries, now), {
        tipTitle: greetingSuggestionTitle(now),
        tipDescription: `${name}: ${exp.headline}`,
        warnTitle: `${t.title} pendente`,
        warnDescription: `${name}: ${exp.headline}`,
        why: "O assistente só sugere no horário em que o cuidado faz sentido.",
      }));
    }
  }

  // --- Streak (reuses the exact same computeStats Daily Care already uses) ---
  const stats = computeStats(trackers, entries, 60);
  if (stats.currentStreak >= 5) {
    positiveCandidates.push({
      rank: 2,
      insight: {
        id: `${pet.id}:streak`,
        priority: "great",
        category: "daily_care",
        title: "Sequência em alta",
        description: `Excelente sequência de ${stats.currentStreak} dias com todos os cuidados concluídos.`,
        action: null,
        petId: pet.id,
        petName: name,
      },
    });
  }

  // --- Smart congratulations: rare, dated milestones outrank the routine positives above ---
  const milestone = detectMilestone({ pet, stats, entries, trackers: active, now, events: input.events });
  if (milestone) {
    positiveCandidates.push({
      rank: 0,
      insight: {
        id: `${pet.id}:milestone:${milestone.id}`,
        priority: "great",
        category: "celebration",
        title: milestone.title,
        description: milestone.description,
        action: null,
        petId: pet.id,
        petName: name,
      },
    });
  }

  // --- Health trend (reuses buildPetReport's month-over-month math — never recomputed here) ---
  if (input.report) {
    const observation = pickTrendObservation(input.report);
    if (observation) {
      insights.push({
        id: `${pet.id}:trend`,
        priority: "tip",
        category: "trend",
        title: "Tendência do mês",
        description: `${name}: ${observation}`,
        why: "Tendências de longo prazo ajudam a notar mudanças de saúde antes de virarem um problema.",
        action: navigateAction("Ver relatórios", "reports"),
        petId: pet.id,
        petName: name,
      });
    }
  }

  // --- Profile / contacts / vet ---
  const profilePct = resolveProfilePct(pet, weights, vaccines, input.profileCompletenessPct);
  if (profilePct !== null) {
    if (profilePct < 70) {
      insights.push({
        id: `${pet.id}:profile-incomplete`,
        priority: "reminder",
        category: "profile",
        title: `Perfil de ${name} em ${profilePct}%`,
        description: "Completar a identidade digital deixa emergências e o dia a dia mais fáceis.",
        why: "Um perfil completo agiliza qualquer emergência ou avistamento.",
        action: navigateAction("Completar perfil", "info"),
        petId: pet.id,
        petName: name,
      });
    } else if (profilePct === 100) {
      positiveCandidates.push({
        rank: 5,
        insight: {
          id: `${pet.id}:profile-complete`,
          priority: "great",
          category: "profile",
          title: "Perfil completo",
          description: `O perfil de ${name} está 100% completo.`,
          action: null,
          petId: pet.id,
          petName: name,
        },
      });
    }
  }

  if (pet.secondary_contact_name !== undefined || pet.secondary_contact_phone !== undefined) {
    const hasEmergency = Boolean(pet.secondary_contact_name?.trim() && pet.secondary_contact_phone?.trim());
    if (!hasEmergency) {
      insights.push({
        id: `${pet.id}:no-emergency`,
        priority: "reminder",
        category: "profile",
        title: "Sem contato de emergência",
        description: `Se alguém encontrar ${name}, outra pessoa da família pode ser acionada.`,
        why: "Um segundo contato aumenta a chance de resposta rápida em emergências.",
        action: navigateAction("Completar perfil", "info"),
        petId: pet.id,
        petName: name,
      });
    }
  }

  if (extras) {
    if (!extras.veterinary?.name && !extras.veterinary?.clinic) {
      insights.push({
        id: `${pet.id}:no-vet`,
        priority: "tip",
        category: "profile",
        title: "Nenhum veterinário cadastrado",
        description: `Ter o contato do vet de ${name} deixa emergências bem mais rápidas.`,
        why: "Acesso rápido ao veterinário economiza tempo precioso em uma emergência.",
        action: navigateAction("Completar perfil", "info"),
        petId: pet.id,
        petName: name,
      });
    }
  }

  // --- Documents ---
  if (input.documents) {
    const missingImportant = DOCUMENT_STATUS_TYPES.filter((t) =>
      ["rabies", "vaccine_card", "microchip", "health"].includes(t.key),
    ).filter((t) => !documents.some((d) => documentMatchesType(d, t.match)));

    if (missingImportant.length >= 2) {
      insights.push({
        id: `${pet.id}:docs-missing`,
        priority: "tip",
        category: "documents",
        title: "Documentos importantes faltando",
        description: `Faltam: ${missingImportant.slice(0, 3).map((d) => d.label).join(", ")}.`,
        why: "Documentos organizados agilizam viagens, seguros e atendimentos veterinários.",
        action: navigateAction("Ver documentos", "documents"),
        petId: pet.id,
        petName: name,
      });
    }
  }

  // Ship at most one positive/celebratory card — pick the most meaningful candidate.
  if (positiveCandidates.length > 0) {
    positiveCandidates.sort((a, b) => a.rank - b.rank);
    insights.push(positiveCandidates[0].insight);
  }

  // Insight quality: an insight the owner explicitly dismissed stays hidden
  // until the suppression window (today) passes instead of nagging forever.
  const visible = memory ? insights.filter((i) => !isInsightSuppressed(memory, i.id, now)) : insights;

  return sortInsights(visible);
}

/** Highest-priority "today" milestone, if any — never fires on the same milestone twice. */
function detectMilestone(args: {
  pet: InsightsPet;
  stats: { currentStreak: number };
  entries: InsightsEntry[];
  trackers: InsightsTracker[];
  now: Date;
  events?: InsightsEvent[];
}): { id: string; title: string; description: string } | null {
  const { pet, stats, entries, trackers, now, events } = args;
  const name = pet.name;

  if (wasPetFoundToday(events, now)) {
    return { id: "found", title: `${name} foi encontrado(a)! 🎉`, description: "Que alívio! O modo perdido foi encerrado hoje." };
  }
  if (isBirthdayToday(pet.birth_date, now)) {
    return { id: "birthday", title: `Feliz aniversário, ${name}! 🎂`, description: "Hoje é o dia de nascimento — que tal um agrado especial?" };
  }
  if (isAdoptionAnniversaryToday(pet.created_at, now)) {
    const years = now.getFullYear() - new Date(pet.created_at as string).getFullYear();
    return {
      id: "adoption-anniversary",
      title: `Aniversário de ${name} no PetID! 🎉`,
      description: `Já são ${years} ${years === 1 ? "ano" : "anos"} de cuidados registrados por aqui.`,
    };
  }

  const streakMilestone = matchStreakMilestone(stats.currentStreak);
  if (streakMilestone) {
    const title = streakMilestone === 7 ? "Primeira semana completa! 🎉" : `Sequência de ${streakMilestone} dias! 🎉`;
    return { id: `streak-${streakMilestone}`, title, description: `${name} completou todos os cuidados por ${streakMilestone} dias seguidos.` };
  }

  const walkTrackerIds = new Set(trackers.filter((t) => t.category === "walk").map((t) => t.id));
  if (walkTrackerIds.size > 0) {
    const walkCount = entries.filter((e) => walkTrackerIds.has(e.tracker_id)).length;
    const walkMilestone = matchCountMilestone(walkCount);
    if (walkMilestone) {
      return { id: `walks-${walkMilestone}`, title: `${walkMilestone} passeios registrados! 🎉`, description: `${name} já teve ${walkMilestone} passeios registrados no PetID.` };
    }
  }

  const medTrackerIds = new Set(trackers.filter((t) => t.category === "medication").map((t) => t.id));
  if (medTrackerIds.size > 0) {
    const medCount = entries.filter((e) => medTrackerIds.has(e.tracker_id)).length;
    const medMilestone = matchCountMilestone(medCount);
    if (medMilestone) {
      return { id: `meds-${medMilestone}`, title: `${medMilestone} doses em dia! 🎉`, description: `${name} já teve ${medMilestone} doses de medicação registradas.` };
    }
  }

  return null;
}

/** Picks the single most relevant month-over-month observation, skipping the generic ones. */
function pickTrendObservation(report: PetReport): string | null {
  const boring = /consulta/i;
  return report.observations.find((o) => !boring.test(o)) ?? null;
}

export function sortInsights(insights: PetInsight[]): PetInsight[] {
  return [...insights].sort((a, b) => {
    const d = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });
}

/** Highest-priority insights across many pets (home dashboard). */
export function pickTopInsights(insights: PetInsight[], limit = 3): PetInsight[] {
  // Prefer actionable / urgent over "great" celebrations on the home feed.
  const filtered = insights.filter((i) => i.priority !== "great");
  return sortInsights(filtered.length > 0 ? filtered : insights).slice(0, limit);
}

export function buildHouseholdInsights(pets: PetInsightsInput[], limit = 3): PetInsight[] {
  const all = pets.flatMap((p) => buildPetInsights(p));
  return pickTopInsights(all, limit);
}

/* -------------------- Household "briefing" (Home Dashboard) -------------------- */

export type BriefingTone = "positive" | "attention" | "reminder";

export type BriefingBullet = {
  id: string;
  /** Short status line (without the pet name when `petName` is set). */
  text: string;
  tone: BriefingTone;
  petId?: string;
  petName?: string;
  action?: InsightAction | null;
};

/**
 * Instead of listing every issue, this distills the whole household into a
 * handful of bullets a user can read in a few seconds — one per pet's most
 * pressing thing, phrased conversationally, plus celebration lines for pets
 * that are fully caught up. Care rows use the Daily Expectation engine so
 * morning Home never warns about tasks that aren't due yet.
 */
export function buildHouseholdBriefing(pets: PetInsightsInput[], now = new Date(), limit = 5): BriefingBullet[] {
  if (pets.length === 0) return [];

  const bullets: BriefingBullet[] = [];

  for (const p of pets) {
    const name = p.pet.name;
    const trackers = (p.trackers ?? []).filter((t) => t.is_active);
    const entries = p.entries ?? [];

    if (trackers.length > 0) {
      const care = evaluatePetCareExpectation(trackers, entries, now);
      if (care.overallActual >= 1) {
        bullets.push({
          id: `briefing:completed:${p.pet.id}`,
          text: "Tudo concluído hoje",
          tone: "positive",
          petId: p.pet.id,
          petName: name,
        });
      } else if (care.mostPressing) {
        const pick = trackers.find((t) => t.id === care.mostPressing!.trackerId);
        const tone = briefingToneFromUrgency(care.mostPressing.urgency);
        if (pick && tone) {
          bullets.push({
            id: `briefing:care:${p.pet.id}`,
            text: care.mostPressing.headline,
            tone,
            petId: p.pet.id,
            petName: name,
            action: buildAdaptiveQuickLogAction(pick, entries, now),
          });
        }
      }
    }

    const upcoming = (p.appointments ?? [])
      .filter((a) => new Date(a.scheduled_at).getTime() >= startOfLocalDay(now).getTime())
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];
    if (upcoming) {
      const days = daysBetween(startOfLocalDay(now), startOfLocalDay(new Date(upcoming.scheduled_at)));
      if (days === 0 || days === 1) {
        const time = new Date(upcoming.scheduled_at).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        });
        bullets.push({
          id: `briefing:appt:${p.pet.id}`,
          text: days === 0 ? `Consulta hoje · ${time}` : `Consulta amanhã · ${time}`,
          tone: days === 0 ? "attention" : "reminder",
          petId: p.pet.id,
          petName: name,
          action: navigateAction("Ver Geral", "dashboard"),
        });
      }
    }

    for (const v of p.vaccines ?? []) {
      if (!v.next_dose) continue;
      const days = daysBetween(startOfLocalDay(now), startOfLocalDay(new Date(v.next_dose)));
      if (days < 0) {
        bullets.push({
          id: `briefing:vaccine:${p.pet.id}:${v.id}`,
          text: `Vacina vencida há ${Math.abs(days)} dia${Math.abs(days) === 1 ? "" : "s"}`,
          tone: "attention",
          petId: p.pet.id,
          petName: name,
          action: navigateAction("Ver saúde", "health", "vaccine"),
        });
        break;
      }
      if (days <= 7) {
        bullets.push({
          id: `briefing:vaccine:${p.pet.id}:${v.id}`,
          text: days === 0 ? "Vacina vence hoje" : `Vacina vence em ${days} dia${days === 1 ? "" : "s"}`,
          tone: days <= 3 ? "attention" : "reminder",
          petId: p.pet.id,
          petName: name,
          action: navigateAction("Ver saúde", "health", "vaccine"),
        });
        break;
      }
    }
  }

  const rank = (t: BriefingTone) => (t === "attention" ? 0 : t === "reminder" ? 1 : 2);
  const sorted = [...bullets].sort((a, b) => rank(a.tone) - rank(b.tone));
  return sorted.slice(0, limit);
}
