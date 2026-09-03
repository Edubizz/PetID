import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { LegalAcceptanceCheckbox } from "@/components/legal/LegalAcceptanceCheckbox";
import { AgeDeclarationCheckbox } from "@/components/legal/AgeDeclarationCheckbox";
import { useLegalAcceptance } from "@/hooks/useLegalAcceptance";
import { logAndDescribeError } from "@/lib/errors";
import {
  LEGAL_ROUTES,
  PRIVACY_VERSION,
  TERMS_VERSION,
  type LegalAcceptanceSource,
} from "@/lib/legal";
import { navigateAfterAuth, safeInternalPath } from "@/lib/pending-tag-activation";

const LEGAL_INTENT_KEY = "petid_legal_intent";

type Search = { next?: string; checkError?: boolean };

function resolveAcceptanceSource(alreadyAccepted: boolean, current: boolean): LegalAcceptanceSource {
  try {
    const intent = sessionStorage.getItem(LEGAL_INTENT_KEY);
    if (intent === "signup" || intent === "oauth" || intent === "settings" || intent === "existing_user") {
      return intent;
    }
  } catch {
    /* ignore */
  }
  if (alreadyAccepted && !current) return "existing_user";
  return "oauth";
}

export const Route = createFileRoute("/_authenticated/legal-accept")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    next: typeof search.next === "string" ? search.next : undefined,
    checkError: search.checkError === true || search.checkError === "true",
  }),
  component: LegalAcceptPage,
});

function LegalAcceptPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const { next, checkError } = Route.useSearch();
  const { acceptance, isLoading, isError, refetch, accept, needsAcceptance } = useLegalAcceptance();
  const [checked, setChecked] = useState(false);
  const [ageDeclared, setAgeDeclared] = useState(false);

  const dest = safeInternalPath(next) ?? "/dashboard";

  useEffect(() => {
    if (!isLoading && !isError && acceptance.current) {
      navigateAfterAuth(navigate, dest, { replace: true });
    }
  }, [isLoading, isError, acceptance.current, dest, navigate]);

  const submit = async () => {
    if (!checked) {
      toast.error("Aceite os Termos de Uso e a Política de Privacidade para continuar.");
      return;
    }
    if (!ageDeclared) {
      toast.error("Confirme que você tem 18 anos ou mais para continuar.");
      return;
    }
    try {
      const source = resolveAcceptanceSource(acceptance.accepted, acceptance.current);
      await accept.mutateAsync(source);
      try {
        sessionStorage.removeItem(LEGAL_INTENT_KEY);
      } catch {
        /* ignore */
      }
      await router.invalidate();
      toast.success("Documentos aceitos. Bem-vindo ao PetID.");
      navigateAfterAuth(navigate, dest, { replace: true });
    } catch (e: unknown) {
      toast.error(
        logAndDescribeError("legal-accept", e, "Não foi possível registrar o aceite."),
      );
    }
  };

  return (
    <div className="min-h-screen bg-background" style={{ background: "var(--gradient-hero)" }}>
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <div className="mb-8 flex justify-center">
          <Logo size={44} />
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] sm:p-8">
          <h1 className="text-xl font-bold tracking-tight">Antes de continuar</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Os documentos legais foram atualizados. Para usar o PetID, confirme a leitura das
            versões atuais (Termos {TERMS_VERSION} / Privacidade {PRIVACY_VERSION}). Contas e
            assinaturas destinam-se a pessoas com 18 anos ou mais.
          </p>

          {isError ? (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                {checkError
                  ? "Não foi possível verificar seu aceite neste momento. O acesso ao produto permanece bloqueado por segurança."
                  : "Não foi possível carregar seu registro de aceite. Tente novamente."}
              </p>
              <Button
                className="min-h-11 w-full rounded-full"
                variant="outline"
                onClick={() => void refetch()}
              >
                Tentar verificar novamente
              </Button>
            </div>
          ) : isLoading ? (
            <p className="mt-6 text-sm text-muted-foreground">Verificando…</p>
          ) : (
            <>
              <LegalAcceptanceCheckbox
                className="mt-6"
                checked={checked}
                onCheckedChange={setChecked}
              />
              <AgeDeclarationCheckbox
                className="mt-3"
                checked={ageDeclared}
                onCheckedChange={setAgeDeclared}
              />
              <Button
                className="mt-6 min-h-11 w-full rounded-full"
                disabled={accept.isPending || (!needsAcceptance && acceptance.current)}
                onClick={() => void submit()}
              >
                {accept.isPending ? "Salvando…" : "Continuar"}
              </Button>
              <p className="mt-4 text-center text-xs text-muted-foreground">
                <Link to={LEGAL_ROUTES.support} className="text-primary hover:underline">
                  Precisa de ajuda?
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
