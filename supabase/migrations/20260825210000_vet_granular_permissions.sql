-- Sprint 4.1: Granular per-grant veterinarian permissions
-- JSONB permissions on pet_vet_access; server-side has_vet_permission; no broad pets UPDATE for vets.

-- ---------------------------------------------------------------------------
-- Column + backfill
-- ---------------------------------------------------------------------------
ALTER TABLE public.pet_vet_access
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.pet_vet_access.permissions IS
  'Per-grant clinical permissions: none|view|edit keyed by area. Source of truth for vet authorization.';

-- Conservative defaults for existing grants (contacts stay none).
UPDATE public.pet_vet_access
SET permissions = jsonb_build_object(
  'identity', 'view',
  'owner_contact', 'none',
  'emergency_contact', 'none',
  'allergies', 'view',
  'medications', 'view',
  'medical_notes', 'view',
  'vaccines', 'view',
  'weight', 'view',
  'appointments', 'view',
  'documents', 'view'
)
WHERE permissions = '{}'::jsonb OR permissions IS NULL;

-- ---------------------------------------------------------------------------
-- Permission helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.default_vet_permissions()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'identity', 'view',
    'owner_contact', 'none',
    'emergency_contact', 'none',
    'allergies', 'view',
    'medications', 'view',
    'medical_notes', 'view',
    'vaccines', 'view',
    'weight', 'view',
    'appointments', 'view',
    'documents', 'view'
  )
$$;

CREATE OR REPLACE FUNCTION public.vet_permission_rank(_level text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(COALESCE(_level, 'none'))
    WHEN 'edit' THEN 2
    WHEN 'view' THEN 1
    ELSE 0
  END
$$;

CREATE OR REPLACE FUNCTION public.normalize_vet_permissions(_raw jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d jsonb := public.default_vet_permissions();
  src jsonb := COALESCE(_raw, '{}'::jsonb);
  k text;
  v text;
  view_only text[] := ARRAY['identity', 'owner_contact', 'emergency_contact'];
  editable text[] := ARRAY[
    'allergies', 'medications', 'medical_notes',
    'vaccines', 'weight', 'appointments', 'documents'
  ];
  out jsonb := '{}'::jsonb;
BEGIN
  FOREACH k IN ARRAY (view_only || editable) LOOP
    v := lower(COALESCE(src ->> k, d ->> k, 'none'));
    IF v = 'edit' AND k = ANY (view_only) THEN
      v := 'view';
    END IF;
    IF v NOT IN ('none', 'view', 'edit') THEN
      v := COALESCE(d ->> k, 'none');
    END IF;
    out := out || jsonb_build_object(k, v);
  END LOOP;
  RETURN out;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_vet_permission(
  _pet_id uuid,
  _area text,
  _min_level text DEFAULT 'view'
)
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
      AND public.vet_permission_rank(
            COALESCE(
              (public.normalize_vet_permissions(g.permissions) ->> lower(_area)),
              'none'
            )
          ) >= public.vet_permission_rank(_min_level)
  )
$$;

CREATE OR REPLACE FUNCTION public.get_my_vet_permissions(_pet_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.normalize_vet_permissions(g.permissions)
  FROM public.pet_vet_access g
  WHERE g.pet_id = _pet_id
    AND g.vet_user_id = auth.uid()
    AND g.revoked_at IS NULL
    AND g.redeemed_at IS NOT NULL
    AND (g.expires_at IS NULL OR g.expires_at > now())
  ORDER BY g.redeemed_at DESC NULLS LAST
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.default_vet_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_vet_permissions(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_vet_permission(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_vet_permissions(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Replace broad pets SELECT for vets — clinical payload via RPC only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Vets view granted pets" ON public.pets;

-- Child-table policies: view + edit
DROP POLICY IF EXISTS "Vets view granted vaccines" ON public.vaccines;
DROP POLICY IF EXISTS "Vets view granted appointments" ON public.appointments;
DROP POLICY IF EXISTS "Vets view granted weight history" ON public.weight_history;
DROP POLICY IF EXISTS "Vets view granted documents" ON public.documents;

CREATE POLICY "Vets select vaccines with view"
  ON public.vaccines FOR SELECT TO authenticated
  USING (public.has_vet_permission(pet_id, 'vaccines', 'view'));

CREATE POLICY "Vets insert vaccines with edit"
  ON public.vaccines FOR INSERT TO authenticated
  WITH CHECK (public.has_vet_permission(pet_id, 'vaccines', 'edit'));

CREATE POLICY "Vets update vaccines with edit"
  ON public.vaccines FOR UPDATE TO authenticated
  USING (public.has_vet_permission(pet_id, 'vaccines', 'edit'))
  WITH CHECK (public.has_vet_permission(pet_id, 'vaccines', 'edit'));

CREATE POLICY "Vets delete vaccines with edit"
  ON public.vaccines FOR DELETE TO authenticated
  USING (public.has_vet_permission(pet_id, 'vaccines', 'edit'));

CREATE POLICY "Vets select weight with view"
  ON public.weight_history FOR SELECT TO authenticated
  USING (public.has_vet_permission(pet_id, 'weight', 'view'));

CREATE POLICY "Vets insert weight with edit"
  ON public.weight_history FOR INSERT TO authenticated
  WITH CHECK (public.has_vet_permission(pet_id, 'weight', 'edit'));

-- Owner UI does not edit/delete weight rows; keep vet to insert-only for MVP.

CREATE POLICY "Vets select appointments with view"
  ON public.appointments FOR SELECT TO authenticated
  USING (public.has_vet_permission(pet_id, 'appointments', 'view'));

CREATE POLICY "Vets insert appointments with edit"
  ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (public.has_vet_permission(pet_id, 'appointments', 'edit'));

CREATE POLICY "Vets update appointments with edit"
  ON public.appointments FOR UPDATE TO authenticated
  USING (public.has_vet_permission(pet_id, 'appointments', 'edit'))
  WITH CHECK (public.has_vet_permission(pet_id, 'appointments', 'edit'));

CREATE POLICY "Vets delete appointments with edit"
  ON public.appointments FOR DELETE TO authenticated
  USING (public.has_vet_permission(pet_id, 'appointments', 'edit'));

CREATE POLICY "Vets select documents with view"
  ON public.documents FOR SELECT TO authenticated
  USING (public.has_vet_permission(pet_id, 'documents', 'view'));

CREATE POLICY "Vets insert documents with edit"
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (public.has_vet_permission(pet_id, 'documents', 'edit'));

CREATE POLICY "Vets update documents with edit"
  ON public.documents FOR UPDATE TO authenticated
  USING (public.has_vet_permission(pet_id, 'documents', 'edit'))
  WITH CHECK (public.has_vet_permission(pet_id, 'documents', 'edit'));

CREATE POLICY "Vets delete documents with edit"
  ON public.documents FOR DELETE TO authenticated
  USING (public.has_vet_permission(pet_id, 'documents', 'edit'));

-- ---------------------------------------------------------------------------
-- Filtered clinical pet payload (never returns unauthorized columns)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_vet_clinical_pet(_pet_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  species text,
  breed text,
  sex text,
  birth_date date,
  weight_kg numeric,
  photo_url text,
  color text,
  microchip text,
  allergies text,
  medications text,
  medical_notes text,
  owner_name text,
  owner_phone text,
  owner_whatsapp text,
  owner_email text,
  owner_relationship text,
  secondary_contact_name text,
  secondary_contact_phone text,
  emergency_instructions text,
  permissions jsonb,
  access_type text,
  expires_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g public.pet_vet_access%ROWTYPE;
  p public.pets%ROWTYPE;
  perms jsonb;
  extras jsonb;
  owner jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO g
  FROM public.pet_vet_access
  WHERE pet_id = _pet_id
    AND vet_user_id = auth.uid()
    AND revoked_at IS NULL
    AND redeemed_at IS NOT NULL
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY redeemed_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT * INTO p FROM public.pets WHERE pets.id = _pet_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  perms := public.normalize_vet_permissions(g.permissions);
  extras := COALESCE(p.profile_extras, '{}'::jsonb);
  owner := COALESCE(extras -> 'owner', '{}'::jsonb);

  RETURN QUERY SELECT
    p.id,
    CASE WHEN (perms ->> 'identity') IN ('view', 'edit') THEN p.name ELSE NULL END,
    CASE WHEN (perms ->> 'identity') IN ('view', 'edit') THEN p.species ELSE NULL END,
    CASE WHEN (perms ->> 'identity') IN ('view', 'edit') THEN p.breed ELSE NULL END,
    CASE WHEN (perms ->> 'identity') IN ('view', 'edit') THEN p.sex ELSE NULL END,
    CASE WHEN (perms ->> 'identity') IN ('view', 'edit') THEN p.birth_date ELSE NULL END,
    CASE WHEN (perms ->> 'weight') IN ('view', 'edit') THEN p.weight_kg ELSE NULL END,
    CASE WHEN (perms ->> 'identity') IN ('view', 'edit') THEN p.photo_url ELSE NULL END,
    CASE WHEN (perms ->> 'identity') IN ('view', 'edit') THEN p.color ELSE NULL END,
    CASE WHEN (perms ->> 'identity') IN ('view', 'edit') THEN p.microchip ELSE NULL END,
    CASE WHEN (perms ->> 'allergies') IN ('view', 'edit') THEN p.allergies ELSE NULL END,
    CASE WHEN (perms ->> 'medications') IN ('view', 'edit') THEN p.medications ELSE NULL END,
    CASE WHEN (perms ->> 'medical_notes') IN ('view', 'edit') THEN p.medical_notes ELSE NULL END,
    CASE WHEN (perms ->> 'owner_contact') IN ('view', 'edit') THEN NULLIF(owner ->> 'name', '') ELSE NULL END,
    CASE WHEN (perms ->> 'owner_contact') IN ('view', 'edit') THEN NULLIF(owner ->> 'phone', '') ELSE NULL END,
    CASE WHEN (perms ->> 'owner_contact') IN ('view', 'edit') THEN NULLIF(owner ->> 'whatsapp', '') ELSE NULL END,
    CASE WHEN (perms ->> 'owner_contact') IN ('view', 'edit') THEN NULLIF(owner ->> 'email', '') ELSE NULL END,
    CASE WHEN (perms ->> 'owner_contact') IN ('view', 'edit') THEN NULLIF(owner ->> 'relationship', '') ELSE NULL END,
    CASE WHEN (perms ->> 'emergency_contact') IN ('view', 'edit') THEN p.secondary_contact_name ELSE NULL END,
    CASE WHEN (perms ->> 'emergency_contact') IN ('view', 'edit') THEN p.secondary_contact_phone ELSE NULL END,
    CASE WHEN (perms ->> 'emergency_contact') IN ('view', 'edit') THEN p.emergency_instructions ELSE NULL END,
    perms,
    g.access_type,
    g.expires_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_vet_clinical_pet(uuid) TO authenticated;

-- Scoped health-field updates (never arbitrary pets UPDATE)
CREATE OR REPLACE FUNCTION public.update_vet_pet_health_fields(
  _pet_id uuid,
  _allergies text DEFAULT NULL,
  _set_allergies boolean DEFAULT false,
  _medications text DEFAULT NULL,
  _set_medications boolean DEFAULT false,
  _medical_notes text DEFAULT NULL,
  _set_medical_notes boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.has_active_vet_access(_pet_id) THEN
    RAISE EXCEPTION 'Sem acesso a este pet';
  END IF;

  IF _set_allergies AND NOT public.has_vet_permission(_pet_id, 'allergies', 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar alergias';
  END IF;
  IF _set_medications AND NOT public.has_vet_permission(_pet_id, 'medications', 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar medicamentos';
  END IF;
  IF _set_medical_notes AND NOT public.has_vet_permission(_pet_id, 'medical_notes', 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar observações';
  END IF;

  IF NOT (_set_allergies OR _set_medications OR _set_medical_notes) THEN
    RETURN;
  END IF;

  UPDATE public.pets
  SET
    allergies = CASE WHEN _set_allergies THEN NULLIF(trim(_allergies), '') ELSE allergies END,
    medications = CASE WHEN _set_medications THEN NULLIF(trim(_medications), '') ELSE medications END,
    medical_notes = CASE WHEN _set_medical_notes THEN NULLIF(trim(_medical_notes), '') ELSE medical_notes END,
    updated_at = now()
  WHERE id = _pet_id;
END;
$$;

-- Weight add + sync pets.weight_kg without broad pets UPDATE
CREATE OR REPLACE FUNCTION public.vet_add_weight(
  _pet_id uuid,
  _weight_kg numeric,
  _measured_at date DEFAULT CURRENT_DATE,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.has_vet_permission(_pet_id, 'weight', 'edit') THEN
    RAISE EXCEPTION 'Sem permissão para registrar peso';
  END IF;
  IF _weight_kg IS NULL OR _weight_kg <= 0 THEN
    RAISE EXCEPTION 'Informe um peso válido';
  END IF;

  INSERT INTO public.weight_history (pet_id, weight_kg, measured_at, notes)
  VALUES (_pet_id, _weight_kg, COALESCE(_measured_at, CURRENT_DATE), NULLIF(trim(COALESCE(_notes, '')), ''))
  RETURNING id INTO v_id;

  UPDATE public.pets
  SET weight_kg = _weight_kg, updated_at = now()
  WHERE id = _pet_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_vet_pet_health_fields(uuid, text, boolean, text, boolean, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vet_add_weight(uuid, numeric, date, text) TO authenticated;

-- Owner updates permissions on existing grant (immediate effect)
CREATE OR REPLACE FUNCTION public.update_vet_access_permissions(
  _access_id uuid,
  _permissions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  g public.pet_vet_access%ROWTYPE;
  normalized jsonb;
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
    RAISE EXCEPTION 'Sem permissão para alterar este acesso';
  END IF;

  IF g.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Não é possível alterar um acesso revogado';
  END IF;

  normalized := public.normalize_vet_permissions(_permissions);

  UPDATE public.pet_vet_access
  SET permissions = normalized, updated_at = now()
  WHERE id = _access_id;

  RETURN normalized;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_vet_access_permissions(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- Recreate create_vet_access with permissions arg
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_vet_access(uuid, text, text, text, integer, timestamptz, text);

CREATE OR REPLACE FUNCTION public.create_vet_access(
  _pet_id uuid,
  _vet_name text,
  _clinic text DEFAULT NULL,
  _access_type text DEFAULT 'temporary',
  _duration_hours integer DEFAULT 24,
  _expires_at timestamptz DEFAULT NULL,
  _permission text DEFAULT 'view',
  _permissions jsonb DEFAULT NULL
)
RETURNS TABLE (
  access_id uuid,
  access_token text,
  invite_url_path text,
  expires_at timestamptz,
  invite_expires_at timestamptz,
  access_type text,
  permission text,
  permissions jsonb
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
  v_permissions jsonb;
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

  -- Legacy column kept for compatibility; granular scopes live in permissions.
  IF v_perm NOT IN ('view', 'edit') THEN
    v_perm := 'view';
  END IF;
  -- Do not elevate legacy flag from UI; always store view at grant level.
  v_perm := 'view';

  v_permissions := public.normalize_vet_permissions(
    COALESCE(_permissions, public.default_vet_permissions())
  );

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
    pet_id, created_by, vet_name, clinic, access_type, permission, permissions,
    token_hash, token_prefix, expires_at, invite_expires_at
  ) VALUES (
    _pet_id, v_uid, v_name, v_clinic, v_type, v_perm, v_permissions,
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
    v_perm,
    v_permissions;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_vet_access(uuid, text, text, text, integer, timestamptz, text, jsonb) TO authenticated;

-- list_my_vet_pets: include permissions
DROP FUNCTION IF EXISTS public.list_my_vet_pets();

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
  permissions jsonb,
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
    public.normalize_vet_permissions(g.permissions),
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

GRANT EXECUTE ON FUNCTION public.list_my_vet_pets() TO authenticated;
