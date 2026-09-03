-- Sprint: complete public QR profile field mapping (additive RPC tweak only).
-- 1) Tutor "phone" prefers profile_extras.owner whatsapp/phone over emergency secondary.
-- 2) "pedigree" visibility also exposes identification.registration from profile_extras
--    when pets.pedigree is empty (same privacy toggle; existing data only).

DROP FUNCTION IF EXISTS public.get_public_pet(text);

CREATE FUNCTION public.get_public_pet(_slug text)
RETURNS TABLE (
  id uuid,
  public_slug text,
  name text,
  species text,
  breed text,
  sex text,
  birth_date date,
  weight_kg numeric,
  photo_url text,
  color text,
  microchip text,
  pedigree text,
  allergies text,
  medications text,
  medical_notes text,
  vaccines_public jsonb,
  owner_display_name text,
  owner_email text,
  secondary_contact_name text,
  secondary_contact_phone text,
  emergency_contact_phone text,
  emergency_instructions text,
  is_lost boolean,
  last_seen_location text,
  lost_since timestamptz,
  reward_amount numeric,
  show_medical_public boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.public_slug,
    CASE WHEN public.pet_public_vis(p.profile_extras, 'name', true) THEN p.name ELSE NULL END,
    CASE WHEN public.pet_public_vis(p.profile_extras, 'species', true) THEN p.species ELSE NULL END,
    CASE WHEN public.pet_public_vis(p.profile_extras, 'breed', true) THEN p.breed ELSE NULL END,
    CASE WHEN public.pet_public_vis(p.profile_extras, 'sex', true) THEN p.sex ELSE NULL END,
    CASE WHEN public.pet_public_vis(p.profile_extras, 'age', false) THEN p.birth_date ELSE NULL END,
    CASE WHEN public.pet_public_vis(p.profile_extras, 'weight', false) THEN p.weight_kg ELSE NULL END,
    CASE WHEN public.pet_public_vis(p.profile_extras, 'photo', true) THEN p.photo_url ELSE NULL END,
    CASE WHEN public.pet_public_vis(p.profile_extras, 'breed', true) THEN p.color ELSE NULL END,
    CASE WHEN public.pet_public_vis(p.profile_extras, 'microchip', false) THEN p.microchip ELSE NULL END,
    CASE
      WHEN public.pet_public_vis(p.profile_extras, 'pedigree', false)
      THEN COALESCE(
        NULLIF(TRIM(p.pedigree), ''),
        NULLIF(TRIM(COALESCE(p.profile_extras -> 'identification' ->> 'registration', '')), '')
      )
      ELSE NULL
    END,
    CASE
      WHEN public.pet_public_vis(p.profile_extras, 'allergies', false)
      THEN p.allergies
      ELSE NULL
    END,
    CASE
      WHEN public.pet_public_vis(p.profile_extras, 'medications', false)
      THEN p.medications
      ELSE NULL
    END,
    CASE
      WHEN public.pet_public_vis(p.profile_extras, 'medical_notes', false)
      THEN p.medical_notes
      ELSE NULL
    END,
    CASE
      WHEN public.pet_public_vis(p.profile_extras, 'vaccines', false)
      THEN (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object('name', v.name, 'applied_at', v.applied_at)
            ORDER BY v.applied_at DESC NULLS LAST
          ),
          '[]'::jsonb
        )
        FROM public.vaccines v
        WHERE v.pet_id = p.id
          AND v.applied_at IS NOT NULL
      )
      ELSE NULL
    END,
    CASE
      WHEN public.pet_public_vis(p.profile_extras, 'owner_name', false)
      THEN NULLIF(TRIM(COALESCE(p.profile_extras -> 'owner' ->> 'name', '')), '')
      ELSE NULL
    END,
    CASE
      WHEN public.pet_public_vis(p.profile_extras, 'email', false)
      THEN NULLIF(TRIM(COALESCE(p.profile_extras -> 'owner' ->> 'email', '')), '')
      ELSE NULL
    END,
    CASE
      WHEN public.pet_public_vis(p.profile_extras, 'emergency_contact', false)
      THEN p.secondary_contact_name
      ELSE NULL
    END,
    -- Tutor phone / WhatsApp: prefer owner extras, then emergency secondary as last resort.
    CASE
      WHEN public.pet_public_vis(p.profile_extras, 'phone', true)
      THEN COALESCE(
        NULLIF(TRIM(COALESCE(p.profile_extras -> 'owner' ->> 'whatsapp', '')), ''),
        NULLIF(TRIM(COALESCE(p.profile_extras -> 'owner' ->> 'phone', '')), ''),
        NULLIF(TRIM(p.secondary_contact_phone), '')
      )
      ELSE NULL
    END,
    CASE
      WHEN public.pet_public_vis(p.profile_extras, 'emergency_contact', false)
      THEN NULLIF(TRIM(p.secondary_contact_phone), '')
      ELSE NULL
    END,
    CASE
      WHEN p.is_lost
       AND public.pet_public_vis(p.profile_extras, 'find_instructions', false)
      THEN p.emergency_instructions
      ELSE NULL
    END,
    p.is_lost,
    CASE
      WHEN p.is_lost
       AND public.pet_public_vis(p.profile_extras, 'last_seen_location', true)
      THEN p.last_seen_location
      ELSE NULL
    END,
    CASE WHEN p.is_lost THEN p.lost_since ELSE NULL END,
    CASE
      WHEN p.is_lost
       AND public.pet_public_vis(p.profile_extras, 'reward', true)
      THEN p.reward_amount
      ELSE NULL
    END,
    (
      public.pet_public_vis(p.profile_extras, 'allergies', false)
      OR public.pet_public_vis(p.profile_extras, 'medications', false)
      OR public.pet_public_vis(p.profile_extras, 'medical_notes', false)
      OR public.pet_public_vis(p.profile_extras, 'vaccines', false)
    )
  FROM public.pets p
  WHERE p.public_slug = _slug
$$;

GRANT EXECUTE ON FUNCTION public.get_public_pet(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_pet(text) IS
  'Public QR profile. Returns only fields allowed by profile_extras.public_visibility. SECURITY DEFINER; does not expose owner_id or full pet row.';
