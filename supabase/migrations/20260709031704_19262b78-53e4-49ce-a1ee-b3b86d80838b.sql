
-- Sightings: prepare for future notifications
ALTER TABLE public.sightings
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS notified_email_at timestamptz,
  ADD COLUMN IF NOT EXISTS notified_whatsapp_at timestamptz,
  ADD COLUMN IF NOT EXISTS notified_push_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;

-- Storage policies for pet-photos bucket
CREATE POLICY "Public read pet-photos"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'pet-photos');

CREATE POLICY "Owner upload pet-photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'pet-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Owner update pet-photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'pet-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Owner delete pet-photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'pet-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
