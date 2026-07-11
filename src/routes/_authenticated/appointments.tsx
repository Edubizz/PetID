import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";
import { Calendar } from "lucide-react";

export const Route = createFileRoute("/_authenticated/appointments")({
  component: () => (
    <ComingSoon
      icon={Calendar}
      title="Consultas"
      description="Agende consultas veterinárias e mantenha o histórico organizado."
    />
  ),
});