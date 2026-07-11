import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPassword,
});

const isDev = import.meta.env.DEV;
const devLog = (...args: unknown[]) => {
  if (isDev) console.log("[reset-password]", ...args);
};

function friendlyError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("expired") || m.includes("invalid") || m.includes("otp")) {
    return "O link de recuperação expirou ou é inválido. Solicite um novo link.";
  }
  if (m.includes("same") && m.includes("password")) {
    return "A nova senha precisa ser diferente da anterior.";
  }
  if (m.includes("weak") || m.includes("6 characters")) {
    return "A senha é muito curta. Use pelo menos 6 caracteres.";
  }
  return "Não foi possível redefinir sua senha. Tente novamente.";
}

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Fires when Supabase parses a recovery link (hash flow) or when we exchange a PKCE code.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      devLog("authStateChange", event, !!session);
      if (event === "PASSWORD_RECOVERY" && session) {
        setReady(true);
        setLinkError(null);
      }
    });

    (async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const errDesc = url.searchParams.get("error_description") || url.hash.match(/error_description=([^&]+)/)?.[1];

      if (errDesc) {
        devLog("link error", errDesc);
        if (!cancelled) setLinkError("O link de recuperação expirou ou é inválido. Solicite um novo link.");
        return;
      }

      if (code) {
        devLog("exchanging PKCE code");
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (error) {
          devLog("exchange error", error.message);
          setLinkError("O link de recuperação expirou ou é inválido. Solicite um novo link.");
          return;
        }
        // Clean URL so a refresh doesn't try to re-exchange the (now used) code.
        window.history.replaceState({}, "", window.location.pathname);
        setReady(true);
        return;
      }

      // Hash flow: give Supabase a tick to process #access_token, then check.
      await new Promise((r) => setTimeout(r, 50));
      const { data } = await supabase.auth.getSession();
      devLog("hash session?", !!data.session);
      if (cancelled) return;
      if (data.session) {
        setReady(true);
      } else {
        setLinkError("Abra esta página pelo link enviado no seu email de recuperação.");
      }
    })();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    if (password.length < 6) return toast.error("A senha precisa ter pelo menos 6 caracteres.");
    if (password !== confirm) return toast.error("As senhas não coincidem.");
    setLoading(true);
    devLog("updating password");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      devLog("updateUser error", error.message);
      setLoading(false);
      toast.error(friendlyError(error.message));
      return;
    }
    // Terminate the recovery session globally so old refresh tokens can't be reused.
    devLog("signing out recovery session");
    await supabase.auth.signOut({ scope: "global" });
    setLoading(false);
    toast.success("Senha atualizada! Entre novamente.");
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-hero)" }}>
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <div className="mb-8 flex justify-center"><Logo size={40} /></div>
        <div className="rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
          <h1 className="text-xl font-semibold">Definir nova senha</h1>
          {linkError ? (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-muted-foreground">{linkError}</p>
              <Button type="button" className="w-full" onClick={() => navigate({ to: "/auth" })}>
                Solicitar novo link
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <Label>Nova senha</Label>
                <PasswordInput required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div>
                <Label>Confirmar nova senha</Label>
                <PasswordInput required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !ready}>
                {ready ? "Atualizar senha" : "Validando link…"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}