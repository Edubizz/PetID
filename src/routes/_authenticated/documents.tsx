import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/ComingSoon";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/documents")({
  component: () => (
    <ComingSoon
      icon={FileText}
      title="Documentos"
      description="Guarde exames, receitas e atestados dos seus pets em um só lugar."
    />
  ),
});