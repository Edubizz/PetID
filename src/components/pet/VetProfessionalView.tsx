import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  Calendar, FileText, Mail, Pencil, Phone, Plus, Stethoscope, Syringe, Trash2, Weight,
} from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { computeAge, formatDate, formatDateTime } from "@/lib/pet-utils";
import { logAndDescribeError } from "@/lib/errors";
import {
  canVetAccess,
  parseVetPermissions,
  vetAccessTypeLabel,
  type VetAccessLevel,
  type VetClinicalPet,
  type VetGrantPermissions,
} from "@/lib/vet-access";

function Section({
  title,
  icon: Icon,
  editable,
  action,
  children,
}: {
  title: string;
  icon: typeof Stethoscope;
  editable?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Icon className="h-4 w-4 text-primary" />
          {title}
          {editable ? (
            <Badge variant="secondary" className="font-normal">
              Pode editar
            </Badge>
          ) : null}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value?: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium">{value}</dd>
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value?: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{value}</p>
    </div>
  );
}

export function VetProfessionalView({ petId }: { petId: string }) {
  const qc = useQueryClient();

  const petQuery = useQuery({
    queryKey: ["vet-clinical-pet", petId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_vet_clinical_pet", { _pet_id: petId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return {
        ...row,
        permissions: parseVetPermissions(row.permissions),
      } as VetClinicalPet;
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const perms: VetGrantPermissions | null = petQuery.data?.permissions ?? null;
  const level = (area: keyof VetGrantPermissions): VetAccessLevel =>
    perms?.[area] ?? "none";

  const vaccinesQuery = useQuery({
    queryKey: ["vet-vaccines", petId],
    enabled: canVetAccess(level("vaccines"), "view"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vaccines")
        .select("id, name, applied_at, next_dose, vet_name, notes")
        .eq("pet_id", petId)
        .order("applied_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const weightQuery = useQuery({
    queryKey: ["vet-weight", petId],
    enabled: canVetAccess(level("weight"), "view"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weight_history")
        .select("id, weight_kg, measured_at, notes")
        .eq("pet_id", petId)
        .order("measured_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const appointmentsQuery = useQuery({
    queryKey: ["vet-appointments", petId],
    enabled: canVetAccess(level("appointments"), "view"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, scheduled_at, reason, vet_name, clinic, notes")
        .eq("pet_id", petId)
        .order("scheduled_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const documentsQuery = useQuery({
    queryKey: ["vet-documents", petId],
    enabled: canVetAccess(level("documents"), "view"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, title, url, category, created_at")
        .eq("pet_id", petId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (petQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (petQuery.isError) {
    return (
      <EmptyState
        icon={Stethoscope}
        title="Não foi possível carregar"
        description="Tente novamente em instantes. Se o problema continuar, peça um novo link ao tutor."
      />
    );
  }

  const pet = petQuery.data;
  if (!pet || !perms) {
    return (
      <EmptyState
        icon={Stethoscope}
        title="Acesso indisponível"
        description="Este pet não está acessível com seu vínculo atual. O acesso pode ter expirado ou sido revogado."
      />
    );
  }

  const showIdentity = canVetAccess(perms.identity, "view");
  const showOwner = canVetAccess(perms.owner_contact, "view");
  const showEmergency = canVetAccess(perms.emergency_contact, "view");
  const showHealthText =
    canVetAccess(perms.allergies, "view") ||
    canVetAccess(perms.medications, "view") ||
    canVetAccess(perms.medical_notes, "view");

  const displayName = pet.name?.trim() || "Pet";

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] sm:p-5">
        <div className="flex gap-4">
          {showIdentity && pet.photo_url ? (
            <img
              src={pet.photo_url}
              alt={displayName}
              className="h-20 w-20 shrink-0 rounded-2xl object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-secondary text-2xl font-semibold text-muted-foreground">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{displayName}</h1>
              <Badge variant="secondary">Visão profissional</Badge>
            </div>
            {showIdentity ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {[pet.species, pet.breed].filter(Boolean).join(" · ") || "Espécie não informada"}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Identificação não liberada pelo tutor
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="outline">{vetAccessTypeLabel(pet.access_type)}</Badge>
              {pet.expires_at ? (
                <Badge variant="outline">Até {formatDateTime(pet.expires_at)}</Badge>
              ) : (
                <Badge variant="outline">Sem expiração</Badge>
              )}
            </div>
          </div>
        </div>
      </header>

      {showIdentity ? (
        <Section title="Identidade" icon={Stethoscope}>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Fact label="Sexo" value={pet.sex} />
            <Fact label="Idade" value={pet.birth_date ? computeAge(pet.birth_date) : null} />
            {canVetAccess(perms.weight, "view") ? (
              <Fact label="Peso" value={pet.weight_kg != null ? `${pet.weight_kg} kg` : null} />
            ) : null}
            <Fact label="Cor" value={pet.color} />
            <Fact label="Microchip" value={pet.microchip} />
            <Fact label="Nascimento" value={pet.birth_date ? formatDate(pet.birth_date) : null} />
          </dl>
        </Section>
      ) : null}

      {(showOwner || showEmergency) ? (
        <Section title="Contatos" icon={Phone}>
          {showOwner ? (
            <dl className="mb-3 grid gap-3 sm:grid-cols-2">
              <Fact label="Tutor" value={pet.owner_name} />
              <Fact label="Relação" value={pet.owner_relationship} />
              <Fact label="Telefone" value={pet.owner_phone} />
              <Fact label="WhatsApp" value={pet.owner_whatsapp} />
              <Fact label="Email" value={pet.owner_email} />
            </dl>
          ) : null}
          {showEmergency ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              <Fact label="Contato emergencial" value={pet.secondary_contact_name} />
              <Fact label="Telefone emergencial" value={pet.secondary_contact_phone} />
            </dl>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {showOwner && (pet.owner_whatsapp || pet.owner_phone) ? (
              <a
                className="inline-flex h-10 items-center rounded-full border border-border px-3 text-sm font-medium"
                href={`tel:${(pet.owner_whatsapp || pet.owner_phone || "").replace(/\D/g, "")}`}
              >
                <Phone className="mr-1.5 h-4 w-4" /> Ligar tutor
              </a>
            ) : null}
            {showOwner && pet.owner_email ? (
              <a
                className="inline-flex h-10 items-center rounded-full border border-border px-3 text-sm font-medium"
                href={`mailto:${pet.owner_email}`}
              >
                <Mail className="mr-1.5 h-4 w-4" /> Email
              </a>
            ) : null}
            {showEmergency && pet.secondary_contact_phone ? (
              <a
                className="inline-flex h-10 items-center rounded-full border border-border px-3 text-sm font-medium"
                href={`tel:${pet.secondary_contact_phone.replace(/\D/g, "")}`}
              >
                <Phone className="mr-1.5 h-4 w-4" /> Emergência
              </a>
            ) : null}
          </div>
          {showEmergency ? (
            <div className="mt-3">
              <TextBlock label="Instruções de emergência" value={pet.emergency_instructions} />
            </div>
          ) : null}
        </Section>
      ) : null}

      {showHealthText ? (
        <HealthTextSection
          petId={petId}
          pet={pet}
          perms={perms}
          onSaved={() => qc.invalidateQueries({ queryKey: ["vet-clinical-pet", petId] })}
        />
      ) : null}

      {canVetAccess(perms.vaccines, "view") ? (
        <VaccinesVetSection
          petId={petId}
          canEdit={canVetAccess(perms.vaccines, "edit")}
          rows={vaccinesQuery.data ?? []}
          loading={vaccinesQuery.isLoading}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ["vet-vaccines", petId] });
          }}
        />
      ) : null}

      {canVetAccess(perms.weight, "view") ? (
        <WeightVetSection
          petId={petId}
          canEdit={canVetAccess(perms.weight, "edit")}
          rows={weightQuery.data ?? []}
          loading={weightQuery.isLoading}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ["vet-weight", petId] });
            qc.invalidateQueries({ queryKey: ["vet-clinical-pet", petId] });
          }}
        />
      ) : null}

      {canVetAccess(perms.appointments, "view") ? (
        <AppointmentsVetSection
          petId={petId}
          canEdit={canVetAccess(perms.appointments, "edit")}
          rows={appointmentsQuery.data ?? []}
          loading={appointmentsQuery.isLoading}
          onChanged={() => qc.invalidateQueries({ queryKey: ["vet-appointments", petId] })}
        />
      ) : null}

      {canVetAccess(perms.documents, "view") ? (
        <DocumentsVetSection
          petId={petId}
          canEdit={canVetAccess(perms.documents, "edit")}
          rows={documentsQuery.data ?? []}
          loading={documentsQuery.isLoading}
          onChanged={() => qc.invalidateQueries({ queryKey: ["vet-documents", petId] })}
        />
      ) : null}

      <p className="px-1 pb-2 text-center text-xs text-muted-foreground">
        Acesso autorizado pelo tutor · permissões atuais aplicadas no servidor · PetID
      </p>
    </div>
  );
}

function HealthTextSection({
  petId,
  pet,
  perms,
  onSaved,
}: {
  petId: string;
  pet: VetClinicalPet;
  perms: VetGrantPermissions;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    allergies: pet.allergies ?? "",
    medications: pet.medications ?? "",
    medical_notes: pet.medical_notes ?? "",
  });

  const canEditAny =
    canVetAccess(perms.allergies, "edit") ||
    canVetAccess(perms.medications, "edit") ||
    canVetAccess(perms.medical_notes, "edit");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("update_vet_pet_health_fields", {
        _pet_id: petId,
        _allergies: form.allergies,
        _set_allergies: canVetAccess(perms.allergies, "edit"),
        _medications: form.medications,
        _set_medications: canVetAccess(perms.medications, "edit"),
        _medical_notes: form.medical_notes,
        _set_medical_notes: canVetAccess(perms.medical_notes, "edit"),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Informações de saúde atualizadas");
      setOpen(false);
      onSaved();
    },
    onError: (e: Error) =>
      toast.error(logAndDescribeError("update_vet_health", e, "Falha ao salvar.")),
  });

  return (
    <Section
      title="Saúde clínica"
      icon={Syringe}
      editable={canEditAny}
      action={
        canEditAny ? (
          <Button
            size="sm"
            className="rounded-full"
            onClick={() => {
              setForm({
                allergies: pet.allergies ?? "",
                medications: pet.medications ?? "",
                medical_notes: pet.medical_notes ?? "",
              });
              setOpen(true);
            }}
          >
            <Pencil className="mr-1.5 h-4 w-4" /> Editar
          </Button>
        ) : null
      }
    >
      <div className="space-y-3">
        {canVetAccess(perms.allergies, "view") ? (
          <TextBlock label="Alergias" value={pet.allergies} />
        ) : null}
        {canVetAccess(perms.medications, "view") ? (
          <TextBlock label="Medicamentos" value={pet.medications} />
        ) : null}
        {canVetAccess(perms.medical_notes, "view") ? (
          <TextBlock label="Observações importantes" value={pet.medical_notes} />
        ) : null}
        {!pet.allergies?.trim() &&
        !pet.medications?.trim() &&
        !pet.medical_notes?.trim() ? (
          <p className="text-sm text-muted-foreground">Nenhuma informação clínica textual.</p>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar saúde clínica</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {canVetAccess(perms.allergies, "edit") ? (
              <div>
                <Label>Alergias</Label>
                <Textarea
                  rows={2}
                  value={form.allergies}
                  onChange={(e) => setForm({ ...form, allergies: e.target.value })}
                />
              </div>
            ) : null}
            {canVetAccess(perms.medications, "edit") ? (
              <div>
                <Label>Medicamentos</Label>
                <Textarea
                  rows={2}
                  value={form.medications}
                  onChange={(e) => setForm({ ...form, medications: e.target.value })}
                />
              </div>
            ) : null}
            {canVetAccess(perms.medical_notes, "edit") ? (
              <div>
                <Label>Observações importantes</Label>
                <Textarea
                  rows={3}
                  value={form.medical_notes}
                  onChange={(e) => setForm({ ...form, medical_notes: e.target.value })}
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function VaccinesVetSection({
  petId,
  canEdit,
  rows,
  loading,
  onChanged,
}: {
  petId: string;
  canEdit: boolean;
  rows: { id: string; name: string; applied_at: string | null; next_dose: string | null; vet_name: string | null; notes: string | null }[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<(typeof rows)[0] | null>(null);
  const [toDelete, setToDelete] = useState<(typeof rows)[0] | null>(null);
  const [form, setForm] = useState({ name: "", applied_at: "", next_dose: "", vet_name: "", notes: "" });

  const openNew = () => {
    setEditing(null);
    setForm({
      name: "",
      applied_at: new Date().toISOString().slice(0, 10),
      next_dose: "",
      vet_name: "",
      notes: "",
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
      setOpen(false);
      onChanged();
    },
    onError: (e: Error) =>
      toast.error(logAndDescribeError("vet_vaccine", e, "Falha ao salvar vacina.")),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vaccines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vacina removida");
      setToDelete(null);
      onChanged();
    },
    onError: (e: Error) =>
      toast.error(logAndDescribeError("vet_vaccine_del", e, "Falha ao remover.")),
  });

  return (
    <Section
      title="Vacinas"
      icon={Syringe}
      editable={canEdit}
      action={
        canEdit ? (
          <Button size="sm" className="rounded-full" onClick={openNew}>
            <Plus className="mr-1.5 h-4 w-4" /> Adicionar vacina
          </Button>
        ) : null
      }
    >
      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma vacina registrada.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((v) => (
            <li key={v.id} className="rounded-xl border border-border px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{v.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      v.applied_at ? `Aplicada ${formatDate(v.applied_at)}` : null,
                      v.next_dose ? `Próxima ${formatDate(v.next_dose)}` : null,
                      v.vet_name,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {canEdit ? (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      aria-label="Editar vacina"
                      onClick={() => {
                        setEditing(v);
                        setForm({
                          name: v.name,
                          applied_at: v.applied_at ?? "",
                          next_dose: v.next_dose ?? "",
                          vet_name: v.vet_name ?? "",
                          notes: v.notes ?? "",
                        });
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      aria-label="Remover vacina"
                      onClick={() => setToDelete(v)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar vacina" : "Nova vacina"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Aplicada em</Label>
              <Input
                type="date"
                value={form.applied_at}
                onChange={(e) => setForm({ ...form, applied_at: e.target.value })}
              />
            </div>
            <div>
              <Label>Próxima dose</Label>
              <Input
                type="date"
                value={form.next_dose}
                onChange={(e) => setForm({ ...form, next_dose: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Veterinário</Label>
              <Input
                value={form.vet_name}
                onChange={(e) => setForm({ ...form, vet_name: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Notas</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="Remover vacina?"
        description={toDelete ? `Remover ${toDelete.name}?` : undefined}
        confirmLabel="Remover"
        destructive
        onConfirm={() => {
          if (toDelete) remove.mutate(toDelete.id);
        }}
      />
    </Section>
  );
}

function WeightVetSection({
  petId,
  canEdit,
  rows,
  loading,
  onChanged,
}: {
  petId: string;
  canEdit: boolean;
  rows: { id: string; weight_kg: number; measured_at: string; notes: string | null }[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    weight_kg: "",
    measured_at: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const add = useMutation({
    mutationFn: async () => {
      const w = Number(form.weight_kg);
      if (!w) throw new Error("Informe o peso.");
      const { error } = await supabase.rpc("vet_add_weight", {
        _pet_id: petId,
        _weight_kg: w,
        _measured_at: form.measured_at || undefined,
        _notes: form.notes || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Peso registrado");
      setOpen(false);
      setForm({
        weight_kg: "",
        measured_at: new Date().toISOString().slice(0, 10),
        notes: "",
      });
      onChanged();
    },
    onError: (e: Error) =>
      toast.error(logAndDescribeError("vet_weight", e, "Falha ao registrar peso.")),
  });

  return (
    <Section
      title="Histórico de peso"
      icon={Weight}
      editable={canEdit}
      action={
        canEdit ? (
          <Button size="sm" className="rounded-full" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Registrar peso
          </Button>
        ) : null
      }
    >
      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem registros de peso.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((w) => (
            <li
              key={w.id}
              className="flex items-baseline justify-between gap-3 rounded-xl border border-border px-3 py-2"
            >
              <span className="text-sm font-medium">{w.weight_kg} kg</span>
              <span className="text-xs text-muted-foreground">{formatDate(w.measured_at)}</span>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar peso</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Peso (kg) *</Label>
              <Input
                type="number"
                step="0.1"
                value={form.weight_kg}
                onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
              />
            </div>
            <div>
              <Label>Data</Label>
              <Input
                type="date"
                value={form.measured_at}
                onChange={(e) => setForm({ ...form, measured_at: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Observação</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => add.mutate()} disabled={add.isPending}>
              {add.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function AppointmentsVetSection({
  petId,
  canEdit,
  rows,
  loading,
  onChanged,
}: {
  petId: string;
  canEdit: boolean;
  rows: {
    id: string;
    scheduled_at: string;
    reason: string | null;
    vet_name: string | null;
    clinic: string | null;
    notes: string | null;
  }[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    reason: "",
    scheduled_at: "",
    vet_name: "",
    clinic: "",
    notes: "",
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!form.scheduled_at) throw new Error("Informe data e horário.");
      const { error } = await supabase.from("appointments").insert({
        pet_id: petId,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        reason: form.reason.trim() || null,
        vet_name: form.vet_name.trim() || null,
        clinic: form.clinic.trim() || null,
        notes: form.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Consulta registrada");
      setOpen(false);
      onChanged();
    },
    onError: (e: Error) =>
      toast.error(logAndDescribeError("vet_appt", e, "Falha ao salvar consulta.")),
  });

  return (
    <Section
      title="Consultas"
      icon={Calendar}
      editable={canEdit}
      action={
        canEdit ? (
          <Button
            size="sm"
            className="rounded-full"
            onClick={() => {
              setForm({
                reason: "",
                scheduled_at: new Date().toISOString().slice(0, 16),
                vet_name: "",
                clinic: "",
                notes: "",
              });
              setOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Adicionar consulta
          </Button>
        ) : null
      }
    >
      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma consulta registrada.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((a) => (
            <li key={a.id} className="rounded-xl border border-border px-3 py-2.5">
              <p className="text-sm font-medium">{a.reason?.trim() || "Consulta"}</p>
              <p className="text-xs text-muted-foreground">
                {[formatDateTime(a.scheduled_at), a.vet_name, a.clinic].filter(Boolean).join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova consulta</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Motivo</Label>
              <Input
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Check-up, retorno…"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Data e hora *</Label>
              <Input
                type="datetime-local"
                value={form.scheduled_at}
                onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
              />
            </div>
            <div>
              <Label>Veterinário</Label>
              <Input
                value={form.vet_name}
                onChange={(e) => setForm({ ...form, vet_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Clínica</Label>
              <Input
                value={form.clinic}
                onChange={(e) => setForm({ ...form, clinic: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Notas</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => add.mutate()} disabled={add.isPending}>
              {add.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function DocumentsVetSection({
  petId,
  canEdit,
  rows,
  loading,
  onChanged,
}: {
  petId: string;
  canEdit: boolean;
  rows: { id: string; title: string; url: string | null; category: string | null; created_at: string }[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<(typeof rows)[0] | null>(null);
  const [form, setForm] = useState({ title: "", category: "Exame", url: "" });

  const add = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Informe o título.");
      const { error } = await supabase.from("documents").insert({
        pet_id: petId,
        title: form.title.trim(),
        category: form.category || null,
        url: form.url.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento adicionado");
      setOpen(false);
      setForm({ title: "", category: "Exame", url: "" });
      onChanged();
    },
    onError: (e: Error) =>
      toast.error(logAndDescribeError("vet_doc", e, "Falha ao salvar documento.")),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento removido");
      setToDelete(null);
      onChanged();
    },
    onError: (e: Error) =>
      toast.error(logAndDescribeError("vet_doc_del", e, "Falha ao remover.")),
  });

  return (
    <Section
      title="Documentos"
      icon={FileText}
      editable={canEdit}
      action={
        canEdit ? (
          <Button size="sm" className="rounded-full" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Adicionar
          </Button>
        ) : null
      }
    >
      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum documento disponível.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5"
            >
              {d.url ? (
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 truncate text-sm font-medium hover:underline"
                >
                  {d.title}
                </a>
              ) : (
                <span className="min-w-0 truncate text-sm font-medium">{d.title}</span>
              )}
              <div className="flex shrink-0 items-center gap-1">
                <span className="text-xs text-muted-foreground">
                  {d.category || formatDate(d.created_at)}
                </span>
                {canEdit ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    aria-label="Remover documento"
                    onClick={() => setToDelete(d)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo documento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Título *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <Label>Categoria</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </div>
            <div>
              <Label>URL (link)</Label>
              <Input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => add.mutate()} disabled={add.isPending}>
              {add.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="Remover documento?"
        description={toDelete ? `Remover ${toDelete.title}?` : undefined}
        confirmLabel="Remover"
        destructive
        onConfirm={() => {
          if (toDelete) remove.mutate(toDelete.id);
        }}
      />
    </Section>
  );
}
