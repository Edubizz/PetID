import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/claim-admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) throw redirect({ to: "/auth" });
    const { data: exists, error } = await supabase.rpc("admin_exists");
    if (error) throw error;
    if (exists) throw redirect({ to: "/dashboard" });
  },
  component: ClaimAdminPage,
});

function ClaimAdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const claim = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("claim_first_admin");
      if (error) throw error;
      if (!data) throw new Error("Já existe um administrador");
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me", "is-admin"] });
      navigate({ to: "/admin" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <ShieldCheck className="mx-auto h-12 w-12 text-primary" />
        <h1 className="mt-4 text-2xl font-bold">Primeiro administrador</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Nenhum administrador foi configurado ainda. Você pode reivindicar esse papel.
        </p>
        <Button className="mt-6" onClick={() => claim.mutate()} disabled={claim.isPending}>
          Reivindicar primeiro administrador
        </Button>
      </div>
    </div>
  );
}
