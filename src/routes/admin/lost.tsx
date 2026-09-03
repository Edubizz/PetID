import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { logAndDescribeError } from "@/lib/errors";
import { CheckCircle2, Dog, MapPin } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/pet/ConfirmDialog";

export const Route = createFileRoute("/admin/lost")({
  component: LostPage,
});

function LostPage() {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [resolveFor, setResolveFor] = useState<string | null>(null);

  const { data: pets = [], isLoading } = useQuery({
    queryKey: ["admin", "pets", "lost"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_pets");
      if (error) throw error;
      return ((data ?? []) as unknown as Array<{ id: string; name: string; photo_url: string | null; owner_name: string | null; owner_email: string | null; is_lost: boolean; last_scan_at: string | null; sightings_count: number }>).filter((p) => p.is_lost);
    },
  });

  const { data: sightings = [] } = useQuery({
    queryKey: ["admin", "sightings", openId],
    enabled: !!openId,
    queryFn: async () => {
      const { data, error } = await supabase.from("sightings").select("*").eq("pet_id", openId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const resolve = useMutation({
    mutationFn: async (petId: string) => {
      const { error } = await supabase.rpc("admin_resolve_lost", { _pet_id: petId });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin"] }); toast.success("Pet marcado como encontrado"); setResolveFor(null); setOpenId(null); },
    onError: (e: Error) => toast.error(logAndDescribeError("mutation", e, "Não foi possível atualizar o modo perdido.")),
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Pets Perdidos</h1>
      <p className="mt-1 text-muted-foreground">Acompanhe pets em modo perdido e seus avistamentos.</p>

      {isLoading ? (
        <p className="mt-10 text-center text-muted-foreground">Carregando…</p>
      ) : pets.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <MapPin className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 font-medium">Nenhum pet perdido no momento</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4">
          {pets.map((p) => (
            <div key={p.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 overflow-hidden rounded-full bg-muted">
                    {p.photo_url ? <img src={p.photo_url} alt={p.name} className="h-full w-full object-cover" /> : <Dog className="h-full w-full p-2 text-muted-foreground" />}
                  </div>
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.owner_name || p.owner_email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>{p.sightings_count} avistamento(s)</span>
                  <Button size="sm" variant="outline" onClick={() => setOpenId(openId === p.id ? null : p.id)}>
                    {openId === p.id ? "Fechar" : "Ver relatos"}
                  </Button>
                  <Button size="sm" onClick={() => setResolveFor(p.id)}>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Marcar encontrado
                  </Button>
                </div>
              </div>
              {openId === p.id && (
                <div className="mt-4 border-t border-border pt-4">
                  {sightings.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum relato registrado.</p>
                  ) : (
                    <ul className="space-y-3">
                      {sightings.map((s) => (
                        <li key={s.id} className="rounded-lg border border-border bg-background p-3 text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-medium">{s.reporter_name || "Anônimo"}</div>
                              <div className="text-xs text-muted-foreground">{s.reporter_contact}</div>
                            </div>
                            <span className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString("pt-BR")}</span>
                          </div>
                          {s.location && <p className="mt-1 text-xs text-muted-foreground">📍 {s.location}</p>}
                          {s.message && <p className="mt-2">{s.message}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!resolveFor}
        onOpenChange={(o) => !o && setResolveFor(null)}
        title="Marcar como encontrado?"
        description="O pet sairá do modo perdido e os avistamentos serão arquivados."
        confirmLabel="Marcar encontrado"
        onConfirm={() => { if (resolveFor) resolve.mutate(resolveFor); }}
      />
    </div>
  );
}