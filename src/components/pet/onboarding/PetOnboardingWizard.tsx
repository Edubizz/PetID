import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  PartyPopper,
  CheckCircle2,
  Weight,
  Syringe,
  FileText,
  Droplets,
  Footprints,
  Bell,
  Sparkles,
  QrCode,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { logAndDescribeError } from "@/lib/errors";
import { PhotoUploader } from "@/components/PhotoUploader";
import { PetBreedField, PetSexField } from "@/components/PetFormFields";
import { SPECIES_OPTIONS } from "@/lib/pet-constants";
import { SmartOnboarding } from "@/components/pet/DailyCareTab";
import { HealthTab } from "@/components/pet/HealthTab";
import { DocumentsTab } from "@/components/pet/DocumentsTab";
import { useCreateRoutine } from "@/hooks/useCreateRoutine";
import { useHealthTimeline } from "@/hooks/useHealthTimeline";
import {
  parseProfileExtras,
  type ProfileAssistantExtras,
  type ProfileExtras,
} from "@/lib/pet-profile";
import type { SpeciesPresetKey } from "@/lib/daily-care";
import { navigateToPendingActivation } from "@/lib/pending-tag-activation";

export type OnboardingPet = {
  id: string;
  name: string;
  species: string | null;
  breed: string | null;
  sex: string | null;
  birth_date: string | null;
  weight_kg: number | null;
  photo_url: string | null;
  created_at: string;
  profile_extras: unknown;
  allergies: string | null;
  medications: string | null;
  medical_notes: string | null;
  show_medical_public: boolean;
  updated_at: string;
};

const STEPS = ["welcome", "confirm", "routine", "health", "assistant", "privacy"] as const;
type FlowStep = (typeof STEPS)[number];
type StepKey = FlowStep | "done";

/** Pet species (pt-BR label stored on `pets.species`) → Daily Care preset key. */
const SPECIES_TO_PRESET: Record<string, SpeciesPresetKey> = {
  Cachorro: "dog",
  Gato: "cat",
  Ave: "bird",
  Roedor: "other",
  Réptil: "other",
  Outro: "other",
};

/**
 * Guided first-run wizard shown right after a pet is created (see
 * `pets/new`), replacing the old "drop into an empty profile" experience.
 * It only orchestrates existing building blocks — Daily Care's smart-routine
 * onboarding, the Health tab's weight/vaccine dialogs, and the Documents
 * tab's upload dialog — so tracker generation, health mutations and query
 * invalidation all stay exactly as already implemented.
 */
export function PetOnboardingWizard({ pet }: { pet: OnboardingPet }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<StepKey>("welcome");

  // Single shared fetch for this pet's trackers/weights/vaccines/documents —
  // reused across the routine + health steps instead of each step querying
  // on its own, and automatically refreshed because every existing
  // mutation those steps trigger (weight/vaccine/document/tracker inserts)
  // already invalidates ["health-timeline", pet.id].
  const timeline = useHealthTimeline(pet);

  const stepIndex = step === "done" ? STEPS.length : STEPS.indexOf(step);

  const goNext = () => {
    const i = STEPS.indexOf(step as FlowStep);
    setStep(i >= 0 && i < STEPS.length - 1 ? STEPS[i + 1] : "done");
  };
  const goBack = () => {
    const i = STEPS.indexOf(step as FlowStep);
    if (i > 0) setStep(STEPS[i - 1]);
  };
  const finishToPetOrActivation = () => {
    if (navigateToPendingActivation(navigate, { petId: pet.id })) return;
    navigate({ to: "/pets/$id", params: { id: pet.id } });
  };
  const skipOnboarding = () => finishToPetOrActivation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-background px-4 py-8 sm:py-14">
      <div className="mx-auto w-full max-w-2xl">
        {step !== "done" && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                {stepIndex + 1} de {STEPS.length}
              </p>
              <button
                onClick={skipOnboarding}
                className="text-sm text-muted-foreground underline-offset-2 hover:underline"
              >
                Pular configuração
              </button>
            </div>
            <div className="mb-8 flex items-center gap-1.5">
              {STEPS.map((s, i) => (
                <span
                  key={s}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${i <= stepIndex ? "bg-primary" : "bg-border"}`}
                />
              ))}
            </div>
          </>
        )}

        {step === "welcome" && <WelcomeStep petName={pet.name} onNext={goNext} />}
        {step === "confirm" && <ConfirmStep pet={pet} onNext={goNext} />}
        {step === "routine" && (
          <RoutineStep
            pet={pet}
            hasRoutine={(timeline.data?.trackerRows.length ?? 0) > 0}
            routineCount={timeline.data?.trackerRows.length ?? 0}
            loading={timeline.isLoading}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {step === "health" && (
          <HealthStep
            pet={pet}
            hasWeight={(timeline.data?.weightRows.length ?? 0) > 0}
            hasVaccine={(timeline.data?.vaccineRows.length ?? 0) > 0}
            hasDocument={(timeline.data?.documentRows.length ?? 0) > 0}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {step === "assistant" && <AssistantStep pet={pet} onDone={goNext} onBack={goBack} />}
        {step === "privacy" && (
          <PrivacyStep petName={pet.name} petId={pet.id} onNext={goNext} onBack={goBack} />
        )}
        {step === "done" && <DoneStep petId={pet.id} petName={pet.name} />}
      </div>
    </div>
  );
}

/* -------------------- Step 1: Welcome -------------------- */

function WelcomeStep({ petName, onNext }: { petName: string; onNext: () => void }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-10 text-center shadow-[var(--shadow-card)]">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <PartyPopper className="h-8 w-8" />
      </div>
      <h1 className="mt-6 text-2xl font-bold tracking-tight">Bem-vindo(a) ao PetID!</h1>
      <p className="mx-auto mt-2 max-w-md text-muted-foreground">
        Vamos preparar o assistente pessoal de {petName} — rotina de cuidados, saúde e lembretes
        inteligentes, tudo em poucos passos.
      </p>
      <Button onClick={onNext} size="lg" className="mt-8 rounded-full px-8">
        Continuar <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

/* -------------------- Step 2: Confirm pet info -------------------- */

function ConfirmStep({ pet, onNext }: { pet: OnboardingPet; onNext: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    photo_url: pet.photo_url ?? "",
    name: pet.name,
    species: pet.species ?? SPECIES_OPTIONS[0],
    breed: pet.breed ?? "",
    sex: pet.sex ?? "",
    birth_date: pet.birth_date ?? "",
    weight_kg: pet.weight_kg != null ? String(pet.weight_kg) : "",
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Informe o nome do pet.");
      const { error } = await supabase
        .from("pets")
        .update({
          name: form.name.trim(),
          species: form.species || null,
          breed: form.breed || null,
          sex: form.sex || null,
          birth_date: form.birth_date || null,
          weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
          photo_url: form.photo_url || null,
        })
        .eq("id", pet.id);
      if (error) throw error;
    },
    onSuccess: () => {
      // Same invalidation set as the "Novo Pet" and Identity forms — Meus
      // Pets, Dashboard/Today and the FAB's pet picker all read this pet.
      qc.invalidateQueries({ queryKey: ["pet", pet.id] });
      qc.invalidateQueries({ queryKey: ["pets"] });
      qc.invalidateQueries({ queryKey: ["today-care-overview"] });
      qc.invalidateQueries({ queryKey: ["pets-quick-picker"] });
      onNext();
    },
    onError: (e: unknown) =>
      toast.error(
        logAndDescribeError(
          "PetOnboardingWizard: confirm info failed",
          e,
          "Não foi possível salvar as informações.",
        ),
      ),
  });

  return (
    <div className="rounded-3xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
      <h2 className="text-xl font-bold">Confirme as informações de {pet.name}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Pode ajustar tudo agora — ou completar depois no perfil.
      </p>

      <div className="mt-6 flex justify-center">
        <PhotoUploader
          value={form.photo_url}
          onChange={(url) => setForm((f) => ({ ...f, photo_url: url ?? "" }))}
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Nome *</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <Label className="mb-1.5 block text-sm">Espécie</Label>
          <Select value={form.species} onValueChange={(v) => setForm({ ...form, species: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {SPECIES_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <PetBreedField
          species={form.species}
          value={form.breed}
          onChange={(v) => setForm({ ...form, breed: v })}
        />
        <PetSexField value={form.sex} onChange={(v) => setForm({ ...form, sex: v })} />
        <div>
          <Label>Nascimento</Label>
          <Input
            type="date"
            value={form.birth_date}
            onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
          />
        </div>
        <div>
          <Label>Peso (kg)</Label>
          <Input
            type="number"
            step="0.1"
            value={form.weight_kg}
            onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
          />
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="rounded-full px-6"
        >
          {save.isPending ? "Salvando…" : "Avançar"} <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* -------------------- Step 3: Build the Smart Routine -------------------- */

function RoutineStep({
  pet,
  hasRoutine,
  routineCount,
  loading,
  onNext,
  onBack,
}: {
  pet: OnboardingPet;
  hasRoutine: boolean;
  routineCount: number;
  loading: boolean;
  onNext: () => void;
  onBack: () => void;
}) {
  const createRoutine = useCreateRoutine(pet.id);
  const initialSpecies = pet.species ? (SPECIES_TO_PRESET[pet.species] ?? null) : null;

  if (loading) {
    return (
      <div className="rounded-3xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="mt-4 h-40 w-full" />
      </div>
    );
  }

  // Re-entering onboarding (e.g. browser back) after a routine already
  // exists must never re-run tracker creation — createRoutine has no
  // dedup, so a second confirm would insert duplicates.
  if (hasRoutine) {
    return (
      <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-[var(--shadow-card)]">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
        <h2 className="mt-4 text-xl font-bold">Rotina já configurada</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {pet.name} já tem {routineCount}{" "}
          {routineCount === 1 ? "cuidado programado" : "cuidados programados"}.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="ghost" onClick={onBack} className="rounded-full">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <Button onClick={onNext} className="rounded-full px-6">
            Continuar <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SmartOnboarding
      petName={pet.name}
      initialSpecies={initialSpecies}
      pending={createRoutine.isPending}
      onConfirm={(items) => createRoutine.mutate(items, { onSuccess: onNext })}
      onBlank={onNext}
    />
  );
}

/* -------------------- Step 4: Health setup -------------------- */

function HealthStep({
  pet,
  hasWeight,
  hasVaccine,
  hasDocument,
  onNext,
  onBack,
}: {
  pet: OnboardingPet;
  hasWeight: boolean;
  hasVaccine: boolean;
  hasDocument: boolean;
  onNext: () => void;
  onBack: () => void;
}) {
  const [healthAction, setHealthAction] = useState<"weight" | "vaccine" | undefined>(undefined);
  const [docAction, setDocAction] = useState(false);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  const toggleSkip = (key: string) =>
    setSkipped((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });

  return (
    <div className="rounded-3xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
      <h2 className="text-xl font-bold">Configuração de saúde</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Sugestões rápidas para começar — pode fazer agora ou deixar para depois.
      </p>

      <div className="mt-6 space-y-3">
        <HealthSuggestionCard
          icon={Weight}
          title="Registrar primeiro peso"
          tag="Recomendado"
          description="Acompanhe a evolução do peso ao longo do tempo."
          done={hasWeight}
          skipped={skipped.has("weight")}
          onDo={() => setHealthAction("weight")}
          onSkip={() => toggleSkip("weight")}
          laterLabel="Pular"
        />
        <HealthSuggestionCard
          icon={Syringe}
          title="Adicionar registro de vacina"
          tag="Recomendado"
          description="Nunca perca a data da próxima dose."
          done={hasVaccine}
          skipped={skipped.has("vaccine")}
          onDo={() => setHealthAction("vaccine")}
          onSkip={() => toggleSkip("vaccine")}
          laterLabel="Pular"
        />
        <HealthSuggestionCard
          icon={FileText}
          title="Enviar documento importante"
          tag="Opcional"
          description="Carteira de vacinação, pedigree, seguro…"
          done={hasDocument}
          skipped={skipped.has("document")}
          onDo={() => setDocAction(true)}
          onSkip={() => toggleSkip("document")}
          laterLabel="Mais tarde"
        />
      </div>

      <div className="mt-8 flex justify-between">
        <Button variant="ghost" onClick={onBack} className="rounded-full">
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
        <Button onClick={onNext} className="rounded-full px-6">
          Continuar <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      {/* Not user-visible: hosts the real Health/Documents dialogs so "Fazer
          agora" reuses their exact forms and mutations. Radix dialogs render
          into a body-level portal, so they still show as normal overlays. */}
      <div className="hidden">
        <HealthTab
          pet={pet}
          autoOpen={healthAction}
          onConsumeAutoOpen={() => setHealthAction(undefined)}
        />
        <DocumentsTab
          petId={pet.id}
          autoOpen={docAction}
          onConsumeAutoOpen={() => setDocAction(false)}
        />
      </div>
    </div>
  );
}

function HealthSuggestionCard({
  icon: Icon,
  title,
  tag,
  description,
  done,
  skipped,
  onDo,
  onSkip,
  laterLabel,
}: {
  icon: LucideIcon;
  title: string;
  tag: "Recomendado" | "Opcional";
  description: string;
  done: boolean;
  skipped: boolean;
  onDo: () => void;
  onSkip: () => void;
  laterLabel: string;
}) {
  if (done) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">Concluído</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-border p-4 ${skipped ? "opacity-50" : "bg-card"}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{title}</p>
            <Badge variant={tag === "Recomendado" ? "secondary" : "outline"} className="text-xs">
              {tag}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          {!skipped && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" className="rounded-full" onClick={onDo}>
                Fazer agora
              </Button>
              <Button size="sm" variant="ghost" className="rounded-full" onClick={onSkip}>
                {laterLabel}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------- Step 5: Assistant personalization -------------------- */

function AssistantStep({
  pet,
  onDone,
  onBack,
}: {
  pet: OnboardingPet;
  onDone: () => void;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const extras = useMemo(() => parseProfileExtras(pet.profile_extras), [pet.profile_extras]);
  const [prefs, setPrefs] = useState<Required<Pick<ProfileAssistantExtras, "water" | "vaccines" | "walks" | "weight">>>({
    water: extras.assistant?.water ?? true,
    vaccines: extras.assistant?.vaccines ?? true,
    walks: extras.assistant?.walks ?? true,
    weight: extras.assistant?.weight ?? true,
  });

  const finish = useMutation({
    mutationFn: async () => {
      const nextExtras: ProfileExtras = {
        ...extras,
        assistant: { ...prefs, memory: extras.assistant?.memory },
        onboarding: { completed: true, completed_at: new Date().toISOString() },
      };
      const { error } = await supabase
        .from("pets")
        .update({ profile_extras: nextExtras })
        .eq("id", pet.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pet", pet.id] });
      onDone();
    },
    onError: (e: unknown) =>
      toast.error(
        logAndDescribeError(
          "PetOnboardingWizard: save preferences failed",
          e,
          "Não foi possível salvar as preferências.",
        ),
      ),
  });

  const toggles: { key: "water" | "vaccines" | "walks" | "weight"; icon: LucideIcon; label: string }[] = [
    { key: "water", icon: Droplets, label: "Água está em falta" },
    { key: "vaccines", icon: Syringe, label: "Vacinas estão vencendo" },
    { key: "walks", icon: Footprints, label: "Passeios estão incompletos" },
    { key: "weight", icon: Weight, label: "Peso não foi atualizado" },
  ];

  return (
    <div className="rounded-3xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 text-primary">
        <Bell className="h-5 w-5" />
        <p className="text-sm font-semibold uppercase tracking-wide">Assistente PetID</p>
      </div>
      <h2 className="mt-1 text-xl font-bold">Vou te avisar quando…</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Escolha o que faz sentido acompanhar — você pode mudar isso quando quiser.
      </p>

      <div className="mt-6 space-y-2">
        {toggles.map((t) => {
          const Icon = t.icon;
          return (
            <div
              key={t.key}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border p-4"
            >
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">{t.label}</span>
              </div>
              <Switch
                checked={prefs[t.key]}
                onCheckedChange={(v) => setPrefs((p) => ({ ...p, [t.key]: v }))}
                aria-label={t.label}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex justify-between">
        <Button variant="ghost" onClick={onBack} className="rounded-full">
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
        <Button
          onClick={() => finish.mutate()}
          disabled={finish.isPending}
          className="rounded-full px-6"
        >
          {finish.isPending ? "Salvando…" : "Continuar"} <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* -------------------- QR / privacy -------------------- */

function PrivacyStep({
  petName,
  petId,
  onNext,
  onBack,
}: {
  petName: string;
  petId: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="rounded-3xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 text-primary">
        <QrCode className="h-5 w-5" />
        <p className="text-sm font-semibold uppercase tracking-wide">QR Code e privacidade</p>
      </div>
      <h2 className="mt-1 text-xl font-bold">O que aparece quando alguém escaneia</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        O QR Code da coleira abre o perfil público de {petName}. Você controla o que fica
        visível — dados sensíveis de saúde começam ocultos por padrão.
      </p>

      <ul className="mt-6 space-y-3 text-sm">
        <li className="flex items-start gap-3 rounded-2xl border border-border p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <span>
            Contatos de emergência e telefone podem aparecer no perfil público para ajudar se o
            pet se perder — revise isso na aba <strong>QR Code</strong>.
          </span>
        </li>
        <li className="flex items-start gap-3 rounded-2xl border border-border p-4">
          <QrCode className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <span>
            Imprima o QR a partir do domínio de produção. Links de preview temporários podem
            deixar de funcionar depois.
          </span>
        </li>
      </ul>

      <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={onBack} className="min-h-11 rounded-full">
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 rounded-full"
            onClick={() =>
              navigate({ to: "/pets/$id", params: { id: petId }, search: { tab: "qr" } })
            }
          >
            Abrir QR Code
          </Button>
          <Button onClick={onNext} className="min-h-11 rounded-full px-6">
            Entendi <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------------------- Final step: success screen -------------------- */

function DoneStep({ petId, petName }: { petId: string; petName: string }) {
  const navigate = useNavigate();
  const highlights = [
    "Rotina diária",
    "Acompanhamento de saúde",
    "Lembretes inteligentes",
    "QR Code com controle de privacidade",
  ];

  const goNext = () => {
    if (navigateToPendingActivation(navigate, { petId })) return;
    navigate({ to: "/pets/$id", params: { id: petId } });
  };

  return (
    <div className="rounded-3xl border border-border bg-gradient-to-br from-primary/10 to-card p-10 text-center shadow-[var(--shadow-card)]">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles className="h-8 w-8" />
      </div>
      <h1 className="mt-6 text-2xl font-bold tracking-tight">{petName} está pronto(a)!</h1>
      <p className="mt-2 text-muted-foreground">Preparamos tudo para você começar agora mesmo.</p>

      <div className="mx-auto mt-6 max-w-sm space-y-2 text-left">
        {highlights.map((label) => (
          <div key={label} className="flex items-center gap-3 rounded-xl bg-secondary/60 px-4 py-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
            <span className="text-sm font-medium">{label}</span>
          </div>
        ))}
      </div>

      <Button
        size="lg"
        className="mt-8 min-h-11 rounded-full px-8"
        onClick={goNext}
      >
        Continuar <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}
