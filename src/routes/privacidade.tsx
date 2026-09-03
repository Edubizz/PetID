import { createFileRoute } from "@tanstack/react-router";
import { LegalDocumentLayout } from "@/components/legal/LegalDocumentLayout";
import { PrivacyContent } from "@/components/legal/PrivacyContent";
import { PRIVACY_EFFECTIVE_DATE, PRIVACY_VERSION } from "@/lib/legal";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — PetID" },
      {
        name: "description",
        content: "Como o PetID trata dados pessoais e informações dos pets na plataforma.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalDocumentLayout
      title="Política de Privacidade"
      subtitle="Transparência sobre quais dados o PetID processa e para quais finalidades, conforme a arquitetura atual do produto."
      version={PRIVACY_VERSION}
      effectiveDate={PRIVACY_EFFECTIVE_DATE}
    >
      <PrivacyContent />
    </LegalDocumentLayout>
  );
}
