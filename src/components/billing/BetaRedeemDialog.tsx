import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PartyPopper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { logAndDescribeError } from "@/lib/errors";
import { LEGAL_ROUTES, SUPPORT_EMAIL_ACTIVE } from "@/lib/legal";
import { PLAN_META, normalizePlanId, type CheckoutPlanKey } from "@/lib/entitlements";
import { formatDate } from "@/lib/pet-utils";

type RedeemResult = {
  ok: boolean;
  plan: CheckoutPlanKey;
  expires_at: string;
  effective_plan: string;
  label: string | null;
};

function parseRedeem(raw: unknown): RedeemResult {
  if (!raw || typeof raw !== "object") throw new Error("Resposta inválida.");
  const row = raw as Record<string, unknown>;
  const plan = row.plan;
  if (plan !== "guardiao" && plan !== "familia") throw new Error("Plano beta inválido.");
  if (typeof row.expires_at !== "string") throw new Error("Resposta inválida.");
  return {
    ok: true,
    plan,
    expires_at: row.expires_at,
    effective_plan: typeof row.effective_plan === "string" ? row.effective_plan : plan,
    label: typeof row.label === "string" ? row.label : null,
  };
}

export function BetaRedeemDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [success, setSuccess] = useState<RedeemResult | null>(null);

  const redeem = useMutation({
    mutationFn: async () => {
      const trimmed = code.trim();
      if (!trimmed) throw new Error("Informe o código beta.");
      const { data, error } = await supabase.rpc("redeem_beta_access", {
        _code: trimmed,
      });
      if (error) throw error;
      return parseRedeem(data);
    },
    onSuccess: async (result) => {
      setSuccess(result);
      await qc.invalidateQueries({ queryKey: ["entitlements"] });
    },
    onError: (e: unknown) => {
      toast.error(
        logAndDescribeError(
          "redeem_beta_access",
          e,
          "Código beta inválido, expirado ou indisponível.",
        ),
      );
    },
  });

  const resetAndClose = (next: boolean) => {
    if (!next) {
      setCode("");
      setSuccess(null);
      redeem.reset();
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="sm:max-w-md">
        {success ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PartyPopper className="h-5 w-5 text-primary" />
                Acesso Beta ativado
              </DialogTitle>
              <DialogDescription>
                Acesso beta gratuito e temporário. Nenhuma cobrança será realizada. Este acesso não
                é uma assinatura e não possui renovação automática.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 rounded-xl border border-border bg-secondary/30 p-4 text-sm">
              <p>
                <span className="text-muted-foreground">Plano: </span>
                <strong>{PLAN_META[normalizePlanId(success.plan)].name}</strong>
              </p>
              <p>
                <span className="text-muted-foreground">Válido até: </span>
                <strong>{formatDate(success.expires_at)}</strong>
              </p>
              <p className="text-muted-foreground">
                Durante o período beta você terá acesso aos recursos deste plano sem cobrança. O
                software pode conter erros — envie feedback quando encontrar problemas.
              </p>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button
                className="w-full rounded-full"
                onClick={() => {
                  resetAndClose(false);
                  navigate({ to: "/dashboard" });
                }}
              >
                Começar a usar o PetID
              </Button>
              <Button asChild variant="ghost" className="w-full rounded-full">
                <Link to={LEGAL_ROUTES.support}>
                  {SUPPORT_EMAIL_ACTIVE ? "Enviar feedback do Beta" : "Ver página de suporte"}
                </Link>
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Acesso Beta PetID</DialogTitle>
              <DialogDescription>
                Acesso beta gratuito e temporário. Nenhuma cobrança será realizada. Este acesso não
                é uma assinatura e não possui renovação automática.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                redeem.mutate();
              }}
            >
              <div>
                <Label htmlFor="beta-code">Código beta</Label>
                <Input
                  id="beta-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="PETID-BETA-XXXX-XXXX"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  disabled={redeem.isPending}
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => resetAndClose(false)}
                  disabled={redeem.isPending}
                >
                  Cancelar
                </Button>
                <Button type="submit" className="rounded-full" disabled={redeem.isPending}>
                  {redeem.isPending ? "Ativando…" : "Ativar acesso"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
