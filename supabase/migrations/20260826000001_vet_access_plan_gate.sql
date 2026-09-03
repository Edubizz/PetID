-- Sprint 7A follow-up: gate create_vet_access on plan entitlement

CREATE OR REPLACE FUNCTION public.create_vet_access(
  _pet_id uuid,
  _vet_name text,
  _clinic text DEFAULT NULL,
  _access_type text DEFAULT 'temporary',
  _duration_hours integer DEFAULT 24,
  _expires_at timestamptz DEFAULT NULL,
  _permission text DEFAULT 'view'
)
RETURNS TABLE (
  access_id uuid,
  access_token text,
  invite_url_path text,
  expires_at timestamptz,
  invite_expires_at timestamptz,
  access_type text,
  permission text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text := trim(COALESCE(_vet_name, ''));
  v_clinic text := NULLIF(trim(COALESCE(_clinic, '')), '');
  v_type text := lower(trim(COALESCE(_access_type, 'temporary')));
  v_perm text := lower(trim(COALESCE(_permission, 'view')));
  v_token text;
  v_hash text;
  v_prefix text;
  v_expires timestamptz;
  v_invite_expires timestamptz;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  PERFORM public.assert_vet_access_allowed(v_uid);

  IF NOT EXISTS (
    SELECT 1 FROM public.pets p WHERE p.id = _pet_id AND p.owner_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Pet not found or not owned by you';
  END IF;

  IF char_length(v_name) < 1 OR char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'Informe o nome do veterinário (1–120 caracteres)';
  END IF;

  IF v_type NOT IN ('temporary', 'permanent') THEN
    RAISE EXCEPTION 'Invalid access type';
  END IF;

  IF v_perm <> 'view' THEN
    RAISE EXCEPTION 'Only view permission is supported in this release';
  END IF;

  IF v_type = 'temporary' THEN
    IF _expires_at IS NOT NULL THEN
      v_expires := _expires_at;
    ELSE
      IF _duration_hours IS NULL OR _duration_hours < 1 OR _duration_hours > 8760 THEN
        RAISE EXCEPTION 'Duração temporária inválida (1–8760 horas)';
      END IF;
      v_expires := now() + make_interval(hours => _duration_hours);
    END IF;
    IF v_expires <= now() THEN
      RAISE EXCEPTION 'A expiração deve ser no futuro';
    END IF;
    v_invite_expires := v_expires;
  ELSE
    v_expires := NULL;
    v_invite_expires := now() + interval '14 days';
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := public.pet_vet_token_hash(v_token);
  v_prefix := left(v_token, 8);

  INSERT INTO public.pet_vet_access (
    pet_id, created_by, vet_name, clinic, access_type, permission,
    token_hash, token_prefix, expires_at, invite_expires_at
  ) VALUES (
    _pet_id, v_uid, v_name, v_clinic, v_type, v_perm,
    v_hash, v_prefix, v_expires, v_invite_expires
  )
  RETURNING id INTO v_id;

  RETURN QUERY SELECT
    v_id,
    v_token,
    ('/v/' || v_token)::text,
    v_expires,
    v_invite_expires,
    v_type,
    v_perm;
END;
$$;
