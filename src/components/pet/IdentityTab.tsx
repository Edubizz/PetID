import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhotoUploader } from "@/components/PhotoUploader";
import { PetColorField, PetMicrochipField, PetSexField } from "@/components/PetFormFields";
import { toast } from "sonner";
import { logAndDescribeError } from "@/lib/errors";
import {
  NOT_REGISTERED,
  parseProfileExtras,
  type ProfileExtras,
  type ProfileIdentificationExtras,
  type ProfileOwnerExtras,
  type ProfileVeterinaryExtras,
} from "@/lib/pet-profile";
import { HeartHandshake, IdCard, Stethoscope, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type PetRow = {
  id: string;
  name: string;
  breed: string | null;
  sex: string | null;
  birth_date: string | null;
  weight_kg: number | null;
  color: string | null;
  microchip: string | null;
  pedigree: string | null;
  kennel: string | null;
  photo_url: string | null;
  secondary_contact_name: string | null;
  secondary_contact_phone: string | null;
  profile_extras?: unknown;
};

export function IdentityTab({ pet }: { pet: PetRow }) {
  const qc = useQueryClient();
  const extras = parseProfileExtras(pet.profile_extras);

  const [basics, setBasics] = useState({
    photo_url: pet.photo_url ?? "",
    name: pet.name,
    breed: pet.breed ?? "",
    sex: pet.sex ?? "",
    birth_date: pet.birth_date ?? "",
    weight_kg: pet.weight_kg != null ? String(pet.weight_kg) : "",
    color: pet.color ?? "",
    kennel: pet.kennel ?? "",
  });

  const [owner, setOwner] = useState<ProfileOwnerExtras>({ ...extras.owner });
  const [emergency, setEmergency] = useState({
    name: pet.secondary_contact_name ?? "",
    phone: pet.secondary_contact_phone ?? "",
  });
  const [veterinary, setVeterinary] = useState<ProfileVeterinaryExtras>({ ...extras.veterinary });
  const [identification, setIdentification] = useState<ProfileIdentificationExtras>({
    ...extras.identification,
  });
  const [microchip, setMicrochip] = useState(pet.microchip);
  const [pedigree, setPedigree] = useState(pet.pedigree ?? "");

  useEffect(() => {
    const next = parseProfileExtras(pet.profile_extras);
    setBasics({
      photo_url: pet.photo_url ?? "",
      name: pet.name,
      breed: pet.breed ?? "",
      sex: pet.sex ?? "",
      birth_date: pet.birth_date ?? "",
      weight_kg: pet.weight_kg != null ? String(pet.weight_kg) : "",
      color: pet.color ?? "",
      kennel: pet.kennel ?? "",
    });
    setOwner({ ...next.owner });
    setEmergency({
      name: pet.secondary_contact_name ?? "",
      phone: pet.secondary_contact_phone ?? "",
    });
    setVeterinary({ ...next.veterinary });
    setIdentification({ ...next.identification });
    setMicrochip(pet.microchip);
    setPedigree(pet.pedigree ?? "");
  }, [pet]);

  const save = useMutation({
    mutationFn: async () => {
      if (!basics.name.trim()) throw new Error("Informe o nome do pet.");
      const profile_extras: ProfileExtras = {
        owner: cleanObj(owner),
        veterinary: cleanObj(veterinary),
        identification: cleanObj(identification),
      };
      const { error } = await supabase
        .from("pets")
        .update({
          name: basics.name.trim(),
          breed: basics.breed || null,
          sex: basics.sex || null,
          birth_date: basics.birth_date || null,
          weight_kg: basics.weight_kg ? Number(basics.weight_kg) : null,
          color: basics.color || null,
          kennel: basics.kennel || null,
          photo_url: basics.photo_url || null,
          microchip: microchip && String(microchip).trim() ? String(microchip).trim() : null,
          pedigree: pedigree || null,
          secondary_contact_name: emergency.name || null,
          secondary_contact_phone: emergency.phone || null,
          profile_extras,
        })
        .eq("id", pet.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Identidade atualizada");
      qc.invalidateQueries({ queryKey: ["pet", pet.id] });
      qc.invalidateQueries({ queryKey: ["pet-profile-meta", pet.id] });
      qc.invalidateQueries({ queryKey: ["pets"] });
      qc.invalidateQueries({ queryKey: ["today-care-overview"] });
      qc.invalidateQueries({ queryKey: ["pets-quick-picker"] });
    },
    onError: (e: unknown) =>
      toast.error(logAndDescribeError("IdentityTab: save failed", e, "Não foi possível salvar o perfil.")),
  });

  return (
    <div className="space-y-6">
      <ProfileSection
        icon={UserRound}
        title="Dados básicos"
        subtitle="O essencial para reconhecer seu pet em qualquer lugar."
      >
        <div className="mb-5">
          <Label className="mb-1.5 block text-sm">Foto do pet</Label>
          <PhotoUploader
            value={basics.photo_url}
            onChange={(url) => setBasics((b) => ({ ...b, photo_url: url ?? "" }))}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nome *">
            <Input value={basics.name} onChange={(e) => setBasics({ ...basics, name: e.target.value })} />
          </Field>
          <Field label="Raça">
            <Input value={basics.breed} onChange={(e) => setBasics({ ...basics, breed: e.target.value })} />
          </Field>
          <PetSexField value={basics.sex} onChange={(v) => setBasics({ ...basics, sex: v })} />
          <Field label="Nascimento">
            <Input type="date" value={basics.birth_date} onChange={(e) => setBasics({ ...basics, birth_date: e.target.value })} />
          </Field>
          <Field label="Peso (kg)">
            <Input type="number" step="0.1" value={basics.weight_kg} onChange={(e) => setBasics({ ...basics, weight_kg: e.target.value })} />
          </Field>
          <PetColorField value={basics.color} onChange={(v) => setBasics({ ...basics, color: v })} />
          <Field label="Canil de origem" wide>
            <Input value={basics.kennel} onChange={(e) => setBasics({ ...basics, kennel: e.target.value })} />
          </Field>
        </div>
      </ProfileSection>

      <ProfileSection
        icon={HeartHandshake}
        title="Tutor e emergência"
        subtitle="Quem cuida do pet — e quem avisar se você não puder atender."
        emptyHint={
          !owner.name && !emergency.name
            ? "Nenhum contato de emergência. Alguém que encontrar seu pet pode falar com outro familiar se você estiver indisponível."
            : undefined
        }
      >
        <p className="mb-3 text-sm font-medium">Tutor principal</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nome">
            <Input value={owner.name ?? ""} onChange={(e) => setOwner({ ...owner, name: e.target.value })} placeholder="Seu nome" />
          </Field>
          <Field label="Relação">
            <Input value={owner.relationship ?? ""} onChange={(e) => setOwner({ ...owner, relationship: e.target.value })} placeholder="Tutor, responsável…" />
          </Field>
          <Field label="Telefone">
            <Input value={owner.phone ?? ""} onChange={(e) => setOwner({ ...owner, phone: e.target.value })} />
          </Field>
          <Field label="WhatsApp">
            <Input value={owner.whatsapp ?? ""} onChange={(e) => setOwner({ ...owner, whatsapp: e.target.value })} />
          </Field>
          <Field label="E-mail" wide>
            <Input type="email" value={owner.email ?? ""} onChange={(e) => setOwner({ ...owner, email: e.target.value })} />
          </Field>
          <Field label="Observações" wide>
            <Textarea rows={2} value={owner.notes ?? ""} onChange={(e) => setOwner({ ...owner, notes: e.target.value })} />
          </Field>
        </div>

        <div className="my-5 border-t border-border" />
        <p className="mb-3 text-sm font-medium">Contato de emergência</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nome">
            <Input value={emergency.name} onChange={(e) => setEmergency({ ...emergency, name: e.target.value })} />
          </Field>
          <Field label="Telefone / WhatsApp">
            <Input value={emergency.phone} onChange={(e) => setEmergency({ ...emergency, phone: e.target.value })} />
          </Field>
        </div>
      </ProfileSection>

      <ProfileSection
        icon={Stethoscope}
        title="Veterinário"
        subtitle="Facilita emergências e o acompanhamento de saúde."
        emptyHint={
          !veterinary.name && !veterinary.clinic
            ? "Nenhum veterinário cadastrado ainda. Ter o contato do seu vet deixa emergências bem mais rápidas."
            : undefined
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Veterinário principal">
            <Input value={veterinary.name ?? ""} onChange={(e) => setVeterinary({ ...veterinary, name: e.target.value })} />
          </Field>
          <Field label="Clínica">
            <Input value={veterinary.clinic ?? ""} onChange={(e) => setVeterinary({ ...veterinary, clinic: e.target.value })} />
          </Field>
          <Field label="Telefone">
            <Input value={veterinary.phone ?? ""} onChange={(e) => setVeterinary({ ...veterinary, phone: e.target.value })} />
          </Field>
          <Field label="Clínica de emergência">
            <Input value={veterinary.emergency_clinic ?? ""} onChange={(e) => setVeterinary({ ...veterinary, emergency_clinic: e.target.value })} />
          </Field>
          <Field label="Endereço" wide>
            <Input value={veterinary.address ?? ""} onChange={(e) => setVeterinary({ ...veterinary, address: e.target.value })} />
          </Field>
          <Field label="Observações" wide>
            <Textarea rows={2} value={veterinary.notes ?? ""} onChange={(e) => setVeterinary({ ...veterinary, notes: e.target.value })} />
          </Field>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Consultas futuras continuam no Dashboard e na aba Saúde — aqui fica só o cadastro permanente do veterinário.
        </p>
      </ProfileSection>

      <ProfileSection
        icon={IdCard}
        title="Identificação"
        subtitle="Números oficiais que comprovam a identidade do pet."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <PetMicrochipField value={microchip} onChange={setMicrochip} />
          <IdField
            label="Pedigree"
            value={pedigree}
            onChange={setPedigree}
          />
          <IdField
            label="Registro"
            value={identification.registration ?? ""}
            onChange={(v) => setIdentification({ ...identification, registration: v })}
          />
          <IdField
            label="Número do seguro"
            value={identification.insurance ?? ""}
            onChange={(v) => setIdentification({ ...identification, insurance: v })}
          />
          <IdField
            label="Passaporte"
            value={identification.passport ?? ""}
            onChange={(v) => setIdentification({ ...identification, passport: v })}
          />
          <IdField
            label="Licença / registro municipal"
            value={identification.license ?? ""}
            onChange={(v) => setIdentification({ ...identification, license: v })}
          />
        </div>
      </ProfileSection>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-full">
          {save.isPending ? "Salvando…" : "Salvar identidade"}
        </Button>
      </div>
    </div>
  );
}

function cleanObj<T extends Record<string, string | undefined>>(obj: T): T {
  const out = { ...obj };
  for (const k of Object.keys(out) as (keyof T)[]) {
    const v = out[k];
    if (typeof v === "string" && !v.trim()) delete out[k];
  }
  return out;
}

function ProfileSection({
  icon: Icon,
  title,
  subtitle,
  emptyHint,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  emptyHint?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {emptyHint && (
        <p className="mb-4 rounded-xl border border-dashed border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
          {emptyHint}
        </p>
      )}
      {children}
    </section>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? "md:col-span-2" : undefined}>
      <Label className="mb-1.5 block text-sm">{label}</Label>
      {children}
    </div>
  );
}

function IdField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={NOT_REGISTERED}
      />
      {!value.trim() && (
        <p className="mt-1 text-xs text-muted-foreground">{NOT_REGISTERED}</p>
      )}
    </Field>
  );
}
