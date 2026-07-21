import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dog, Syringe, Calendar, AlertTriangle, Plus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      const { data: pets } = uid
        ? await supabase.from("pets").select("id, name, is_lost, photo_url, breed").eq("owner_id", uid)
        : { data: [] as { id: string; name: string; is_lost: boolean; photo_url: string | null; breed: string | null }[] };
      const petIds = (pets ?? []).map((p) => p.id);
      const today = new Date().toISOString();
      const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const [{ count: vaccinesCount }, { count: appointmentsCount }] = await Promise.all([
        petIds.length
          ? supabase
              .from("vaccines")
              .select("*", { count: "exact", head: true })
              .in("pet_id", petIds)
              .gte("next_dose", today.slice(0, 10))
              .lte("next_dose", nextMonth)
          : Promise.resolve({ count: 0 }),
        petIds.length
          ? supabase
              .from("appointments")
              .select("*", { count: "exact", head: true })
              .in("pet_id", petIds)
              .gte("scheduled_at", today)
          : Promise.resolve({ count: 0 }),
      ]);
      return {
        pets: pets ?? [],
        upcomingVaccines: vaccinesCount ?? 0,
        upcomingAppointments: appointmentsCount ?? 0,
        lost: (pets ?? []).filter((p) => p.is_lost).length,
      };
    },
  });
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "primary",
}: {
  icon: any;
  label: string;
  value: number | string;
  tone?: "primary" | "accent" | "destructive";
}) {
  const bg =
    tone === "destructive"
      ? "bg-destructive/10 text-destructive"
      : tone === "accent"
      ? "bg-accent-soft text-accent"
      : "bg-primary/10 text-primary";
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl ${bg}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
    </div>
  );
}

function Dashboard() {
  const { data } = useDashboardStats();
  const stats = data ?? { pets: [] as any[], upcomingVaccines: 0, upcomingAppointments: 0, lost: 0 };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bem-vindo de volta 👋</h1>
          <p className="mt-1 text-muted-foreground">Visão geral dos seus pets.</p>
        </div>
        <Button asChild className="rounded-full">
          <Link to="/pets/new"><Plus className="mr-2 h-4 w-4" />Adicionar pet</Link>
        </Button>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Dog} label="Pets cadastrados" value={stats.pets.length} />
        <StatCard icon={Syringe} label="Vacinas próximas (30d)" value={stats.upcomingVaccines} tone="accent" />
        <StatCard icon={Calendar} label="Consultas agendadas" value={stats.upcomingAppointments} tone="accent" />
        <StatCard icon={AlertTriangle} label="Alertas importantes" value={stats.lost} tone={stats.lost > 0 ? "destructive" : "primary"} />
      </div>

      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Meus pets</h2>
          <Link to="/pets" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            Ver todos <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {stats.pets.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-12 text-center">
            <Dog className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-4 font-medium">Nenhum pet cadastrado ainda</p>
            <p className="mt-1 text-sm text-muted-foreground">Crie o primeiro perfil digital do seu pet.</p>
            <Button asChild className="mt-4 rounded-full">
              <Link to="/pets/new"><Plus className="mr-2 h-4 w-4" />Adicionar pet</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {stats.pets.map((p: any) => (
              <Link
                key={p.id}
                to="/pets/$id"
                params={{ id: p.id }}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]"
              >
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-primary/10">
                  {p.photo_url ? (
                    <img src={p.photo_url} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-primary"><Dog className="h-6 w-6" /></div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.breed || "—"}</p>
                </div>
                {p.is_lost && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">Perdido</span>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}