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
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Mail, Pencil, Phone, Plus, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "./ConfirmDialog";

const RELATIONSHIPS = [
  "Tutor principal", "Cônjuge", "Filho(a)", "Familiar", "Passeador",
  "Pet sitter", "Veterinário", "Adestrador", "Outro",
];

type Caretaker = {
  id: string; pet_id: string; name: string;
  phone: string | null; email: string | null; relationship: string | null; is_primary: boolean;
};

type FormState = { name: string; phone: string; email: string; relationship: string; is_primary: boolean };
const EMPTY: FormState = { name: "", phone: "", email: "", relationship: RELATIONSHIPS[0], is_primary: false };

export function CaretakersTab({ petId }: { petId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Caretaker | null>(null);
  const [toDelete, setToDelete] = useState<Caretaker | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const { data, isLoading } = useQuery({
    queryKey: ["caretakers", petId],
    queryFn: async () => {
      const { data, error } = await supabase.from("caretakers").select("*").eq("pet_id", petId).order("is_primary", { ascending: false }).order("created_at");
      if (error) throw error;
      return data as Caretaker[];
    },
  });

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (c: Caretaker) => {
    setEditing(c);
    setForm({
      name: c.name, phone: c.phone ?? "", email: c.email ?? "",
      relationship: c.relationship ?? RELATIONSHIPS[0], is_primary: c.is_primary,
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Informe o nome do tutor.");
      const payload = {
        pet_id: petId,
        name: form.name.trim(),
        phone: form.phone || null,
        email: form.email || null,
        relationship: form.relationship || null,
        is_primary: form.is_primary,
      };
      const { error } = editing
        ? await supabase.from("caretakers").update(payload).eq("id", editing.id)
        : await supabase.from("caretakers").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editing ? "Tutor atualizado" : "Tutor adicionado");
      qc.invalidateQueries({ queryKey: ["caretakers", petId] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("caretakers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tutor removido");
      qc.invalidateQueries({ queryKey: ["caretakers", petId] });
      setToDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Tutores e responsáveis</h3>
          <p className="text-sm text-muted-foreground">Pessoas autorizadas a cuidar deste pet.</p>
        </div>
        <Button size="sm" className="rounded-full" onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Adicionar tutor
        </Button>
      </div>

      <div className="mt-5">
        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div>
        ) : data && data.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {data.map((c) => (
              <div key={c.id} className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="rounded-full bg-secondary p-2"><User className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.relationship ?? "—"}</p>
                    </div>
                  </div>
                  {c.is_primary ? <Badge>Principal</Badge> : null}
                </div>
                <div className="mt-3 space-y-1 text-sm">
                  {c.phone ? <p className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {c.phone}</p> : null}
                  {c.email ? <p className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5" /> {c.email}</p> : null}
                </div>
                <div className="mt-3 flex justify-end gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setToDelete(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Nenhum tutor cadastrado além de você.
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar tutor" : "Novo tutor"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2"><Label>Nome *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Telefone / WhatsApp</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="md:col-span-2">
              <Label className="mb-1.5 block">Parentesco / função</Label>
              <Select value={form.relationship} onValueChange={(v) => setForm({ ...form, relationship: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RELATIONSHIPS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 flex items-center justify-between rounded-xl border border-border p-3">
              <div>
                <p className="text-sm font-medium">Tutor principal</p>
                <p className="text-xs text-muted-foreground">Contato prioritário em emergências.</p>
              </div>
              <Switch checked={form.is_primary} onCheckedChange={(v) => setForm({ ...form, is_primary: v })} />
            </div>
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
        title="Remover tutor?"
        description={toDelete ? `Remover "${toDelete.name}" da lista de tutores?` : ""}
        destructive
        confirmLabel="Remover"
        onConfirm={() => { if (toDelete) remove.mutate(toDelete.id); }}
      />
    </section>
  );
}