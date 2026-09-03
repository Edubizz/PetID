import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Pencil, Plus, Syringe, Trash2, Weight } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/pet-utils";
import { logAndDescribeError } from "@/lib/errors";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  applyMedicalPublicToggle,
  medicalPublicFromVisibility,
  parsePublicVisibility,
  withPublicVisibility,
} from "@/lib/public-visibility";

type Pet = {
  id: string;
  weight_kg: number | null;
  updated_at: string;
  allergies: string | null;
  medications: string | null;
  medical_notes: string | null;
  show_medical_public: boolean;
  profile_extras?: unknown;
};

export function HealthTab({
  pet,
  autoOpen,
  onConsumeAutoOpen,
}: {
  pet: Pet;
  autoOpen?: "weight" | "vaccine";
  onConsumeAutoOpen?: () => void;
}) {
  return (
    <div className="space-y-6">
      <MedicalCard pet={pet} />
      <WeightSection
        petId={pet.id}
        currentWeight={pet.weight_kg}
        autoOpen={autoOpen === "weight"}
        onConsumeAutoOpen={onConsumeAutoOpen}
      />
      <VaccinesSection petId={pet.id} autoOpen={autoOpen === "vaccine"} onConsumeAutoOpen={onConsumeAutoOpen} />
    </div>
  );
}

function MedicalCard({ pet }: { pet: Pet }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    allergies: pet.allergies ?? "",
    medications: pet.medications ?? "",
    medical_notes: pet.medical_notes ?? "",
    show_medical_public: pet.show_medical_public,
  });

  const save = useMutation({
    mutationFn: async () => {
      const visibility = applyMedicalPublicToggle(
        parsePublicVisibility(pet.profile_extras),
        form.show_medical_public,
      );
      const profile_extras = withPublicVisibility(pet.profile_extras ?? {}, visibility);
      const { error } = await supabase.from("pets").update({
        allergies: form.allergies || null,
        medications: form.medications || null,
        medical_notes: form.medical_notes || null,
        show_medical_public: medicalPublicFromVisibility(visibility),
        profile_extras,
      }).eq("id", pet.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Informações médicas atualizadas");
      qc.invalidateQueries({ queryKey: ["pet", pet.id] });
      setOpen(false);
    },
    onError: (e: unknown) => toast.error(logAndDescribeError("HealthTab: save medical info failed", e, "Não foi possível salvar as informações médicas.")),
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Informações médicas</h3>
          <p className="text-sm text-muted-foreground">
            Última atualização: {formatDate(pet.updated_at)}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="rounded-full">
              <Pencil className="mr-2 h-4 w-4" /> Editar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Editar informações médicas</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Alergias</Label><Textarea rows={2} value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} /></div>
              <div><Label>Medicamentos</Label><Textarea rows={2} value={form.medications} onChange={(e) => setForm({ ...form, medications: e.target.value })} /></div>
              <div><Label>Condições especiais / observações</Label><Textarea rows={4} value={form.medical_notes} onChange={(e) => setForm({ ...form, medical_notes: e.target.value })} /></div>
              <div className="flex items-center justify-between rounded-xl border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Mostrar no perfil público</p>
                  <p className="text-xs text-muted-foreground">
                    Atalho para alergias, medicamentos e observações. Detalhes finos na aba QR
                    Code.
                  </p>
                </div>
                <Switch checked={form.show_medical_public} onCheckedChange={(v) => setForm({ ...form, show_medical_public: v })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? "Salvando…" : "Salvar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Info label="Alergias" value={pet.allergies} />
        <Info label="Medicamentos" value={pet.medications} />
        <Info label="Condições especiais" value={pet.medical_notes} wide />
      </div>
      {pet.show_medical_public ? (
        <Badge variant="secondary" className="mt-4">Visível no perfil público</Badge>
      ) : (
        <Badge variant="outline" className="mt-4">Privado</Badge>
      )}
    </section>
  );
}

function Info({ label, value, wide }: { label: string; value: string | null; wide?: boolean }) {
  return (
    <div className={`rounded-xl bg-secondary/60 p-3 ${wide ? "md:col-span-1" : ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm whitespace-pre-wrap">{value?.trim() ? value : "—"}</p>
    </div>
  );
}

/* -------------------- Weight -------------------- */

function WeightSection({
  petId,
  currentWeight,
  autoOpen,
  onConsumeAutoOpen,
}: {
  petId: string;
  currentWeight: number | null;
  autoOpen?: boolean;
  onConsumeAutoOpen?: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ weight_kg: "", measured_at: new Date().toISOString().slice(0, 10), notes: "" });

  useEffect(() => {
    if (autoOpen) {
      setOpen(true);
      onConsumeAutoOpen?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  const { data, isLoading } = useQuery({
    queryKey: ["weights", petId],
    queryFn: async () => {
      const { data, error } = await supabase.from("weight_history").select("*").eq("pet_id", petId).order("measured_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const w = Number(form.weight_kg);
      if (!w) throw new Error("Informe o peso.");
      const { error } = await supabase.from("weight_history").insert({
        pet_id: petId, weight_kg: w, measured_at: form.measured_at, notes: form.notes || null,
      });
      if (error) throw error;
      await supabase.from("pets").update({ weight_kg: w }).eq("id", petId);
    },
    onSuccess: () => {
      toast.success("Peso registrado");
      qc.invalidateQueries({ queryKey: ["weights", petId] });
      qc.invalidateQueries({ queryKey: ["pet", petId] });
      // Health Score / weight sparkline (Pet Dashboard tab + Timeline) and the
      // cross-pet Dashboard/Today "stale weight" alert all read this data.
      qc.invalidateQueries({ queryKey: ["health-timeline", petId] });
      qc.invalidateQueries({ queryKey: ["home-agenda"] });
      qc.invalidateQueries({ queryKey: ["pet-profile-meta", petId] });
      setOpen(false);
      setForm({ weight_kg: "", measured_at: new Date().toISOString().slice(0, 10), notes: "" });
    },
    onError: (e: unknown) => toast.error(logAndDescribeError("HealthTab: register weight failed", e, "Não foi possível registrar o peso.")),
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2"><Weight className="h-5 w-5" /> Peso</h3>
          <p className="text-sm text-muted-foreground">
            Atual: {currentWeight ? `${currentWeight} kg` : "—"}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-full"><Plus className="mr-2 h-4 w-4" /> Registrar pesagem</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova pesagem</DialogTitle></DialogHeader>
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Peso (kg) *</Label><Input type="number" step="0.1" value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} /></div>
              <div><Label>Data</Label><Input type="date" value={form.measured_at} onChange={(e) => setForm({ ...form, measured_at: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>Observação</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => add.mutate()} disabled={add.isPending}>{add.isPending ? "Salvando…" : "Salvar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-4">
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : data && data.length > 0 ? (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {data.map((w) => (
              <li key={w.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{w.weight_kg} kg</p>
                  {w.notes ? <p className="text-xs text-muted-foreground">{w.notes}</p> : null}
                </div>
                <span className="text-xs text-muted-foreground">{formatDate(w.measured_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Weight}
            title="Nenhuma pesagem registrada ainda"
            description="Vamos usar o histórico de peso para detectar tendências de saúde a longo prazo."
            action={{ label: "Registrar primeiro peso", icon: Plus, onClick: () => setOpen(true) }}
          />
        )}
      </div>
    </section>
  );
}

/* -------------------- Vaccines -------------------- */

type Vaccine = {
  id: string;
  name: string;
  applied_at: string | null;
  next_dose: string | null;
  vet_name: string | null;
  notes: string | null;
};

function VaccinesSection({
  petId,
  autoOpen,
  onConsumeAutoOpen,
}: {
  petId: string;
  autoOpen?: boolean;
  onConsumeAutoOpen?: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vaccine | null>(null);
  const [toDelete, setToDelete] = useState<Vaccine | null>(null);
  const [form, setForm] = useState({ name: "", applied_at: "", next_dose: "", vet_name: "", notes: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["vaccines", petId],
    queryFn: async () => {
      const { data, error } = await supabase.from("vaccines").select("*").eq("pet_id", petId).order("applied_at", { ascending: false });
      if (error) throw error;
      return data as Vaccine[];
    },
  });

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", applied_at: new Date().toISOString().slice(0, 10), next_dose: "", vet_name: "", notes: "" });
    setOpen(true);
  };

  useEffect(() => {
    if (autoOpen) {
      openNew();
      onConsumeAutoOpen?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  const openEdit = (v: Vaccine) => {
    setEditing(v);
    setForm({
      name: v.name,
      applied_at: v.applied_at ?? "",
      next_dose: v.next_dose ?? "",
      vet_name: v.vet_name ?? "",
      notes: v.notes ?? "",
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Informe o nome da vacina.");
      const payload = {
        pet_id: petId,
        name: form.name.trim(),
        applied_at: form.applied_at || null,
        next_dose: form.next_dose || null,
        vet_name: form.vet_name || null,
        notes: form.notes || null,
      };
      const { error } = editing
        ? await supabase.from("vaccines").update(payload).eq("id", editing.id)
        : await supabase.from("vaccines").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editing ? "Vacina atualizada" : "Vacina adicionada");
      qc.invalidateQueries({ queryKey: ["vaccines", petId] });
      // Was ["timeline", petId] — useHealthTimeline actually caches under
      // ["health-timeline", petId], so this invalidation was a no-op and the
      // Timeline tab / Health Score kept showing the vaccine list from before
      // the edit until the 60s staleTime window expired.
      qc.invalidateQueries({ queryKey: ["health-timeline", petId] });
      qc.invalidateQueries({ queryKey: ["pet-indicators", petId] });
      qc.invalidateQueries({ queryKey: ["pet-profile-meta", petId] });
      qc.invalidateQueries({ queryKey: ["home-agenda"] });
      setOpen(false);
    },
    onError: (e: unknown) => toast.error(logAndDescribeError("HealthTab: save vaccine failed", e, "Não foi possível salvar a vacina.")),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vaccines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vacina removida");
      qc.invalidateQueries({ queryKey: ["vaccines", petId] });
      qc.invalidateQueries({ queryKey: ["health-timeline", petId] });
      qc.invalidateQueries({ queryKey: ["pet-indicators", petId] });
      qc.invalidateQueries({ queryKey: ["pet-profile-meta", petId] });
      qc.invalidateQueries({ queryKey: ["home-agenda"] });
      setToDelete(null);
    },
    onError: (e: unknown) => toast.error(logAndDescribeError("HealthTab: remove vaccine failed", e, "Não foi possível remover a vacina.")),
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2"><Syringe className="h-5 w-5" /> Carteira de vacinação</h3>
          <p className="text-sm text-muted-foreground">Registro de vacinas aplicadas e próximas doses.</p>
        </div>
        <Button size="sm" className="rounded-full" onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Adicionar vacina
        </Button>
      </div>

      <div className="mt-4">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : data && data.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Vacina</th>
                  <th className="px-3 py-2 text-left">Aplicação</th>
                  <th className="px-3 py-2 text-left">Próxima dose</th>
                  <th className="px-3 py-2 text-left">Veterinário</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.map((v) => (
                  <tr key={v.id}>
                    <td className="px-3 py-2 font-medium">{v.name}</td>
                    <td className="px-3 py-2">{formatDate(v.applied_at)}</td>
                    <td className="px-3 py-2">{v.next_dose ? <Badge variant="outline">{formatDate(v.next_dose)}</Badge> : "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{v.vet_name ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(v)} aria-label={`Editar vacina ${v.name}`}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setToDelete(v)} aria-label={`Excluir vacina ${v.name}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Syringe}
            title="Nenhuma vacina registrada ainda"
            description="Manter as vacinas em dia ajuda a prevenir doenças graves — e o assistente avisa antes do vencimento."
            action={{ label: "Adicionar vacina", icon: Plus, onClick: openNew }}
          />
        )}
      </div>

      {/* Timeline mini */}
      {data && data.length > 0 && (
        <div className="mt-6">
          <p className="mb-3 text-xs font-medium uppercase text-muted-foreground">Timeline</p>
          <ol className="relative border-l border-border pl-4">
            {data.map((v) => (
              <li key={v.id} className="mb-4">
                <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary" />
                <p className="text-sm font-medium">{v.name}</p>
                <p className="text-xs text-muted-foreground">{formatDate(v.applied_at)}{v.vet_name ? ` • ${v.vet_name}` : ""}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar vacina" : "Nova vacina"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2"><Label>Nome da vacina *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: V10, Antirrábica" /></div>
            <div><Label>Data de aplicação</Label><Input type="date" value={form.applied_at} onChange={(e) => setForm({ ...form, applied_at: e.target.value })} /></div>
            <div><Label>Próxima dose</Label><Input type="date" value={form.next_dose} onChange={(e) => setForm({ ...form, next_dose: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Veterinário / clínica</Label><Input value={form.vet_name} onChange={(e) => setForm({ ...form, vet_name: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Observações</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir vacina?"
        description={toDelete ? `Remover o registro de "${toDelete.name}"?` : ""}
        destructive
        confirmLabel="Excluir"
        onConfirm={() => { if (toDelete) remove.mutate(toDelete.id); }}
      />
    </section>
  );
}