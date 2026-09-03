/**
 * Smart Assistant Phase 5 — Context-Aware Daily Expectations.
 *
 * Single source of truth for "should this care task already have happened?".
 * Pure, dependency-free — designed so Home, pet Assistant, and (later) push /
 * email / widgets can all ask the same question without duplicating rules.
 *
 * Inputs are rows the app already loads (trackers + tracker_entries). No new
 * queries. `reminder_times` is preferred when present on the tracker; otherwise
 * we infer from historical logging times, then fall back to an even day curve.
 */

import { dayKey, sumTrackerEntriesCompatible, todayKey, type TrackerCategory } from "@/lib/daily-care";
import { learnPreferredTimeOfDay } from "@/lib/pet-memory";

/* -------------------- Config (one place to tune grace windows) -------------------- */

/**
 * Grace windows relative to a scheduled/usual dose time T.
 *
 * Before T − suggestionLead → silence (or "coming up" only inside the lead)
 * T − suggestionLead … T + silenceAfter → suggestion (calm, no warning)
 * T + silenceAfter … T + reminderAfter → reminder
 * After T + attentionAfter → attention
 * Medication past attentionAfter (or overall care critically late) → critical
 */
export const REMINDER_GRACE = {
  /** Minutes before a slot when a calm "coming up / usual time" suggestion may appear. */
  suggestionLeadMinutes: 30,
  /** Minutes after a slot with no warning at all. */
  silenceAfterMinutes: 15,
  /** Minutes after a slot when a gentle reminder starts. */
  reminderAfterMinutes: 45,
  /** Minutes after a slot when attention escalates. */
  attentionAfterMinutes: 120,
  /** Day window used when distributing slots without reminders/history (local minutes). */
  dayStartMinutes: 6 * 60, // 06:00
  dayEndMinutes: 22 * 60, // 22:00
} as const;

export type ExpectationUrgency = "none" | "suggestion" | "reminder" | "attention" | "critical";

export type ExpectationScheduleSource = "reminder_times" | "learned" | "distributed";

export type ExpectationTrackerInput = {
  id: string;
  title: string;
  category: TrackerCategory;
  is_active: boolean;
  target_per_day: number;
  unit?: string | null;
  reminder_times?: string[] | null;
};

export type ExpectationEntryInput = {
  tracker_id: string;
  value: number;
  completed_at: string;
  metadata?: unknown;
};

export type TrackerExpectation = {
  trackerId: string;
  title: string;
  category: TrackerCategory;
  targetPerDay: number;
  /** Today's logged total (same units as the tracker). */
  actualValue: number;
  /** 0–1 share of today's target completed. */
  actualProgress: number;
  /** 0–1 share of today's target that should reasonably be done by `now`. */
  expectedProgress: number;
  urgency: ExpectationUrgency;
  /** Minutes past the next incomplete slot's due time; null if nothing is due yet. */
  minutesPastDue: number | null;
  /** Next incomplete slot as minutes-of-day; null if complete or no schedule. */
  nextSlotMinutes: number | null;
  nextSlotLabel: string | null;
  scheduleMinutes: number[];
  source: ExpectationScheduleSource;
  /** Short, calm copy for assistants / briefing (Portuguese). */
  headline: string;
};

export type PetCareExpectation = {
  overallActual: number;
  overallExpected: number;
  urgency: ExpectationUrgency;
  trackers: TrackerExpectation[];
  /** Highest-urgency incomplete tracker (for one-line briefings). */
  mostPressing: TrackerExpectation | null;
};

const URGENCY_RANK: Record<ExpectationUrgency, number> = {
  none: 0,
  suggestion: 1,
  reminder: 2,
  attention: 3,
  critical: 4,
};

/* -------------------- Public API -------------------- */

export function minutesOfDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

export function formatMinutesLabel(minutes: number): string {
  const clamped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Day-curve expected progress when we have no per-dose schedule
 * (matches the examples in the Phase 5 brief ≈ 10% @ 8am, 40% @ noon, 80% @ 6pm).
 */
export function dayCurveExpectedProgress(now: Date, grace = REMINDER_GRACE): number {
  const m = minutesOfDay(now);
  const start = grace.dayStartMinutes;
  const end = grace.dayEndMinutes;
  if (m <= start) return 0;
  if (m >= end) return 1;
  // Ease toward late-day completion so 18:00 ≈ 0.8 rather than a flat 0.75.
  const t = (m - start) / (end - start);
  return Math.min(1, Math.max(0, Math.pow(t, 0.85)));
}

/**
 * Resolve today's dose slots (minutes-of-day), preferring reminder_times,
 * then learned habit time, then even distribution across the day.
 */
export function resolveScheduleMinutes(
  tracker: ExpectationTrackerInput,
  entries: ExpectationEntryInput[],
  now: Date,
  grace = REMINDER_GRACE,
): { minutes: number[]; source: ExpectationScheduleSource } {
  const target = Math.max(1, Math.round(tracker.target_per_day) || 1);
  const fromReminders = parseReminderTimes(tracker.reminder_times);
  if (fromReminders.length > 0) {
    return { minutes: expandSlots(fromReminders, target, grace), source: "reminder_times" };
  }

  const learned = learnPreferredTimeOfDay(entries, tracker.id, now);
  if (learned) {
    // One reliable habitual time — fan out extra doses around the day from it.
    const base = [learned.minutesOfDay];
    return { minutes: expandSlots(base, target, grace), source: "learned" };
  }

  return { minutes: distributeAcrossDay(target, grace), source: "distributed" };
}

/**
 * Evaluate one tracker: actual vs expected + urgency for the current moment.
 */
export function evaluateTrackerExpectation(
  tracker: ExpectationTrackerInput,
  entries: ExpectationEntryInput[],
  now: Date = new Date(),
  grace = REMINDER_GRACE,
): TrackerExpectation {
  const target = Math.max(0.0001, Number(tracker.target_per_day) || 1);
  const actualValue = todayTotal(entries, tracker, now);
  const actualProgress = Math.min(1, actualValue / target);
  const { minutes: scheduleMinutes, source } = resolveScheduleMinutes(tracker, entries, now, grace);
  const nowMin = minutesOfDay(now);

  const expectedProgress = expectedProgressFromSchedule(scheduleMinutes, nowMin, grace, actualProgress, now);
  // Prefer counting completed discrete doses for count-like trackers.
  const completedDoses = isCountLike(tracker.category)
    ? Math.min(scheduleMinutes.length, Math.floor(actualValue + 1e-9))
    : Math.min(scheduleMinutes.length, Math.floor(actualProgress * scheduleMinutes.length + 1e-9));
  const nextSlotIndex = actualProgress >= 1 ? -1 : Math.min(scheduleMinutes.length - 1, completedDoses);
  const nextSlotMinutes = nextSlotIndex >= 0 ? scheduleMinutes[nextSlotIndex] : null;
  const minutesPastDue =
    nextSlotMinutes == null || nowMin < nextSlotMinutes ? null : nowMin - nextSlotMinutes;

  let urgency = urgencyForSlot(nextSlotMinutes, nowMin, tracker.category, grace);
  if (actualProgress >= 1) {
    urgency = "none";
  } else if (urgency === "none" && expectedProgress > actualProgress + 0.35 && nowMin >= 20 * 60) {
    // Far behind late in the evening even without a crisp slot.
    urgency = tracker.category === "medication" ? "critical" : "attention";
  }

  // If we're ahead of or on schedule, don't escalate past a calm suggestion.
  if (actualProgress + 0.05 >= expectedProgress && (urgency === "reminder" || urgency === "attention" || urgency === "critical")) {
    urgency =
      nextSlotMinutes != null &&
      nowMin >= nextSlotMinutes - grace.suggestionLeadMinutes &&
      nowMin <= nextSlotMinutes + grace.silenceAfterMinutes
        ? "suggestion"
        : "none";
  }

  const headline = buildHeadline({
    urgency,
    category: tracker.category,
    title: tracker.title,
    nextSlotLabel: nextSlotMinutes != null ? formatMinutesLabel(nextSlotMinutes) : null,
    minutesPastDue,
    source,
    nowMin,
  });

  return {
    trackerId: tracker.id,
    title: tracker.title,
    category: tracker.category,
    targetPerDay: tracker.target_per_day,
    actualValue,
    actualProgress,
    expectedProgress,
    urgency,
    minutesPastDue,
    nextSlotMinutes,
    nextSlotLabel: nextSlotMinutes != null ? formatMinutesLabel(nextSlotMinutes) : null,
    scheduleMinutes,
    source,
    headline,
  };
}

/**
 * Aggregate expectation for a pet's active daily-care trackers.
 */
export function evaluatePetCareExpectation(
  trackers: ExpectationTrackerInput[],
  entries: ExpectationEntryInput[],
  now: Date = new Date(),
  grace = REMINDER_GRACE,
): PetCareExpectation {
  const active = trackers.filter((t) => t.is_active);
  if (active.length === 0) {
    return {
      overallActual: 0,
      overallExpected: 0,
      urgency: "none",
      trackers: [],
      mostPressing: null,
    };
  }

  const evaluated = active.map((t) => evaluateTrackerExpectation(t, entries, now, grace));
  const overallActual = evaluated.reduce((s, t) => s + t.actualProgress, 0) / evaluated.length;
  const overallExpected = evaluated.reduce((s, t) => s + t.expectedProgress, 0) / evaluated.length;

  let urgency: ExpectationUrgency = evaluated.reduce<ExpectationUrgency>(
    (max, t) => (URGENCY_RANK[t.urgency] > URGENCY_RANK[max] ? t.urgency : max),
    "none",
  );

  // Household-level "routine is late" — only when expected schedule has meaningfully diverged.
  const lag = overallExpected - overallActual;
  const hour = now.getHours();
  if (lag >= 0.45 && hour >= 18 && URGENCY_RANK[urgency] < URGENCY_RANK.attention) {
    urgency = "attention";
  }
  if (lag >= 0.6 && hour >= 21 && URGENCY_RANK[urgency] < URGENCY_RANK.critical) {
    urgency = "critical";
  }
  if (overallActual >= 1) urgency = "none";

  const actionable = evaluated
    .filter((t) => t.urgency !== "none" && t.actualProgress < 1)
    .sort((a, b) => URGENCY_RANK[b.urgency] - URGENCY_RANK[a.urgency] || categoryPriority(a.category) - categoryPriority(b.category));

  return {
    overallActual,
    overallExpected,
    urgency,
    trackers: evaluated,
    mostPressing: actionable[0] ?? null,
  };
}

export function urgencyToInsightPriority(
  urgency: ExpectationUrgency,
): "critical" | "attention" | "reminder" | "tip" | null {
  switch (urgency) {
    case "critical":
      return "critical";
    case "attention":
      return "attention";
    case "reminder":
      return "reminder";
    case "suggestion":
      return "tip";
    default:
      return null;
  }
}

export function briefingToneFromUrgency(
  urgency: ExpectationUrgency,
): "positive" | "attention" | "reminder" | null {
  switch (urgency) {
    case "critical":
    case "attention":
      return "attention";
    case "reminder":
      return "reminder";
    case "suggestion":
      return "reminder"; // soft list tone; copy stays calm
    default:
      return null;
  }
}

/* -------------------- Internals -------------------- */

function todayTotal(
  entries: ExpectationEntryInput[],
  tracker: ExpectationTrackerInput,
  now: Date,
): number {
  return sumTrackerEntriesCompatible(entries, tracker.id, tracker.unit, {
    day: dayKey(now),
  });
}

function parseReminderTimes(times: string[] | null | undefined): number[] {
  if (!times?.length) return [];
  const out: number[] = [];
  for (const raw of times) {
    if (!raw || typeof raw !== "string") continue;
    const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) continue;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) continue;
    out.push(h * 60 + min);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

function distributeAcrossDay(count: number, grace: typeof REMINDER_GRACE): number[] {
  const n = Math.max(1, count);
  if (n === 1) {
    // Mid-morning default when we know nothing.
    return [Math.round((grace.dayStartMinutes + grace.dayEndMinutes) / 3)];
  }
  const span = grace.dayEndMinutes - grace.dayStartMinutes;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(Math.round(grace.dayStartMinutes + (span * (i + 0.5)) / n));
  }
  return out;
}

/** Ensure we have `target` slots; repeat/expand from fewer known times. */
function expandSlots(base: number[], target: number, grace: typeof REMINDER_GRACE): number[] {
  const sorted = [...new Set(base)].sort((a, b) => a - b);
  if (sorted.length >= target) return sorted.slice(0, target);
  if (sorted.length === 0) return distributeAcrossDay(target, grace);
  if (sorted.length === 1) {
    // Fan doses across the day centered on the known time.
    const center = sorted[0];
    if (target === 1) return [center];
    const start = Math.max(grace.dayStartMinutes, center - 6 * 60);
    const end = Math.min(grace.dayEndMinutes, center + 6 * 60);
    const out: number[] = [];
    for (let i = 0; i < target; i++) {
      out.push(Math.round(start + ((end - start) * i) / Math.max(1, target - 1)));
    }
    // Keep the learned/reminder time as the closest slot.
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < out.length; i++) {
      const d = Math.abs(out[i] - center);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    out[best] = center;
    return out.sort((a, b) => a - b);
  }
  // Interpolate extra slots between known ones, then pad to day end if needed.
  const out = [...sorted];
  while (out.length < target) {
    let maxGap = 0;
    let gapAt = 0;
    for (let i = 0; i < out.length - 1; i++) {
      const gap = out[i + 1] - out[i];
      if (gap > maxGap) {
        maxGap = gap;
        gapAt = i;
      }
    }
    if (maxGap < 30) {
      out.push(Math.min(grace.dayEndMinutes, out[out.length - 1] + 90));
    } else {
      out.splice(gapAt + 1, 0, Math.round((out[gapAt] + out[gapAt + 1]) / 2));
    }
    out.sort((a, b) => a - b);
  }
  return out.slice(0, target);
}

function expectedProgressFromSchedule(
  scheduleMinutes: number[],
  nowMin: number,
  grace: typeof REMINDER_GRACE,
  actualProgress: number,
  now: Date,
): number {
  if (scheduleMinutes.length === 0) return Math.max(dayCurveExpectedProgress(now, grace), Math.min(1, actualProgress));
  // A slot counts toward "expected" only after its silence window — so 7am
  // doesn't demand breakfast that is scheduled at 8am.
  let due = 0;
  for (const slot of scheduleMinutes) {
    if (nowMin >= slot + grace.silenceAfterMinutes) due += 1;
  }
  const expected = due / scheduleMinutes.length;
  // Never report expected below actual (avoids "behind" when user logged early).
  return Math.max(expected, Math.min(1, actualProgress));
}

function urgencyForSlot(
  slotMinutes: number | null,
  nowMin: number,
  category: TrackerCategory,
  grace: typeof REMINDER_GRACE,
): ExpectationUrgency {
  if (slotMinutes == null) return "none";
  const delta = nowMin - slotMinutes;
  if (delta < -grace.suggestionLeadMinutes) return "none";
  if (delta < grace.silenceAfterMinutes) return "suggestion";
  if (delta < grace.reminderAfterMinutes) return "reminder";
  if (delta < grace.attentionAfterMinutes) return "attention";
  if (category === "medication") return "critical";
  return "attention";
}

function isCountLike(category: TrackerCategory): boolean {
  return category === "food" || category === "medication" || category === "walk" || category === "bathroom" || category === "training";
}

function categoryPriority(category: TrackerCategory): number {
  switch (category) {
    case "medication":
      return 0;
    case "water":
      return 1;
    case "food":
      return 2;
    case "walk":
      return 3;
    default:
      return 4;
  }
}

function buildHeadline(input: {
  urgency: ExpectationUrgency;
  category: TrackerCategory;
  title: string;
  nextSlotLabel: string | null;
  minutesPastDue: number | null;
  source: ExpectationScheduleSource;
  nowMin: number;
}): string {
  const { urgency, category, title, nextSlotLabel, minutesPastDue, nowMin } = input;
  const label = title.toLowerCase();

  if (urgency === "none") return "";

  if (urgency === "suggestion") {
    if (nowMin < 12 * 60) {
      if (category === "food") return "O café da manhã está chegando.";
      if (category === "water") {
        return nextSlotLabel
          ? `Costuma beber água por volta deste horário (~${nextSlotLabel}).`
          : "Costuma beber água por volta deste horário.";
      }
      return nextSlotLabel ? `${title} se aproxima (~${nextSlotLabel}).` : `${title} se aproxima.`;
    }
    if (category === "food") return "A próxima refeição está chegando.";
    if (category === "water") return "Bom momento para registrar a água.";
    return `Horário habitual de ${label}.`;
  }

  if (urgency === "reminder") {
    if (minutesPastDue != null && minutesPastDue >= 45) {
      const hours = Math.floor(minutesPastDue / 60);
      if (hours >= 1) {
        return `Já passou cerca de ${hours} hora${hours === 1 ? "" : "s"} do horário habitual.`;
      }
      return "Já passou cerca de uma hora do horário habitual.";
    }
    if (category === "water") return "A água de hoje ainda pode ser registrada.";
    if (category === "food") return "A refeição ainda não foi registrada.";
    if (category === "medication") return "A dose ainda não foi registrada.";
    return `${title} ainda está pendente.`;
  }

  if (urgency === "critical") {
    if (category === "medication") return "Medicação atrasada — registre a dose.";
    return "A rotina de hoje está bem atrasada.";
  }

  // attention
  if (category === "medication") return "A medicação de hoje está atrasada.";
  return "A rotina de hoje está atrasada.";
}

/** Re-export todayKey for callers that want a shared day boundary. */
export { todayKey };
