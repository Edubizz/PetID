
-- Health Timeline: small history log so past Lost Mode activations/resolutions
-- can appear as real historical events (pets.lost_since is overwritten/cleared
-- on every toggle, so it cannot represent history on its own).
CREATE TABLE public.lost_mode_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (event IN ('activated', 'resolved')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_location TEXT,
  reward_amount NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lost_mode_events_pet ON public.lost_mode_events(pet_id, occurred_at DESC);

GRANT SELECT, INSERT ON public.lost_mode_events TO authenticated;
GRANT ALL ON public.lost_mode_events TO service_role;

ALTER TABLE public.lost_mode_events ENABLE ROW LEVEL SECURITY;

-- Owner can log and read their own pet's lost-mode history (append-only from the
-- app's perspective — no update/delete policy is needed or granted).
CREATE POLICY "Owner manages lost mode events" ON public.lost_mode_events FOR ALL
  USING (EXISTS (SELECT 1 FROM public.pets p WHERE p.id = pet_id AND p.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pets p WHERE p.id = pet_id AND p.owner_id = auth.uid()));

CREATE POLICY "Admins read lost mode events" ON public.lost_mode_events FOR SELECT TO authenticated
  USING (public.is_admin());
