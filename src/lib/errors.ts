/**
 * Turns raw Postgres/PostgREST/Auth/network error messages into short, actionable
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

  // Auth (Supabase Auth / GoTrue) — map common English strings to pt-BR
  if (lower.includes("email not confirmed") || lower.includes("email_not_confirmed")) {
    return "Confirme seu e-mail antes de entrar.";
  }
  if (
    lower.includes("invalid login credentials") ||
    lower.includes("invalid email or password")
  ) {
    return "E-mail ou senha incorretos.";
  }
  if (
    lower.includes("user already registered") ||
    lower.includes("already been registered") ||
    lower.includes("already registered")
  ) {
    return "Já existe uma conta com este e-mail.";
  }
  if (lower.includes("password should be at least") || lower.includes("password is too short")) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }
  if (lower.includes("unable to validate email") || lower.includes("invalid email")) {
    return "Informe um e-mail válido.";
  }
  if (
    lower.includes("otp_expired") ||
    lower.includes("token has expired") ||
    lower.includes("email link is invalid") ||
    lower.includes("flow state") ||
    (lower.includes("confirm") && (lower.includes("fail") || lower.includes("error")))
  ) {
    if (lower.includes("confirm") || lower.includes("verification")) {
      return "Não foi possível confirmar seu e-mail. Tente novamente ou solicite um novo link.";
    }
    return "Este link expirou ou já foi usado. Solicite um novo.";
  }
  if (lower.includes("over_email_send_rate_limit") || lower.includes("email rate limit")) {
    return "Aguarde um momento antes de solicitar outro e-mail.";
  }
  if (lower.includes("provider is not enabled") || lower.includes("unsupported provider")) {
    return "Login com Google não está disponível no momento.";
  }

  if (lower.includes("row-level security") || lower.includes("permission denied")) {
    return "Você não tem permissão para fazer isso.";
  }
  if (lower.includes("violates foreign key constraint")) {
    return "Este pet não existe mais ou foi removido.";
  }
  if (lower.includes("schema cache") || (lower.includes("relation") && lower.includes("does not exist"))) {
    return "Erro de configuração do sistema. Tente novamente em instantes.";
  }
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("load failed") ||
    lower.includes("fetch failed")
  ) {
    return "Sem conexão com a internet. Verifique sua rede e tente novamente.";
  }
  if (lower.includes("duplicate key value")) {
    return "Este registro já existe.";
  }

  // Plan / entitlement limits (Postgres RAISE EXCEPTION messages)
  if (lower.includes("código beta inválido") || lower.includes("codigo beta invalido")) {
    return "Código beta inválido, expirado ou indisponível.";
  }
  if (lower.includes("plan_limit_pets")) {
    return "Seu plano atingiu o limite de pets. Faça upgrade para adicionar mais.";
  }
  if (lower.includes("plan_limit_caretakers")) {
    return "Seu plano atingiu o limite de tutores por pet. Faça upgrade para adicionar mais.";
  }
  if (lower.includes("plan_limit_documents")) {
    return "Seu plano atingiu o limite de documentos. Faça upgrade para adicionar mais.";
  }
  if (lower.includes("plan_limit_vet")) {
    return "Acesso veterinário está disponível nos planos Guardião e Família.";
  }
  if (lower.includes("plan_limit_")) {
    return "Limite do plano atingido. Veja os planos para desbloquear.";
  }
  if (
    lower.includes("jwt") ||
    lower.includes("not authenticated") ||
    lower.includes("no autenticado") ||
    (lower.includes("session") && lower.includes("expired")) ||
    lower.includes("refresh_token")
  ) {
    return "Sua sessão expirou. Faça login novamente.";
  }

  if (lower.includes("sole_admin") || lower.includes("único administrador") || lower.includes("unico administrador")) {
    return "Você é o único administrador. Transfira o papel de admin antes de excluir a conta.";
  }
  if (lower.includes("stripe_cancel_failed") || lower.includes("cancelar sua assinatura")) {
    return "Cancele a assinatura ativa no portal de cobrança e tente excluir a conta novamente.";
  }
  if (
    lower.includes("multiple_active_subscriptions") ||
    lower.includes("mais de uma assinatura ativa")
  ) {
    return "Há mais de uma assinatura ativa nesta conta. Contate o suporte para revisão da cobrança.";
  }

  // Never surface raw English/technical messages when a fallback was provided.
  return fallback || "Ocorreu um erro inesperado.";
}

/** Logs the technical error and returns the toast-ready message in one call. */
export function logAndDescribeError(context: string, error: unknown, fallback: string): string {
  console.error(context, error);
  return friendlyErrorMessage(error, fallback);
}
