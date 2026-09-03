import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CATEGORY_META,
  entryUnitMetadata,
  setLastQuickValue,
  usesQuantityQuickLog,
  type TrackerCategory,
} from "@/lib/daily-care";
import { logAndDescribeError } from "@/lib/errors";

export type QuickLoggableTracker = {
  id: string;
  category: TrackerCategory;
  title?: string;
  unit?: string | null;
};

export type QuickLogPayload = {
  tracker: QuickLoggableTracker;
  /** Amount to log. Required — callers resolve defaults / last-used themselves. */
  value: number;
};

/**
 * Shared "tap to log" mutation used by Daily Care, the Pet Dashboard, and the
 * cross-pet Today's Care page. Callers pass the exact value so quantity
 * trackers can log a remembered/custom amount while count trackers keep +1.
 */
export function useQuickLogEntry(petId: string, invalidateKeys: QueryKey[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tracker, value }: QuickLogPayload) => {
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("Informe um valor válido.");
      }
      const unit = tracker.unit ?? CATEGORY_META[tracker.category].unit;
      const { error } = await supabase.from("tracker_entries").insert({
        tracker_id: tracker.id,
        pet_id: petId,
        value,
        metadata: entryUnitMetadata(unit),
      });
      if (error) throw error;
      return { tracker, value, unit };
    },
    onSuccess: ({ tracker, value, unit }) => {
      if (usesQuantityQuickLog(tracker.category, unit)) {
        setLastQuickValue(tracker.id, value);
      }
      toast.success(tracker.title ? `${tracker.title} registrado` : "Registrado!");
      for (const key of invalidateKeys) qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["owner-reminders"] });
      qc.invalidateQueries({ queryKey: ["today-care-overview"] });
    },
    onError: (e: unknown, { tracker }) =>
      toast.error(
        logAndDescribeError(
          "useQuickLogEntry: insert failed",
          e,
          tracker.title ? `Não foi possível registrar "${tracker.title}".` : "Não foi possível registrar.",
        ),
      ),
  });
}
