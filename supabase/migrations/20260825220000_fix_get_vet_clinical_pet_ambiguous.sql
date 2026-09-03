-- Hotfix: get_vet_clinical_pet failed after re-grant because RETURNS TABLE
-- output names (expires_at, access_type, …) shadowed pet_vet_access columns
-- in the SELECT INTO WHERE clause → "column reference expires_at is ambiguous".
-- Qualify all grant-table columns. Do not change grant lifecycle semantics.

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

  -- IMPORTANT: qualify columns — RETURNS TABLE defines variables named
  -- expires_at / access_type / permissions / id that shadow table columns.
  SELECT a.* INTO g
  FROM public.pet_vet_access a
  WHERE a.pet_id = _pet_id
    AND a.vet_user_id = auth.uid()
    AND a.revoked_at IS NULL
    AND a.redeemed_at IS NOT NULL
    AND (a.expires_at IS NULL OR a.expires_at > now())
  ORDER BY a.redeemed_at DESC NULLS LAST, a.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT pets.* INTO p FROM public.pets WHERE pets.id = _pet_id;
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

COMMENT ON FUNCTION public.get_vet_clinical_pet(uuid) IS
  'Clinical payload for an active vet grant. Uses newest non-revoked redeemed grant for auth.uid(); column refs are table-qualified to avoid RETURNS TABLE name shadowing.';
