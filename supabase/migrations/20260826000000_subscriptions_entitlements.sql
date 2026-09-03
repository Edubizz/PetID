-- Sprint 7A: Subscriptions + centralized entitlements + hard limit enforcement
-- Ownership/RLS remain authoritative; plan checks are additional gates on mutations.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'essencial'
    CHECK (plan IN ('essencial', 'guardiao', 'familia')),
  billing_interval text
    CHECK (billing_interval IS NULL OR billing_interval IN ('month', 'year')),
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  status text NOT NULL DEFAULT 'none',
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  stripe_price_id text,
  founder_offer boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_subscriptions_status_idx
  ON public.billing_subscriptions (status);
CREATE INDEX IF NOT EXISTS billing_subscriptions_customer_idx
  ON public.billing_subscriptions (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

COMMENT ON TABLE public.billing_subscriptions IS
  'Stripe-backed subscription state. Missing/inactive rows resolve to Essencial.';

CREATE TABLE IF NOT EXISTS public.billing_stripe_events (
  event_id text PRIMARY KEY,
  type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_promo_config (
  id text PRIMARY KEY DEFAULT 'founder',
  active boolean NOT NULL DEFAULT false,
  ends_at timestamptz,
  max_subscriptions integer,
  subscriptions_redeemed integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_promo_config_max_ok CHECK (
    max_subscriptions IS NULL OR max_subscriptions >= 0
  )
);

INSERT INTO public.billing_promo_config (id, active)
VALUES ('founder', false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_promo_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own subscription" ON public.billing_subscriptions;
CREATE POLICY "Users read own subscription"
  ON public.billing_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admins read stripe events" ON public.billing_stripe_events;
CREATE POLICY "Admins read stripe events"
  ON public.billing_stripe_events FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated read founder promo flags" ON public.billing_promo_config;
CREATE POLICY "Authenticated read founder promo flags"
  ON public.billing_promo_config FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage founder promo" ON public.billing_promo_config;
CREATE POLICY "Admins manage founder promo"
  ON public.billing_promo_config FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.billing_subscriptions TO authenticated;
GRANT SELECT ON public.billing_promo_config TO authenticated;
GRANT SELECT ON public.billing_stripe_events TO authenticated;
GRANT ALL ON public.billing_subscriptions TO service_role;
GRANT ALL ON public.billing_stripe_events TO service_role;
GRANT ALL ON public.billing_promo_config TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_user_plan(_user_id uuid)
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

CREATE OR REPLACE FUNCTION public.plan_pet_limit(_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _plan
    WHEN 'familia' THEN 3
    WHEN 'guardiao' THEN 1
    ELSE 1
  END
$$;

CREATE OR REPLACE FUNCTION public.plan_caretaker_limit(_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _plan
    WHEN 'familia' THEN 5
    WHEN 'guardiao' THEN 1
    ELSE 0
  END
$$;

CREATE OR REPLACE FUNCTION public.plan_document_limit(_plan text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _plan
    WHEN 'familia' THEN 1000000
    WHEN 'guardiao' THEN 1000000
    ELSE 3
  END
$$;

CREATE OR REPLACE FUNCTION public.plan_allows_vet_access(_plan text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _plan IN ('guardiao', 'familia')
$$;

GRANT EXECUTE ON FUNCTION public.resolve_user_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plan_pet_limit(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plan_caretaker_limit(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plan_document_limit(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plan_allows_vet_access(text) TO authenticated;

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
  v_sub public.billing_subscriptions%ROWTYPE;
  v_promo public.billing_promo_config%ROWTYPE;
  v_pet_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_plan := public.resolve_user_plan(v_uid);

  SELECT * INTO v_sub FROM public.billing_subscriptions WHERE user_id = v_uid;
  SELECT * INTO v_promo FROM public.billing_promo_config WHERE id = 'founder';

  SELECT count(*)::integer INTO v_pet_count
  FROM public.pets WHERE owner_id = v_uid;

  RETURN jsonb_build_object(
    'plan', v_plan,
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

GRANT EXECUTE ON FUNCTION public.get_my_entitlements() TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_pet_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text;
  v_limit integer;
  v_count integer;
BEGIN
  v_plan := public.resolve_user_plan(NEW.owner_id);
  v_limit := public.plan_pet_limit(v_plan);

  SELECT count(*)::integer INTO v_count
  FROM public.pets
  WHERE owner_id = NEW.owner_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_PETS: Seu plano permite no máximo % pet(s). Faça upgrade para adicionar mais.', v_limit
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_pet_plan_limit ON public.pets;
CREATE TRIGGER trg_enforce_pet_plan_limit
  BEFORE INSERT ON public.pets
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_pet_plan_limit();

CREATE OR REPLACE FUNCTION public.enforce_caretaker_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_plan text;
  v_limit integer;
  v_count integer;
BEGIN
  SELECT owner_id INTO v_owner FROM public.pets WHERE id = NEW.pet_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Pet not found';
  END IF;

  v_plan := public.resolve_user_plan(v_owner);
  v_limit := public.plan_caretaker_limit(v_plan);

  SELECT count(*)::integer INTO v_count
  FROM public.caretakers
  WHERE pet_id = NEW.pet_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_CARETAKERS: Seu plano permite no máximo % tutor(es) por pet.', v_limit
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_caretaker_plan_limit ON public.caretakers;
CREATE TRIGGER trg_enforce_caretaker_plan_limit
  BEFORE INSERT ON public.caretakers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_caretaker_plan_limit();

CREATE OR REPLACE FUNCTION public.enforce_document_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_plan text;
  v_limit integer;
  v_count integer;
BEGIN
  SELECT owner_id INTO v_owner FROM public.pets WHERE id = NEW.pet_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Pet not found';
  END IF;

  v_plan := public.resolve_user_plan(v_owner);
  v_limit := public.plan_document_limit(v_plan);

  SELECT count(*)::integer INTO v_count
  FROM public.documents
  WHERE pet_id = NEW.pet_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'PLAN_LIMIT_DOCUMENTS: Seu plano permite no máximo % documento(s) por pet.', v_limit
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_document_plan_limit ON public.documents;
CREATE TRIGGER trg_enforce_document_plan_limit
  BEFORE INSERT ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_document_plan_limit();

CREATE OR REPLACE FUNCTION public.assert_vet_access_allowed(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text;
BEGIN
  v_plan := public.resolve_user_plan(_user_id);
  IF NOT public.plan_allows_vet_access(v_plan) THEN
    RAISE EXCEPTION 'PLAN_LIMIT_VET: Acesso veterinário disponível nos planos Guardião e Família.'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assert_vet_access_allowed(uuid) TO authenticated;
