-- Sprint: Pre-launch beta access entitlements
-- Beta grants are an independent entitlement source; Stripe subscriptions untouched.
-- resolve_user_plan becomes EFFECTIVE plan = max(subscription, active beta).

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.beta_access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  label text NOT NULL,
  plan text NOT NULL CHECK (plan IN ('guardiao', 'familia')),
  expires_at timestamptz NOT NULL,
  max_redemptions integer NOT NULL CHECK (max_redemptions >= 1),
  redemption_count integer NOT NULL DEFAULT 0
    CHECK (redemption_count >= 0),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT beta_access_codes_redemption_cap CHECK (redemption_count <= max_redemptions)
);

CREATE INDEX IF NOT EXISTS beta_access_codes_active_exp_idx
  ON public.beta_access_codes (active, expires_at)
  WHERE active = true;

CREATE TABLE IF NOT EXISTS public.beta_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  beta_code_id uuid NOT NULL REFERENCES public.beta_access_codes(id) ON DELETE RESTRICT,
  plan text NOT NULL CHECK (plan IN ('guardiao', 'familia')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT beta_access_grants_user_code_uidx UNIQUE (user_id, beta_code_id)
);

CREATE INDEX IF NOT EXISTS beta_access_grants_user_active_idx
  ON public.beta_access_grants (user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS beta_access_grants_code_idx
  ON public.beta_access_grants (beta_code_id);

ALTER TABLE public.beta_access_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_access_grants ENABLE ROW LEVEL SECURITY;

-- No direct table access for clients — only SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS "Admins manage beta codes" ON public.beta_access_codes;
CREATE POLICY "Admins manage beta codes"
  ON public.beta_access_codes FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins read beta grants" ON public.beta_access_grants;
CREATE POLICY "Admins read beta grants"
  ON public.beta_access_grants FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Users read own beta grants" ON public.beta_access_grants;
CREATE POLICY "Users read own beta grants"
  ON public.beta_access_grants FOR SELECT TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON public.beta_access_grants TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.beta_access_codes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.beta_access_grants TO authenticated;
GRANT ALL ON public.beta_access_codes TO service_role;
GRANT ALL ON public.beta_access_grants TO service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.normalize_beta_code(_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(regexp_replace(trim(coalesce(_code, '')), '[^A-Za-z0-9]', '', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.beta_code_hash(_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT encode(
    extensions.digest(convert_to(public.normalize_beta_code(_code), 'UTF8'), 'sha256'),
    'hex'
  )
$$;

CREATE OR REPLACE FUNCTION public.plan_rank(_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _plan
    WHEN 'familia' THEN 2
    WHEN 'guardiao' THEN 1
    ELSE 0
  END
$$;

CREATE OR REPLACE FUNCTION public.highest_plan(_a text, _b text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN public.plan_rank(_a) >= public.plan_rank(_b) THEN coalesce(nullif(_a, ''), 'essencial')
    ELSE coalesce(nullif(_b, ''), 'essencial')
  END
$$;

-- Underlying Stripe/local subscription only (never beta).
CREATE OR REPLACE FUNCTION public.resolve_subscription_plan(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.billing_subscriptions%ROWTYPE;
BEGIN
  IF _user_id IS NULL THEN
    RETURN 'essencial';
  END IF;

  SELECT * INTO v_row
  FROM public.billing_subscriptions
  WHERE user_id = _user_id;

  IF NOT FOUND THEN
    RETURN 'essencial';
  END IF;

  IF v_row.plan IS NULL OR v_row.plan = 'essencial' THEN
    RETURN 'essencial';
  END IF;

  IF lower(coalesce(v_row.status, 'none')) NOT IN ('active', 'trialing') THEN
    RETURN 'essencial';
  END IF;

  IF v_row.current_period_end IS NOT NULL AND v_row.current_period_end < now() THEN
    RETURN 'essencial';
  END IF;

  IF v_row.plan IN ('guardiao', 'familia') THEN
    RETURN v_row.plan;
  END IF;

  RETURN 'essencial';
END;
$$;

-- Highest active (non-revoked, non-expired) beta grant plan for the user.
CREATE OR REPLACE FUNCTION public.resolve_beta_plan(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text;
BEGIN
  IF _user_id IS NULL THEN
    RETURN 'essencial';
  END IF;

  SELECT g.plan INTO v_plan
  FROM public.beta_access_grants g
  WHERE g.user_id = _user_id
    AND g.revoked_at IS NULL
    AND g.expires_at > now()
    AND g.plan IN ('guardiao', 'familia')
  ORDER BY public.plan_rank(g.plan) DESC, g.expires_at DESC
  LIMIT 1;

  RETURN coalesce(v_plan, 'essencial');
END;
$$;

-- Alias used by product copy / RPCs.
CREATE OR REPLACE FUNCTION public.get_effective_plan(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.highest_plan(
    public.resolve_subscription_plan(_user_id),
    public.resolve_beta_plan(_user_id)
  );
END;
$$;

-- Replace resolve_user_plan so ALL existing triggers/RPCs use effective plan.
CREATE OR REPLACE FUNCTION public.resolve_user_plan(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.get_effective_plan(_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_active_beta_grant_snapshot(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  IF _user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    g.id,
    g.plan,
    g.expires_at,
    g.granted_at,
    c.label
  INTO v_row
  FROM public.beta_access_grants g
  JOIN public.beta_access_codes c ON c.id = g.beta_code_id
  WHERE g.user_id = _user_id
    AND g.revoked_at IS NULL
    AND g.expires_at > now()
  ORDER BY public.plan_rank(g.plan) DESC, g.expires_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'active', true,
    'grant_id', v_row.id,
    'plan', v_row.plan,
    'expires_at', v_row.expires_at,
    'granted_at', v_row.granted_at,
    'label', v_row.label
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_beta_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.beta_code_hash(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plan_rank(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.highest_plan(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_subscription_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_beta_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_beta_grant_snapshot(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- get_my_entitlements — include beta + underlying subscription plan
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_entitlements()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_plan text;
  v_underlying text;
  v_sub public.billing_subscriptions%ROWTYPE;
  v_promo public.billing_promo_config%ROWTYPE;
  v_pet_count integer;
  v_beta jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_underlying := public.resolve_subscription_plan(v_uid);
  v_plan := public.get_effective_plan(v_uid);
  v_beta := public.get_active_beta_grant_snapshot(v_uid);

  SELECT * INTO v_sub FROM public.billing_subscriptions WHERE user_id = v_uid;
  SELECT * INTO v_promo FROM public.billing_promo_config WHERE id = 'founder';

  SELECT count(*)::integer INTO v_pet_count
  FROM public.pets WHERE owner_id = v_uid;

  RETURN jsonb_build_object(
    'plan', v_plan,
    'underlying_plan', v_underlying,
    'pet_count', v_pet_count,
    'limits', jsonb_build_object(
      'pet_limit', public.plan_pet_limit(v_plan),
      'caretakers_per_pet', public.plan_caretaker_limit(v_plan),
      'documents_per_pet', CASE WHEN v_plan = 'essencial' THEN 3 ELSE NULL END,
      'history_days', CASE WHEN v_plan = 'essencial' THEN 30 ELSE NULL END,
      'reminders', v_plan <> 'essencial',
      'assistant', v_plan <> 'essencial',
      'reports', v_plan <> 'essencial',
      'vet_access', public.plan_allows_vet_access(v_plan),
      'family_permissions', v_plan = 'familia'
    ),
    'subscription', CASE WHEN v_sub.user_id IS NULL THEN NULL ELSE jsonb_build_object(
      'plan', v_sub.plan,
      'billing_interval', v_sub.billing_interval,
      'status', v_sub.status,
      'current_period_end', v_sub.current_period_end,
      'cancel_at_period_end', v_sub.cancel_at_period_end,
      'stripe_customer_id', v_sub.stripe_customer_id,
      'stripe_subscription_id', v_sub.stripe_subscription_id,
      'founder_offer', v_sub.founder_offer
    ) END,
    'beta', v_beta,
    'founder_offer', jsonb_build_object(
      'active', coalesce(v_promo.active, false)
        AND (v_promo.ends_at IS NULL OR v_promo.ends_at > now())
        AND (
          v_promo.max_subscriptions IS NULL
          OR v_promo.subscriptions_redeemed < v_promo.max_subscriptions
        ),
      'ends_at', v_promo.ends_at,
      'max_subscriptions', v_promo.max_subscriptions,
      'subscriptions_redeemed', coalesce(v_promo.subscriptions_redeemed, 0)
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Redeem (authenticated user)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.redeem_beta_access(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hash text;
  v_code public.beta_access_codes%ROWTYPE;
  v_grant public.beta_access_grants%ROWTYPE;
  v_generic text := 'Código beta inválido, expirado ou indisponível.';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF length(public.normalize_beta_code(_code)) < 8 THEN
    RAISE EXCEPTION '%', v_generic;
  END IF;

  v_hash := public.beta_code_hash(_code);

  SELECT * INTO v_code
  FROM public.beta_access_codes
  WHERE code_hash = v_hash
  FOR UPDATE;

  IF NOT FOUND
     OR v_code.active IS NOT TRUE
     OR v_code.revoked_at IS NOT NULL
     OR v_code.expires_at <= now()
     OR v_code.redemption_count >= v_code.max_redemptions
  THEN
    RAISE EXCEPTION '%', v_generic;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.beta_access_grants g
    WHERE g.user_id = v_uid AND g.beta_code_id = v_code.id
  ) THEN
    RAISE EXCEPTION '%', v_generic;
  END IF;

  -- Atomic capacity claim
  UPDATE public.beta_access_codes
  SET redemption_count = redemption_count + 1
  WHERE id = v_code.id
    AND active IS TRUE
    AND revoked_at IS NULL
    AND expires_at > now()
    AND redemption_count < max_redemptions
  RETURNING * INTO v_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION '%', v_generic;
  END IF;

  INSERT INTO public.beta_access_grants (
    user_id, beta_code_id, plan, expires_at
  ) VALUES (
    v_uid, v_code.id, v_code.plan, v_code.expires_at
  )
  RETURNING * INTO v_grant;

  RETURN jsonb_build_object(
    'ok', true,
    'plan', v_grant.plan,
    'expires_at', v_grant.expires_at,
    'granted_at', v_grant.granted_at,
    'effective_plan', public.get_effective_plan(v_uid),
    'label', v_code.label
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_beta_access(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Admin RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_create_beta_code(
  _label text,
  _plan text,
  _expires_at timestamptz,
  _max_redemptions integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_plan text := lower(trim(coalesce(_plan, '')));
  v_label text := trim(coalesce(_label, ''));
  v_raw text;
  v_part1 text := '';
  v_part2 text := '';
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i integer;
  v_byte bytea;
  v_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_label = '' OR char_length(v_label) > 120 THEN
    RAISE EXCEPTION 'Informe um rótulo válido (até 120 caracteres).';
  END IF;

  IF v_plan NOT IN ('guardiao', 'familia') THEN
    RAISE EXCEPTION 'Plano beta inválido.';
  END IF;

  IF _expires_at IS NULL OR _expires_at <= now() THEN
    RAISE EXCEPTION 'A data de expiração deve ser futura.';
  END IF;

  IF _max_redemptions IS NULL OR _max_redemptions < 1 OR _max_redemptions > 10000 THEN
    RAISE EXCEPTION 'Máximo de resgates inválido.';
  END IF;

  -- Secure random PETID-BETA-XXXX-XXXX (ambiguous chars excluded)
  FOR v_i IN 1..4 LOOP
    v_byte := extensions.gen_random_bytes(1);
    v_part1 := v_part1 || substr(v_alphabet, (get_byte(v_byte, 0) % length(v_alphabet)) + 1, 1);
  END LOOP;
  FOR v_i IN 1..4 LOOP
    v_byte := extensions.gen_random_bytes(1);
    v_part2 := v_part2 || substr(v_alphabet, (get_byte(v_byte, 0) % length(v_alphabet)) + 1, 1);
  END LOOP;

  v_raw := 'PETID-BETA-' || v_part1 || '-' || v_part2;

  INSERT INTO public.beta_access_codes (
    code_hash, label, plan, expires_at, max_redemptions, created_by
  ) VALUES (
    public.beta_code_hash(v_raw),
    v_label,
    v_plan,
    _expires_at,
    _max_redemptions,
    v_uid
  )
  RETURNING id INTO v_id;

  -- Plaintext returned ONCE — never stored.
  RETURN jsonb_build_object(
    'id', v_id,
    'code', v_raw,
    'label', v_label,
    'plan', v_plan,
    'expires_at', _expires_at,
    'max_redemptions', _max_redemptions
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_beta_codes()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC)
    FROM (
      SELECT
        c.id,
        c.label,
        c.plan,
        c.expires_at,
        c.max_redemptions,
        c.redemption_count,
        c.active,
        c.created_at,
        c.revoked_at,
        CASE
          WHEN c.revoked_at IS NOT NULL OR c.active IS NOT TRUE THEN 'disabled'
          WHEN c.expires_at <= now() THEN 'expired'
          WHEN c.redemption_count >= c.max_redemptions THEN 'full'
          ELSE 'active'
        END AS status
      FROM public.beta_access_codes c
    ) x
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_disable_beta_code(_code_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.beta_access_codes
  SET active = false,
      revoked_at = coalesce(revoked_at, now())
  WHERE id = _code_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Código não encontrado';
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', _code_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_beta_redemptions(_code_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.granted_at DESC)
    FROM (
      SELECT
        g.id AS grant_id,
        g.user_id,
        u.email::text AS email,
        p.full_name,
        g.plan,
        g.granted_at,
        g.expires_at,
        g.revoked_at,
        CASE
          WHEN g.revoked_at IS NOT NULL THEN 'revoked'
          WHEN g.expires_at <= now() THEN 'expired'
          ELSE 'active'
        END AS status
      FROM public.beta_access_grants g
      LEFT JOIN auth.users u ON u.id = g.user_id
      LEFT JOIN public.profiles p ON p.id = g.user_id
      WHERE g.beta_code_id = _code_id
    ) x
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_beta_grant(_grant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.beta_access_grants
  SET revoked_at = now(),
      revoked_by = v_uid
  WHERE id = _grant_id
    AND revoked_at IS NULL
  RETURNING user_id INTO v_user;

  IF NOT FOUND THEN
    -- Already revoked or missing
    SELECT user_id INTO v_user FROM public.beta_access_grants WHERE id = _grant_id;
    IF v_user IS NULL THEN
      RAISE EXCEPTION 'Concessão não encontrada';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'grant_id', _grant_id,
    'user_id', v_user,
    'effective_plan', public.get_effective_plan(v_user)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_beta_code(text, text, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_beta_codes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_disable_beta_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_beta_redemptions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_beta_grant(uuid) TO authenticated;
