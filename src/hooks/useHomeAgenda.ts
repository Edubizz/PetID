import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TIMELINE_TYPE_META, type TimelineEventType } from "@/lib/timeline";
import { CATEGORY_META, type TrackerCategory } from "@/lib/daily-care";
import type { LucideIcon } from "lucide-react";

export type HomeAgendaItem = {
  id: string;
  petId: string;
  petName: string;
  type: TimelineEventType;
  title: string;
  subtitle?: string;
  date: string;
  icon: LucideIcon;
  color: string;
};

type VaccineRow = { id: string; pet_id: string; name: string; applied_at: string | null; next_dose: string | null; vet_name: string | null };
type AppointmentRow = { id: string; pet_id: string; scheduled_at: string; reason: string | null; vet_name: string | null; clinic: string | null };
type WeightRow = { id: string; pet_id: string; weight_kg: number; measured_at: string; notes: string | null };
type DailyCareRow = { id: string; pet_id: string; value: number; notes: string | null; completed_at: string; trackers: { title: string; category: TrackerCategory; color: string | null; unit: string | null } | null };

/**
 * Cross-pet "what's coming up / what just happened" data for the Home
 * Dashboard. Reads the same tables as the per-pet Health Timeline / Dashboard
 * (`useHealthTimeline`) — it only adds pet tagging + a merge across pets, it
 * does not reimplement how vaccines/appointments/weight are interpreted.
 */
export function useHomeAgenda(pets: { id: string; name: string }[]) {
  const petIds = pets.map((p) => p.id);
  const petIdsKey = petIds.join(",");

  const query = useQuery({
    queryKey: ["home-agenda", petIdsKey],
    enabled: petIds.length > 0,
    queryFn: async () => {
      const [vaccines, appointments, weight, dailyCare] = await Promise.all([
        supabase.from("vaccines").select("id, pet_id, name, applied_at, next_dose, vet_name").in("pet_id", petIds),
        supabase.from("appointments").select("id, pet_id, scheduled_at, reason, vet_name, clinic").in("pet_id", petIds),
        supabase.from("weight_history").select("id, pet_id, weight_kg, measured_at, notes").in("pet_id", petIds).order("measured_at", { ascending: false }),
        supabase
          .from("tracker_entries")
          .select("id, pet_id, value, notes, completed_at, trackers(title, category, color, unit)")
          .in("pet_id", petIds)
          .order("completed_at", { ascending: false })
          .limit(30),
      ]);
      // Each source feeds a separate card on the Dashboard/Today pages — one
      // failing must not blank out the others (e.g. pets should still show
      // up even if the daily-care join has an issue).
      if (vaccines.error) console.error("useHomeAgenda: failed to load vaccines", vaccines.error);
      if (appointments.error) console.error("useHomeAgenda: failed to load appointments", appointments.error);
      if (weight.error) console.error("useHomeAgenda: failed to load weight_history", weight.error);
      if (dailyCare.error) console.error("useHomeAgenda: failed to load tracker_entries", dailyCare.error);

      return {
        vaccineRows: (vaccines.error ? [] : vaccines.data ?? []) as VaccineRow[],
        appointmentRows: (appointments.error ? [] : appointments.data ?? []) as AppointmentRow[],
        weightRows: (weight.error ? [] : weight.data ?? []) as WeightRow[],
        dailyCareRows: (dailyCare.error ? [] : dailyCare.data ?? []) as unknown as DailyCareRow[],
      };
    },
  });

  const petNameById = useMemo(() => new Map(pets.map((p) => [p.id, p.name])), [pets]);

  const derived = useMemo(() => {
    const now = Date.now();
    const vaccineRows = query.data?.vaccineRows ?? [];
    const appointmentRows = query.data?.appointmentRows ?? [];
    const weightRows = query.data?.weightRows ?? [];
    const dailyCareRows = query.data?.dailyCareRows ?? [];

    const petName = (id: string) => petNameById.get(id) ?? "Pet";

    const upcomingAppt: HomeAgendaItem[] = appointmentRows
      .filter((a) => new Date(a.scheduled_at).getTime() >= now)
      .map((a) => ({
        id: `appointment:${a.id}`,
        petId: a.pet_id,
        petName: petName(a.pet_id),
        type: "appointment" as const,
        title: a.reason ? `Consulta — ${a.reason}` : "Consulta veterinária",
        subtitle: [a.vet_name, a.clinic].filter(Boolean).join(" • ") || undefined,
        date: a.scheduled_at,
        icon: TIMELINE_TYPE_META.appointment.icon,
        color: TIMELINE_TYPE_META.appointment.color,
      }));

    const upcomingVacc: HomeAgendaItem[] = vaccineRows
      .filter((v): v is VaccineRow & { next_dose: string } => Boolean(v.next_dose) && new Date(v.next_dose as string).getTime() >= now)
      .map((v) => ({
        id: `vaccine:${v.id}`,
        petId: v.pet_id,
        petName: petName(v.pet_id),
        type: "vaccine" as const,
        title: `${v.name} — próxima dose`,
        subtitle: v.vet_name ?? undefined,
        date: v.next_dose,
        icon: TIMELINE_TYPE_META.vaccine.icon,
        color: TIMELINE_TYPE_META.vaccine.color,
      }));

    const upcoming = [...upcomingAppt, ...upcomingVacc].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 6);

    const overdueVaccineRows = vaccineRows.filter((v) => v.next_dose && new Date(v.next_dose).getTime() < now);
    const overdueVaccines: HomeAgendaItem[] = overdueVaccineRows.map((v) => ({
      id: `vaccine-overdue:${v.id}`,
      petId: v.pet_id,
      petName: petName(v.pet_id),
      type: "vaccine" as const,
      title: `${v.name} — dose atrasada`,
      subtitle: v.vet_name ?? undefined,
      date: v.next_dose as string,
      icon: TIMELINE_TYPE_META.vaccine.icon,
      color: TIMELINE_TYPE_META.vaccine.color,
    }));

    const latestWeightByPet = new Map<string, string>();
    for (const w of weightRows) {
      if (!latestWeightByPet.has(w.pet_id)) latestWeightByPet.set(w.pet_id, w.measured_at);
    }
    const STALE_WEIGHT_DAYS = 40;
    const staleWeightPets = Array.from(petNameById.entries())
      .map(([petId, name]) => {
        const lastMeasuredAt = latestWeightByPet.get(petId) ?? null;
        const days = lastMeasuredAt ? Math.floor((now - new Date(lastMeasuredAt).getTime()) / 86400000) : null;
        return { petId, petName: name, lastMeasuredAt, days };
      })
      .filter((p) => p.days !== null && p.days >= STALE_WEIGHT_DAYS) as { petId: string; petName: string; lastMeasuredAt: string; days: number }[];

    const recentWeight: HomeAgendaItem[] = weightRows.map((w) => ({
      id: `weight:${w.id}`,
      petId: w.pet_id,
      petName: petName(w.pet_id),
      type: "weight" as const,
      title: `Pesagem: ${w.weight_kg} kg`,
      subtitle: w.notes ?? undefined,
      date: w.measured_at,
      icon: TIMELINE_TYPE_META.weight.icon,
      color: TIMELINE_TYPE_META.weight.color,
    }));

    const recentVaccine: HomeAgendaItem[] = vaccineRows
      .filter((v): v is VaccineRow & { applied_at: string } => Boolean(v.applied_at))
      .map((v) => ({
        id: `vaccine-applied:${v.id}`,
        petId: v.pet_id,
        petName: petName(v.pet_id),
        type: "vaccine" as const,
        title: `Vacina aplicada: ${v.name}`,
        subtitle: v.vet_name ?? undefined,
        date: v.applied_at,
        icon: TIMELINE_TYPE_META.vaccine.icon,
        color: TIMELINE_TYPE_META.vaccine.color,
      }));

    const recentAppt: HomeAgendaItem[] = appointmentRows
      .filter((a) => new Date(a.scheduled_at).getTime() < now)
      .map((a) => ({
        id: `appointment-done:${a.id}`,
        petId: a.pet_id,
        petName: petName(a.pet_id),
        type: "appointment" as const,
        title: a.reason ? `Consulta — ${a.reason}` : "Consulta veterinária",
        subtitle: [a.vet_name, a.clinic].filter(Boolean).join(" • ") || undefined,
        date: a.scheduled_at,
        icon: TIMELINE_TYPE_META.appointment.icon,
        color: TIMELINE_TYPE_META.appointment.color,
      }));

    const recentDaily: HomeAgendaItem[] = dailyCareRows.map((e) => {
      const meta = e.trackers ? CATEGORY_META[e.trackers.category] : undefined;
      return {
        id: `daily_care:${e.id}`,
        petId: e.pet_id,
        petName: petName(e.pet_id),
        type: "daily_care" as const,
        title: e.trackers?.title ?? "Cuidado diário",
        subtitle: `${e.value} ${e.trackers?.unit ?? meta?.unit ?? ""}${e.notes ? ` • ${e.notes}` : ""}`,
        date: e.completed_at,
        icon: meta?.icon ?? TIMELINE_TYPE_META.daily_care.icon,
        color: e.trackers?.color || meta?.color || TIMELINE_TYPE_META.daily_care.color,
      };
    });

    const recent = [...recentWeight, ...recentVaccine, ...recentAppt, ...recentDaily]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 6);

    return {
      upcoming,
      overdueVaccineCount: overdueVaccineRows.length,
      overdueVaccines,
      staleWeightPets,
      recent,
    };
  }, [query.data, petNameById]);

  return { ...query, ...derived };
}
