import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { Dog, QrCode } from "lucide-react";

export const Route = createFileRoute("/_authenticated/qr")({
  component: QrPage,
});

function QrPage() {
  const { data: pets = [] } = useQuery({
    queryKey: ["pets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pets").select("id, name, photo_url, public_slug, breed");
      if (error) throw error;
      return data;
    },
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-bold tracking-tight">QR Codes</h1>
      <p className="mt-1 text-muted-foreground">Um QR Code exclusivo por pet — imprima e mantenha na coleira.</p>

      {pets.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <QrCode className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 font-medium">Cadastre um pet para gerar seu QR Code.</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {pets.map((p) => (
            <Link
              key={p.id}
              to="/pets/$id"
              params={{ id: p.id }}
              className="flex flex-col items-center rounded-2xl border border-border bg-card p-6 text-center transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-elegant)]"
            >
              <div className="mb-3 h-14 w-14 overflow-hidden rounded-xl bg-secondary">
                {p.photo_url ? (
                  <img src={p.photo_url} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-primary"><Dog className="h-6 w-6" /></div>
                )}
              </div>
              <p className="font-semibold">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.breed || "—"}</p>
              <div className="mt-4 rounded-xl bg-white p-3">
                <QRCodeSVG value={`${origin}/p/${p.public_slug}`} size={140} fgColor="#1E3A8A" />
              </div>
              <p className="mt-3 truncate text-xs text-muted-foreground">/p/{p.public_slug}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}