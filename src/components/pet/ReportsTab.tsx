import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { useHealthTimeline, type HealthTimelinePet } from "@/hooks/useHealthTimeline";
import {
  buildPetReport,
  REPORT_PERIODS,
  type ReportMilestoneIcon,
  type ReportPeriodDays,
} from "@/lib/pet-reports";
import { exportPetReportPdf } from "@/lib/pet-report-pdf";
import { parseProfileExtras } from "@/lib/pet-profile";
import { CATEGORY_META, type TrackerCategory } from "@/lib/daily-care";
import { formatDate } from "@/lib/pet-utils";
import { logAndDescribeError } from "@/lib/errors";
import { useCountUp } from "@/hooks/useCountUp";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  CalendarDays,
  CheckCircle2,
  Dog,
  Download,
  Flame,
  ListChecks,
  Lock,
  Pill,
  Printer,
  Scale,
  Sparkles,
  Stethoscope,
  Syringe,
  Trophy,
  Weight,
  type LucideIcon,
} from "lucide-react";
import { useEntitlements } from "@/hooks/useEntitlements";
import { UpgradeCard } from "@/components/billing/UpgradeCard";
import { planUnlockLabel } from "@/lib/entitlements";

type ReportsPet = HealthTimelinePet & {
  photo_url: string | null;
  breed: string | null;
  profile_extras?: unknown;
};

const MILESTONE_ICON: Record<ReportMilestoneIcon, LucideIcon> = {
  flame: Flame,
  calendar: CalendarDays,
  check: CheckCircle2,
  pill: Pill,
  scale: Scale,
  trophy: Trophy,
};

export function ReportsTab({ pet, onNavigate }: { pet: ReportsPet; onNavigate?: (tab: string) => void }) {
  const [period, setPeriod] = useState<ReportPeriodDays>(7);
  const [exporting, setExporting] = useState(false);
  const { canUseReports } = useEntitlements();
  const { data, isLoading } = useHealthTimeline(pet);

  const trackerRows = data?.trackerRows ?? [];
  const entryRows = data?.entryRows ?? [];
  const weightRows = data?.weightRows ?? [];
  const vaccineRows = data?.vaccineRows ?? [];
  const appointmentRows = data?.appointmentRows ?? [];
  const events = data?.events ?? [];

  const ownerName = useMemo(
    () => parseProfileExtras(pet.profile_extras).owner?.name ?? null,
    [pet.profile_extras],
  );

  const normalizedEntries = useMemo(
    () =>
      entryRows.map((e) => ({
        tracker_id: e.trackers?.id ?? "",
        value: e.value,
        completed_at: e.completed_at,
        metadata: e.metadata,
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
        period,
      ),
    [
      pet.id,
      pet.name,
      pet.created_at,
      trackerRows,
      normalizedEntries,
      weightRows,
      vaccineRows,
      appointmentRows,
      period,
    ],
  );

  const timelineHighlights = useMemo(() => {
    const from = report.rangeFrom.getTime();
    const to = report.rangeTo.getTime() + 86400000;
    return events
      .filter((e) => {
        const t = new Date(e.date).getTime();
        return t >= from && t <= to;
      })
      .slice(0, 8)
      .map((e) => ({ title: e.title, date: e.date }));
  }, [events, report.rangeFrom, report.rangeTo]);

  const hasAnyData =
    trackerRows.length > 0 ||
    weightRows.length > 0 ||
    vaccineRows.some((v) => v.applied_at) ||
    appointmentRows.length > 0;

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      await exportPetReportPdf({
        pet: { name: pet.name, breed: pet.breed, photo_url: pet.photo_url },
        ownerName,
        report,
        vaccines: vaccineRows,
        appointments: appointmentRows,
        timelineHighlights,
      });
    } catch (e: unknown) {
      toast.error(
        logAndDescribeError("ReportsTab: export PDF failed", e, "Não foi possível gerar o PDF."),
      );
    } finally {
      setExporting(false);
    }
  };

  if (!canUseReports) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-[var(--shadow-card)]">
        <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
        <h3 className="mt-3 text-lg font-semibold">Relatórios no Guardião</h3>
        <p className="mt-1 text-sm text-muted-foreground">{planUnlockLabel("reports")}</p>
        <div className="mx-auto mt-5 max-w-sm">
          <UpgradeCard
            title="Desbloqueie relatórios"
            description="Resumos, tendências e exportação PDF nos planos Guardião e Família."
          />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <span className="sr-only">Carregando relatório…</span>
        <Skeleton className="h-10 w-64 rounded-full" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-56 w-full rounded-3xl" />
        <Skeleton className="h-56 w-full rounded-3xl" />
      </div>
    );
  }

  if (!hasAnyData) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Ainda não há dados suficientes"
        description={`Os relatórios são gerados automaticamente conforme o PetID aprende sobre ${pet.name}. Registre cuidados diários, peso, vacinas ou consultas para gerar o primeiro.`}
        action={onNavigate ? { label: "Começar pela rotina", icon: ListChecks, onClick: () => onNavigate("daily-care") } : undefined}
        className="p-12"
      />
    );
  }

  return (
    <div className="space-y-8 print:space-y-6">
      {/* Print-only header — hidden on screen, shown only in the printable/PDF-style page */}
      <div className="hidden items-center gap-4 border-b border-border pb-4 print:flex">
        <div className="h-14 w-14 overflow-hidden rounded-2xl bg-secondary">
          {pet.photo_url ? (
            <img src={pet.photo_url} alt={pet.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-primary/10">
              <Dog className="h-6 w-6 text-primary" />
            </div>
          )}
        </div>
        <div>
          <p className="text-lg font-bold">Relatório de {pet.name}</p>
          <p className="text-xs text-muted-foreground">
            {[
              ownerName ? `Tutor: ${ownerName}` : null,
              REPORT_PERIODS.find((p) => p.value === period)?.label,
              `Gerado em ${formatDate(new Date().toISOString())}`,
            ]
              .filter(Boolean)
              .join(" • ")}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Relatórios</h2>
          <p className="text-sm text-muted-foreground">
            Um resumo automático da saúde e rotina de {pet.name}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => window.print()}
          >
            <Printer className="mr-1.5 h-4 w-4" /> Imprimir / Compartilhar
          </Button>
          <Button size="sm" className="rounded-full" onClick={handleExportPdf} disabled={exporting}>
            <Download className="mr-1.5 h-4 w-4" /> {exporting ? "Gerando…" : "Exportar PDF"}
          </Button>
        </div>
      </div>

      <div className="inline-flex flex-wrap gap-1 rounded-full bg-secondary p-1 print:hidden">
        {REPORT_PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              period === p.value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {report.hasAnyTrackers && <StatGrid report={report} />}

      {report.hasAnyTrackers && report.completionByDay.some((p) => p.value > 0) && (
        <ChartCard title="Conclusão por dia" icon={Sparkles}>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={report.completionByDay}>
              <XAxis
                dataKey="label"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                interval={report.periodDays > 14 ? Math.ceil(report.periodDays / 10) : 0}
              />
              <Tooltip
                formatter={(v: number) => [`${v}%`, "Conclusão"]}
                cursor={{ fill: "transparent" }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {report.weight && report.weight.trend.length >= 2 && (
        <ChartCard
          title="Tendência de peso"
          icon={Weight}
          subtitle={`${report.weight.latestKg} kg atual`}
        >
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={report.weight.trend}>
              <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number) => [`${v} kg`, "Peso"]} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {report.categories.map((c) => (
        <ChartCard
          key={c.category}
          title={`Tendência — ${c.label}`}
          icon={CATEGORY_META[c.category as TrackerCategory].icon}
          subtitle={`Média de ${c.averagePerDay} ${c.unit}/dia`}
        >
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={c.trend}>
              <XAxis
                dataKey="label"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                interval={report.periodDays > 14 ? Math.ceil(report.periodDays / 10) : 0}
              />
              <Tooltip
                formatter={(v: number) => [`${v} ${c.unit}`, c.label]}
                cursor={{ fill: "transparent" }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="hsl(var(--accent))" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      ))}

      {report.observations.length > 0 && (
        <section className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Stethoscope className="h-4.5 w-4.5 text-primary" /> Resumo de saúde
          </h3>
          <ul className="mt-4 space-y-2.5">
            {report.observations.map((o, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {o}
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.milestones.length > 0 && (
        <section>
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold">
            <Trophy className="h-4.5 w-4.5 text-primary" /> Marcos e conquistas
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {report.milestones.map((m, index) => {
              const Icon = MILESTONE_ICON[m.icon];
              return (
                <div
                  key={m.id}
                  className={cn(
                    "animate-in fade-in slide-in-from-bottom-1 fill-mode-both flex items-start gap-3 rounded-2xl border p-4 duration-500",
                    m.achieved
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-border bg-secondary/40",
                  )}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                      m.achieved
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug">{m.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{m.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {timelineHighlights.length > 0 && (
        <section className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Syringe className="h-4.5 w-4.5 text-primary" /> Destaques do período
          </h3>
          <ul className="mt-4 space-y-2">
            {timelineHighlights.map((t, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{t.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDate(t.date)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-center text-xs text-muted-foreground print:mt-4">
        Relatório gerado automaticamente pelo PetID a partir dos dados registrados — não substitui
        avaliação veterinária.
      </p>
    </div>
  );
}

function StatGrid({ report }: { report: ReturnType<typeof buildPetReport> }) {
  const items: { label: string; value: number; suffix: string }[] = [
    { label: "Conclusão hoje", value: report.completionPct, suffix: "%" },
    { label: "Maior sequência", value: report.longestStreak, suffix: "d" },
    { label: "Média de conclusão", value: report.averageCompletionPct, suffix: "%" },
  ];
  for (const c of report.categories) {
    items.push({ label: `${c.label} (média/dia)`, value: c.averagePerDay, suffix: ` ${c.unit}` });
  }
  if (report.medicationAdherencePct !== null) {
    items.push({ label: "Adesão à medicação", value: report.medicationAdherencePct, suffix: "%" });
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((it, index) => (
        <StatCard key={it.label} label={it.label} value={it.value} suffix={it.suffix} delay={index * 40} />
      ))}
    </div>
  );
}

function StatCard({ label, value, suffix, delay }: { label: string; value: number; suffix: string; delay: number }) {
  const display = useCountUp(value);
  return (
    <div
      className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] duration-500"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="text-2xl font-bold tabular-nums tracking-tight">
        {display}
        {suffix}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-card)] duration-500">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-base font-semibold leading-tight">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
