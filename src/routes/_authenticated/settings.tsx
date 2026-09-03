import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Scale } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ReminderPreferencesPanel } from "@/components/reminders/ReminderPreferencesPanel";
import { PlanBillingPanel } from "@/components/billing/PlanBillingPanel";
import { UpgradeCard } from "@/components/billing/UpgradeCard";
import { LegalFooterLinks } from "@/components/legal/LegalFooterLinks";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useLegalAcceptance } from "@/hooks/useLegalAcceptance";
import { logAndDescribeError } from "@/lib/errors";
import { LEGAL_ROUTES, PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { Skeleton } from "@/components/ui/skeleton";
import { DeleteAccountSection } from "@/components/settings/DeleteAccountSection";
import { formatDate } from "@/lib/pet-utils";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { canUseReminders } = useEntitlements();
  const { acceptance, isLoading: legalLoading } = useLegalAcceptance();
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data: user } = await supabase.auth.getUser();
        if (!user.user) {
          toast.error("Sua sessão expirou. Faça login novamente.");
          return;
        }
        setEmail(user.user.email ?? "");
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("full_name, phone")
          .eq("id", user.user.id)
          .maybeSingle();
        if (error) {
          toast.error(logAndDescribeError("settings.load", error, "Não foi possível carregar o perfil."));
          return;
        }
        if (profile) {
          setFullName(profile.full_name ?? "");
          setPhone(profile.phone ?? "");
        }
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      setLoading(false);
      toast.error("Sua sessão expirou. Faça login novamente.");
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, phone })
      .eq("id", user.user.id);
    setLoading(false);
    if (error) {
      return toast.error(logAndDescribeError("settings.save", error, "Não foi possível atualizar o perfil."));
    }
    toast.success("Perfil atualizado!");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 pb-28 sm:px-6 sm:py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">Gerencie perfil, plano e lembretes.</p>
      </div>

      {booting ? (
        <div className="space-y-3" role="status" aria-live="polite">
          <span className="sr-only">Carregando configurações…</span>
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      ) : (
        <>
          <form
            onSubmit={save}
            className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"
          >
        <div>
          <Label>Email</Label>
          <Input value={email} disabled />
        </div>
        <div>
          <Label>Nome completo</Label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <Label>Telefone / WhatsApp</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+55 11 90000-0000"
          />
        </div>
        <Button type="submit" disabled={loading} className="rounded-full">
          Salvar
        </Button>
      </form>

          <PlanBillingPanel />

          {canUseReminders ? (
            <ReminderPreferencesPanel />
          ) : (
            <UpgradeCard
              title="Lembretes no Guardião"
              description="Preferências de notificação e lembretes de rotina, vacinas e consultas ficam disponíveis nos planos pagos."
            />
          )}

          <section className="space-y-3 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Scale className="h-5 w-5 text-primary" />
              Legal e privacidade
            </h2>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to={LEGAL_ROUTES.terms} className="text-primary hover:underline">
                  Termos de Uso
                </Link>
              </li>
              <li>
                <Link to={LEGAL_ROUTES.privacy} className="text-primary hover:underline">
                  Política de Privacidade
                </Link>
              </li>
              <li>
                <Link to={LEGAL_ROUTES.support} className="text-primary hover:underline">
                  Suporte
                </Link>
              </li>
            </ul>
            {legalLoading ? (
              <p className="text-xs text-muted-foreground">Carregando aceite…</p>
            ) : acceptance.current ? (
              <p className="text-xs text-muted-foreground">
                Aceite registrado
                {acceptance.accepted_at ? ` em ${formatDate(acceptance.accepted_at)}` : ""} — Termos{" "}
                {acceptance.terms_version ?? TERMS_VERSION}, Privacidade{" "}
                {acceptance.privacy_version ?? PRIVACY_VERSION}.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Versões atuais: Termos {TERMS_VERSION} · Privacidade {PRIVACY_VERSION}.
              </p>
            )}
            <LegalFooterLinks className="pt-1" />
          </section>
        </>
      )}

      {/* Outside boot gate so the danger zone is never omitted if profile load stalls. */}
      {!booting ? <DeleteAccountSection /> : null}
    </div>
  );
}
