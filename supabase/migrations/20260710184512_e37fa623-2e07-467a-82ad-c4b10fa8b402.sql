
-- Fix critical data isolation: remove permissive SELECT policies on pets
DROP POLICY IF EXISTS "Authenticated can view pets" ON public.pets;
DROP POLICY IF EXISTS "Public can view pets" ON public.pets;

-- Owner-only SELECT (in addition to existing "Owner manages pets" ALL policy which already covers this,
-- but we keep an explicit SELECT policy for clarity)
CREATE POLICY "Owner views own pets"
  ON public.pets
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

-- Security definer function: lookup for public QR page (safe columns only)
CREATE OR REPLACE FUNCTION public.get_public_pet(_slug text)
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
    p.is_lost, p.last_seen_location, p.show_medical_public
  FROM public.pets p
  WHERE p.public_slug = _slug
$$;

GRANT EXECUTE ON FUNCTION public.get_public_pet(text) TO anon, authenticated;

-- Security definer helper for sighting policies (avoids RLS recursion on pets)
CREATE OR REPLACE FUNCTION public.pet_exists_and_lost(_pet_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.pets WHERE id = _pet_id AND is_lost = true)
$$;

CREATE OR REPLACE FUNCTION public.pet_exists(_pet_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.pets WHERE id = _pet_id)
$$;

GRANT EXECUTE ON FUNCTION public.pet_exists_and_lost(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pet_exists(uuid) TO anon, authenticated;

-- Rewrite sighting insert policies to use the security definer function
DROP POLICY IF EXISTS "Anyone can report sighting" ON public.sightings;
DROP POLICY IF EXISTS "Authenticated can report sighting" ON public.sightings;

CREATE POLICY "Anon can report sighting on lost pet"
  ON public.sightings
  FOR INSERT
  TO anon
  WITH CHECK (
    length(COALESCE(message, '')) <= 1000
    AND length(COALESCE(reporter_name, '')) <= 200
    AND length(COALESCE(reporter_contact, '')) <= 200
    AND length(COALESCE(location, '')) <= 300
    AND public.pet_exists_and_lost(pet_id)
  );

CREATE POLICY "Authenticated can report sighting"
  ON public.sightings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    length(COALESCE(message, '')) <= 1000
    AND public.pet_exists(pet_id)
  );
