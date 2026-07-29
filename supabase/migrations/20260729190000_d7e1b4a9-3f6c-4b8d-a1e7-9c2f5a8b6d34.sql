
-- Daily Care Tracker: recurring care activities (water, food, medication, walk, ...)
-- Additive-only feature. Does not touch auth, admin, or existing tables.

CREATE TABLE public.trackers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'water', 'food', 'medication', 'walk', 'exercise', 'bathroom', 'grooming', 'training', 'custom'
  )),
  target_per_day NUMERIC NOT NULL DEFAULT 1,
  unit TEXT,
  color TEXT,
  icon TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Reminder metadata only (no push/email/SMS delivery yet) — e.g. {'08:00','20:00'}
  reminder_times TEXT[] NOT NULL DEFAULT '{}',
  -- Open-ended slot so future premium features (smart reminders, vet reports,
  -- AI analysis, recommendations) don't require a schema redesign.
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.tracker_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tracker_id UUID NOT NULL REFERENCES public.trackers(id) ON DELETE CASCADE,
  pet_id UUID NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  value NUMERIC NOT NULL DEFAULT 1,
  notes TEXT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trackers_pet_id ON public.trackers(pet_id);
CREATE INDEX idx_tracker_entries_tracker_id ON public.tracker_entries(tracker_id);
CREATE INDEX idx_tracker_entries_pet_completed ON public.tracker_entries(pet_id, completed_at DESC);

CREATE TRIGGER trg_trackers_updated BEFORE UPDATE ON public.trackers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trackers TO authenticated;
GRANT ALL ON public.trackers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracker_entries TO authenticated;
GRANT ALL ON public.tracker_entries TO service_role;

ALTER TABLE public.trackers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracker_entries ENABLE ROW LEVEL SECURITY;

-- Owner-only access, same join pattern used for vaccines/appointments/documents/weight_history.
CREATE POLICY "Owner manages trackers" ON public.trackers FOR ALL
  USING (EXISTS (SELECT 1 FROM public.pets p WHERE p.id = pet_id AND p.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pets p WHERE p.id = pet_id AND p.owner_id = auth.uid()));

CREATE POLICY "Owner manages tracker entries" ON public.tracker_entries FOR ALL
  USING (EXISTS (SELECT 1 FROM public.pets p WHERE p.id = pet_id AND p.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pets p WHERE p.id = pet_id AND p.owner_id = auth.uid()));

-- Admin read-only visibility, mirroring existing "Admins read <table>" policies. No changes
-- to existing admin RPCs/pages/policies.
CREATE POLICY "Admins read trackers" ON public.trackers FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admins read tracker entries" ON public.tracker_entries FOR SELECT TO authenticated USING (public.is_admin());
