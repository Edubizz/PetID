/**
 * Email helpers for email/password auth.
 * No provider/domain allowlists — Gmail, Outlook, Hotmail, iCloud, Yahoo,
 * and custom domains are all accepted when syntactically valid.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trim + lowercase for consistent signup/login/reset lookups. */
export function normalizeAuthEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Syntactic email check — does NOT restrict to Gmail or any provider. */
export function isValidAuthEmail(raw: string): boolean {
  const email = normalizeAuthEmail(raw);
  if (!email || email.length > 254) return false;
  if (email.includes("..")) return false;
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || !domain || domain.startsWith(".") || domain.endsWith(".")) return false;
  return EMAIL_RE.test(email);
}

/** Detect Supabase "fake user" response when email is already registered. */
export function isLikelyDuplicateSignupUser(user: {
  identities?: unknown[] | null;
} | null | undefined): boolean {
  if (!user) return false;
  return !user.identities || user.identities.length === 0;
}

export function isEmailNotConfirmedError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const lower = raw.toLowerCase();
  return lower.includes("email not confirmed") || lower.includes("email_not_confirmed");
}

/** Minimum seconds between confirmation resend requests. */
export const RESEND_CONFIRMATION_COOLDOWN_SEC = 60;
