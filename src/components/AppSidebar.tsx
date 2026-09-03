import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Home, PawPrint, Settings, LogOut, Shield, Stethoscope, QrCode, Sparkles } from "lucide-react";
import { useEffect } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { ReminderBell } from "@/components/reminders/ReminderBell";
import { closeMobileSidebar } from "@/lib/mobile-sidebar";

const items = [
  { title: "Geral", url: "/dashboard", icon: Home },
  { title: "Meus Pets", url: "/pets", icon: PawPrint },
  { title: "QR Codes", url: "/qr", icon: QrCode },
  { title: "Planos", url: "/pricing", icon: Sparkles },
  { title: "Visão profissional", url: "/vet", icon: Stethoscope },
];

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin } = useIsAdmin();

  // Any route change (link, nested nav, programmatic) must dismiss the mobile sheet.
  useEffect(() => {
    closeMobileSidebar(isMobile, setOpenMobile);
  }, [pathname, isMobile, setOpenMobile]);

  const handleSignOut = async () => {
    closeMobileSidebar(isMobile, setOpenMobile);
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center justify-between gap-2">
          <Logo showText={!collapsed} size={28} />
          {!collapsed ? <ReminderBell className="hidden md:inline-flex" /> : null}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={pathname === item.url || pathname.startsWith(item.url + "/")}>
                    <Link
                      to={item.url}
                      onClick={() => closeMobileSidebar(isMobile, setOpenMobile)}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Administração</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname.startsWith("/admin")}>
                    <Link
                      to="/admin"
                      onClick={() => closeMobileSidebar(isMobile, setOpenMobile)}
                    >
                      <Shield className="h-4 w-4" />
                      <span>Painel Admin</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={pathname.startsWith("/settings")}>
              <Link
                to="/settings"
                onClick={() => closeMobileSidebar(isMobile, setOpenMobile)}
              >
                <Settings className="h-4 w-4" />
                <span>Configurações</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
