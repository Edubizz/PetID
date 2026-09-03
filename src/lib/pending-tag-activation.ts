/**
 * Session-scoped pending physical-tag activation.
 * Only the public token is stored — never the activation code.
 */

export const PENDING_TAG_ACTIVATION_KEY = "petid_pending_tag_activation";
export const AUTH_NEXT_KEY = "petid_auth_next";

/** Public tokens are URL-safe (batch gen strips base64 +/=); keep validation loose but non-empty. */
const TOKEN_RE = /^[A-Za-z0-9._~-]{12,64}$/;

export function isValidPublicTagToken(token: string | null | undefined): token is string {
  if (!token) return false;
  const t = token.trim();
  return TOKEN_RE.test(t);
}

export function safeInternalPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.startsWith("/auth") || raw.startsWith("/legal-accept")) return null;
  return raw;
}

export function activateTagHref(token: string): string {
  return `/activate-tag?token=${encodeURIComponent(token.trim())}`;
}

export function setPendingTagActivation(token: string): void {
  const t = token.trim();
  if (!isValidPublicTagToken(t)) return;
  try {
    sessionStorage.setItem(PENDING_TAG_ACTIVATION_KEY, t);
  } catch {
    /* ignore */
  }
}

export function getPendingTagActivation(): string | null {
  try {
    const raw = sessionStorage.getItem(PENDING_TAG_ACTIVATION_KEY);
    if (!isValidPublicTagToken(raw)) {
      if (raw) sessionStorage.removeItem(PENDING_TAG_ACTIVATION_KEY);
      return null;
    }
    return raw!.trim();
  } catch {
    return null;
  }
}

export function clearPendingTagActivation(): void {
  try {
    sessionStorage.removeItem(PENDING_TAG_ACTIVATION_KEY);
  } catch {
    /* ignore */
  }
}

/** Cancel pending activation and optional auth next pointer. */
export function cancelPendingTagActivation(): void {
  clearPendingTagActivation();
  try {
    const next = sessionStorage.getItem(AUTH_NEXT_KEY);
    if (next && next.includes("/activate-tag")) {
      sessionStorage.removeItem(AUTH_NEXT_KEY);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Resolve where to send the user after auth / legal / pet creation.
 * Prefer a live pending public token over a stale or mis-parsed `next` string.
 */
export function resolveActivationAwareDestination(
  nextPath: string | null | undefined,
): { kind: "activate-tag"; token: string; petId?: string } | { kind: "path"; path: string } {
  const pending = getPendingTagActivation();
  if (pending) {
    return { kind: "activate-tag", token: pending };
  }

  const safe = safeInternalPath(nextPath);
  if (!safe) {
    return { kind: "path", path: "/dashboard" };
  }

  if (safe === "/activate-tag" || safe.startsWith("/activate-tag?")) {
    try {
      const url = new URL(safe, "https://petid.local");
      const token = url.searchParams.get("token");
      const petId = url.searchParams.get("petId") ?? undefined;
      if (isValidPublicTagToken(token)) {
        setPendingTagActivation(token);
        return {
          kind: "activate-tag",
          token: token.trim(),
          petId: petId && petId.trim() ? petId.trim() : undefined,
        };
      }
    } catch {
      /* fall through */
    }
    return { kind: "path", path: "/activate-tag" };
  }

  return { kind: "path", path: safe.split("#")[0] || "/dashboard" };
}

export type AppNavigate = (opts: {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
  replace?: boolean;
}) => unknown;

/**
 * Navigate after login/signup/legal without stuffing query strings into `to`
 * (TanStack Router expects `search` separately — that bug dropped tag tokens).
 */
export function navigateAfterAuth(
  navigate: AppNavigate,
  nextPath: string | null | undefined,
  options?: { replace?: boolean },
): void {
  const replace = options?.replace ?? true;
  const dest = resolveActivationAwareDestination(nextPath);

  if (dest.kind === "activate-tag") {
    navigate({
      to: "/activate-tag",
      search: {
        token: dest.token,
        ...(dest.petId ? { petId: dest.petId } : {}),
      },
      replace,
    });
    return;
  }

  const path = dest.path;
  const vMatch = path.match(/^\/v\/([^/?#]+)/);
  if (vMatch) {
    navigate({
      to: "/v/$token",
      params: { token: decodeURIComponent(vMatch[1]) },
      replace,
    });
    return;
  }

  const pathOnly = path.split("?")[0] || "/dashboard";
  navigate({ to: pathOnly, replace });
}

export function navigateToPendingActivation(
  navigate: AppNavigate,
  options?: { petId?: string; replace?: boolean },
): boolean {
  const token = getPendingTagActivation();
  if (!token) return false;
  navigate({
    to: "/activate-tag",
    search: {
      token,
      ...(options?.petId ? { petId: options.petId } : {}),
    },
    replace: options?.replace ?? false,
  });
  return true;
}
