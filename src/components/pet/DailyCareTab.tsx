import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ConfirmDialog } from "./ConfirmDialog";
import { Plus, Pencil, Trash2, Flame, Trophy, Target, Star, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from "recharts";
import {
  CATEGORY_META,
  CATEGORY_OPTIONS,
  SPECIES_PRESETS,
  computeStats,
  groupEntriesByDay,
  dayKey,
  dayLabel,
  formatTime,
  todayKey,
  type TrackerCategory,
  type SpeciesPresetKey,
  type DailyCareStats,
} from "@/lib/daily-care";

type Tracker = {
  id: string;
  pet_id: string;
  title: string;
  category: TrackerCategory;
  target_per_day: number;
  unit: string | null;
  color: string | null;
  is_active: boolean;
  reminder_times: string[];
  created_at: string;
  updated_at: string;
};

type Entry = {
  id: string;
  tracker_id: string;
  pet_id: string;
  value: number;
  notes: string | null;
  completed_at: string;
};

const ENTRIES_WINDOW_DAYS = 60;

function toDatetimeLocalNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DailyCareTab({ petId }: { petId: string }) {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Tracker | null>(null);
  const [toDelete, setToDelete] = useState<Tracker | null>(null);
  const [presetsOpen, setPresetsOpen] = useState(false);

  const { data: trackers, isLoading: loadingTrackers } = useQuery({
    queryKey: ["trackers", petId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trackers")
        .select("id, pet_id, title, category, target_per_day, unit, color, is_active, reminder_times, created_at, updated_at")
        .eq("pet_id", petId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Tracker[];
    },
  });

  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - ENTRIES_WINDOW_DAYS);
    return d.toISOString();
  }, []);

  const { data: entries, isLoading: loadingEntries } = useQuery({
    queryKey: ["tracker-entries", petId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracker_entries")
        .select("id, tracker_id, pet_id, value, notes, completed_at")
        .eq("pet_id", petId)
        .gte("completed_at", since)
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return data as Entry[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["trackers", petId] });
    qc.invalidateQueries({ queryKey: ["tracker-entries", petId] });
  };

  const quickLog = useMutation({
    mutationFn: async (tracker: Tracker) => {
      const { error } = await supabase.from("tracker_entries").insert({
        tracker_id: tracker.id,
        pet_id: petId,
        value: CATEGORY_META[tracker.category].quickValue,
      });
      if (error) throw error;
    },
    onSuccess: (_data, tracker) => {
      toast.success(`${tracker.title} registrado`);
      qc.invalidateQueries({ queryKey: ["tracker-entries", petId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const customLog = useMutation({
    mutationFn: async (payload: { tracker: Tracker; value: number; notes: string; completedAt: string }) => {
      const { error } = await supabase.from("tracker_entries").insert({
        tracker_id: payload.tracker.id,
        pet_id: petId,
        value: payload.value,
        notes: payload.notes || null,
        completed_at: payload.completedAt,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro adicionado");
      qc.invalidateQueries({ queryKey: ["tracker-entries", petId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createPreset = useMutation({
    mutationFn: async (key: SpeciesPresetKey) => {
      const existingTitles = new Set((trackers ?? []).map((t) => t.title.toLowerCase()));
      const rows = SPECIES_PRESETS[key].trackers
        .filter((t) => !existingTitles.has(t.title.toLowerCase()))
        .map((t) => ({
          pet_id: petId,
          title: t.title,
          category: t.category,
          target_per_day: t.target_per_day,
          unit: t.unit,
          color: CATEGORY_META[t.category].color,
        }));
      if (rows.length === 0) return;
      const { error } = await supabase.from("trackers").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Trackers criados");
      invalidate();
      setPresetsOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeTracker = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("trackers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tracker removido");
      invalidate();
      setToDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (tracker: Tracker) => {
      const { error } = await supabase.from("trackers").update({ is_active: !tracker.is_active }).eq("id", tracker.id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const todaySums = useMemo(() => {
    const map = new Map<string, number>();
    const key = todayKey();
    for (const e of entries ?? []) {
      if (dayKey(e.completed_at) === key) {
        map.set(e.tracker_id, (map.get(e.tracker_id) ?? 0) + Number(e.value));
      }
    }
    return map;
  }, [entries]);

  const stats = useMemo(() => computeStats(trackers ?? [], entries ?? [], ENTRIES_WINDOW_DAYS), [trackers, entries]);

  const trackersById = useMemo(() => new Map((trackers ?? []).map((t) => [t.id, t])), [trackers]);

  const historyGroups = useMemo(() => {
    const grouped = groupEntriesByDay(entries ?? []);
    return Array.from(grouped.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 14)
      .map(([key, list]) => ({
        key,
        label: dayLabel(key),
        entries: [...list].sort((a, b) => a.completed_at.localeCompare(b.completed_at)),
      }));
  }, [entries]);

  const openNew = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (t: Tracker) => { setEditing(t); setFormOpen(true); };

  const activeTrackers = (trackers ?? []).filter((t) => t.is_active);
  const inactiveTrackers = (trackers ?? []).filter((t) => !t.is_active);
  const isLoading = loadingTrackers || loadingEntries;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(trackers ?? []).length === 0 ? (
        <PresetButtonsCard onPick={(k) => createPreset.mutate(k)} onBlank={openNew} pending={createPreset.isPending} />
      ) : (
        <>
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">Hoje</h3>
              <div className="flex gap-2">
                <Popover open={presetsOpen} onOpenChange={setPresetsOpen}>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="outline" className="rounded-full">Predefinidos</Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64">
                    <p className="mb-2 text-sm font-medium">Adicionar trackers comuns</p>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(SPECIES_PRESETS) as SpeciesPresetKey[]).map((k) => (
                        <Button key={k} size="sm" variant="secondary" onClick={() => createPreset.mutate(k)} disabled={createPreset.isPending}>
                          {SPECIES_PRESETS[k].label}
                        </Button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <Button size="sm" className="rounded-full" onClick={openNew}>
                  <Plus className="mr-2 h-4 w-4" /> Novo tracker
                </Button>
              </div>
            </div>

            {activeTrackers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Todos os trackers estão pausados. Reative um abaixo ou crie um novo.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {activeTrackers.map((t) => (
                  <TrackerCard
                    key={t.id}
                    tracker={t}
                    value={todaySums.get(t.id) ?? 0}
                    onQuickLog={() => quickLog.mutate(t)}
                    onCustomLog={(payload) => customLog.mutate({ tracker: t, ...payload })}
                    onEdit={() => openEdit(t)}
                    onDelete={() => setToDelete(t)}
                    quickPending={quickLog.isPending}
                  />
                ))}
              </div>
            )}
          </section>

          {inactiveTrackers.length > 0 && (
            <details className="rounded-2xl border border-border bg-card p-4">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                Trackers pausados ({inactiveTrackers.length})
              </summary>
              <div className="mt-3 space-y-2">
                {inactiveTrackers.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
                    <span>{t.title}</span>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => toggleActive.mutate(t)}>Reativar</Button>
                      <Button size="icon" variant="ghost" onClick={() => setToDelete(t)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

          <StatsSection stats={stats} />

          <HistorySection groups={historyGroups} trackersById={trackersById} />
        </>
      )}

      <TrackerFormDialog petId={petId} editing={editing} open={formOpen} onOpenChange={setFormOpen} />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir tracker?"
        description={toDelete ? `Remover "${toDelete.title}" e todo o histórico de registros associado?` : ""}
        destructive
        confirmLabel="Excluir"
        onConfirm={() => { if (toDelete) removeTracker.mutate(toDelete.id); }}
      />
    </div>
  );
}

/* -------------------- Tracker card -------------------- */

function TrackerCard({
  tracker,
  value,
  onQuickLog,
  onCustomLog,
  onEdit,
  onDelete,
  quickPending,
}: {
  tracker: Tracker;
  value: number;
  onQuickLog: () => void;
  onCustomLog: (payload: { value: number; notes: string; completedAt: string }) => void;
  onEdit: () => void;
  onDelete: () => void;
  quickPending: boolean;
}) {
  const meta = CATEGORY_META[tracker.category];
  const Icon = meta.icon;
  const target = tracker.target_per_day || 1;
  const pct = Math.min(100, Math.round((value / target) * 100));
  const color = tracker.color || meta.color;

  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState(String(meta.quickValue));
  const [customNotes, setCustomNotes] = useState("");
  const [customTime, setCustomTime] = useState(toDatetimeLocalNow);

  const submitCustom = () => {
    const v = Number(customValue);
    if (!v || v <= 0) return toast.error("Informe um valor válido.");
    onCustomLog({ value: v, notes: customNotes, completedAt: new Date(customTime).toISOString() });
    setCustomOpen(false);
    setCustomNotes("");
    setCustomTime(toDatetimeLocalNow());
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${color}22`, color }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold leading-tight">{tracker.title}</p>
            <p className="text-xs text-muted-foreground">
              {value} / {target} {tracker.unit ?? meta.unit}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-0.5">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDelete}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
        </div>
      </div>

      <Progress value={pct} className="mt-4" indicatorStyle={{ backgroundColor: color }} />

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" className="rounded-full" style={{ backgroundColor: color }} onClick={onQuickLog} disabled={quickPending}>
          {meta.quickLabel}
        </Button>
        <Popover open={customOpen} onOpenChange={setCustomOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="rounded-full">Registro personalizado</Button>
          </PopoverTrigger>
          <PopoverContent className="w-72">
            <p className="mb-2 text-sm font-medium">Registro personalizado</p>
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Valor ({tracker.unit ?? meta.unit})</Label>
                <Input type="number" step="0.1" value={customValue} onChange={(e) => setCustomValue(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Horário</Label>
                <Input type="datetime-local" value={customTime} onChange={(e) => setCustomTime(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Observação</Label>
                <Textarea rows={2} value={customNotes} onChange={(e) => setCustomNotes(e.target.value)} />
              </div>
              <Button size="sm" className="w-full" onClick={submitCustom}>Registrar</Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

/* -------------------- Create / edit dialog -------------------- */

function toFormState(editing: Tracker | null) {
  const category = (editing?.category ?? "custom") as TrackerCategory;
  return {
    title: editing?.title ?? "",
    category,
    target_per_day: editing ? String(editing.target_per_day) : "1",
    unit: editing?.unit ?? CATEGORY_META[category].unit,
    color: editing?.color ?? CATEGORY_META[category].color,
    is_active: editing?.is_active ?? true,
    reminderTimes: editing?.reminder_times ?? [],
  };
}

function TrackerFormDialog({
  petId,
  editing,
  open,
  onOpenChange,
}: {
  petId: string;
  editing: Tracker | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(() => toFormState(editing));

  useEffect(() => {
    if (open) setForm(toFormState(editing));
  }, [open, editing]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Informe um nome para o tracker.");
      const payload = {
        pet_id: petId,
        title: form.title.trim(),
        category: form.category,
        target_per_day: Number(form.target_per_day) || 1,
        unit: form.unit || null,
        color: form.color || CATEGORY_META[form.category].color,
        is_active: form.is_active,
        reminder_times: form.reminderTimes.filter(Boolean),
      };
      const { error } = editing
        ? await supabase.from("trackers").update(payload).eq("id", editing.id)
        : await supabase.from("trackers").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editing ? "Tracker atualizado" : "Tracker criado");
      qc.invalidateQueries({ queryKey: ["trackers", petId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Editar tracker" : "Novo tracker"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Nome *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Ração da manhã" />
          </div>
          <div>
            <Label>Categoria</Label>
            <Select
              value={form.category}
              onValueChange={(v) => {
                const category = v as TrackerCategory;
                setForm((f) => ({ ...f, category, unit: f.unit || CATEGORY_META[category].unit }));
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Meta por dia</Label>
            <Input type="number" min="0" step="0.1" value={form.target_per_day} onChange={(e) => setForm({ ...form, target_per_day: e.target.value })} />
          </div>
          <div>
            <Label>Unidade</Label>
            <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="ml, min, doses…" />
          </div>
          <div>
            <Label>Cor</Label>
            <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-9 p-1" />
          </div>

          <div className="md:col-span-2">
            <Label>Lembretes (opcional)</Label>
            <p className="mb-1.5 text-xs text-muted-foreground">Apenas registrado por enquanto — notificações chegam em breve.</p>
            <div className="space-y-2">
              {form.reminderTimes.map((time, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={time}
                    onChange={(e) => {
                      const next = [...form.reminderTimes];
                      next[i] = e.target.value;
                      setForm({ ...form, reminderTimes: next });
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setForm({ ...form, reminderTimes: form.reminderTimes.filter((_, idx) => idx !== i) })}
                  >
                    Remover
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setForm({ ...form, reminderTimes: [...form.reminderTimes, "08:00"] })}
              >
                <Plus className="mr-2 h-4 w-4" /> Adicionar horário
              </Button>
            </div>
          </div>

          {editing && (
            <div className="flex items-center justify-between rounded-xl border border-border p-3 md:col-span-2">
              <div>
                <p className="text-sm font-medium">Tracker ativo</p>
                <p className="text-xs text-muted-foreground">Desative para pausar sem perder o histórico.</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------- Presets (empty state) -------------------- */

function PresetButtonsCard({
  onPick,
  onBlank,
  pending,
}: {
  onPick: (k: SpeciesPresetKey) => void;
  onBlank: () => void;
  pending: boolean;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
      <h3 className="text-lg font-semibold">Comece o acompanhamento diário</h3>
      <p className="mt-1 text-sm text-muted-foreground">Escolha um ponto de partida — você pode ajustar tudo depois.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {(Object.keys(SPECIES_PRESETS) as SpeciesPresetKey[]).map((k) => (
          <Button key={k} variant="outline" className="rounded-full" onClick={() => onPick(k)} disabled={pending}>
            {SPECIES_PRESETS[k].label}
          </Button>
        ))}
        <Button variant="secondary" className="rounded-full" onClick={onBlank}>
          <Plus className="mr-2 h-4 w-4" /> Personalizado
        </Button>
      </div>
    </section>
  );
}

/* -------------------- Statistics -------------------- */

function StatsSection({ stats }: { stats: DailyCareStats }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h3 className="text-lg font-semibold">Estatísticas</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatCard icon={Flame} label="Sequência atual" value={`${stats.currentStreak} ${stats.currentStreak === 1 ? "dia" : "dias"}`} />
        <StatCard icon={Trophy} label="Melhor sequência" value={`${stats.bestStreak} ${stats.bestStreak === 1 ? "dia" : "dias"}`} />
        <StatCard icon={Target} label="Conclusão hoje" value={`${stats.todayCompletionPct}%`} />
      </div>
      <div className="mt-6">
        <p className="mb-2 text-sm font-medium text-muted-foreground">Últimos 7 dias</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={stats.last7Days}>
            <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v: number) => [`${v}%`, "Conclusão"]} />
            <Bar dataKey="pct" name="Conclusão" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/60 p-4">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-2 text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/* -------------------- History -------------------- */

function HistorySection({
  groups,
  trackersById,
}: {
  groups: { key: string; label: string; entries: Entry[] }[];
  trackersById: Map<string, Tracker>;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h3 className="text-lg font-semibold">Histórico</h3>
      {groups.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhum registro ainda. Use os botões acima para começar hoje.
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {groups.map((g) => (
            <div key={g.key}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {g.entries.map((e) => {
                  const tracker = trackersById.get(e.tracker_id);
                  const meta = tracker ? CATEGORY_META[tracker.category] : null;
                  const Icon = meta?.icon ?? Star;
                  const color = tracker?.color ?? meta?.color ?? "#64748B";
                  return (
                    <li key={e.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: `${color}22`, color }}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{tracker?.title ?? "Tracker removido"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {e.value} {tracker?.unit ?? meta?.unit ?? ""}{e.notes ? ` • ${e.notes}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatTime(e.completed_at)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
