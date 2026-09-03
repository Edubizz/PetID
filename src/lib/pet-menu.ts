import type { CompletenessItem } from "./pet-profile";

/**
 * Ordered pet detail sections for the collapsible "Menu do pet".
 * QR Code is intentionally near the top (after Geral) — not last.
 */

export type PetMenuSection = {
  id: string;
  label: string;
  /** Optional small badge (e.g. "Identificação" on QR) */
  badge?: string;
  /** Subtle visual emphasis without clutter */
  emphasize?: boolean;
};

export const PET_MENU_SECTIONS: readonly PetMenuSection[] = [
  { id: "dashboard", label: "Geral" },
  { id: "qr", label: "QR Code", badge: "Identificação", emphasize: true },
  { id: "daily-care", label: "Rotina" },
  { id: "health", label: "Saúde" },
  { id: "history", label: "Histórico" },
  { id: "documents", label: "Documentos" },
  { id: "info", label: "Identidade" },
  { id: "reports", label: "Relatórios" },
  { id: "lost", label: "Modo Perdido" },
  { id: "timeline", label: "Linha do Tempo" },
  { id: "caretakers", label: "Tutores" },
  { id: "veterinarians", label: "Veterinários" },
] as const;

export function petMenuLabel(tabId: string): string {
  return PET_MENU_SECTIONS.find((s) => s.id === tabId)?.label ?? "Geral";
}

/** Index of QR relative to other sections — used in tests. */
export function qrMenuPriorityIndex(): number {
  return PET_MENU_SECTIONS.findIndex((s) => s.id === "qr");
}

/** Whether the pet menu should show the pending-profile warning. */
export function hasPendingProfileItems(
  missing: CompletenessItem[] | null | undefined,
): boolean {
  return (missing?.length ?? 0) > 0;
}
