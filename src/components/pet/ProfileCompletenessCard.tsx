import { Progress } from "@/components/ui/progress";
import type { CompletenessItem } from "@/lib/pet-profile";
import { CheckCircle2, Circle } from "lucide-react";

export function ProfileCompletenessCard({
  pct,
  missing,
  onNavigate,
}: {
  pct: number;
  missing: CompletenessItem[];
  onNavigate: (tab: string) => void;
}) {
  const complete = pct >= 100;

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Completude do perfil
          </p>
          <h2 className="mt-0.5 text-lg font-semibold">
            {complete ? "Perfil completo" : "Complete o perfil"}
          </h2>
        </div>
        <p className="text-3xl font-bold tracking-tight tabular-nums">{pct}%</p>
      </div>
      <Progress value={pct} className="mt-3 h-2" />

      {!complete && missing.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Faltando
          </p>
          <ul className="flex flex-col gap-1.5">
            {missing.slice(0, 6).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(item.tab)}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary"
                >
                  <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1">{item.label}</span>
                  <span className="text-xs text-primary">Preencher</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {complete && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          Tudo certo — a identidade digital do seu pet está completa.
        </p>
      )}
    </section>
  );
}
