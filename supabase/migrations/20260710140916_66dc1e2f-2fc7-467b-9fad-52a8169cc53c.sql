
CREATE TABLE public.caretakers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  relationship text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.caretakers TO authenticated;
GRANT ALL ON public.caretakers TO service_role;
ALTER TABLE public.caretakers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages caretakers" ON public.caretakers FOR ALL
  USING (EXISTS (SELECT 1 FROM public.pets p WHERE p.id = pet_id AND p.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pets p WHERE p.id = pet_id AND p.owner_id = auth.uid()));
CREATE TRIGGER trg_caretakers_updated BEFORE UPDATE ON public.caretakers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_caretakers_pet ON public.caretakers(pet_id);

CREATE TABLE public.weight_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  weight_kg numeric(6,2) NOT NULL,
  measured_at date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weight_history TO authenticated;
GRANT ALL ON public.weight_history TO service_role;
ALTER TABLE public.weight_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages weight history" ON public.weight_history FOR ALL
  USING (EXISTS (SELECT 1 FROM public.pets p WHERE p.id = pet_id AND p.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pets p WHERE p.id = pet_id AND p.owner_id = auth.uid()));
CREATE INDEX idx_weight_history_pet ON public.weight_history(pet_id, measured_at DESC);
