
-- ============ ROLES ============
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
$$;

DROP POLICY IF EXISTS "Users read own roles" ON public.user_roles;
CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Bootstrap: any authenticated user can claim admin if no admin exists yet.
CREATE OR REPLACE FUNCTION public.claim_first_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    RETURN false;
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'admin')
  ON CONFLICT DO NOTHING;
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.claim_first_admin() TO authenticated;

-- ============ AUDIT LOG ============
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read audit" ON public.admin_audit_log;
CREATE POLICY "Admins read audit" ON public.admin_audit_log FOR SELECT TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Admins write audit" ON public.admin_audit_log;
CREATE POLICY "Admins write audit" ON public.admin_audit_log FOR INSERT TO authenticated
WITH CHECK (public.is_admin() AND admin_id = auth.uid());

-- ============ VERIFICATION REQUESTS ============
CREATE TABLE IF NOT EXISTS public.verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending', -- pending | approved | rejected | needs_more
  documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.verification_requests TO authenticated;
GRANT ALL ON public.verification_requests TO service_role;
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads own requests" ON public.verification_requests;
CREATE POLICY "Owner reads own requests" ON public.verification_requests FOR SELECT TO authenticated
USING (requester_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Owner creates own request" ON public.verification_requests;
CREATE POLICY "Owner creates own request" ON public.verification_requests FOR INSERT TO authenticated
WITH CHECK (requester_id = auth.uid() AND EXISTS (SELECT 1 FROM public.pets WHERE id = pet_id AND owner_id = auth.uid()));

DROP POLICY IF EXISTS "Admins update requests" ON public.verification_requests;
CREATE POLICY "Admins update requests" ON public.verification_requests FOR UPDATE TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE TRIGGER trg_verification_requests_updated
BEFORE UPDATE ON public.verification_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ PET SCANS ============
CREATE TABLE IF NOT EXISTS public.pet_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id uuid NOT NULL REFERENCES public.pets(id) ON DELETE CASCADE,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pet_scans TO authenticated;
GRANT INSERT ON public.pet_scans TO anon, authenticated;
GRANT ALL ON public.pet_scans TO service_role;
ALTER TABLE public.pet_scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone records a scan" ON public.pet_scans;
CREATE POLICY "Anyone records a scan" ON public.pet_scans FOR INSERT TO anon, authenticated
WITH CHECK (public.pet_exists(pet_id));

DROP POLICY IF EXISTS "Owner or admin reads scans" ON public.pet_scans;
CREATE POLICY "Owner or admin reads scans" ON public.pet_scans FOR SELECT TO authenticated
USING (public.is_admin() OR EXISTS (SELECT 1 FROM public.pets WHERE id = pet_id AND owner_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.record_pet_scan(_slug text, _source text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _pid uuid;
BEGIN
  SELECT id INTO _pid FROM public.pets WHERE public_slug = _slug;
  IF _pid IS NOT NULL THEN
    INSERT INTO public.pet_scans (pet_id, source) VALUES (_pid, _source);
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.record_pet_scan(text, text) TO anon, authenticated;

-- ============ PROFILES: blocked flag ============
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;

-- ============ ADMIN-WIDE READ POLICIES ============
DROP POLICY IF EXISTS "Admins view all pets" ON public.pets;
CREATE POLICY "Admins view all pets" ON public.pets FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Admins update all pets" ON public.pets;
CREATE POLICY "Admins update all pets" ON public.pets FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admins delete all pets" ON public.pets;
CREATE POLICY "Admins delete all pets" ON public.pets FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins view all profiles" ON public.profiles;
CREATE POLICY "Admins view all profiles" ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "Admins update profiles" ON public.profiles;
CREATE POLICY "Admins update profiles" ON public.profiles FOR UPDATE TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins read sightings" ON public.sightings;
CREATE POLICY "Admins read sightings" ON public.sightings FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Admins update sightings" ON public.sightings;
CREATE POLICY "Admins update sightings" ON public.sightings FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins read vaccines" ON public.vaccines;
CREATE POLICY "Admins read vaccines" ON public.vaccines FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Admins read appointments" ON public.appointments;
CREATE POLICY "Admins read appointments" ON public.appointments FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Admins read documents" ON public.documents;
CREATE POLICY "Admins read documents" ON public.documents FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Admins read caretakers" ON public.caretakers;
CREATE POLICY "Admins read caretakers" ON public.caretakers FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Admins read weight" ON public.weight_history;
CREATE POLICY "Admins read weight" ON public.weight_history FOR SELECT TO authenticated USING (public.is_admin());

-- ============ ADMIN RPCs ============
CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'total_users', (SELECT count(*) FROM auth.users),
    'total_pets', (SELECT count(*) FROM public.pets),
    'lost_pets', (SELECT count(*) FROM public.pets WHERE is_lost = true),
    'found_pets', (SELECT count(*) FROM public.sightings WHERE status = 'resolved'),
    'verified_pets', (SELECT count(*) FROM public.pets WHERE is_verified = true),
    'total_scans', (SELECT count(*) FROM public.pet_scans),
    'new_users_30d', (SELECT count(*) FROM auth.users WHERE created_at > now() - interval '30 days'),
    'new_pets_30d', (SELECT count(*) FROM public.pets WHERE created_at > now() - interval '30 days'),
    'pending_verifications', (SELECT count(*) FROM public.verification_requests WHERE status = 'pending')
  );
END $$;
GRANT EXECUTE ON FUNCTION public.get_admin_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(
  id uuid, email text, full_name text, phone text, avatar_url text,
  created_at timestamptz, last_sign_in_at timestamptz,
  is_blocked boolean, role public.app_role, pets_count bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT u.id, u.email::text, p.full_name, p.phone, p.avatar_url,
    u.created_at, u.last_sign_in_at,
    COALESCE(p.is_blocked, false),
    (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = u.id ORDER BY (ur.role = 'admin') DESC LIMIT 1),
    (SELECT count(*) FROM public.pets pe WHERE pe.owner_id = u.id)
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  ORDER BY u.created_at DESC;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_pets()
RETURNS TABLE(
  id uuid, name text, breed text, species text, photo_url text, public_slug text,
  is_lost boolean, is_verified boolean, created_at timestamptz,
  owner_id uuid, owner_name text, owner_email text,
  scans_count bigint, last_scan_at timestamptz, sightings_count bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT pe.id, pe.name, pe.breed, pe.species, pe.photo_url, pe.public_slug,
    pe.is_lost, pe.is_verified, pe.created_at,
    pe.owner_id, pr.full_name, u.email::text,
    (SELECT count(*) FROM public.pet_scans s WHERE s.pet_id = pe.id),
    (SELECT max(s.created_at) FROM public.pet_scans s WHERE s.pet_id = pe.id),
    (SELECT count(*) FROM public.sightings si WHERE si.pet_id = pe.id)
  FROM public.pets pe
  LEFT JOIN public.profiles pr ON pr.id = pe.owner_id
  LEFT JOIN auth.users u ON u.id = pe.owner_id
  ORDER BY pe.created_at DESC;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_list_pets() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_monthly_stats()
RETURNS TABLE(month text, new_users bigint, new_pets bigint, scans bigint, sightings bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH months AS (
    SELECT to_char(date_trunc('month', now()) - (i || ' months')::interval, 'YYYY-MM') AS month,
           date_trunc('month', now()) - (i || ' months')::interval AS m
    FROM generate_series(0, 11) i
  )
  SELECT m.month,
    (SELECT count(*) FROM auth.users u WHERE date_trunc('month', u.created_at) = m.m),
    (SELECT count(*) FROM public.pets pe WHERE date_trunc('month', pe.created_at) = m.m),
    (SELECT count(*) FROM public.pet_scans s WHERE date_trunc('month', s.created_at) = m.m),
    (SELECT count(*) FROM public.sightings si WHERE date_trunc('month', si.created_at) = m.m)
  FROM months m ORDER BY m.m ASC;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_monthly_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(_user_id uuid, _role public.app_role, _enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _enabled THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role) ON CONFLICT DO NOTHING;
  ELSE
    -- prevent removing your own admin
    IF _user_id = auth.uid() AND _role = 'admin' THEN
      RAISE EXCEPTION 'cannot remove own admin role';
    END IF;
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = _role;
  END IF;
  INSERT INTO public.admin_audit_log(admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), CASE WHEN _enabled THEN 'grant_role' ELSE 'revoke_role' END, 'user', _user_id, jsonb_build_object('role', _role));
END $$;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, public.app_role, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_user_blocked(_user_id uuid, _blocked boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _user_id = auth.uid() AND _blocked THEN RAISE EXCEPTION 'cannot block yourself'; END IF;
  UPDATE public.profiles SET is_blocked = _blocked WHERE id = _user_id;
  INSERT INTO public.admin_audit_log(admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), CASE WHEN _blocked THEN 'block_user' ELSE 'unblock_user' END, 'user', _user_id, '{}'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_set_user_blocked(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_verification(_request_id uuid, _status text, _notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _pid uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _status NOT IN ('approved','rejected','needs_more','pending') THEN RAISE EXCEPTION 'invalid status'; END IF;
  UPDATE public.verification_requests
    SET status = _status, notes = COALESCE(_notes, notes), reviewer_id = auth.uid(), reviewed_at = now()
    WHERE id = _request_id
    RETURNING pet_id INTO _pid;
  IF _status = 'approved' AND _pid IS NOT NULL THEN
    UPDATE public.pets SET is_verified = true WHERE id = _pid;
  END IF;
  INSERT INTO public.admin_audit_log(admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'review_verification', 'verification_request', _request_id, jsonb_build_object('status', _status));
END $$;
GRANT EXECUTE ON FUNCTION public.admin_review_verification(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_resolve_lost(_pet_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.pets SET is_lost = false, lost_since = NULL WHERE id = _pet_id;
  UPDATE public.sightings SET status = 'resolved', acknowledged_at = COALESCE(acknowledged_at, now())
    WHERE pet_id = _pet_id AND status <> 'resolved';
  INSERT INTO public.admin_audit_log(admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'resolve_lost', 'pet', _pet_id, '{}'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_resolve_lost(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_verifications()
RETURNS TABLE(
  id uuid, pet_id uuid, pet_name text, pet_photo text,
  requester_id uuid, requester_name text, requester_email text,
  status text, documents jsonb, notes text, created_at timestamptz, reviewed_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT vr.id, vr.pet_id, pe.name, pe.photo_url,
    vr.requester_id, pr.full_name, u.email::text,
    vr.status, vr.documents, vr.notes, vr.created_at, vr.reviewed_at
  FROM public.verification_requests vr
  LEFT JOIN public.pets pe ON pe.id = vr.pet_id
  LEFT JOIN public.profiles pr ON pr.id = vr.requester_id
  LEFT JOIN auth.users u ON u.id = vr.requester_id
  ORDER BY (vr.status = 'pending') DESC, vr.created_at DESC;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_list_verifications() TO authenticated;
