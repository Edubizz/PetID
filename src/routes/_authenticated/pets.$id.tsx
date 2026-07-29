import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, Copy, Dog, ExternalLink, AlertTriangle, Trash2, SearchX } from "lucide-react";
import { useEffect, useState } from "react";
import { PhotoUploader } from "@/components/PhotoUploader";
import { PetColorField, PetMicrochipField, PetSexField } from "@/components/PetFormFields";
import { PetIndicators } from "@/components/pet/Indicators";
import { HealthTab } from "@/components/pet/HealthTab";
import { HistoryTab } from "@/components/pet/HistoryTab";
import { DocumentsTab } from "@/components/pet/DocumentsTab";
import { CaretakersTab } from "@/components/pet/CaretakersTab";
import { LostModeTab } from "@/components/pet/LostModeTab";
import { DailyCareTab } from "@/components/pet/DailyCareTab";
import { TimelineTab } from "@/components/pet/TimelineTab";
import { DashboardTab } from "@/components/pet/DashboardTab";
import { ConfirmDialog } from "@/components/pet/ConfirmDialog";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/pets/$id")({
  component: PetDetail,
  errorComponent: PetError,
});

function PetError() {
  return (
    <div className="mx-auto max-w-xl px-6 py-20 text-center">
      <SearchX className="mx-auto h-10 w-10 text-muted-foreground" />
      <h1 className="mt-4 text-xl font-semibold">Não foi possível carregar este pet.</h1>
      <p className="mt-1 text-sm text-muted-foreground">Tente novamente em alguns instantes.</p>
      <Link to="/pets" className="mt-6 inline-flex items-center gap-2 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Voltar para meus pets
      </Link>
    </div>
  );
}

function PetDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: pet, isLoading } = useQuery({
    queryKey: ["pet", id],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return null;
      const { data, error } = await supabase
        .from("pets")
        .select("*")
        .eq("id", id)
        .eq("owner_id", uid)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: indicators } = useQuery({
    queryKey: ["pet-indicators", id],
    queryFn: async () => {
      const [vac, app] = await Promise.all([
        supabase.from("vaccines").select("applied_at").eq("pet_id", id).not("applied_at", "is", null).order("applied_at", { ascending: false }).limit(1),
        supabase.from("appointments").select("scheduled_at").eq("pet_id", id).lte("scheduled_at", new Date().toISOString()).order("scheduled_at", { ascending: false }).limit(1),
      ]);
      return {
        lastVaccineAt: vac.data?.[0]?.applied_at ?? null,
        lastAppointmentAt: app.data?.[0]?.scheduled_at ?? null,
        scanCount: 0,
      };
    },
    enabled: !!pet,
  });

  const [form, setForm] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");
  useEffect(() => { if (pet) setForm(pet); }, [pet]);

  const saveInfo = useMutationSave(id, form, qc);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10 space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!pet) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <SearchX className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold">Pet não encontrado</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Este pet não existe ou foi removido.
        </p>
        <Link to="/pets" className="mt-6 inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Voltar para meus pets
        </Link>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10 space-y-6">
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/p/${pet.public_slug}` : `/p/${pet.public_slug}`;

  const toggleLost = async () => {
    const activating = !pet.is_lost;
    const { error } = await supabase.from("pets").update({
      is_lost: activating,
      lost_since: activating ? new Date().toISOString() : null,
    }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(activating ? "Modo perdido ativado" : "Pet marcado como encontrado");
    // Fire-and-forget history log for the Health Timeline; never blocks the toggle above.
    void supabase.from("lost_mode_events").insert({
      pet_id: id,
      event: activating ? "activated" : "resolved",
      last_seen_location: pet.last_seen_location,
      reward_amount: pet.reward_amount,
    });
    qc.invalidateQueries({ queryKey: ["pet", id] });
  };

  const removeNow = async () => {
    const { error } = await supabase.from("pets").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Pet excluído");
    navigate({ to: "/pets" });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    toast.success("Link copiado!");
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link to="/pets" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Meus pets
      </Link>

      <div className="flex flex-wrap items-start gap-6">
        <div className="h-32 w-32 shrink-0 overflow-hidden rounded-2xl bg-secondary">
          {pet.photo_url ? (
            <img src={pet.photo_url} alt={pet.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center" style={{ background: "var(--gradient-brand)" }}>
              <Dog className="h-14 w-14 text-primary-foreground/80" />
            </div>
          )}
        </div>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{pet.name}</h1>
          <p className="mt-1 text-muted-foreground">{[pet.breed, pet.sex, pet.color].filter(Boolean).join(" • ")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={toggleLost} variant={pet.is_lost ? "outline" : "destructive"} size="sm" className="rounded-full">
              <AlertTriangle className="mr-2 h-4 w-4" />
              {pet.is_lost ? "Marcar como encontrado" : "Ativar modo perdido"}
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <a href={publicUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" /> Ver perfil público
              </a>
            </Button>
          </div>
        </div>
      </div>

      {pet.is_lost && (
        <div className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <strong>Modo perdido ativo.</strong> O perfil público exibe alerta e botão de avistamento.
        </div>
      )}

      <PetIndicators
        pet={pet}
        lastVaccineAt={indicators?.lastVaccineAt}
        lastAppointmentAt={indicators?.lastAppointmentAt}
        scanCount={indicators?.scanCount ?? 0}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-8">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="info">Informações</TabsTrigger>
          <TabsTrigger value="timeline">Linha do Tempo</TabsTrigger>
          <TabsTrigger value="daily-care">Cuidados Diários</TabsTrigger>
          <TabsTrigger value="health">Saúde</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
          <TabsTrigger value="documents">Documentos</TabsTrigger>
          <TabsTrigger value="caretakers">Tutores</TabsTrigger>
          <TabsTrigger value="qr">QR Code</TabsTrigger>
          <TabsTrigger value="lost" className={pet.is_lost ? "text-destructive" : undefined}>Modo Perdido</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-6">
          <DashboardTab pet={pet} onNavigate={setActiveTab} />
        </TabsContent>

        <TabsContent value="info" className="mt-6">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
            <div className="mb-6">
              <Label className="mb-1.5 block text-sm">Foto do pet</Label>
              <PhotoUploader
                value={form.photo_url}
                onChange={(url) => setForm({ ...form, photo_url: url ?? "" })}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nome"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Raça"><Input value={form.breed ?? ""} onChange={(e) => setForm({ ...form, breed: e.target.value })} /></Field>
              <PetSexField value={form.sex} onChange={(v) => setForm({ ...form, sex: v })} />
              <Field label="Nascimento"><Input type="date" value={form.birth_date ?? ""} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} /></Field>
              <Field label="Peso (kg)"><Input type="number" step="0.1" value={form.weight_kg ?? ""} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} /></Field>
              <PetColorField value={form.color} onChange={(v) => setForm({ ...form, color: v })} />
              <PetMicrochipField
                value={form.microchip}
                onChange={(v) => setForm({ ...form, microchip: v })}
              />
              <Field label="Pedigree"><Input value={form.pedigree ?? ""} onChange={(e) => setForm({ ...form, pedigree: e.target.value })} /></Field>
              <Field label="Canil de origem" wide><Input value={form.kennel ?? ""} onChange={(e) => setForm({ ...form, kennel: e.target.value })} /></Field>
              <Field label="Contato secundário — Nome"><Input value={form.secondary_contact_name ?? ""} onChange={(e) => setForm({ ...form, secondary_contact_name: e.target.value })} /></Field>
              <Field label="Contato — Telefone/WhatsApp"><Input value={form.secondary_contact_phone ?? ""} onChange={(e) => setForm({ ...form, secondary_contact_phone: e.target.value })} /></Field>
            </div>
            <div className="mt-6 flex justify-end">
              <Button onClick={() => saveInfo.mutate()} disabled={saveInfo.isPending} className="rounded-full">
                {saveInfo.isPending ? "Salvando…" : "Salvar alterações"}
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="mt-6">
          <TimelineTab pet={pet} />
        </TabsContent>

        <TabsContent value="daily-care" className="mt-6">
          <DailyCareTab petId={pet.id} />
        </TabsContent>

        <TabsContent value="health" className="mt-6">
          <HealthTab pet={pet} />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <HistoryTab petId={pet.id} petCreatedAt={pet.created_at} />
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <DocumentsTab petId={pet.id} />
        </TabsContent>

        <TabsContent value="caretakers" className="mt-6">
          <CaretakersTab petId={pet.id} />
        </TabsContent>

        <TabsContent value="qr" className="mt-6">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
            <div className="grid gap-8 md:grid-cols-[auto_1fr] md:items-center">
              <div className="rounded-2xl bg-white p-6">
                <QRCodeSVG value={publicUrl} size={200} fgColor="#1E3A8A" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">QR Code exclusivo</h3>
                <p className="mt-1 text-sm text-muted-foreground">Escaneie para acessar o perfil público de {pet.name}.</p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2 text-sm">
                    <span className="truncate">{publicUrl}</span>
                  </div>
                  <Button onClick={copyLink} variant="outline" size="sm"><Copy className="mr-2 h-4 w-4" />Copiar</Button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="lost" className="mt-6">
          <LostModeTab pet={pet} onToggleLost={toggleLost} />
        </TabsContent>
      </Tabs>

      <div className="mt-8 flex items-center justify-end border-t border-border pt-6">
        <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="text-destructive hover:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" /> Excluir pet
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Excluir ${pet.name}?`}
        description="Esta ação não pode ser desfeita. Todos os dados relacionados (vacinas, consultas, documentos e tutores) serão removidos."
        destructive
        confirmLabel="Excluir definitivamente"
        onConfirm={() => { void removeNow(); }}
      />
    </div>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <Label className="mb-1.5 block text-sm">{label}</Label>
      {children}
    </div>
  );
}

function useMutationSave(id: string, form: any, qc: ReturnType<typeof useQueryClient>) {
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("pets").update({
        name: form.name,
        breed: form.breed,
        sex: form.sex,
        birth_date: form.birth_date || null,
        weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
        color: form.color,
        microchip: form.microchip,
        pedigree: form.pedigree,
        kennel: form.kennel,
        secondary_contact_name: form.secondary_contact_name,
        secondary_contact_phone: form.secondary_contact_phone,
        photo_url: form.photo_url,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Informações atualizadas");
      qc.invalidateQueries({ queryKey: ["pet", id] });
      qc.invalidateQueries({ queryKey: ["pet-indicators", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}