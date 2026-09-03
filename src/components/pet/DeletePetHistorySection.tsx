import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { logAndDescribeError } from "@/lib/errors";
import {
  HISTORY_CATEGORY_TARGETS,
  HISTORY_PERIOD_OPTIONS,
  buildReviewSummary,
  countPetHistoryByCategory,
  deletePetHistory,
  historyDeleteInvalidateKeys,
  requiresTypedConfirmation,
  resolveHistoryDateRange,
  totalDeleted,
  type HistoryPeriodPreset,
  type HistoryRecordCategory,
} from "@/lib/pet-history-delete";
import { ChevronLeft, Eraser, History } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4;

const CONFIRM_WORD = "EXCLUIR";

const ALL_CATEGORIES = HISTORY_CATEGORY_TARGETS.map((t) => t.category);

function categoryUiLabel(category: HistoryRecordCategory): string {
  if (category === "documentos") return "Outros registros históricos";
  return HISTORY_CATEGORY_TARGETS.find((t) => t.category === category)?.label ?? category;
}

function categoryHint(category: HistoryRecordCategory): string | null {
  if (category === "documentos") return "Documentos enviados neste período";
  if (category === "rotina") return "Registros concluídos (não remove a rotina configurada)";
  if (category === "vacinas") return "Somente vacinas já aplicadas";
  return null;
}

/**
 * Secondary entry + mobile-first wizard to purge historical records for one pet.
 * Does not delete the pet or routine definitions (trackers).
 */
export function ManagePetHistorySection({ petId, petName }: { petId: string; petName: string }) {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">
        Precisa limpar dados antigos? Você pode excluir registros históricos sem apagar o pet.
      </p>
      <div className="relative shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-11 w-full justify-start rounded-full px-3 text-muted-foreground hover:text-foreground sm:w-auto"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          <History className="mr-2 h-4 w-4" />
          Gerenciar histórico
        </Button>
        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-xl border border-border bg-popover p-1 shadow-md"
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-destructive hover:bg-destructive/10"
              onClick={() => {
                setMenuOpen(false);
                setOpen(true);
              }}
            >
              <Eraser className="h-4 w-4" />
              Excluir registros
            </button>
          </div>
        ) : null}
      </div>

      {menuOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-10 cursor-default"
          aria-label="Fechar menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <ManagePetHistorySheet petId={petId} petName={petName} open={open} onOpenChange={setOpen} />
    </div>
  );
}

function ManagePetHistorySheet({
  petId,
  petName,
  open,
  onOpenChange,
}: {
  petId: string;
  petName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>(1);
  const [preset, setPreset] = useState<HistoryPeriodPreset>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [selected, setSelected] = useState<HistoryRecordCategory[]>([...ALL_CATEGORIES]);
  const [confirmText, setConfirmText] = useState("");

  const reset = () => {
    setStep(1);
    setPreset("30d");
    setCustomStart("");
    setCustomEnd("");
    setRangeError(null);
    setSelected([...ALL_CATEGORIES]);
    setConfirmText("");
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const range = useMemo(() => {
    try {
      if (preset === "custom" && (!customStart || !customEnd)) return null;
      return resolveHistoryDateRange(preset, { customStart, customEnd });
    } catch {
      return null;
    }
  }, [preset, customStart, customEnd]);

  const countsQuery = useQuery({
    queryKey: ["history-delete-counts", petId, range?.startIso, range?.endIso, selected.join(",")],
    enabled: open && !!range && (step === 2 || step === 3 || step === 4),
    queryFn: () => countPetHistoryByCategory(petId, range!, selected),
  });

  const allCountsQuery = useQuery({
    queryKey: ["history-delete-all-counts", petId, range?.startIso, range?.endIso],
    enabled: open && !!range && step >= 2,
    queryFn: () => countPetHistoryByCategory(petId, range!, [...ALL_CATEGORIES]),
  });

  const totalSelected = useMemo(
    () => (countsQuery.data ?? []).reduce((s, c) => s + c.count, 0),
    [countsQuery.data],
  );

  const needsTyped = requiresTypedConfirmation(totalSelected, selected.length);
  const typedOk = !needsTyped || confirmText.trim().toUpperCase() === CONFIRM_WORD;

  const remove = useMutation({
    mutationFn: async () => {
      if (!range) throw new Error("Período inválido.");
      return deletePetHistory(petId, range, selected);
    },
    onSuccess: (result) => {
      for (const key of historyDeleteInvalidateKeys(petId)) {
        void qc.invalidateQueries({ queryKey: [...key] });
      }
      const total = totalDeleted(result);
      if (result.failures.length > 0) {
        const failedLabels = result.failures
          .map((f) => categoryUiLabel(f.category))
          .join(", ");
        toast.error(
          `Exclusão incompleta. Removidos ${total} registro(s). Falhou: ${failedLabels}. Nenhuma outra alteração silenciosa.`,
        );
      } else if (total === 0) {
        toast.message("Nenhum registro encontrado nesse período para as categorias escolhidas.");
      } else {
        toast.success(
          `Histórico excluído (${total} registro${total === 1 ? "" : "s"}). O pet e a rotina configurada permanecem intactos.`,
        );
      }
      onOpenChange(false);
    },
    onError: (e: unknown) =>
      toast.error(
        logAndDescribeError("ManagePetHistory: failed", e, "Não foi possível excluir o histórico."),
      ),
  });

  const goNextFromPeriod = () => {
    try {
      resolveHistoryDateRange(preset, { customStart, customEnd });
      setRangeError(null);
      setStep(2);
    } catch (e: unknown) {
      setRangeError(e instanceof Error ? e.message : "Período inválido.");
    }
  };

  const toggleCategory = (category: HistoryRecordCategory, checked: boolean) => {
    setSelected((prev) => {
      if (checked) return prev.includes(category) ? prev : [...prev, category];
      return prev.filter((c) => c !== category);
    });
  };

  const stepTitle =
    step === 1
      ? "Escolha o período"
      : step === 2
        ? "Tipos de registro"
        : step === 3
          ? "Revisar exclusão"
          : "Confirmar exclusão";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[92dvh] flex-col rounded-t-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:mx-auto sm:max-w-lg sm:rounded-2xl"
      >
        <SheetHeader className="text-left">
          <SheetTitle>{stepTitle}</SheetTitle>
          <SheetDescription>
            Excluir registros históricos de {petName}. O pet e a rotina configurada não serão
            apagados.
          </SheetDescription>
          <div className="flex gap-1.5 pt-1" aria-hidden>
            {([1, 2, 3, 4] as const).map((s) => (
              <span
                key={s}
                className={cn(
                  "h-1 flex-1 rounded-full",
                  s <= step ? "bg-primary" : "bg-muted",
                )}
              />
            ))}
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto py-4">
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                {HISTORY_PERIOD_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setPreset(opt.value);
                      setRangeError(null);
                    }}
                    className={cn(
                      "min-h-11 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      preset === opt.value
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-foreground hover:bg-secondary/60",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {preset === "custom" && (
                <div className="grid gap-3">
                  <div>
                    <Label className="mb-1.5 block text-sm">Data inicial</Label>
                    <Input
                      type="date"
                      value={customStart}
                      className="h-11"
                      onChange={(e) => {
                        setCustomStart(e.target.value);
                        setRangeError(null);
                      }}
                    />
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-sm">Data final</Label>
                    <Input
                      type="date"
                      value={customEnd}
                      className="h-11"
                      onChange={(e) => {
                        setCustomEnd(e.target.value);
                        setRangeError(null);
                      }}
                    />
                  </div>
                </div>
              )}

              {rangeError ? <p className="text-sm text-destructive">{rangeError}</p> : null}
              {range ? (
                <p className="text-xs text-muted-foreground">Período: {range.label}</p>
              ) : null}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Selecione apenas o que deseja excluir. Categorias sem registros no período
                aparecem como 0.
              </p>
              {allCountsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Contando registros…</p>
              ) : (
                HISTORY_CATEGORY_TARGETS.map((target) => {
                  const count =
                    allCountsQuery.data?.find((c) => c.category === target.category)?.count ?? 0;
                  const checked = selected.includes(target.category);
                  const hint = categoryHint(target.category);
                  return (
                    <label
                      key={target.category}
                      className={cn(
                        "flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border px-3 py-3",
                        checked ? "border-primary/40 bg-primary/5" : "border-border",
                        count === 0 && "opacity-70",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => toggleCategory(target.category, v === true)}
                        className="mt-1"
                        aria-label={categoryUiLabel(target.category)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">
                            {categoryUiLabel(target.category)}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {count === 0
                              ? "Nenhum no período"
                              : `${count} registro${count === 1 ? "" : "s"}`}
                          </span>
                        </span>
                        {hint ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
                        ) : null}
                      </span>
                    </label>
                  );
                })
              )}
              {selected.length === 0 ? (
                <p className="text-sm text-destructive">Selecione ao menos um tipo.</p>
              ) : null}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {countsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Preparando resumo…</p>
              ) : (
                <>
                  <div className="rounded-xl border border-border bg-secondary/40 p-4">
                    <p className="text-sm font-medium leading-relaxed">
                      {buildReviewSummary(countsQuery.data ?? [], range!)}
                    </p>
                  </div>
                  <ul className="space-y-2">
                    {(countsQuery.data ?? []).map((c) => (
                      <li
                        key={c.category}
                        className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm"
                      >
                        <span>{categoryUiLabel(c.category)}</span>
                        <span className="font-medium tabular-nums">{c.count}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    Permanecem intactos: perfil do pet, itens da rotina configurados, tutores e
                    identificação.
                  </p>
                  {totalSelected === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Não há nada para excluir neste período com as categorias escolhidas. Você
                      pode voltar e ajustar o filtro.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm font-semibold text-destructive">
                  Esta ação não pode ser desfeita.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {buildReviewSummary(countsQuery.data ?? [], range!)}
                </p>
              </div>

              {needsTyped ? (
                <div>
                  <Label htmlFor="confirm-excluir" className="mb-1.5 block text-sm">
                    Digite <span className="font-mono font-semibold">{CONFIRM_WORD}</span> para
                    confirmar
                  </Label>
                  <Input
                    id="confirm-excluir"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    className="h-11 font-mono uppercase"
                    autoComplete="off"
                    autoCapitalize="characters"
                    placeholder={CONFIRM_WORD}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Toque em &quot;Excluir definitivamente&quot; apenas se tiver certeza.
                </p>
              )}
            </div>
          )}
        </div>

        <SheetFooter className="flex-row gap-2 border-t border-border pt-3 sm:justify-between">
          {step > 1 ? (
            <Button
              type="button"
              variant="ghost"
              className="h-11 flex-1 rounded-full"
              onClick={() => setStep((s) => (s - 1) as Step)}
              disabled={remove.isPending}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Voltar
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              className="h-11 flex-1 rounded-full"
              onClick={() => onOpenChange(false)}
              disabled={remove.isPending}
            >
              Cancelar
            </Button>
          )}

          {step === 1 && (
            <Button type="button" className="h-11 flex-1 rounded-full" onClick={goNextFromPeriod}>
              Continuar
            </Button>
          )}
          {step === 2 && (
            <Button
              type="button"
              className="h-11 flex-1 rounded-full"
              disabled={selected.length === 0}
              onClick={() => setStep(3)}
            >
              Continuar
            </Button>
          )}
          {step === 3 && (
            <Button
              type="button"
              className="h-11 flex-1 rounded-full"
              disabled={totalSelected === 0 || countsQuery.isLoading}
              onClick={() => {
                setConfirmText("");
                setStep(4);
              }}
            >
              Revisar e confirmar
            </Button>
          )}
          {step === 4 && (
            <Button
              type="button"
              variant="destructive"
              className="h-11 flex-1 rounded-full"
              disabled={!typedOk || remove.isPending || totalSelected === 0}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? "Excluindo…" : "Excluir definitivamente"}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** @deprecated Use ManagePetHistorySection — kept name alias if referenced elsewhere. */
export { ManagePetHistorySection as DeletePetHistorySection };
