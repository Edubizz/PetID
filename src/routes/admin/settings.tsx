import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { logAndDescribeError } from "@/lib/errors";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { CreditCard, Bell, Puzzle, Handshake, Megaphone, Sparkles, ShieldCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/settings")({
  component: SettingsPage,
});

const cards = [
  { icon: CreditCard, title: "Planos & Preços", desc: "Gerenciar planos disponíveis, preços e limites." },
  { icon: Bell, title: "Notificações", desc: "Templates de email, push e WhatsApp." },
  { icon: Puzzle, title: "Integrações", desc: "APIs externas, webhooks e serviços de terceiros." },
  { icon: Handshake, title: "Parceiros", desc: "Clínicas, petshops e parceiros credenciados." },
  { icon: Megaphone, title: "Campanhas", desc: "Promoções, cupons e comunicações em massa." },
  { icon: Sparkles, title: "Personalização", desc: "Cores, logo e conteúdo da plataforma." },
];

function SettingsPage() {
  const queryClient = useQueryClient();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();

  const adminExists = useQuery({
    queryKey: ["admin-exists"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_exists");
      if (error) throw error;
      return Boolean(data);
    },
    staleTime: 60_000,
  });

  const claim = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("claim_first_admin");
      if (error) throw error;
      return data as boolean;
    },
    onSuccess: async (ok) => {
      await queryClient.invalidateQueries({ queryKey: ["admin-exists"] });
      await queryClient.invalidateQueries({ queryKey: ["me", "is-admin"] });
      if (ok) {
        toast.success("Você agora é administrador — recarregue a página");
      } else {
        toast.info("Já existe um administrador");
      }
    },
    onError: (e: Error) =>
      toast.error(
        logAndDescribeError("claim_first_admin", e, "Não foi possível reivindicar o acesso admin."),
      ),
  });

  // UI only: backend claim_first_admin still returns false / no-op when an admin exists.
  const showBootstrap =
    !adminLoading &&
    !adminExists.isLoading &&
    !adminExists.isError &&
    adminExists.data === false &&
    !isAdmin;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
      <p className="mt-1 text-muted-foreground">Estrutura preparada para expansão futura.</p>

      {adminExists.isLoading || adminLoading ? (
        <Skeleton className="mt-8 h-28 w-full rounded-2xl" />
      ) : showBootstrap ? (
        <div className="mt-8 rounded-2xl border border-primary/30 bg-primary/5 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
            <div className="flex-1">
              <h2 className="font-semibold">Bootstrap de administrador</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Ainda não há administrador no sistema. Você pode reivindicar o primeiro papel de
                admin.
              </p>
              <Button
                className="mt-3"
                size="sm"
                onClick={() => claim.mutate()}
                disabled={claim.isPending}
              >
                Reivindicar primeiro admin
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.title} className="rounded-2xl border border-border bg-card p-5 opacity-90">
            <c.icon className="h-6 w-6 text-primary" />
            <h3 className="mt-3 font-semibold">{c.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
            <span className="mt-3 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Em breve
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
