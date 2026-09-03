-- Sprint 4: Veterinarian Access & Professional View
-- Secure per-pet grants with hashed invite tokens. Read-only clinical access via RLS.
-- Does NOT expose the owner's full account or other pets.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE public.pet_vet_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vet_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  vet_name text NOT NULL,
  clinic text,
  access_type text NOT NULL CHECK (access_type IN ('temporary', 'permanent')),
  permission text NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit')),
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  -- Access ends at expires_at (NULL = permanent until revoked)
  expires_at timestamptz,
  -- Unused invite link dies at invite_expires_at
  invite_expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pet_vet_access_temporary_needs_expiry CHECK (
    access_type = 'permanent' OR expires_at IS NOT NULL
  ),
  CONSTRAINT pet_vet_access_vet_name_len CHECK (char_length(vet_name) BETWEEN 1 AND 120),
  CONSTRAINT pet_vet_access_clinic_len CHECK (clinic IS NULL OR char_length(clinic) <= 160)
);

CREATE INDEX pet_vet_access_pet_id_idx ON public.pet_vet_access (pet_id);
CREATE INDEX pet_vet_access_vet_user_id_idx ON public.pet_vet_access (vet_user_id)
  WHERE vet_user_id IS NOT NULL AND revoked_at IS NULL;
CREATE INDEX pet_vet_access_token_hash_idx ON public.pet_vet_access (token_hash);

COMMENT ON TABLE public.pet_vet_access IS
  'Owner-authorized veterinarian access to a single pet. Invite tokens are stored hashed; plaintext shown once at creation.';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pet_vet_token_hash(_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.digest(convert_to(_token, 'UTF8'), 'sha256'), 'hex')
$$;

CREATE OR REPLACE FUNCTION public.has_active_vet_access(_pet_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pet_vet_access g
    WHERE g.pet_id = _pet_id
      AND g.vet_user_id = auth.uid()
      AND g.revoked_at IS NULL
      AND g.redeemed_at IS NOT NULL
      AND (g.expires_at IS NULL OR g.expires_at > now())
  )
$$;

CREATE OR REPLACE FUNCTION public.vet_access_permission(_pet_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.permission
  FROM public.pet_vet_access g
  WHERE g.pet_id = _pet_id
    AND g.vet_user_id = auth.uid()
    AND g.revoked_at IS NULL
    AND g.redeemed_at IS NOT NULL
    AND (g.expires_at IS NULL OR g.expires_at > now())
  ORDER BY g.redeemed_at DESC NULLS LAST
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.has_active_vet_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vet_access_permission(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.pet_vet_access ENABLE ROW LEVEL SECURITY;

-- Owners can read grants for their pets (no token_hash exposure needed for UX;
-- we still select it but UI never displays the hash).
CREATE POLICY "Owners read vet access for own pets"
  ON public.pet_vet_access
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pets p
      WHERE p.id = pet_id AND p.owner_id = auth.uid()
    )
  );

-- Veterinarians can read their own bound grants (status / expiry).
CREATE POLICY "Vets read own grants"
  ON public.pet_vet_access
  FOR SELECT
  TO authenticated
  USING (vet_user_id = auth.uid());

-- No direct INSERT/UPDATE/DELETE for clients — use SECURITY DEFINER RPCs.
-- (Prevents forging token_hash or binding another user.)

-- Clinical read access for active vets (owner policies already cover owners).
CREATE POLICY "Vets view granted pets"
  ON public.pets
  FOR SELECT
  TO authenticated
  USING (public.has_active_vet_access(id));

CREATE POLICY "Vets view granted vaccines"
  ON public.vaccines
  FOR SELECT
  TO authenticated
  USING (public.has_active_vet_access(pet_id));

CREATE POLICY "Vets view granted appointments"
  ON public.appointments
  FOR SELECT
  TO authenticated
  USING (public.has_active_vet_access(pet_id));

CREATE POLICY "Vets view granted weight history"
  ON public.weight_history
  FOR SELECT
  TO authenticated
  USING (public.has_active_vet_access(pet_id));

CREATE POLICY "Vets view granted documents"
  ON public.documents
  FOR SELECT
  TO authenticated
  USING (public.has_active_vet_access(pet_id));

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Owner creates an invite; returns plaintext token once.
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

  -- Initial release: read-only only (permission column reserved for future edit scopes).
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

-- Preview invite (authenticated): pet name + grant metadata, no clinical dump.
CREATE OR REPLACE FUNCTION public.preview_vet_access(_token text)
RETURNS TABLE (
  access_id uuid,
  pet_id uuid,
  pet_name text,
  pet_species text,
  pet_photo_url text,
  vet_name text,
  clinic text,
  access_type text,
  permission text,
  expires_at timestamptz,
  invite_expires_at timestamptz,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text;
  g public.pet_vet_access%ROWTYPE;
  p public.pets%ROWTYPE;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF _token IS NULL OR char_length(trim(_token)) < 16 THEN
    RAISE EXCEPTION 'Invalid token';
  END IF;

  v_hash := public.pet_vet_token_hash(trim(_token));

  SELECT * INTO g FROM public.pet_vet_access WHERE token_hash = v_hash;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT * INTO p FROM public.pets WHERE id = g.pet_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF g.revoked_at IS NOT NULL THEN
    v_status := 'revoked';
  ELSIF g.expires_at IS NOT NULL AND g.expires_at <= now() THEN
    v_status := 'expired';
  ELSIF g.redeemed_at IS NOT NULL THEN
    IF g.vet_user_id = auth.uid() THEN
      v_status := 'active';
    ELSE
      v_status := 'already_redeemed';
    END IF;
  ELSIF g.invite_expires_at <= now() THEN
    v_status := 'invite_expired';
  ELSE
    v_status := 'pending';
  END IF;

  RETURN QUERY SELECT
    g.id,
    p.id,
    p.name,
    p.species,
    p.photo_url,
    g.vet_name,
    g.clinic,
    g.access_type,
    g.permission,
    g.expires_at,
    g.invite_expires_at,
    v_status;
END;
$$;

-- Bind authenticated veterinarian to the grant.
CREATE OR REPLACE FUNCTION public.redeem_vet_access(_token text)
RETURNS TABLE (
  access_id uuid,
  pet_id uuid,
  access_type text,
  permission text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hash text;
  g public.pet_vet_access%ROWTYPE;
  v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF _token IS NULL OR char_length(trim(_token)) < 16 THEN
    RAISE EXCEPTION 'Invalid token';
  END IF;

  v_hash := public.pet_vet_token_hash(trim(_token));

  SELECT * INTO g
  FROM public.pet_vet_access
  WHERE token_hash = v_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite inválido ou inexistente';
  END IF;

  IF g.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este acesso foi revogado pelo tutor';
  END IF;

  IF g.expires_at IS NOT NULL AND g.expires_at <= now() THEN
    RAISE EXCEPTION 'Este acesso temporário expirou';
  END IF;

  SELECT owner_id INTO v_owner FROM public.pets WHERE id = g.pet_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Pet não encontrado';
  END IF;
  IF v_owner = v_uid THEN
    RAISE EXCEPTION 'Você é o tutor deste pet — não é necessário resgatar acesso veterinário';
  END IF;

  IF g.redeemed_at IS NOT NULL THEN
    IF g.vet_user_id = v_uid THEN
      -- Idempotent re-open for the same vet
      RETURN QUERY SELECT g.id, g.pet_id, g.access_type, g.permission, g.expires_at;
      RETURN;
    END IF;
    RAISE EXCEPTION 'Este convite já foi utilizado por outro profissional';
  END IF;

  IF g.invite_expires_at <= now() THEN
    RAISE EXCEPTION 'Este link de convite expirou';
  END IF;

  UPDATE public.pet_vet_access
  SET
    vet_user_id = v_uid,
    redeemed_at = now(),
    updated_at = now()
  WHERE id = g.id;

  RETURN QUERY SELECT g.id, g.pet_id, g.access_type, g.permission, g.expires_at;
END;
$$;

-- Owner revokes a grant (immediate).
CREATE OR REPLACE FUNCTION public.revoke_vet_access(_access_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  g public.pet_vet_access%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO g FROM public.pet_vet_access WHERE id = _access_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acesso não encontrado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pets p WHERE p.id = g.pet_id AND p.owner_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Sem permissão para revogar este acesso';
  END IF;

  IF g.revoked_at IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.pet_vet_access
  SET
    revoked_at = now(),
    revoked_by = v_uid,
    updated_at = now()
  WHERE id = _access_id;
END;
$$;

-- Pets the current user may open in the professional view.
CREATE OR REPLACE FUNCTION public.list_my_vet_pets()
RETURNS TABLE (
  access_id uuid,
  pet_id uuid,
  pet_name text,
  pet_species text,
  pet_breed text,
  pet_photo_url text,
  vet_name text,
  clinic text,
  access_type text,
  permission text,
  expires_at timestamptz,
  redeemed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    g.id,
    p.id,
    p.name,
    p.species,
    p.breed,
    p.photo_url,
    g.vet_name,
    g.clinic,
    g.access_type,
    g.permission,
    g.expires_at,
    g.redeemed_at
  FROM public.pet_vet_access g
  JOIN public.pets p ON p.id = g.pet_id
  WHERE g.vet_user_id = auth.uid()
    AND g.revoked_at IS NULL
    AND g.redeemed_at IS NOT NULL
    AND (g.expires_at IS NULL OR g.expires_at > now())
  ORDER BY g.redeemed_at DESC
$$;

GRANT EXECUTE ON FUNCTION public.create_vet_access(uuid, text, text, text, integer, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_vet_access(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_vet_access(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_vet_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_vet_pets() TO authenticated;

REVOKE ALL ON FUNCTION public.pet_vet_token_hash(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pet_vet_token_hash(text) TO authenticated;
