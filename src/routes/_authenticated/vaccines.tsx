import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";
import { Syringe } from "lucide-react";

export const Route = createFileRoute("/_authenticated/vaccines")({
  component: () => (
    <ComingSoon
      icon={Syringe}
      title="Vacinas"
      description="Registre as vacinas dos seus pets e receba lembretes das próximas doses."
    />
  ),
});