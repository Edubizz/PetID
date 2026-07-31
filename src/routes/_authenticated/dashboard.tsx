import { createFileRoute, Link } from "@tanstack/react-router";
import { useTodaysCare } from "@/hooks/useTodaysCare";
import { useHomeAgenda, type HomeAgendaItem } from "@/hooks/useHomeAgenda";
import { useQuickPetAction } from "@/hooks/useQuickPetAction";
import { relativeFromNow, formatDateTime } from "@/lib/pet-utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dog, Plus, ArrowRight, AlertTriangle, CalendarCheck, CalendarClock, Sparkles,
  Weight, Syringe, ShieldAlert, QrCode, ListChecks, ChevronRight, ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const care = useTodaysCare();
  const agenda = useHomeAgenda(care.petSummaries.map((s) => ({ id: s.pet.id, name: s.pet.name })));
  const { trigger, picker } = useQuickPetAction();

  const lostPets = care.petSummaries.filter((s) => s.pet.is_lost);
  const isLoading = care.isLoading;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{greeting} 👋</h1>
          <p className="mt-1 text-muted-foreground">Aqui está o que precisa da sua atenção hoje.</p>
        </div>
        <Button asChild className="rounded-full">
          <Link to="/pets/new"><Plus className="mr-2 h-4 w-4" />Adicionar pet</Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-8 space-y-4">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-56 w-full rounded-2xl" />
            <Skeleton className="h-56 w-full rounded-2xl" />
          </div>
        </div>
      ) : care.petSummaries.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-12 text-center">
          <Dog className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 font-medium">Nenhum pet cadastrado ainda</p>
          <p className="mt-1 text-sm text-muted-foreground">Crie o primeiro perfil digital do seu pet.</p>
          <Button asChild className="mt-4 rounded-full">
            <Link to="/pets/new"><Plus className="mr-2 h-4 w-4" />Adicionar pet</Link>
          </Button>
        </div>
      ) : (
        <>
          {lostPets.length > 0 && (
            <div className="mt-8 flex flex-wrap items-center gap-4 rounded-2xl border border-destructive/40 bg-destructive/5 p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-destructive">
                  {lostPets.length === 1 ? `${lostPets[0].pet.name} está em modo perdido` : `${lostPets.length} pets em modo perdido`}
                </p>
                <p className="text-sm text-muted-foreground">Acompanhe avistamentos e gerencie a recuperação.</p>
              </div>
              <Button asChild variant="destructive" size="sm" className="rounded-full">
                <Link to="/pets/$id" params={{ id: lostPets[0].pet.id }} search={{ tab: "lost" }}>
                  Ver detalhes <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          )}

          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <TodaysCareSummaryCard care={care} />
            {agenda.isLoading ? (
              <Skeleton className="h-56 w-full rounded-2xl" />
            ) : (
              <UpcomingCard items={agenda.upcoming} overdueVaccineCount={agenda.overdueVaccineCount} />
            )}
            {agenda.isLoading ? (
              <Skeleton className="h-56 w-full rounded-2xl" />
            ) : (
              <RecentActivityCard items={agenda.recent} />
            )}
            <QuickActionsCard onTrigger={trigger} />
          </div>

          <div className="mt-10">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Meus pets</h2>
              <Link to="/pets" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                Ver todos <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {care.petSummaries.map(({ pet, activeTrackers, completed, pct }) => (
                <Link
                  key={pet.id}
                  to="/pets/$id"
                  params={{ id: pet.id }}
                  className="group rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-elegant)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-secondary">
                      {pet.photo_url ? (
                        <img src={pet.photo_url} alt={pet.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-primary"><Dog className="h-6 w-6" /></div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold group-hover:text-primary transition-colors">{pet.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{pet.breed || "—"}</p>
                    </div>
                    {pet.is_lost ? (
                      <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">Perdido</span>
                    ) : (
                      <ShieldCheck className="h-4 w-4 shrink-0 text-primary/60" />
                    )}
                  </div>
                  {activeTrackers.length > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Cuidados de hoje</span>
                        <span>{completed}/{activeTrackers.length}</span>
                      </div>
                      <Progress value={pct} className="mt-1.5 h-1.5" />
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
      {picker}
    </div>
  );
}

function TodaysCareSummaryCard({ care }: { care: ReturnType<typeof useTodaysCare> }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold"><CalendarCheck className="h-5 w-5 text-primary" /> Cuidados de hoje</h3>
        <Link to="/today" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          Abrir <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {care.totalActive === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhum cuidado diário configurado ainda.</p>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{care.totalCompleted}</span> de{" "}
            <span className="font-semibold text-foreground">{care.totalActive}</span> tarefas concluídas em todos os pets
          </p>
          <Progress value={care.overallPct} className="mt-2" />
        </>
      )}

      <div className="mt-4 space-y-2">
        {care.petSummaries.filter((s) => s.activeTrackers.length > 0).slice(0, 4).map((s) => (
          <div key={s.pet.id} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{s.pet.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{s.completed}/{s.activeTrackers.length}</span>
            <Progress value={s.pct} className="h-1.5 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </section>
  );
}

function UpcomingCard({ items, overdueVaccineCount }: { items: HomeAgendaItem[]; overdueVaccineCount: number }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold"><CalendarClock className="h-5 w-5 text-amber-500" /> Próximos eventos</h3>
        {overdueVaccineCount > 0 && (
          <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
            {overdueVaccineCount} {overdueVaccineCount === 1 ? "vacina atrasada" : "vacinas atrasadas"}
          </span>
        )}
      </div>
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
                  <p className="truncate text-xs text-muted-foreground">{it.petName}{it.subtitle ? ` • ${it.subtitle}` : ""}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{relativeFromNow(it.date)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RecentActivityCard({ items }: { items: HomeAgendaItem[] }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h3 className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="h-5 w-5 text-primary" /> Atividade recente</h3>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <li key={it.id} className="flex items-center gap-3 text-sm">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${it.color}22`, color: it.color }}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate">{it.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{it.petName}</p>
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

function QuickActionsCard({ onTrigger }: { onTrigger: ReturnType<typeof useQuickPetAction>["trigger"] }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h3 className="flex items-center gap-2 text-lg font-semibold"><ListChecks className="h-5 w-5 text-primary" /> Ações rápidas</h3>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => onTrigger("weight")}>
          <Weight className="mr-1.5 h-4 w-4" /> Registrar peso
        </Button>
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => onTrigger("vaccine")}>
          <Syringe className="mr-1.5 h-4 w-4" /> Adicionar vacina
        </Button>
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => onTrigger("appointment")}>
          <CalendarClock className="mr-1.5 h-4 w-4" /> Criar consulta
        </Button>
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => onTrigger("daily-care")}>
          <ListChecks className="mr-1.5 h-4 w-4" /> Cuidados diários
        </Button>
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => onTrigger("qr")}>
          <QrCode className="mr-1.5 h-4 w-4" /> Gerar QR
        </Button>
        <Button size="sm" variant="outline" className="rounded-full text-destructive" onClick={() => onTrigger("lost")}>
          <ShieldAlert className="mr-1.5 h-4 w-4" /> Modo perdido
        </Button>
      </div>
    </section>
  );
}
