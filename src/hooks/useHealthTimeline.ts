import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  adaptWeight,
  adaptVaccines,
  adaptAppointments,
  adaptDocuments,
  adaptDailyCare,
  adaptLostMode,
  adaptSightings,
  adaptVerifications,
  adaptMilestones,
  type TimelineEvent,
} from "@/lib/timeline";
import type { TrackerCategory } from "@/lib/daily-care";

export type HealthTimelinePet = {
  id: string;
  name: string;
  birth_date: string | null;
  created_at: string;
  medications: string | null;
};

export const HEALTH_TIMELINE_ENTRIES_WINDOW_DAYS = 90;

/**
 * Single shared data source for every "merge everything about this pet" view
 * (Health Timeline tab, Pet Health Dashboard). Fetches every contributing
 * table once and hands back both the normalized event feed and the raw rows
 * each card needs for its own derived stats — no view re-implements the
 * fetching/adapting logic itself.
 */
export function useHealthTimeline(pet: HealthTimelinePet) {
  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - HEALTH_TIMELINE_ENTRIES_WINDOW_DAYS);
    return d.toISOString();
  }, []);

  const query = useQuery({
    queryKey: ["health-timeline", pet.id],
    queryFn: async () => {
      const [weight, vaccines, appointments, documents, dailyCare, trackers, lostMode, sightings, verifications] = await Promise.all([
        supabase.from("weight_history").select("id, weight_kg, measured_at, notes").eq("pet_id", pet.id).order("measured_at", { ascending: false }),
        supabase.from("vaccines").select("id, name, applied_at, next_dose, vet_name, notes").eq("pet_id", pet.id),
        supabase.from("appointments").select("id, scheduled_at, reason, vet_name, clinic, notes").eq("pet_id", pet.id),
        supabase.from("documents").select("id, title, url, category, created_at").eq("pet_id", pet.id),
        supabase.from("tracker_entries").select("id, value, notes, completed_at, trackers(id, title, category, color, unit)").eq("pet_id", pet.id).gte("completed_at", since).order("completed_at", { ascending: false }),
        supabase.from("trackers").select("id, title, category, is_active, target_per_day, unit, color").eq("pet_id", pet.id),
        supabase.from("lost_mode_events").select("id, event, occurred_at, last_seen_location, reward_amount").eq("pet_id", pet.id).order("occurred_at", { ascending: false }),
        supabase.from("sightings").select("id, reporter_name, reporter_contact, location, message, photo_url, created_at").eq("pet_id", pet.id),
        supabase.from("verification_requests").select("id, status, notes, reviewed_at, created_at").eq("pet_id", pet.id),
      ]);

      const events: TimelineEvent[] = [
        ...adaptWeight(weight.data ?? []),
        ...adaptVaccines(vaccines.data ?? []),
        ...adaptAppointments(appointments.data ?? []),
        ...adaptDocuments(documents.data ?? []),
        // lost_mode_events / trackers may not exist yet if migrations haven't been applied —
        // degrade gracefully instead of breaking the whole feed.
        ...adaptDailyCare((dailyCare.data as unknown as Parameters<typeof adaptDailyCare>[0]) ?? []),
        ...adaptLostMode(lostMode.data ?? []),
        ...adaptSightings(sightings.data ?? []),
        ...adaptVerifications(verifications.data ?? []),
        ...adaptMilestones(pet),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return {
        events,
        weightRows: weight.data ?? [],
        vaccineRows: vaccines.data ?? [],
        appointmentRows: appointments.data ?? [],
        trackerRows: (trackers.data ?? []) as {
          id: string;
          title: string;
          category: TrackerCategory;
          is_active: boolean;
          target_per_day: number;
          unit: string | null;
          color: string | null;
        }[],
        entryRows: (dailyCare.data ?? []) as { id: string; value: number; completed_at: string; trackers: { id: string } | null }[],
      };
    },
  });

  return query;
}
