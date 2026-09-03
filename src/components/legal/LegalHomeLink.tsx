import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchLegalGateStatus } from "@/lib/legal-gate";
import { cn } from "@/lib/utils";

/**
 * Home/exit control for public legal pages.
 * Pending authenticated users return to /legal-accept — never into the product.
 */
export function LegalHomeLink({
  children,
  className,
  label = "Voltar ao início",
}: {
  children?: ReactNode;
  className?: string;
  label?: string;
}) {
  const navigate = useNavigate();

  const goHome = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      navigate({ to: "/" });
      return;
    }
    const gate = await fetchLegalGateStatus();
    if (gate.status !== "accepted") {
      navigate({ to: "/legal-accept", replace: true });
      return;
    }
    navigate({ to: "/" });
  };

  return (
    <a href="/" onClick={(e) => void goHome(e)} className={cn(className)}>
      {children ?? label}
    </a>
  );
}
