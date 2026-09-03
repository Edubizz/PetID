-- Sprint 7B: Physical PetID tag batches, inventory, activation, public resolve

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.physical_tag_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code text NOT NULL UNIQUE,
  quantity integer NOT NULL
    CHECK (quantity >= 12 AND quantity % 12 = 0),
  status text NOT NULL DEFAULT 'generated'
    CHECK (status IN (
      'generated', 'ordered', 'in_stock', 'reserved', 'active', 'disabled', 'lost', 'replaced'
    )),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.physical_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.physical_tag_batches(id) ON DELETE CASCADE,
  human_serial text NOT NULL UNIQUE,
  public_token text NOT NULL UNIQUE,
  activation_code_hash text NOT NULL,
  status text NOT NULL DEFAULT 'generated'
    CHECK (status IN (
      'generated', 'ordered', 'in_stock', 'reserved', 'active', 'disabled', 'lost', 'replaced'
    )),
  pet_id uuid REFERENCES public.pets(id) ON DELETE SET NULL,
  activated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT physical_tags_active_needs_pet CHECK (
    status <> 'active' OR (pet_id IS NOT NULL AND activated_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS physical_tags_batch_id_idx ON public.physical_tags (batch_id);
CREATE INDEX IF NOT EXISTS physical_tags_status_idx ON public.physical_tags (status);
CREATE INDEX IF NOT EXISTS physical_tags_pet_id_idx ON public.physical_tags (pet_id)
  WHERE pet_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS physical_tags_public_token_uidx
  ON public.physical_tags (public_token);

CREATE SEQUENCE IF NOT EXISTS public.physical_tag_serial_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.physical_tag_batch_seq START 1;

ALTER TABLE public.physical_tag_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physical_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage tag batches" ON public.physical_tag_batches;
CREATE POLICY "Admins manage tag batches"
  ON public.physical_tag_batches FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins manage tags" ON public.physical_tags;
CREATE POLICY "Admins manage tags"
  ON public.physical_tags FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Owners may see tags linked to their pets (no activation hash)
DROP POLICY IF EXISTS "Owners read active tags for own pets" ON public.physical_tags;
CREATE POLICY "Owners read active tags for own pets"
  ON public.physical_tags FOR SELECT TO authenticated
  USING (
    pet_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.pets p
      WHERE p.id = pet_id AND p.owner_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.physical_tag_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.physical_tags TO authenticated;
GRANT ALL ON public.physical_tag_batches TO service_role;
GRANT ALL ON public.physical_tags TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.physical_tag_serial_seq TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.physical_tag_batch_seq TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.physical_tag_code_hash(_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.digest(convert_to(upper(trim(_code)), 'UTF8'), 'sha256'), 'hex')
$$;

CREATE OR REPLACE FUNCTION public.generate_activation_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions
AS $$
DECLARE
  v_n bigint;
  v_a text;
  v_b text;
BEGIN
  v_n := (get_byte(extensions.gen_random_bytes(4), 0)::bigint << 24)
       + (get_byte(extensions.gen_random_bytes(1), 0)::bigint << 16)
       + (get_byte(extensions.gen_random_bytes(1), 0)::bigint << 8)
       + get_byte(extensions.gen_random_bytes(1), 0)::bigint;
  v_n := v_n % 100000000;
  v_a := lpad((v_n / 10000)::text, 4, '0');
  v_b := lpad((v_n % 10000)::text, 4, '0');
  RETURN v_a || '-' || v_b;
END;
$$;

-- Admin: create manufacturing batch (multiples of 12). Returns plaintext codes once.
CREATE OR REPLACE FUNCTION public.admin_create_tag_batch(
  _quantity integer DEFAULT 12,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_batch_id uuid;
  v_batch_code text;
  v_i integer;
  v_serial text;
  v_token text;
  v_code text;
  v_tags jsonb := '[]'::jsonb;
  v_row jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _quantity IS NULL OR _quantity < 12 OR (_quantity % 12) <> 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser múltiplo de 12 (mínimo 12)';
  END IF;

  v_batch_code := 'TAG-BATCH-' || lpad(nextval('public.physical_tag_batch_seq')::text, 4, '0');

  INSERT INTO public.physical_tag_batches (batch_code, quantity, status, notes, created_by)
  VALUES (v_batch_code, _quantity, 'generated', NULLIF(trim(COALESCE(_notes, '')), ''), v_uid)
  RETURNING id INTO v_batch_id;

  FOR v_i IN 1.._quantity LOOP
    v_serial := 'TAG-' || lpad(nextval('public.physical_tag_serial_seq')::text, 6, '0');
    v_token := encode(extensions.gen_random_bytes(24), 'base64');
    v_token := replace(replace(replace(v_token, '+', ''), '/', ''), '=', '');
    v_token := substr(v_token, 1, 22);
    v_code := public.generate_activation_code();

    INSERT INTO public.physical_tags (
      batch_id, human_serial, public_token, activation_code_hash, status
    ) VALUES (
      v_batch_id, v_serial, v_token, public.physical_tag_code_hash(v_code), 'generated'
    );

    v_row := jsonb_build_object(
      'human_serial', v_serial,
      'public_token', v_token,
      'activation_code', v_code
    );
    v_tags := v_tags || jsonb_build_array(v_row);
  END LOOP;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'batch_code', v_batch_code,
    'quantity', _quantity,
    'tags', v_tags
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_tag_batch(integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_regenerate_tag_activation(_tag_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_code text;
  v_serial text;
  v_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT human_serial, status INTO v_serial, v_status
  FROM public.physical_tags WHERE id = _tag_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tag não encontrada';
  END IF;

  IF v_status = 'active' THEN
    RAISE EXCEPTION 'Não é possível regenerar código de tag já ativada';
  END IF;

  v_code := public.generate_activation_code();
  UPDATE public.physical_tags
  SET activation_code_hash = public.physical_tag_code_hash(v_code),
      updated_at = now()
  WHERE id = _tag_id;

  RETURN jsonb_build_object(
    'tag_id', _tag_id,
    'human_serial', v_serial,
    'activation_code', v_code
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_regenerate_tag_activation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_tag_status(_tag_id uuid, _status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _status NOT IN ('generated','ordered','in_stock','reserved','active','disabled','lost','replaced') THEN
    RAISE EXCEPTION 'Status inválido';
  END IF;

  IF _status = 'active' THEN
    RAISE EXCEPTION 'Ativação deve usar o fluxo do tutor';
  END IF;

  UPDATE public.physical_tags
  SET status = _status,
      pet_id = CASE WHEN _status IN ('disabled','lost','replaced') THEN pet_id ELSE pet_id END,
      updated_at = now()
  WHERE id = _tag_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tag não encontrada';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_tag_status(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_batch_status(_batch_id uuid, _status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _status NOT IN ('generated','ordered','in_stock','reserved','active','disabled','lost','replaced') THEN
    RAISE EXCEPTION 'Status inválido';
  END IF;

  UPDATE public.physical_tag_batches
  SET status = _status, updated_at = now()
  WHERE id = _batch_id;

  -- Propagate inventory states to non-active tags
  IF _status IN ('ordered', 'in_stock', 'reserved') THEN
    UPDATE public.physical_tags
    SET status = _status, updated_at = now()
    WHERE batch_id = _batch_id
      AND status IN ('generated', 'ordered', 'in_stock', 'reserved');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_batch_status(uuid, text) TO authenticated;

-- Public resolve: never exposes inventory internals or activation secrets
CREATE OR REPLACE FUNCTION public.resolve_physical_tag(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tag public.physical_tags%ROWTYPE;
  v_slug text;
BEGIN
  IF _token IS NULL OR length(trim(_token)) < 8 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT * INTO v_tag
  FROM public.physical_tags
  WHERE public_token = trim(_token);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  IF v_tag.status IN ('disabled', 'lost', 'replaced') THEN
    RETURN jsonb_build_object('status', v_tag.status);
  END IF;

  IF v_tag.status <> 'active' OR v_tag.pet_id IS NULL THEN
    RETURN jsonb_build_object('status', 'unactivated');
  END IF;

  SELECT public_slug INTO v_slug FROM public.pets WHERE id = v_tag.pet_id;
  IF v_slug IS NULL THEN
    RETURN jsonb_build_object('status', 'disabled');
  END IF;

  RETURN jsonb_build_object(
    'status', 'active',
    'public_slug', v_slug
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_physical_tag(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.activate_physical_tag(
  _public_token text,
  _activation_code text,
  _pet_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tag public.physical_tags%ROWTYPE;
  v_hash text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pets p WHERE p.id = _pet_id AND p.owner_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Pet not found or not owned by you';
  END IF;

  SELECT * INTO v_tag
  FROM public.physical_tags
  WHERE public_token = trim(_public_token)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tag inválida';
  END IF;

  IF v_tag.status = 'active' THEN
    RAISE EXCEPTION 'Esta tag já foi ativada';
  END IF;

  IF v_tag.status IN ('disabled', 'lost', 'replaced') THEN
    RAISE EXCEPTION 'Esta tag não está disponível para ativação';
  END IF;

  v_hash := public.physical_tag_code_hash(_activation_code);
  IF v_hash IS DISTINCT FROM v_tag.activation_code_hash THEN
    RAISE EXCEPTION 'Código de ativação incorreto';
  END IF;

  UPDATE public.physical_tags
  SET status = 'active',
      pet_id = _pet_id,
      activated_by = v_uid,
      activated_at = now(),
      updated_at = now(),
      activation_code_hash = public.physical_tag_code_hash(encode(extensions.gen_random_bytes(16), 'hex'))
  WHERE id = v_tag.id;

  RETURN jsonb_build_object(
    'ok', true,
    'tag_id', v_tag.id,
    'human_serial', v_tag.human_serial,
    'pet_id', _pet_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_physical_tag(text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_tag_batches()
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
        b.id,
        b.batch_code,
        b.quantity,
        b.status,
        b.notes,
        b.created_at,
        count(*) FILTER (WHERE t.status IN ('generated','ordered','in_stock'))::int AS in_stockish,
        count(*) FILTER (WHERE t.status = 'reserved')::int AS reserved_count,
        count(*) FILTER (WHERE t.status = 'active')::int AS active_count,
        count(*) FILTER (WHERE t.status IN ('disabled','lost','replaced'))::int AS disabled_count
      FROM public.physical_tag_batches b
      LEFT JOIN public.physical_tags t ON t.batch_id = b.id
      GROUP BY b.id
    ) x
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_tag_batches() TO authenticated;
