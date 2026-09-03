import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { logAndDescribeError } from "@/lib/errors";
import {
  AUTH_NEXT_KEY,
  PENDING_TAG_ACTIVATION_KEY,
} from "@/lib/pending-tag-activation";

const CONFIRM_PHRASE = "EXCLUIR";
const LEGAL_INTENT_KEY = "petid_legal_intent";

function parseDeleteError(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string") {
    return (data as { error: string }).error;
  }
  return fallback;
}

/** Always visible for every authenticated user on Settings — no plan/admin gating. */
export function DeleteAccountSection() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const canConfirm = confirmText.trim().toUpperCase() === CONFIRM_PHRASE;

  const resetDialog = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setConfirmText("");
      setBusy(false);
    }
  };

  const clearClientState = async () => {
    try {
      sessionStorage.removeItem(LEGAL_INTENT_KEY);
      sessionStorage.removeItem(AUTH_NEXT_KEY);
      sessionStorage.removeItem(PENDING_TAG_ACTIVATION_KEY);
    } catch {
      /* ignore */
    }
    await queryClient.cancelQueries();
    queryClient.clear();
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      /* session may already be invalid after auth user deletion */
    }
  };

  const runDelete = async () => {
    if (!canConfirm || busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-account", {
        body: { confirm: CONFIRM_PHRASE },
      });

      if (error) {
        const ctx = error as { context?: Response };
        let body: unknown = data;
        if (!body && ctx.context) {
          try {
            body = await ctx.context.json();
          } catch {
            /* ignore */
          }
        }
        throw new Error(
          parseDeleteError(
            body,
            logAndDescribeError("delete-account", error, "Não foi possível excluir a conta."),
          ),
        );
      }

      if (data && typeof data === "object" && (data as { error?: string }).error) {
        throw new Error((data as { error: string }).error);
      }

      await clearClientState();
      resetDialog(false);
      toast.success("Sua conta foi excluída.");
      navigate({ to: "/", replace: true });
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : logAndDescribeError("delete-account", e, "Não foi possível excluir a conta.");
      toast.error(message);
      setBusy(false);
    }
  };

  return (
    <section
      id="zona-de-perigo"
      aria-labelledby="danger-zone-heading"
      className="space-y-4 rounded-2xl border-2 border-destructive/40 bg-destructive/5 p-6 shadow-[var(--shadow-card)]"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
          Zona de perigo
        </p>
        <h2
          id="danger-zone-heading"
          className="mt-1 flex items-center gap-2 text-lg font-semibold text-destructive"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
          Excluir minha conta
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta ação é permanente e não pode ser desfeita. Perfil, pets, documentos, histórico,
          lembretes e preferências ordinárias são removidos conforme o processo de exclusão. Arquivos
          de sua propriedade são apagados quando aplicável. Tags físicas vinculadas são
          desvinculadas/desabilitadas (a tag física permanece no inventário). Assinaturas ativas são
          tratadas antes da exclusão quando a cobrança está configurada. Após o sucesso, você é
          desconectado. Registros limitados podem ser retidos quando legitimamente necessários
          (obrigações legais, cobrança/contabilidade, segurança/fraude ou defesa de direitos), pelo
          período necessário — não prometemos o desaparecimento imediato de absolutamente todo
          registro técnico intermediário.
        </p>
      </div>

      <Button
        type="button"
        variant="destructive"
        className="min-h-11 rounded-full"
        onClick={() => setOpen(true)}
      >
        Excluir minha conta
      </Button>

      <AlertDialog open={open} onOpenChange={resetDialog}>
        <AlertDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Ao confirmar, removemos perfil, pets e dados associados, aceites legais e metadados
              locais de assinatura conforme o processo. Tags físicas ativas serão desvinculadas e
              marcadas como desabilitadas. Você será desconectado após o sucesso. Digite EXCLUIR
              abaixo para habilitar a exclusão.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 py-1">
            <Label htmlFor="delete-confirm">
              Digite <span className="font-mono tracking-wide">{CONFIRM_PHRASE}</span> para
              confirmar
            </Label>
            <Input
              id="delete-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_PHRASE}
              autoComplete="off"
              disabled={busy}
              className="font-mono uppercase"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={!canConfirm || busy}
              onClick={() => void runDelete()}
            >
              {busy ? "Excluindo…" : "Excluir definitivamente"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
