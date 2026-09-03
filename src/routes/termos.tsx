import { createFileRoute } from "@tanstack/react-router";
import { LegalDocumentLayout } from "@/components/legal/LegalDocumentLayout";
import { TermsContent } from "@/components/legal/TermsContent";
import { TERMS_EFFECTIVE_DATE, TERMS_VERSION } from "@/lib/legal";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — PetID" },
      {
        name: "description",
        content: "Termos de Uso da plataforma PetID para tutores e uso dos serviços digitais.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalDocumentLayout
      title="Termos de Uso"
      subtitle="Regras de uso da plataforma PetID. Leia com atenção antes de criar ou continuar usando sua conta."
      version={TERMS_VERSION}
      effectiveDate={TERMS_EFFECTIVE_DATE}
    >
      <TermsContent />
    </LegalDocumentLayout>
  );
}
