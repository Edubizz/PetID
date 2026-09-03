import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { logAndDescribeError } from "@/lib/errors";
import {
  cancelPendingTagActivation,
  clearPendingTagActivation,
  getPendingTagActivation,
  setPendingTagActivation,
} from "@/lib/pending-tag-activation";

type ActivateTagSearch = { token?: string; petId?: string };

export const Route = createFileRoute("/_authenticated/activate-tag")({
  validateSearch: (search: Record<string, unknown>): ActivateTagSearch => ({
    token: typeof search.token === "string" ? search.token : undefined,
    petId: typeof search.petId === "string" ? search.petId : undefined,
  }),
  component: ActivateTagPage,
  head: () => ({
    meta: [
      { title: "Ativar tag — PetID" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function ActivateTagPage() {
  const { token: tokenFromSearch, petId: petIdFromSearch } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [publicToken, setPublicToken] = useState(() => {
    return tokenFromSearch?.trim() || getPendingTagActivation() || "";
  });
  const [activationCode, setActivationCode] = useState("");
  const [petId, setPetId] = useState(petIdFromSearch ?? "");
  const [tokenLocked, setTokenLocked] = useState(
    () => Boolean(tokenFromSearch?.trim() || getPendingTagActivation()),
  );

  useEffect(() => {
    const fromSearch = tokenFromSearch?.trim();
    const fromPending = getPendingTagActivation();

    if (fromSearch) {
      setPendingTagActivation(fromSearch);
      setPublicToken(fromSearch);
      setTokenLocked(true);
      return;
    }

    if (fromPending) {
      setPublicToken(fromPending);
      setTokenLocked(true);
      navigate({
        to: "/activate-tag",
        search: {
          token: fromPending,
          ...(petIdFromSearch ? { petId: petIdFromSearch } : {}),
        },
        replace: true,
      });
    }
  }, [tokenFromSearch, petIdFromSearch, navigate]);

  useEffect(() => {
    if (petIdFromSearch) setPetId(petIdFromSearch);
  }, [petIdFromSearch]);

  const pets = useQuery({
    queryKey: ["pets"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return [];
      const { data, error } = await supabase
        .from("pets")
        .select("id, name")
        .eq("owner_id", user.user.id)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!pets.data?.length) return;
    if (petId && pets.data.some((p) => p.id === petId)) return;
    if (petIdFromSearch && pets.data.some((p) => p.id === petIdFromSearch)) {
      setPetId(petIdFromSearch);
      return;
    }
    if (pets.data.length === 1) {
      setPetId(pets.data[0].id);
    }
  }, [pets.data, petId, petIdFromSearch]);

  const activate = useMutation({
    mutationFn: async () => {
      const token = (getPendingTagActivation() || publicToken).trim();
      const code = activationCode.trim();
      if (!token) throw new Error("Informe o token público da tag.");
      if (!code) throw new Error("Informe o código de ativação.");
      if (!petId) throw new Error("Selecione um pet.");

      const owned = pets.data?.some((p) => p.id === petId);
      if (!owned) throw new Error("Pet não encontrado ou não pertence à sua conta.");

      const { data, error } = await supabase.rpc("activate_physical_tag", {
        _public_token: token,
        _activation_code: code,
        _pet_id: petId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      clearPendingTagActivation();
      toast.success("Tag ativada com sucesso!");
      await qc.invalidateQueries({ queryKey: ["pets"] });
      navigate({ to: "/pets/$id", params: { id: petId } });
    },
    onError: (e: unknown) =>
      toast.error(
        logAndDescribeError(
          "activate-tag",
          e,
          "Não foi possível ativar a tag. Verifique o token e o código.",
        ),
      ),
  });

  const petOptions = useMemo(() => pets.data ?? [], [pets.data]);

  const cancelFlow = () => {
    cancelPendingTagActivation();
    setActivationCode("");
    toast.message("Ativação cancelada.");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Tag className="h-6 w-6 text-primary" />
          Ativar tag física
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Vincule a tag do colar ao perfil digital do seu pet. A tag PetID é identificação por QR
          (não é GPS). Só após ativação e vínculo ela exibe o que o perfil público permitir. Escanear
          a tag não garante contato nem a recuperação do pet.
        </p>
      </div>

      {pets.isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : petOptions.length === 0 ? (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-[var(--shadow-card)]">
          <p>
            Você precisa cadastrar um pet antes de ativar a tag. Depois de criar, voltamos para esta
            tela com o pet pronto para vincular.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="rounded-full">
              <Link to="/pets/new">Criar pet</Link>
            </Button>
            <Button type="button" variant="ghost" className="rounded-full" onClick={cancelFlow}>
              Cancelar ativação
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"
          onSubmit={(e) => {
            e.preventDefault();
            activate.mutate();
          }}
        >
          <div>
            <Label htmlFor="public-token">Token público</Label>
            <Input
              id="public-token"
              value={publicToken}
              onChange={(e) => {
                if (tokenLocked) return;
                setPublicToken(e.target.value);
              }}
              placeholder="Código da tag (QR / URL)"
              autoComplete="off"
              readOnly={tokenLocked}
              required
            />
            {tokenLocked ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Token da tag que você escaneou.{" "}
                <button
                  type="button"
                  className="text-primary underline-offset-2 hover:underline"
                  onClick={cancelFlow}
                >
                  Cancelar e escolher outra
                </button>
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="activation-code">Código de ativação</Label>
            <Input
              id="activation-code"
              value={activationCode}
              onChange={(e) => setActivationCode(e.target.value)}
              placeholder="Código impresso na embalagem"
              autoComplete="off"
              required
            />
          </div>
          <div>
            <Label className="mb-1.5 block">Pet</Label>
            <Select value={petId} onValueChange={setPetId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o pet" />
              </SelectTrigger>
              <SelectContent>
                {petOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-3 pt-1">
            <Button type="submit" className="rounded-full" disabled={activate.isPending}>
              {activate.isPending ? "Ativando…" : "Ativar tag"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="rounded-full"
              onClick={cancelFlow}
              disabled={activate.isPending}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
