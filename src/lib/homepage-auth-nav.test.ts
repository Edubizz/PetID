import { describe, expect, it } from "vitest";
import { friendlyErrorMessage } from "./errors";
import {
  isEmailNotConfirmedError,
  isLikelyDuplicateSignupUser,
  isValidAuthEmail,
  normalizeAuthEmail,
  RESEND_CONFIRMATION_COOLDOWN_SEC,
} from "./auth-email";
import { PET_MENU_SECTIONS, qrMenuPriorityIndex } from "./pet-menu";
import { emailConfirmRedirectUrl, authCallbackUrl } from "./app-url";

describe("auth email normalization and domains", () => {
  it("normalizes trim + lowercase", () => {
    expect(normalizeAuthEmail("  User@Outlook.COM ")).toBe("user@outlook.com");
  });

  it("accepts normal valid email", () => {
    expect(isValidAuthEmail("tutor@exemplo.com")).toBe(true);
  });

  it("accepts Gmail", () => {
    expect(isValidAuthEmail("tutor@gmail.com")).toBe(true);
  });

  it("accepts Outlook", () => {
    expect(isValidAuthEmail("tutor@outlook.com")).toBe(true);
  });

  it("accepts Hotmail", () => {
    expect(isValidAuthEmail("tutor@hotmail.com")).toBe(true);
  });

  it("accepts iCloud", () => {
    expect(isValidAuthEmail("tutor@icloud.com")).toBe(true);
  });

  it("accepts custom-domain email", () => {
    expect(isValidAuthEmail("contato@clinica-vet.com.br")).toBe(true);
  });

  it("rejects invalid email", () => {
    expect(isValidAuthEmail("not-an-email")).toBe(false);
    expect(isValidAuthEmail("@semlocal.com")).toBe(false);
    expect(isValidAuthEmail("a@b")).toBe(false);
    expect(isValidAuthEmail("")).toBe(false);
  });

  it("detects email-not-confirmed errors", () => {
    expect(isEmailNotConfirmedError(new Error("Email not confirmed"))).toBe(true);
    expect(isEmailNotConfirmedError(new Error("invalid login credentials"))).toBe(false);
  });

  it("detects likely duplicate signup user (empty identities)", () => {
    expect(isLikelyDuplicateSignupUser({ identities: [] })).toBe(true);
    expect(isLikelyDuplicateSignupUser({ identities: [{ id: "1" }] })).toBe(false);
  });

  it("resend cooldown is at least 30s", () => {
    expect(RESEND_CONFIRMATION_COOLDOWN_SEC).toBeGreaterThanOrEqual(30);
  });
});

describe("auth friendly errors (pt-BR)", () => {
  it("maps wrong password", () => {
    expect(friendlyErrorMessage(new Error("Invalid login credentials"), "x")).toBe(
      "E-mail ou senha incorretos.",
    );
  });

  it("maps unverified email", () => {
    expect(friendlyErrorMessage(new Error("Email not confirmed"), "x")).toBe(
      "Confirme seu e-mail antes de entrar.",
    );
  });

  it("maps account already exists", () => {
    expect(friendlyErrorMessage(new Error("User already registered"), "x")).toBe(
      "Já existe uma conta com este e-mail.",
    );
  });
});

describe("email confirmation callback destination", () => {
  it("confirmation redirect preserves authenticated callback flow", () => {
    expect(emailConfirmRedirectUrl()).toBe(authCallbackUrl());
    expect(emailConfirmRedirectUrl()).toMatch(/\/auth-callback\/?$/);
  });
});

describe("pet menu navigation priority", () => {
  it("QR Code appears before lower-priority pet sections", () => {
    const qrIdx = qrMenuPriorityIndex();
    expect(qrIdx).toBeGreaterThan(0);
    expect(PET_MENU_SECTIONS[0]?.id).toBe("dashboard");
    expect(PET_MENU_SECTIONS[qrIdx]?.id).toBe("qr");

    const afterQr = PET_MENU_SECTIONS.slice(qrIdx + 1).map((s) => s.id);
    expect(afterQr).toContain("daily-care");
    expect(afterQr).toContain("health");
    expect(afterQr).toContain("history");
    expect(afterQr).toContain("documents");
    expect(qrIdx).toBeLessThan(PET_MENU_SECTIONS.findIndex((s) => s.id === "daily-care"));
  });

  it("QR has Identificação badge emphasis", () => {
    const qr = PET_MENU_SECTIONS.find((s) => s.id === "qr");
    expect(qr?.badge).toBe("Identificação");
    expect(qr?.emphasize).toBe(true);
  });

  it("menu is a vertical list model (no horizontal-nav dependency)", () => {
    // Architecture: ordered array consumed by collapsible PetSectionMenu — not a horizontal strip.
    expect(PET_MENU_SECTIONS.length).toBeGreaterThanOrEqual(8);
    expect(PET_MENU_SECTIONS.every((s) => s.id && s.label)).toBe(true);
  });
});

describe("QR copy guardrails", () => {
  it("homepage/QR educational strings must not claim GPS tracking", () => {
    const forbiddenClaims = [
      /localiza[cç][aã]o em tempo real/i,
      /rastreamento GPS/i,
      /n[oó]s encontramos seu (cachorro|pet)/i,
    ];
    const educational = [
      "Este é o QR Code permanente do seu pet.",
      "Você controla as informações públicas",
      "Não é GPS nem rastreamento de localização",
      "Quem escanear poderá acessar apenas as informações públicas que você escolher.",
    ];
    for (const line of educational) {
      for (const re of forbiddenClaims) {
        expect(re.test(line)).toBe(false);
      }
    }
    expect(educational.some((l) => /públic/i.test(l))).toBe(true);
    expect(educational.some((l) => /permanente/i.test(l))).toBe(true);
    expect(educational.some((l) => /n[aã]o é GPS/i.test(l))).toBe(true);
  });
});
