import { resolveCompletenessDestination } from "@/lib/pet-navigation";
import { computeAge } from "@/lib/pet-utils";
import {
  parsePublicVisibility,
  type PublicVisibilitySettings,
} from "@/lib/public-visibility";

/** Grouped pet-profile extras stored in pets.profile_extras (one JSONB column). */
export type ProfileOwnerExtras = {
  name?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  relationship?: string;
  notes?: string;
};

export type ProfileVeterinaryExtras = {
  name?: string;
  clinic?: string;
  phone?: string;
  address?: string;
  emergency_clinic?: string;
  notes?: string;
};

export type ProfileIdentificationExtras = {
  registration?: string;
  insurance?: string;
  passport?: string;
  license?: string;
};

/**
 * Lightweight memory the Assistant uses to avoid nagging: which insight
 * "keys" were explicitly dismissed and until when they stay suppressed.
 * Learned habits (preferred amounts/times) are intentionally NOT stored here —
 * they're recomputed live from tracker_entries each time (always accurate,
 * zero extra writes/requests).
 */
export type AssistantMemory = {
  /** insightKey -> ISO timestamp the suppression lasts until. */
  dismissed?: Record<string, string>;
};

/** Which assistant categories the owner wants reminders for (Smart Assistant personalization). */
export type ProfileAssistantExtras = {
  water?: boolean;
  vaccines?: boolean;
  walks?: boolean;
  weight?: boolean;
  memory?: AssistantMemory;
};

/** Marks whether the guided first-run onboarding wizard has been completed. */
export type ProfileOnboardingExtras = {
  completed?: boolean;
  completed_at?: string;
};

export type ProfileExtras = {
  owner?: ProfileOwnerExtras;
  veterinary?: ProfileVeterinaryExtras;
  identification?: ProfileIdentificationExtras;
  assistant?: ProfileAssistantExtras;
  onboarding?: ProfileOnboardingExtras;
  public_visibility?: PublicVisibilitySettings;
};

export const EMPTY_PROFILE_EXTRAS: ProfileExtras = {
  owner: {},
  veterinary: {},
  identification: {},
  assistant: { water: true, vaccines: true, walks: true, weight: true },
  onboarding: {},
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickStr(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function pickBool(obj: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = obj[key];
  return typeof v === "boolean" ? v : fallback;
}

function pickDismissedMap(raw: unknown): Record<string, string> {
  const src = asRecord(raw).dismissed;
  const record = asRecord(src);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string" && value) out[key] = value;
  }
  return out;
}

export function parseProfileExtras(raw: unknown): ProfileExtras {
  const root = asRecord(raw);
  const owner = asRecord(root.owner);
  const veterinary = asRecord(root.veterinary);
  const identification = asRecord(root.identification);
  const assistant = asRecord(root.assistant);
  const onboarding = asRecord(root.onboarding);
  return {
    owner: {
      name: pickStr(owner, "name"),
      phone: pickStr(owner, "phone"),
      whatsapp: pickStr(owner, "whatsapp"),
      email: pickStr(owner, "email"),
      relationship: pickStr(owner, "relationship"),
      notes: pickStr(owner, "notes"),
    },
    veterinary: {
      name: pickStr(veterinary, "name"),
      clinic: pickStr(veterinary, "clinic"),
      phone: pickStr(veterinary, "phone"),
      address: pickStr(veterinary, "address"),
      emergency_clinic: pickStr(veterinary, "emergency_clinic"),
      notes: pickStr(veterinary, "notes"),
    },
    identification: {
      registration: pickStr(identification, "registration"),
      insurance: pickStr(identification, "insurance"),
      passport: pickStr(identification, "passport"),
      license: pickStr(identification, "license"),
    },
    assistant: {
      water: pickBool(assistant, "water", true),
      vaccines: pickBool(assistant, "vaccines", true),
      walks: pickBool(assistant, "walks", true),
      weight: pickBool(assistant, "weight", true),
      memory: { dismissed: pickDismissedMap(assistant.memory) },
    },
    onboarding: {
      completed: pickBool(onboarding, "completed", false),
      completed_at: pickStr(onboarding, "completed_at"),
    },
    public_visibility: parsePublicVisibility(raw),
  };
}

export function filled(value: string | null | undefined): boolean {
  return Boolean(value && String(value).trim());
}

export type CompletenessItem = {
  id: string;
  label: string;
  tab: string;
  action?: string;
  section?: string;
  done: boolean;
};

export type CompletenessInput = {
  photo_url: string | null;
  breed: string | null;
  sex: string | null;
  birth_date: string | null;
  weight_kg: number | null;
  microchip: string | null;
  secondary_contact_name: string | null;
  secondary_contact_phone: string | null;
  extras: ProfileExtras;
  hasWeightHistory: boolean;
  hasVaccine: boolean;
  hasPrimaryVet: boolean;
};

function completenessItem(
  id: string,
  label: string,
  done: boolean,
): CompletenessItem {
  const dest = resolveCompletenessDestination(id);
  return {
    id,
    label,
    done,
    tab: dest.tab,
    action: dest.action,
    section: dest.section,
  };
}

export function computeProfileCompleteness(input: CompletenessInput): {
  pct: number;
  items: CompletenessItem[];
  missing: CompletenessItem[];
} {
  const items: CompletenessItem[] = [
    completenessItem("photo", "Foto do pet", filled(input.photo_url)),
    completenessItem("breed", "Raça", filled(input.breed)),
    completenessItem("sex", "Sexo", filled(input.sex)),
    completenessItem("birth", "Data de nascimento", filled(input.birth_date)),
    completenessItem(
      "owner",
      "Tutor principal",
      filled(input.extras.owner?.name) || filled(input.extras.owner?.phone),
    ),
    completenessItem(
      "emergency",
      "Contato de emergência",
      filled(input.secondary_contact_name) && filled(input.secondary_contact_phone),
    ),
    completenessItem(
      "vet",
      "Veterinário principal",
      input.hasPrimaryVet || filled(input.extras.veterinary?.name),
    ),
    completenessItem("microchip", "Microchip", filled(input.microchip)),
    completenessItem(
      "insurance",
      "Seguro",
      filled(input.extras.identification?.insurance),
    ),
    completenessItem(
      "weight",
      "Histórico de peso",
      input.hasWeightHistory || input.weight_kg != null,
    ),
    completenessItem("vaccine", "Vacinas", input.hasVaccine),
  ];

  const doneCount = items.filter((i) => i.done).length;
  const pct = items.length === 0 ? 100 : Math.round((doneCount / items.length) * 100);
  return { pct, items, missing: items.filter((i) => !i.done) };
}

export type QuickFact = {
  id: string;
  label: string;
  tone?: "default" | "success" | "warning" | "danger";
};

export function buildQuickFacts(input: {
  sex: string | null;
  breed: string | null;
  birth_date: string | null;
  weight_kg: number | null;
  microchip: string | null;
  is_lost: boolean;
  hasVaccine: boolean;
}): QuickFact[] {
  const facts: QuickFact[] = [];
  if (filled(input.sex)) facts.push({ id: "sex", label: input.sex! });
  if (filled(input.breed)) facts.push({ id: "breed", label: input.breed! });
  const age = computeAge(input.birth_date);
  if (age && age !== "—") facts.push({ id: "age", label: age });
  if (input.weight_kg != null) facts.push({ id: "weight", label: `${input.weight_kg} kg` });
  if (input.hasVaccine) facts.push({ id: "vaccinated", label: "Vacinado", tone: "success" });
  if (filled(input.microchip)) facts.push({ id: "chip", label: "Microchipado", tone: "success" });
  if (input.is_lost) {
    facts.push({ id: "lost", label: "Modo perdido ATIVO", tone: "danger" });
  } else {
    facts.push({ id: "safe", label: "Modo perdido OFF", tone: "default" });
  }
  return facts;
}

/** Suggested document types for the visual Document Center. */
export const DOCUMENT_STATUS_TYPES = [
  { key: "rabies", label: "Certificado de raiva", match: [/raiva/i, /rabies/i] },
  { key: "vaccine_card", label: "Carteira de vacinação", match: [/carteira/i, /vacina/i] },
  { key: "insurance", label: "Seguro", match: [/seguro/i, /insurance/i] },
  { key: "passport", label: "Passaporte", match: [/passaporte/i, /passport/i] },
  { key: "microchip", label: "Registro do microchip", match: [/microchip/i] },
  { key: "health", label: "Atestado de saúde", match: [/saúde/i, /saude/i, /health/i, /atestado/i] },
] as const;

export function documentMatchesType(
  doc: { title: string; category: string | null },
  matchers: readonly RegExp[],
): boolean {
  const hay = `${doc.title} ${doc.category ?? ""}`;
  return matchers.some((re) => re.test(hay));
}

export const NOT_REGISTERED = "Não registrado";
