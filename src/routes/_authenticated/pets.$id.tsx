import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, Copy, Dog, ExternalLink, Trash2, SearchX, QrCode } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HealthTab } from "@/components/pet/HealthTab";
import { HistoryTab } from "@/components/pet/HistoryTab";
import { DocumentsTab } from "@/components/pet/DocumentsTab";
import { CaretakersTab } from "@/components/pet/CaretakersTab";
import { LostModeTab } from "@/components/pet/LostModeTab";
import { DailyCareTab } from "@/components/pet/DailyCareTab";
import { TimelineTab } from "@/components/pet/TimelineTab";
import { DashboardTab } from "@/components/pet/DashboardTab";
import { ReportsTab } from "@/components/pet/ReportsTab";
import { IdentityTab } from "@/components/pet/IdentityTab";
import { PublicPrivacySettings } from "@/components/pet/PublicPrivacySettings";
import { VeterinariansTab } from "@/components/pet/VeterinariansTab";
import { PetSectionMenu } from "@/components/pet/PetSectionMenu";
import { ConfirmDialog } from "@/components/pet/ConfirmDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { logAndDescribeError } from "@/lib/errors";
import { publicPetUrl } from "@/lib/app-url";
import { computeAge } from "@/lib/pet-utils";
import {
  buildQuickFacts,
  computeProfileCompleteness,
  parseProfileExtras,
} from "@/lib/pet-profile";
import { petSectionDomId } from "@/lib/pet-navigation";
import { PET_MENU_SECTIONS } from "@/lib/pet-menu";

type PetDetailSearch = { tab?: string; action?: string };

/** Map friendly aliases → canonical tab ids (keep ?tab=dashboard / daily-care working). */
function normalizePetTab(tab?: string): string {
  if (!tab) return "dashboard";
  if (tab === "geral") return "dashboard";
  if (tab === "tracker" || tab === "cuidados" || tab === "rotina") return "daily-care";
  if (tab === "veterinarios" || tab === "vets") return "veterinarians";
  if (PET_MENU_SECTIONS.some((s) => s.id === tab)) return tab;
  return "dashboard";
}

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
  const [activeTab, setActiveTab] = useState(() => normalizePetTab(search.tab));
  const [pendingAction, setPendingAction] = useState(search.action);
  const [pendingSection, setPendingSection] = useState<string | undefined>();

  // Lets deep links from the FAB / Geral quick actions (?tab=health&action=weight)
  // open the right tab and trigger the existing "add" dialog, then clear the URL
  // so re-visiting the tab later doesn't reopen the dialog.
  useEffect(() => {
    if (!search.tab && !search.action) return;
    if (search.tab) setActiveTab(normalizePetTab(search.tab));
    if (search.action) setPendingAction(search.action);
    navigate({ to: "/pets/$id", params: { id }, search: {}, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.tab, search.action]);

  useEffect(() => {
    if (!pendingSection) return;
    const sectionId = petSectionDomId(pendingSection);
    const timer = window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      setPendingSection(undefined);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [activeTab, pendingSection]);

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
      <div className="mx-auto max-w-2xl space-y-5 px-4 py-8 sm:px-6 sm:py-10" role="status" aria-live="polite">
        <span className="sr-only">Carregando perfil do pet…</span>
        <Skeleton className="h-5 w-28 rounded-full" />
        <div className="flex items-center gap-3.5">
          <Skeleton className="h-16 w-16 shrink-0 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
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

  const publicUrl = publicPetUrl(pet.public_slug);

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

  const goToTab = (tab: string, action?: string, section?: string) => {
    const nextTab = normalizePetTab(tab);
    setActiveTab(nextTab);
    setPendingAction(action);
    if (section) {
      setPendingSection(section);
      return;
    }
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        document.getElementById("pet-section-content")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
  };

  const age = computeAge(pet.birth_date);

  return (
    <div className="mx-auto w-full max-w-2xl overflow-x-clip px-4 py-8 sm:px-6 sm:py-10">
      <Link
        to="/pets"
        className="mb-5 inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground hover:text-foreground print:hidden"
      >
        <ArrowLeft className="h-4 w-4" /> Meus pets
      </Link>

      <div className="animate-in fade-in flex items-start gap-3.5 duration-500 print:hidden">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-secondary shadow-[var(--shadow-card)] sm:h-20 sm:w-20">
          {pet.photo_url ? (
            <img src={pet.photo_url} alt={pet.name} className="h-full w-full object-cover" />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center"
              style={{ background: "var(--gradient-brand)" }}
            >
              <Dog className="h-8 w-8 text-primary-foreground/80" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-bold tracking-tight">{pet.name}</h1>
            {pet.is_lost && (
              <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                Perdido
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {[pet.breed || "Sem raça", age !== "—" ? age : null].filter(Boolean).join(" · ")}
          </p>
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Perfil público
          </a>
        </div>
      </div>

      {pet.is_lost && (
        <div className="mt-4 rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive print:hidden">
          <strong>Modo perdido ativo.</strong> Avistamentos aparecem no perfil público.
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => goToTab(v)} className="mt-6">
        <div id="pet-tabs" className="scroll-mt-4">
          <PetSectionMenu
            value={activeTab}
            isLost={pet.is_lost}
            pendingItems={completeness?.missing ?? []}
            onChange={(tab) => goToTab(tab)}
            onFillPending={(item) => goToTab(item.tab, item.action, item.section)}
          />
        </div>

        <div id="pet-section-content" className="scroll-mt-4" />

        <TabsContent value="dashboard" className="mt-5">
          <DashboardTab
            pet={pet}
            onNavigate={goToTab}
            autoOpenAppointment={pendingAction === "appointment"}
            onConsumeAutoOpen={() => setPendingAction(undefined)}
          />
        </TabsContent>

        <TabsContent value="daily-care" className="mt-5">
          <DailyCareTab petId={pet.id} petName={pet.name} />
        </TabsContent>

        <TabsContent value="health" className="mt-5">
          <HealthTab
            pet={pet}
            autoOpen={pendingAction === "weight" ? "weight" : pendingAction === "vaccine" ? "vaccine" : undefined}
            onConsumeAutoOpen={() => setPendingAction(undefined)}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-5">
          <HistoryTab petId={pet.id} petCreatedAt={pet.created_at} petName={pet.name} />
        </TabsContent>

        <TabsContent value="reports" className="mt-5">
          <ReportsTab pet={pet} onNavigate={goToTab} />
        </TabsContent>

        <TabsContent value="info" className="mt-5">
          <IdentityTab
            pet={pet}
            quickFacts={quickFacts}
            completeness={completeness}
            onNavigate={goToTab}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-5">
          <DocumentsTab petId={pet.id} />
        </TabsContent>

        <TabsContent value="lost" className="mt-5">
          <LostModeTab pet={pet} onToggleLost={toggleLost} />
        </TabsContent>

        <TabsContent value="timeline" className="mt-5">
          <TimelineTab pet={pet} onNavigate={goToTab} />
        </TabsContent>

        <TabsContent value="caretakers" className="mt-5">
          <CaretakersTab petId={pet.id} />
        </TabsContent>

        <TabsContent value="veterinarians" className="mt-5">
          <VeterinariansTab petId={pet.id} />
        </TabsContent>

        <TabsContent value="qr" className="mt-5 space-y-4">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-4 sm:px-5">
            <div className="flex items-start gap-3">
              <QrCode className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-foreground">
                  Este é o QR Code permanente do seu pet.
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  Você pode imprimi-lo, salvar ou utilizar em uma identificação. Quando alguém
                  escanear, verá o perfil público configurado por você.
                </p>
                <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                  <li>• O QR Code permanece o mesmo ao longo do tempo</li>
                  <li>• Você pode atualizar as informações públicas sem trocar o código</li>
                  <li>• Só aparece o que você autorizar no perfil público</li>
                  <li>• No Modo Perdido, o contato fica em destaque para facilitar o retorno</li>
                  <li>• Não é GPS nem rastreamento de localização</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <div className="rounded-2xl bg-white p-4">
                <QRCodeSVG value={publicUrl} size={160} fgColor="#1E3A8A" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold">QR Code de {pet.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Use na coleira ou em uma tag. Quem escanear acessa apenas o perfil público.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <div className="flex min-w-0 flex-1 items-center rounded-lg border border-border bg-secondary px-3 py-2 text-sm">
                    <span className="truncate">{publicUrl}</span>
                  </div>
                  <Button onClick={copyLink} variant="outline" size="sm" className="rounded-full">
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar
                  </Button>
                </div>
                <Button asChild variant="outline" size="sm" className="mt-3 min-h-10 rounded-full">
                  <Link to="/activate-tag">Tenho uma tag PetID</Link>
                </Button>
              </div>
            </div>
          </div>
          <PublicPrivacySettings
            pet={{
              id: pet.id,
              name: pet.name,
              public_slug: pet.public_slug,
              profile_extras: pet.profile_extras,
              show_medical_public: pet.show_medical_public,
              is_lost: pet.is_lost,
            }}
          />
        </TabsContent>
      </Tabs>

      <div className="mt-8 space-y-4 border-t border-border pt-6 print:hidden">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Configurações / Dados
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Exclusão do pet (permanente). Para limpar só o histórico, use Gerenciar histórico na
            aba Histórico.
          </p>
        </div>
        <div className="flex items-center justify-end">
          <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="text-destructive hover:text-destructive">
            <Trash2 className="mr-2 h-4 w-4" /> Excluir pet
          </Button>
        </div>
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
