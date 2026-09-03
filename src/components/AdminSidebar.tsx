import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Dog,
  ShieldCheck,
  MapPin,
  BarChart3,
  Settings,
  ScrollText,
  LogOut,
  ArrowLeft,
  Tags,
  FlaskConical,
} from "lucide-react";
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
import { closeMobileSidebar } from "@/lib/mobile-sidebar";

const items = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard, exact: true },
  { title: "Usuários", url: "/admin/users", icon: Users },
  { title: "Pets", url: "/admin/pets", icon: Dog },
  { title: "Tags físicas", url: "/admin/tags", icon: Tags },
  { title: "Acesso Beta", url: "/admin/beta-access", icon: FlaskConical },
  { title: "Verificações", url: "/admin/verifications", icon: ShieldCheck },
  { title: "Pets Perdidos", url: "/admin/lost", icon: MapPin },
  { title: "Estatísticas", url: "/admin/stats", icon: BarChart3 },
  { title: "Auditoria", url: "/admin/audit", icon: ScrollText },
  { title: "Configurações", url: "/admin/settings", icon: Settings },
];

export function AdminSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
        <div className="flex items-center gap-2">
          <Logo showText={!collapsed} size={28} />
          {!collapsed && (
            <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              Admin
            </span>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Painel</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = item.exact
                  ? pathname === item.url
                  : pathname === item.url || pathname.startsWith(item.url + "/");
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link
                        to={item.url}
                        onClick={() => closeMobileSidebar(isMobile, setOpenMobile)}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link
                to="/dashboard"
                onClick={() => closeMobileSidebar(isMobile, setOpenMobile)}
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Voltar ao app</span>
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
