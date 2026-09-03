import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Check, Copy, Link2, Plus, Stethoscope, Ban, Pencil, Lock } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "./ConfirmDialog";
import { VetPermissionsEditor, emptyVetPermissionsForm } from "./VetPermissionsEditor";
import { formatDateTime } from "@/lib/pet-utils";
import { logAndDescribeError } from "@/lib/errors";
import {
  TEMP_DURATION_PRESETS,
  buildVetInviteUrl,
  computeVetAccessStatus,
  parseVetPermissions,
  summarizeVetPermissions,
  vetAccessStatusLabel,
  vetAccessTypeLabel,
  type CreateVetAccessResult,
  type PetVetAccessRow,
  type VetAccessStatus,
  type VetAccessType,
  type VetGrantPermissions,
} from "@/lib/vet-access";
import { useEntitlements } from "@/hooks/useEntitlements";
import { UpgradeCard } from "@/components/billing/UpgradeCard";
import { planUnlockLabel } from "@/lib/entitlements";

type FormState = {
  vet_name: string;
  clinic: string;
  access_type: VetAccessType;
  durationPreset: string;
  customHours: string;
  permissions: VetGrantPermissions;
};

const EMPTY: FormState = {
  vet_name: "",
  clinic: "",
  access_type: "temporary",
  durationPreset: "24",
  customHours: "",
  permissions: emptyVetPermissionsForm(),
};

function statusVariant(status: VetAccessStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active") return "default";
  if (status === "pending") return "secondary";
  if (status === "revoked" || status === "expired" || status === "invite_expired") return "destructive";
  return "outline";
}

export function VeterinariansTab({ petId }: { petId: string }) {
  const qc = useQueryClient();
  const { canUseVetAccess } = useEntitlements();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [created, setCreated] = useState<CreateVetAccessResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [toRevoke, setToRevoke] = useState<PetVetAccessRow | null>(null);
  const [editingPerms, setEditingPerms] = useState<PetVetAccessRow | null>(null);
  const [permDraft, setPermDraft] = useState<VetGrantPermissions>(emptyVetPermissionsForm());

  const { data, isLoading } = useQuery({
    queryKey: ["pet-vet-access", petId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pet_vet_access")
        .select("*")
        .eq("pet_id", petId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as PetVetAccessRow[]).map((row) => ({
        ...row,
        permissions: parseVetPermissions(row.permissions),
      }));
    },
  });

  const openNew = () => {
    if (!canUseVetAccess) {
      toast.error(planUnlockLabel("vet_access"));
      return;
    }
    setForm(EMPTY);
    setCreated(null);
    setCopied(false);
    setOpen(true);
  };

  const openEditPerms = (row: PetVetAccessRow) => {
    setEditingPerms(row);
    setPermDraft(parseVetPermissions(row.permissions));
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!form.vet_name.trim()) throw new Error("Informe o nome do veterinário.");

      let durationHours: number | undefined;
      let expiresAt: string | undefined;

      if (form.access_type === "temporary") {
        if (form.durationPreset === "custom") {
          const hours = Number(form.customHours);
          if (!Number.isFinite(hours) || hours < 1) {
            throw new Error("Informe a duração personalizada em horas (mínimo 1).");
          }
          durationHours = Math.floor(hours);
        } else {
          durationHours = Number(form.durationPreset);
        }
      }

      const { data, error } = await supabase.rpc("create_vet_access", {
        _pet_id: petId,
        _vet_name: form.vet_name.trim(),
        _clinic: form.clinic.trim() || undefined,
        _access_type: form.access_type,
        _duration_hours: durationHours ?? 24,
        _expires_at: expiresAt,
        _permission: "view",
        _permissions: form.permissions,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.access_token) throw new Error("Não foi possível gerar o convite.");
      return {
        ...row,
        permissions: parseVetPermissions(row.permissions),
      } as CreateVetAccessResult;
    },
    onSuccess: (row) => {
      setCreated(row);
      qc.invalidateQueries({ queryKey: ["pet-vet-access", petId] });
      toast.success("Acesso veterinário criado");
    },
    onError: (e: Error) =>
      toast.error(
        logAndDescribeError("create_vet_access", e, "Não foi possível criar o acesso."),
      ),
  });

  const savePerms = useMutation({
    mutationFn: async () => {
      if (!editingPerms) throw new Error("Acesso inválido.");
      const { data, error } = await supabase.rpc("update_vet_access_permissions", {
        _access_id: editingPerms.id,
        _permissions: permDraft,
      });
      if (error) throw error;
      return parseVetPermissions(data);
    },
    onSuccess: () => {
      toast.success("Permissões atualizadas");
      qc.invalidateQueries({ queryKey: ["pet-vet-access", petId] });
      setEditingPerms(null);
    },
    onError: (e: Error) =>
      toast.error(
        logAndDescribeError("update_vet_access_permissions", e, "Não foi possível salvar."),
      ),
  });

  const revoke = useMutation({
    mutationFn: async (accessId: string) => {
      const { error } = await supabase.rpc("revoke_vet_access", { _access_id: accessId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Acesso revogado");
      qc.invalidateQueries({ queryKey: ["pet-vet-access", petId] });
      setToRevoke(null);
    },
    onError: (e: Error) =>
      toast.error(
        logAndDescribeError("revoke_vet_access", e, "Não foi possível revogar o acesso."),
      ),
  });

  const inviteUrl = useMemo(
    () => (created ? buildVetInviteUrl(created.access_token) : ""),
    [created],
  );

  const copyLink = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast.success("Link copiado");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar o link");
    }
  };

  if (!canUseVetAccess) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Lock className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Stethoscope className="h-5 w-5 text-primary" />
              Veterinários
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {planUnlockLabel("vet_access")}
            </p>
            <div className="mt-4">
              <UpgradeCard
                compact
                title="Desbloqueie acesso veterinário"
                description="Convide profissionais com permissões controladas nos planos Guardião e Família."
              />
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Stethoscope className="h-5 w-5 text-primary" />
            Veterinários
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Autorize profissionais a ver ou editar informações clínicas deste pet — sem acesso à
            sua conta PetID nem a outros pets.
          </p>
        </div>
        <Button size="sm" className="h-11 shrink-0 rounded-full" onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Adicionar veterinário
        </Button>
      </div>

      <div className="mt-5">
        {isLoading ? (
          <div className="grid gap-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : data && data.length > 0 ? (
          <ul className="space-y-3">
            {data.map((row, index) => {
              const status = computeVetAccessStatus(row);
              const canRevoke = status === "active" || status === "pending";
              const canEditPerms = status === "active" || status === "pending";
              const summary = summarizeVetPermissions(parseVetPermissions(row.permissions));
              return (
                <li
                  key={row.id}
                  className="animate-in fade-in slide-in-from-bottom-1 rounded-xl border border-border p-4 fill-mode-both duration-300"
                  style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{row.vet_name}</p>
                          <Badge variant={statusVariant(status)}>{vetAccessStatusLabel(status)}</Badge>
                          <Badge variant="outline">{vetAccessTypeLabel(row.access_type)}</Badge>
                        </div>
                        {row.clinic ? (
                          <p className="text-sm text-muted-foreground">{row.clinic}</p>
                        ) : null}
                        <div className="space-y-0.5 text-xs text-muted-foreground">
                          <p>Código: {row.token_prefix}…</p>
                          {row.access_type === "temporary" && row.expires_at ? (
                            <p>Expira em {formatDateTime(row.expires_at)}</p>
                          ) : (
                            <p>Permanente até revogação</p>
                          )}
                          {status === "pending" ? (
                            <p>Convite válido até {formatDateTime(row.invite_expires_at)}</p>
                          ) : null}
                          {row.redeemed_at ? (
                            <p>Ativado em {formatDateTime(row.redeemed_at)}</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {canEditPerms ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-10"
                            onClick={() => openEditPerms(row)}
                          >
                            <Pencil className="mr-1.5 h-4 w-4" />
                            Editar permissões
                          </Button>
                        ) : null}
                        {canRevoke ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-10 text-destructive hover:text-destructive"
                            onClick={() => setToRevoke(row)}
                          >
                            <Ban className="mr-1.5 h-4 w-4" />
                            Revogar acesso
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {summary.length > 0 ? (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Permissões</p>
                        <ul className="mt-1 flex flex-wrap gap-1.5">
                          {summary.map((s) => (
                            <Badge key={s.area} variant="secondary" className="font-normal">
                              {s.area} — {s.level}
                            </Badge>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Nenhuma área liberada.</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={Stethoscope}
            title="Nenhum veterinário autorizado"
            description="Gere um link seguro e escolha o que o profissional pode ver ou editar neste pet."
          />
        )}
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setCreated(null);
            setCopied(false);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{created ? "Link de acesso gerado" : "Adicionar veterinário"}</DialogTitle>
          </DialogHeader>

          {created ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Envie este link ao veterinário. Por segurança, o código completo só aparece agora.
              </p>
              <div className="rounded-xl border border-border bg-secondary/40 p-3">
                <p className="break-all text-sm font-medium">{inviteUrl}</p>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Tipo: {vetAccessTypeLabel(created.access_type)}</p>
                {created.expires_at ? (
                  <p>Acesso válido até {formatDateTime(created.expires_at)}</p>
                ) : (
                  <p>Acesso permanente · convite válido até {formatDateTime(created.invite_expires_at)}</p>
                )}
              </div>
              <DialogFooter className="flex-col gap-2 sm:flex-col">
                <Button className="w-full" onClick={copyLink}>
                  {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  {copied ? "Copiado" : "Copiar link"}
                </Button>
                <Button variant="outline" className="w-full" onClick={() => setOpen(false)}>
                  Fechar
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <div>
                <Label htmlFor="vet_name">Nome do veterinário *</Label>
                <Input
                  id="vet_name"
                  value={form.vet_name}
                  onChange={(e) => setForm({ ...form, vet_name: e.target.value })}
                  placeholder="Dra. Ana Silva"
                  required
                />
              </div>
              <div>
                <Label htmlFor="clinic">Clínica (opcional)</Label>
                <Input
                  id="clinic"
                  value={form.clinic}
                  onChange={(e) => setForm({ ...form, clinic: e.target.value })}
                  placeholder="Clínica Vet Vida"
                />
              </div>
              <div>
                <Label>Tipo de acesso</Label>
                <Select
                  value={form.access_type}
                  onValueChange={(v) => setForm({ ...form, access_type: v as VetAccessType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="temporary">Temporário</SelectItem>
                    <SelectItem value="permanent">Permanente (até revogar)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.access_type === "temporary" ? (
                <div className="space-y-3">
                  <div>
                    <Label>Validade</Label>
                    <Select
                      value={form.durationPreset}
                      onValueChange={(v) => setForm({ ...form, durationPreset: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TEMP_DURATION_PRESETS.map((p) => (
                          <SelectItem key={p.hours} value={String(p.hours)}>
                            {p.label}
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">Personalizado (horas)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.durationPreset === "custom" ? (
                    <div>
                      <Label htmlFor="customHours">Horas</Label>
                      <Input
                        id="customHours"
                        type="number"
                        min={1}
                        max={8760}
                        value={form.customHours}
                        onChange={(e) => setForm({ ...form, customHours: e.target.value })}
                        placeholder="Ex.: 48"
                        required
                      />
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                  O link permanente é válido por 14 dias. Depois de ativado, permanece até você
                  revogar.
                </p>
              )}

              <div>
                <Label className="mb-2 block">Permissões</Label>
                <VetPermissionsEditor
                  value={form.permissions}
                  onChange={(permissions) => setForm({ ...form, permissions })}
                />
              </div>

              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                O profissional precisa entrar na conta PetID para ativar. Contatos do tutor começam
                ocultos. O acesso não transfere a titularidade dos dados; o PetID não presta o
                atendimento clínico — apenas intermedia o acesso que você autorizar e pode revogar.
              </p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? "Gerando…" : "Gerar acesso"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingPerms} onOpenChange={(v) => !v && setEditingPerms(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar permissões</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {editingPerms?.vet_name}
            {editingPerms?.clinic ? ` · ${editingPerms.clinic}` : ""}
          </p>
          <VetPermissionsEditor value={permDraft} onChange={setPermDraft} />
          <p className="text-xs text-muted-foreground">
            As alterações valem imediatamente — sem novo convite.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditingPerms(null)}>
              Cancelar
            </Button>
            <Button onClick={() => savePerms.mutate()} disabled={savePerms.isPending}>
              {savePerms.isPending ? "Salvando…" : "Salvar permissões"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!toRevoke}
        onOpenChange={(v) => !v && setToRevoke(null)}
        title="Revogar acesso?"
        description={
          toRevoke
            ? `${toRevoke.vet_name} perderá imediatamente o acesso clínico a este pet.`
            : undefined
        }
        confirmLabel="Revogar"
        destructive
        onConfirm={() => {
          if (toRevoke) revoke.mutate(toRevoke.id);
        }}
      />
    </section>
  );
}
