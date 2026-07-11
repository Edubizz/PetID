import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Shield, ShieldOff, Lock, Unlock, User, Search } from "lucide-react";

export const Route = createFileRoute("/admin/users")({
  component: UsersPage,
});

type Row = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  is_blocked: boolean;
  role: "admin" | "user" | null;
  pets_count: number;
};

function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const { data: me } = useQuery({
    queryKey: ["me", "id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && (u.role ?? "user") !== roleFilter) return false;
      if (!s) return true;
      return (u.full_name ?? "").toLowerCase().includes(s) || (u.email ?? "").toLowerCase().includes(s);
    });
  }, [users, search, roleFilter]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  const toggleRole = useMutation({
    mutationFn: async ({ userId, makeAdmin }: { userId: string; makeAdmin: boolean }) => {
      const { error } = await supabase.rpc("admin_set_user_role", {
        _user_id: userId, _role: "admin", _enabled: makeAdmin,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "users"] }); toast.success("Papel atualizado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleBlock = useMutation({
    mutationFn: async ({ userId, blocked }: { userId: string; blocked: boolean }) => {
      const { error } = await supabase.rpc("admin_set_user_blocked", { _user_id: userId, _blocked: blocked });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "users"] }); toast.success("Status atualizado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Usuários</h1>
          <p className="mt-1 text-muted-foreground">{filtered.length} usuário(s) encontrado(s).</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou email…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
        <select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value as "all" | "admin" | "user"); setPage(1); }}>
          <option value="all">Todos os papéis</option>
          <option value="admin">Admins</option>
          <option value="user">Usuários</option>
        </select>
      </div>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Usuário</th>
              <th className="px-4 py-3">Cadastro</th>
              <th className="px-4 py-3">Último acesso</th>
              <th className="px-4 py-3">Pets</th>
              <th className="px-4 py-3">Papel</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Carregando…</td></tr>
            ) : paged.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Nenhum usuário encontrado</td></tr>
            ) : paged.map((u) => {
              const isSelf = me === u.id;
              const isAdmin = u.role === "admin";
              return (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted"><User className="h-4 w-4" /></div>
                      <div>
                        <div className="font-medium">{u.full_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(u.created_at).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-4 py-3">{u.pets_count}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isAdmin ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {isAdmin ? "Admin" : "User"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.is_blocked ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600"}`}>
                      {u.is_blocked ? "Bloqueado" : "Ativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isSelf && isAdmin}
                        onClick={() => toggleRole.mutate({ userId: u.id, makeAdmin: !isAdmin })}
                        title={isAdmin ? "Remover admin" : "Tornar admin"}
                      >
                        {isAdmin ? <ShieldOff className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isSelf}
                        onClick={() => toggleBlock.mutate({ userId: u.id, blocked: !u.is_blocked })}
                        title={u.is_blocked ? "Desbloquear" : "Bloquear"}
                      >
                        {u.is_blocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
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
    </div>
  );
}