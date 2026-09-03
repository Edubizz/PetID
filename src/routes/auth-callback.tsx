import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { logAndDescribeError } from "@/lib/errors";
import { fetchLegalGateStatus } from "@/lib/legal-gate";
import {
  AUTH_NEXT_KEY,
  navigateAfterAuth,
  safeInternalPath,
  setPendingTagActivation,
} from "@/lib/pending-tag-activation";

export const Route = createFileRoute("/auth-callback")({
  ssr: false,
  component: AuthCallback,
});

function resolveStoredNext(): string {
  try {
    return safeInternalPath(sessionStorage.getItem(AUTH_NEXT_KEY)) ?? "/dashboard";
  } catch {
    return "/dashboard";
  }
}

function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [statusLabel, setStatusLabel] = useState("Confirmando acesso…");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const errDesc =
        url.searchParams.get("error_description") ||
        url.hash.match(/error_description=([^&]+)/)?.[1];
      const hashType = url.hash.match(/(?:^|#|&)type=([^&]+)/)?.[1];
      const searchType = url.searchParams.get("type");
      const flowType = (hashType || searchType || "").toLowerCase();
      const isEmailConfirm =
        flowType === "signup" ||
        flowType === "email" ||
        flowType === "email_change" ||
        flowType === "magiclink";

      const next = resolveStoredNext();

      if (next.startsWith("/activate-tag")) {
        try {
          const parsed = new URL(next, "https://petid.local");
          const token = parsed.searchParams.get("token");
          if (token) setPendingTagActivation(token);
        } catch {
          /* ignore */
        }
      }

      const finish = async (path: string) => {
        try {
          sessionStorage.removeItem(AUTH_NEXT_KEY);
        } catch {
          /* ignore */
        }
        const gate = await fetchLegalGateStatus();
        if (gate.status !== "accepted") {
          navigate({
            to: "/legal-accept",
            search: {
              next: path,
              ...(gate.status === "error" ? { checkError: true } : {}),
            },
            replace: true,
          });
          return;
        }
        navigateAfterAuth(navigate, path, { replace: true });
      };

      const failMessage = isEmailConfirm
        ? "Não foi possível confirmar seu e-mail. Tente novamente ou solicite um novo link."
        : "Não foi possível concluir o login com Google.";

      if (errDesc) {
        const decoded = decodeURIComponent(errDesc.replace(/\+/g, " "));
        setError(logAndDescribeError("auth-callback", decoded, failMessage));
        return;
      }

      setStatusLabel(isEmailConfirm ? "Confirmando e-mail…" : "Entrando com Google…");

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setError(logAndDescribeError("auth-callback.exchange", exchangeError, failMessage));
          return;
        }
        // Drop sensitive query params from the address bar without a full reload.
        try {
          window.history.replaceState({}, "", "/auth-callback");
        } catch {
          /* ignore */
        }
        await finish(next);
        return;
      }

      // Implicit / hash-based confirmation (access_token in hash) — client may
      // already have hydrated the session from the URL fragment.
      await new Promise((r) => setTimeout(r, 80));
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        try {
          window.history.replaceState({}, "", "/auth-callback");
        } catch {
          /* ignore */
        }
        await finish(next);
        return;
      }

      setError(failMessage);
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background" style={{ background: "var(--gradient-hero)" }}>
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="mb-8">
          <Logo size={44} />
        </div>
        <div className="w-full rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
          {error ? (
            <>
              <h1 className="text-lg font-semibold">Não foi possível continuar</h1>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
              <Button className="mt-6 w-full" onClick={() => navigate({ to: "/auth" })}>
                Ir para o login
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{statusLabel}</p>
          )}
        </div>
      </div>
    </div>
  );
}
