import { useState } from "react";
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
import { ExternalLink, FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/pet-utils";
import { ConfirmDialog } from "./ConfirmDialog";

const CATEGORIES = [
  "Carteira de vacinação",
  "Pedigree",
  "Registro do microchip",
  "Receita",
  "Exame",
  "Outro",
];

type Doc = { id: string; title: string; category: string | null; url: string | null; created_at: string };

export function DocumentsTab({ petId }: { petId: string }) {
  const qc = useQueryClient();
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
      setOpen(false);
      setForm({ title: "", category: CATEGORIES[0], url: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento removido");
      qc.invalidateQueries({ queryKey: ["documents", petId] });
      setToDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Documentos</h3>
          <p className="text-sm text-muted-foreground">
            Guarde carteira de vacinação, pedigree, receitas e exames.
          </p>
        </div>
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
      </div>

      <div className="mt-5">
        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
        ) : data && data.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {data.map((d) => (
              <div key={d.id} className="rounded-xl border border-border p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-secondary p-2"><FileText className="h-5 w-5" /></div>
                  <div className="flex-1 min-w-0">
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
                  <Button size="sm" variant="ghost" onClick={() => setToDelete(d)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Nenhum documento cadastrado.
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir documento?"
        description={toDelete ? `Remover "${toDelete.title}"?` : ""}
        destructive
        confirmLabel="Excluir"
        onConfirm={() => { if (toDelete) remove.mutate(toDelete.id); }}
      />
    </section>
  );
}