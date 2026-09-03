/**
 * Central origin helpers for auth redirects, QR codes, invite links, and shares.
 *
 * Priority:
 * 1. `VITE_PUBLIC_APP_URL` when set (production / custom domain)
 * 2. Current browser origin (local/preview/deployed host)
 * 3. Empty string on SSR when neither is available
 *
 * Official production canonical origin: https://usepetid.com.br
 * Local development: leave `VITE_PUBLIC_APP_URL` unset so
 * `window.location.origin` is used (e.g. http://localhost:5173).
 */

/** Documented production canonical origin (not used automatically unless env matches). */
export const PRODUCTION_CANONICAL_ORIGIN = "https://usepetid.com.br";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Optional production canonical origin from env (no trailing slash). */
export function configuredPublicAppUrl(): string | null {
  const raw = import.meta.env.VITE_PUBLIC_APP_URL;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return trimTrailingSlash(u.origin);
  } catch {
    return null;
  }
}

/** True when the build is configured for the official production domain. */
export function isProductionAppUrlConfigured(): boolean {
  return configuredPublicAppUrl() === PRODUCTION_CANONICAL_ORIGIN;
}

/** Origin used for user-facing absolute links (auth, QR, invites). */
export function getAppOrigin(): string {
  const configured = configuredPublicAppUrl();
  if (configured) return configured;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}

/** Absolute URL for an internal path (must start with `/`). */
export function appAbsoluteUrl(path: string): string {
  const origin = getAppOrigin();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return origin ? `${origin}${normalized}` : normalized;
}

export function publicPetUrl(slug: string): string {
  return appAbsoluteUrl(`/p/${encodeURIComponent(slug)}`);
}

export function vetInviteUrl(token: string): string {
  return appAbsoluteUrl(`/v/${encodeURIComponent(token)}`);
}

export function physicalTagUrl(token: string): string {
  return appAbsoluteUrl(`/t/${encodeURIComponent(token)}`);
}

export function authCallbackUrl(): string {
  return appAbsoluteUrl("/auth-callback");
}

export function resetPasswordUrl(): string {
  return appAbsoluteUrl("/reset-password");
}

export function emailConfirmRedirectUrl(): string {
  // Must land on /auth-callback so the confirmation `code` is exchanged for a
  // session. Redirecting to bare origin dumps users on marketing/auth without login.
  return authCallbackUrl();
}
