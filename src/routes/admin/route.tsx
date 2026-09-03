import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AdminSidebar } from "@/components/AdminSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { toast } from "sonner";
import { fetchLegalGateStatus } from "@/lib/legal-gate";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) throw redirect({ to: "/auth" });

    const gate = await fetchLegalGateStatus();
    if (gate.status !== "accepted") {
      throw redirect({
        to: "/legal-accept",
        search: {
          next: `${location.pathname}${location.searchStr}`,
          ...(gate.status === "error" ? { checkError: true } : {}),
        },
      });
    }

    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .eq("role", "admin")
      .maybeSingle();
    if (!data) {
      toast.error("Acesso negado — área restrita a administradores.");
      throw redirect({ to: "/dashboard" });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AdminSidebar />
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-md md:hidden">
            <SidebarTrigger
              icon="menu"
              className="h-11 w-11 shrink-0 [&_svg]:size-6"
              aria-label="Abrir menu"
            />
            <span className="font-semibold">PetID · Admin</span>
          </header>
          <main className="flex-1">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}