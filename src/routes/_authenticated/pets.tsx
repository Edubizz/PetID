import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dog, Plus, QrCode } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pets")({
  component: PetsRoute,
});

function PetsRoute() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname !== "/pets") return <Outlet />;
  return <PetsList />;
}

function PetsList() {
  const { data: pets = [] } = useQuery({
    queryKey: ["pets"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return [];
      const { data, error } = await supabase
        .from("pets")
        .select("*")
        .eq("owner_id", uid)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Meus Pets</h1>
          <p className="mt-1 text-muted-foreground">Todos os pets sob seus cuidados.</p>
        </div>
        <Button asChild className="rounded-full">
          <Link to="/pets/new"><Plus className="mr-2 h-4 w-4" />Adicionar pet</Link>
        </Button>
      </div>

      {pets.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <Dog className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 font-medium">Nenhum pet cadastrado</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {pets.map((p) => (
            <Link
              key={p.id}
              to="/pets/$id"
              params={{ id: p.id }}
              className="group overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-elegant)]"
            >
              <div className="aspect-square w-full overflow-hidden bg-secondary">
                {p.photo_url ? (
                  <img
                    src={p.photo_url}
                    alt={p.name}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center" style={{ background: "var(--gradient-brand)" }}>
                    <Dog className="h-16 w-16 text-primary-foreground/80" />
                  </div>
                )}
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  {p.is_lost && (
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">Perdido</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[p.breed, p.sex].filter(Boolean).join(" • ") || "Sem detalhes"}
                </p>
                <div className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <QrCode className="h-3 w-3" /> /{p.public_slug}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}