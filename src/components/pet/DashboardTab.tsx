import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useHealthTimeline, type HealthTimelinePet, HEALTH_TIMELINE_ENTRIES_WINDOW_DAYS } from "@/hooks/useHealthTimeline";
import { useQuickLogEntry } from "@/hooks/useQuickLogEntry";
import { QuickLogControl } from "@/components/pet/QuickLogControl";
import { computeHealthScore } from "@/lib/health-score";
import { buildPetInsights, type PetInsight } from "@/lib/pet-insights";
import { buildPetReport } from "@/lib/pet-reports";
import { DOCUMENT_STATUS_TYPES, documentMatchesType, parseProfileExtras } from "@/lib/pet-profile";
import { withDismissedInsight } from "@/lib/pet-memory";
import { CATEGORY_META, computeStats, dayKey, formatTrackerProgress, sumTrackerEntriesCompatible, todayKey, type TrackerCategory } from "@/lib/daily-care";
import { logAndDescribeError } from "@/lib/errors";
import { useCountUp } from "@/hooks/useCountUp";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Check, ChevronRight, FileText, HeartPulse, ListChecks, QrCode, Syringe, Weight,
} from "lucide-react";
import { useEntitlements } from "@/hooks/useEntitlements";
import { planUnlockLabel } from "@/lib/entitlements";
import { Link } from "@tanstack/react-router";

type Pet = HealthTimelinePet & {
  is_lost: boolean;
  lost_since: string | null;
  reward_amount: number | null;
  weight_kg: number | null;
  photo_url: string | null;
  breed: string | null;
  birth_date?: string | null;
  sex?: string | null;
  microchip?: string | null;
  secondary_contact_name?: string | null;
  secondary_contact_phone?: string | null;
  profile_extras?: unknown;
};

type EntryRow = {
  value: number;
  completed_at: string;
  metadata?: unknown;
  trackers: { id: string } | null;
};
type WeightRow = { weight_kg: number; measured_at: string };
type VaccineRow = { id: string; name: string; next_dose: string | null };
type DocRow = { id: string; title: string; category: string | null };

export function DashboardTab({
  pet,
  onNavigate,
  autoOpenAppointment,
  onConsumeAutoOpen,
}: {
  pet: Pet;
  onNavigate: (tab: string, action?: string) => void;
  autoOpenAppointment?: boolean;
  onConsumeAutoOpen?: () => void;
}) {
  const { data, isLoading } = useHealthTimeline(pet);
  const { canUseAssistant } = useEntitlements();
  const qc = useQueryClient();
  const [apptOpen, setApptOpen] = useState(false);

  useEffect(() => {
    if (autoOpenAppointment) {
      setApptOpen(true);
      onConsumeAutoOpen?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenAppointment]);

  const weightRows = data?.weightRows ?? [];
  const vaccineRows = data?.vaccineRows ?? [];
  const appointmentRows = data?.appointmentRows ?? [];
  const documentRows = data?.documentRows ?? [];
  const trackerRows = data?.trackerRows ?? [];
  const entryRows = data?.entryRows ?? [];
  const events = data?.events ?? [];

  const normalizedEntries = useMemo(
    () =>
      entryRows.map((e) => ({
        tracker_id: e.trackers?.id ?? "",
        value: e.value,
        completed_at: e.completed_at,
        metadata: (e as { metadata?: unknown }).metadata,
      })),
    [entryRows],
  );

  const report = useMemo(
    () =>
      buildPetReport(
        {
          pet: { id: pet.id, name: pet.name, created_at: pet.created_at },
          trackers: trackerRows,
          entries: normalizedEntries,
          weights: weightRows,
          vaccines: vaccineRows,
          appointments: appointmentRows,
        },
        30,
      ),
    [pet.id, pet.name, pet.created_at, trackerRows, normalizedEntries, weightRows, vaccineRows, appointmentRows],
  );

  const insights = useMemo(
    () =>
      buildPetInsights({
        pet,
        trackers: trackerRows,
        entries: normalizedEntries,
        weights: weightRows,
        vaccines: vaccineRows,
        appointments: appointmentRows,
        documents: documentRows,
        events,
        report,
      }),
    [pet, trackerRows, normalizedEntries, weightRows, vaccineRows, appointmentRows, documentRows, events, report],
  );

  const health = useMemo(() => {
    const now = Date.now();
    const activeTrackers = trackerRows.filter((t) => t.is_active);
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
      todayPct: stats.todayCompletionPct,
    };
  }, [pet.is_lost, weightRows, vaccineRows, appointmentRows, trackerRows, normalizedEntries]);

  const quickLog = useQuickLogEntry(pet.id, [
    ["health-timeline", pet.id],
    ["tracker-entries", pet.id],
    ["trackers", pet.id],
    ["today-care-overview"],
    ["home-agenda"],
  ]);

  const handleInsightAction = (insight: PetInsight) => {
    const action = insight.action;
    if (!action) return;
    if (action.kind === "quick_log") {
      quickLog.mutate({
        tracker: { id: action.trackerId, category: action.category, title: action.trackerTitle, unit: action.unit },
        value: action.value,
      });
      return;
    }
    if (action.kind === "navigate" && action.action === "appointment") {
      setApptOpen(true);
      return;
    }
    onNavigate(action.tab, action.action);
  };

  const dismissInsight = useMutation({
    mutationFn: async (insight: PetInsight) => {
      const extras = parseProfileExtras(pet.profile_extras);
      const nextExtras = {
        ...extras,
        assistant: { ...extras.assistant, memory: withDismissedInsight(extras.assistant?.memory, insight.id, new Date()) },
      };
      const { error } = await supabase.from("pets").update({ profile_extras: nextExtras }).eq("id", pet.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pet", pet.id] });
    },
    onError: (e: unknown) =>
      toast.error(logAndDescribeError("DashboardTab: dismiss insight failed", e, "Não foi possível ocultar essa recomendação.")),
  });

  const topInsight = useMemo(() => {
    if (canUseAssistant) return insights[0] ?? null;
    return insights.find((i) => i.category === "lost") ?? null;
  }, [insights, canUseAssistant]);
  const assistantLocked = !canUseAssistant && !topInsight;
  const statusSentence = useMemo(
    () => buildStatusSentence(pet.name, topInsight, health.todayPct, pet.is_lost),
    [pet.name, pet.is_lost, topInsight, health.todayPct],
  );

  if (isLoading) {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <span className="sr-only">Carregando dashboard do pet…</span>
        <Skeleton className="h-28 w-full rounded-3xl" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="animate-in fade-in text-sm text-muted-foreground duration-500">
        Visão geral de {pet.name}
      </p>

      <AssistantBrainCard
        score={health.result.score}
        label={health.result.label}
        color={health.result.color}
        insight={topInsight}
        fallbackSentence={statusSentence}
        todayPct={health.todayPct}
        onAction={handleInsightAction}
        onDismiss={topInsight && canUseAssistant ? () => dismissInsight.mutate(topInsight) : undefined}
        pending={quickLog.isPending}
        locked={assistantLocked}
      />

      <TodaysCareCard
        trackerRows={trackerRows}
        entryRows={entryRows}
        entries={normalizedEntries}
        onNavigate={onNavigate}
        quickLog={quickLog}
      />

      <section className="rounded-2xl border border-primary/20 bg-card p-4 shadow-[var(--shadow-card)] sm:p-5">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary-foreground"
            style={{ background: "var(--gradient-brand)" }}
          >
            <QrCode className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-foreground">QR Code do {pet.name}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Use este QR Code na identificação do seu pet. Quem escanear poderá acessar apenas as
              informações públicas que você escolher.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                type="button"
                size="sm"
                className="min-h-10 rounded-full"
                onClick={() => onNavigate("qr")}
              >
                Ver QR Code
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-10 rounded-full"
                onClick={() => onNavigate("qr")}
              >
                Configurar perfil público
              </Button>
            </div>
          </div>
        </div>
      </section>

      <SummaryRows
        weightRows={weightRows}
        vaccineRows={vaccineRows}
        documentRows={documentRows}
        onNavigate={onNavigate}
      />

      <AddAppointmentDialog petId={pet.id} open={apptOpen} onOpenChange={setApptOpen} />
    </div>
  );
}

/* -------------------- Health Score + Assistant (one card) -------------------- */

function AssistantBrainCard({
  score,
  label,
  color,
  insight,
  fallbackSentence,
  todayPct,
  onAction,
  onDismiss,
  pending,
  locked,
}: {
  score: number;
  label: string;
  color: string;
  insight: PetInsight | null;
  fallbackSentence: string;
  todayPct: number;
  onAction: (insight: PetInsight) => void;
  onDismiss?: () => void;
  pending: boolean;
  locked?: boolean;
}) {
  const displayScore = useCountUp(score);
  const fallback =
    todayPct >= 100 ? "Rotina de hoje concluída. Continue assim!" : fallbackSentence;
  const title = locked
    ? "Assistente disponível no Guardião"
    : insight?.title?.trim() || fallback;
  const detail = locked
    ? planUnlockLabel("assistant")
    : insight?.description?.trim() && insight.description.trim() !== title
      ? insight.description.trim()
      : null;
  const action = locked ? null : insight?.action ?? null;
  const isCritical = insight?.priority === "critical" || insight?.priority === "attention";

  return (
    <section
      className={cn(
        "animate-in fade-in slide-in-from-bottom-1 rounded-2xl border bg-card p-4 shadow-[var(--shadow-card)] duration-500 sm:p-5",
        isCritical ? "border-destructive/30" : "border-border",
      )}
    >
      <div className="flex items-start gap-3.5">
        <div
          className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl"
          style={{ backgroundColor: `${color}18`, color }}
        >
          <HeartPulse className="mb-0.5 h-4 w-4 opacity-80" />
          <span className="text-lg font-extrabold tabular-nums leading-none">{displayScore}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Health Score</p>
          <p className="text-base font-semibold" style={{ color }}>
            {label}
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-border/70 pt-3.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assistente</p>
        <p className="mt-1.5 text-sm font-medium leading-snug text-foreground">{title}</p>
        {detail && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{detail}</p>
        )}
        {locked ? (
          <div className="mt-3">
            <Button asChild size="sm" className="rounded-full">
              <Link to="/pricing">Ver planos</Link>
            </Button>
          </div>
        ) : null}
        {!locked ? (
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            O Assistente PetID é informativo e organizacional: organiza dados que você registra. Não
            substitui médico-veterinário, não fornece diagnóstico definitivo, não substitui exame
            clínico e não deve ser usado em emergências. Em urgência, procure atendimento
            veterinário adequado.
          </p>
        ) : null}
      </div>

      {action && insight && (
        <div className="mt-3.5 flex items-center gap-2">
          <Button
            className="min-h-11 flex-1 rounded-full"
            disabled={pending}
            variant={isCritical ? "destructive" : "default"}
            onClick={() => onAction(insight)}
          >
            {action.label}
          </Button>
          {onDismiss && (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 min-w-11 shrink-0 rounded-full px-3 text-muted-foreground"
              onClick={onDismiss}
              aria-label="Ocultar recomendação por hoje"
            >
              Depois
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

/* -------------------- Today's Care (pending only) -------------------- */

function TodaysCareCard({
  trackerRows,
  entryRows,
  entries,
  onNavigate,
  quickLog,
}: {
  trackerRows: {
    id: string;
    title: string;
    category: TrackerCategory;
    is_active: boolean;
    target_per_day: number;
    unit: string | null;
    color: string | null;
  }[];
  entryRows: EntryRow[];
  entries: { tracker_id: string; value: number; completed_at: string }[];
  onNavigate: (tab: string) => void;
  quickLog: ReturnType<typeof useQuickLogEntry>;
}) {
  const todaySums = useMemo(() => {
    const key = todayKey();
    const map = new Map<string, number>();
    const asEntries = entryRows.map((e) => ({
      tracker_id: e.trackers?.id ?? "",
      value: e.value,
      completed_at: e.completed_at,
      metadata: e.metadata,
    }));
    for (const t of trackerRows) {
      map.set(t.id, sumTrackerEntriesCompatible(asEntries, t.id, t.unit, { day: key }));
    }
    return map;
  }, [entryRows, trackerRows]);

  const active = trackerRows.filter((t) => t.is_active);
  const pending = active.filter((t) => (todaySums.get(t.id) ?? 0) < t.target_per_day);
  const completed = active.length - pending.length;
  const overallPct =
    active.length > 0
      ? Math.round(
          (active.reduce((sum, t) => sum + Math.min(1, (todaySums.get(t.id) ?? 0) / (t.target_per_day || 1)), 0) /
            active.length) *
            100,
        )
      : 0;

  return (
    <section className="animate-in fade-in slide-in-from-bottom-1 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] duration-500">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Rotina de hoje</h3>
        <button
          type="button"
          onClick={() => onNavigate("daily-care")}
          className="inline-flex min-h-10 items-center text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Ver tudo
        </button>
      </div>

      {active.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            size="sm"
            icon={ListChecks}
            title="Nenhuma rotina configurada"
            description="Crie uma rotina de água, alimentação e passeios para acompanhar o dia a dia."
            action={{ label: "Configurar rotina", onClick: () => onNavigate("daily-care") }}
          />
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground">{completed}</span> / {active.length} concluídos
            </span>
            <span className="tabular-nums text-muted-foreground">{overallPct}%</span>
          </div>
          <Progress value={overallPct} className="mt-2 h-2" />

          {pending.length === 0 ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Check className="h-4 w-4 text-emerald-600" />
              Tudo concluído por hoje.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {pending.map((t) => {
                const meta = CATEGORY_META[t.category];
                const Icon = meta.icon;
                const value = todaySums.get(t.id) ?? 0;
                return (
                  <li key={t.id} className="flex min-h-14 flex-wrap items-center gap-3 py-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-border">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1 basis-[8rem]">
                      <p className="truncate text-sm font-medium">{t.title}</p>
                      <p className="break-words text-xs text-muted-foreground">
                        {formatTrackerProgress(value, t.target_per_day, t.unit ?? meta.unit)}
                      </p>
                    </div>
                    <div className="ml-auto max-w-full shrink-0">
                      <QuickLogControl
                        tracker={t}
                        onLog={(v) => quickLog.mutate({ tracker: t, value: v })}
                        pending={quickLog.isPending}
                        refreshToken={value}
                        entries={entries}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/* -------------------- Tiny summary rows -------------------- */

function SummaryRows({
  weightRows,
  vaccineRows,
  documentRows,
  onNavigate,
}: {
  weightRows: WeightRow[];
  vaccineRows: VaccineRow[];
  documentRows: DocRow[];
  onNavigate: (tab: string, action?: string) => void;
}) {
  const weight = useMemo(() => {
    if (weightRows.length === 0) return { primary: "Sem registro", secondary: "Registrar primeira pesagem" };
    const latest = [...weightRows].sort((a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime())[0];
    const days = Math.floor((Date.now() - new Date(latest.measured_at).getTime()) / 86400000);
    return {
      primary: `${latest.weight_kg} kg`,
      secondary: days === 0 ? "Atualizado hoje" : days === 1 ? "Atualizado há 1 dia" : `Atualizado há ${days} dias`,
    };
  }, [weightRows]);

  const vaccines = useMemo(() => {
    if (vaccineRows.length === 0) return { primary: "Sem vacinas", secondary: "Adicionar carteira" };
    const now = Date.now();
    const overdue = vaccineRows.filter((v) => v.next_dose && new Date(v.next_dose).getTime() < now).length;
    const soon = vaccineRows.filter((v) => {
      if (!v.next_dose) return false;
      const t = new Date(v.next_dose).getTime();
      const days = (t - now) / 86400000;
      return days >= 0 && days <= 30;
    }).length;
    if (overdue > 0) {
      return {
        primary: `${overdue} atrasada${overdue === 1 ? "" : "s"}`,
        secondary: "Atualizar em Saúde",
      };
    }
    if (soon > 0) {
      return {
        primary: `${soon} próxima${soon === 1 ? "" : "s"}`,
        secondary: "Vence em até 30 dias",
      };
    }
    return { primary: "Todas em dia", secondary: "Nenhuma dose pendente" };
  }, [vaccineRows]);

  const documents = useMemo(() => {
    const missing = DOCUMENT_STATUS_TYPES.filter(
      (t) => !documentRows.some((d) => documentMatchesType(d, t.match) || (d.category && t.match.some((re) => re.test(d.category!)))),
    ).length;
    if (documentRows.length === 0) {
      return { primary: "Nenhum documento", secondary: "Começar cadastro" };
    }
    if (missing > 0) {
      return {
        primary: `${missing} pendente${missing === 1 ? "" : "s"}`,
        secondary: `${documentRows.length} cadastrado${documentRows.length === 1 ? "" : "s"}`,
      };
    }
    return { primary: "Em dia", secondary: `${documentRows.length} documento${documentRows.length === 1 ? "" : "s"}` };
  }, [documentRows]);

  const rows = [
    { key: "weight", label: "Peso", icon: Weight, ...weight, tab: "health", action: weightRows.length === 0 ? "weight" : undefined },
    { key: "vaccines", label: "Vacinas", icon: Syringe, ...vaccines, tab: "health", action: vaccineRows.length === 0 ? "vaccine" : undefined },
    { key: "documents", label: "Documentos", icon: FileText, ...documents, tab: "documents", action: undefined as string | undefined },
  ] as const;

  return (
    <section className="animate-in fade-in slide-in-from-bottom-1 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] duration-500">
      {rows.map((row, index) => {
        const Icon = row.icon;
        return (
          <button
            key={row.key}
            type="button"
            onClick={() => onNavigate(row.tab, row.action)}
            className={cn(
              "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              index > 0 && "border-t border-border",
            )}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{row.label}</p>
              <p className="truncate text-sm font-semibold">{row.primary}</p>
              <p className="truncate text-xs text-muted-foreground">{row.secondary}</p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        );
      })}
    </section>
  );
}

/* -------------------- Helpers -------------------- */

function buildStatusSentence(petName: string, insight: PetInsight | null, todayPct: number, isLost: boolean): string {
  if (isLost) return `${petName} está em modo perdido.`;
  if (insight) {
    const t = insight.title.trim();
    return /[.!?]$/.test(t) ? t : `${t}.`;
  }
  if (todayPct >= 100) return `${petName} está muito bem hoje.`;
  if (todayPct > 0) return `${petName} está no caminho certo hoje.`;
  return `${petName} ainda não registrou cuidados hoje.`;
}

/* -------------------- Appointment dialog (deep-link / assistant) -------------------- */

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
    onError: (e: unknown) =>
      toast.error(logAndDescribeError("DashboardTab: schedule appointment failed", e, "Não foi possível agendar a consulta.")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agendar consulta</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Data e hora *</Label>
            <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
          </div>
          <div>
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
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => add.mutate()} disabled={add.isPending}>
            {add.isPending ? "Salvando…" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
