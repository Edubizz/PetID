import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, MessageCircle, MapPin, Gift, Phone, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { formatCurrencyBRL, formatDateTime } from "@/lib/pet-utils";
import { logAndDescribeError } from "@/lib/errors";
import { EmptyState } from "@/components/EmptyState";

type Pet = {
  id: string;
  name: string;
  is_lost: boolean;
  last_seen_location: string | null;
  lost_since: string | null;
  reward_amount: number | null;
  emergency_instructions: string | null;
  secondary_contact_phone: string | null;
};

type Sighting = {
  id: string;
  reporter_name: string | null;
  reporter_contact: string | null;
  location: string | null;
  message: string | null;
  photo_url: string | null;
  created_at: string;
};

function toDatetimeLocal(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LostModeTab({ pet, onToggleLost }: { pet: Pet; onToggleLost: () => void | Promise<void> }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    last_seen_location: pet.last_seen_location ?? "",
    lost_since: toDatetimeLocal(pet.lost_since),
    reward_amount: pet.reward_amount != null ? String(pet.reward_amount) : "",
    emergency_instructions: pet.emergency_instructions ?? "",
    secondary_contact_phone: pet.secondary_contact_phone ?? "",
  });

  const saveDetails = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("pets")
        .update({
          last_seen_location: form.last_seen_location || null,
          lost_since: form.lost_since ? new Date(form.lost_since).toISOString() : null,
          reward_amount: form.reward_amount ? Number(form.reward_amount) : null,
          emergency_instructions: form.emergency_instructions || null,
          secondary_contact_phone: form.secondary_contact_phone || null,
        })
        .eq("id", pet.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Detalhes de emergência atualizados");
      qc.invalidateQueries({ queryKey: ["pet", pet.id] });
    },
    onError: (e: unknown) => toast.error(logAndDescribeError("LostModeTab: save details failed", e, "Não foi possível salvar os detalhes de emergência.")),
  });

  const activate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("pets")
        .update({
          is_lost: true,
          last_seen_location: form.last_seen_location || null,
          lost_since: form.lost_since ? new Date(form.lost_since).toISOString() : new Date().toISOString(),
          reward_amount: form.reward_amount ? Number(form.reward_amount) : null,
          emergency_instructions: form.emergency_instructions || null,
          secondary_contact_phone: form.secondary_contact_phone || null,
        })
        .eq("id", pet.id);
      if (error) throw error;
      // Fire-and-forget history log for the Health Timeline; never blocks activation above.
      void supabase.from("lost_mode_events").insert({
        pet_id: pet.id,
        event: "activated",
        last_seen_location: form.last_seen_location || null,
        reward_amount: form.reward_amount ? Number(form.reward_amount) : null,
      });
    },
    onSuccess: () => {
      toast.success("Modo perdido ativado");
      // Same cross-page fan-out as the header's "Marcar como encontrado" toggle
      // (pets.$id.tsx) — Dashboard/Today alerts and this pet's Timeline all
      // depend on is_lost / lost_mode_events and must not serve stale data.
      qc.invalidateQueries({ queryKey: ["pet", pet.id] });
      qc.invalidateQueries({ queryKey: ["pets"] });
      qc.invalidateQueries({ queryKey: ["today-care-overview"] });
      qc.invalidateQueries({ queryKey: ["home-agenda"] });
      qc.invalidateQueries({ queryKey: ["health-timeline", pet.id] });
    },
    onError: (e: unknown) => toast.error(logAndDescribeError("LostModeTab: activate failed", e, "Não foi possível ativar o modo perdido.")),
  });

  const { data: sightings, isLoading: loadingSightings } = useQuery({
    queryKey: ["sightings", pet.id],
    enabled: pet.is_lost,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sightings")
        .select("id, reporter_name, reporter_contact, location, message, photo_url, created_at")
        .eq("pet_id", pet.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Sighting[];
    },
  });

  const whatsappHref = pet.secondary_contact_phone
    ? `https://wa.me/${pet.secondary_contact_phone.replace(/\D/g, "")}`
    : null;

  return (
    <div className="space-y-6">
      {pet.is_lost && (
        <div className="rounded-2xl border-2 border-destructive bg-destructive p-6 text-center text-destructive-foreground shadow-[var(--shadow-elegant)]">
          <AlertTriangle className="mx-auto h-8 w-8" />
          <p className="mt-2 text-2xl font-extrabold tracking-tight">PET PERDIDO</p>
          <p className="mt-1 text-sm opacity-90">
            O perfil público de {pet.name} está exibindo um alerta de emergência.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {pet.last_seen_location || "Local não informado"}</span>
            <span className="inline-flex items-center gap-1.5">Desde {pet.lost_since ? formatDateTime(pet.lost_since) : "—"}</span>
            {pet.reward_amount ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 font-semibold">
                <Gift className="h-4 w-4" /> Recompensa: {formatCurrencyBRL(pet.reward_amount)}
              </span>
            ) : null}
          </div>
          <Button
            variant="secondary"
            className="mt-5 rounded-full"
            onClick={() => onToggleLost()}
          >
            Marcar como encontrado
          </Button>
        </div>
      )}

      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h3 className="text-lg font-semibold">Informações de emergência</h3>
        <p className="text-sm text-muted-foreground">
          Preencha os dados que aparecerão no perfil público enquanto o modo perdido estiver ativo.
          O Modo Perdido ajuda na identificação e no contato — não é GPS, não garante localização
          nem a recuperação do pet e não substitui busca e medidas de segurança locais.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <Label className="mb-1.5 block text-sm">Visto por último em</Label>
            <Input
              type="datetime-local"
              value={form.lost_since}
              onChange={(e) => setForm({ ...form, lost_since: e.target.value })}
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-sm">Local visto por último</Label>
            <Input
              value={form.last_seen_location}
              onChange={(e) => setForm({ ...form, last_seen_location: e.target.value })}
              placeholder="Bairro, cidade, ponto de referência"
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-sm">Recompensa (opcional)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.reward_amount}
              onChange={(e) => setForm({ ...form, reward_amount: e.target.value })}
              placeholder="Ex.: 200"
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-sm">Telefone de contato de emergência</Label>
            <div className="flex gap-2">
              <Input
                value={form.secondary_contact_phone}
                onChange={(e) => setForm({ ...form, secondary_contact_phone: e.target.value })}
                placeholder="+55 11 90000-0000"
              />
              {whatsappHref && (
                <Button type="button" variant="outline" size="icon" asChild title="Testar link do WhatsApp" aria-label="Testar link do WhatsApp">
                  <a href={whatsappHref} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /></a>
                </Button>
              )}
            </div>
          </div>
          <div className="md:col-span-2">
            <Label className="mb-1.5 block text-sm">Instruções de emergência</Label>
            <Textarea
              rows={3}
              value={form.emergency_instructions}
              onChange={(e) => setForm({ ...form, emergency_instructions: e.target.value })}
              placeholder="Ex.: Muito assustado, não persiga. Ligue antes de se aproximar."
            />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          {pet.is_lost ? (
            <Button onClick={() => saveDetails.mutate()} disabled={saveDetails.isPending} className="rounded-full">
              {saveDetails.isPending ? "Salvando…" : "Salvar informações"}
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={() => activate.mutate()}
              disabled={activate.isPending}
              className="rounded-full"
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              {activate.isPending ? "Ativando…" : "Ativar modo perdido"}
            </Button>
          )}
        </div>
      </section>

      {pet.is_lost && (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <h3 className="flex items-center gap-2 text-lg font-semibold"><ScanLine className="h-5 w-5" /> Avistamentos relatados</h3>
          <p className="text-sm text-muted-foreground">Linha do tempo de quem entrou em contato pelo perfil público.</p>
          <div className="mt-4">
            {loadingSightings ? (
              <Skeleton className="h-24 w-full" />
            ) : sightings && sightings.length > 0 ? (
              <ol className="relative space-y-4 border-l border-border pl-5">
                {sightings.map((s) => (
                  <li key={s.id} className="relative">
                    <span className="absolute -left-[1.45rem] mt-1 h-3 w-3 rounded-full bg-destructive" />
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-xs">{formatDateTime(s.created_at)}</Badge>
                      {s.reporter_name && <span className="text-sm font-medium">{s.reporter_name}</span>}
                    </div>
                    {s.location && (
                      <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" /> {s.location}
                      </p>
                    )}
                    {s.reporter_contact && (
                      <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" /> {s.reporter_contact}
                      </p>
                    )}
                    {s.message && <p className="mt-1 text-sm">{s.message}</p>}
                    {s.photo_url && (
                      <img
                        src={s.photo_url}
                        alt="Foto enviada pelo avistamento"
                        className="mt-2 h-24 w-24 rounded-lg object-cover"
                      />
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState
                size="sm"
                icon={ScanLine}
                title="Nenhum avistamento relatado ainda"
                description="Qualquer pessoa que visitar o perfil público enquanto o modo perdido estiver ativo pode enviar um avistamento — ele aparece aqui em tempo real."
              />
            )}
          </div>
        </section>
      )}
    </div>
  );
}
