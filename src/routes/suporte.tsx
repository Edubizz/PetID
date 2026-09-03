import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail, LifeBuoy } from "lucide-react";
import { LegalDocumentLayout } from "@/components/legal/LegalDocumentLayout";
import { LegalHomeLink } from "@/components/legal/LegalHomeLink";
import {
  LEGAL_ROUTES,
  PRIVACY_VERSION,
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_ACTIVE,
  TERMS_VERSION,
} from "@/lib/legal";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/suporte")({
  head: () => ({
    meta: [
      { title: "Suporte — PetID" },
      { name: "description", content: "Central de ajuda e contato do PetID." },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  return (
    <LegalDocumentLayout
      title="Suporte"
      subtitle="Estamos aqui para ajudar com conta, pets, planos e privacidade."
      version="suporte"
      effectiveDate="atualizado continuamente"
    >
      <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2 text-primary">
          <LifeBuoy className="h-5 w-5" />
          <h2 className="text-lg font-semibold text-foreground">Como falar conosco</h2>
        </div>
        <p className="mt-3 text-muted-foreground">
          Para dúvidas sobre conta, cobrança, tags físicas, privacidade ou acesso veterinário, o
          canal oficial é:
        </p>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-secondary/40 px-4 text-sm font-medium text-foreground hover:bg-secondary"
        >
          <Mail className="h-4 w-4" />
          {SUPPORT_EMAIL}
        </a>
        {!SUPPORT_EMAIL_ACTIVE ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Este endereço ainda está sendo configurado e <strong>pode não estar recebendo
            emails</strong> neste momento. Não tratamos o canal como plenamente operacional até a
            confirmação. Enquanto isso, use a área autenticada para planos, cancelamento e exclusão
            de conta.
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Inclua o email da sua conta e, se possível, o nome do pet. Responderemos o mais breve
            possível.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold text-foreground">Documentos e conta</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
          <li>
            <Link to={LEGAL_ROUTES.terms} className="text-primary hover:underline">
              Termos de Uso
            </Link>{" "}
            (versão {TERMS_VERSION})
          </li>
          <li>
            <Link to={LEGAL_ROUTES.privacy} className="text-primary hover:underline">
              Política de Privacidade
            </Link>{" "}
            (versão {PRIVACY_VERSION})
          </li>
          <li>
            Planos, renovação e cancelamento:{" "}
            <Link to="/pricing" className="text-primary hover:underline">
              Planos
            </Link>{" "}
            e Configurações (portal de cobrança). Cancelar impede a próxima renovação; o acesso pago
            segue até o fim do período já pago.
          </li>
          <li>
            Exclusão de conta: self-service em Configurações → Excluir minha conta (não depende de
            abrir chamado de suporte). Outros pedidos de privacidade: por email quando o canal
            estiver ativo.
          </li>
          <li>Contas e assinaturas: destinadas a pessoas com 18 anos ou mais.</li>
        </ul>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" className="min-h-11 rounded-full">
          <Link to="/auth">Entrar na conta</Link>
        </Button>
        <Button className="min-h-11 rounded-full p-0">
          <LegalHomeLink className="inline-flex h-full w-full items-center justify-center px-4">
            Voltar ao início
          </LegalHomeLink>
        </Button>
      </div>
    </LegalDocumentLayout>
  );
}
