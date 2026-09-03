import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";
import { LegalHomeLink } from "@/components/legal/LegalHomeLink";
import { LEGAL_ROUTES } from "@/lib/legal";
import { Button } from "@/components/ui/button";

export function LegalDocumentLayout({
  title,
  subtitle,
  version,
  effectiveDate,
  children,
}: {
  title: string;
  subtitle?: string;
  version: string;
  effectiveDate: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <LegalHomeLink className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Início
          </LegalHomeLink>
          <Logo size={28} />
          <Link to={LEGAL_ROUTES.support} className="text-sm text-primary hover:underline">
            Suporte
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">PetID</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {subtitle ? <p className="mt-3 text-base text-muted-foreground">{subtitle}</p> : null}
        <p className="mt-4 text-sm text-muted-foreground">
          Versão <span className="font-medium text-foreground">{version}</span>
          {" · "}
          Vigência: {effectiveDate}
        </p>

        <div className="legal-prose mt-10 space-y-8 text-[15px] leading-relaxed text-foreground/90 sm:text-base">
          {children}
        </div>

        <nav className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border pt-6 text-sm">
          <Link to={LEGAL_ROUTES.terms} className="text-primary hover:underline">
            Termos de Uso
          </Link>
          <Link to={LEGAL_ROUTES.privacy} className="text-primary hover:underline">
            Política de Privacidade
          </Link>
          <Link to={LEGAL_ROUTES.support} className="text-primary hover:underline">
            Suporte
          </Link>
          <Button variant="outline" size="sm" className="ml-auto min-h-10 rounded-full p-0">
            <LegalHomeLink className="inline-flex h-full w-full items-center justify-center px-3">
              Voltar ao início
            </LegalHomeLink>
          </Button>
        </nav>
      </article>
    </div>
  );
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-muted-foreground [&_strong]:font-semibold [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

export function LegalPlaceholder({ children }: { children: string }) {
  return (
    <mark className="rounded bg-amber-100 px-1 py-0.5 font-medium text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
      {children}
    </mark>
  );
}
