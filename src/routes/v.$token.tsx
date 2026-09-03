import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Stethoscope } from "lucide-react";
import { formatDateTime } from "@/lib/pet-utils";
import { logAndDescribeError } from "@/lib/errors";
import {
  vetAccessStatusLabel,
  vetAccessTypeLabel,
  type VetAccessPreview,
  type VetAccessStatus,
} from "@/lib/vet-access";
import { AUTH_NEXT_KEY } from "@/lib/pending-tag-activation";

export const Route = createFileRoute("/v/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Acesso veterinário — PetID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VetInvitePage,
});

function VetInvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sessionReady, setSessionReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setAuthed(!!data.session);
      setSessionReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const preview = useQuery({
    queryKey: ["vet-access-preview", token],
    enabled: sessionReady && authed && Boolean(token),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("preview_vet_access", { _token: token });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as VetAccessPreview | null;
    },
    retry: false,
  });

  const redeem = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("redeem_vet_access", { _token: token });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.pet_id) throw new Error("Não foi possível ativar o acesso.");
      return row as { pet_id: string };
    },
    onSuccess: async (row) => {
      await qc.invalidateQueries({ queryKey: ["my-vet-pets"] });
      await qc.invalidateQueries({ queryKey: ["vet-clinical-pet", row.pet_id] });
      await qc.invalidateQueries({ queryKey: ["vet-vaccines", row.pet_id] });
      await qc.invalidateQueries({ queryKey: ["vet-weight", row.pet_id] });
      await qc.invalidateQueries({ queryKey: ["vet-appointments", row.pet_id] });
      await qc.invalidateQueries({ queryKey: ["vet-documents", row.pet_id] });
      toast.success("Acesso veterinário ativado");
      navigate({ to: "/vet/pets/$id", params: { id: row.pet_id }, replace: true });
    },
    onError: (e: Error) =>
      toast.error(
        logAndDescribeError("redeem_vet_access", e, "Não foi possível ativar o acesso."),
      ),
  });

  const goAuth = () => {
    try {
      sessionStorage.setItem(AUTH_NEXT_KEY, `/v/${token}`);
    } catch {
      /* ignore */
    }
    navigate({ to: "/auth", search: { next: `/v/${token}` } });
  };

  if (!sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando…
      </div>
    );
  }

  if (!authed) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Acesso veterinário</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Entre ou crie uma conta PetID para ativar o acesso clínico autorizado pelo tutor.
          Você verá apenas o pet autorizado — não a conta completa do tutor.
        </p>
        <Button className="mt-6 w-full" onClick={goAuth}>
          Entrar para continuar
        </Button>
      </Shell>
    );
  }

  if (preview.isLoading) {
    return (
      <Shell>
        <Skeleton className="h-28 w-full" />
      </Shell>
    );
  }

  if (preview.isError || !preview.data) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Convite inválido</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Este link não é válido ou não existe. Peça um novo acesso ao tutor.
        </p>
        <Button asChild className="mt-6 w-full" variant="outline">
          <Link to="/vet">Meus acessos veterinários</Link>
        </Button>
      </Shell>
    );
  }

  const p = preview.data;
  const status = p.status as VetAccessStatus;
  const canRedeem = status === "pending" || status === "active";

  return (
    <Shell>
      <div className="flex items-start gap-3">
        {p.pet_photo_url ? (
          <img
            src={p.pet_photo_url}
            alt=""
            className="h-16 w-16 rounded-2xl object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
            <Stethoscope className="h-6 w-6 text-primary" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">{p.pet_name}</h1>
          <p className="text-sm text-muted-foreground">
            {[p.pet_species, p.vet_name, p.clinic].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="secondary">{vetAccessStatusLabel(status)}</Badge>
            <Badge variant="outline">{vetAccessTypeLabel(p.access_type)}</Badge>
            <Badge variant="outline">Somente leitura</Badge>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-1 text-xs text-muted-foreground">
        {p.expires_at ? (
          <p>Acesso válido até {formatDateTime(p.expires_at)}</p>
        ) : (
          <p>Acesso permanente até o tutor revogar</p>
        )}
        {status === "pending" ? (
          <p>Convite válido até {formatDateTime(p.invite_expires_at)}</p>
        ) : null}
      </div>

      {canRedeem ? (
        <Button
          className="mt-6 w-full"
          disabled={redeem.isPending}
          onClick={() => redeem.mutate()}
        >
          {status === "active"
            ? redeem.isPending
              ? "Abrindo…"
              : "Abrir visão profissional"
            : redeem.isPending
              ? "Ativando…"
              : "Ativar acesso"}
        </Button>
      ) : (
        <p className="mt-6 rounded-xl border border-border bg-secondary/30 px-3 py-2 text-sm text-muted-foreground">
          Este convite não pode ser ativado ({vetAccessStatusLabel(status)}).
        </p>
      )}

      <Button asChild variant="ghost" className="mt-3 w-full">
        <Link to="/vet">Ver todos os acessos</Link>
      </Button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-hero)" }}>
      <header className="border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-md items-center justify-center px-4">
          <Logo size={26} />
        </div>
      </header>
      <div className="mx-auto max-w-md px-4 py-8">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          {children}
        </div>
      </div>
    </div>
  );
}
