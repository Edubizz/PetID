import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, BarChart, Bar } from "recharts";

export const Route = createFileRoute("/admin/stats")({
  component: StatsPage,
});

type Row = { month: string; new_users: number; new_pets: number; scans: number; sightings: number };

function StatsPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin", "monthly-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_monthly_stats");
      if (error) throw error;
      return ((data ?? []) as unknown as Row[]).map((r) => ({ ...r, new_users: Number(r.new_users), new_pets: Number(r.new_pets), scans: Number(r.scans), sightings: Number(r.sightings) }));
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Estatísticas</h1>
      <p className="mt-1 text-muted-foreground">Últimos 12 meses.</p>

      {isLoading ? (
        <p className="mt-10 text-center text-muted-foreground">Carregando…</p>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-4 font-semibold">Cadastros mensais</h2>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="new_users" name="Novos usuários" stroke="hsl(var(--primary))" strokeWidth={2} />
                <Line type="monotone" dataKey="new_pets" name="Novos pets" stroke="hsl(var(--accent))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-4 font-semibold">Atividade mensal</h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip />
                <Legend />
                <Bar dataKey="scans" name="Escaneamentos" fill="hsl(var(--primary))" />
                <Bar dataKey="sightings" name="Avistamentos" fill="hsl(var(--accent))" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}