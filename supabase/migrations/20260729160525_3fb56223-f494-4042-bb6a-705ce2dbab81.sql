-- 5C.1.b.1 — corrective additive migration
-- Introduces a raw-candidates helper (single source of source-rules)
-- and rebuilds resolve_email_recipient_candidates + get_campaign_recipient_preview on top of it.

-- ---------------------------------------------------------------------
-- 1) Raw candidates helper: emits raw (email, name) BEFORE
--    valid/dedup/suppression filtering. NOT callable from browser.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_email_recipient_raw_candidates(
  p_scope text,
  p_organization_id uuid,
  p_source text,
  p_manual_emails text[]
)
RETURNS TABLE(email_raw text, name_raw text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
    -- Limit checked on the RAW input array, BEFORE dedup.
    IF array_length(p_manual_emails, 1) > 10000 THEN
      RAISE EXCEPTION 'manual_emails exceeds server limit of 10000 addresses'
        USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_source IN ('students','companies') AND p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id required for org sources' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT p.email::text, p.full_name::text
    FROM public.profiles p
   WHERE p_source = 'students'
     AND p.organization_id = p_organization_id
     AND p.archived_at IS NULL
     AND p.email IS NOT NULL AND btrim(p.email) <> ''
     AND public.is_student_profile(p.user_id, p_organization_id) = true
  UNION ALL
  SELECT c.email::text, c.name::text
    FROM public.companies c
   WHERE p_source = 'companies'
     AND c.organization_id = p_organization_id
     AND c.email IS NOT NULL AND btrim(c.email) <> ''
  UNION ALL
  SELECT o.email::text, o.name::text
    FROM public.organizations o
   WHERE p_source = 'organizations'
     AND o.email IS NOT NULL AND btrim(o.email) <> ''
  UNION ALL
  SELECT s.email::text, s.name::text
    FROM public.sales_companies_db s
   WHERE p_source = 'companies_db'
     AND s.email IS NOT NULL AND btrim(s.email) <> ''
  UNION ALL
  SELECT x::text, NULL::text
    FROM unnest(COALESCE(p_manual_emails, ARRAY[]::text[])) AS x
   WHERE p_source = 'manual'
     AND x IS NOT NULL
     AND btrim(x) <> '';
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_email_recipient_raw_candidates(text, uuid, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_email_recipient_raw_candidates(text, uuid, text, text[]) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_email_recipient_raw_candidates(text, uuid, text, text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_email_recipient_raw_candidates(text, uuid, text, text[]) TO service_role;

-- ---------------------------------------------------------------------
-- 2) Canonical resolver rebuilt on top of the raw helper.
--    Same signature/return as 5C.1.b; no duplicated source rules.
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
  v_scope_key := CASE WHEN p_scope = 'platform' THEN 'platform'
                      ELSE COALESCE(p_organization_id::text, 'platform') END;

  RETURN QUERY
  WITH raw AS (
    SELECT lower(btrim(email_raw))::text AS email_norm,
           NULLIF(btrim(name_raw), '')::text AS name_norm
      FROM public.resolve_email_recipient_raw_candidates(
        p_scope, p_organization_id, p_source, p_manual_emails
      )
  ),
  valid AS (
    SELECT email_norm, name_norm
      FROM raw
     WHERE email_norm ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
  ),
  dedup AS (
    SELECT DISTINCT ON (email_norm) email_norm, name_norm
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

REVOKE ALL ON FUNCTION public.resolve_email_recipient_candidates(text, uuid, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_email_recipient_candidates(text, uuid, text, text[]) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_email_recipient_candidates(text, uuid, text, text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_email_recipient_candidates(text, uuid, text, text[]) TO service_role;

-- ---------------------------------------------------------------------
-- 3) Preview RPC: real invalid/duplicate/suppressed/eligible counts
--    for ALL sources, computed from the raw helper. Aggregates only
--    are returned to the browser — no email/name leakage.
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
  v_input_count int := 0;
  v_invalid_count int := 0;
  v_duplicate_count int := 0;
  v_pre_supp_count int := 0;
  v_suppressed_count int := 0;
  v_eligible_count int := 0;
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

  IF p_source = 'manual'
     AND p_manual_emails IS NOT NULL
     AND array_length(p_manual_emails, 1) > 10000 THEN
    RAISE EXCEPTION 'manual_emails exceeds server limit of 10000 addresses'
      USING ERRCODE = '22023';
  END IF;

  -- Real stats computed from the raw helper for ALL sources.
  WITH raw AS (
    SELECT lower(btrim(email_raw)) AS e
      FROM public.resolve_email_recipient_raw_candidates(
        p_scope, p_organization_id, p_source, p_manual_emails
      )
     WHERE email_raw IS NOT NULL AND btrim(email_raw) <> ''
  ),
  stats AS (
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE e !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')::int AS invalid_c,
      (COUNT(*) FILTER (WHERE e ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')
        - COUNT(DISTINCT e) FILTER (WHERE e ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'))::int AS dup_c,
      COUNT(DISTINCT e) FILTER (WHERE e ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')::int AS pre_supp
    FROM raw
  )
  SELECT total, invalid_c, dup_c, pre_supp
    INTO v_input_count, v_invalid_count, v_duplicate_count, v_pre_supp_count
    FROM stats;

  SELECT COUNT(*)::int INTO v_eligible_count
    FROM public.resolve_email_recipient_candidates(
      p_scope, p_organization_id, p_source, p_manual_emails
    );

  v_suppressed_count := GREATEST(v_pre_supp_count - v_eligible_count, 0);

  RETURN jsonb_build_object(
    'input_count', v_input_count,
    'invalid_count', v_invalid_count,
    'duplicate_count', v_duplicate_count,
    'suppressed_count', v_suppressed_count,
    'eligible_count', v_eligible_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_campaign_recipient_preview(text, uuid, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_campaign_recipient_preview(text, uuid, text, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_campaign_recipient_preview(text, uuid, text, text[]) TO authenticated, service_role;