import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Weight, Syringe, Stethoscope, FileText, AlertTriangle, ScanLine, ShieldCheck, Cake } from "lucide-react";
import { CATEGORY_META, formatLoggedAmount, resolveEntryUnit, type TrackerCategory } from "@/lib/daily-care";

/**
 * Reusable Health Timeline adapter layer.
 *
 * Every module (weight, vaccines, appointments, documents, daily care, lost
 * mode, sightings, verification requests, milestones) contributes events by
 * mapping its own rows into the shared `TimelineEvent` shape below. Adding a
 * new source later only requires: 1) a new `TimelineEventType`, 2) an entry in
 * `TIMELINE_TYPE_META`, and 3) a small pure `adaptX(rows)` function — no
 * changes to the rendering/grouping/filtering code.
 */

export type TimelineEventType =
  | "weight"
  | "vaccine"
  | "appointment"
  | "document"
  | "daily_care"
  | "lost_mode"
  | "sighting"
  | "verification"
  | "milestone";

export type TimelineEvent = {
  id: string;
  type: TimelineEventType;
  title: string;
  subtitle?: string;
  date: string;
  icon: LucideIcon;
  color: string;
  metadata: Record<string, unknown>;
};

export const TIMELINE_TYPE_META: Record<TimelineEventType, { label: string; icon: LucideIcon; color: string }> = {
  weight: { label: "Peso", icon: Weight, color: "#0EA5E9" },
  vaccine: { label: "Vacina", icon: Syringe, color: "#6366F1" },
  appointment: { label: "Consulta", icon: Stethoscope, color: "#F59E0B" },
  document: { label: "Documento", icon: FileText, color: "#8B5CF6" },
  daily_care: { label: "Cuidado diário", icon: CATEGORY_META.custom.icon, color: "#22C55E" },
  lost_mode: { label: "Modo perdido", icon: AlertTriangle, color: "#EF4444" },
  sighting: { label: "Avistamento", icon: ScanLine, color: "#F97316" },
  verification: { label: "Verificação", icon: ShieldCheck, color: "#14B8A6" },
  milestone: { label: "Marco", icon: Cake, color: "#EC4899" },
};

export type FilterKey = "all" | "health" | "daily_care" | "lost" | "documents" | "appointments" | "weight" | "vaccines";

export const TIMELINE_FILTERS: { key: FilterKey; label: string; types: TimelineEventType[] | "all" }[] = [
  { key: "all", label: "Tudo", types: "all" },
  { key: "health", label: "Saúde", types: ["vaccine", "appointment", "weight"] },
  { key: "daily_care", label: "Cuidados Diários", types: ["daily_care"] },
  { key: "lost", label: "Perdido", types: ["lost_mode", "sighting"] },
  { key: "documents", label: "Documentos", types: ["document"] },
  { key: "appointments", label: "Consultas", types: ["appointment"] },
  { key: "weight", label: "Peso", types: ["weight"] },
  { key: "vaccines", label: "Vacinas", types: ["vaccine"] },
];

export function matchesFilter(event: TimelineEvent, key: FilterKey): boolean {
  const filter = TIMELINE_FILTERS.find((f) => f.key === key);
  if (!filter || filter.types === "all") return true;
  return filter.types.includes(event.type);
}

/* -------------------- Adapters (pure: rows -> events) -------------------- */

export type WeightRow = { id: string; weight_kg: number; measured_at: string; notes: string | null };
export function adaptWeight(rows: WeightRow[]): TimelineEvent[] {
  return rows.map((w) => ({
    id: `weight:${w.id}`,
    type: "weight",
    title: `Pesagem: ${w.weight_kg} kg`,
    subtitle: w.notes ?? undefined,
    date: w.measured_at,
    icon: TIMELINE_TYPE_META.weight.icon,
    color: TIMELINE_TYPE_META.weight.color,
    metadata: w,
  }));
}

export type VaccineRow = { id: string; name: string; applied_at: string | null; next_dose: string | null; vet_name: string | null; notes: string | null };
export function adaptVaccines(rows: VaccineRow[]): TimelineEvent[] {
  return rows
    .filter((v): v is VaccineRow & { applied_at: string } => Boolean(v.applied_at))
    .map((v) => ({
      id: `vaccine:${v.id}`,
      type: "vaccine",
      title: `Vacina: ${v.name}`,
      subtitle: v.vet_name ? `Aplicada por ${v.vet_name}` : undefined,
      date: v.applied_at,
      icon: TIMELINE_TYPE_META.vaccine.icon,
      color: TIMELINE_TYPE_META.vaccine.color,
      metadata: v,
    }));
}

export type AppointmentRow = { id: string; scheduled_at: string; reason: string | null; vet_name: string | null; clinic: string | null; notes: string | null };
export function adaptAppointments(rows: AppointmentRow[]): TimelineEvent[] {
  return rows.map((a) => ({
    id: `appointment:${a.id}`,
    type: "appointment",
    title: a.reason ? `Consulta — ${a.reason}` : "Consulta veterinária",
    subtitle: [a.vet_name, a.clinic].filter(Boolean).join(" • ") || undefined,
    date: a.scheduled_at,
    icon: TIMELINE_TYPE_META.appointment.icon,
    color: TIMELINE_TYPE_META.appointment.color,
    metadata: a,
  }));
}

export type DocumentRow = { id: string; title: string; url: string | null; category: string | null; created_at: string };
export function adaptDocuments(rows: DocumentRow[]): TimelineEvent[] {
  return rows.map((d) => ({
    id: `document:${d.id}`,
    type: "document",
    title: d.title,
    subtitle: d.category ?? undefined,
    date: d.created_at,
    icon: TIMELINE_TYPE_META.document.icon,
    color: TIMELINE_TYPE_META.document.color,
    metadata: d,
  }));
}

export type DailyCareRow = {
  id: string;
  value: number;
  notes: string | null;
  completed_at: string;
  metadata?: unknown;
  trackers: { id: string; title: string; category: TrackerCategory; color: string | null; unit: string | null } | null;
};
export function adaptDailyCare(rows: DailyCareRow[]): TimelineEvent[] {
  return rows.map((e) => {
    const meta = e.trackers ? CATEGORY_META[e.trackers.category] : undefined;
    const color = e.trackers?.color || meta?.color || TIMELINE_TYPE_META.daily_care.color;
    const unit = resolveEntryUnit(e.metadata, e.trackers?.unit ?? meta?.unit);
    return {
      id: `daily_care:${e.id}`,
      type: "daily_care",
      title: e.trackers?.title ?? "Cuidado diário",
      subtitle: `${formatLoggedAmount(e.value, unit)}${e.notes ? ` • ${e.notes}` : ""}`,
      date: e.completed_at,
      icon: meta?.icon ?? TIMELINE_TYPE_META.daily_care.icon,
      color,
      metadata: e,
    };
  });
}

export type LostModeRow = {
  id: string;
  event: string;
  occurred_at: string;
  last_seen_location: string | null;
  reward_amount: number | null;
};
export function adaptLostMode(rows: LostModeRow[]): TimelineEvent[] {
  return rows.map((l) => ({
    id: `lost_mode:${l.id}`,
    type: "lost_mode",
    title: l.event === "activated" ? "Modo perdido ativado" : "Pet encontrado",
    subtitle: l.last_seen_location ?? undefined,
    date: l.occurred_at,
    icon: TIMELINE_TYPE_META.lost_mode.icon,
    color: TIMELINE_TYPE_META.lost_mode.color,
    metadata: l,
  }));
}

export type SightingRow = {
  id: string;
  reporter_name: string | null;
  reporter_contact: string | null;
  location: string | null;
  message: string | null;
  photo_url: string | null;
  created_at: string;
};
export function adaptSightings(rows: SightingRow[]): TimelineEvent[] {
  return rows.map((s) => ({
    id: `sighting:${s.id}`,
    type: "sighting",
    title: "Avistamento reportado",
    subtitle: [s.location, s.reporter_name && `por ${s.reporter_name}`].filter(Boolean).join(" • ") || undefined,
    date: s.created_at,
    icon: TIMELINE_TYPE_META.sighting.icon,
    color: TIMELINE_TYPE_META.sighting.color,
    metadata: s,
  }));
}

const VERIFICATION_LABEL: Record<string, string> = {
  pending: "Solicitada",
  approved: "Aprovada",
  rejected: "Rejeitada",
  needs_more: "Documentos pendentes",
};

export type VerificationRow = { id: string; status: string; notes: string | null; reviewed_at: string | null; created_at: string };
export function adaptVerifications(rows: VerificationRow[]): TimelineEvent[] {
  return rows.map((v) => ({
    id: `verification:${v.id}`,
    type: "verification",
    title: `Verificação: ${VERIFICATION_LABEL[v.status] ?? v.status}`,
    subtitle: v.notes ?? undefined,
    date: v.reviewed_at ?? v.created_at,
    icon: TIMELINE_TYPE_META.verification.icon,
    color: TIMELINE_TYPE_META.verification.color,
    metadata: v,
  }));
}

export type MilestonePet = { id: string; name: string; birth_date: string | null; created_at: string };
export function adaptMilestones(pet: MilestonePet): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  if (pet.birth_date) {
    events.push({
      id: `milestone:birth:${pet.id}`,
      type: "milestone",
      title: `Nascimento de ${pet.name}`,
      date: pet.birth_date,
      icon: TIMELINE_TYPE_META.milestone.icon,
      color: TIMELINE_TYPE_META.milestone.color,
      metadata: { birth_date: pet.birth_date },
    });
  }
  events.push({
    id: `milestone:registered:${pet.id}`,
    type: "milestone",
    title: `${pet.name} entrou para o PetID`,
    date: pet.created_at,
    icon: TIMELINE_TYPE_META.milestone.icon,
    color: TIMELINE_TYPE_META.milestone.color,
    metadata: { created_at: pet.created_at },
  });
  return events;
}

/* -------------------- Grouping -------------------- */

function parseFlexibleDate(value: string): Date {
  // Plain "YYYY-MM-DD" (DATE columns) is a calendar date, not a UTC instant —
  // parsing it with `new Date(string)` can shift it a day in negative UTC offsets.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function bucketFor(dateStr: string): { key: string; label: string } {
  const d = parseFlexibleDate(dateStr);
  const diffDays = Math.round((startOfDay(new Date()).getTime() - startOfDay(d).getTime()) / 86400000);

  if (diffDays === 0) return { key: "today", label: "Hoje" };
  if (diffDays === 1) return { key: "yesterday", label: "Ontem" };
  if (diffDays > 1 && diffDays <= 7) return { key: "last-week", label: "Última semana" };
  if (diffDays > 7 && diffDays <= 30) return { key: "last-month", label: "Último mês" };
  const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return { key: `month-${monthKey}`, label: label.charAt(0).toUpperCase() + label.slice(1) };
}

export type TimelineBucket = { key: string; label: string; events: TimelineEvent[] };

export function groupByBucket(events: TimelineEvent[]): TimelineBucket[] {
  const map = new Map<string, { label: string; events: TimelineEvent[] }>();
  for (const e of events) {
    const { key, label } = bucketFor(e.date);
    if (!map.has(key)) map.set(key, { label, events: [] });
    map.get(key)!.events.push(e);
  }
  return Array.from(map.entries())
    .map(([key, v]) => ({
      key,
      label: v.label,
      events: [...v.events].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
      maxDate: Math.max(...v.events.map((e) => new Date(e.date).getTime())),
    }))
    .sort((a, b) => b.maxDate - a.maxDate)
    .map(({ key, label, events }) => ({ key, label, events }));
}

/* -------------------- Pinning (client-side only, no schema change) -------------------- */

const PIN_STORAGE_PREFIX = "petid.timeline.pins.";

function readPins(petId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(PIN_STORAGE_PREFIX + petId);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function usePinnedEvents(petId: string) {
  const [pins, setPins] = useState<Set<string>>(() => readPins(petId));

  useEffect(() => {
    setPins(readPins(petId));
  }, [petId]);

  const toggle = (eventId: string) => {
    setPins((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(PIN_STORAGE_PREFIX + petId, JSON.stringify(Array.from(next)));
      }
      return next;
    });
  };

  return { pins, toggle };
}
