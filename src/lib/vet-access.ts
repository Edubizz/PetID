/** Veterinarian access — owner grants + granular per-grant permissions. */

import { vetInviteUrl } from "@/lib/app-url";

export type VetAccessType = "temporary" | "permanent";
/** @deprecated Legacy grant-level flag; use VetGrantPermissions. */
export type VetPermission = "view" | "edit";

export type VetAccessLevel = "none" | "view" | "edit";

export type VetPermissionArea =
  | "identity"
  | "owner_contact"
  | "emergency_contact"
  | "allergies"
  | "medications"
  | "medical_notes"
  | "vaccines"
  | "weight"
  | "appointments"
  | "documents";

export type VetGrantPermissions = Record<VetPermissionArea, VetAccessLevel>;

export type VetAccessStatus =
  | "pending"
  | "active"
  | "expired"
  | "revoked"
  | "invite_expired"
  | "already_redeemed";

export const VET_VIEW_ONLY_AREAS: VetPermissionArea[] = [
  "identity",
  "owner_contact",
  "emergency_contact",
];

export const VET_EDITABLE_AREAS: VetPermissionArea[] = [
  "allergies",
  "medications",
  "medical_notes",
  "vaccines",
  "weight",
  "appointments",
  "documents",
];

export const VET_PERMISSION_LABELS: Record<VetPermissionArea, string> = {
  identity: "Identificação do pet",
  owner_contact: "Contato do tutor",
  emergency_contact: "Contato de emergência",
  allergies: "Alergias",
  medications: "Medicamentos",
  medical_notes: "Observações importantes",
  vaccines: "Vacinas",
  weight: "Histórico de peso",
  appointments: "Consultas",
  documents: "Documentos",
};

export const DEFAULT_VET_PERMISSIONS: VetGrantPermissions = {
  identity: "view",
  owner_contact: "none",
  emergency_contact: "none",
  allergies: "view",
  medications: "view",
  medical_notes: "view",
  vaccines: "view",
  weight: "view",
  appointments: "view",
  documents: "view",
};

export type PetVetAccessRow = {
  id: string;
  pet_id: string;
  created_by: string;
  vet_user_id: string | null;
  vet_name: string;
  clinic: string | null;
  access_type: VetAccessType;
  permission: VetPermission;
  permissions: VetGrantPermissions | Record<string, string>;
  token_hash: string;
  token_prefix: string;
  expires_at: string | null;
  invite_expires_at: string;
  redeemed_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateVetAccessResult = {
  access_id: string;
  access_token: string;
  invite_url_path: string;
  expires_at: string | null;
  invite_expires_at: string;
  access_type: VetAccessType;
  permission: VetPermission;
  permissions: VetGrantPermissions;
};

export type VetAccessPreview = {
  access_id: string;
  pet_id: string;
  pet_name: string;
  pet_species: string | null;
  pet_photo_url: string | null;
  vet_name: string;
  clinic: string | null;
  access_type: VetAccessType;
  permission: VetPermission;
  expires_at: string | null;
  invite_expires_at: string;
  status: VetAccessStatus;
};

export type MyVetPet = {
  access_id: string;
  pet_id: string;
  pet_name: string;
  pet_species: string | null;
  pet_breed: string | null;
  pet_photo_url: string | null;
  vet_name: string;
  clinic: string | null;
  access_type: VetAccessType;
  permission: VetPermission;
  permissions: VetGrantPermissions;
  expires_at: string | null;
  redeemed_at: string;
};

export type VetClinicalPet = {
  id: string;
  name: string | null;
  species: string | null;
  breed: string | null;
  sex: string | null;
  birth_date: string | null;
  weight_kg: number | null;
  photo_url: string | null;
  color: string | null;
  microchip: string | null;
  allergies: string | null;
  medications: string | null;
  medical_notes: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  owner_whatsapp: string | null;
  owner_email: string | null;
  owner_relationship: string | null;
  secondary_contact_name: string | null;
  secondary_contact_phone: string | null;
  emergency_instructions: string | null;
  permissions: VetGrantPermissions;
  access_type: VetAccessType;
  expires_at: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseLevel(raw: unknown, fallback: VetAccessLevel, allowEdit: boolean): VetAccessLevel {
  const v = typeof raw === "string" ? raw.toLowerCase() : "";
  if (v === "edit") return allowEdit ? "edit" : "view";
  if (v === "view") return "view";
  if (v === "none") return "none";
  return fallback;
}

export function parseVetPermissions(raw: unknown): VetGrantPermissions {
  const src = asRecord(raw);
  const out = { ...DEFAULT_VET_PERMISSIONS };
  for (const area of VET_VIEW_ONLY_AREAS) {
    out[area] = parseLevel(src[area], DEFAULT_VET_PERMISSIONS[area], false);
  }
  for (const area of VET_EDITABLE_AREAS) {
    out[area] = parseLevel(src[area], DEFAULT_VET_PERMISSIONS[area], true);
  }
  return out;
}

export function canVetAccess(level: VetAccessLevel | undefined, min: VetAccessLevel): boolean {
  const rank = { none: 0, view: 1, edit: 2 };
  return rank[level ?? "none"] >= rank[min];
}

export function vetAccessLevelLabel(level: VetAccessLevel): string {
  if (level === "edit") return "Editar";
  if (level === "view") return "Visualizar";
  return "Sem acesso";
}

export function summarizeVetPermissions(perms: VetGrantPermissions): { area: string; level: string }[] {
  return (Object.keys(VET_PERMISSION_LABELS) as VetPermissionArea[])
    .filter((k) => perms[k] !== "none")
    .map((k) => ({
      area: VET_PERMISSION_LABELS[k],
      level: vetAccessLevelLabel(perms[k]),
    }));
}

export function computeVetAccessStatus(row: PetVetAccessRow, now = Date.now()): VetAccessStatus {
  if (row.revoked_at) return "revoked";
  if (row.expires_at && new Date(row.expires_at).getTime() <= now) return "expired";
  if (row.redeemed_at) return "active";
  if (new Date(row.invite_expires_at).getTime() <= now) return "invite_expired";
  return "pending";
}

export function vetAccessStatusLabel(status: VetAccessStatus): string {
  switch (status) {
    case "pending":
      return "Aguardando";
    case "active":
      return "Ativo";
    case "expired":
      return "Expirado";
    case "revoked":
      return "Revogado";
    case "invite_expired":
      return "Convite expirado";
    case "already_redeemed":
      return "Já utilizado";
    default:
      return status;
  }
}

export function vetAccessTypeLabel(type: VetAccessType): string {
  return type === "permanent" ? "Permanente" : "Temporário";
}

export const TEMP_DURATION_PRESETS = [
  { label: "24 horas", hours: 24 },
  { label: "7 dias", hours: 24 * 7 },
  { label: "30 dias", hours: 24 * 30 },
] as const;

export function buildVetInviteUrl(token: string, origin?: string): string {
  if (origin) return `${origin.replace(/\/+$/, "")}/v/${encodeURIComponent(token)}`;
  return vetInviteUrl(token);
}
