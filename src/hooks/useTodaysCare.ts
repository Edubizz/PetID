import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeStats, dayKey, sumTrackerEntriesCompatible, todayKey, type TrackerCategory } from "@/lib/daily-care";
import { evaluatePetCareExpectation } from "@/lib/daily-expectations";

export type TodaysCarePet = {
  id: string;
  name: string;
  photo_url: string | null;
  breed: string | null;
  is_lost: boolean;
};

export type TodaysCareTracker = {
  id: string;
  pet_id: string;
  title: string;
  category: TrackerCategory;
  target_per_day: number;
  unit: string | null;
  color: string | null;
  is_active: boolean;
  reminder_times?: string[] | null;
};

type EntryRow = {
  tracker_id: string;
  pet_id: string;
  value: number;
  completed_at: string;
  metadata?: unknown;
};

const CARE_HISTORY_WINDOW_DAYS = 60;

/**
 * Cross-pet aggregate powering the Home Dashboard. Reuses the same
 * `trackers` / `tracker_entries` tables and the exact same completion/streak
 * math as the per-pet Daily Care tab (`daily-care.ts` -> computeStats) —
 * trackers/entries from every pet are pooled so the streak represents the
 * whole household.
 */
export function useTodaysCare() {
  const query = useQuery({
    queryKey: ["today-care-overview"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return { pets: [] as TodaysCarePet[], trackers: [] as TodaysCareTracker[], entries: [] as EntryRow[] };

      const { data: pets, error: petsError } = await supabase
        .from("pets")
        .select("id, name, photo_url, breed, is_lost")
        .eq("owner_id", uid)
        .order("name");
      if (petsError) throw petsError;

      const petIds = (pets ?? []).map((p) => p.id);
      if (petIds.length === 0) {
        return { pets: (pets ?? []) as TodaysCarePet[], trackers: [], entries: [] };
      }

      const since = new Date();
      since.setDate(since.getDate() - CARE_HISTORY_WINDOW_DAYS);

      const [trackersRes, entriesRes] = await Promise.all([
        supabase
          .from("trackers")
          .select("id, pet_id, title, category, target_per_day, unit, color, is_active, reminder_times")
          .in("pet_id", petIds)
          .order("created_at", { ascending: true }),
        supabase
          .from("tracker_entries")
          .select("tracker_id, pet_id, value, completed_at, metadata")
          .in("pet_id", petIds)
          .gte("completed_at", since.toISOString()),
      ]);
      // Daily Care is an additive layer on top of the pet list: if it fails to
      // load for any reason, the pets themselves must still show up on the
      // dashboard instead of the whole page looking empty.
      if (trackersRes.error) console.error("useTodaysCare: failed to load trackers", trackersRes.error);
      if (entriesRes.error) console.error("useTodaysCare: failed to load tracker_entries", entriesRes.error);

      return {
        pets: (pets ?? []) as TodaysCarePet[],
        trackers: (trackersRes.error ? [] : trackersRes.data ?? []) as TodaysCareTracker[],
        entries: (entriesRes.error ? [] : entriesRes.data ?? []) as EntryRow[],
      };
    },
  });

  const derived = useMemo(() => {
    const pets = query.data?.pets ?? [];
    const trackers = query.data?.trackers ?? [];
    const entries = query.data?.entries ?? [];

    const key = todayKey();
    const sumsByTracker = new Map<string, number>();
    for (const t of trackers) {
      sumsByTracker.set(
        t.id,
        sumTrackerEntriesCompatible(entries, t.id, t.unit, { day: key }),
      );
    }

    const trackersByPet = new Map<string, TodaysCareTracker[]>();
    for (const t of trackers) {
      if (!trackersByPet.has(t.pet_id)) trackersByPet.set(t.pet_id, []);
      trackersByPet.get(t.pet_id)!.push(t);
    }

    const now = new Date();
    const petSummaries = pets.map((pet) => {
      const petTrackers = trackersByPet.get(pet.id) ?? [];
      const active = petTrackers.filter((t) => t.is_active);
      const completed = active.filter((t) => (sumsByTracker.get(t.id) ?? 0) >= t.target_per_day).length;
      const pct = active.length > 0
        ? Math.round((active.reduce((sum, t) => sum + Math.min(1, (sumsByTracker.get(t.id) ?? 0) / (t.target_per_day || 1)), 0) / active.length) * 100)
        : 0;
      const petEntries = entries
        .filter((e) => e.pet_id === pet.id)
        .map((e) => ({
          tracker_id: e.tracker_id,
          value: e.value,
          completed_at: e.completed_at,
          metadata: e.metadata,
        }));
      const care = evaluatePetCareExpectation(active, petEntries, now);
      // "Needs attention" follows the expectation engine — not raw morning incompleteness.
      const scheduleBehind = care.urgency === "attention" || care.urgency === "critical";
      const needsAttention = pet.is_lost || scheduleBehind;
      return {
        pet,
        activeTrackers: active,
        inactiveCount: petTrackers.length - active.length,
        completed,
        remaining: active.length - completed,
        pct,
        needsAttention,
      };
    });

    const totalActive = petSummaries.reduce((sum, p) => sum + p.activeTrackers.length, 0);
    const totalCompleted = petSummaries.reduce((sum, p) => sum + p.completed, 0);
    const overallPct = totalActive > 0 ? Math.round((totalCompleted / totalActive) * 100) : 0;
    const healthyCount = petSummaries.filter((p) => !p.needsAttention).length;
    const needsAttentionCount = petSummaries.filter((p) => p.needsAttention).length;

    const householdStats = computeStats(
      trackers,
      entries.map((e) => ({ tracker_id: e.tracker_id, value: e.value, completed_at: e.completed_at })),
      CARE_HISTORY_WINDOW_DAYS,
    );

    return {
      petSummaries,
      totalActive,
      totalCompleted,
      overallPct,
      sumsByTracker,
      healthyCount,
      needsAttentionCount,
      currentStreak: householdStats.currentStreak,
      bestStreak: householdStats.bestStreak,
    };
  }, [query.data]);

  return { ...query, ...derived };
}
