import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { supabase } from "@/integrations/supabase/client";

export type LegalAcceptanceSnapshot = {
  accepted: boolean;
  terms_version?: string;
  privacy_version?: string;
  accepted_at?: string;
  source?: string;
  current: boolean;
};

export function parseLegalAcceptance(raw: unknown): LegalAcceptanceSnapshot {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { accepted: false, current: false };
  }
  const row = raw as Record<string, unknown>;
  const accepted = Boolean(row.accepted);
  const terms = typeof row.terms_version === "string" ? row.terms_version : undefined;
  const privacy = typeof row.privacy_version === "string" ? row.privacy_version : undefined;
  return {
    accepted,
    terms_version: terms,
    privacy_version: privacy,
    accepted_at: typeof row.accepted_at === "string" ? row.accepted_at : undefined,
    source: typeof row.source === "string" ? row.source : undefined,
    current: accepted && terms === TERMS_VERSION && privacy === PRIVACY_VERSION,
  };
}

export function hasCurrentLegalAcceptance(raw: unknown): boolean {
  return parseLegalAcceptance(raw).current;
}

export type LegalGateResult =
  | { status: "accepted"; snapshot: LegalAcceptanceSnapshot }
  | { status: "pending"; snapshot: LegalAcceptanceSnapshot }
  | { status: "error"; error: unknown };

/** Authority for the gate: DB row + centralized current versions. */
export async function fetchLegalGateStatus(): Promise<LegalGateResult> {
  const { data, error } = await supabase.rpc("get_my_legal_acceptance");
  if (error) {
    return { status: "error", error };
  }
  const snapshot = parseLegalAcceptance(data);
  return snapshot.current
    ? { status: "accepted", snapshot }
    : { status: "pending", snapshot };
}

export function isPublicLegalPath(pathname: string): boolean {
  return (
    pathname === "/termos" ||
    pathname === "/privacidade" ||
    pathname === "/suporte" ||
    pathname.startsWith("/termos/") ||
    pathname.startsWith("/privacidade/") ||
    pathname.startsWith("/suporte/")
  );
}

export function isLegalAcceptPath(pathname: string): boolean {
  return pathname === "/legal-accept" || pathname.startsWith("/legal-accept/");
}
