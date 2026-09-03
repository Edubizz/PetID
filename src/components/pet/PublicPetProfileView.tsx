import { AlertTriangle, Gift, Mail, MapPin, MessageCircle, PawPrint, Phone, Search } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyBRL, formatDateTime, computeAge } from "@/lib/pet-utils";
import type { PublicPetPayload } from "@/lib/public-visibility";
import { cn } from "@/lib/utils";

type Props = {
  pet: PublicPetPayload;
  /** Owner preview chrome */
  preview?: boolean;
  /** Optional Lost Mode sighting form slot (public page only). */
  lostForm?: ReactNode;
  className?: string;
};

/**
 * Shared public QR profile body.
 * Renders ONLY non-null fields from get_public_pet — no pet-data fallbacks.
 */
export function PublicPetProfileView({ pet, preview, lostForm, className }: Props) {
  const displayName = pet.name?.trim() || "Pet";
  const tutorPhone = pet.secondary_contact_phone?.replace(/\D/g, "") ?? "";
  const waLink = tutorPhone
    ? `https://wa.me/${tutorPhone}?text=${encodeURIComponent(`Olá! Encontrei ${displayName} usando PetID.`)}`
    : null;
  const telLink = tutorPhone ? `tel:+${tutorPhone}` : null;

  const subtitle = [pet.species, pet.breed, pet.sex, pet.color].filter(Boolean).join(" • ");

  const ageLabel =
    typeof pet.birth_date === "string" && pet.birth_date.trim()
      ? computeAge(pet.birth_date)
      : null;
  const showAge = Boolean(ageLabel && ageLabel !== "—");
  const hasWeight = pet.weight_kg != null && Number.isFinite(Number(pet.weight_kg));
  const hasPhoto = typeof pet.photo_url === "string" && pet.photo_url.trim().length > 0;

  const hasBasics = showAge || hasWeight;
  const hasIdentification = Boolean(pet.microchip || pet.pedigree);

  const vaccineList =
    pet.vaccines_public && pet.vaccines_public.length > 0 ? pet.vaccines_public : null;
  const hasMedical = Boolean(
    pet.allergies || pet.medications || pet.medical_notes || vaccineList,
  );

  const hasContact = Boolean(
    pet.owner_display_name ||
      pet.owner_email ||
      pet.secondary_contact_phone ||
      pet.secondary_contact_name ||
      pet.emergency_contact_phone,
  );

  return (
    <div className={cn("space-y-4", className)}>
      {preview ? (
        <div className="flex items-center justify-center">
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs font-semibold tracking-wide">
            Visualização pública
          </Badge>
        </div>
      ) : null}

      {pet.is_lost ? (
        <div className="rounded-2xl border-2 border-destructive bg-destructive p-5 text-center text-destructive-foreground shadow-[var(--shadow-elegant)]">
          <AlertTriangle className="mx-auto h-7 w-7" />
          <p className="mt-1.5 text-xl font-extrabold tracking-tight">PET DESAPARECIDO</p>
          <p className="mt-1 text-sm opacity-90">
            Se você viu {displayName}, ajude a família a reencontrá-lo.
          </p>
          <div className="mt-3 space-y-1 text-xs opacity-90">
            {pet.last_seen_location ? (
              <p className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Última localização: {pet.last_seen_location}
              </p>
            ) : null}
            {pet.lost_since ? (
              <p>Visto pela última vez em {formatDateTime(pet.lost_since)}</p>
            ) : null}
          </div>
          {pet.reward_amount != null && Number(pet.reward_amount) > 0 ? (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">
              <Gift className="h-4 w-4" /> Recompensa: {formatCurrencyBRL(pet.reward_amount)}
            </div>
          ) : null}
          {pet.emergency_instructions ? (
            <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-left text-sm">
              <span className="font-semibold">Instruções: </span>
              {pet.emergency_instructions}
            </p>
          ) : null}
          {!preview && lostForm ? (
            <Button
              className="mt-4 w-full rounded-full bg-background text-foreground hover:bg-background/90"
              onClick={() =>
                document.getElementById("sighting-form")?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              <Search className="mr-2 h-4 w-4" /> ENCONTREI ESSE PET
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-elegant)]">
        <div className="aspect-square w-full bg-secondary">
          {hasPhoto ? (
            <img
              src={pet.photo_url!}
              alt={displayName}
              className="h-full w-full object-cover"
              loading="eager"
            />
          ) : (
            <div
              className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground"
              aria-hidden
            >
              <PawPrint className="h-16 w-16 opacity-40" />
              <span className="text-xs">Sem foto pública</span>
            </div>
          )}
        </div>

        <div className="space-y-5 p-6">
          <div>
            <h1 className="text-2xl font-bold">{displayName}</h1>
            {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>

          {hasBasics ? (
            <Section title="Informações básicas">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {showAge ? <Fact label="Idade" value={ageLabel!} /> : null}
                {hasWeight ? <Fact label="Peso" value={`${pet.weight_kg} kg`} /> : null}
              </dl>
            </Section>
          ) : null}

          {hasIdentification ? (
            <Section title="Identificação">
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                {pet.microchip ? <Fact label="Microchip" value={pet.microchip} /> : null}
                {pet.pedigree ? <Fact label="Identificação / pedigree" value={pet.pedigree} /> : null}
              </dl>
            </Section>
          ) : null}

          {hasMedical ? (
            <Section title="Saúde">
              <div className="space-y-2 text-sm">
                {pet.allergies ? (
                  <p>
                    <span className="font-medium">Alergias: </span>
                    {pet.allergies}
                  </p>
                ) : null}
                {pet.medications ? (
                  <p>
                    <span className="font-medium">Medicamentos: </span>
                    {pet.medications}
                  </p>
                ) : null}
                {pet.medical_notes ? (
                  <p>
                    <span className="font-medium">Observações: </span>
                    {pet.medical_notes}
                  </p>
                ) : null}
                {vaccineList ? (
                  <div>
                    <p className="font-medium">Vacinas aplicadas</p>
                    <ul className="mt-1 space-y-1">
                      {vaccineList.map((v, i) => (
                        <li key={`${v.name}-${i}`} className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{v.name}</span>
                          {v.applied_at
                            ? ` — ${new Date(v.applied_at).toLocaleDateString("pt-BR")}`
                            : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </Section>
          ) : null}

          {hasContact ? (
            <Section title="Contato">
              <div className="space-y-2 text-sm">
                {pet.owner_display_name ? (
                  <p>
                    <span className="text-muted-foreground">Tutor: </span>
                    {pet.owner_display_name}
                  </p>
                ) : null}
                {pet.secondary_contact_phone ? (
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-muted-foreground">Telefone:</span>
                    <a className="inline-flex items-center gap-1 font-medium underline" href={telLink ?? undefined}>
                      <Phone className="h-3.5 w-3.5" />
                      {pet.secondary_contact_phone}
                    </a>
                  </p>
                ) : null}
                {pet.owner_email ? (
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-muted-foreground">Email:</span>
                    <a
                      className="inline-flex items-center gap-1 font-medium underline"
                      href={`mailto:${pet.owner_email}`}
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {pet.owner_email}
                    </a>
                  </p>
                ) : null}
                {pet.secondary_contact_name || pet.emergency_contact_phone ? (
                  <p>
                    <span className="text-muted-foreground">Emergência: </span>
                    {[pet.secondary_contact_name, pet.emergency_contact_phone].filter(Boolean).join(" • ")}
                  </p>
                ) : null}
              </div>
            </Section>
          ) : null}

          {waLink ? (
            <Button asChild className="w-full rounded-full bg-accent text-accent-foreground hover:bg-accent/90">
              <a href={waLink} target="_blank" rel="noreferrer">
                <MessageCircle className="mr-2 h-4 w-4" /> Falar com o tutor no WhatsApp
              </a>
            </Button>
          ) : null}

          {!preview && lostForm ? lostForm : null}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-secondary/40 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background/80 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
