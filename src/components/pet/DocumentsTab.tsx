import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/pet-utils";
import { logAndDescribeError } from "@/lib/errors";
import { DOCUMENT_STATUS_TYPES, documentMatchesType } from "@/lib/pet-profile";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "./ConfirmDialog";
import { useEntitlements } from "@/hooks/useEntitlements";
import { UpgradeCard } from "@/components/billing/UpgradeCard";
import { planUnlockLabel } from "@/lib/entitlements";

const CATEGORIES = [
  "Carteira de vacinação",
  "Pedigree",
  "Registro do microchip",
  "Receita",
  "Exame",
  "Seguro",
  "Passaporte",
  "Atestado de saúde",
  "Outro",
];

type Doc = { id: string; title: string; category: string | null; url: string | null; created_at: string };

export function DocumentsTab({
  petId,
  autoOpen,
  onConsumeAutoOpen,
}: {
  petId: string;
  autoOpen?: boolean;
  onConsumeAutoOpen?: () => void;
}) {
  const qc = useQueryClient();
  const { canUploadDocument } = useEntitlements();
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Doc | null>(null);
  const [form, setForm] = useState({ title: "", category: CATEGORIES[0], url: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["documents", petId],
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("*").eq("pet_id", petId).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Doc[];
    },
  });

  const statusCards = useMemo(() => {
    const docs = data ?? [];
    return DOCUMENT_STATUS_TYPES.map((t) => {
      const match = docs.find((d) => documentMatchesType(d, t.match) || (d.category && t.match.some((re) => re.test(d.category!))));
      return { ...t, present: Boolean(match), doc: match ?? null };
    });
  }, [data]);

  const add = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Informe o título do documento.");
      const { error } = await supabase.from("documents").insert({
        pet_id: petId, title: form.title.trim(), category: form.category, url: form.url || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento adicionado");
      qc.invalidateQueries({ queryKey: ["documents", petId] });
      qc.invalidateQueries({ queryKey: ["health-timeline", petId] });
      setOpen(false);
      setForm({ title: "", category: CATEGORIES[0], url: "" });
    },
    onError: (e: unknown) => toast.error(logAndDescribeError("DocumentsTab: add failed", e, "Não foi possível adicionar o documento.")),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento removido");
      qc.invalidateQueries({ queryKey: ["documents", petId] });
      qc.invalidateQueries({ queryKey: ["health-timeline", petId] });
      setToDelete(null);
    },
    onError: (e: unknown) => toast.error(logAndDescribeError("DocumentsTab: remove failed", e, "Não foi possível remover o documento.")),
  });

  const openAddFor = (categoryHint: string) => {
    if (!canUploadDocument(data?.length ?? 0)) {
      toast.error(planUnlockLabel("documents"));
      return;
    }
    const match = CATEGORIES.find((c) => c.toLowerCase().includes(categoryHint.toLowerCase().slice(0, 8))) ?? CATEGORIES[0];
    setForm({ title: categoryHint, category: match, url: "" });
    setOpen(true);
  };

  const tryOpenAdd = () => {
    if (!canUploadDocument(data?.length ?? 0)) {
      toast.error(planUnlockLabel("documents"));
      return;
    }
    setOpen(true);
  };

  const atDocLimit = !canUploadDocument(data?.length ?? 0);

  useEffect(() => {
    if (autoOpen) {
      tryOpenAdd();
      onConsumeAutoOpen?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Central de documentos</h3>
            <p className="text-sm text-muted-foreground">
              Veja de um olhar o que já está arquivado e o que ainda falta.
            </p>
          </div>
          {atDocLimit ? (
            <UpgradeCard
              compact
              title="Limite de documentos"
              description={planUnlockLabel("documents")}
            />
          ) : (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-full"><Plus className="mr-2 h-4 w-4" /> Adicionar</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Novo documento</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Título *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                  <div>
                    <Label className="mb-1.5 block">Tipo</Label>
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Link (URL)</Label>
                    <Input type="url" placeholder="https://…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Upload de arquivos será liberado em breve. Por enquanto, informe um link.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button onClick={() => add.mutate()} disabled={add.isPending}>{add.isPending ? "Salvando…" : "Salvar"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)
            : statusCards.map((card, index) => (
              <button
                key={card.key}
                type="button"
                onClick={() => {
                  if (card.present && card.doc?.url) {
                    window.open(card.doc.url, "_blank", "noopener,noreferrer");
                  } else if (!card.present) {
                    openAddFor(card.label);
                  }
                }}
                aria-label={card.present ? `${card.label}, arquivado. Toque para visualizar` : `${card.label} ausente. Toque para adicionar`}
                className={`animate-in fade-in fill-mode-both rounded-2xl border p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  card.present
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-amber-500/30 bg-amber-500/5"
                }`}
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <div className="flex items-start gap-3">
                  {card.present ? (
                    <CheckCircle2 className="mt-0.5 h-7 w-7 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-7 w-7 shrink-0 text-amber-600" />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight">
                      {card.present ? card.label : `${card.label} ausente`}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {card.present
                        ? card.doc?.title ?? "Arquivado"
                        : "Toque para adicionar"}
                    </p>
                  </div>
                </div>
              </button>
            ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h3 className="text-lg font-semibold">Todos os arquivos</h3>
        <p className="text-sm text-muted-foreground">Lista completa do que você já guardou.</p>

        <div className="mt-5">
          {isLoading ? (
            <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
          ) : data && data.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {data.map((d) => (
                <div key={d.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-secondary p-2"><FileText className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{d.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {d.category ? <Badge variant="outline" className="text-xs">{d.category}</Badge> : null}
                        <span className="text-xs text-muted-foreground">{formatDate(d.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" asChild disabled={!d.url} className="flex-1">
                      <a href={d.url ?? "#"} target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" /> Visualizar
                      </a>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setToDelete(d)} aria-label={`Excluir documento ${d.title}`}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={FileText}
              title="Nenhum documento cadastrado"
              description="Guardar carteira de vacinação, seguro e passaporte deixa o perfil pronto para viagens e emergências."
              action={
                atDocLimit
                  ? undefined
                  : { label: "Adicionar documento", icon: Plus, onClick: tryOpenAdd }
              }
            />
          )}
        </div>
      </section>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir documento?"
        description={toDelete ? `Remover "${toDelete.title}"?` : ""}
        destructive
        confirmLabel="Excluir"
        onConfirm={() => { if (toDelete) remove.mutate(toDelete.id); }}
      />
    </div>
  );
}
