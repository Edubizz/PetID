import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Dog } from "lucide-react";

export type QuickActionKind = "weight" | "vaccine" | "appointment" | "lost" | "qr" | "daily-care";

type PickerPet = { id: string; name: string; photo_url: string | null };

type PetNavAction = Exclude<QuickActionKind, "qr" | "daily-care">;

const TAB_BY_ACTION: Record<PetNavAction, string> = {
  weight: "health",
  vaccine: "health",
  appointment: "dashboard",
  lost: "lost",
};

function isPetNavAction(action: QuickActionKind): action is PetNavAction {
  return action !== "qr" && action !== "daily-care";
}

/**
 * Central place that turns a Quick Action tap (from the FAB) into navigation
 * + the right existing dialog opening. Reused by every entry point so the
 * "which pet / which tab / which dialog" logic only lives once.
 */
export function useQuickPetAction() {
  const navigate = useNavigate();
  const [pendingAction, setPendingAction] = useState<QuickActionKind | null>(null);

  const { data: pets = [] } = useQuery({
    queryKey: ["pets-quick-picker"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return [] as PickerPet[];
      const { data, error } = await supabase.from("pets").select("id, name, photo_url").eq("owner_id", uid).order("name");
      if (error) throw error;
      return data as PickerPet[];
    },
  });

  function goToPet(action: PetNavAction, petId: string) {
    if (action === "weight" || action === "vaccine" || action === "appointment") {
      navigate({ to: "/pets/$id", params: { id: petId }, search: { tab: TAB_BY_ACTION[action], action } });
      return;
    }
    navigate({ to: "/pets/$id", params: { id: petId }, search: { tab: TAB_BY_ACTION[action] } });
  }

  function trigger(action: QuickActionKind) {
    if (action === "qr") return void navigate({ to: "/qr" });
    // Home absorbed the former "Hoje" page — daily care overview lives there.
    if (action === "daily-care") return void navigate({ to: "/dashboard" });

    if (pets.length === 0) {
      toast.error("Cadastre um pet primeiro");
      navigate({ to: "/pets/new" });
      return;
    }
    if (pets.length === 1) {
      goToPet(action, pets[0].id);
      return;
    }
    setPendingAction(action);
  }

  const picker = (
    <PetPickerDialog
      open={pendingAction !== null}
      pets={pets}
      onOpenChange={(open) => !open && setPendingAction(null)}
      onSelect={(petId) => {
        if (pendingAction && isPetNavAction(pendingAction)) goToPet(pendingAction, petId);
        setPendingAction(null);
      }}
    />
  );

  return { trigger, picker };
}

function PetPickerDialog({
  open,
  pets,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  pets: PickerPet[];
  onOpenChange: (open: boolean) => void;
  onSelect: (petId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Para qual pet?</DialogTitle>
        </DialogHeader>
        <div className="mt-1 space-y-1.5">
          {pets.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:border-primary hover:bg-primary/5"
            >
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-secondary">
                {p.photo_url ? (
                  <img src={p.photo_url} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-primary"><Dog className="h-5 w-5" /></div>
                )}
              </div>
              <span className="font-medium">{p.name}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
