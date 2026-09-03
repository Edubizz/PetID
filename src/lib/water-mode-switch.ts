import { supabase } from "@/integrations/supabase/client";
import { planLegacyEntryUnitSnapshots } from "@/lib/daily-care";
import type { Json } from "@/integrations/supabase/types";

/**
 * Before changing a water tracker's unit (bowls ↔ volume), stamp the previous
 * unit onto historical entries that lack metadata.unit.
 *
 * Never overwrites an existing metadata.unit.
 * Throws on failure so callers must not proceed with the mode switch.
 */
export async function preserveLegacyEntryUnitsBeforeModeSwitch(
  trackerId: string,
  previousUnit: string,
): Promise<number> {
  const unit = previousUnit.trim();
  if (!unit) return 0;

  const { data, error } = await supabase
    .from("tracker_entries")
    .select("id, metadata")
    .eq("tracker_id", trackerId);
  if (error) throw error;

  const plans = planLegacyEntryUnitSnapshots(data ?? [], unit);
  for (const plan of plans) {
    const { error: updateError } = await supabase
      .from("tracker_entries")
      .update({ metadata: plan.metadata as Json })
      .eq("id", plan.id);
    if (updateError) throw updateError;
  }
  return plans.length;
}

/**
 * Pure helper used by tests: simulate preservation + mode switch abort rules.
 * Returns the planned snapshots, or throws when `fail` is set (caller must not switch).
 */
export function runModeSwitchPreservationGate(opts: {
  entries: { id: string; metadata?: unknown }[];
  previousUnit: string;
  fail?: boolean;
}): { snapshots: ReturnType<typeof planLegacyEntryUnitSnapshots>; maySwitch: true } {
  if (opts.fail) {
    throw new Error("Não foi possível preservar o histórico antes de mudar o modo.");
  }
  return {
    snapshots: planLegacyEntryUnitSnapshots(opts.entries, opts.previousUnit),
    maySwitch: true,
  };
}
