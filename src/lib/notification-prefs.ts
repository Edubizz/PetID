/** Owner notification / reminder preferences (profiles.notification_prefs). */

export type ReminderCategory =
  | "routine"
  | "vaccines"
  | "appointments"
  | "medications"
  | "weight";

export type NotificationPrefs = {
  categories: Record<ReminderCategory, boolean>;
  quiet_hours: {
    enabled: boolean;
    /** HH:MM local */
    start: string;
    /** HH:MM local */
    end: string;
  };
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  categories: {
    routine: true,
    vaccines: true,
    appointments: true,
    medications: true,
    weight: true,
  },
  quiet_hours: {
    enabled: false,
    start: "22:00",
    end: "07:00",
  },
};

export const REMINDER_CATEGORY_LABELS: Record<ReminderCategory, string> = {
  routine: "Rotina",
  vaccines: "Vacinas",
  appointments: "Consultas",
  medications: "Medicamentos",
  weight: "Controle de peso",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickBool(obj: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = obj[key];
  return typeof v === "boolean" ? v : fallback;
}

function pickHHMM(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  return /^\d{2}:\d{2}$/.test(raw) ? raw : fallback;
}

export function parseNotificationPrefs(raw: unknown): NotificationPrefs {
  const root = asRecord(raw);
  const cats = asRecord(root.categories);
  const qh = asRecord(root.quiet_hours);
  return {
    categories: {
      routine: pickBool(cats, "routine", DEFAULT_NOTIFICATION_PREFS.categories.routine),
      vaccines: pickBool(cats, "vaccines", DEFAULT_NOTIFICATION_PREFS.categories.vaccines),
      appointments: pickBool(cats, "appointments", DEFAULT_NOTIFICATION_PREFS.categories.appointments),
      medications: pickBool(cats, "medications", DEFAULT_NOTIFICATION_PREFS.categories.medications),
      weight: pickBool(cats, "weight", DEFAULT_NOTIFICATION_PREFS.categories.weight),
    },
    quiet_hours: {
      enabled: pickBool(qh, "enabled", false),
      start: pickHHMM(qh.start, DEFAULT_NOTIFICATION_PREFS.quiet_hours.start),
      end: pickHHMM(qh.end, DEFAULT_NOTIFICATION_PREFS.quiet_hours.end),
    },
  };
}

/** True when local now is inside quiet hours (supports overnight windows). */
export function isInQuietHours(
  prefs: NotificationPrefs,
  now = new Date(),
): boolean {
  if (!prefs.quiet_hours.enabled) return false;
  const [sh, sm] = prefs.quiet_hours.start.split(":").map(Number);
  const [eh, em] = prefs.quiet_hours.end.split(":").map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  const cur = now.getHours() * 60 + now.getMinutes();
  if (start === end) return false;
  if (start < end) return cur >= start && cur < end;
  // Overnight: e.g. 22:00 → 07:00
  return cur >= start || cur < end;
}

export function categoryEnabled(prefs: NotificationPrefs, category: ReminderCategory): boolean {
  return prefs.categories[category] !== false;
}
