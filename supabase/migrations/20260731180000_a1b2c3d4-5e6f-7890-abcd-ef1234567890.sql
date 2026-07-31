
-- Pet Profile 2.0: one JSONB bag for owner / veterinary / identification
-- extras. Avoids a dozen new columns while keeping existing pets columns
-- (microchip, pedigree, secondary_contact_*) as the source of truth for
-- fields that already exist.
ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS profile_extras JSONB NOT NULL DEFAULT '{}'::jsonb;
