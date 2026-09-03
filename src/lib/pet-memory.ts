import { dayKey, learnPreferredLogAmount } from "@/lib/daily-care";
import type { AssistantMemory } from "@/lib/pet-profile";

/**
 * Smart Assistant Phase 4 — Memory & Personalization.
 *
 * Pure helpers derived from already-fetched rows (no new queries).
 * Preferred log amounts live in `daily-care.ts` (shared with Rotina quick-log).
 */

export { learnPreferredLogAmount };

type MemoryEntry = { tracker_id: string; value: number; completed_at: string };
type MemoryEvent = { type: string; title: string; date: string };

/* -------------------- Habit learning: "what does this owner usually log?" -------------------- */
// learnPreferredLogAmount is defined in daily-care.ts (single source of truth).

/**
 * Usual time of day the owner logs this tracker (mean minute-of-day),
 * rejecting the result when logs are too spread out to call it "usual".
 */
export function learnPreferredTimeOfDay(
  entries: MemoryEntry[],
  trackerId: string,
  now: Date,
  opts?: { lookbackDays?: number; minSamples?: number },
): { minutesOfDay: number; label: string } | null {
  const lookbackDays = opts?.lookbackDays ?? 21;
  const minSamples = opts?.minSamples ?? 5;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - lookbackDays);

  const minutes: number[] = [];
  for (const e of entries) {
    if (e.tracker_id !== trackerId) continue;
    const d = new Date(e.completed_at);
    if (Number.isNaN(d.getTime()) || d.getTime() < cutoff.getTime()) continue;
    minutes.push(d.getHours() * 60 + d.getMinutes());
  }
  if (minutes.length < minSamples) return null;

  const mean = Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length);
  const variance = minutes.reduce((s, m) => s + (m - mean) ** 2, 0) / minutes.length;
  if (Math.sqrt(variance) > 150) return null; // spread over ~2.5h+ — no reliable "usual time"

  const h = Math.floor(mean / 60);
  const m = mean % 60;
  return {
    minutesOfDay: mean,
    label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
  };
}

export function isNearTimeOfDay(minutesOfDay: number, now: Date, windowMinutes = 45): boolean {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return Math.abs(nowMinutes - minutesOfDay) <= windowMinutes;
}

/* -------------------- Smart congratulations: meaningful, dated milestones only -------------------- */

const STREAK_MILESTONES = [7, 14, 30, 60, 100, 180, 365];
const COUNT_MILESTONES = [50, 100, 250, 500, 1000];

/** Returns the streak length only on the exact day it's reached — never every day after. */
export function matchStreakMilestone(currentStreak: number): number | null {
  return STREAK_MILESTONES.find((n) => n === currentStreak) ?? null;
}

/** Returns the count only on the exact log that pushed it to a round milestone. */
export function matchCountMilestone(count: number): number | null {
  return COUNT_MILESTONES.find((n) => n === count) ?? null;
}

export function isBirthdayToday(birthDate: string | null | undefined, now: Date): boolean {
  if (!birthDate) return false;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return false;
  return d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/** Uses the pet's PetID join date as a proxy for "adoption anniversary" (no dedicated field exists). */
export function isAdoptionAnniversaryToday(
  createdAt: string | null | undefined,
  now: Date,
): boolean {
  if (!createdAt) return false;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return false;
  if (d.getMonth() !== now.getMonth() || d.getDate() !== now.getDate()) return false;
  return now.getFullYear() - d.getFullYear() >= 1;
}

/** Scans the already-fetched timeline events for a lost-mode "found" event dated today. */
export function wasPetFoundToday(events: MemoryEvent[] | undefined, now: Date): boolean {
  if (!events?.length) return false;
  const todayStr = dayKey(now);
  return events.some(
    (e) => e.type === "lost_mode" && /encontrad/i.test(e.title) && dayKey(e.date) === todayStr,
  );
}

/* -------------------- Insight quality: dismiss / suppress rotation -------------------- */

export function isInsightSuppressed(
  memory: AssistantMemory | undefined,
  key: string,
  now: Date,
): boolean {
  const until = memory?.dismissed?.[key];
  if (!until) return false;
  const t = new Date(until).getTime();
  return Number.isFinite(t) && t > now.getTime();
}

/** Suppresses an insight key "for today" — reappears naturally tomorrow if still relevant. */
export function withDismissedInsight(
  memory: AssistantMemory | undefined,
  key: string,
  now: Date,
): AssistantMemory {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { dismissed: { ...(memory?.dismissed ?? {}), [key]: midnight.toISOString() } };
}
