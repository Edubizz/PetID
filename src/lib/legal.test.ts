import { describe, expect, it } from "vitest";
import {
  LEGAL_IDENTITY,
  LEGAL_LAUNCH_TODOS,
  LEGAL_POLICY_SNIPPETS,
  PRIVACY_VERSION,
  SUPPORT_EMAIL_ACTIVE,
  TERMS_VERSION,
  controllerCpfDisplay,
  isControllerCpfConfigured,
  legalLaunchChecklist,
  unresolvedLegalPlaceholders,
} from "./legal";

describe("legal versioning", () => {
  it("uses the material 2026-08-28 revision (not the prior 2026-08-25-v1)", () => {
    expect(TERMS_VERSION).toBe("2026-08-28-v1");
    expect(PRIVACY_VERSION).toBe("2026-08-28-v1");
    expect(TERMS_VERSION).not.toBe("2026-08-25-v1");
  });

  it("keeps support mailbox inactive until explicitly confirmed", () => {
    expect(SUPPORT_EMAIL_ACTIVE).toBe(false);
  });

  it("publishes controller name and address with CPF configured", () => {
    expect(LEGAL_IDENTITY.responsibleName).toContain("Leonardo");
    expect(LEGAL_IDENTITY.address).toContain("Santana de Parnaíba");
    expect(isControllerCpfConfigured()).toBe(true);
    expect(unresolvedLegalPlaceholders()).not.toContain("CPF_DO_RESPONSAVEL");
    expect(controllerCpfDisplay().configured).toBe(true);
  });

  it("documents 18+, cancellation, refund, and non-certification snippets", () => {
    expect(LEGAL_POLICY_SNIPPETS.ageDeclaration).toMatch(/18 anos/i);
    expect(LEGAL_POLICY_SNIPPETS.cancellation).toMatch(/renovação/i);
    expect(LEGAL_POLICY_SNIPPETS.refund).toMatch(/art\.?\s*49/i);
    expect(LEGAL_POLICY_SNIPPETS.refund.toLowerCase()).not.toContain("sem reembolso");
    expect(LEGAL_POLICY_SNIPPETS.qrNotGps).toMatch(/não possui GPS/i);
  });

  it("keeps ECA / shipping / final human review as open launch blockers", () => {
    const checklist = legalLaunchChecklist();
    expect(checklist.find((i) => i.id === "eca_digital_age_assurance")?.ok).toBe(false);
    expect(checklist.find((i) => i.id === "physical_tag_retail_shipping")?.ok).toBe(false);
    expect(checklist.find((i) => i.id === "final_human_legal_review")?.ok).toBe(false);
    expect(checklist.find((i) => i.id === "refund_policy")?.ok).toBe(true);
    expect(LEGAL_LAUNCH_TODOS.some((t) => t.id === "final_human_legal_review")).toBe(true);
  });
});
