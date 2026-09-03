import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { logAndDescribeError } from "@/lib/errors";
import { authCallbackUrl, emailConfirmRedirectUrl, resetPasswordUrl } from "@/lib/app-url";
import { LegalAcceptanceCheckbox } from "@/components/legal/LegalAcceptanceCheckbox";
import { AgeDeclarationCheckbox } from "@/components/legal/AgeDeclarationCheckbox";
import { LEGAL_ROUTES, PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { fetchLegalGateStatus } from "@/lib/legal-gate";
import { supabase } from "@/integrations/supabase/client";
import {
  AUTH_NEXT_KEY,
  navigateAfterAuth,
  safeInternalPath,
  setPendingTagActivation,
} from "@/lib/pending-tag-activation";
import {
  isEmailNotConfirmedError,
  isLikelyDuplicateSignupUser,
  isValidAuthEmail,
  normalizeAuthEmail,
  RESEND_CONFIRMATION_COOLDOWN_SEC,
} from "@/lib/auth-email";

const LEGAL_INTENT_KEY = "petid_legal_intent";

type AuthSearch = { next?: string };

function resolveNext(searchNext?: string): string {
  const fromSearch = safeInternalPath(searchNext);
  if (fromSearch) return fromSearch;
  try {
    return safeInternalPath(sessionStorage.getItem(AUTH_NEXT_KEY)) ?? "/dashboard";
  } catch {
    return "/dashboard";
  }
}

function clearStoredNext() {
  try {
    sessionStorage.removeItem(AUTH_NEXT_KEY);
  } catch {
    /* ignore */
  }
}

function rememberActivationFromNext(path: string) {
  if (!path.startsWith("/activate-tag")) return;
  try {
    const url = new URL(path, "https://petid.local");
    const token = url.searchParams.get("token");
    if (token) setPendingTagActivation(token);
  } catch {
    /* ignore */
  }
}

function persistAuthNext(path: string) {
  try {
    sessionStorage.setItem(AUTH_NEXT_KEY, path);
  } catch {
    /* ignore */
  }
}

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    next: typeof search.next === "string" ? search.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Entrar — PetID" },
      { name: "description", content: "Acesse sua conta PetID ou crie um perfil digital para seu pet." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [ageDeclared, setAgeDeclared] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, []);

  useEffect(() => {
    const dest = resolveNext(next);
    rememberActivationFromNext(dest);
    if (safeInternalPath(next)) {
      persistAuthNext(dest);
    }
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      clearStoredNext();
      const gate = await fetchLegalGateStatus();
      if (gate.status !== "accepted") {
        navigate({
          to: "/legal-accept",
          search: {
            next: dest,
            ...(gate.status === "error" ? { checkError: true } : {}),
          },
          replace: true,
        });
        return;
      }
      navigateAfterAuth(navigate, dest, { replace: true });
    })();
  }, [navigate, next]);

  const startResendCooldown = () => {
    setResendCooldown(RESEND_CONFIRMATION_COOLDOWN_SEC);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current);
          cooldownTimer.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const afterAuth = async () => {
    const dest = resolveNext(next);
    rememberActivationFromNext(dest);
    clearStoredNext();
    const gate = await fetchLegalGateStatus();
    if (gate.status !== "accepted") {
      navigate({
        to: "/legal-accept",
        search: {
          next: dest,
          ...(gate.status === "error" ? { checkError: true } : {}),
        },
        replace: true,
      });
      return;
    }
    navigateAfterAuth(navigate, dest, { replace: true });
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeAuthEmail(email);
    if (!isValidAuthEmail(normalized)) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    setEmail(normalized);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: normalized,
      password,
    });
    setLoading(false);
    if (error) {
      if (isEmailNotConfirmedError(error)) {
        setShowResend(true);
      }
      return toast.error(logAndDescribeError("auth.signIn", error, "Não foi possível entrar."));
    }
    setShowResend(false);
    await afterAuth();
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!legalAccepted) {
      toast.error("Aceite os Termos de Uso e a Política de Privacidade para criar a conta.");
      return;
    }
    if (!ageDeclared) {
      toast.error("Confirme que você tem 18 anos ou mais para criar a conta.");
      return;
    }
    const normalized = normalizeAuthEmail(email);
    if (!isValidAuthEmail(normalized)) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    setEmail(normalized);
    setLoading(true);
    const dest = resolveNext(next);
    rememberActivationFromNext(dest);
    persistAuthNext(dest);
    try {
      sessionStorage.setItem(LEGAL_INTENT_KEY, "signup");
    } catch {
      /* ignore */
    }
    const { data, error } = await supabase.auth.signUp({
      email: normalized,
      password,
      options: {
        emailRedirectTo: emailConfirmRedirectUrl(),
        data: { full_name: name.trim() },
      },
    });
    if (error) {
      setLoading(false);
      return toast.error(logAndDescribeError("auth.signUp", error, "Não foi possível criar a conta."));
    }

    if (isLikelyDuplicateSignupUser(data.user) && !data.session) {
      setLoading(false);
      setShowResend(true);
      return toast.error("Já existe uma conta com este e-mail.");
    }

    if (data.session) {
      const { error: legalError } = await supabase.rpc("accept_legal_documents", {
        _terms_version: TERMS_VERSION,
        _privacy_version: PRIVACY_VERSION,
        _source: "signup",
      });
      if (legalError) {
        console.error("auth.signUp: legal acceptance", legalError);
      } else {
        try {
          sessionStorage.removeItem(LEGAL_INTENT_KEY);
        } catch {
          /* ignore */
        }
      }
      setLoading(false);
      toast.success("Conta criada!");
      await afterAuth();
      return;
    }

    setLoading(false);
    setShowResend(true);
    toast.success("Conta criada! Verifique seu e-mail para confirmar.");
  };

  const handleResendConfirmation = async () => {
    const normalized = normalizeAuthEmail(email);
    if (!isValidAuthEmail(normalized)) {
      toast.error("Informe um e-mail válido para reenviar a confirmação.");
      return;
    }
    if (resendCooldown > 0 || resendLoading) return;
    setEmail(normalized);
    setResendLoading(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: normalized,
      options: { emailRedirectTo: emailConfirmRedirectUrl() },
    });
    setResendLoading(false);
    if (error) {
      return toast.error(
        logAndDescribeError(
          "auth.resendConfirmation",
          error,
          "Não foi possível reenviar o e-mail de confirmação.",
        ),
      );
    }
    startResendCooldown();
    toast.success("E-mail de confirmação reenviado. Confira a caixa de entrada e o spam.");
  };

  const handleGoogle = async () => {
    setLoading(true);
    const dest = resolveNext(next);
    rememberActivationFromNext(dest);
    try {
      sessionStorage.setItem(AUTH_NEXT_KEY, dest);
      sessionStorage.setItem(LEGAL_INTENT_KEY, "oauth");
    } catch {
      /* ignore */
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: authCallbackUrl(),
      },
    });
    if (error) {
      setLoading(false);
      return toast.error(
        logAndDescribeError("auth.google", error, "Não foi possível entrar com Google."),
      );
    }
  };

  const handleReset = async () => {
    const normalized = normalizeAuthEmail(email);
    if (!isValidAuthEmail(normalized)) {
      return toast.error("Informe seu e-mail primeiro.");
    }
    setEmail(normalized);
    const { error } = await supabase.auth.resetPasswordForEmail(normalized, {
      redirectTo: resetPasswordUrl(),
    });
    if (error) {
      toast.error(
        logAndDescribeError("auth.reset", error, "Não foi possível enviar o e-mail de recuperação."),
      );
    } else toast.success("E-mail de recuperação enviado. Confira a caixa de entrada e o spam.");
  };

  return (
    <div className="min-h-screen bg-background" style={{ background: "var(--gradient-hero)" }}>
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <Link to="/" className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <div className="mb-8 flex justify-center">
          <Logo size={44} />
        </div>
        <div className="rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Cadastrar</TabsTrigger>
            </TabsList>
            <TabsContent value="signin" className="mt-6">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Senha</Label>
                    <button type="button" onClick={handleReset} className="text-xs text-primary hover:underline">
                      Esqueci a senha
                    </button>
                  </div>
                  <PasswordInput
                    id="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  Entrar
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup" className="mt-6">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div>
                  <Label htmlFor="name">Nome</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="email2">E-mail</Label>
                  <Input
                    id="email2"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="password2">Senha</Label>
                  <PasswordInput
                    id="password2"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <LegalAcceptanceCheckbox checked={legalAccepted} onCheckedChange={setLegalAccepted} />
                <AgeDeclarationCheckbox checked={ageDeclared} onCheckedChange={setAgeDeclared} />
                <Button type="submit" className="w-full" disabled={loading}>
                  Criar conta gratuitamente
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {showResend && (
            <div className="mt-4 rounded-xl border border-border bg-secondary/40 px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground">
                Não confirmou o e-mail ainda? Verifique também a pasta de spam.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 min-h-10 w-full rounded-full"
                disabled={resendLoading || resendCooldown > 0 || loading}
                onClick={() => void handleResendConfirmation()}
              >
                {resendCooldown > 0
                  ? `Reenviar em ${resendCooldown}s`
                  : resendLoading
                    ? "Enviando…"
                    : "Reenviar e-mail de confirmação"}
              </Button>
            </div>
          )}

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">ou</span>
            </div>
          </div>

          <Button type="button" variant="outline" className="w-full" onClick={handleGoogle} disabled={loading}>
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continuar com Google
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Com Google, pediremos o aceite dos{" "}
            <Link to={LEGAL_ROUTES.terms} className="text-primary hover:underline">
              Termos
            </Link>{" "}
            e da{" "}
            <Link to={LEGAL_ROUTES.privacy} className="text-primary hover:underline">
              Privacidade
            </Link>{" "}
            na primeira vez (e a declaração de 18 anos ou mais), se ainda não constar no seu
            registro. Contas e assinaturas destinam-se a maiores de 18 anos.
          </p>
        </div>
      </div>
    </div>
  );
}
