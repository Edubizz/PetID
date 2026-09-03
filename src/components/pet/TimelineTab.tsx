import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useHealthTimeline, type HealthTimelinePet, HEALTH_TIMELINE_ENTRIES_WINDOW_DAYS } from "@/hooks/useHealthTimeline";
import { useEntitlements } from "@/hooks/useEntitlements";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Search, Pin, PinOff, Cake, TrendingUp, TrendingDown, Minus, CalendarClock, Pill, Sparkles, ExternalLink,
  ListChecks, type LucideIcon,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import {
  TIMELINE_FILTERS,
  matchesFilter,
  groupByBucket,
  usePinnedEvents,
  type TimelineEvent,
  type FilterKey,
} from "@/lib/timeline";
import { computeAge, formatCurrencyBRL, formatDate, formatDateTime } from "@/lib/pet-utils";
import { computeStats } from "@/lib/daily-care";

type Pet = HealthTimelinePet;

export function TimelineTab({ pet, onNavigate }: { pet: Pet; onNavigate?: (tab: string) => void }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<TimelineEvent | null>(null);
  const { pins, toggle: togglePin } = usePinnedEvents(pet.id);
  const { historyCutoffIso, historyDays } = useEntitlements();

  const { data, isLoading } = useHealthTimeline(pet);

  const summary = useMemo(() => {
    const weightRows = data?.weightRows ?? [];
    const appointmentRows = data?.appointmentRows ?? [];
    const trackerRows = data?.trackerRows ?? [];
    const entryRows = data?.entryRows ?? [];

    const weightTrend: "up" | "down" | "stable" | null =
      weightRows.length >= 2
        ? weightRows[0].weight_kg > weightRows[1].weight_kg
          ? "up"
          : weightRows[0].weight_kg < weightRows[1].weight_kg
            ? "down"
            : "stable"
        : null;

    const upcomingAppointments = appointmentRows.filter((a) => new Date(a.scheduled_at).getTime() >= Date.now()).length;

    const activeMedicationTrackers = trackerRows.filter((t) => t.is_active && t.category === "medication").length;

    const stats = computeStats(
      trackerRows,
      entryRows.map((e) => ({ tracker_id: e.trackers?.id ?? "", value: e.value, completed_at: e.completed_at })),
      HEALTH_TIMELINE_ENTRIES_WINDOW_DAYS,
    );

    return { weightTrend, upcomingAppointments, activeMedicationTrackers, dailyCompletionPct: stats.todayCompletionPct };
  }, [data]);

  const filteredEvents = useMemo(() => {
    const all = data?.events ?? [];
    const cutoffMs = historyCutoffIso ? new Date(historyCutoffIso).getTime() : null;
    const q = search.trim().toLowerCase();
    return all.filter((e) => {
      if (cutoffMs != null && new Date(e.date).getTime() < cutoffMs) return false;
      if (!matchesFilter(e, filter)) return false;
      if (!q) return true;
      return e.title.toLowerCase().includes(q) || (e.subtitle ?? "").toLowerCase().includes(q);
    });
  }, [data, filter, search, historyCutoffIso]);

  const hasHiddenHistory = Boolean(
    historyDays != null &&
      data?.events &&
      data.events.some((e) =>
        historyCutoffIso ? new Date(e.date).getTime() < new Date(historyCutoffIso).getTime() : false,
      ),
  );

  const pinnedEvents = useMemo(
    () => filteredEvents.filter((e) => pins.has(e.id)),
    [filteredEvents, pins],
  );
  const unpinnedEvents = useMemo(
    () => filteredEvents.filter((e) => !pins.has(e.id)),
    [filteredEvents, pins],
  );
  const buckets = useMemo(() => groupByBucket(unpinnedEvents), [unpinnedEvents]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SummaryBar pet={pet} summary={summary} />

      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar na linha do tempo…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {TIMELINE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {hasHiddenHistory ? (
        <p className="text-xs text-muted-foreground">
          Histórico completo disponível no Guardião.{" "}
          <Link to="/pricing" className="font-medium text-primary hover:underline">
            Ver planos
          </Link>
        </p>
      ) : null}

      {pinnedEvents.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Pin className="h-3.5 w-3.5" /> Fixados
          </h3>
          <div className="space-y-2">
            {pinnedEvents.map((e) => (
              <EventRow key={e.id} event={e} pinned onTogglePin={() => togglePin(e.id)} onClick={() => setSelected(e)} />
            ))}
          </div>
        </section>
      )}

      {buckets.length === 0 && pinnedEvents.length === 0 ? (
        search || filter !== "all" ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Nenhum evento encontrado.
          </div>
        ) : (
          <EmptyState
            icon={Sparkles}
            title="Nenhum evento ainda"
            description="Toda vez que você registrar cuidados, vacinas, pesagens ou consultas, eles aparecem aqui em ordem cronológica."
            action={onNavigate ? { label: "Começar pela rotina", icon: ListChecks, onClick: () => onNavigate("daily-care") } : undefined}
          />
        )
      ) : (
        buckets.map((bucket) => (
          <section key={bucket.key}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{bucket.label}</h3>
            <div className="space-y-2">
              {bucket.events.map((e) => (
                <EventRow key={e.id} event={e} pinned={false} onTogglePin={() => togglePin(e.id)} onClick={() => setSelected(e)} />
              ))}
            </div>
          </section>
        ))
      )}

      <EventDetailDialog event={selected} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}

/* -------------------- Summary -------------------- */

function SummaryBar({
  pet,
  summary,
}: {
  pet: Pet;
  summary: { weightTrend: "up" | "down" | "stable" | null; upcomingAppointments: number; activeMedicationTrackers: number; dailyCompletionPct: number };
}) {
  const TrendIcon = summary.weightTrend === "up" ? TrendingUp : summary.weightTrend === "down" ? TrendingDown : Minus;
  const trendLabel = summary.weightTrend === "up" ? "Subindo" : summary.weightTrend === "down" ? "Descendo" : summary.weightTrend === "stable" ? "Estável" : "—";

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <SummaryCard icon={Cake} label="Idade" value={computeAge(pet.birth_date)} />
      <SummaryCard icon={TrendIcon} label="Tendência de peso" value={trendLabel} />
      <SummaryCard icon={CalendarClock} label="Próximas consultas" value={String(summary.upcomingAppointments)} />
      <SummaryCard
        icon={Pill}
        label="Medicações ativas"
        value={summary.activeMedicationTrackers > 0 ? String(summary.activeMedicationTrackers) : pet.medications ? "Ver perfil" : "—"}
      />
      <SummaryCard icon={Sparkles} label="Rotina hoje" value={`${summary.dailyCompletionPct}%`} />
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-card)]">
      <Icon className="h-4 w-4 text-primary" />
      <p className="mt-1.5 truncate text-lg font-bold">{value}</p>
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

/* -------------------- Event row -------------------- */

function EventRow({
  event,
  pinned,
  onTogglePin,
  onClick,
}: {
  event: TimelineEvent;
  pinned: boolean;
  onTogglePin: () => void;
  onClick: () => void;
}) {
  const Icon = event.icon;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-[var(--shadow-card)]">
      <button onClick={onClick} className="flex flex-1 items-center gap-3 text-left">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${event.color}22`, color: event.color }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{event.title}</p>
          {event.subtitle ? <p className="truncate text-xs text-muted-foreground">{event.subtitle}</p> : null}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(event.date)}</span>
      </button>
      <button
        onClick={(ev) => {
          ev.stopPropagation();
          onTogglePin();
        }}
        className="shrink-0 text-muted-foreground hover:text-primary"
        title={pinned ? "Desafixar" : "Fixar"}
      >
        {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
      </button>
    </div>
  );
}

/* -------------------- Detail dialog -------------------- */

function EventDetailDialog({ event, onOpenChange }: { event: TimelineEvent | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={!!event} onOpenChange={onOpenChange}>
      <DialogContent>
        {event && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${event.color}22`, color: event.color }}
                >
                  <event.icon className="h-3.5 w-3.5" />
                </span>
                {event.title}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p className="text-xs text-muted-foreground">{formatDateTime(event.date)}</p>
              {event.subtitle ? <p>{event.subtitle}</p> : null}
              <DetailFields event={event} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailFields({ event }: { event: TimelineEvent }) {
  const m = event.metadata as Record<string, unknown>;
  const row = (label: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return null;
    return (
      <div key={label} className="flex justify-between gap-4 border-t border-border pt-2 first:border-0 first:pt-0">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-right font-medium">{String(value)}</span>
      </div>
    );
  };

  switch (event.type) {
    case "weight":
      return <div className="space-y-2">{row("Peso", `${m.weight_kg} kg`)}{row("Data", formatDate(m.measured_at as string))}{row("Observação", m.notes)}</div>;
    case "vaccine":
      return <div className="space-y-2">{row("Vacina", m.name)}{row("Aplicada em", formatDate(m.applied_at as string))}{row("Próxima dose", m.next_dose ? formatDate(m.next_dose as string) : null)}{row("Veterinário", m.vet_name)}{row("Observação", m.notes)}</div>;
    case "appointment":
      return <div className="space-y-2">{row("Data", formatDateTime(m.scheduled_at as string))}{row("Motivo", m.reason)}{row("Veterinário", m.vet_name)}{row("Clínica", m.clinic)}{row("Observação", m.notes)}</div>;
    case "document":
      return (
        <div className="space-y-2">
          {row("Categoria", m.category)}
          {row("Adicionado em", formatDateTime(m.created_at as string))}
          {m.url ? (
            <Button size="sm" variant="outline" asChild className="mt-1">
              <a href={m.url as string} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" /> Abrir documento
              </a>
            </Button>
          ) : null}
        </div>
      );
    case "daily_care":
      return <div className="space-y-2">{row("Valor", m.value)}{row("Observação", m.notes)}</div>;
    case "lost_mode":
      return <div className="space-y-2">{row("Evento", m.event === "activated" ? "Ativado" : "Resolvido")}{row("Local visto por último", m.last_seen_location)}{row("Recompensa", m.reward_amount ? formatCurrencyBRL(m.reward_amount as number) : null)}</div>;
    case "sighting":
      return (
        <div className="space-y-2">
          {row("Reportado por", m.reporter_name)}
          {row("Contato", m.reporter_contact)}
          {row("Local", m.location)}
          {row("Mensagem", m.message)}
          {m.photo_url ? <img src={m.photo_url as string} alt="Foto do avistamento" className="mt-2 h-32 w-32 rounded-lg object-cover" /> : null}
        </div>
      );
    case "verification":
      return <div className="space-y-2">{row("Status", m.status)}{row("Revisado em", m.reviewed_at ? formatDateTime(m.reviewed_at as string) : null)}{row("Observação", m.notes)}</div>;
    case "milestone":
    default:
      return null;
  }
}
