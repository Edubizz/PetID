import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { Skeleton } from "@/components/ui/skeleton";
import { logAndDescribeError } from "@/lib/errors";
import {
  AUTH_NEXT_KEY,
  activateTagHref,
  setPendingTagActivation,
} from "@/lib/pending-tag-activation";

type ResolveStatus = "invalid" | "unactivated" | "active" | "disabled" | "lost" | "replaced";

type ResolveResult = {
  status: ResolveStatus;
  public_slug?: string;
};

function parseResolve(raw: unknown): ResolveResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { status: "invalid" };
  }
  const row = raw as Record<string, unknown>;
  const status = typeof row.status === "string" ? row.status : "invalid";
  const allowed: ResolveStatus[] = [
    "invalid",
    "unactivated",
    "active",
    "disabled",
    "lost",
    "replaced",
  ];
  const safeStatus = allowed.includes(status as ResolveStatus)
    ? (status as ResolveStatus)
    : "invalid";
  return {
    status: safeStatus,
    public_slug: typeof row.public_slug === "string" ? row.public_slug : undefined,
  };
}

export const Route = createFileRoute("/t/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Tag PetID" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PhysicalTagPage,
});

function PhysicalTagPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
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

  const resolve = useQuery({
    queryKey: ["resolve-physical-tag", token],
    enabled: Boolean(token),
    queryFn: async (): Promise<ResolveResult> => {
      const { data, error } = await supabase.rpc("resolve_physical_tag", {
        _token: token,
      });
      if (error) {
        console.error(logAndDescribeError("resolve_physical_tag", error, "Falha ao resolver tag."));
        return { status: "invalid" };
      }
      return parseResolve(data);
    },
    retry: false,
  });

  useEffect(() => {
    if (resolve.data?.status === "active" && resolve.data.public_slug) {
      navigate({
        to: "/p/$slug",
        params: { slug: resolve.data.public_slug },
        replace: true,
      });
    }
  }, [resolve.data, navigate]);

  const goActivate = () => {
    setPendingTagActivation(token);
    const next = activateTagHref(token);
    if (authed) {
      navigate({ to: "/activate-tag", search: { token } });
      return;
    }
    try {
      sessionStorage.setItem(AUTH_NEXT_KEY, next);
    } catch {
      /* ignore */
    }
    navigate({ to: "/auth", search: { next } });
  };

  const status = resolve.data?.status;
  const loading = !sessionReady || resolve.isLoading;

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--gradient-hero)" }}>
      <header className="border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-md items-center justify-center px-4">
          <Logo size={26} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        {loading ? (
          <div className="space-y-3" role="status" aria-live="polite">
            <span className="sr-only">Carregando tag…</span>
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        ) : status === "active" ? (
          <p className="text-center text-sm text-muted-foreground">Abrindo perfil do pet…</p>
        ) : status === "unactivated" ? (
          <section className="rounded-2xl border border-border bg-card p-6 text-center shadow-[var(--shadow-card)]">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Tag className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-xl font-bold tracking-tight">Tag PetID</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Esta tag ainda não foi vinculada a um pet. Faça login e ative com o código da
              embalagem. Tags não ativadas não expõem dados do pet. A Tag PetID é identificação por
              QR (não GPS); o escaneamento não garante contato nem recuperação.
            </p>
            <Button type="button" className="mt-6 w-full rounded-full" onClick={goActivate}>
              {authed ? "Ativar tag" : "Entrar para ativar"}
            </Button>
          </section>
        ) : status === "lost" ? (
          <SafeMessage
            title="Tag marcada como perdida"
            body="Esta tag não está disponível. Se você é o tutor, acesse sua conta PetID para gerenciar o perfil do pet."
          />
        ) : status === "replaced" ? (
          <SafeMessage
            title="Tag substituída"
            body="Esta tag foi substituída e não redireciona mais. Use a tag atual do colar ou acesse o perfil pelo app."
          />
        ) : status === "disabled" ? (
          <SafeMessage
            title="Tag desativada"
            body="Esta tag não está ativa no momento. Em caso de dúvida, entre em contato com o suporte PetID."
          />
        ) : (
          <SafeMessage
            title="Tag não encontrada"
            body="Não foi possível identificar esta tag. Verifique o link ou o QR Code e tente novamente."
          />
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Protegido por PetID —{" "}
          <Link to="/" className="underline-offset-2 hover:underline">
            conhecer
          </Link>
        </p>
      </main>
    </div>
  );
}

function SafeMessage({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 text-center shadow-[var(--shadow-card)]">
      <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </section>
  );
}
