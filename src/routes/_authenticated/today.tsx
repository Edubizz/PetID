import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuickLogEntry } from "@/hooks/useQuickLogEntry";
import { useTodaysCare, type TodaysCarePet, type TodaysCareTracker } from "@/hooks/useTodaysCare";
import { useHomeAgenda, type HomeAgendaItem } from "@/hooks/useHomeAgenda";
import { CATEGORY_META, dayKey, todayKey } from "@/lib/daily-care";
import { ConfettiBurst } from "@/components/ConfettiBurst";
import { QuickLogControl } from "@/components/pet/QuickLogControl";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Check, Dog, Flame, HeartPulse, ShieldAlert, Sparkles, CalendarClock,
  AlertTriangle, Weight, Settings2, type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/today")({
  component: TodaysCarePage,
});

function TodaysCarePage() {
  const care = useTodaysCare();
  const agenda = useHomeAgenda(care.petSummaries.map((s) => ({ id: s.pet.id, name: s.pet.name })));
  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  const alerts = useMemo(() => buildAlerts(care, agenda), [care, agenda]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Hoje</h1>
        <p className="mt-1 capitalize text-muted-foreground">{today}</p>
      </div>

      {care.isLoading ? (
        <div className="mt-8 space-y-4">
          <Skeleton className="h-40 w-full rounded-3xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      ) : care.petSummaries.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <Dog className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 font-medium">Cadastre um pet para começar a acompanhar os cuidados diários.</p>
          <Button asChild className="mt-4 rounded-full">
            <Link to="/pets/new">Adicionar pet</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          <TodaysProgressHero care={care} />

          <section>
            <h2 className="mb-4 text-xl font-semibold">Tarefas de hoje</h2>
            <div className="space-y-5">
              {care.petSummaries.map((summary) => (
                <PetTasksCard
                  key={summary.pet.id}
                  pet={summary.pet}
                  activeTrackers={summary.activeTrackers}
                  inactiveCount={summary.inactiveCount}
                  completed={summary.completed}
                  pct={summary.pct}
                  sumsByTracker={care.sumsByTracker}
                />
              ))}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <UpcomingSection items={agenda.upcoming} isLoading={agenda.isLoading} />
            <AlertsSection alerts={alerts} isLoading={agenda.isLoading} />
          </div>

          <RecentActivitySection items={agenda.recent} isLoading={agenda.isLoading} />
        </div>
      )}
    </div>
  );
}

/* -------------------- Section 1: Today's Progress -------------------- */

function TodaysProgressHero({ care }: { care: ReturnType<typeof useTodaysCare> }) {
  const isComplete = care.totalActive > 0 && care.totalCompleted === care.totalActive;
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    if (isComplete) {
      setCelebrate(true);
      const t = setTimeout(() => setCelebrate(false), 2200);
      return () => clearTimeout(t);
    }
  }, [isComplete]);

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-border p-8 text-primary-foreground shadow-[var(--shadow-elegant)]"
      style={{ background: "var(--gradient-brand)" }}
    >
      {celebrate && <ConfettiBurst />}
      <div className="flex flex-wrap items-center gap-8">
        <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-4 border-white/30 bg-white/10 text-3xl font-bold backdrop-blur-sm">
          {care.overallPct}%
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium uppercase tracking-wide text-primary-foreground/70">Cuidados de hoje</p>
          <p className="mt-1 text-2xl font-bold">
            {care.totalActive === 0
              ? "Nenhum cuidado configurado ainda"
              : isComplete
              ? "Tudo em dia! Parabéns 🎉"
              : `${care.totalCompleted} de ${care.totalActive} tarefas concluídas`}
          </p>
          {care.totalActive > 0 && (
            <Progress value={care.overallPct} className="mt-3 h-2.5 bg-white/20" indicatorClassName="bg-white" />
          )}
        </div>
      </div>

      <div className="mt-7 flex flex-wrap gap-3">
        <HeroStat icon={Flame} label="Sequência atual" value={`${care.currentStreak} ${care.currentStreak === 1 ? "dia" : "dias"}`} />
        <HeroStat icon={HeartPulse} label="Pets saudáveis" value={String(care.healthyCount)} />
        <HeroStat icon={ShieldAlert} label="Precisam de atenção" value={String(care.needsAttentionCount)} />
      </div>
    </section>
  );
}

function HeroStat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex min-w-[9rem] flex-1 items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm">
      <Icon className="h-5 w-5 shrink-0" />
      <div className="min-w-0">
        <p className="truncate text-lg font-bold leading-tight">{value}</p>
        <p className="truncate text-xs text-primary-foreground/70">{label}</p>
      </div>
    </div>
  );
}

/* -------------------- Section 2: Today's Tasks -------------------- */

function PetTasksCard({
  pet,
  activeTrackers,
  inactiveCount,
  completed,
  pct,
  sumsByTracker,
}: {
  pet: TodaysCarePet;
  activeTrackers: TodaysCareTracker[];
  inactiveCount: number;
  completed: number;
  pct: number;
  sumsByTracker: Map<string, number>;
}) {
  const quickLog = useQuickLogEntry(pet.id, [
    ["today-care-overview"],
    ["tracker-entries", pet.id],
    ["health-timeline", pet.id],
    ["home-agenda"],
  ]);
  const hasTrackers = activeTrackers.length > 0 || inactiveCount > 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-elegant)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/pets/$id" params={{ id: pet.id }} className="group flex items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-secondary">
            {pet.photo_url ? (
              <img src={pet.photo_url} alt={pet.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-primary"><Dog className="h-6 w-6" /></div>
            )}
          </div>
          <div>
            <p className="font-semibold transition-colors group-hover:text-primary">{pet.name}</p>
            <p className="text-xs text-muted-foreground">{pet.breed || "—"}</p>
          </div>
          {pet.is_lost && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">Perdido</span>
          )}
        </Link>

        {activeTrackers.length > 0 && (
          completed === activeTrackers.length ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600">
              <Check className="h-3.5 w-3.5" /> Completo
            </span>
          ) : (
            <span className="text-xs font-medium text-muted-foreground">{completed}/{activeTrackers.length} concluídos</span>
          )
        )}
      </div>

      {!hasTrackers ? (
        <div className="mt-4 rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
          Nenhum cuidado diário configurado para {pet.name}.
          <div className="mt-3">
            <Button asChild size="sm" variant="outline" className="rounded-full">
              <Link to="/pets/$id" params={{ id: pet.id }} search={{ tab: "daily-care" }}>
                <Settings2 className="mr-2 h-3.5 w-3.5" /> Configurar cuidados
              </Link>
            </Button>
          </div>
        </div>
      ) : activeTrackers.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Todos os cuidados diários estão pausados.</p>
      ) : (
        <>
          <Progress value={pct} className="mt-4" />
          <ul className="mt-4 divide-y divide-border">
            {activeTrackers.map((t) => {
              const meta = CATEGORY_META[t.category];
              const Icon = meta.icon;
              const color = t.color || meta.color;
              const value = sumsByTracker.get(t.id) ?? 0;
              const done = value >= t.target_per_day;
              return (
                <li key={t.id} className="flex items-center gap-3 py-3">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
                    style={done ? { backgroundColor: color, borderColor: color } : { borderColor: `${color}55` }}
                  >
                    {done ? <Check className="h-4 w-4 text-white" /> : <Icon className="h-3.5 w-3.5" style={{ color }} />}
                  </span>
                  <span className={`min-w-0 flex-1 text-sm font-medium ${done ? "text-muted-foreground line-through" : ""}`}>
                    {t.title}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {value}/{t.target_per_day} {t.unit ?? meta.unit}
                  </span>
                  {!done && (
                    <QuickLogControl
                      tracker={t}
                      onLog={(v) => quickLog.mutate({ tracker: t, value: v })}
                      pending={quickLog.isPending}
                      refreshToken={value}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

/* -------------------- Section 3: Upcoming -------------------- */

function upcomingBucketLabel(dateStr: string): string {
  const now = new Date();
  const target = new Date(dateStr);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const diffDays = Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86400000);
  if (diffDays <= 0) return "Hoje";
  if (diffDays === 1) return "Amanhã";
  if (diffDays < 7) {
    const label = target.toLocaleDateString("pt-BR", { weekday: "long" });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  if (diffDays < 14) return "Semana que vem";
  return target.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}

function UpcomingSection({ items, isLoading }: { items: HomeAgendaItem[]; isLoading: boolean }) {
  const groups = useMemo(() => {
    const map = new Map<string, HomeAgendaItem[]>();
    for (const it of items) {
      const label = upcomingBucketLabel(it.date);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(it);
    }
    return Array.from(map.entries());
  }, [items]);

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h3 className="flex items-center gap-2 text-lg font-semibold"><CalendarClock className="h-5 w-5 text-amber-500" /> Próximos eventos</h3>
      {isLoading ? (
        <Skeleton className="mt-4 h-24 w-full" />
      ) : groups.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhum evento futuro agendado.</p>
      ) : (
        <ol className="relative mt-4 space-y-5 border-l border-border pl-5">
          {groups.map(([label, group]) => (
            <li key={label}>
              <span className="absolute -left-[7px] mt-1 h-3 w-3 rounded-full border-2 border-card bg-amber-500" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
              <div className="mt-1.5 space-y-1.5">
                {group.map((it) => {
                  const Icon = it.icon;
                  return (
                    <div key={it.id} className="flex items-center gap-2 text-sm">
                      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: it.color }} />
                      <span className="truncate font-medium">{it.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">· {it.petName}</span>
                    </div>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* -------------------- Section 4: Alerts -------------------- */

type Alert = { id: string; icon: LucideIcon; text: string; petId?: string };

function buildAlerts(care: ReturnType<typeof useTodaysCare>, agenda: ReturnType<typeof useHomeAgenda>): Alert[] {
  const list: Alert[] = [];

  for (const s of care.petSummaries) {
    if (s.pet.is_lost) {
      list.push({ id: `lost:${s.pet.id}`, icon: ShieldAlert, text: `${s.pet.name} está em modo perdido`, petId: s.pet.id });
    }
    for (const t of s.activeTrackers) {
      const value = care.sumsByTracker.get(t.id) ?? 0;
      if (value > 0) continue;
      if (t.category === "water") {
        list.push({ id: `water:${t.id}`, icon: CATEGORY_META.water.icon, text: `${s.pet.name} ainda não bebeu água hoje`, petId: s.pet.id });
      }
      if (t.category === "medication") {
        list.push({ id: `med:${t.id}`, icon: CATEGORY_META.medication.icon, text: `Medicação de ${s.pet.name} ainda não foi registrada hoje`, petId: s.pet.id });
      }
    }
  }

  for (const v of agenda.overdueVaccines) {
    list.push({ id: v.id, icon: v.icon, text: `${v.title} — ${v.petName}`, petId: v.petId });
  }

  for (const w of agenda.staleWeightPets) {
    list.push({ id: `weight:${w.petId}`, icon: Weight, text: `Peso de ${w.petName} não é atualizado há ${w.days} dias`, petId: w.petId });
  }

  return list;
}

function AlertsSection({ alerts, isLoading }: { alerts: Alert[]; isLoading: boolean }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h3 className="flex items-center gap-2 text-lg font-semibold"><AlertTriangle className="h-5 w-5 text-destructive" /> Alertas</h3>
      {isLoading ? (
        <Skeleton className="mt-4 h-24 w-full" />
      ) : alerts.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhum alerta no momento. Tudo sob controle! ✅</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {alerts.map((a) => {
            const Icon = a.icon;
            const content = (
              <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive transition-colors hover:bg-destructive/10">
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate font-medium">{a.text}</span>
              </div>
            );
            return (
              <li key={a.id}>
                {a.petId ? (
                  <Link to="/pets/$id" params={{ id: a.petId }}>{content}</Link>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* -------------------- Section 5: Recent Activity -------------------- */

function recentBucketLabel(dateStr: string): string {
  const key = dayKey(dateStr);
  if (key === todayKey()) return "Hoje";
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (key === dayKey(y)) return "Ontem";
  return "Anteriormente";
}

function RecentActivitySection({ items, isLoading }: { items: HomeAgendaItem[]; isLoading: boolean }) {
  const groups = useMemo(() => {
    const map = new Map<string, HomeAgendaItem[]>();
    for (const it of items) {
      const label = recentBucketLabel(it.date);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(it);
    }
    return Array.from(map.entries());
  }, [items]);

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h3 className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="h-5 w-5 text-primary" /> Atividade recente</h3>
      {isLoading ? (
        <Skeleton className="mt-4 h-24 w-full" />
      ) : groups.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p>
      ) : (
        <div className="mt-4 space-y-5">
          {groups.map(([label, group]) => (
            <div key={label}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
              <ul className="space-y-2">
                {group.map((it) => {
                  const Icon = it.icon;
                  return (
                    <li key={it.id} className="flex items-center gap-3 text-sm">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${it.color}22`, color: it.color }}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium">{it.petName}</span> — {it.title}
                      </span>
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
