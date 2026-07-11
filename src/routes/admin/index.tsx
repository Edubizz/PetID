import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, Dog, MapPin, ShieldCheck, ScanLine, UserPlus, PawPrint, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

type Stats = {
  total_users: number;
  total_pets: number;
  lost_pets: number;
  found_pets: number;
  verified_pets: number;
  total_scans: number;
  new_users_30d: number;
  new_pets_30d: number;
  pending_verifications: number;
};

function AdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_stats");
      if (error) throw error;
      return data as unknown as Stats;
    },
  });

  const cards = [
    { label: "Total de usuários", value: data?.total_users, icon: Users, tint: "from-primary/20" },
    { label: "Total de pets", value: data?.total_pets, icon: Dog, tint: "from-accent/20" },
    { label: "Pets perdidos", value: data?.lost_pets, icon: AlertTriangle, tint: "from-destructive/20" },
    { label: "Pets encontrados", value: data?.found_pets, icon: MapPin, tint: "from-emerald-500/20" },
    { label: "Pets verificados", value: data?.verified_pets, icon: ShieldCheck, tint: "from-blue-500/20" },
    { label: "Escaneamentos", value: data?.total_scans, icon: ScanLine, tint: "from-purple-500/20" },
    { label: "Novos usuários (30d)", value: data?.new_users_30d, icon: UserPlus, tint: "from-teal-500/20" },
    { label: "Novos pets (30d)", value: data?.new_pets_30d, icon: PawPrint, tint: "from-orange-500/20" },
  ];

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Painel Administrativo</h1>
        <p className="mt-1 text-muted-foreground">Visão geral da plataforma PetID.</p>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className={`relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br ${c.tint} to-card p-5`}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{c.label}</span>
              <c.icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="mt-3 text-3xl font-bold">
              {isLoading ? "…" : (c.value ?? 0).toLocaleString("pt-BR")}
            </div>
          </div>
        ))}
      </div>

      {data && data.pending_verifications > 0 && (
        <div className="mt-8 flex items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <ShieldCheck className="h-5 w-5 text-amber-600" />
          <div className="text-sm">
            <strong>{data.pending_verifications}</strong> solicitação(ões) de verificação aguardando análise.
          </div>
        </div>
      )}
    </div>
  );
}