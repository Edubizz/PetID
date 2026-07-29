
-- Lost Mode upgrade: reward, emergency instructions, and sighting photos.
ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS reward_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS emergency_instructions text;

ALTER TABLE public.sightings
  ADD COLUMN IF NOT EXISTS photo_url text;

-- Re-cap the anon/authenticated sighting insert policies to bound the new
-- (base64) photo_url payload, same pattern as the existing text length caps.
DROP POLICY IF EXISTS "Anon can report sighting on lost pet" ON public.sightings;
CREATE POLICY "Anon can report sighting on lost pet"
  ON public.sightings
  FOR INSERT
  TO anon
  WITH CHECK (
    length(COALESCE(message, '')) <= 1000
    AND length(COALESCE(reporter_name, '')) <= 200
    AND length(COALESCE(reporter_contact, '')) <= 200
    AND length(COALESCE(location, '')) <= 300
    AND length(COALESCE(photo_url, '')) <= 5000000
    AND public.pet_exists_and_lost(pet_id)
  );

DROP POLICY IF EXISTS "Authenticated can report sighting" ON public.sightings;
CREATE POLICY "Authenticated can report sighting"
  ON public.sightings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    length(COALESCE(message, '')) <= 1000
    AND length(COALESCE(photo_url, '')) <= 5000000
    AND public.pet_exists(pet_id)
  );

-- Extend the public QR lookup with lost-mode fields (reward + last-seen time).
-- Emergency instructions are intentionally NOT exposed here (owner-only).
-- The RETURNS TABLE shape is changing (new columns), so the old function must
-- be dropped first: CREATE OR REPLACE cannot alter a function's return type.
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
  allergies text,
  medications text,
  medical_notes text,
  secondary_contact_phone text,
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
    p.id, p.public_slug, p.name, p.species, p.breed, p.sex, p.birth_date, p.weight_kg,
    p.photo_url, p.color, p.microchip,
    CASE WHEN p.show_medical_public THEN p.allergies END,
    CASE WHEN p.show_medical_public THEN p.medications END,
    CASE WHEN p.show_medical_public THEN p.medical_notes END,
    p.secondary_contact_phone,
    p.is_lost, p.last_seen_location, p.lost_since, p.reward_amount, p.show_medical_public
  FROM public.pets p
  WHERE p.public_slug = _slug
$$;

GRANT EXECUTE ON FUNCTION public.get_public_pet(text) TO anon, authenticated;
