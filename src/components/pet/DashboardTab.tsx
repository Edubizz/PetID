import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useHealthTimeline, type HealthTimelinePet, HEALTH_TIMELINE_ENTRIES_WINDOW_DAYS } from "@/hooks/useHealthTimeline";
import { useQuickLogEntry } from "@/hooks/useQuickLogEntry";
import { QuickLogControl } from "@/components/pet/QuickLogControl";
import { computeHealthScore } from "@/lib/health-score";
import { CATEGORY_META, computeStats, dayKey, todayKey, type TrackerCategory } from "@/lib/daily-care";
import { formatCurrencyBRL, formatDateTime } from "@/lib/pet-utils";
import { logAndDescribeError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  HeartPulse, Stethoscope, Syringe, Weight, ShieldCheck, ShieldAlert, Gift, CalendarClock,
  TrendingUp, TrendingDown, Minus, ChevronRight, ListChecks, Sparkles, Dog, Flame,
  type LucideIcon,
} from "lucide-react";

type Pet = HealthTimelinePet & {
  is_lost: boolean;
  lost_since: string | null;
  reward_amount: number | null;
  weight_kg: number | null;
  photo_url: string | null;
  breed: string | null;
};

export function DashboardTab({
  pet,
  onNavigate,
  autoOpenAppointment,
  onConsumeAutoOpen,
}: {
  pet: Pet;
  onNavigate: (tab: string) => void;
  autoOpenAppointment?: boolean;
  onConsumeAutoOpen?: () => void;
}) {
  const { data, isLoading } = useHealthTimeline(pet);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  const weightRows = data?.weightRows ?? [];
  const vaccineRows = data?.vaccineRows ?? [];
  const appointmentRows = data?.appointmentRows ?? [];
  const trackerRows = data?.trackerRows ?? [];
  const entryRows = data?.entryRows ?? [];
  const events = data?.events ?? [];

  return (
    <div className="space-y-6">
      <PetHeroCard
        pet={pet}
        weightRows={weightRows}
        vaccineRows={vaccineRows}
        appointmentRows={appointmentRows}
        trackerRows={trackerRows}
        entryRows={entryRows}
        onNavigate={onNavigate}
        autoOpenAppointment={autoOpenAppointment}
        onConsumeAutoOpen={onConsumeAutoOpen}
      />

      <TodaysCareCard pet={pet} trackerRows={trackerRows} entryRows={entryRows} onNavigate={onNavigate} />

      <div className="grid gap-6 lg:grid-cols-2">
        <UpcomingCard appointmentRows={appointmentRows} vaccineRows={vaccineRows} />
        <WeightSummaryCard weightRows={weightRows} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <LostStatusCard pet={pet} onNavigate={onNavigate} />
        <RecentTimelineCard events={events} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

/* -------------------- 1. Hero: photo, mood, score, streak, quick actions -------------------- */

type WeightRow = { weight_kg: number; measured_at: string };
type VaccineRow = { next_dose: string | null };
type AppointmentRow = { scheduled_at: string };
type TrackerRow = { id: string; is_active: boolean; target_per_day: number };
type EntryRow = { value: number; completed_at: string; trackers: { id: string } | null };

const MOOD_BY_STATUS: Record<string, string> = {
  excellent: "😄",
  good: "🙂",
  attention: "😐",
  critical: "😟",
};

function PetHeroCard({
  pet,
  weightRows,
  vaccineRows,
  appointmentRows,
  trackerRows,
  entryRows,
  onNavigate,
  autoOpenAppointment,
  onConsumeAutoOpen,
}: {
  pet: Pet;
  weightRows: WeightRow[];
  vaccineRows: VaccineRow[];
  appointmentRows: AppointmentRow[];
  trackerRows: TrackerRow[];
  entryRows: EntryRow[];
  onNavigate: (tab: string) => void;
  autoOpenAppointment?: boolean;
  onConsumeAutoOpen?: () => void;
}) {
  const [apptOpen, setApptOpen] = useState(false);

  useEffect(() => {
    if (autoOpenAppointment) {
      setApptOpen(true);
      onConsumeAutoOpen?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenAppointment]);

  const { result, streak, todayPct } = useMemo(() => {
    const now = Date.now();
    const activeTrackers = trackerRows.filter((t) => t.is_active);
    const normalizedEntries = entryRows.map((e) => ({ tracker_id: e.trackers?.id ?? "", value: e.value, completed_at: e.completed_at }));
    const stats = computeStats(trackerRows, normalizedEntries, HEALTH_TIMELINE_ENTRIES_WINDOW_DAYS);
    const overdueVaccineCount = vaccineRows.filter((v) => v.next_dose && new Date(v.next_dose).getTime() < now).length;
    const hasUpcomingAppointment = appointmentRows.some((a) => new Date(a.scheduled_at).getTime() >= now);
    const sortedWeights = [...weightRows].sort((a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime());
    const hasWeightHistory = sortedWeights.length > 0;
    const daysSinceLastWeight = hasWeightHistory
      ? Math.floor((now - new Date(sortedWeights[0].measured_at).getTime()) / 86400000)
      : null;

    return {
      result: computeHealthScore({
        dailyCompletionPct: stats.todayCompletionPct,
        hasActiveTrackers: activeTrackers.length > 0,
        overdueVaccineCount,
        isLost: pet.is_lost,
        hasWeightHistory,
        daysSinceLastWeight,
        hasUpcomingAppointment,
      }),
      streak: stats.currentStreak,
      todayPct: stats.todayCompletionPct,
    };
  }, [pet.is_lost, weightRows, vaccineRows, appointmentRows, trackerRows, entryRows]);

  return (
    <section className="overflow-hidden rounded-3xl border border-border shadow-[var(--shadow-elegant)]" style={{ background: "var(--gradient-hero)" }}>
      <div className="flex flex-wrap items-center gap-6 p-8">
        <div className="relative shrink-0">
          <div className="h-28 w-28 overflow-hidden rounded-3xl bg-secondary shadow-md">
            {pet.photo_url ? (
              <img src={pet.photo_url} alt={pet.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center" style={{ background: "var(--gradient-brand)" }}>
                <Dog className="h-10 w-10 text-primary-foreground" />
              </div>
            )}
          </div>
          <span className="absolute -bottom-2 -right-2 flex h-10 w-10 items-center justify-center rounded-full border-2 border-background bg-card text-xl shadow">
            {MOOD_BY_STATUS[result.status] ?? "🙂"}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold tracking-tight">{pet.name}</h2>
          <p className="text-sm text-muted-foreground">{pet.breed || "Sem raça definida"}</p>

          <div className="mt-4 flex flex-wrap gap-2.5">
            <HeroPill icon={HeartPulse} color={result.color} label={result.label} value={String(result.score)} />
            <HeroPill icon={Flame} color="#F97316" label="Sequência" value={`${streak} ${streak === 1 ? "dia" : "dias"}`} />
            <HeroPill icon={ListChecks} color="#0EA5E9" label="Hoje" value={`${todayPct}%`} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border/60 bg-background/40 px-8 py-4 backdrop-blur-sm">
        <Button size="sm" variant="outline" className="rounded-full bg-card" onClick={() => onNavigate("health")}>
          <Weight className="mr-1.5 h-4 w-4" /> Registrar peso
        </Button>
        <Button size="sm" variant="outline" className="rounded-full bg-card" onClick={() => setApptOpen(true)}>
          <CalendarClock className="mr-1.5 h-4 w-4" /> Agendar consulta
        </Button>
        <Button size="sm" variant="outline" className="rounded-full bg-card" onClick={() => onNavigate("health")}>
          <Syringe className="mr-1.5 h-4 w-4" /> Adicionar vacina
        </Button>
        <Button size="sm" variant="outline" className="rounded-full bg-card" onClick={() => onNavigate("daily-care")}>
          <ListChecks className="mr-1.5 h-4 w-4" /> Cuidados diários
        </Button>
        <Button size="sm" variant="outline" className="rounded-full bg-card text-destructive" onClick={() => onNavigate("lost")}>
          <ShieldAlert className="mr-1.5 h-4 w-4" /> Modo perdido
        </Button>
      </div>

      <AddAppointmentDialog petId={pet.id} open={apptOpen} onOpenChange={setApptOpen} />
    </section>
  );
}

function HeroPill({ icon: Icon, color, label, value }: { icon: LucideIcon; color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-card/80 px-3.5 py-2 shadow-sm backdrop-blur-sm">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${color}1a`, color }}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold leading-tight">{value}</p>
        <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

/* -------------------- 2. Today's Care -------------------- */

function TodaysCareCard({
  pet,
  trackerRows,
  entryRows,
  onNavigate,
}: {
  pet: Pet;
  trackerRows: { id: string; title: string; category: TrackerCategory; is_active: boolean; target_per_day: number; unit: string | null; color: string | null }[];
  entryRows: EntryRow[];
  onNavigate: (tab: string) => void;
}) {
  const todaySums = useMemo(() => {
    const key = todayKey();
    const map = new Map<string, number>();
    for (const e of entryRows) {
      if (dayKey(e.completed_at) === key) {
        const trackerId = e.trackers?.id;
        if (trackerId) map.set(trackerId, (map.get(trackerId) ?? 0) + Number(e.value));
      }
    }
    return map;
  }, [entryRows]);

  const active = trackerRows.filter((t) => t.is_active);
  const completed = active.filter((t) => (todaySums.get(t.id) ?? 0) >= t.target_per_day).length;
  const remaining = active.length - completed;
  const overallPct = active.length > 0
    ? Math.round((active.reduce((sum, t) => sum + Math.min(1, (todaySums.get(t.id) ?? 0) / (t.target_per_day || 1)), 0) / active.length) * 100)
    : 0;

  const quickLog = useQuickLogEntry(pet.id, [
    ["health-timeline", pet.id],
    ["tracker-entries", pet.id],
    ["trackers", pet.id],
    ["today-care-overview"],
    ["home-agenda"],
  ]);

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold"><ListChecks className="h-5 w-5" /> Cuidados de hoje</h3>
        <button onClick={() => onNavigate("daily-care")} className="text-xs font-medium text-primary hover:underline">
          Ver tudo
        </button>
      </div>

      {active.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhum cuidado diário configurado ainda.
          <div className="mt-3">
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => onNavigate("daily-care")}>
              Configurar cuidados diários
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{completed}</span> concluídos • <span className="font-semibold text-foreground">{remaining}</span> restantes
          </p>
          <Progress value={overallPct} className="mt-2" />
          <div className="mt-4 flex flex-wrap gap-2">
            {active.map((t) => {
              const meta = CATEGORY_META[t.category];
              const Icon = meta.icon;
              return (
                <QuickLogControl
                  key={t.id}
                  tracker={t}
                  icon={<Icon className="mr-1.5 h-3.5 w-3.5" />}
                  onLog={(value) => quickLog.mutate({ tracker: t, value })}
                  pending={quickLog.isPending}
                  refreshToken={todaySums.get(t.id) ?? 0}
                />
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

/* -------------------- 3. Upcoming -------------------- */

type UpcomingItem = { id: string; title: string; subtitle?: string; date: string; icon: LucideIcon; color: string };

function UpcomingCard({
  appointmentRows,
  vaccineRows,
}: {
  appointmentRows: { id: string; scheduled_at: string; reason: string | null; vet_name: string | null; clinic: string | null }[];
  vaccineRows: { id: string; name: string; next_dose: string | null; vet_name: string | null }[];
}) {
  const items = useMemo(() => {
    const now = Date.now();
    const appt: UpcomingItem[] = appointmentRows
      .filter((a) => new Date(a.scheduled_at).getTime() >= now)
      .map((a) => ({
        id: `appointment-${a.id}`,
        title: a.reason ? `Consulta — ${a.reason}` : "Consulta veterinária",
        subtitle: [a.vet_name, a.clinic].filter(Boolean).join(" • ") || undefined,
        date: a.scheduled_at,
        icon: Stethoscope,
        color: "#F59E0B",
      }));
    const vac: UpcomingItem[] = vaccineRows
      .filter((v): v is typeof v & { next_dose: string } => Boolean(v.next_dose) && new Date(v.next_dose as string).getTime() >= now)
      .map((v) => ({
        id: `vaccine-${v.id}`,
        title: `${v.name} — próxima dose`,
        subtitle: v.vet_name ?? undefined,
        date: v.next_dose,
        icon: Syringe,
        color: "#6366F1",
      }));
    return [...appt, ...vac].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 5);
  }, [appointmentRows, vaccineRows]);

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h3 className="flex items-center gap-2 text-lg font-semibold"><CalendarClock className="h-5 w-5" /> Próximos eventos</h3>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhum evento futuro agendado.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <li key={it.id} className="flex items-center gap-3 rounded-xl bg-secondary/50 px-3 py-2.5 text-sm">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${it.color}22`, color: it.color }}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{it.title}</p>
                  {it.subtitle ? <p className="truncate text-xs text-muted-foreground">{it.subtitle}</p> : null}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(it.date)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* -------------------- 4. Weight Summary -------------------- */

function WeightSummaryCard({ weightRows }: { weightRows: WeightRow[] }) {
  const summary = useMemo(() => {
    if (weightRows.length === 0) return null;
    const sorted = [...weightRows].sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime());
    const latest = sorted[sorted.length - 1];
    const cutoff = Date.now() - 30 * 86400000;
    let reference: WeightRow | null = null;
    for (const w of sorted) {
      if (new Date(w.measured_at).getTime() <= cutoff) reference = w;
      else break;
    }
    const change = reference ? Number((latest.weight_kg - reference.weight_kg).toFixed(1)) : null;
    return { latest: latest.weight_kg, change, points: sorted.slice(-12).map((w) => w.weight_kg) };
  }, [weightRows]);

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h3 className="flex items-center gap-2 text-lg font-semibold"><Weight className="h-5 w-5" /> Peso</h3>
      {!summary ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhuma pesagem registrada ainda.</p>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-2xl font-bold">{summary.latest} kg</p>
            <ChangeBadge change={summary.change} />
          </div>
          <Sparkline points={summary.points} />
        </div>
      )}
    </section>
  );
}

function ChangeBadge({ change }: { change: number | null }) {
  if (change === null) return <p className="text-xs text-muted-foreground">Sem dados de 30 dias atrás</p>;
  const Icon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;
  const color = change === 0 ? "text-muted-foreground" : "text-foreground";
  return (
    <p className={`flex items-center gap-1 text-xs ${color}`}>
      <Icon className="h-3.5 w-3.5" /> {change > 0 ? "+" : ""}{change} kg em 30 dias
    </p>
  );
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 96;
  const h = 36;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <polyline fill="none" stroke="#0EA5E9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={coords.join(" ")} />
    </svg>
  );
}

/* -------------------- 5. Lost Status -------------------- */

function LostStatusCard({ pet, onNavigate }: { pet: Pet; onNavigate: (tab: string) => void }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h3 className="flex items-center gap-2 text-lg font-semibold">
        {pet.is_lost ? <ShieldAlert className="h-5 w-5 text-destructive" /> : <ShieldCheck className="h-5 w-5 text-primary" />}
        Status
      </h3>
      {pet.is_lost ? (
        <div className="mt-3 space-y-1.5">
          <p className="text-sm font-semibold text-destructive">Perdido desde {formatDateTime(pet.lost_since)}</p>
          {pet.reward_amount ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Gift className="h-4 w-4" /> Recompensa: {formatCurrencyBRL(pet.reward_amount)}</p>
          ) : null}
          <Button size="sm" variant="outline" className="mt-2 rounded-full" onClick={() => onNavigate("lost")}>
            Gerenciar modo perdido
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Seguro.</span> Nenhuma ocorrência de perda ativa.
        </p>
      )}
    </section>
  );
}

/* -------------------- 6. Recent Timeline -------------------- */

function RecentTimelineCard({
  events,
  onNavigate,
}: {
  events: { id: string; type: string; title: string; subtitle?: string; date: string; icon: LucideIcon; color: string }[];
  onNavigate: (tab: string) => void;
}) {
  const recent = events.slice(0, 5);
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="h-5 w-5" /> Atividade recente</h3>
        <button onClick={() => onNavigate("timeline")} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          Ver linha do tempo completa <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      {recent.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {recent.map((e) => {
            const Icon = e.icon;
            return (
              <li key={e.id} className="flex items-center gap-3 text-sm">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${e.color}22`, color: e.color }}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate">{e.title}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(e.date)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* -------------------- Add appointment dialog (used by hero quick actions) -------------------- */

function AddAppointmentDialog({ petId, open, onOpenChange }: { petId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ reason: "", scheduled_at: "", vet_name: "", clinic: "" });

  const add = useMutation({
    mutationFn: async () => {
      if (!form.scheduled_at) throw new Error("Informe a data e hora da consulta.");
      const { error } = await supabase.from("appointments").insert({
        pet_id: petId,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        reason: form.reason || null,
        vet_name: form.vet_name || null,
        clinic: form.clinic || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Consulta agendada");
      qc.invalidateQueries({ queryKey: ["health-timeline", petId] });
      qc.invalidateQueries({ queryKey: ["pet-indicators", petId] });
      qc.invalidateQueries({ queryKey: ["home-agenda"] });
      onOpenChange(false);
      setForm({ reason: "", scheduled_at: "", vet_name: "", clinic: "" });
    },
    onError: (e: unknown) => toast.error(logAndDescribeError("DashboardTab: schedule appointment failed", e, "Não foi possível agendar a consulta.")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Agendar consulta</DialogTitle></DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Data e hora *</Label>
            <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label>Motivo</Label>
            <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Ex.: Check-up anual" />
          </div>
          <div>
            <Label>Veterinário</Label>
            <Input value={form.vet_name} onChange={(e) => setForm({ ...form, vet_name: e.target.value })} />
          </div>
          <div>
            <Label>Clínica</Label>
            <Input value={form.clinic} onChange={(e) => setForm({ ...form, clinic: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => add.mutate()} disabled={add.isPending}>{add.isPending ? "Salvando…" : "Agendar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
