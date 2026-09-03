/**
 * Sprint 5 — Derived owner reminders (read-time).
 *
 * Source of truth remains: trackers.reminder_times + tracker_entries,
 * vaccines.next_dose, appointments.scheduled_at, weight_history.
 * Timing rules reuse REMINDER_GRACE from daily-expectations.
 *
 * Delivery channel today: in_app only. Push/email/SMS are future channels
 * against the same ReminderItem model.
 */

import { dayKey, type TrackerCategory } from "@/lib/daily-care";
import {
  evaluateTrackerExpectation,
  formatMinutesLabel,
  REMINDER_GRACE,
  type ExpectationEntryInput,
  type ExpectationTrackerInput,
  type ExpectationUrgency,
} from "@/lib/daily-expectations";
import {
  categoryEnabled,
  isInQuietHours,
  type NotificationPrefs,
  type ReminderCategory,
} from "@/lib/notification-prefs";

export type ReminderStatus = "upcoming" | "due" | "overdue" | "completed" | "dismissed";

export type ReminderItem = {
  /** Deterministic id — stable across refetches for the same occurrence. */
  key: string;
  petId: string;
  petName: string;
  petPhotoUrl: string | null;
  category: ReminderCategory;
  status: ReminderStatus;
  title: string;
  message: string;
  /** ISO or local date context for sorting/display */
  dueAt: string | null;
  /** Deep-link into owner pet UI */
  hrefTab: string;
  hrefAction?: string;
  sourceType: "tracker" | "vaccine" | "appointment" | "weight";
  sourceId: string;
  unread: boolean;
};

export type ReminderActionRow = {
  reminder_key: string;
  action: "dismissed" | "read" | "completed";
};

export type ReminderBuildInput = {
  pets: { id: string; name: string; photo_url: string | null }[];
  trackers: (ExpectationTrackerInput & { pet_id: string })[];
  entries: (ExpectationEntryInput & { pet_id: string })[];
  vaccines: { id: string; pet_id: string; name: string; next_dose: string | null }[];
  appointments: { id: string; pet_id: string; scheduled_at: string; reason: string | null }[];
  /** Latest weight per pet (optional). */
  latestWeightByPet: Record<string, { measured_at: string } | null>;
  prefs: NotificationPrefs;
  actions: ReminderActionRow[];
  now?: Date;
};

/**
 * Timing defaults (MVP) — documented for owners/devs:
 *
 * Routine (via REMINDER_GRACE):
 * - upcoming: T − 30m … T + 15m (suggestion)
 * - due: T + 15m … T + 45m (reminder)
 * - overdue: after T + 45m (attention), meds escalate to critical after T + 120m
 *
 * Vaccines (next_dose date, local day):
 * - upcoming: 1–7 days before
 * - due: on the day
 * - overdue: after the day (still actionable — does NOT mark applied)
 *
 * Appointments:
 * - upcoming: within 48h and >2h away
 * - due: within 2h (including started)
 * - past appointments (>2h after): omitted (not treated like missed meals)
 *
 * Weight:
 * - upcoming/due: last weigh ≥ 30 days
 * - overdue: ≥ 45 days
 */
export const REMINDER_TIMING_DOCS = {
  routine: REMINDER_GRACE,
  vaccineUpcomingDays: 7,
  appointmentUpcomingHours: 48,
  appointmentDueHours: 2,
  weightStaleDays: 30,
  weightOverdueDays: 45,
} as const;

const URGENCY_TO_STATUS: Partial<Record<ExpectationUrgency, ReminderStatus>> = {
  suggestion: "upcoming",
  reminder: "due",
  attention: "overdue",
  critical: "overdue",
};

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Diff between two local calendar days (YYYY-MM-DD), timezone-safe. */
function localDayDiff(fromDay: string, toDay: string): number {
  const [y1, m1, d1] = fromDay.split("-").map(Number);
  const [y2, m2, d2] = toDay.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/**
 * Occurrence key for a routine slot.
 * Changing the scheduled time OR the local day produces a new key, so dismissals
 * do not leak across days or after the owner edits reminder_times.
 */
export function routineReminderKey(
  trackerId: string,
  localDay: string,
  slotMinutes: number | null,
): string {
  const timePart =
    slotMinutes == null ? "unscheduled" : formatMinutesLabel(slotMinutes);
  return `routine:${trackerId}:${localDay}:${timePart}`;
}

/** Local wall-clock instant for sorting/display (stored as absolute ISO). */
function localDueIso(localDay: string, slotMinutes: number): string {
  const [y, m, d] = localDay.split("-").map(Number);
  const dt = new Date(
    y,
    m - 1,
    d,
    Math.floor(slotMinutes / 60),
    slotMinutes % 60,
    0,
    0,
  );
  return dt.toISOString();
}

function trackerCategoryBucket(category: TrackerCategory): ReminderCategory {
  if (category === "medication") return "medications";
  return "routine";
}

function applyActions(
  item: ReminderItem,
  actionMap: Map<string, ReminderActionRow["action"]>,
): ReminderItem | null {
  const action = actionMap.get(item.key);
  if (action === "dismissed" || action === "completed") {
    return null; // hide from active center
  }
  return {
    ...item,
    unread: action !== "read",
  };
}

function sortReminders(a: ReminderItem, b: ReminderItem): number {
  const rank: Record<ReminderStatus, number> = {
    overdue: 0,
    due: 1,
    upcoming: 2,
    completed: 3,
    dismissed: 4,
  };
  const dr = rank[a.status] - rank[b.status];
  if (dr !== 0) return dr;
  const at = a.dueAt ? new Date(a.dueAt).getTime() : 0;
  const bt = b.dueAt ? new Date(b.dueAt).getTime() : 0;
  return at - bt;
}

export function buildOwnerReminders(input: ReminderBuildInput): ReminderItem[] {
  const now = input.now ?? new Date();
  const day = dayKey(now);
  const quiet = isInQuietHours(input.prefs, now);
  const actionMap = new Map(input.actions.map((a) => [a.reminder_key, a.action]));
  const petById = new Map(input.pets.map((p) => [p.id, p]));
  const out: ReminderItem[] = [];

  // ---- Routine / medication trackers ----
  for (const tracker of input.trackers) {
    if (!tracker.is_active) continue;
    const bucket = trackerCategoryBucket(tracker.category);
    if (!categoryEnabled(input.prefs, bucket)) continue;

    const pet = petById.get(tracker.pet_id);
    if (!pet) continue;

    const entries = input.entries.filter((e) => e.tracker_id === tracker.id);
    const exp = evaluateTrackerExpectation(tracker, entries, now);
    const status = URGENCY_TO_STATUS[exp.urgency];
    if (!status) continue;

    // Quiet hours: still show due/overdue; suppress soft "upcoming" interruptions.
    if (quiet && status === "upcoming") continue;

    const slot = exp.nextSlotMinutes;
    // Occurrence-specific: day (local) + scheduled HH:MM. Never reuse across days/times.
    const key = routineReminderKey(tracker.id, day, slot);
    const when = slot != null ? formatMinutesLabel(slot) : null;

    let message = exp.headline;
    if (status === "upcoming") {
      message = when
        ? `${exp.title} de ${pet.name} se aproxima (${when}).`
        : `Hora de cuidar de ${pet.name}: ${exp.title}.`;
    } else if (status === "due") {
      message = `Hora de registrar: ${exp.title} de ${pet.name}.`;
    } else {
      message =
        tracker.category === "medication"
          ? `${pet.name} ainda precisa do medicamento (${exp.title}).`
          : `${pet.name} ainda precisa: ${exp.title}.`;
    }

    out.push({
      key,
      petId: pet.id,
      petName: pet.name,
      petPhotoUrl: pet.photo_url,
      category: bucket,
      status,
      title: exp.title,
      message,
      dueAt: slot != null ? localDueIso(day, slot) : null,
      hrefTab: "daily-care",
      sourceType: "tracker",
      sourceId: tracker.id,
      unread: true,
    });
  }

  // ---- Vaccines ----
  if (categoryEnabled(input.prefs, "vaccines")) {
    for (const v of input.vaccines) {
      if (!v.next_dose) continue;
      const pet = petById.get(v.pet_id);
      if (!pet) continue;
      const doseDay = dayKey(v.next_dose);
      const delta = localDayDiff(day, doseDay);
      let status: ReminderStatus | null = null;
      if (delta < 0) status = "overdue";
      else if (delta === 0) status = "due";
      else if (delta <= REMINDER_TIMING_DOCS.vaccineUpcomingDays) status = "upcoming";
      if (!status) continue;
      if (quiet && status === "upcoming") continue;

      const key = `vaccine:${v.id}:${doseDay}`;
      const message =
        status === "overdue"
          ? `Dose de ${v.name} de ${pet.name} está pendente (prevista para ${doseDay}).`
          : status === "due"
            ? `Hoje é o dia da próxima dose de ${v.name} de ${pet.name}.`
            : `Próxima dose de ${v.name} de ${pet.name} em ${delta} dia${delta === 1 ? "" : "s"}.`;

      out.push({
        key,
        petId: pet.id,
        petName: pet.name,
        petPhotoUrl: pet.photo_url,
        category: "vaccines",
        status,
        title: v.name,
        message,
        dueAt: localDueIso(doseDay, 9 * 60),
        hrefTab: "health",
        hrefAction: "vaccine",
        sourceType: "vaccine",
        sourceId: v.id,
        unread: true,
      });
    }
  }

  // ---- Appointments ----
  if (categoryEnabled(input.prefs, "appointments")) {
    for (const a of input.appointments) {
      const pet = petById.get(a.pet_id);
      if (!pet) continue;
      const when = new Date(a.scheduled_at).getTime();
      const hours = (when - now.getTime()) / 3600000;
      // Skip long-past appointments (not meal-style overdue).
      if (hours < -2) continue;
      let status: ReminderStatus | null = null;
      if (hours <= REMINDER_TIMING_DOCS.appointmentDueHours) status = "due";
      else if (hours <= REMINDER_TIMING_DOCS.appointmentUpcomingHours) status = "upcoming";
      if (!status) continue;
      if (quiet && status === "upcoming") continue;

      const key = `appointment:${a.id}`;
      const reason = a.reason?.trim() || "Consulta";
      const message =
        status === "due"
          ? `Consulta de ${pet.name} (${reason}) é agora / em breve.`
          : `Consulta de ${pet.name} (${reason}) se aproxima.`;

      out.push({
        key,
        petId: pet.id,
        petName: pet.name,
        petPhotoUrl: pet.photo_url,
        category: "appointments",
        status,
        title: reason,
        message,
        dueAt: a.scheduled_at,
        hrefTab: "dashboard",
        hrefAction: "appointment",
        sourceType: "appointment",
        sourceId: a.id,
        unread: true,
      });
    }
  }

  // ---- Weight ----
  if (categoryEnabled(input.prefs, "weight")) {
    for (const pet of input.pets) {
      const latest = input.latestWeightByPet[pet.id];
      const latestDay = latest ? dayKey(latest.measured_at) : null;
      let days = latestDay ? localDayDiff(latestDay, day) : 999;
      if (days < 0) days = 0;
      let status: ReminderStatus | null = null;
      if (days >= REMINDER_TIMING_DOCS.weightOverdueDays) status = "overdue";
      else if (days >= REMINDER_TIMING_DOCS.weightStaleDays) status = "due";
      if (!status) continue;

      // Weekly key (local calendar) so dismiss does not suppress forever
      const week = `${now.getFullYear()}-W${Math.ceil(
        (startOfLocalDay(now).getTime() - new Date(now.getFullYear(), 0, 1).getTime()) /
          (7 * 86400000),
      )}`;
      const key = `weight:${pet.id}:${week}`;
      const message =
        !latest
          ? `Ainda não há peso registrado para ${pet.name}.`
          : `Última pesagem de ${pet.name} há ${days} dias.`;

      out.push({
        key,
        petId: pet.id,
        petName: pet.name,
        petPhotoUrl: pet.photo_url,
        category: "weight",
        status,
        title: "Controle de peso",
        message,
        dueAt: latest?.measured_at ?? null,
        hrefTab: "health",
        hrefAction: "weight",
        sourceType: "weight",
        sourceId: pet.id,
        unread: true,
      });
    }
  }

  return out
    .map((item) => applyActions(item, actionMap))
    .filter((x): x is ReminderItem => Boolean(x))
    .sort(sortReminders);
}

export function countUnreadReminders(items: ReminderItem[]): number {
  return items.filter((i) => i.unread && (i.status === "due" || i.status === "overdue")).length;
}

export function dashboardReminders(items: ReminderItem[], limit = 4): ReminderItem[] {
  return items
    .filter((i) => i.status === "overdue" || i.status === "due")
    .slice(0, limit);
}
