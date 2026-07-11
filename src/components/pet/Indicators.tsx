import { Cake, Weight, Syringe, Stethoscope, ScanLine, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { computeAge, formatDate } from "@/lib/pet-utils";

type IndicatorProps = {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
};

function Card({ icon: Icon, label, value, hint }: IndicatorProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="mt-1 text-lg font-semibold leading-tight">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

type Pet = {
  birth_date: string | null;
  weight_kg: number | null;
  is_lost: boolean;
};

type Props = {
  pet: Pet;
  lastVaccineAt?: string | null;
  lastAppointmentAt?: string | null;
  scanCount?: number;
};

export function PetIndicators({ pet, lastVaccineAt, lastAppointmentAt, scanCount = 0 }: Props) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <Card icon={Cake} label="Idade" value={computeAge(pet.birth_date)} />
      <Card icon={Weight} label="Peso atual" value={pet.weight_kg ? `${pet.weight_kg} kg` : "—"} />
      <Card icon={Syringe} label="Última vacina" value={formatDate(lastVaccineAt)} />
      <Card icon={Stethoscope} label="Última consulta" value={formatDate(lastAppointmentAt)} />
      <Card icon={ScanLine} label="Escaneamentos" value={String(scanCount)} />
      <Card
        icon={ShieldCheck}
        label="Status"
        value={pet.is_lost ? "Perdido" : "Seguro"}
        hint={pet.is_lost ? "Modo perdido ativo" : "Perfil ativo"}
      />
    </div>
  );
}