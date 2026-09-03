import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { VetProfessionalView } from "@/components/pet/VetProfessionalView";
import { parseVetPermissions, type MyVetPet } from "@/lib/vet-access";

export const Route = createFileRoute("/_authenticated/vet/pets/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Prontuário veterinário — PetID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VetPetDetailPage,
});

function VetPetDetailPage() {
  const { id } = Route.useParams();

  const grantQuery = useQuery({
    queryKey: ["my-vet-pets"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_my_vet_pets");
      if (error) throw error;
      return ((data ?? []) as MyVetPet[]).map((g) => ({
        ...g,
        permissions: parseVetPermissions(g.permissions),
      }));
    },
  });

  const grant = grantQuery.data?.find((g) => g.pet_id === id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4 flex items-center gap-2 print:hidden">
        <Button asChild variant="ghost" size="sm" className="h-10 px-2">
          <Link to="/vet">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Acessos
          </Link>
        </Button>
      </div>

      {!grant && !grantQuery.isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Você não tem acesso ativo a este pet. Peça um novo link ao tutor ou verifique se o acesso
          expirou/foi revogado.
        </div>
      ) : (
        <VetProfessionalView petId={id} />
      )}
    </div>
  );
}
