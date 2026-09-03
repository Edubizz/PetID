import { Link } from "@tanstack/react-router";
import { LEGAL_ROUTES } from "@/lib/legal";
import { cn } from "@/lib/utils";

export function LegalFooterLinks({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Informações legais"
      className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground", className)}
    >
      <Link to={LEGAL_ROUTES.terms} className="hover:text-foreground hover:underline">
        Termos de Uso
      </Link>
      <Link to={LEGAL_ROUTES.privacy} className="hover:text-foreground hover:underline">
        Política de Privacidade
      </Link>
      <Link to={LEGAL_ROUTES.support} className="hover:text-foreground hover:underline">
        Suporte
      </Link>
    </nav>
  );
}
