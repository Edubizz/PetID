/**
 * Central legal / support configuration for PetID.
 * Material document changes MUST bump TERMS_VERSION / PRIVACY_VERSION so the
 * existing acceptance gate re-prompts users.
 *
 * Never invent CPF digits. Never log CPF in analytics/errors.
 * Never claim "100% LGPD compliant" or equivalent certification.
 */

export const SUPPORT_EMAIL = "suporte@usepetid.com.br";

/** Flip to true only after the mailbox is confirmed receiving mail. */
export const SUPPORT_EMAIL_ACTIVE = false;

/** Material revision — existing acceptances of 2026-08-25-v1 are no longer current. */
export const TERMS_VERSION = "2026-08-28-v1";
export const PRIVACY_VERSION = "2026-08-28-v1";

export const TERMS_EFFECTIVE_DATE = "28 de agosto de 2026";
export const PRIVACY_EFFECTIVE_DATE = "28 de agosto de 2026";

export const LEGAL_BRAND = "PetID";
export const LEGAL_WEBSITE = "https://usepetid.com.br";

/**
 * Individual operator / controller identity (not a company CNPJ at launch).
 * CPF: leave empty until the responsible person provides the real digits.
 */
export const LEGAL_IDENTITY = {
  responsibleName: "Leonardo Furriel Bento Lopes",
  /**
   * Digits only (or formatted). Empty = launch blocker.
   * Do not invent. Do not put in logs/analytics.
   */
  cpf: "53468106840" as string,
  address: "Alameda Tókio, 204 - Tamboré, Santana de Parnaíba - SP, 06543-050, Brasil",
} as const;

/** @deprecated Prefer LEGAL_IDENTITY — kept only for gradual migration checks. */
export const LEGAL_PLACEHOLDERS = {
  providerName: LEGAL_IDENTITY.responsibleName,
  providerId: LEGAL_IDENTITY.cpf || "CPF_DO_RESPONSAVEL",
  providerAddress: LEGAL_IDENTITY.address,
  controllerName: LEGAL_IDENTITY.responsibleName,
  controllerId: LEGAL_IDENTITY.cpf || "CPF_DO_RESPONSAVEL",
  controllerAddress: LEGAL_IDENTITY.address,
} as const;

export const LEGAL_ROUTES = {
  terms: "/termos",
  privacy: "/privacidade",
  support: "/suporte",
} as const;

export type LegalAcceptanceSource = "signup" | "oauth" | "existing_user" | "settings";

export function isControllerCpfConfigured(): boolean {
  return LEGAL_IDENTITY.cpf.trim().replace(/\D/g, "").length >= 11;
}

/** Safe display for documents — never invent digits. */
export function controllerCpfDisplay(): { configured: boolean; label: string } {
  if (isControllerCpfConfigured()) {
    return { configured: true, label: LEGAL_IDENTITY.cpf.trim() };
  }
  return {
    configured: false,
    label: "CPF do responsável — preenchimento final pendente antes do lançamento público",
  };
}

/** Returns unresolved identity tokens still blocking go-live. */
export function unresolvedLegalPlaceholders(): string[] {
  const out: string[] = [];
  if (!isControllerCpfConfigured()) out.push("CPF_DO_RESPONSAVEL");
  return out;
}

export function isLegalIdentityComplete(): boolean {
  return unresolvedLegalPlaceholders().length === 0 && SUPPORT_EMAIL_ACTIVE;
}

/** Concise shared copy so pricing / settings / checkout stay aligned. */
export const LEGAL_POLICY_SNIPPETS = {
  ageMinimum:
    "Contas e assinaturas pagas do PetID destinam-se a pessoas com 18 anos ou mais.",
  ageDeclaration: "Declaro ter 18 anos ou mais.",
  ageAssuranceNote:
    "A declaração de idade no cadastro não substitui, por si só, mecanismos adicionais de verificação de idade que a legislação aplicável (incluindo o ECA Digital — Lei 15.211/2025) possa exigir. Essa revisão é item de lançamento documentado.",
  recurringBilling:
    "Assinaturas pagas são recorrentes (mensal ou anual, conforme a opção escolhida), renovam automaticamente pelo preço vigente e podem ser canceladas a qualquer momento.",
  cancellation:
    "O cancelamento impede a próxima renovação automática; o acesso aos benefícios do plano pago permanece até o fim do período já pago. Depois, a conta retorna ao plano Essencial (gratuito). O cancelamento/downgrade não apaga automaticamente os dados dos pets.",
  refund:
    "Consumidores online preservam o direito de arrependimento previsto na legislação brasileira, inclusive o prazo legal de 7 dias do art. 49 do CDC quando aplicável, com reembolso nos termos da lei. Fora das hipóteses legais obrigatórias, o PetID não concede automaticamente reembolso proporcional pelo tempo não utilizado. Cobranças duplicadas, incorretas ou falhas de serviço serão analisadas e corrigidas/reembolsadas quando cabível. Nada nestes documentos afasta direitos obrigatórios do consumidor.",
  noCardStorage:
    "O PetID não armazena o número completo do cartão. O pagamento é processado pela Stripe.",
  qrNotGps:
    "A tag física PetID usa QR Code de identificação. Não possui GPS, não rastreia localização continuamente e não garante a recuperação de um pet perdido.",
  assistantDisclaimer:
    "O Assistente PetID é ferramenta informativa e organizacional. Não substitui médico-veterinário, não fornece diagnóstico definitivo, não substitui exame clínico e não deve ser usado em emergências. Em urgência, procure atendimento veterinário adequado.",
} as const;

/**
 * Documented launch / legal review items.
 * Do NOT mark human legal review as completed from this codebase.
 */
export const LEGAL_LAUNCH_TODOS = [
  {
    id: "support_mailbox",
    detail:
      "Ativar e confirmar que suporte@usepetid.com.br recebe e responde emails (SUPPORT_EMAIL_ACTIVE).",
  },
  {
    id: "controller_cpf",
    detail: "Preencher LEGAL_IDENTITY.cpf com o CPF real do responsável (não inventar; não logar).",
  },
  {
    id: "eca_digital_age_assurance",
    detail:
      "LEGAL REVIEW: requisitos de age-assurance do ECA Digital (Lei 15.211/2025) antes do lançamento público amplo — a declaração 18+ no cadastro não é, por si, compliance completa.",
  },
  {
    id: "physical_tag_retail_shipping",
    detail:
      "Antes de venda pública de tags: frete, prazos, responsabilidade de entrega, arrependimento/devolução, vício, garantia legal, reposição e suporte a código/tag perdidos.",
  },
  {
    id: "final_human_legal_review",
    detail: "FINAL HUMAN LEGAL REVIEW REQUIRED BEFORE PUBLIC LAUNCH",
  },
] as const;

/** Dev/launch checklist — factual status only; never invent compliance. */
export function legalLaunchChecklist(): {
  id: string;
  ok: boolean;
  detail: string;
}[] {
  return [
    {
      id: "provider_name_address",
      ok: Boolean(LEGAL_IDENTITY.responsibleName && LEGAL_IDENTITY.address),
      detail: "Nome e endereço do responsável/controlador preenchidos.",
    },
    {
      id: "controller_cpf",
      ok: isControllerCpfConfigured(),
      detail: "Preencher CPF do responsável (LEGAL_IDENTITY.cpf) antes do lançamento público.",
    },
    {
      id: "support_email",
      ok: SUPPORT_EMAIL_ACTIVE,
      detail: `Confirmar que ${SUPPORT_EMAIL} está recebendo emails (SUPPORT_EMAIL_ACTIVE).`,
    },
    {
      id: "age_policy_18_plus",
      ok: true,
      detail: "Política 18+ publicada nos Termos e no cadastro/aceite.",
    },
    {
      id: "eca_digital_age_assurance",
      ok: false,
      detail:
        "LEGAL REVIEW: age-assurance / ECA Digital (Lei 15.211/2025) — revisão humana/jurídica pendente.",
    },
    {
      id: "cancellation_policy",
      ok: true,
      detail: "Política de cancelamento alinhada ao Stripe (fim do período pago → Essencial).",
    },
    {
      id: "refund_policy",
      ok: true,
      detail: "Política de reembolso/arrependimento alinhada ao CDC (sem cláusula “sem reembolso”).",
    },
    {
      id: "account_deletion",
      ok: true,
      detail: "Exclusão self-service em Configurações (Edge Function delete-account).",
    },
    {
      id: "physical_tag_retail_shipping",
      ok: false,
      detail:
        "Venda/envio automatizado de tags ainda não pronto — finalizar frete, devolução, garantia e reposição antes do varejo.",
    },
    {
      id: "final_human_legal_review",
      ok: false,
      detail: "FINAL HUMAN LEGAL REVIEW REQUIRED BEFORE PUBLIC LAUNCH",
    },
  ];
}
