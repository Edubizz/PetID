-- Sprint Jurídico: versioned Terms / Privacy acceptance records

CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'signup'
    CHECK (source IN ('signup', 'oauth', 'existing_user', 'settings')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS legal_acceptances_versions_idx
  ON public.legal_acceptances (terms_version, privacy_version);

COMMENT ON TABLE public.legal_acceptances IS
  'Records that the user accepted current Terms/Privacy versions. One row per user (latest acceptance).';

ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own legal acceptance" ON public.legal_acceptances;
CREATE POLICY "Users read own legal acceptance"
  ON public.legal_acceptances FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Users insert own legal acceptance" ON public.legal_acceptances;
CREATE POLICY "Users insert own legal acceptance"
  ON public.legal_acceptances FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own legal acceptance" ON public.legal_acceptances;
CREATE POLICY "Users update own legal acceptance"
  ON public.legal_acceptances FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.legal_acceptances TO authenticated;
GRANT ALL ON public.legal_acceptances TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_legal_acceptance()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.legal_acceptances%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO v_row FROM public.legal_acceptances WHERE user_id = v_uid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('accepted', false);
  END IF;

  RETURN jsonb_build_object(
    'accepted', true,
    'terms_version', v_row.terms_version,
    'privacy_version', v_row.privacy_version,
    'accepted_at', v_row.accepted_at,
    'source', v_row.source
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_legal_documents(
  _terms_version text,
  _privacy_version text,
  _source text DEFAULT 'signup'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_source text := lower(trim(COALESCE(_source, 'signup')));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF _terms_version IS NULL OR length(trim(_terms_version)) < 1 THEN
    RAISE EXCEPTION 'terms_version required';
  END IF;
  IF _privacy_version IS NULL OR length(trim(_privacy_version)) < 1 THEN
    RAISE EXCEPTION 'privacy_version required';
  END IF;

  IF v_source NOT IN ('signup', 'oauth', 'existing_user', 'settings') THEN
    v_source := 'signup';
  END IF;

  INSERT INTO public.legal_acceptances (
    user_id, terms_version, privacy_version, accepted_at, source, updated_at
  ) VALUES (
    v_uid, trim(_terms_version), trim(_privacy_version), now(), v_source, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    terms_version = EXCLUDED.terms_version,
    privacy_version = EXCLUDED.privacy_version,
    accepted_at = now(),
    source = EXCLUDED.source,
    updated_at = now();

  RETURN public.get_my_legal_acceptance();
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_legal_acceptance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_legal_documents(text, text, text) TO authenticated;
