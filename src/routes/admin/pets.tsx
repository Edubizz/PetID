import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Search, ShieldCheck, ShieldOff, Trash2, ExternalLink, Dog } from "lucide-react";
import { ConfirmDialog } from "@/components/pet/ConfirmDialog";

export const Route = createFileRoute("/admin/pets")({
  component: AdminPetsPage,
});

type Row = {
  id: string; name: string; breed: string | null; species: string | null;
  photo_url: string | null; public_slug: string;
  is_lost: boolean; is_verified: boolean; created_at: string;
  owner_id: string; owner_name: string | null; owner_email: string | null;
  scans_count: number; last_scan_at: string | null; sightings_count: number;
};

function AdminPetsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "lost" | "verified" | "unverified">("all");
  const [page, setPage] = useState(1);
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const pageSize = 20;

  const { data: pets = [], isLoading } = useQuery({
    queryKey: ["admin", "pets"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_pets");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return pets.filter((p) => {
      if (filter === "lost" && !p.is_lost) return false;
      if (filter === "verified" && !p.is_verified) return false;
      if (filter === "unverified" && p.is_verified) return false;
      if (!s) return true;
      return p.name.toLowerCase().includes(s) || (p.owner_name ?? "").toLowerCase().includes(s) || (p.owner_email ?? "").toLowerCase().includes(s);
    });
  }, [pets, search, filter]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  const toggleVerified = useMutation({
    mutationFn: async ({ id, verified }: { id: string; verified: boolean }) => {
      const { error } = await supabase.from("pets").update({ is_verified: verified }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "pets"] }); toast.success("Atualizado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "pets"] }); toast.success("Pet excluído"); setToDelete(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pets</h1>
        <p className="mt-1 text-muted-foreground">{filtered.length} pet(s) encontrado(s).</p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por nome, tutor ou email…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={filter} onChange={(e) => { setFilter(e.target.value as typeof filter); setPage(1); }}>
          <option value="all">Todos</option>
          <option value="lost">Perdidos</option>
          <option value="verified">Verificados</option>
          <option value="unverified">Não verificados</option>
        </select>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Pet</th>
              <th className="px-4 py-3">Raça</th>
              <th className="px-4 py-3">Tutor</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Escaneamentos</th>
              <th className="px-4 py-3">Último acesso</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Carregando…</td></tr>
            ) : paged.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Nenhum pet encontrado</td></tr>
            ) : paged.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 overflow-hidden rounded-full bg-muted">
                      {p.photo_url ? <img src={p.photo_url} alt={p.name} className="h-full w-full object-cover" /> : <Dog className="h-full w-full p-2 text-muted-foreground" />}
                    </div>
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">/{p.public_slug}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{p.breed || "—"}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{p.owner_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{p.owner_email}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {p.is_lost && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">Perdido</span>}
                    {p.is_verified && <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-600">Verificado</span>}
                    {!p.is_lost && !p.is_verified && <span className="text-xs text-muted-foreground">—</span>}
                  </div>
                </td>
                <td className="px-4 py-3">{p.scans_count}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.last_scan_at ? new Date(p.last_scan_at).toLocaleDateString("pt-BR") : "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" asChild title="Ver perfil público">
                      <Link to="/p/$slug" params={{ slug: p.public_slug }} target="_blank"><ExternalLink className="h-3.5 w-3.5" /></Link>
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => toggleVerified.mutate({ id: p.id, verified: !p.is_verified })} title={p.is_verified ? "Remover verificação" : "Verificar"}>
                      {p.is_verified ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setToDelete(p)} title="Excluir">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
          <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir pet?"
        description={`Esta ação removerá "${toDelete?.name}" e todos os dados relacionados. Não pode ser desfeita.`}
        confirmLabel="Excluir"
        destructive
        onConfirm={() => { if (toDelete) del.mutate(toDelete.id); }}
      />
    </div>
  );
}