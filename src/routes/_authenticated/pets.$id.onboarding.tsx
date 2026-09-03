import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, SearchX } from "lucide-react";
import { PetOnboardingWizard } from "@/components/pet/onboarding/PetOnboardingWizard";

export const Route = createFileRoute("/_authenticated/pets/$id/onboarding")({
  component: PetOnboardingRoute,
});

function PetOnboardingRoute() {
  const { id } = Route.useParams();

  // Same ["pet", id] cache entry the profile page (`pets.$id.tsx`) uses, so
  // finishing onboarding and landing on the profile doesn't refetch.
  const { data: pet, isLoading } = useQuery({
    queryKey: ["pet", id],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return null;
      const { data, error } = await supabase
        .from("pets")
        .select("*")
        .eq("id", id)
        .eq("owner_id", uid)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-14">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-6 h-72 w-full rounded-3xl" />
      </div>
    );
  }

  if (!pet) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <SearchX className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold">Pet não encontrado</h1>
        <p className="mt-1 text-sm text-muted-foreground">Este pet não existe ou foi removido.</p>
        <Link
          to="/pets"
          className="mt-6 inline-flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para meus pets
        </Link>
      </div>
    );
  }

  return <PetOnboardingWizard pet={pet} />;
}
