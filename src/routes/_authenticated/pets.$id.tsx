import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, Copy, Dog, ExternalLink, AlertTriangle, Trash2, SearchX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HealthTab } from "@/components/pet/HealthTab";
import { HistoryTab } from "@/components/pet/HistoryTab";
import { DocumentsTab } from "@/components/pet/DocumentsTab";
import { CaretakersTab } from "@/components/pet/CaretakersTab";
import { LostModeTab } from "@/components/pet/LostModeTab";
import { DailyCareTab } from "@/components/pet/DailyCareTab";
import { TimelineTab } from "@/components/pet/TimelineTab";
import { DashboardTab } from "@/components/pet/DashboardTab";
import { IdentityTab } from "@/components/pet/IdentityTab";
import { ProfileQuickFacts } from "@/components/pet/ProfileQuickFacts";
import { ProfileCompletenessCard } from "@/components/pet/ProfileCompletenessCard";
import { ConfirmDialog } from "@/components/pet/ConfirmDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { logAndDescribeError } from "@/lib/errors";
import {
  buildQuickFacts,
  computeProfileCompleteness,
  parseProfileExtras,
} from "@/lib/pet-profile";

type PetDetailSearch = { tab?: string; action?: string };

export const Route = createFileRoute("/_authenticated/pets/$id")({
  component: PetDetail,
  errorComponent: PetError,
  validateSearch: (search: Record<string, unknown>): PetDetailSearch => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
    action: typeof search.action === "string" ? search.action : undefined,
  }),
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
  const search = Route.useSearch();
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

  const { data: profileMeta } = useQuery({
    queryKey: ["pet-profile-meta", id],
    enabled: !!pet,
    queryFn: async () => {
      const [vac, weight] = await Promise.all([
        supabase.from("vaccines").select("id, applied_at").eq("pet_id", id).not("applied_at", "is", null).limit(1),
        supabase.from("weight_history").select("id").eq("pet_id", id).limit(1),
      ]);
      return {
        hasVaccine: (vac.data?.length ?? 0) > 0,
        hasWeightHistory: (weight.data?.length ?? 0) > 0,
      };
    },
  });

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeTab, setActiveTab] = useState(search.tab || "dashboard");
  const [pendingAction, setPendingAction] = useState(search.action);

  // Lets deep links from the FAB / Dashboard quick actions (?tab=health&action=weight)
  // open the right tab and trigger the existing "add" dialog, then clear the URL
  // so re-visiting the tab later doesn't reopen the dialog.
  useEffect(() => {
    if (!search.tab && !search.action) return;
    if (search.tab) setActiveTab(search.tab);
    if (search.action) setPendingAction(search.action);
    navigate({ to: "/pets/$id", params: { id }, search: {}, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.tab, search.action]);

  const extras = useMemo(() => parseProfileExtras(pet?.profile_extras), [pet?.profile_extras]);

  const completeness = useMemo(() => {
    if (!pet) return null;
    return computeProfileCompleteness({
      photo_url: pet.photo_url,
      breed: pet.breed,
      sex: pet.sex,
      birth_date: pet.birth_date,
      weight_kg: pet.weight_kg,
      microchip: pet.microchip,
      secondary_contact_name: pet.secondary_contact_name,
      secondary_contact_phone: pet.secondary_contact_phone,
      extras,
      hasWeightHistory: profileMeta?.hasWeightHistory ?? false,
      hasVaccine: profileMeta?.hasVaccine ?? false,
      hasPrimaryVet: Boolean(extras.veterinary?.name),
    });
  }, [pet, extras, profileMeta]);

  const quickFacts = useMemo(() => {
    if (!pet) return [];
    return buildQuickFacts({
      sex: pet.sex,
      breed: pet.breed,
      birth_date: pet.birth_date,
      weight_kg: pet.weight_kg,
      microchip: pet.microchip,
      is_lost: pet.is_lost,
      hasVaccine: profileMeta?.hasVaccine ?? false,
    });
  }, [pet, profileMeta]);

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

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/p/${pet.public_slug}` : `/p/${pet.public_slug}`;

  const toggleLost = async () => {
    const activating = !pet.is_lost;
    const { error } = await supabase.from("pets").update({
      is_lost: activating,
      lost_since: activating ? new Date().toISOString() : null,
    }).eq("id", id);
    if (error) {
      toast.error(logAndDescribeError("pets.$id: toggleLost failed", error, "Não foi possível atualizar o status do pet."));
      return;
    }
    toast.success(activating ? "Modo perdido ativado" : "Pet marcado como encontrado");
    void supabase.from("lost_mode_events").insert({
      pet_id: id,
      event: activating ? "activated" : "resolved",
      last_seen_location: pet.last_seen_location,
      reward_amount: pet.reward_amount,
    });
    qc.invalidateQueries({ queryKey: ["pet", id] });
    qc.invalidateQueries({ queryKey: ["pets"] });
    qc.invalidateQueries({ queryKey: ["today-care-overview"] });
    qc.invalidateQueries({ queryKey: ["home-agenda"] });
    qc.invalidateQueries({ queryKey: ["health-timeline", id] });
  };

  const removeNow = async () => {
    const { error } = await supabase.from("pets").delete().eq("id", id);
    if (error) {
      toast.error(logAndDescribeError("pets.$id: delete pet failed", error, "Não foi possível excluir o pet."));
      return;
    }
    toast.success("Pet excluído");
    qc.invalidateQueries({ queryKey: ["pets"] });
    qc.invalidateQueries({ queryKey: ["today-care-overview"] });
    qc.invalidateQueries({ queryKey: ["home-agenda"] });
    qc.invalidateQueries({ queryKey: ["pets-quick-picker"] });
    navigate({ to: "/pets" });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    toast.success("Link copiado!");
  };

  const goToTab = (tab: string) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
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
          <p className="mt-1 text-muted-foreground">Identidade digital</p>
          <ProfileQuickFacts facts={quickFacts} />
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

      {completeness && (
        <ProfileCompletenessCard
          pct={completeness.pct}
          missing={completeness.missing}
          onNavigate={goToTab}
        />
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-8">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="info">Identidade</TabsTrigger>
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
          <DashboardTab
            pet={pet}
            onNavigate={setActiveTab}
            autoOpenAppointment={pendingAction === "appointment"}
            onConsumeAutoOpen={() => setPendingAction(undefined)}
          />
        </TabsContent>

        <TabsContent value="info" className="mt-6">
          <IdentityTab pet={pet} />
        </TabsContent>

        <TabsContent value="timeline" className="mt-6">
          <TimelineTab pet={pet} />
        </TabsContent>

        <TabsContent value="daily-care" className="mt-6">
          <DailyCareTab petId={pet.id} petName={pet.name} />
        </TabsContent>

        <TabsContent value="health" className="mt-6">
          <HealthTab
            pet={pet}
            autoOpen={pendingAction === "weight" ? "weight" : pendingAction === "vaccine" ? "vaccine" : undefined}
            onConsumeAutoOpen={() => setPendingAction(undefined)}
          />
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
