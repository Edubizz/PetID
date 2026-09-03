/**
 * Central destinations for pet-profile completion / dashboard shortcuts.
 * Keep tab ids aligned with `pets.$id` TabsTrigger values.
 */

export type PetNavDestination = {
  /** Canonical tab id on /pets/$id */
  tab: string;
  /** Optional deep action handled by the target tab (e.g. open vaccine dialog) */
  action?: string;
  /** Optional section id within the tab (`pet-section-{section}`) */
  section?: string;
};

/** Completeness checklist item ids → exact destination. */
export const COMPLETENESS_DESTINATIONS: Record<string, PetNavDestination> = {
  photo: { tab: "info", section: "photo" },
  breed: { tab: "info", section: "basics" },
  sex: { tab: "info", section: "basics" },
  birth: { tab: "info", section: "basics" },
  owner: { tab: "info", section: "owner" },
  emergency: { tab: "info", section: "emergency" },
  vet: { tab: "info", section: "veterinary" },
  microchip: { tab: "info", section: "identification" },
  insurance: { tab: "info", section: "identification" },
  weight: { tab: "health", action: "weight" },
  vaccine: { tab: "health", action: "vaccine" },
};

export function resolveCompletenessDestination(itemId: string): PetNavDestination {
  return COMPLETENESS_DESTINATIONS[itemId] ?? { tab: "info" };
}

export function petSectionDomId(section: string): string {
  return `pet-section-${section}`;
}
