import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { logAndDescribeError } from "@/lib/errors";
import { PhotoUploader } from "@/components/PhotoUploader";
import { PetColorField, PetMicrochipField, PetSexField } from "@/components/PetFormFields";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SPECIES_OPTIONS } from "@/lib/pet-constants";

export const Route = createFileRoute("/_authenticated/pets/new")({
  component: NewPet,
});

function NewPet() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    species: "Cachorro",
    breed: "",
    sex: "",
    birth_date: "",
    weight_kg: "",
    color: "",
    microchip: null as string | null,
    photo_url: "",
    medical_notes: "",
  });

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Informe o nome do pet.");
    setLoading(true);
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      setLoading(false);
      return toast.error("Sua sessão expirou. Faça login novamente.");
    }
    const { data, error } = await supabase
      .from("pets")
      .insert({
        owner_id: user.user.id,
        name: form.name,
        species: form.species || null,
        breed: form.breed || null,
        sex: form.sex || null,
        birth_date: form.birth_date || null,
        weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
        color: form.color || null,
        microchip: form.microchip && form.microchip.trim() ? form.microchip.trim() : null,
        photo_url: form.photo_url || null,
        medical_notes: form.medical_notes || null,
      })
      .select()
      .single();
    setLoading(false);
    if (error) return toast.error(logAndDescribeError("pets.new: create pet failed", error, "Não foi possível cadastrar o pet."));
    toast.success("Pet cadastrado!");
    // "Meus Pets", Dashboard and Today were fetched before this pet existed —
    // without this they'd keep missing it until their 60s staleTime expires.
    qc.invalidateQueries({ queryKey: ["pets"] });
    qc.invalidateQueries({ queryKey: ["today-care-overview"] });
    qc.invalidateQueries({ queryKey: ["pets-quick-picker"] });
    navigate({ to: "/pets/$id", params: { id: data.id } });
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Link to="/pets" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">Novo Pet</h1>
      <p className="mt-1 text-muted-foreground">Preencha as informações básicas — você pode completar depois.</p>

      <form onSubmit={submit} className="mt-8 space-y-5 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div>
          <Label className="mb-1.5 block text-sm">Foto do pet</Label>
          <PhotoUploader
            value={form.photo_url}
            onChange={(url) => update("photo_url", url ?? "")}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Nome *</Label>
            <Input required value={form.name} onChange={(e) => update("name", e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block text-sm">Espécie</Label>
            <Select value={form.species} onValueChange={(v) => update("species", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {SPECIES_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Raça</Label><Input value={form.breed} onChange={(e) => update("breed", e.target.value)} /></div>
          <PetSexField value={form.sex} onChange={(v) => update("sex", v)} />
          <div><Label>Data de nascimento</Label><Input type="date" value={form.birth_date} onChange={(e) => update("birth_date", e.target.value)} /></div>
          <div><Label>Peso (kg)</Label><Input type="number" step="0.1" value={form.weight_kg} onChange={(e) => update("weight_kg", e.target.value)} /></div>
          <PetColorField value={form.color} onChange={(v) => update("color", v)} />
          <PetMicrochipField
            value={form.microchip}
            onChange={(v) => setForm((f) => ({ ...f, microchip: v }))}
          />
          <div className="md:col-span-2"><Label>Observações médicas</Label><Textarea rows={3} value={form.medical_notes} onChange={(e) => update("medical_notes", e.target.value)} /></div>
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={loading} className="rounded-full">Criar pet</Button>
          <Button type="button" variant="ghost" asChild><Link to="/pets">Cancelar</Link></Button>
        </div>
      </form>
    </div>
  );
}