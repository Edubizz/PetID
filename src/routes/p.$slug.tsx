import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle, MessageCircle, MapPin, Gift, Search } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useState } from "react";
import { useEffect } from "react";
import { toast } from "sonner";
import petPlaceholder from "@/assets/pet-placeholder.jpg";
import { dispatchSightingNotifications } from "@/lib/notify";
import { formatCurrencyBRL, formatDateTime } from "@/lib/pet-utils";
import { PhotoUploader } from "@/components/PhotoUploader";

export const Route = createFileRoute("/p/$slug")({
  head: () => ({
    meta: [
      { title: "Perfil do pet — PetID" },
      { name: "description", content: "Perfil público do pet no PetID." },
    ],
  }),
  component: PublicPet,
});

function PublicPet() {
  const { slug } = Route.useParams();
  useEffect(() => {
    supabase.rpc("record_pet_scan", { _slug: slug, _source: "qr" }).then(() => {});
  }, [slug]);
  const { data: pet, isLoading } = useQuery({
    queryKey: ["public-pet", slug],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_pet", { _slug: slug });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row ?? null;
    },
  });

  if (isLoading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando…</div>;
  if (!pet) return <div className="flex min-h-screen items-center justify-center">Pet não encontrado</div>;

  const whatsapp = pet.secondary_contact_phone?.replace(/\D/g, "");
  const waLink = whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Olá! Encontrei ${pet.name} usando PetID.`)}` : null;

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-hero)" }}>
      <header className="border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-md items-center justify-center px-4">
          <Logo size={26} />
        </div>
      </header>

      <div className="mx-auto max-w-md px-4 py-6">
        {pet.is_lost && (
          <div className="mb-4 rounded-2xl border-2 border-destructive bg-destructive p-5 text-center text-destructive-foreground shadow-[var(--shadow-elegant)]">
            <AlertTriangle className="mx-auto h-7 w-7" />
            <p className="mt-1.5 text-xl font-extrabold tracking-tight">PET DESAPARECIDO</p>
            <p className="mt-1 text-sm opacity-90">Se você viu {pet.name}, ajude a família a reencontrá-lo.</p>
            <div className="mt-3 space-y-1 text-xs opacity-90">
              {pet.last_seen_location && (
                <p className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> Última localização: {pet.last_seen_location}</p>
              )}
              {pet.lost_since && (
                <p>Visto pela última vez em {formatDateTime(pet.lost_since)}</p>
              )}
            </div>
            {pet.reward_amount ? (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">
                <Gift className="h-4 w-4" /> Recompensa: {formatCurrencyBRL(pet.reward_amount)}
              </div>
            ) : null}
            <Button
              className="mt-4 w-full rounded-full bg-background text-foreground hover:bg-background/90"
              onClick={() => document.getElementById("sighting-form")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              <Search className="mr-2 h-4 w-4" /> ENCONTREI ESSE PET
            </Button>
          </div>
        )}

        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-elegant)]">
          <div className="aspect-square w-full bg-secondary">
            <img
              src={pet.photo_url || petPlaceholder}
              alt={pet.name}
              className="h-full w-full object-cover"
              loading="eager"
            />
          </div>
          <div className="p-6">
            <h1 className="text-2xl font-bold">{pet.name}</h1>
            <p className="text-sm text-muted-foreground">{[pet.breed, pet.sex, pet.color].filter(Boolean).join(" • ")}</p>

            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {pet.birth_date && <Info label="Nascimento" value={new Date(pet.birth_date).toLocaleDateString("pt-BR")} />}
              {pet.weight_kg && <Info label="Peso" value={`${pet.weight_kg} kg`} />}
              {pet.microchip && <Info label="Microchip" value={pet.microchip} />}
            </dl>

            {pet.show_medical_public && (pet.allergies || pet.medications || pet.medical_notes) && (
              <div className="mt-5 rounded-xl bg-accent-soft p-4 text-sm">
                <p className="font-semibold text-foreground">Informações médicas</p>
                {pet.allergies && <p className="mt-2"><strong>Alergias:</strong> {pet.allergies}</p>}
                {pet.medications && <p className="mt-1"><strong>Medicamentos:</strong> {pet.medications}</p>}
                {pet.medical_notes && <p className="mt-1 opacity-80">{pet.medical_notes}</p>}
              </div>
            )}

            {waLink && (
              <Button asChild className="mt-5 w-full rounded-full bg-accent text-accent-foreground hover:bg-accent/90">
                <a href={waLink} target="_blank" rel="noreferrer">
                  <MessageCircle className="mr-2 h-4 w-4" /> Falar com o tutor no WhatsApp
                </a>
              </Button>
            )}

            {pet.is_lost && (
              <SightingForm
                petId={pet.id}
                petName={pet.name}
                ownerPhone={pet.secondary_contact_phone}
              />
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Protegido por PetID — identidade digital para pets.
        </p>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

function SightingForm({
  petId,
  petName,
  ownerPhone,
}: {
  petId: string;
  petName: string;
  ownerPhone?: string | null;
}) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [location, setLocation] = useState("");
  const [message, setMessage] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("sightings").insert({
        pet_id: petId,
        reporter_name: name || null,
        reporter_contact: contact || null,
        location: location || null,
        message: message || null,
        photo_url: photoUrl || null,
      });
      if (error) throw error;
      // Fire-and-forget: prepared abstraction; currently no-op but records intent.
      void dispatchSightingNotifications({
        petId,
        petName,
        ownerPhone,
        reporterName: name,
        reporterContact: contact,
        location,
        message,
      });
    },
    onSuccess: () => {
      toast.success("Avistamento registrado! O tutor foi notificado.");
      setName(""); setContact(""); setLocation(""); setMessage(""); setPhotoUrl(null);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar."),
  });

  return (
    <div id="sighting-form" className="mt-6 scroll-mt-6 rounded-xl border border-border p-4">
      <p className="font-semibold">Encontrou este pet?</p>
      <p className="mt-1 text-xs text-muted-foreground">Envie informações para ajudar o tutor.</p>
      <form
        onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
        className="mt-3 space-y-2"
      >
        <div><Label className="text-xs">Seu nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label className="text-xs">Contato (WhatsApp/telefone)</Label><Input value={contact} onChange={(e) => setContact(e.target.value)} /></div>
        <div><Label className="text-xs">Localização</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Bairro, cidade, ponto de referência" /></div>
        <div><Label className="text-xs">Mensagem</Label><Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} /></div>
        <div>
          <Label className="text-xs">Foto (opcional)</Label>
          <div className="mt-1.5">
            <PhotoUploader value={photoUrl} onChange={setPhotoUrl} size={80} />
          </div>
        </div>
        <Button type="submit" className="w-full rounded-full" disabled={mutation.isPending}>
          Informar avistamento
        </Button>
      </form>
    </div>
  );
}