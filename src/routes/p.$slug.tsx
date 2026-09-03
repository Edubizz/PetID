import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PhotoUploader } from "@/components/PhotoUploader";
import { PublicPetProfileView } from "@/components/pet/PublicPetProfileView";
import { fetchPublicPetBySlug, publicPetQueryOptions } from "@/lib/public-pet";
import { dispatchSightingNotifications } from "@/lib/notify";
import { logAndDescribeError } from "@/lib/errors";

export const Route = createFileRoute("/p/$slug")({
  // Privacy-sensitive: never SSR/cache a filtered public payload.
  // Always fetch get_public_pet on the client so visibility changes apply immediately.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Perfil do pet — PetID" },
      { name: "description", content: "Perfil público do pet no PetID." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PublicPet,
});

function PublicPet() {
  const { slug } = Route.useParams();
  useEffect(() => {
    supabase.rpc("record_pet_scan", { _slug: slug, _source: "qr" }).then(() => {});
  }, [slug]);

  const { data: pet, isLoading, isFetching } = useQuery({
    queryKey: ["public-pet", slug],
    queryFn: () => fetchPublicPetBySlug(slug),
    ...publicPetQueryOptions,
  });

  if (isLoading || (isFetching && !pet)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando…
      </div>
    );
  }
  if (!pet) {
    return <div className="flex min-h-screen items-center justify-center">Pet não encontrado</div>;
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-hero)" }}>
      <header className="border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-md items-center justify-center px-4">
          <Logo size={26} />
        </div>
      </header>

      <div className="mx-auto max-w-md px-4 py-6">
        <PublicPetProfileView
          pet={pet}
          lostForm={
            pet.is_lost ? (
              <SightingForm
                petId={pet.id}
                petName={pet.name?.trim() || "Pet"}
                ownerPhone={pet.secondary_contact_phone ?? pet.emergency_contact_phone}
              />
            ) : null
          }
        />

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Protegido por PetID — identidade digital para pets.
        </p>
      </div>
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
      setName("");
      setContact("");
      setLocation("");
      setMessage("");
      setPhotoUrl(null);
    },
    onError: (e: unknown) =>
      toast.error(logAndDescribeError("p.$slug: sighting failed", e, "Não foi possível registrar o avistamento.")),
  });

  return (
    <div id="sighting-form" className="mt-6 scroll-mt-6 rounded-xl border border-border p-4">
      <p className="font-semibold">Encontrou este pet?</p>
      <p className="mt-1 text-xs text-muted-foreground">Envie informações para ajudar o tutor.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
        className="mt-3 space-y-2"
      >
        <div>
          <Label className="text-xs">Seu nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Contato (WhatsApp/telefone)</Label>
          <Input value={contact} onChange={(e) => setContact(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Localização</Label>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Bairro, cidade, ponto de referência"
          />
        </div>
        <div>
          <Label className="text-xs">Mensagem</Label>
          <Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
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
