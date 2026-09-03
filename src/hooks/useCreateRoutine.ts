import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logAndDescribeError } from "@/lib/errors";
import { CATEGORY_META, type RoutineDraftItem } from "@/lib/daily-care";

/**
 * Creates the initial set of trackers from a Smart Routine draft (built by
 * `buildSmartRoutine`). Shared by the Daily Care tab's onboarding wizard and
 * the pet-creation onboarding flow so both insert trackers exactly the same
 * way and invalidate the same queries — no duplicated tracker generation.
 */
export function useCreateRoutine(petId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (items: RoutineDraftItem[]) => {
      const rows = items.map((t) => ({
        pet_id: petId,
        title: t.title,
        category: t.category,
        target_per_day: t.target_per_day,
        unit: t.unit,
        color: CATEGORY_META[t.category].color,
      }));
      if (rows.length === 0) return;
      const { error } = await supabase.from("trackers").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plano de cuidados criado!");
      qc.invalidateQueries({ queryKey: ["trackers", petId] });
      qc.invalidateQueries({ queryKey: ["tracker-entries", petId] });
      qc.invalidateQueries({ queryKey: ["today-care-overview"] });
      qc.invalidateQueries({ queryKey: ["home-agenda"] });
      qc.invalidateQueries({ queryKey: ["health-timeline", petId] });
    },
    onError: (e: unknown) =>
      toast.error(
        logAndDescribeError(
          "useCreateRoutine: createRoutine failed",
          e,
          "Não foi possível criar o plano de cuidados. Tente novamente.",
        ),
      ),
  });
}
