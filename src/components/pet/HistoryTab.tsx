import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Syringe, Stethoscope, Weight, ScanLine, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatDateTime, formatDate } from "@/lib/pet-utils";

type Event = {
  id: string;
  at: string;
  kind: "vaccine" | "appointment" | "weight" | "sighting" | "created";
  title: string;
  description?: string | null;
};

const KIND_META: Record<Event["kind"], { icon: LucideIcon; label: string; color: string }> = {
  vaccine:     { icon: Syringe,     label: "Vacina",       color: "bg-primary/10 text-primary" },
  appointment: { icon: Stethoscope, label: "Consulta",     color: "bg-accent/10 text-accent-foreground" },
  weight:      { icon: Weight,      label: "Pesagem",      color: "bg-secondary text-secondary-foreground" },
  sighting:    { icon: ScanLine,    label: "Avistamento",  color: "bg-destructive/10 text-destructive" },
  created:     { icon: Sparkles,    label: "Cadastro",     color: "bg-muted text-muted-foreground" },
};

export function HistoryTab({ petId, petCreatedAt }: { petId: string; petCreatedAt: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["timeline", petId],
    queryFn: async (): Promise<Event[]> => {
      const [vac, app, wei, sig] = await Promise.all([
        supabase.from("vaccines").select("id,name,applied_at,vet_name").eq("pet_id", petId),
        supabase.from("appointments").select("id,scheduled_at,reason,vet_name,clinic,notes").eq("pet_id", petId),
        supabase.from("weight_history").select("id,weight_kg,measured_at,notes").eq("pet_id", petId),
        supabase.from("sightings").select("id,created_at,location,reporter_name").eq("pet_id", petId),
      ]);
      const events: Event[] = [];
      (vac.data ?? []).forEach((v) => events.push({
        id: `v-${v.id}`, kind: "vaccine", at: v.applied_at ?? new Date().toISOString(),
        title: `Vacina: ${v.name}`, description: v.vet_name ? `Aplicada por ${v.vet_name}` : null,
      }));
      (app.data ?? []).forEach((a) => events.push({
        id: `a-${a.id}`, kind: "appointment", at: a.scheduled_at,
        title: a.reason ? `Consulta — ${a.reason}` : "Consulta veterinária",
        description: [a.vet_name, a.clinic].filter(Boolean).join(" • ") || a.notes,
      }));
      (wei.data ?? []).forEach((w) => events.push({
        id: `w-${w.id}`, kind: "weight", at: w.measured_at,
        title: `Pesagem: ${w.weight_kg} kg`, description: w.notes,
      }));
      (sig.data ?? []).forEach((s) => events.push({
        id: `s-${s.id}`, kind: "sighting", at: s.created_at,
        title: "Avistamento registrado",
        description: [s.location, s.reporter_name && `por ${s.reporter_name}`].filter(Boolean).join(" • "),
      }));
      events.push({
        id: "created", kind: "created", at: petCreatedAt,
        title: "Pet cadastrado no PetID",
      });
      events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      return events;
    },
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  if (!data || data.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        Nenhum evento no histórico ainda.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h3 className="text-lg font-semibold">Linha do tempo</h3>
      <p className="text-sm text-muted-foreground">Todos os eventos do pet em ordem cronológica.</p>
      <ol className="relative mt-6 border-l border-border pl-6">
        {data.map((ev) => {
          const meta = KIND_META[ev.kind];
          const Icon = meta.icon;
          return (
            <li key={ev.id} className="mb-6 last:mb-0">
              <span className={`absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full ${meta.color}`}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-xs">{meta.label}</Badge>
                <span className="text-xs text-muted-foreground">
                  {ev.kind === "weight" ? formatDate(ev.at) : formatDateTime(ev.at)}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium">{ev.title}</p>
              {ev.description ? <p className="text-xs text-muted-foreground">{ev.description}</p> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}