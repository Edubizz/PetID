/**
 * Safe pet history deletion — removes time-bounded historical rows for one pet.
 * Never deletes the pet, routine definitions (trackers), caretakers, or identity.
 *
 * Only tables with owner DELETE under existing RLS are included (no migration).
 */

import { supabase } from "@/integrations/supabase/client";
import { dayKey } from "@/lib/daily-care";

export type HistoryPeriodPreset = "today" | "7d" | "30d" | "90d" | "year" | "custom";

export type HistoryRecordCategory = "rotina" | "peso" | "vacinas" | "consultas" | "documentos";

export type HistoryDateRange = {
  /** Inclusive local-day start as ISO (start of day). */
  startIso: string;
  /** Inclusive local-day end as ISO (end of day). */
  endIso: string;
  /** Human-readable label for confirmations. */
  label: string;
  /** Longer Portuguese phrase for review copy, e.g. "1 de agosto e 15 de agosto". */
  labelLong: string;
};

export const HISTORY_PERIOD_OPTIONS: { value: HistoryPeriodPreset; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "year", label: "Este ano" },
  { value: "custom", label: "Período personalizado" },
];

type CategoryTarget = {
  category: HistoryRecordCategory;
  table: "tracker_entries" | "weight_history" | "vaccines" | "appointments" | "documents";
  dateColumn: string;
  label: string;
  /** Short noun for sentences ("registros de rotina"). */
  noun: string;
};

export const HISTORY_CATEGORY_TARGETS: readonly CategoryTarget[] = [
  {
    category: "rotina",
    table: "tracker_entries",
    dateColumn: "completed_at",
    label: "Rotina",
    noun: "registros de rotina",
  },
  {
    category: "peso",
    table: "weight_history",
    dateColumn: "measured_at",
    label: "Peso",
    noun: "registros de peso",
  },
  {
    category: "vacinas",
    table: "vaccines",
    dateColumn: "applied_at",
    label: "Vacinas",
    noun: "vacinas aplicadas",
  },
  {
    category: "consultas",
    table: "appointments",
    dateColumn: "scheduled_at",
    label: "Consultas",
    noun: "consultas",
  },
  {
    category: "documentos",
    table: "documents",
    dateColumn: "created_at",
    label: "Documentos",
    noun: "documentos",
  },
] as const;

/** Intentionally preserved — never touched by this flow. */
export const HISTORY_DELETE_PRESERVED = [
  "pets (perfil / identidade)",
  "trackers (definições / itens da rotina)",
  "caretakers",
  "verification_requests",
  "profile_extras / microchip / tutors embutidos",
  "sightings / pet_scans / lost_mode_events (sem DELETE no RLS atual)",
  "vacinas planejadas (applied_at nulo)",
] as const;

/** Require typing EXCLUIR when deleting this many records or more. */
export const HISTORY_DELETE_TYPE_CONFIRM_THRESHOLD = 20;

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function parseLocalDateInput(value: string): Date | null {
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatPtShort(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatPtLong(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Resolves a preset/custom period into inclusive local-day ISO bounds,
 * matching Daily Care local calendar day semantics (`dayKey`).
 */
export function resolveHistoryDateRange(
  preset: HistoryPeriodPreset,
  opts?: { customStart?: string; customEnd?: string; now?: Date },
): HistoryDateRange {
  const now = opts?.now ?? new Date();
  const end = endOfLocalDay(now);

  if (preset === "custom") {
    const startRaw = opts?.customStart ? parseLocalDateInput(opts.customStart) : null;
    const endRaw = opts?.customEnd ? parseLocalDateInput(opts.customEnd) : null;
    if (!startRaw || !endRaw) {
      throw new Error("Informe a data inicial e a data final.");
    }
    if (dayKey(startRaw) > dayKey(endRaw)) {
      throw new Error("A data inicial não pode ser posterior à data final.");
    }
    const start = startOfLocalDay(startRaw);
    const endCustom = endOfLocalDay(endRaw);
    return {
      startIso: start.toISOString(),
      endIso: endCustom.toISOString(),
      label: `${formatPtShort(start)} a ${formatPtShort(endCustom)}`,
      labelLong: `${formatPtLong(start)} e ${formatPtLong(endCustom)}`,
    };
  }

  let start: Date;
  if (preset === "today") {
    start = startOfLocalDay(now);
  } else if (preset === "year") {
    start = startOfLocalDay(new Date(now.getFullYear(), 0, 1));
  } else {
    const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
    const s = new Date(now);
    s.setDate(s.getDate() - (days - 1));
    start = startOfLocalDay(s);
  }

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    label: `${formatPtShort(start)} a ${formatPtShort(end)}`,
    labelLong: `${formatPtLong(start)} e ${formatPtLong(end)}`,
  };
}

export type HistoryCategoryCount = {
  category: HistoryRecordCategory;
  label: string;
  noun: string;
  count: number;
};

async function countForTarget(
  target: CategoryTarget,
  petId: string,
  range: HistoryDateRange,
): Promise<number> {
  if (target.table === "vaccines") {
    let q = supabase
      .from("vaccines")
      .select("id", { count: "exact", head: true })
      .eq("pet_id", petId)
      .not("applied_at", "is", null)
      .gte("applied_at", range.startIso)
      .lte("applied_at", range.endIso);
    const { error, count } = await q;
    if (error) throw error;
    return count ?? 0;
  }

  const { error, count } = await supabase
    .from(target.table)
    .select("id", { count: "exact", head: true })
    .eq("pet_id", petId)
    .gte(target.dateColumn, range.startIso)
    .lte(target.dateColumn, range.endIso);
  if (error) throw error;
  return count ?? 0;
}

/** Count records per category in range (for review step). */
export async function countPetHistoryByCategory(
  petId: string,
  range: HistoryDateRange,
  categories: HistoryRecordCategory[],
): Promise<HistoryCategoryCount[]> {
  if (!petId) throw new Error("Pet inválido.");
  const selected = new Set(categories);
  const targets = HISTORY_CATEGORY_TARGETS.filter((t) => selected.has(t.category));
  const results: HistoryCategoryCount[] = [];

  for (const target of targets) {
    const count = await countForTarget(target, petId, range);
    results.push({
      category: target.category,
      label: target.label,
      noun: target.noun,
      count,
    });
  }
  return results;
}

export type HistoryDeleteResult = {
  deleted: Partial<Record<HistoryRecordCategory, number>>;
  failures: { category: HistoryRecordCategory; message: string }[];
};

async function deleteForTarget(
  target: CategoryTarget,
  petId: string,
  range: HistoryDateRange,
): Promise<number> {
  if (target.table === "vaccines") {
    const { error, count } = await supabase
      .from("vaccines")
      .delete({ count: "exact" })
      .eq("pet_id", petId)
      .not("applied_at", "is", null)
      .gte("applied_at", range.startIso)
      .lte("applied_at", range.endIso);
    if (error) throw error;
    return count ?? 0;
  }

  const { error, count } = await supabase
    .from(target.table)
    .delete({ count: "exact" })
    .eq("pet_id", petId)
    .gte(target.dateColumn, range.startIso)
    .lte(target.dateColumn, range.endIso);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Deletes historical rows for selected categories within the range.
 * Always scopes by pet_id. Never touches pets / trackers / caretakers.
 *
 * If any selected category fails after others succeeded, failures are returned
 * (not silent). Callers must surface this to the user.
 */
export async function deletePetHistory(
  petId: string,
  range: HistoryDateRange,
  categories: HistoryRecordCategory[],
): Promise<HistoryDeleteResult> {
  if (!petId) throw new Error("Pet inválido.");
  if (categories.length === 0) throw new Error("Selecione ao menos um tipo de registro.");

  const selected = new Set(categories);
  const targets = HISTORY_CATEGORY_TARGETS.filter((t) => selected.has(t.category));
  const deleted: Partial<Record<HistoryRecordCategory, number>> = {};
  const failures: { category: HistoryRecordCategory; message: string }[] = [];

  for (const target of targets) {
    try {
      deleted[target.category] = await deleteForTarget(target, petId, range);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Falha desconhecida";
      failures.push({ category: target.category, message });
      deleted[target.category] = 0;
    }
  }

  if (failures.length === targets.length) {
    throw new Error(
      `Não foi possível excluir o histórico. ${failures[0]?.message ?? "Tente novamente."}`,
    );
  }

  return { deleted, failures };
}

export function totalDeleted(result: HistoryDeleteResult): number {
  return Object.values(result.deleted).reduce((s, n) => s + (n ?? 0), 0);
}

export function requiresTypedConfirmation(totalCount: number, categoryCount: number): boolean {
  return totalCount >= HISTORY_DELETE_TYPE_CONFIRM_THRESHOLD || (categoryCount >= 3 && totalCount >= 10);
}

/** Query keys that must refresh immediately after a history purge. */
export function historyDeleteInvalidateKeys(petId: string) {
  return [
    ["pet", petId],
    ["pet-profile-meta", petId],
    ["health-timeline", petId],
    ["timeline", petId],
    ["tracker-entries", petId],
    ["trackers", petId],
    ["vaccines", petId],
    ["weights", petId],
    ["documents", petId],
    ["sightings", petId],
    ["pet-indicators", petId],
    ["today-care-overview"],
    ["home-agenda"],
    ["pets"],
    ["pets-quick-picker"],
  ] as const;
}

export function buildReviewSummary(
  counts: HistoryCategoryCount[],
  range: HistoryDateRange,
): string {
  const withData = counts.filter((c) => c.count > 0);
  if (withData.length === 0) {
    return `Nenhum registro encontrado entre ${range.labelLong}.`;
  }
  if (withData.length === 1) {
    const c = withData[0];
    return `Você está prestes a excluir ${c.count} ${c.noun} entre ${range.labelLong}.`;
  }
  const total = withData.reduce((s, c) => s + c.count, 0);
  const parts = withData.map((c) => `${c.count} ${c.noun}`).join(", ");
  return `Você está prestes a excluir ${total} registros (${parts}) entre ${range.labelLong}.`;
}
