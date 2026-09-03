import { useMemo } from "react";
import { createFileRoute, Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useTodaysCare } from "@/hooks/useTodaysCare";
import { useHomeAgenda } from "@/hooks/useHomeAgenda";
import { useQuickLogEntry } from "@/hooks/useQuickLogEntry";
import {
  buildHouseholdBriefing,
  type BriefingBullet,
  type InsightQuickLogAction,
  type PetInsightsInput,
} from "@/lib/pet-insights";
import { useCountUp } from "@/hooks/useCountUp";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Dog,
  Plus,
  AlertTriangle,
  CalendarClock,
  PartyPopper,
  ShieldAlert,
  HeartPulse,
  ChevronRight,
  QrCode,
} from "lucide-react";
import { DashboardRemindersCard } from "@/components/reminders/DashboardRemindersCard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function firstNameFromUser(user: { user_metadata?: Record<string, unknown>; email?: string | null } | null | undefined): string | null {
  const meta = user?.user_metadata ?? {};
  const raw = (typeof meta.full_name === "string" && meta.full_name) || (typeof meta.name === "string" && meta.name) || "";
  const first = raw.trim().split(/\s+/)[0];
  if (first) return first;
  const email = user?.email;
  if (email) return email.split("@")[0] ?? null;
  return null;
}

function Dashboard() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  const care = useTodaysCare();
  const agenda = useHomeAgenda(care.petSummaries.map((s) => ({ id: s.pet.id, name: s.pet.name })));
  const navigate = useNavigate();

  const lostPets = care.petSummaries.filter((s) => s.pet.is_lost);
  const isLoading = care.isLoading;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const firstName = firstNameFromUser(user);

  const householdInputs = useMemo(() => {
    const pets = care.data?.pets ?? [];
    const trackers = care.data?.trackers ?? [];
    const entries = care.data?.entries ?? [];
    const vaccineRows = agenda.data?.vaccineRows ?? [];
    const appointmentRows = agenda.data?.appointmentRows ?? [];
    const weightRows = agenda.data?.weightRows ?? [];
    if (pets.length === 0) return [] as PetInsightsInput[];

    return pets.map((pet) => ({
      pet: {
        id: pet.id,
        name: pet.name,
        is_lost: pet.is_lost,
        photo_url: pet.photo_url,
        breed: pet.breed,
      },
      trackers: trackers.filter((t) => t.pet_id === pet.id),
      entries: entries
        .filter((e) => e.pet_id === pet.id)
        .map((e) => ({ tracker_id: e.tracker_id, value: e.value, completed_at: e.completed_at })),
      weights: weightRows
        .filter((w) => w.pet_id === pet.id)
        .map((w) => ({ weight_kg: w.weight_kg, measured_at: w.measured_at })),
      vaccines: vaccineRows
        .filter((v) => v.pet_id === pet.id)
        .map((v) => ({ id: v.id, name: v.name, applied_at: v.applied_at, next_dose: v.next_dose })),
      appointments: appointmentRows
        .filter((a) => a.pet_id === pet.id)
        .map((a) => ({ id: a.id, scheduled_at: a.scheduled_at, reason: a.reason })),
    }));
  }, [care.data, agenda.data]);

  const briefing = useMemo(() => buildHouseholdBriefing(householdInputs), [householdInputs]);

  const handleNavigateAction = (bullet: BriefingBullet) => {
    if (!bullet.petId || bullet.action?.kind !== "navigate") return;
    const { tab, action } = bullet.action;
    navigate({
      to: "/pets/$id",
      params: { id: bullet.petId },
      search: action ? { tab, action } : { tab },
    });
  };

  const summaryLine = useMemo(() => {
    const total = care.petSummaries.length;
    if (total === 0) return null;
    if (lostPets.length > 0) {
      return lostPets.length === 1
        ? `${lostPets[0].pet.name} está em modo perdido.`
        : `${lostPets.length} pets em modo perdido.`;
    }
    const great = care.healthyCount;
    if (care.totalActive === 0) return "Configure cuidados diários para acompanhar o dia.";
    if (great === total) return total === 1 ? "Seu pet está em dia hoje." : "Todos os pets estão bem hoje.";
    if (great === 0) return total === 1 ? "Seu pet precisa de atenção hoje." : "Seus pets precisam de atenção hoje.";
    return `${great} de ${total} pets estão bem hoje.`;
  }, [care.petSummaries.length, care.healthyCount, care.totalActive, lostPets]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Geral</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight sm:text-3xl">
            {firstName ? `${greeting}, ${firstName}` : greeting}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {summaryLine ?? "Visão geral dos seus pets"}
          </p>
        </div>
        <Button asChild size="sm" variant="outline" className="min-h-11 shrink-0 rounded-full px-4">
          <Link to="/pets/new">
            <Plus className="mr-1.5 h-4 w-4" />
            Pet
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-6 space-y-4" role="status" aria-live="polite">
          <span className="sr-only">Carregando seu painel…</span>
          <Skeleton className="h-64 w-full rounded-3xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      ) : care.petSummaries.length === 0 ? (
        care.isError ? (
          <div className="mt-8 rounded-2xl border border-border bg-card p-8 text-center">
            <p className="font-medium">Não foi possível carregar seus pets</p>
            <p className="mt-1 text-sm text-muted-foreground">Verifique a conexão e tente novamente.</p>
            <Button
              type="button"
              variant="outline"
              className="mt-4 min-h-11 rounded-full"
              onClick={() => care.refetch()}
            >
              Tentar novamente
            </Button>
          </div>
        ) : (
        <div className="animate-in fade-in mt-8 duration-500">
          <EmptyState
            icon={Dog}
            title="Nenhum pet cadastrado ainda"
            description="Crie o primeiro perfil digital do seu pet para começar a receber recomendações personalizadas do assistente PetID."
            action={{ label: "Adicionar pet", icon: Plus, onClick: () => navigate({ to: "/pets/new" }) }}
            className="p-12"
          />
        </div>
        )
      ) : (
        <div className="mt-6 space-y-5">
          {lostPets.length > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-destructive">
                  {lostPets.length === 1
                    ? `${lostPets[0].pet.name} em modo perdido`
                    : `${lostPets.length} pets em modo perdido`}
                </p>
              </div>
              <Button asChild variant="destructive" size="sm" className="shrink-0 rounded-full">
                <Link to="/pets/$id" params={{ id: lostPets[0].pet.id }} search={{ tab: "lost" }}>
                  Ver
                </Link>
              </Button>
            </div>
          )}

          <HomeHero
            bullets={briefing}
            overallPct={care.overallPct}
            totalActive={care.totalActive}
            totalCompleted={care.totalCompleted}
            agendaLoading={agenda.isLoading}
            onNavigate={handleNavigateAction}
          />

          <section className="rounded-2xl border border-primary/20 bg-card px-4 py-4 shadow-[var(--shadow-card)]">
            <div className="flex items-start gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary-foreground"
                style={{ background: "var(--gradient-brand)" }}
              >
                <QrCode className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-foreground">QR Code dos seus pets</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Identificação permanente para a coleira. Quem escanear vê só o que você deixar público.
                </p>
                <Button asChild size="sm" variant="outline" className="mt-3 min-h-10 rounded-full">
                  <Link to="/qr">Ver QR Codes</Link>
                </Button>
              </div>
            </div>
          </section>

          <DashboardRemindersCard />

          <HouseholdStatusStrip
            healthy={care.healthyCount}
            needsAttention={care.needsAttentionCount}
            lost={lostPets.length}
            upcoming={agenda.upcoming.length}
          />

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Seus pets</h2>
              <Link
                to="/pets"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Ver todos <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="space-y-2.5">
              {care.petSummaries.map((summary, index) => (
                <SimplifiedPetCard
                  key={summary.pet.id}
                  summary={summary}
                  statusLine={petStatusLine(summary, briefing)}
                  delay={Math.min(index, 6) * 40}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/* -------------------- Home Hero (Assistant + Today's Care) -------------------- */

function HomeHero({
  bullets,
  overallPct,
  totalActive,
  totalCompleted,
  agendaLoading,
  onNavigate,
}: {
  bullets: BriefingBullet[];
  overallPct: number;
  totalActive: number;
  totalCompleted: number;
  agendaLoading: boolean;
  onNavigate: (bullet: BriefingBullet) => void;
}) {
  const displayPct = useCountUp(overallPct);

  return (
    <section className="animate-in fade-in overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-elegant)] duration-500">
      <div className="px-5 pb-2 pt-5 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hoje</p>
      </div>

      {agendaLoading && bullets.length === 0 ? (
        <div className="space-y-2 px-5 pb-4 sm:px-6">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      ) : bullets.length === 0 ? (
        <p className="px-5 pb-4 text-sm text-muted-foreground sm:px-6">
          Nada urgente no momento — seus pets estão bem acompanhados.
        </p>
      ) : (
        <ul className="divide-y divide-border/70">
          {bullets.map((b, index) => (
            <li
              key={b.id}
              className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300"
              style={{ animationDelay: `${index * 45}ms` }}
            >
              <BriefingRow bullet={b} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-border/70 bg-secondary/30 px-5 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">Progresso do dia</span>
          <span className="tabular-nums text-muted-foreground">
            {totalActive === 0 ? "—" : `${displayPct}% · ${totalCompleted}/${totalActive}`}
          </span>
        </div>
        {totalActive > 0 && <Progress value={overallPct} className="mt-2.5 h-2" />}
      </div>
    </section>
  );
}

function BriefingRow({
  bullet,
  onNavigate,
}: {
  bullet: BriefingBullet;
  onNavigate: (bullet: BriefingBullet) => void;
}) {
  const Icon =
    bullet.tone === "positive" ? PartyPopper : bullet.tone === "attention" ? AlertTriangle : CalendarClock;
  const iconColor =
    bullet.tone === "positive"
      ? "text-emerald-600 bg-emerald-500/10"
      : bullet.tone === "attention"
        ? "text-destructive bg-destructive/10"
        : "text-amber-600 bg-amber-500/10";

  const quickLog = bullet.action?.kind === "quick_log" ? bullet.action : null;
  const canNavigate = Boolean(bullet.petId && bullet.action?.kind === "navigate");
  const textBlock = bullet.petName ? (
    <>
      <p className="truncate text-sm font-semibold">{bullet.petName}</p>
      <p className="truncate text-xs text-muted-foreground">{bullet.text}</p>
    </>
  ) : (
    <p className="text-sm font-medium">{bullet.text}</p>
  );

  return (
    <div className="flex min-h-12 items-center gap-3 px-5 py-3 sm:px-6">
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconColor)}>
        <Icon className="h-4 w-4" />
      </span>
      {canNavigate ? (
        <button
          type="button"
          onClick={() => onNavigate(bullet)}
          className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {textBlock}
        </button>
      ) : bullet.petId ? (
        <Link
          to="/pets/$id"
          params={{ id: bullet.petId }}
          search={quickLog ? { tab: "daily-care" } : { tab: "dashboard" }}
          className="min-w-0 flex-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {textBlock}
        </Link>
      ) : (
        <div className="min-w-0 flex-1">{textBlock}</div>
      )}
      {quickLog && bullet.petId ? (
        <HeroQuickLogButton petId={bullet.petId} action={quickLog} />
      ) : canNavigate ? (
        <button
          type="button"
          onClick={() => onNavigate(bullet)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-0 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={bullet.action?.kind === "navigate" ? bullet.action.label : "Abrir"}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

function HeroQuickLogButton({ petId, action }: { petId: string; action: InsightQuickLogAction }) {
  const quickLog = useQuickLogEntry(petId, [
    ["today-care-overview"],
    ["tracker-entries", petId],
    ["health-timeline", petId],
    ["home-agenda"],
  ]);

  return (
    <Button
      size="sm"
      className="min-h-11 shrink-0 rounded-full px-3.5"
      disabled={quickLog.isPending}
      onClick={() =>
        quickLog.mutate({
          tracker: {
            id: action.trackerId,
            category: action.category,
            title: action.trackerTitle,
            unit: action.unit,
          },
          value: action.value,
        })
      }
    >
      {action.label}
    </Button>
  );
}

/* -------------------- Household Status (compact) -------------------- */

function HouseholdStatusStrip({
  healthy,
  needsAttention,
  lost,
  upcoming,
}: {
  healthy: number;
  needsAttention: number;
  lost: number;
  upcoming: number;
}) {
  const items = [
    { label: "Bem", value: healthy, icon: HeartPulse, tone: "text-emerald-600" },
    { label: "Atenção", value: needsAttention, icon: AlertTriangle, tone: "text-amber-600" },
    { label: "Perdido", value: lost, icon: ShieldAlert, tone: "text-destructive" },
    { label: "Agenda", value: upcoming, icon: CalendarClock, tone: "text-primary" },
  ] as const;

  return (
    <section
      aria-label="Visão geral da casa"
      className="grid grid-cols-4 gap-2 rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-card)]"
    >
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <div key={it.label} className="flex flex-col items-center gap-1 py-1 text-center">
            <Icon className={cn("h-4 w-4", it.tone)} />
            <p className="text-lg font-bold tabular-nums leading-none">{it.value}</p>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
              {it.label}
            </p>
          </div>
        );
      })}
    </section>
  );
}

/* -------------------- Simplified pet cards -------------------- */

type PetSummary = ReturnType<typeof useTodaysCare>["petSummaries"][number];

function petStatusLine(summary: PetSummary, briefing: BriefingBullet[]): string {
  if (summary.pet.is_lost) return "Modo perdido ativo";
  const bullet = briefing.find((b) => b.petId === summary.pet.id && b.tone !== "positive");
  if (bullet) return bullet.text;
  if (summary.activeTrackers.length === 0) return "Sem rotina configurada";
  if (summary.pct >= 100) return "Tudo concluído";
  if (summary.remaining > 0) return `${summary.remaining} cuidado${summary.remaining === 1 ? "" : "s"} pendente${summary.remaining === 1 ? "" : "s"}`;
  return "Em dia";
}

function SimplifiedPetCard({
  summary,
  statusLine,
  delay,
}: {
  summary: PetSummary;
  statusLine: string;
  delay: number;
}) {
  const { pet, pct, activeTrackers } = summary;
  const needsAttention = pet.is_lost || summary.needsAttention;

  return (
    <Link
      to="/pets/$id"
      params={{ id: pet.id }}
      style={{ animationDelay: `${delay}ms` }}
      className="group animate-in fade-in slide-in-from-bottom-1 flex items-center gap-3 rounded-2xl border border-border bg-card px-3.5 py-3 fill-mode-both transition-all duration-300 hover:border-primary/30 hover:shadow-[var(--shadow-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-secondary">
        {pet.photo_url ? (
          <img src={pet.photo_url} alt={pet.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-primary">
            <Dog className="h-5 w-5" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold group-hover:text-primary">{pet.name}</p>
          {pet.is_lost ? (
            <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
              Perdido
            </span>
          ) : needsAttention ? (
            <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
              Atenção
            </span>
          ) : null}
        </div>
        {activeTrackers.length > 0 && <Progress value={pct} className="mt-1.5 h-1.5" />}
        <p className="mt-1 truncate text-xs text-muted-foreground">{statusLine}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-60" />
    </Link>
  );
}
