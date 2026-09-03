import { createFileRoute, Outlet, redirect, useRouterState, Navigate } from "@tanstack/react-router";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { QuickActionsFab } from "@/components/QuickActionsFab";
import { ReminderBell } from "@/components/reminders/ReminderBell";
import { LegalFooterLinks } from "@/components/legal/LegalFooterLinks";
import { Button } from "@/components/ui/button";
import { useLegalAcceptance } from "@/hooks/useLegalAcceptance";
import { fetchLegalGateStatus, isLegalAcceptPath } from "@/lib/legal-gate";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      const next = `${location.pathname}${location.searchStr}`;
      throw redirect({
        to: "/auth",
        search: next && next !== "/" ? { next } : undefined,
      });
    }

    const path = location.pathname;
    if (isLegalAcceptPath(path)) {
      return { user: data.user };
    }

    const gate = await fetchLegalGateStatus();
    if (gate.status === "accepted") {
      return { user: data.user };
    }

    // pending OR error → never grant product access (fail closed).
    throw redirect({
      to: "/legal-accept",
      search: {
        next: `${location.pathname}${location.searchStr}`,
        ...(gate.status === "error" ? { checkError: true } : {}),
      },
    });
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const isLegalAccept = isLegalAcceptPath(pathname);
  const isFullScreenFlow =
    /\/pets\/[^/]+\/onboarding\/?$/.test(pathname) || isLegalAccept;
  const isVetFlow = pathname === "/vet" || pathname.startsWith("/vet/");

  // Client-side defense: beforeLoad alone is not enough if navigation leaves/re-enters oddly.
  const { acceptance, isLoading, isError, refetch, isFetching } = useLegalAcceptance(!isLegalAccept);

  if (!isLegalAccept) {
    if (isLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <p className="text-sm text-muted-foreground">Verificando aceite legal…</p>
        </div>
      );
    }
    if (isError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="max-w-md text-center">
            <h1 className="text-lg font-semibold">Não foi possível verificar o aceite</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Por segurança, o acesso ao produto fica bloqueado até confirmarmos os Termos e a
              Política de Privacidade.
            </p>
            <Button
              className="mt-6 rounded-full"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              {isFetching ? "Verificando…" : "Tentar novamente"}
            </Button>
          </div>
        </div>
      );
    }
    if (!acceptance.current) {
      return (
        <Navigate
          to="/legal-accept"
          search={{ next: `${pathname}${searchStr}` }}
          replace
        />
      );
    }
  }

  if (isFullScreenFlow) {
    return (
      <div className="min-h-screen w-full bg-background">
        <Outlet />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-md md:hidden">
            <SidebarTrigger
              icon="menu"
              className="h-11 w-11 shrink-0 [&_svg]:size-6"
              aria-label="Abrir menu"
            />
            <span className="min-w-0 flex-1 font-semibold">
              {isVetFlow ? "PetID · Profissional" : "PetID"}
            </span>
            {!isVetFlow ? <ReminderBell /> : null}
          </header>
          <main className="flex-1">
            <Outlet />
          </main>
          {!isVetFlow ? (
            <footer className="border-t border-border px-4 py-4 sm:px-6">
              <LegalFooterLinks />
            </footer>
          ) : null}
        </div>
      </div>
      {!isVetFlow ? <QuickActionsFab /> : null}
    </SidebarProvider>
  );
}
