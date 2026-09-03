import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, FlaskConical, Plus, RefreshCw, ShieldOff, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { logAndDescribeError } from "@/lib/errors";
import { PLAN_META, type CheckoutPlanKey } from "@/lib/entitlements";
import { formatDate } from "@/lib/pet-utils";

export const Route = createFileRoute("/admin/beta-access")({
  component: AdminBetaAccessPage,
  head: () => ({
    meta: [{ title: "Acesso Beta — Admin PetID" }],
  }),
});

type BetaCodeRow = {
  id: string;
  label: string;
  plan: CheckoutPlanKey;
  expires_at: string;
  max_redemptions: number;
  redemption_count: number;
  active: boolean;
  created_at: string;
  revoked_at: string | null;
  status: "active" | "expired" | "disabled" | "full";
};

type RedemptionRow = {
  grant_id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  plan: CheckoutPlanKey;
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
  status: "active" | "expired" | "revoked";
};

function statusLabel(s: string) {
  switch (s) {
    case "active":
      return "Ativo";
    case "expired":
      return "Expirado";
    case "disabled":
      return "Desativado";
    case "full":
      return "Esgotado";
    case "revoked":
      return "Revogado";
    default:
      return s;
  }
}

function AdminBetaAccessPage() {
  const qc = useQueryClient();
  const [label, setLabel] = useState("Pré-Lançamento — Amigos");
  const [plan, setPlan] = useState<CheckoutPlanKey>("familia");
  const [expiresLocal, setExpiresLocal] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState(25);
  const [createdCode, setCreatedCode] = useState<{
    code: string;
    label: string;
    plan: CheckoutPlanKey;
    expires_at: string;
  } | null>(null);
  const [selectedCodeId, setSelectedCodeId] = useState<string | null>(null);

  const codes = useQuery({
    queryKey: ["admin-beta-codes"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_beta_codes");
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as BetaCodeRow[];
    },
  });

  const redemptions = useQuery({
    queryKey: ["admin-beta-redemptions", selectedCodeId],
    enabled: Boolean(selectedCodeId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_beta_redemptions", {
        _code_id: selectedCodeId!,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as RedemptionRow[];
    },
  });

  const createCode = useMutation({
    mutationFn: async () => {
      if (!expiresLocal) throw new Error("Informe a data de expiração.");
      const expiresAt = new Date(expiresLocal);
      if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
        throw new Error("A data de expiração deve ser futura.");
      }
      const { data, error } = await supabase.rpc("admin_create_beta_code", {
        _label: label.trim(),
        _plan: plan,
        _expires_at: expiresAt.toISOString(),
        _max_redemptions: maxRedemptions,
      });
      if (error) throw error;
      const row = data as {
        code: string;
        label: string;
        plan: CheckoutPlanKey;
        expires_at: string;
      };
      return row;
    },
    onSuccess: (row) => {
      setCreatedCode(row);
      void qc.invalidateQueries({ queryKey: ["admin-beta-codes"] });
      toast.success("Código beta criado. Copie agora — não será exibido de novo.");
    },
    onError: (e: unknown) =>
      toast.error(logAndDescribeError("admin_create_beta_code", e, "Não foi possível criar o código.")),
  });

  const disableCode = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("admin_disable_beta_code", { _code_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-beta-codes"] });
      toast.success("Código desativado.");
    },
    onError: (e: unknown) =>
      toast.error(logAndDescribeError("admin_disable_beta_code", e, "Não foi possível desativar.")),
  });

  const revokeGrant = useMutation({
    mutationFn: async (grantId: string) => {
      const { error } = await supabase.rpc("admin_revoke_beta_grant", { _grant_id: grantId });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-beta-redemptions", selectedCodeId] });
      toast.success("Acesso beta revogado.");
    },
    onError: (e: unknown) =>
      toast.error(logAndDescribeError("admin_revoke_beta_grant", e, "Não foi possível revogar.")),
  });

  const selectedLabel = useMemo(
    () => codes.data?.find((c) => c.id === selectedCodeId)?.label ?? null,
    [codes.data, selectedCodeId],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <FlaskConical className="h-6 w-6 text-primary" />
          Acesso Beta
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Códigos gratuitos e temporários. Não criam assinatura Stripe. O código em texto só aparece
          na criação.
        </p>
      </div>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Plus className="h-5 w-5" /> Criar código
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="beta-label">Rótulo</Label>
            <Input
              id="beta-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Pré-Lançamento — Amigos"
            />
          </div>
          <div>
            <Label>Plano</Label>
            <Select value={plan} onValueChange={(v) => setPlan(v as CheckoutPlanKey)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="familia">Família</SelectItem>
                <SelectItem value="guardiao">Guardião</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="beta-max">Máx. resgates</Label>
            <Input
              id="beta-max"
              type="number"
              min={1}
              max={10000}
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(Number(e.target.value) || 1)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="beta-expires">Expira em</Label>
            <Input
              id="beta-expires"
              type="datetime-local"
              value={expiresLocal}
              onChange={(e) => setExpiresLocal(e.target.value)}
            />
          </div>
        </div>
        <Button
          type="button"
          className="rounded-full"
          disabled={createCode.isPending}
          onClick={() => createCode.mutate()}
        >
          {createCode.isPending ? "Gerando…" : "Gerar código seguro"}
        </Button>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Códigos</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-full"
            onClick={() => void codes.refetch()}
          >
            <RefreshCw className="mr-1.5 h-4 w-4" /> Atualizar
          </Button>
        </div>
        {codes.isLoading ? (
          <Skeleton className="h-40 w-full rounded-2xl" />
        ) : codes.isError ? (
          <p className="text-sm text-destructive">Não foi possível carregar os códigos.</p>
        ) : (codes.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum código ainda.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border bg-secondary/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Rótulo</th>
                  <th className="px-3 py-2 font-medium">Plano</th>
                  <th className="px-3 py-2 font-medium">Criado</th>
                  <th className="px-3 py-2 font-medium">Expira</th>
                  <th className="px-3 py-2 font-medium">Resgates</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {codes.data!.map((c) => (
                  <tr key={c.id} className="border-b border-border/70">
                    <td className="px-3 py-2.5 font-medium">{c.label}</td>
                    <td className="px-3 py-2.5">{PLAN_META[c.plan].name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{formatDate(c.created_at)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{formatDate(c.expires_at)}</td>
                    <td className="px-3 py-2.5">
                      {c.redemption_count}/{c.max_redemptions}
                    </td>
                    <td className="px-3 py-2.5">{statusLabel(c.status)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          onClick={() => setSelectedCodeId(c.id)}
                        >
                          <Users className="mr-1 h-3.5 w-3.5" />
                          Resgates
                        </Button>
                        {c.status === "active" || c.status === "full" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="rounded-full text-destructive"
                            disabled={disableCode.isPending}
                            onClick={() => {
                              if (confirm("Desativar este código? Novos resgates serão bloqueados.")) {
                                disableCode.mutate(c.id);
                              }
                            }}
                          >
                            <ShieldOff className="mr-1 h-3.5 w-3.5" />
                            Desativar
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedCodeId ? (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              Resgates{selectedLabel ? `: ${selectedLabel}` : ""}
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => setSelectedCodeId(null)}
            >
              Fechar
            </Button>
          </div>
          {redemptions.isLoading ? (
            <Skeleton className="h-24 w-full rounded-xl" />
          ) : (redemptions.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum resgate ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2">Email</th>
                    <th className="px-2 py-2">Plano</th>
                    <th className="px-2 py-2">Resgatado</th>
                    <th className="px-2 py-2">Expira</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {redemptions.data!.map((r) => (
                    <tr key={r.grant_id} className="border-b border-border/60">
                      <td className="px-2 py-2">
                        <div className="font-medium">{r.email ?? "—"}</div>
                        {r.full_name ? (
                          <div className="text-xs text-muted-foreground">{r.full_name}</div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2">{PLAN_META[r.plan].name}</td>
                      <td className="px-2 py-2 text-muted-foreground">{formatDate(r.granted_at)}</td>
                      <td className="px-2 py-2 text-muted-foreground">{formatDate(r.expires_at)}</td>
                      <td className="px-2 py-2">{statusLabel(r.status)}</td>
                      <td className="px-2 py-2">
                        {r.status === "active" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="rounded-full text-destructive"
                            disabled={revokeGrant.isPending}
                            onClick={() => {
                              if (confirm("Revogar o acesso beta deste usuário?")) {
                                revokeGrant.mutate(r.grant_id);
                              }
                            }}
                          >
                            Revogar
                          </Button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      <Dialog open={Boolean(createdCode)} onOpenChange={(o) => !o && setCreatedCode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Código gerado</DialogTitle>
            <DialogDescription>
              Copie este código agora. Por segurança, ele não poderá ser exibido novamente.
            </DialogDescription>
          </DialogHeader>
          {createdCode ? (
            <div className="space-y-3">
              <p className="rounded-xl border border-border bg-secondary/40 px-3 py-3 font-mono text-sm tracking-wide">
                {createdCode.code}
              </p>
              <p className="text-xs text-muted-foreground">
                {createdCode.label} · {PLAN_META[createdCode.plan].name} · válido até{" "}
                {formatDate(createdCode.expires_at)}
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              className="rounded-full"
              onClick={async () => {
                if (!createdCode) return;
                try {
                  await navigator.clipboard.writeText(createdCode.code);
                  toast.success("Código copiado.");
                } catch {
                  toast.error("Não foi possível copiar. Selecione o código manualmente.");
                }
              }}
            >
              <Copy className="mr-1.5 h-4 w-4" /> Copiar
            </Button>
            <Button type="button" variant="ghost" onClick={() => setCreatedCode(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
