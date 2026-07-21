import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/auth-callback")({
  ssr: false,
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
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

      if (errDesc) {
        setError(decodeURIComponent(errDesc.replace(/\+/g, " ")));
        return;
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setError(error.message);
          return;
        }
        navigate({ to: "/dashboard", replace: true });
        return;
      }

      // Hash flow fallback: give Supabase a tick to process #access_token from the URL.
      await new Promise((r) => setTimeout(r, 50));
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        navigate({ to: "/dashboard", replace: true });
      } else {
        setError("Não foi possível concluir o login com Google.");
      }
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background" style={{ background: "var(--gradient-hero)" }}>
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="mb-8"><Logo size={44} /></div>
        <div className="w-full rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
          {error ? (
            <>
              <h1 className="text-lg font-semibold">Não foi possível entrar</h1>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
              <Button className="mt-6 w-full" onClick={() => navigate({ to: "/auth" })}>
                Voltar para o login
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Entrando com Google…</p>
          )}
        </div>
      </div>
    </div>
  );
}
