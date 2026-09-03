import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { Dog, Plus, QrCode, RefreshCw, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { publicPetUrl } from "@/lib/app-url";

export const Route = createFileRoute("/_authenticated/qr")({
  component: QrPage,
});

function QrPage() {
  const navigate = useNavigate();
  const { data: pets = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["pets"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return [];
      const { data, error } = await supabase
        .from("pets")
        .select("id, name, photo_url, public_slug, breed")
        .eq("owner_id", uid);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="mx-auto max-w-5xl overflow-x-clip px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">QR Codes</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Este é o QR Code permanente de cada pet. Você pode imprimi-lo, salvar ou utilizar em uma
            identificação. Quando alguém escanear, verá o perfil público configurado por você — sem
            precisar instalar app.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="min-h-10 shrink-0 rounded-full">
          <Link to="/activate-tag">
            <Tag className="mr-2 h-4 w-4" />
            Tenho uma tag PetID
          </Link>
        </Button>
      </div>

      <ul className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
        <li>• O QR permanece o mesmo; você atualiza o que é público</li>
        <li>• Só aparece o que você autorizar</li>
        <li>• No Modo Perdido, o contato fica em destaque</li>
        <li>• Não é GPS nem rastreamento de localização</li>
      </ul>

      {isLoading ? (
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3" role="status" aria-live="polite">
          <span className="sr-only">Carregando QR Codes…</span>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72 w-full rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="mt-8 rounded-2xl border border-border bg-card p-8 text-center">
          <p className="font-medium">Não foi possível carregar os QR Codes</p>
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
            icon={QrCode}
            title="Nenhum QR Code ainda"
            description="Cadastre um pet para gerar o QR Code da coleira."
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
              search={{ tab: "qr" }}
              className="flex flex-col items-center rounded-2xl border border-border bg-card p-6 text-center transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-elegant)]"
            >
              <div className="mb-3 h-14 w-14 overflow-hidden rounded-xl bg-secondary">
                {p.photo_url ? (
                  <img src={p.photo_url} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-primary"><Dog className="h-6 w-6" /></div>
                )}
              </div>
              <p className="font-semibold">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.breed || "—"}</p>
              <div className="mt-4 rounded-xl bg-white p-3">
                <QRCodeSVG value={publicPetUrl(p.public_slug)} size={140} fgColor="#1E3A8A" />
              </div>
              <p className="mt-3 max-w-full truncate text-xs text-muted-foreground">/p/{p.public_slug}</p>
              <p className="mt-2 text-xs font-medium text-primary">Ver QR e perfil público</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
