import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { toast } from "sonner";
import { logAndDescribeError } from "@/lib/errors";
import {
  buildTagManufacturingZip,
  downloadBlob,
  type ManufacturedTagRow,
} from "@/lib/tag-manufacturing";
import { PRODUCTION_CANONICAL_ORIGIN, configuredPublicAppUrl } from "@/lib/app-url";
import { Download, Plus, RefreshCw, Tags } from "lucide-react";

export const Route = createFileRoute("/admin/tags")({
  component: AdminTagsPage,
});

type BatchSummary = {
  id: string;
  batch_code: string;
  quantity: number;
  status: string;
  notes: string | null;
  created_at: string;
  in_stockish: number;
  reserved_count: number;
  active_count: number;
  disabled_count: number;
};

type TagRow = {
  id: string;
  human_serial: string;
  public_token: string;
  status: string;
  pet_id: string | null;
  activated_at: string | null;
  created_at: string;
};

const QTY_OPTIONS = [12, 24, 36, 48, 60, 96, 120];

function AdminTagsPage() {
  const qc = useQueryClient();
  const [qty, setQty] = useState(12);
  const [notes, setNotes] = useState("");
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<{
    batch_code: string;
    tags: ManufacturedTagRow[];
  } | null>(null);

  const batches = useQuery({
    queryKey: ["admin-tag-batches"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_tag_batches");
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as BatchSummary[];
    },
  });

  const tags = useQuery({
    queryKey: ["admin-tags", selectedBatch],
    enabled: Boolean(selectedBatch),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("physical_tags")
        .select("id, human_serial, public_token, status, pet_id, activated_at, created_at")
        .eq("batch_id", selectedBatch!)
        .order("human_serial");
      if (error) throw error;
      return (data ?? []) as TagRow[];
    },
  });

  const createBatch = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("admin_create_tag_batch", {
        _quantity: qty,
        _notes: notes || null,
      });
      if (error) throw error;
      const row = data as {
        batch_id: string;
        batch_code: string;
        tags: ManufacturedTagRow[];
      };
      return row;
    },
    onSuccess: async (row) => {
      setLastCreated({ batch_code: row.batch_code, tags: row.tags });
      setSelectedBatch(row.batch_id);
      toast.success(`Lote ${row.batch_code} criado (${row.tags.length} tags)`);
      await qc.invalidateQueries({ queryKey: ["admin-tag-batches"] });
      if (configuredPublicAppUrl() !== PRODUCTION_CANONICAL_ORIGIN) {
        toast.message(
          `Defina VITE_PUBLIC_APP_URL=${PRODUCTION_CANONICAL_ORIGIN} antes de exportar QR para fabricação.`,
        );
      }
    },
    onError: (e: unknown) =>
      toast.error(logAndDescribeError("admin_create_tag_batch", e, "Falha ao criar lote.")),
  });

  const setBatchStatus = useMutation({
    mutationFn: async (status: string) => {
      if (!selectedBatch) throw new Error("Selecione um lote");
      const { error } = await supabase.rpc("admin_set_batch_status", {
        _batch_id: selectedBatch,
        _status: status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status do lote atualizado");
      qc.invalidateQueries({ queryKey: ["admin-tag-batches"] });
      qc.invalidateQueries({ queryKey: ["admin-tags", selectedBatch] });
    },
    onError: (e: unknown) =>
      toast.error(logAndDescribeError("admin_set_batch_status", e, "Falha ao atualizar status.")),
  });

  const regenCode = useMutation({
    mutationFn: async (tagId: string) => {
      const { data, error } = await supabase.rpc("admin_regenerate_tag_activation", {
        _tag_id: tagId,
      });
      if (error) throw error;
      return data as { human_serial: string; activation_code: string };
    },
    onSuccess: (row) => {
      toast.success(`${row.human_serial}: novo código ${row.activation_code}`);
    },
    onError: (e: unknown) =>
      toast.error(logAndDescribeError("admin_regenerate_tag_activation", e, "Falha ao regenerar.")),
  });

  const selectedMeta = useMemo(
    () => batches.data?.find((b) => b.id === selectedBatch) ?? null,
    [batches.data, selectedBatch],
  );

  const exportLast = async () => {
    if (!lastCreated) {
      toast.error("Exporte logo após criar o lote (códigos só aparecem uma vez).");
      return;
    }
    try {
      const blob = await buildTagManufacturingZip(lastCreated.batch_code, lastCreated.tags);
      downloadBlob(blob, `${lastCreated.batch_code}-manufacturing.zip`);
      toast.success("ZIP de fabricação baixado");
    } catch (e) {
      toast.error(logAndDescribeError("tag_export", e, "Falha ao gerar exportação."));
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tags físicas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lotes em múltiplos de 12 para fabricação. QR usa o token público (`/t/…`), não o pet.
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2 text-primary">
          <Tags className="h-5 w-5" />
          <h2 className="font-semibold">Novo lote</h2>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <Label>Quantidade</Label>
            <Select value={String(qty)} onValueChange={(v) => setQty(Number(v))}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QTY_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} tags
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Notas</Label>
            <Input
              className="mt-1"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Fornecedor, pedido…"
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            className="min-h-11 rounded-full"
            disabled={createBatch.isPending}
            onClick={() => createBatch.mutate()}
          >
            <Plus className="mr-2 h-4 w-4" />
            Gerar lote
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-full"
            disabled={!lastCreated}
            onClick={() => void exportLast()}
          >
            <Download className="mr-2 h-4 w-4" />
            Exportar ZIP (CSV + QR SVG)
          </Button>
        </div>
        {lastCreated ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Códigos de ativação do lote <strong>{lastCreated.batch_code}</strong> estão prontos
            para exportação. Eles não ficam salvos em texto no banco — exporte agora.
          </p>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">Lotes</h2>
          {batches.isLoading ? (
            <Skeleton className="mt-4 h-40 w-full" />
          ) : batches.isError ? (
            <p className="mt-4 text-sm text-destructive">Falha ao carregar lotes.</p>
          ) : (
            <ul className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto">
              {(batches.data ?? []).map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedBatch(b.id)}
                    className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition ${
                      selectedBatch === b.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-secondary/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{b.batch_code}</span>
                      <span className="text-xs text-muted-foreground">{b.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {b.quantity} tags · estoque {b.in_stockish} · reservadas {b.reserved_count} ·
                      ativas {b.active_count} · off {b.disabled_count}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">
              Detalhe {selectedMeta ? `· ${selectedMeta.batch_code}` : ""}
            </h2>
            {selectedBatch ? (
              <Select
                onValueChange={(v) => setBatchStatus.mutate(v)}
                disabled={setBatchStatus.isPending}
              >
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue placeholder="Status do lote" />
                </SelectTrigger>
                <SelectContent>
                  {["generated", "ordered", "in_stock", "reserved", "disabled"].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          {!selectedBatch ? (
            <p className="mt-6 text-sm text-muted-foreground">Selecione um lote.</p>
          ) : tags.isLoading ? (
            <Skeleton className="mt-4 h-40 w-full" />
          ) : (
            <ul className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto text-sm">
              {(tags.data ?? []).map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{t.human_serial}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.status}
                      {t.pet_id ? (
                        <>
                          {" · "}
                          <Link
                            to="/admin/pets"
                            className="text-primary hover:underline"
                          >
                            pet vinculado
                          </Link>
                        </>
                      ) : null}
                    </p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground">
                      /t/{t.public_token}
                    </p>
                  </div>
                  {t.status !== "active" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      disabled={regenCode.isPending}
                      onClick={() => regenCode.mutate(t.id)}
                    >
                      <RefreshCw className="mr-1 h-3.5 w-3.5" />
                      Novo código
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
