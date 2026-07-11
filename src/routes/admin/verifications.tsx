import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, XCircle, FileText, Dog, Inbox } from "lucide-react";

export const Route = createFileRoute("/admin/verifications")({
  component: VerificationsPage,
});

type Row = {
  id: string; pet_id: string; pet_name: string | null; pet_photo: string | null;
  requester_id: string; requester_name: string | null; requester_email: string | null;
  status: string; documents: unknown; notes: string | null;
  created_at: string; reviewed_at: string | null;
};

function VerificationsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected" | "needs_more">("pending");
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin", "verifications"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_verifications");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const filtered = statusFilter === "all" ? rows : rows.filter((r) => r.status === statusFilter);

  const review = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      const { error } = await supabase.rpc("admin_review_verification", {
        _request_id: id, _status: status, _notes: notes,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "verifications"] }); qc.invalidateQueries({ queryKey: ["admin", "pets"] }); qc.invalidateQueries({ queryKey: ["admin", "stats"] }); toast.success("Solicitação atualizada"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Solicitações de Verificação</h1>
          <p className="mt-1 text-muted-foreground">Analise documentos enviados pelos tutores.</p>
        </div>
        <select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
          <option value="pending">Pendentes</option>
          <option value="approved">Aprovadas</option>
          <option value="rejected">Rejeitadas</option>
          <option value="needs_more">Aguardando docs</option>
          <option value="all">Todas</option>
        </select>
      </div>

      {isLoading ? (
        <p className="mt-10 text-center text-muted-foreground">Carregando…</p>
      ) : filtered.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <Inbox className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 font-medium">Nenhuma solicitação</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4">
          {filtered.map((r) => {
            const docs = Array.isArray(r.documents) ? (r.documents as Array<{ url: string; name?: string }>) : [];
            return (
              <div key={r.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 overflow-hidden rounded-full bg-muted">
                      {r.pet_photo ? <img src={r.pet_photo} alt={r.pet_name ?? ""} className="h-full w-full object-cover" /> : <Dog className="h-full w-full p-2 text-muted-foreground" />}
                    </div>
                    <div>
                      <div className="font-semibold">{r.pet_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.requester_name || r.requester_email} • {new Date(r.created_at).toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    r.status === "approved" ? "bg-emerald-500/10 text-emerald-600" :
                    r.status === "rejected" ? "bg-destructive/10 text-destructive" :
                    r.status === "needs_more" ? "bg-amber-500/10 text-amber-600" :
                    "bg-primary/10 text-primary"
                  }`}>{r.status}</span>
                </div>

                {docs.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {docs.map((d, i) => (
                      <a key={i} href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted">
                        <FileText className="h-3.5 w-3.5" /> {d.name ?? `Documento ${i + 1}`}
                      </a>
                    ))}
                  </div>
                )}

                {r.notes && <p className="mt-3 rounded-lg bg-muted p-3 text-sm">{r.notes}</p>}

                {r.status === "pending" && (
                  <div className="mt-4 space-y-3">
                    <Textarea placeholder="Observações (opcional)" value={notesMap[r.id] ?? ""} onChange={(e) => setNotesMap({ ...notesMap, [r.id]: e.target.value })} rows={2} />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => review.mutate({ id: r.id, status: "approved", notes: notesMap[r.id] })}>
                        <ShieldCheck className="mr-2 h-4 w-4" /> Aprovar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => review.mutate({ id: r.id, status: "needs_more", notes: notesMap[r.id] })}>
                        Solicitar novos documentos
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => review.mutate({ id: r.id, status: "rejected", notes: notesMap[r.id] })}>
                        <XCircle className="mr-2 h-4 w-4" /> Rejeitar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}