import type { Json } from "@/integrations/supabase/types";

/**
 * Owner-controlled public QR profile visibility.
 * Stored in pets.profile_extras.public_visibility (JSONB).
 * Enforcement lives in get_public_pet — never rely on React alone.
 */

export type PublicVisibilityKey =
  | "photo"
  | "name"
  | "species"
  | "breed"
  | "sex"
  | "age"
  | "weight"
  | "microchip"
  | "pedigree"
  | "health_important"
  | "allergies"
  | "medications"
  | "vaccines"
  | "medical_notes"
  | "owner_name"
  | "phone"
  | "email"
  | "emergency_contact"
  | "reward"
  | "find_instructions"
  | "last_seen_location";

export type PublicVisibilitySettings = Record<PublicVisibilityKey, boolean>;

export type PublicVisibilityGroup = {
  id: string;
  title: string;
  description?: string;
  keys: { key: PublicVisibilityKey; label: string; hint?: string }[];
};

/**
 * Conservative defaults for NEW pets.
 * Pet identity + photo + contact needed to return the pet.
 * Sensitive health / owner PII / IDs stay private.
 */
export const SAFE_PUBLIC_VISIBILITY: PublicVisibilitySettings = {
  photo: true,
  name: true,
  species: true,
  breed: true,
  sex: true,
  age: false,
  weight: false,
  microchip: false,
  pedigree: false,
  health_important: false,
  allergies: false,
  medications: false,
  vaccines: false,
  medical_notes: false,
  owner_name: false,
  phone: true,
  email: false,
  emergency_contact: true,
  reward: true,
  find_instructions: true,
  last_seen_location: true,
};

/**
 * Matches pre-Sprint-3 get_public_pet behavior for EXISTING pets (migration backfill).
 * Medical fields follow show_medical_public at migration time.
 */
export const LEGACY_PUBLIC_VISIBILITY: PublicVisibilitySettings = {
  photo: true,
  name: true,
  species: true,
  breed: true,
  sex: true,
  age: true,
  weight: true,
  microchip: true,
  pedigree: false,
  health_important: false,
  allergies: true,
  medications: true,
  vaccines: false,
  medical_notes: true,
  owner_name: false,
  phone: true,
  email: false,
  emergency_contact: false,
  reward: true,
  find_instructions: false,
  last_seen_location: true,
};

export const PUBLIC_VISIBILITY_GROUPS: PublicVisibilityGroup[] = [
  {
    id: "pet",
    title: "Pet",
    keys: [
      { key: "photo", label: "Foto" },
      { key: "name", label: "Nome" },
      { key: "species", label: "Espécie" },
      { key: "breed", label: "Raça" },
      { key: "sex", label: "Sexo" },
      { key: "age", label: "Idade", hint: "Calculada a partir da data de nascimento" },
      { key: "weight", label: "Peso" },
    ],
  },
  {
    id: "id",
    title: "Identificação",
    keys: [
      { key: "microchip", label: "Microchip" },
      { key: "pedigree", label: "Número de identificação / pedigree", hint: "Inclui registro/pedigree cadastrado" },
    ],
  },
  {
    id: "health",
    title: "Saúde",
    description: "Ative cada item que pode aparecer no perfil público.",
    keys: [
      {
        key: "health_important",
        label: "Informações importantes de saúde",
        hint: "Atalho: liga alergias, medicamentos e observações",
      },
      { key: "allergies", label: "Alergias" },
      { key: "medications", label: "Medicamentos" },
      { key: "vaccines", label: "Vacinas", hint: "Somente vacinas já aplicadas" },
      { key: "medical_notes", label: "Observações médicas" },
    ],
  },
  {
    id: "contact",
    title: "Contato",
    description: "Dados do tutor e emergência. Evite expor e-mail sem necessidade.",
    keys: [
      { key: "owner_name", label: "Nome do tutor" },
      { key: "phone", label: "Telefone", hint: "Usado no botão de WhatsApp" },
      { key: "email", label: "Email" },
      {
        key: "emergency_contact",
        label: "Contato de emergência",
        hint: "Nome e telefone de emergência cadastrados",
      },
    ],
  },
  {
    id: "lost",
    title: "Modo perdido",
    description: "Só aparecem no perfil público quando o Modo perdido estiver ativo.",
    keys: [
      { key: "reward", label: "Recompensa" },
      { key: "find_instructions", label: "Instruções para quem encontrar" },
      { key: "last_seen_location", label: "Localização / área de referência" },
    ],
  },
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Resolve visibility from profile_extras; missing object → safe defaults. */
export function parsePublicVisibility(
  rawExtras: unknown,
  opts?: { legacyIfMissing?: boolean },
): PublicVisibilitySettings {
  const root = asRecord(rawExtras);
  const vis = asRecord(root.public_visibility);
  const hasObject = Object.keys(vis).length > 0 || "public_visibility" in root;
  const base =
    !hasObject && opts?.legacyIfMissing ? LEGACY_PUBLIC_VISIBILITY : SAFE_PUBLIC_VISIBILITY;

  const out = { ...base };
  for (const key of Object.keys(base) as PublicVisibilityKey[]) {
    const v = vis[key];
    if (typeof v === "boolean") out[key] = v;
  }
  return out;
}

export function withPublicVisibility(
  extras: Record<string, unknown> | unknown,
  visibility: PublicVisibilitySettings,
): Json {
  const root =
    extras && typeof extras === "object" && !Array.isArray(extras)
      ? { ...(extras as Record<string, unknown>) }
      : {};
  root.public_visibility = { ...visibility };
  return root as Json;
}

/** Any medical content that should sync show_medical_public. */
export function medicalPublicFromVisibility(v: PublicVisibilitySettings): boolean {
  const anyHealthField = v.allergies || v.medications || v.medical_notes || v.vaccines;
  // If any health content toggle is on, treat the medical block as public.
  return (v.health_important || anyHealthField) && anyHealthField;
}

/**
 * Apply HealthTab coarse toggle onto granular flags (keeps QR settings in sync).
 */
export function applyMedicalPublicToggle(
  current: PublicVisibilitySettings,
  show: boolean,
): PublicVisibilitySettings {
  return {
    ...current,
    health_important: show,
    allergies: show,
    medications: show,
    medical_notes: show,
    // vaccines stay owner-opt-in even when medical block is shown
  };
}

export type PublicPetVaccine = {
  name: string;
  applied_at: string | null;
};

/** Shape returned by get_public_pet after Sprint 3 (null = not permitted / empty). */
export type PublicPetPayload = {
  id: string;
  public_slug: string;
  name: string | null;
  species: string | null;
  breed: string | null;
  sex: string | null;
  birth_date: string | null;
  weight_kg: number | null;
  photo_url: string | null;
  color: string | null;
  microchip: string | null;
  pedigree: string | null;
  allergies: string | null;
  medications: string | null;
  medical_notes: string | null;
  vaccines_public: PublicPetVaccine[] | null;
  owner_display_name: string | null;
  owner_email: string | null;
  secondary_contact_name: string | null;
  secondary_contact_phone: string | null;
  emergency_contact_phone: string | null;
  emergency_instructions: string | null;
  is_lost: boolean;
  last_seen_location: string | null;
  lost_since: string | null;
  reward_amount: number | null;
  show_medical_public: boolean;
};

/** Normalize RPC row (json vaccines may arrive as unknown). */
export function normalizePublicPetPayload(row: Record<string, unknown> | null): PublicPetPayload | null {
  if (!row) return null;
  const vaccinesRaw = row.vaccines_public;
  let vaccines_public: PublicPetVaccine[] | null = null;
  if (Array.isArray(vaccinesRaw)) {
    vaccines_public = vaccinesRaw
      .map((v) => {
        const o = asRecord(v);
        const name = typeof o.name === "string" ? o.name : null;
        if (!name) return null;
        return {
          name,
          applied_at: typeof o.applied_at === "string" ? o.applied_at : null,
        };
      })
      .filter((v): v is PublicPetVaccine => v != null);
  }

  const str = (k: string) => {
    const v = row[k];
    return typeof v === "string" && v.trim() ? v : v === null ? null : typeof v === "string" ? v : null;
  };
  const num = (k: string) => {
    const v = row[k];
    if (v == null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    id: String(row.id),
    public_slug: String(row.public_slug ?? ""),
    name: str("name"),
    species: str("species"),
    breed: str("breed"),
    sex: str("sex"),
    birth_date: str("birth_date"),
    weight_kg: num("weight_kg"),
    photo_url: str("photo_url"),
    color: str("color"),
    microchip: str("microchip"),
    pedigree: str("pedigree"),
    allergies: str("allergies"),
    medications: str("medications"),
    medical_notes: str("medical_notes"),
    vaccines_public,
    owner_display_name: str("owner_display_name"),
    owner_email: str("owner_email"),
    secondary_contact_name: str("secondary_contact_name"),
    secondary_contact_phone: str("secondary_contact_phone"),
    emergency_contact_phone: str("emergency_contact_phone"),
    emergency_instructions: str("emergency_instructions"),
    is_lost: Boolean(row.is_lost),
    last_seen_location: str("last_seen_location"),
    lost_since: str("lost_since"),
    reward_amount: num("reward_amount"),
    show_medical_public: Boolean(row.show_medical_public),
  };
}
