-- Sprint 5: Owner reminder preferences + dismiss/read actions.
-- Reminders themselves are DERIVED at read time from trackers/vaccines/appointments/weight.
-- This migration only stores preferences and per-occurrence owner actions (no duplicate schedule).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.notification_prefs IS
  'Owner reminder preferences: categories + quiet_hours. Reminders are derived, not stored here.';

CREATE TABLE public.reminder_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  reminder_key text NOT NULL,
  action text NOT NULL CHECK (action IN ('dismissed', 'read', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reminder_actions_key_len CHECK (char_length(reminder_key) BETWEEN 3 AND 200),
  CONSTRAINT reminder_actions_unique_key UNIQUE (user_id, reminder_key)
);

CREATE INDEX reminder_actions_user_id_idx ON public.reminder_actions (user_id);
CREATE INDEX reminder_actions_pet_id_idx ON public.reminder_actions (pet_id);

COMMENT ON TABLE public.reminder_actions IS
  'Owner dismiss/read/soft-complete for derived reminder keys. Does not store reminder content or schedules.';

ALTER TABLE public.reminder_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage own reminder actions"
  ON public.reminder_actions
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.pets p
      WHERE p.id = pet_id AND p.owner_id = auth.uid()
    )
  );

-- Upsert helper (idempotent dismiss/read)
CREATE OR REPLACE FUNCTION public.upsert_reminder_action(
  _pet_id uuid,
  _reminder_key text,
  _action text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF _action NOT IN ('dismissed', 'read', 'completed') THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pets p WHERE p.id = _pet_id AND p.owner_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Pet not found or not owned by you';
  END IF;

  INSERT INTO public.reminder_actions (user_id, pet_id, reminder_key, action)
  VALUES (v_uid, _pet_id, trim(_reminder_key), _action)
  ON CONFLICT (user_id, reminder_key)
  DO UPDATE SET
    action = EXCLUDED.action,
    pet_id = EXCLUDED.pet_id,
    created_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_reminder_action(uuid, text, text) TO authenticated;
