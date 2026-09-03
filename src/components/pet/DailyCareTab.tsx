import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import {
  Plus, Pencil, Trash2, Flame, Trophy, Target, Star, Sparkles, ArrowLeft, X, Check,
  Dog, Cat, Bird, Rabbit, HelpCircle, AlertTriangle, RefreshCw, type LucideIcon,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from "recharts";
import { useQuickLogEntry } from "@/hooks/useQuickLogEntry";
import { useCreateRoutine } from "@/hooks/useCreateRoutine";
import { QuickLogControl } from "@/components/pet/QuickLogControl";
import { logAndDescribeError } from "@/lib/errors";
import {
  CATEGORY_META,
  CATEGORY_OPTIONS,
  SPECIES_PRESETS,
  AGE_OPTIONS,
  SIZE_OPTIONS,
  LIFESTYLE_OPTIONS,
  DOG_AGE_HELPER_FOOTNOTE,
  ageHelpersForSpecies,
  buildSmartRoutine,
  computeStats,
  groupEntriesByDay,
  dayKey,
  dayLabel,
  formatTime,
  todayKey,
  setLastQuickValue,
  usesQuantityQuickLog,
  entryUnitMetadata,
  formatTrackerProgress,
  formatTrackerGoalPerDay,
  formatLoggedAmount,
  resolveEntryUnit,
  resolveWaterGoalMode,
  waterUnitForMode,
  defaultWaterTargetForMode,
  WATER_MODE_SWITCH_WARNING,
  type TrackerCategory,
  type SpeciesPresetKey,
  type PetAgeGroup,
  type PetSize,
  type PetLifestyle,
  type RoutineDraftItem,
  type DailyCareStats,
  type WaterGoalMode,
  parseRoutineQuantity,
  sumTrackerEntriesCompatible,
} from "@/lib/daily-care";
import { preserveLegacyEntryUnitsBeforeModeSwitch } from "@/lib/water-mode-switch";

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
  metadata?: unknown;
};

const ENTRIES_WINDOW_DAYS = 60;

function toDatetimeLocalNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DailyCareTab({ petId, petName }: { petId: string; petName?: string }) {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Tracker | null>(null);
  const [toDelete, setToDelete] = useState<Tracker | null>(null);
  const [presetsOpen, setPresetsOpen] = useState(false);

  const {
    data: trackers,
    isLoading: loadingTrackers,
    isError: trackersFailed,
    refetch: refetchTrackers,
  } = useQuery({
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

  const {
    data: entries,
    isLoading: loadingEntries,
    isError: entriesFailed,
    refetch: refetchEntries,
  } = useQuery({
    queryKey: ["tracker-entries", petId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracker_entries")
        .select("id, tracker_id, pet_id, value, notes, completed_at, metadata")
        .eq("pet_id", petId)
        .gte("completed_at", since)
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return data as Entry[];
    },
  });

  // Trackers/entries created or changed here also feed the cross-pet Today
  // page, the per-pet Dashboard tab hero (health score/streak) and Timeline —
  // every mutation below must invalidate all four, not just this tab's own
  // ["trackers"/"tracker-entries", petId] queries.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["trackers", petId] });
    qc.invalidateQueries({ queryKey: ["tracker-entries", petId] });
    qc.invalidateQueries({ queryKey: ["today-care-overview"] });
    qc.invalidateQueries({ queryKey: ["home-agenda"] });
    qc.invalidateQueries({ queryKey: ["health-timeline", petId] });
  };

  const quickLog = useQuickLogEntry(petId, [
    ["tracker-entries", petId],
    ["today-care-overview"],
    ["home-agenda"],
    ["health-timeline", petId],
  ]);

  const customLog = useMutation({
    mutationFn: async (payload: { tracker: Tracker; value: number; notes: string; completedAt: string }) => {
      const unit = payload.tracker.unit ?? CATEGORY_META[payload.tracker.category].unit;
      const { error } = await supabase.from("tracker_entries").insert({
        tracker_id: payload.tracker.id,
        pet_id: petId,
        value: payload.value,
        notes: payload.notes || null,
        completed_at: payload.completedAt,
        metadata: entryUnitMetadata(unit),
      });
      if (error) throw error;
    },
    onSuccess: (_data, payload) => {
      if (usesQuantityQuickLog(payload.tracker.category, payload.tracker.unit)) {
        setLastQuickValue(payload.tracker.id, payload.value);
      }
      toast.success("Registro adicionado");
      qc.invalidateQueries({ queryKey: ["tracker-entries", petId] });
      qc.invalidateQueries({ queryKey: ["today-care-overview"] });
      qc.invalidateQueries({ queryKey: ["home-agenda"] });
      qc.invalidateQueries({ queryKey: ["health-timeline", petId] });
    },
    onError: (e: unknown) => toast.error(logAndDescribeError("DailyCareTab: customLog failed", e, "Não foi possível adicionar o registro.")),
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
      toast.success("Itens adicionados à rotina");
      invalidate();
      setPresetsOpen(false);
    },
    onError: (e: unknown) => toast.error(logAndDescribeError("DailyCareTab: createPreset failed", e, "Não foi possível adicionar os itens predefinidos.")),
  });

  const createRoutine = useCreateRoutine(petId);

  const removeTracker = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("trackers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item removido da rotina");
      invalidate();
      setToDelete(null);
    },
    onError: (e: unknown) => toast.error(logAndDescribeError("DailyCareTab: removeTracker failed", e, "Não foi possível remover o item.")),
  });

  const toggleActive = useMutation({
    mutationFn: async (tracker: Tracker) => {
      const { error } = await supabase.from("trackers").update({ is_active: !tracker.is_active }).eq("id", tracker.id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: unknown) => toast.error(logAndDescribeError("DailyCareTab: toggleActive failed", e, "Não foi possível atualizar o item.")),
  });

  const todaySums = useMemo(() => {
    const map = new Map<string, number>();
    const key = todayKey();
    for (const t of trackers ?? []) {
      map.set(
        t.id,
        sumTrackerEntriesCompatible(entries ?? [], t.id, t.unit, { day: key }),
      );
    }
    return map;
  }, [entries, trackers]);

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
  const hasError = trackersFailed || entriesFailed;

  if (isLoading) {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <span className="sr-only">Carregando rotina…</span>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
    );
  }

  // Never fall through to the "no trackers yet" onboarding wizard on a load
  // failure — the pet may already have trackers, and showing the wizard here
  // risks the user creating a second, duplicate routine on top of them.
  if (hasError) {
    return (
      <div className="rounded-2xl border border-dashed border-destructive/40 bg-destructive/5 p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
        <p className="mt-3 font-medium text-destructive">Não foi possível carregar a rotina.</p>
        <p className="mt-1 text-sm text-muted-foreground">Verifique sua conexão e tente novamente.</p>
        <Button
          size="sm"
          variant="outline"
          className="mt-4 rounded-full"
          onClick={() => { void refetchTrackers(); void refetchEntries(); }}
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {(trackers ?? []).length === 0 ? (
        <SmartOnboarding
          petName={petName}
          onConfirm={(items) => createRoutine.mutate(items)}
          onBlank={openNew}
          pending={createRoutine.isPending}
        />
      ) : (
        <>
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">Rotina de hoje</h3>
              <div className="flex gap-2">
                <Popover open={presetsOpen} onOpenChange={setPresetsOpen}>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="outline" className="min-h-9 rounded-full">Predefinidos</Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64">
                    <p className="mb-2 text-sm font-medium">Adicionar itens comuns</p>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(SPECIES_PRESETS) as SpeciesPresetKey[]).map((k) => (
                        <Button key={k} size="sm" variant="secondary" onClick={() => createPreset.mutate(k)} disabled={createPreset.isPending}>
                          {SPECIES_PRESETS[k].label}
                        </Button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <Button size="sm" className="min-h-9 rounded-full" onClick={openNew}>
                  <Plus className="mr-2 h-4 w-4" /> Novo item
                </Button>
              </div>
            </div>

            {activeTrackers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Todos os itens da rotina estão pausados. Reative um abaixo ou crie um novo.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {activeTrackers.map((t, index) => (
                  <TrackerCard
                    key={t.id}
                    tracker={t}
                    value={todaySums.get(t.id) ?? 0}
                    entries={entries}
                    onQuickLog={(value) => quickLog.mutate({ tracker: t, value })}
                    onCustomLog={(payload) => customLog.mutate({ tracker: t, ...payload })}
                    onEdit={() => openEdit(t)}
                    onDelete={() => setToDelete(t)}
                    quickPending={quickLog.isPending}
                    animationDelay={Math.min(index, 8) * 50}
                  />
                ))}
              </div>
            )}
          </section>

          {inactiveTrackers.length > 0 && (
            <details className="rounded-2xl border border-border bg-card p-4">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                Itens pausados ({inactiveTrackers.length})
              </summary>
              <div className="mt-3 space-y-2">
                {inactiveTrackers.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
                    <span>{t.title}</span>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => toggleActive.mutate(t)}>Reativar</Button>
                      <Button size="icon" variant="ghost" onClick={() => setToDelete(t)} aria-label={`Excluir tracker ${t.title}`}>
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
        title="Excluir item da rotina?"
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
  entries,
  onQuickLog,
  onCustomLog,
  onEdit,
  onDelete,
  quickPending,
  animationDelay = 0,
}: {
  tracker: Tracker;
  value: number;
  entries?: { tracker_id: string; value: number; completed_at: string }[];
  onQuickLog: (value: number) => void;
  onCustomLog: (payload: { value: number; notes: string; completedAt: string }) => void;
  onEdit: () => void;
  onDelete: () => void;
  quickPending: boolean;
  animationDelay?: number;
}) {
  const meta = CATEGORY_META[tracker.category];
  const Icon = meta.icon;
  const target = tracker.target_per_day || 1;
  const pct = Math.min(100, Math.round((value / target) * 100));
  const isDone = value >= target;
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
    <div
      className={cn(
        "animate-in fade-in slide-in-from-bottom-1 fill-mode-both rounded-2xl border p-5 shadow-[var(--shadow-card)] transition-colors duration-300",
        isDone ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-card",
      )}
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform"
            style={{ backgroundColor: `${color}22`, color }}
          >
            <Icon className="h-5 w-5" />
            {isDone && (
              <span className="animate-in zoom-in fade-in absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-emerald-500 text-white duration-300">
                <Check className="h-2.5 w-2.5" />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">{tracker.title}</p>
            <p className="text-xs leading-snug text-muted-foreground">
              {formatTrackerProgress(value, target, tracker.unit ?? meta.unit)}
              {isDone ? " · Meta concluída" : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-0.5">
          <Button size="icon" variant="ghost" className="h-9 w-9" onClick={onEdit} aria-label={`Editar ${tracker.title}`}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-9 w-9" onClick={onDelete} aria-label={`Excluir ${tracker.title}`}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      <Progress value={pct} className="mt-4" indicatorStyle={{ backgroundColor: color }} />

      <div className="mt-4 flex flex-wrap gap-2">
        <QuickLogControl
          tracker={tracker}
          onLog={onQuickLog}
          pending={quickPending}
          refreshToken={value}
          entries={entries}
        />
        <Popover open={customOpen} onOpenChange={setCustomOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="min-h-9 rounded-full">Registro personalizado</Button>
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
  const unit = editing?.unit ?? (category === "water" ? waterUnitForMode("bowls") : CATEGORY_META[category].unit);
  const waterMode: WaterGoalMode =
    category === "water" ? resolveWaterGoalMode(unit) : "volume";
  return {
    title: editing?.title ?? (category === "water" ? "Água" : ""),
    category,
    target_per_day: editing
      ? String(editing.target_per_day)
      : String(category === "water" ? defaultWaterTargetForMode(waterMode) : 1),
    unit,
    waterMode,
    volumeUnit: (unit === "l" || unit === "L" ? "l" : "ml") as "ml" | "l",
    color: editing?.color ?? CATEGORY_META[category].color,
    is_active: editing?.is_active ?? true,
    reminderTimes: editing?.reminder_times ?? [],
    modeSwitchWarned: false,
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

  const initialWaterMode = editing && editing.category === "water"
    ? resolveWaterGoalMode(editing.unit)
    : null;

  const setWaterMode = (mode: WaterGoalMode) => {
    setForm((f) => {
      const switching = initialWaterMode != null && initialWaterMode !== mode;
      return {
        ...f,
        waterMode: mode,
        unit: waterUnitForMode(mode, f.volumeUnit),
        target_per_day: String(defaultWaterTargetForMode(mode)),
        modeSwitchWarned: switching || f.modeSwitchWarned,
      };
    });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Informe um nome para o tracker.");
      const qty = parseRoutineQuantity(form.target_per_day);
      if (!qty.ok) throw new Error(qty.message);
      const unit =
        form.category === "water"
          ? waterUnitForMode(form.waterMode, form.volumeUnit)
          : form.unit || null;

      // Mode switch: snapshot old unit onto legacy entries BEFORE changing tracker.unit.
      if (editing && editing.category === "water" && form.category === "water") {
        const previousUnit = editing.unit ?? CATEGORY_META.water.unit;
        const nextMode = resolveWaterGoalMode(unit);
        const prevMode = resolveWaterGoalMode(previousUnit);
        if (prevMode !== nextMode) {
          try {
            await preserveLegacyEntryUnitsBeforeModeSwitch(editing.id, previousUnit);
          } catch (e) {
            throw new Error(
              logAndDescribeError(
                "preserveLegacyEntryUnitsBeforeModeSwitch",
                e,
                "Não foi possível preservar o histórico antes de mudar o modo. A meta não foi alterada.",
              ),
            );
          }
        }
      }

      const payload = {
        pet_id: petId,
        title: form.title.trim(),
        category: form.category,
        target_per_day: qty.value,
        unit,
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
      toast.success(editing ? "Item atualizado" : "Item adicionado à rotina");
      qc.invalidateQueries({ queryKey: ["trackers", petId] });
      qc.invalidateQueries({ queryKey: ["tracker-entries", petId] });
      qc.invalidateQueries({ queryKey: ["today-care-overview"] });
      qc.invalidateQueries({ queryKey: ["home-agenda"] });
      qc.invalidateQueries({ queryKey: ["health-timeline", petId] });
      onOpenChange(false);
    },
    onError: (e: unknown) => toast.error(logAndDescribeError("DailyCareTab: save tracker failed", e, editing ? "Não foi possível salvar as alterações." : "Não foi possível adicionar o item.")),
  });

  const isWater = form.category === "water";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,100dvh)] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "Editar item" : "Novo item da rotina"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Nome *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Ração da manhã" />
          </div>
          <div className={isWater ? "md:col-span-2" : undefined}>
            <Label>Categoria</Label>
            <Select
              value={form.category}
              onValueChange={(v) => {
                const category = v as TrackerCategory;
                if (category === "water") {
                  const mode: WaterGoalMode = "bowls";
                  setForm((f) => ({
                    ...f,
                    category,
                    title: f.title.trim() ? f.title : "Água",
                    waterMode: mode,
                    unit: waterUnitForMode(mode),
                    target_per_day: String(defaultWaterTargetForMode(mode)),
                    color: f.color || CATEGORY_META.water.color,
                  }));
                  return;
                }
                setForm((f) => ({
                  ...f,
                  category,
                  unit: CATEGORY_META[category].unit,
                  target_per_day: f.target_per_day || "1",
                }));
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {isWater && (
            <div className="md:col-span-2 space-y-3">
              <div>
                <Label className="text-sm">Como você prefere acompanhar a água?</Label>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setWaterMode("bowls")}
                    className={`rounded-2xl border-2 p-3 text-left transition-colors ${
                      form.waterMode === "bowls"
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card"
                    }`}
                  >
                    <p className="text-sm font-semibold">Potes por dia</p>
                    <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                      Mais simples para acompanhar no dia a dia.
                    </p>
                    <p className="mt-1 text-[11px] font-medium text-primary">Recomendado</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWaterMode("volume")}
                    className={`rounded-2xl border-2 p-3 text-left transition-colors ${
                      form.waterMode === "volume"
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card"
                    }`}
                  >
                    <p className="text-sm font-semibold">Quantidade exata</p>
                    <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                      Para quem prefere controlar em ml ou litros.
                    </p>
                  </button>
                </div>
              </div>

              {form.modeSwitchWarned && initialWaterMode && initialWaterMode !== form.waterMode && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs leading-snug text-muted-foreground">
                  {WATER_MODE_SWITCH_WARNING}
                </p>
              )}

              {form.waterMode === "bowls" ? (
                <div>
                  <Label>Quantas vezes você pretende encher o pote por dia?</Label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={form.target_per_day}
                    onChange={(e) => setForm({ ...form, target_per_day: e.target.value })}
                    className="mt-1.5"
                  />
                  {Number(form.target_per_day) > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatTrackerGoalPerDay(Number(form.target_per_day), waterUnitForMode("bowls"))}
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Meta por dia</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      inputMode="decimal"
                      value={form.target_per_day}
                      onChange={(e) => setForm({ ...form, target_per_day: e.target.value })}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label>Unidade</Label>
                    <Select
                      value={form.volumeUnit}
                      onValueChange={(v) => {
                        const volumeUnit = v as "ml" | "l";
                        setForm((f) => ({
                          ...f,
                          volumeUnit,
                          unit: waterUnitForMode("volume", volumeUnit),
                        }));
                      }}
                    >
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ml">ml</SelectItem>
                        <SelectItem value="l">L</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}

          {!isWater && (
            <>
              <div>
                <Label>Meta por dia</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  value={form.target_per_day}
                  onChange={(e) => setForm({ ...form, target_per_day: e.target.value })}
                />
              </div>
              <div>
                <Label>Unidade</Label>
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="ml, min, doses…" />
              </div>
            </>
          )}

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
                <p className="text-sm font-medium">Item ativo</p>
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

/* -------------------- Smart onboarding wizard -------------------- */

const SPECIES_ICONS: Record<SpeciesPresetKey, LucideIcon> = {
  dog: Dog,
  cat: Cat,
  bird: Bird,
  rabbit: Rabbit,
  other: HelpCircle,
};

const WIZARD_STEPS = ["species", "age", "size", "lifestyle", "review"] as const;
type WizardStep = (typeof WIZARD_STEPS)[number];

/**
 * Also reused (unmodified) by the pet-creation onboarding wizard
 * (`PetOnboardingWizard`) as its "Build the Smart Routine" step — exported so
 * that flow can drive the exact same species/age/size/lifestyle questions
 * and tracker-review UI instead of duplicating them.
 */
export function SmartOnboarding({
  petName,
  onConfirm,
  onBlank,
  pending,
  initialSpecies,
}: {
  petName?: string;
  onConfirm: (items: RoutineDraftItem[]) => void;
  onBlank: () => void;
  pending: boolean;
  /** When the pet's species is already known, skip the species question. */
  initialSpecies?: SpeciesPresetKey | null;
}) {
  const [stepIndex, setStepIndex] = useState(initialSpecies ? 1 : 0);
  const [species, setSpecies] = useState<SpeciesPresetKey | null>(initialSpecies ?? null);
  const [age, setAge] = useState<PetAgeGroup | null>(null);
  const [size, setSize] = useState<PetSize | null>(null);
  const [lifestyle, setLifestyle] = useState<PetLifestyle | null>(null);
  const [draft, setDraft] = useState<RoutineDraftItem[]>([]);
  const [targetEdits, setTargetEdits] = useState<Record<string, string>>({});

  const step: WizardStep = WIZARD_STEPS[stepIndex];
  const name = petName || "seu pet";

  const goNext = () => setStepIndex((i) => Math.min(i + 1, WIZARD_STEPS.length - 1));
  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  const finishQuestions = (finalLifestyle: PetLifestyle) => {
    if (!species || !age || !size) return;
    const next = buildSmartRoutine({ species, age, size, lifestyle: finalLifestyle });
    setDraft(next);
    setTargetEdits(Object.fromEntries(next.map((d) => [d.key, String(d.target_per_day)])));
    goNext();
  };

  const updateDraftTarget = (key: string, raw: string) => {
    setTargetEdits((prev) => ({ ...prev, [key]: raw }));
  };
  const removeDraftItem = (key: string) => {
    setDraft((prev) => prev.filter((d) => d.key !== key));
    setTargetEdits((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const confirmPlan = () => {
    const resolved: RoutineDraftItem[] = [];
    for (const item of draft) {
      const raw = targetEdits[item.key] ?? String(item.target_per_day);
      const qty = parseRoutineQuantity(raw);
      if (!qty.ok) {
        toast.error(qty.message);
        return;
      }
      resolved.push({ ...item, target_per_day: qty.value });
    }
    onConfirm(resolved);
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/5 to-card p-4 sm:p-8">
      {step !== "review" && (
        <div className="mb-6 flex items-center gap-1.5">
          {WIZARD_STEPS.slice(0, 4).map((s, i) => (
            <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= stepIndex ? "bg-primary" : "bg-border"}`} />
          ))}
        </div>
      )}

      {step === "species" && (
        <WizardQuestion title={`Que tipo de pet é ${name}?`} subtitle="Vamos preparar uma rotina de cuidados sob medida.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(Object.keys(SPECIES_PRESETS) as SpeciesPresetKey[]).map((k) => {
              const Icon = SPECIES_ICONS[k];
              return (
                <WizardOption key={k} icon={Icon} label={SPECIES_PRESETS[k].label} selected={species === k} onClick={() => { setSpecies(k); goNext(); }} />
              );
            })}
          </div>
          <button onClick={onBlank} className="mt-6 text-sm text-muted-foreground underline-offset-2 hover:underline">
            Prefiro montar do zero
          </button>
        </WizardQuestion>
      )}

      {step === "age" && (
        <WizardQuestion
          title="Qual a idade?"
          subtitle={
            species === "dog"
              ? DOG_AGE_HELPER_FOOTNOTE
              : undefined
          }
          onBack={goBack}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {AGE_OPTIONS.map((o) => (
              <WizardOption
                key={o.value}
                label={o.label}
                description={ageHelpersForSpecies(species)?.[o.value]}
                selected={age === o.value}
                onClick={() => {
                  setAge(o.value);
                  goNext();
                }}
              />
            ))}
          </div>
        </WizardQuestion>
      )}

      {step === "size" && (
        <WizardQuestion title="Qual o porte?" onBack={goBack}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {SIZE_OPTIONS.map((o) => (
              <WizardOption key={o.value} label={o.label} selected={size === o.value} onClick={() => { setSize(o.value); goNext(); }} />
            ))}
          </div>
        </WizardQuestion>
      )}

      {step === "lifestyle" && (
        <WizardQuestion title="Como é a rotina?" onBack={goBack}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {LIFESTYLE_OPTIONS.map((o) => (
              <WizardOption
                key={o.value}
                label={o.label}
                selected={lifestyle === o.value}
                onClick={() => { setLifestyle(o.value); finishQuestions(o.value); }}
              />
            ))}
          </div>
        </WizardQuestion>
      )}

      {step === "review" && (
        <div>
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-5 w-5" />
            <p className="text-sm font-semibold uppercase tracking-wide">Plano pronto</p>
          </div>
          <h3 className="mt-1 text-xl font-bold">Preparamos este plano de cuidados para {name}.</h3>
          <p className="mt-1 text-sm text-muted-foreground">Ajuste as metas como quiser antes de confirmar — nada é definitivo.</p>

          <div className="mt-5 space-y-2">
            {draft.map((item) => {
              const meta = CATEGORY_META[item.category];
              const Icon = meta.icon;
              const rawTarget = targetEdits[item.key] ?? "";
              const parsedTarget = Number(String(rawTarget).replace(",", "."));
              const targetNum =
                Number.isFinite(parsedTarget) && parsedTarget > 0
                  ? parsedTarget
                  : item.target_per_day;
              const isWater = item.category === "water";
              const waterMode = resolveWaterGoalMode(item.unit);
              return (
                <div
                  key={item.key}
                  className="rounded-2xl border border-border bg-card p-3"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 break-words font-medium leading-snug">{item.title}</p>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0"
                          onClick={() => removeDraftItem(item.key)}
                          aria-label={`Remover ${item.title} do plano`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {isWater && (
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                          <button
                            type="button"
                            className={`rounded-xl border px-2.5 py-2 text-left text-xs ${
                              waterMode === "bowls" ? "border-primary bg-primary/5 font-medium" : "border-border"
                            }`}
                            onClick={() => {
                              const next = defaultWaterTargetForMode("bowls");
                              setDraft((prev) =>
                                prev.map((d) =>
                                  d.key === item.key
                                    ? { ...d, unit: waterUnitForMode("bowls"), target_per_day: next }
                                    : d,
                                ),
                              );
                              setTargetEdits((prev) => ({ ...prev, [item.key]: String(next) }));
                            }}
                          >
                            Potes por dia
                            <span className="mt-0.5 block font-normal text-muted-foreground">Recomendado</span>
                          </button>
                          <button
                            type="button"
                            className={`rounded-xl border px-2.5 py-2 text-left text-xs ${
                              waterMode === "volume" ? "border-primary bg-primary/5 font-medium" : "border-border"
                            }`}
                            onClick={() => {
                              const next = defaultWaterTargetForMode("volume");
                              setDraft((prev) =>
                                prev.map((d) =>
                                  d.key === item.key
                                    ? { ...d, unit: waterUnitForMode("volume"), target_per_day: next }
                                    : d,
                                ),
                              );
                              setTargetEdits((prev) => ({ ...prev, [item.key]: String(next) }));
                            }}
                          >
                            Quantidade exata (ml)
                          </button>
                        </div>
                      )}

                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          step={waterMode === "bowls" ? "1" : "0.1"}
                          inputMode={waterMode === "bowls" ? "numeric" : "decimal"}
                          value={rawTarget}
                          onChange={(e) => updateDraftTarget(item.key, e.target.value)}
                          className="h-9 w-24 min-w-0 max-w-full text-center"
                          aria-label={`Meta diária de ${item.title}`}
                        />
                        <span className="min-w-0 break-words text-xs leading-snug text-muted-foreground">
                          {formatTrackerGoalPerDay(targetNum, item.unit)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {draft.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                Nenhum cuidado no plano. Volte e escolha novamente ou comece do zero.
              </p>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              onClick={confirmPlan}
              disabled={pending || draft.length === 0}
              className="min-h-11 w-full rounded-full sm:w-auto"
            >
              {pending ? "Criando plano…" : "Confirmar plano"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setStepIndex(0)}
              className="min-h-11 w-full rounded-full sm:w-auto"
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Recomeçar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function WizardQuestion({
  title,
  subtitle,
  onBack,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      {onBack && (
        <button onClick={onBack} className="mb-3 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </button>
      )}
      <h3 className="text-xl font-bold">{title}</h3>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </div>
  );
}

function WizardOption({
  icon: Icon,
  label,
  description,
  selected,
  onClick,
}: {
  icon?: LucideIcon;
  label: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 p-4 text-center transition-all hover:-translate-y-0.5 hover:shadow-md ${
        selected ? "border-primary bg-primary/5" : "border-border bg-card"
      }`}
    >
      {Icon && <Icon className={`h-6 w-6 ${selected ? "text-primary" : "text-muted-foreground"}`} />}
      <span className="text-sm font-medium leading-snug">{label}</span>
      {description ? (
        <span className="max-w-[14rem] text-xs leading-snug text-muted-foreground">{description}</span>
      ) : null}
    </button>
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
        <div className="mt-4">
          <EmptyState
            size="sm"
            icon={Sparkles}
            title="Nenhum registro ainda"
            description="Use os botões da rotina acima para registrar o primeiro cuidado de hoje — seu histórico começa a partir daí."
          />
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
                        <p className="truncate font-medium">{tracker?.title ?? "Item removido"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatLoggedAmount(
                            e.value,
                            resolveEntryUnit(e.metadata, tracker?.unit ?? meta?.unit),
                          )}
                          {e.notes ? ` • ${e.notes}` : ""}
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
