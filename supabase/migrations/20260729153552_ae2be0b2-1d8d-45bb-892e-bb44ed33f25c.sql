
-- =====================================================================
-- 5C.1.b: Canonical recipient resolver
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Internal resolver: SECURITY DEFINER, NOT callable from browser
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_email_recipient_candidates(
  p_scope text,
  p_organization_id uuid,
  p_source text,
  p_manual_emails text[]
)
RETURNS TABLE(email text, recipient_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope_key text;
BEGIN
  -- Validate scope/source combinations
  IF p_scope NOT IN ('platform','org','organization') THEN
    RAISE EXCEPTION 'invalid scope: %', p_scope USING ERRCODE = '22023';
  END IF;

  IF p_source NOT IN ('students','companies','organizations','companies_db','manual') THEN
    RAISE EXCEPTION 'invalid source: %', p_source USING ERRCODE = '22023';
  END IF;

  IF p_scope IN ('org','organization') AND p_source IN ('organizations','companies_db') THEN
    RAISE EXCEPTION 'source % not allowed for org scope', p_source USING ERRCODE = '22023';
  END IF;

  IF p_scope = 'platform' AND p_source IN ('students','companies') THEN
    RAISE EXCEPTION 'source % not allowed for platform scope', p_source USING ERRCODE = '22023';
  END IF;

  IF p_source = 'manual' THEN
    IF p_manual_emails IS NULL THEN
      RETURN;
    END IF;
    IF array_length(p_manual_emails, 1) > 10000 THEN
      RAISE EXCEPTION 'manual_emails exceeds server limit of 10000 addresses'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_source IN ('students','companies') AND p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id required for org sources' USING ERRCODE = '22023';
  END IF;

  v_scope_key := CASE WHEN p_scope = 'platform' THEN 'platform'
                      ELSE COALESCE(p_organization_id::text, 'platform') END;

  RETURN QUERY
  WITH raw AS (
    -- source=students
    SELECT
      lower(btrim(p.email))::text AS email_norm,
      NULLIF(btrim(p.full_name), '')::text AS name_norm
    FROM public.profiles p
    WHERE p_source = 'students'
      AND p.organization_id = p_organization_id
      AND p.archived_at IS NULL
      AND p.email IS NOT NULL
      AND public.is_student_profile(p.user_id, p_organization_id) = true

    UNION ALL
    -- source=companies (org)
    SELECT
      lower(btrim(c.email))::text,
      NULLIF(btrim(c.name), '')::text
    FROM public.companies c
    WHERE p_source = 'companies'
      AND c.organization_id = p_organization_id
      AND c.email IS NOT NULL

    UNION ALL
    -- source=organizations (platform)
    SELECT
      lower(btrim(o.email))::text,
      NULLIF(btrim(o.name), '')::text
    FROM public.organizations o
    WHERE p_source = 'organizations'
      AND o.email IS NOT NULL

    UNION ALL
    -- source=companies_db (platform)
    SELECT
      lower(btrim(s.email))::text,
      NULLIF(btrim(s.name), '')::text
    FROM public.sales_companies_db s
    WHERE p_source = 'companies_db'
      AND s.email IS NOT NULL

    UNION ALL
    -- source=manual
    SELECT
      lower(btrim(x))::text,
      NULL::text
    FROM unnest(COALESCE(p_manual_emails, ARRAY[]::text[])) AS x
    WHERE p_source = 'manual'
      AND x IS NOT NULL
      AND btrim(x) <> ''
  ),
  valid AS (
    SELECT email_norm, name_norm
    FROM raw
    WHERE email_norm ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
  ),
  dedup AS (
    SELECT DISTINCT ON (email_norm)
      email_norm,
      name_norm
    FROM valid
    ORDER BY email_norm, (name_norm IS NULL), name_norm
  )
  SELECT d.email_norm, COALESCE(d.name_norm, '')
  FROM dedup d
  WHERE NOT EXISTS (
    SELECT 1 FROM public.email_suppressions s
    WHERE lower(btrim(s.email)) = d.email_norm
      AND s.scope IN (v_scope_key, 'platform')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_email_recipient_candidates(text, uuid, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_email_recipient_candidates(text, uuid, text, text[]) TO service_role;

-- ---------------------------------------------------------------------
-- 2) Campaign resolver (service_role only)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_campaign_recipients(p_campaign_id uuid)
RETURNS TABLE(email text, recipient_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_camp record;
BEGIN
  v_role := current_setting('request.jwt.claim.role', true);
  IF v_role IS NULL OR v_role <> 'service_role' THEN
    IF current_user <> 'service_role' AND session_user <> 'service_role' THEN
      RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT scope, organization_id, recipient_source, manual_emails
    INTO v_camp
    FROM public.email_campaigns
   WHERE id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'campaign not found: %', p_campaign_id USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT r.email, r.recipient_name
  FROM public.resolve_email_recipient_candidates(
    v_camp.scope,
    v_camp.organization_id,
    v_camp.recipient_source,
    v_camp.manual_emails
  ) r;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_campaign_recipients(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_campaign_recipients(uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 3) Preview RPC (authenticated), returns aggregate counts only
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_campaign_recipient_preview(
  p_scope text,
  p_organization_id uuid,
  p_source text,
  p_manual_emails text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_input_count integer := 0;
  v_invalid_count integer := 0;
  v_duplicate_count integer := 0;
  v_eligible_count integer := 0;
  v_pre_supp_count integer := 0;
  v_suppressed_count integer := 0;
  v_scope_key text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_scope NOT IN ('platform','org','organization') THEN
    RAISE EXCEPTION 'invalid scope' USING ERRCODE = '22023';
  END IF;

  v_is_admin := public.has_role(v_uid, 'admin'::app_role);

  IF p_scope = 'platform' THEN
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
    END IF;
    IF p_source NOT IN ('organizations','companies_db','manual') THEN
      RAISE EXCEPTION 'source not allowed for platform scope' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF p_organization_id IS NULL THEN
      RAISE EXCEPTION 'organization_id required' USING ERRCODE = '22023';
    END IF;
    IF NOT v_is_admin THEN
      IF NOT public.can_access_organization(p_organization_id, 'sales.write') THEN
        RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF p_source NOT IN ('students','companies','manual') THEN
      RAISE EXCEPTION 'source not allowed for org scope' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Manual: measure input/invalid/duplicate on the caller-supplied array
  IF p_source = 'manual' THEN
    IF p_manual_emails IS NOT NULL AND array_length(p_manual_emails, 1) > 10000 THEN
      RAISE EXCEPTION 'manual_emails exceeds server limit of 10000 addresses'
        USING ERRCODE = '22023';
    END IF;

    WITH src AS (
      SELECT lower(btrim(x)) AS e
      FROM unnest(COALESCE(p_manual_emails, ARRAY[]::text[])) AS x
      WHERE x IS NOT NULL AND btrim(x) <> ''
    ),
    stats AS (
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')::int AS invalid_c,
        (COUNT(*) FILTER (WHERE e ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')
          - COUNT(DISTINCT e) FILTER (WHERE e ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'))::int AS dup_c,
        COUNT(DISTINCT e) FILTER (WHERE e ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')::int AS pre_supp
      FROM src
    )
    SELECT total, invalid_c, dup_c, pre_supp
      INTO v_input_count, v_invalid_count, v_duplicate_count, v_pre_supp_count
      FROM stats;
  END IF;

  -- Eligible count: run canonical resolver
  SELECT COUNT(*)::int INTO v_eligible_count
    FROM public.resolve_email_recipient_candidates(
      p_scope, p_organization_id, p_source, p_manual_emails
    );

  IF p_source = 'manual' THEN
    v_suppressed_count := GREATEST(v_pre_supp_count - v_eligible_count, 0);
  ELSE
    -- For auto sources we don't expose raw totals; report only aggregates
    v_input_count := v_eligible_count;
    v_suppressed_count := 0;
    v_invalid_count := 0;
    v_duplicate_count := 0;
  END IF;

  RETURN jsonb_build_object(
    'input_count', v_input_count,
    'invalid_count', v_invalid_count,
    'duplicate_count', v_duplicate_count,
    'suppressed_count', v_suppressed_count,
    'eligible_count', v_eligible_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_campaign_recipient_preview(text, uuid, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_campaign_recipient_preview(text, uuid, text, text[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4) Uniqueness on (campaign_id, email)
--    Verified 0 dupes in read-only diagnostic before this migration.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS email_campaign_recipients_campaign_email_uk
  ON public.email_campaign_recipients (campaign_id, email);
