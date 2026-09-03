import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_NOTIFICATION_PREFS,
  REMINDER_CATEGORY_LABELS,
  type NotificationPrefs,
  type ReminderCategory,
} from "@/lib/notification-prefs";
import { useOwnerReminders } from "@/hooks/useOwnerReminders";

const CATEGORIES = Object.keys(REMINDER_CATEGORY_LABELS) as ReminderCategory[];

export function ReminderPreferencesPanel() {
  const { prefs, savePrefs, isLoading } = useOwnerReminders();
  const [draft, setDraft] = useState<NotificationPrefs>(prefs);

  useEffect(() => {
    setDraft(prefs);
  }, [prefs]);

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">Carregando preferências…</p>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] sm:p-6">
      <h2 className="text-lg font-semibold">Lembretes</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Escolha o que o InfoPet deve destacar no centro de lembretes. SMS e push ficam
        para depois — a lógica já está preparada.
      </p>

      <div className="mt-5 space-y-3">
        {CATEGORIES.map((key) => (
          <div
            key={key}
            className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5"
          >
            <Label htmlFor={`pref-${key}`} className="text-sm font-normal">
              {REMINDER_CATEGORY_LABELS[key]}
            </Label>
            <Switch
              id={`pref-${key}`}
              checked={draft.categories[key]}
              onCheckedChange={(checked) =>
                setDraft({
                  ...draft,
                  categories: { ...draft.categories, [key]: checked },
                })
              }
            />
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-border bg-secondary/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Horário silencioso</p>
            <p className="text-xs text-muted-foreground">
              Durante este período, lembretes “em breve” ficam em segundo plano. Itens
              atrasados ou urgentes continuam visíveis no app.
            </p>
          </div>
          <Switch
            checked={draft.quiet_hours.enabled}
            onCheckedChange={(checked) =>
              setDraft({
                ...draft,
                quiet_hours: { ...draft.quiet_hours, enabled: checked },
              })
            }
          />
        </div>
        {draft.quiet_hours.enabled ? (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Início</Label>
              <Input
                type="time"
                value={draft.quiet_hours.start}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    quiet_hours: { ...draft.quiet_hours, start: e.target.value || "22:00" },
                  })
                }
              />
            </div>
            <div>
              <Label className="text-xs">Fim</Label>
              <Input
                type="time"
                value={draft.quiet_hours.end}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    quiet_hours: { ...draft.quiet_hours, end: e.target.value || "07:00" },
                  })
                }
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          type="button"
          className="rounded-full"
          disabled={savePrefs.isPending}
          onClick={() => savePrefs.mutate(draft)}
        >
          {savePrefs.isPending ? "Salvando…" : "Salvar lembretes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={() => setDraft(DEFAULT_NOTIFICATION_PREFS)}
        >
          Restaurar padrões
        </Button>
      </div>
    </section>
  );
}
