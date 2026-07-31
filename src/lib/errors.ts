/**
 * Turns raw Postgres/PostgREST/network error messages into short, actionable
 * pt-BR toasts instead of leaking technical text (or a generic "Something
 * went wrong") to the user. The original error is always logged to the
 * console for debugging — this only changes what the user sees.
 *
 * `fallback` should be specific to the action that failed (e.g. "Não foi
 * possível criar o tracker."), since not every raw error matches a known
 * pattern below.
 */
export function friendlyErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const lower = raw.toLowerCase();

  if (lower.includes("row-level security") || lower.includes("permission denied")) {
    return "Você não tem permissão para fazer isso.";
  }
  if (lower.includes("violates foreign key constraint")) {
    return "Este pet não existe mais ou foi removido.";
  }
  if (lower.includes("schema cache") || (lower.includes("relation") && lower.includes("does not exist"))) {
    return "Erro de configuração do sistema. Tente novamente em instantes.";
  }
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("network request failed")) {
    return "Sem conexão com a internet. Verifique sua rede e tente novamente.";
  }
  if (lower.includes("duplicate key value")) {
    return "Este registro já existe.";
  }
  if (lower.includes("jwt") || lower.includes("not authenticated") || lower.includes("no autenticado")) {
    return "Sua sessão expirou. Faça login novamente.";
  }

  return fallback || raw || "Ocorreu um erro inesperado.";
}

/** Logs the technical error and returns the toast-ready message in one call. */
export function logAndDescribeError(context: string, error: unknown, fallback: string): string {
  console.error(context, error);
  return friendlyErrorMessage(error, fallback);
}
