import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { logAndDescribeError } from "@/lib/errors";
import { parseProfileExtras } from "@/lib/pet-profile";
import {
  PUBLIC_VISIBILITY_GROUPS,
  medicalPublicFromVisibility,
  parsePublicVisibility,
  withPublicVisibility,
  type PublicVisibilityKey,
  type PublicVisibilitySettings,
} from "@/lib/public-visibility";
import { cn } from "@/lib/utils";

type PetPrivacyInput = {
  id: string;
  name: string;
  public_slug: string;
  profile_extras?: unknown;
  show_medical_public?: boolean;
  is_lost?: boolean;
};

function visibilityFingerprint(raw: unknown): string {
  return JSON.stringify(parsePublicVisibility(raw));
}

/**
 * Owner controls for what the public QR profile may reveal.
 * Saves into profile_extras.public_visibility and syncs show_medical_public.
 * Preview opens the real /p/$slug route (same get_public_pet as a QR scan).
 */
export function PublicPrivacySettings({ pet }: { pet: PetPrivacyInput }) {
  const qc = useQueryClient();
  const extras = useMemo(() => parseProfileExtras(pet.profile_extras), [pet.profile_extras]);
  const initial = useMemo(
    () => parsePublicVisibility(pet.profile_extras),
    [pet.profile_extras],
  );
  const [visibility, setVisibility] = useState<PublicVisibilitySettings>(initial);
  const [dirty, setDirty] = useState(false);
  const visibilityRef = useRef(visibility);
  visibilityRef.current = visibility;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const lastSyncedFp = useRef(visibilityFingerprint(pet.profile_extras));

  // Sync from server only when the stored visibility actually changed AND the
  // form is not dirty — otherwise a parent re-render / pet refetch wipes
  // in-progress toggles before Salvar (leaving the DB on the old values).
  useEffect(() => {
    const fp = visibilityFingerprint(pet.profile_extras);
    if (dirtyRef.current) return;
    if (fp === lastSyncedFp.current) return;
    lastSyncedFp.current = fp;
    setVisibility(parsePublicVisibility(pet.profile_extras));
    setDirty(false);
  }, [pet.profile_extras]);

  const setKey = (key: PublicVisibilityKey, value: boolean) => {
    setVisibility((prev) => {
      const next = { ...prev, [key]: value };
      if (
        value &&
        (key === "allergies" || key === "medications" || key === "medical_notes" || key === "vaccines")
      ) {
        next.health_important = true;
      }
      // Turning the health master on enables the usual medical content toggles
      // so "everything on" actually exposes health when data exists.
      if (value && key === "health_important") {
        next.allergies = true;
        next.medications = true;
        next.medical_notes = true;
      }
      return next;
    });
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const current = visibilityRef.current;
      const raw =
        pet.profile_extras && typeof pet.profile_extras === "object"
          ? pet.profile_extras
          : extras;
      const root = withPublicVisibility(raw, current);
      const show_medical_public = medicalPublicFromVisibility(current);
      const { data, error } = await supabase
        .from("pets")
        .update({
          profile_extras: root,
          show_medical_public,
        })
        .eq("id", pet.id)
        .select("id, profile_extras, show_medical_public")
        .single();
      if (error) throw error;

      const saved = parsePublicVisibility(data.profile_extras);
      // Fail loudly if the DB did not persist what we sent (RLS / write issues).
      for (const key of Object.keys(current) as PublicVisibilityKey[]) {
        if (saved[key] !== current[key]) {
          throw new Error(
            `Falha ao gravar visibilidade (${key}). Tente salvar novamente.`,
          );
        }
      }
      return data;
    },
    onSuccess: (data) => {
      toast.success("Informações públicas atualizadas");
      const savedVis = parsePublicVisibility(data.profile_extras);
      lastSyncedFp.current = JSON.stringify(savedVis);
      setVisibility(savedVis);
      setDirty(false);

      // Keep the private pet query in sync so Identity/Health don't rewrite stale extras.
      qc.setQueryData(["pet", pet.id], (old: Record<string, unknown> | undefined | null) =>
        old && typeof old === "object"
          ? {
              ...old,
              profile_extras: data.profile_extras,
              show_medical_public: data.show_medical_public,
            }
          : old,
      );

      void qc.invalidateQueries({ queryKey: ["pet", pet.id] });
      void qc.removeQueries({ queryKey: ["public-pet", pet.public_slug] });
    },
    onError: (e: unknown) =>
      toast.error(
        logAndDescribeError(
          "PublicPrivacySettings: save failed",
          e,
          "Não foi possível salvar as informações públicas.",
        ),
      ),
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
          <Shield className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">Informações públicas</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Escolha o que outras pessoas poderão ver ao escanear o QR Code deste pet.
          </p>
        </div>
      </div>

      {pet.is_lost ? (
        <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
          Modo perdido ativo — a recuperação usa só os campos que você liberou abaixo.
        </div>
      ) : null}

      <div className="mt-5 space-y-5">
        {PUBLIC_VISIBILITY_GROUPS.map((group) => (
          <div key={group.id}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.title}
            </p>
            {group.description ? (
              <p className="mt-1 text-xs text-muted-foreground">{group.description}</p>
            ) : null}
            <ul className="mt-2 space-y-1">
              {group.keys.map((item) => (
                <li
                  key={item.key}
                  className={cn(
                    "flex min-h-12 items-center justify-between gap-3 rounded-xl border border-border px-3 py-2",
                    visibility[item.key] && "border-primary/30 bg-primary/5",
                  )}
                >
                  <div className="min-w-0">
                    <Label htmlFor={`vis-${item.key}`} className="text-sm font-medium">
                      {item.label}
                    </Label>
                    {item.hint ? (
                      <p className="text-xs text-muted-foreground">{item.hint}</p>
                    ) : null}
                  </div>
                  <Switch
                    id={`vis-${item.key}`}
                    checked={visibility[item.key]}
                    onCheckedChange={(v) => setKey(item.key, v === true)}
                    aria-label={item.label}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-between">
        {dirty ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-full"
            onClick={() =>
              toast.message("Salve as preferências antes de visualizar o perfil público.")
            }
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Visualizar perfil público
          </Button>
        ) : (
          <Button type="button" variant="outline" className="h-11 rounded-full" asChild>
            <Link to="/p/$slug" params={{ slug: pet.public_slug }} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Visualizar perfil público
            </Link>
          </Button>
        )}
        <Button
          type="button"
          className="h-11 rounded-full"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Salvando…" : "Salvar preferências"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Salve antes de visualizar. A pré-visualização abre a mesma página pública do QR Code
        (`/p/…`) que quem escanear a coleira vê.
      </p>
    </section>
  );
}
