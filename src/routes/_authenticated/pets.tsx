import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { Dog, Plus, QrCode, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pets")({
  component: PetsRoute,
});

function PetsRoute() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname !== "/pets") return <Outlet />;
  return <PetsList />;
}

function PetsList() {
  const navigate = useNavigate();
  const { data: pets = [], isLoading, isError, refetch, isFetching } = useQuery({
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
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Meus Pets</h1>
          <p className="mt-1 text-sm text-muted-foreground">Todos os pets sob seus cuidados.</p>
        </div>
        <Button asChild className="min-h-11 rounded-full">
          <Link to="/pets/new">
            <Plus className="mr-2 h-4 w-4" />
            Adicionar pet
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3" role="status" aria-live="polite">
          <span className="sr-only">Carregando pets…</span>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-[4/5] w-full rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="mt-8 rounded-2xl border border-border bg-card p-8 text-center">
          <p className="font-medium">Não foi possível carregar seus pets</p>
          <p className="mt-1 text-sm text-muted-foreground">Verifique a conexão e tente novamente.</p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 min-h-11 rounded-full"
            disabled={isFetching}
            onClick={() => refetch()}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar novamente
          </Button>
        </div>
      ) : pets.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={Dog}
            title="Nenhum pet cadastrado"
            description="Crie o perfil digital do seu pet para gerar o QR Code e acompanhar rotina e saúde."
            action={{ label: "Adicionar pet", icon: Plus, onClick: () => navigate({ to: "/pets/new" }) }}
            className="p-12"
          />
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
                  <div
                    className="flex h-full w-full items-center justify-center"
                    style={{ background: "var(--gradient-brand)" }}
                  >
                    <Dog className="h-16 w-16 text-primary-foreground/80" />
                  </div>
                )}
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  {p.is_lost && (
                    <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                      Perdido
                    </span>
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
