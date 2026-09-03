import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { Stethoscope } from "lucide-react";
import { formatDateTime } from "@/lib/pet-utils";
import {
  vetAccessTypeLabel,
  type MyVetPet,
} from "@/lib/vet-access";

export const Route = createFileRoute("/_authenticated/vet/")({
  head: () => ({
    meta: [{ title: "Acessos veterinários — PetID" }],
  }),
  component: VetPetsListPage,
});

function VetPetsListPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-vet-pets"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_my_vet_pets");
      if (error) throw error;
      return (data ?? []) as MyVetPet[];
    },
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Visão profissional</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pets com acesso clínico autorizado pelos tutores. Somente leitura — sem acesso à conta
          completa do tutor.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      ) : isError ? (
        <p className="text-sm text-destructive">Não foi possível carregar seus acessos.</p>
      ) : data && data.length > 0 ? (
        <ul className="space-y-3">
          {data.map((row) => (
            <li key={row.access_id}>
              <Link
                to="/vet/pets/$id"
                params={{ id: row.pet_id }}
                className="flex gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] transition hover:border-primary/40"
              >
                {row.pet_photo_url ? (
                  <img
                    src={row.pet_photo_url}
                    alt=""
                    className="h-14 w-14 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-secondary">
                    <Stethoscope className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{row.pet_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {[row.pet_species, row.pet_breed].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge variant="outline">{vetAccessTypeLabel(row.access_type)}</Badge>
                    <Badge variant="outline">Somente leitura</Badge>
                    {row.expires_at ? (
                      <Badge variant="secondary">Até {formatDateTime(row.expires_at)}</Badge>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Stethoscope}
          title="Nenhum acesso ativo"
          description="Quando um tutor enviar um link de acesso veterinário e você ativá-lo, o pet aparecerá aqui."
        />
      )}
    </div>
  );
}
