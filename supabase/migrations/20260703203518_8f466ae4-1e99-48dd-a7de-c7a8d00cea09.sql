
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM public, anon, authenticated;

DROP POLICY IF EXISTS "Anyone can report sighting" ON public.sightings;
DROP POLICY IF EXISTS "Authenticated can report sighting" ON public.sightings;

CREATE POLICY "Anyone can report sighting" ON public.sightings FOR INSERT TO anon
  WITH CHECK (
    length(coalesce(message,'')) <= 1000
    AND length(coalesce(reporter_name,'')) <= 200
    AND length(coalesce(reporter_contact,'')) <= 200
    AND length(coalesce(location,'')) <= 300
    AND EXISTS (SELECT 1 FROM public.pets p WHERE p.id = pet_id AND p.is_lost = true)
  );

CREATE POLICY "Authenticated can report sighting" ON public.sightings FOR INSERT TO authenticated
  WITH CHECK (
    length(coalesce(message,'')) <= 1000
    AND EXISTS (SELECT 1 FROM public.pets p WHERE p.id = pet_id)
  );
