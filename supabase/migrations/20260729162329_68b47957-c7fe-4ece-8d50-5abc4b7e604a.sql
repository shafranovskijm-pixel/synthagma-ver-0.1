
-- ============================================================
-- Phase 5C.1.c — additive base migration
-- ============================================================

-- pgcrypto for digest() sha256 (usually enabled, ensure)
-- pgcrypto lives in the `extensions` schema on Supabase; qualify all digest() calls.

-- ============================================================
-- B. org_smtp_settings — provider_daily_limit + safe_warmup_enabled
-- ============================================================
-- Bring any legacy >50 values down to 50 BEFORE adding the CHECK.
UPDATE public.org_smtp_settings
   SET provider_daily_limit = 50
 WHERE provider_daily_limit > 50;

-- Diagnostic: fail loudly if any <=0 exists (per spec: don't silently fix).
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad FROM public.org_smtp_settings WHERE provider_daily_limit <= 0;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Found % rows with provider_daily_limit <= 0 — resolve manually before migration', v_bad;
  END IF;
END $$;

ALTER TABLE public.org_smtp_settings
  ALTER COLUMN provider_daily_limit SET DEFAULT 50;

ALTER TABLE public.org_smtp_settings
  DROP CONSTRAINT IF EXISTS org_smtp_provider_daily_limit_range;
ALTER TABLE public.org_smtp_settings
  ADD CONSTRAINT org_smtp_provider_daily_limit_range
  CHECK (provider_daily_limit BETWEEN 1 AND 50);

ALTER TABLE public.org_smtp_settings
  ADD COLUMN IF NOT EXISTS safe_warmup_enabled boolean NOT NULL DEFAULT true;

-- ============================================================
-- C. Internal sender key helper (SECURITY DEFINER, service_role only)
-- ============================================================
-- Returns 'sender:<sha256hex>' from lower(trim(from_email)).
-- Client never sees the raw email nor sets the key.
CREATE OR REPLACE FUNCTION public._org_email_sender_key(_organization_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'sender:' || encode(extensions.digest(lower(trim(from_email))::bytea, 'sha256'::text), 'hex')
    FROM public.org_smtp_settings
   WHERE organization_id = _organization_id
     AND from_email IS NOT NULL
     AND trim(from_email) <> ''
$$;

REVOKE ALL ON FUNCTION public._org_email_sender_key(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._org_email_sender_key(uuid) TO service_role;

-- ============================================================
-- D. Warmup ladder helper for org (separate from platform _email_daily_limit)
-- ============================================================
CREATE OR REPLACE FUNCTION public._org_email_warmup_limit(_day integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _day <= 1 THEN 10
    WHEN _day = 2 THEN 20
    WHEN _day = 3 THEN 30
    WHEN _day = 4 THEN 40
    ELSE 50
  END;
$$;

REVOKE ALL ON FUNCTION public._org_email_warmup_limit(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._org_email_warmup_limit(integer) TO service_role;

-- ============================================================
-- E. Atomic claim RPC — service_role only
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_org_email_quota(
  p_organization_id uuid,
  p_count integer,
  p_message_kind text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_from text;
  v_provider_limit int;
  v_warmup_enabled boolean;
  v_sender text;
  v_lock_key bigint;
  v_today date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_state RECORD;
  v_day int;
  v_hard_cap int;
  v_warmup_limit int;
  v_effective int;
  v_sent_today int;
  v_started date;
BEGIN
  -- Guard: must be called with service_role JWT
  v_role := current_setting('request.jwt.claim.role', true);
  IF v_role IS NULL OR v_role <> 'service_role' THEN
    RAISE EXCEPTION 'Only service_role may call claim_org_email_quota' USING ERRCODE = '42501';
  END IF;

  IF p_count IS NULL OR p_count <= 0 THEN
    RAISE EXCEPTION 'p_count must be > 0' USING ERRCODE = '22023';
  END IF;
  IF p_message_kind NOT IN ('marketing','transactional') THEN
    RAISE EXCEPTION 'Unknown message_kind: %', p_message_kind USING ERRCODE = '22023';
  END IF;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'p_organization_id required' USING ERRCODE = '22023';
  END IF;

  SELECT from_email, provider_daily_limit, safe_warmup_enabled
    INTO v_from, v_provider_limit, v_warmup_enabled
    FROM public.org_smtp_settings
   WHERE organization_id = p_organization_id;

  IF v_from IS NULL OR trim(v_from) = '' THEN
    RAISE EXCEPTION 'SMTP is not configured for organization' USING ERRCODE = '42704';
  END IF;

  v_sender := 'sender:' || encode(extensions.digest(lower(trim(v_from))::bytea, 'sha256'::text), 'hex');
  -- Advisory lock keyed by sender hash — serializes claim across concurrent txns.
  v_lock_key := ('x' || substr(md5(v_sender), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  INSERT INTO public.email_warmup_state(scope_key, started_at, sent_today, sent_today_date, total_sent)
  VALUES (v_sender, v_today, 0, v_today, 0)
  ON CONFLICT (scope_key) DO NOTHING;

  SELECT * INTO v_state FROM public.email_warmup_state
   WHERE scope_key = v_sender FOR UPDATE;

  v_started := v_state.started_at;
  v_day := (v_today - v_started)::int + 1;
  IF v_day < 1 THEN v_day := 1; END IF;

  v_hard_cap := LEAST(COALESCE(v_provider_limit, 50), 50);
  v_warmup_limit := public._org_email_warmup_limit(v_day);

  IF p_message_kind = 'transactional' THEN
    v_effective := v_hard_cap;                              -- transactional bypasses warmup, but NOT 50
  ELSIF v_warmup_enabled THEN
    v_effective := LEAST(v_hard_cap, v_warmup_limit);       -- marketing + warmup
  ELSE
    v_effective := v_hard_cap;                              -- marketing, warmup off
  END IF;

  IF v_state.sent_today_date <> v_today THEN
    v_sent_today := 0;
  ELSE
    v_sent_today := v_state.sent_today;
  END IF;

  -- all-or-nothing (partial granted_count arrives in 5C.1.d)
  IF v_sent_today + p_count > v_effective THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'day', v_day,
      'warmup_enabled', v_warmup_enabled,
      'provider_daily_limit', v_provider_limit,
      'effective_daily_limit', v_effective,
      'sent_today', v_sent_today,
      'remaining', GREATEST(v_effective - v_sent_today, 0),
      'requested', p_count,
      'message_kind', p_message_kind
    );
  END IF;

  UPDATE public.email_warmup_state
     SET sent_today = v_sent_today + p_count,
         sent_today_date = v_today,
         total_sent = v_state.total_sent + p_count,
         updated_at = now()
   WHERE scope_key = v_sender;

  RETURN jsonb_build_object(
    'allowed', true,
    'day', v_day,
    'warmup_enabled', v_warmup_enabled,
    'provider_daily_limit', v_provider_limit,
    'effective_daily_limit', v_effective,
    'sent_today', v_sent_today + p_count,
    'remaining', GREATEST(v_effective - (v_sent_today + p_count), 0),
    'requested', p_count,
    'message_kind', p_message_kind
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_org_email_quota(uuid,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_org_email_quota(uuid,integer,text) TO service_role;

-- ============================================================
-- F. Idempotent state migration from old scope_keys → hashed sender key
-- ============================================================
DO $$
DECLARE
  r RECORD;
  v_sender text;
  v_min_start date;
  v_sum_total int;
  v_sum_today int;
  v_today date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_existing RECORD;
BEGIN
  FOR r IN SELECT organization_id, from_email FROM public.org_smtp_settings
           WHERE from_email IS NOT NULL AND trim(from_email) <> ''
  LOOP
    v_sender := 'sender:' || encode(extensions.digest(lower(trim(r.from_email))::bytea, 'sha256'::text), 'hex');

    SELECT MIN(started_at),
           COALESCE(SUM(total_sent), 0),
           COALESCE(SUM(CASE WHEN sent_today_date = v_today THEN sent_today ELSE 0 END), 0)
      INTO v_min_start, v_sum_total, v_sum_today
      FROM public.email_warmup_state
     WHERE scope_key IN (r.organization_id::text, 'org:' || r.organization_id::text);

    IF v_min_start IS NULL THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_existing FROM public.email_warmup_state WHERE scope_key = v_sender;
    IF v_existing.scope_key IS NULL THEN
      INSERT INTO public.email_warmup_state(scope_key, started_at, sent_today, sent_today_date, total_sent)
      VALUES (v_sender, v_min_start, v_sum_today, v_today, v_sum_total);
    ELSE
      -- Idempotent: take min(started_at), max(total_sent), max(sent_today for today).
      UPDATE public.email_warmup_state
         SET started_at = LEAST(v_existing.started_at, v_min_start),
             total_sent = GREATEST(v_existing.total_sent, v_sum_total),
             sent_today = CASE
                            WHEN v_existing.sent_today_date = v_today
                              THEN GREATEST(v_existing.sent_today, v_sum_today)
                            ELSE v_sum_today
                          END,
             sent_today_date = v_today,
             updated_at = now()
       WHERE scope_key = v_sender;
    END IF;

    -- Old rows kept intact for audit; not deleted.
  END LOOP;
END $$;

-- ============================================================
-- H. Safe status RPC for org UI
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_org_email_delivery_status(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from text;
  v_provider_limit int;
  v_warmup_enabled boolean;
  v_sender text;
  v_today date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_state RECORD;
  v_day int := 1;
  v_hard_cap int;
  v_warmup_limit int;
  v_effective int;
  v_sent_today int := 0;
  v_started date;
  v_total int := 0;
  v_is_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  v_is_admin := public.has_role(auth.uid(), 'admin'::public.app_role);
  IF NOT v_is_admin
     AND NOT public.can_access_organization(p_organization_id, 'sales.read') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT from_email, provider_daily_limit, safe_warmup_enabled
    INTO v_from, v_provider_limit, v_warmup_enabled
    FROM public.org_smtp_settings
   WHERE organization_id = p_organization_id;

  IF v_from IS NULL OR trim(v_from) = '' THEN
    RETURN jsonb_build_object('configured', false);
  END IF;

  v_sender := 'sender:' || encode(extensions.digest(lower(trim(v_from))::bytea, 'sha256'::text), 'hex');
  SELECT * INTO v_state FROM public.email_warmup_state WHERE scope_key = v_sender;

  IF v_state.scope_key IS NOT NULL THEN
    v_started := v_state.started_at;
    v_day := (v_today - v_started)::int + 1;
    IF v_day < 1 THEN v_day := 1; END IF;
    v_sent_today := CASE WHEN v_state.sent_today_date = v_today THEN v_state.sent_today ELSE 0 END;
    v_total := v_state.total_sent;
  ELSE
    v_started := v_today;
    v_day := 1;
  END IF;

  v_hard_cap := LEAST(COALESCE(v_provider_limit, 50), 50);
  v_warmup_limit := public._org_email_warmup_limit(v_day);
  IF v_warmup_enabled THEN
    v_effective := LEAST(v_hard_cap, v_warmup_limit);
  ELSE
    v_effective := v_hard_cap;
  END IF;

  RETURN jsonb_build_object(
    'configured', true,
    'day', v_day,
    'safe_warmup_enabled', v_warmup_enabled,
    'provider_daily_limit', v_provider_limit,
    'effective_daily_limit', v_effective,
    'sent_today', v_sent_today,
    'remaining', GREATEST(v_effective - v_sent_today, 0),
    'total_sent', v_total,
    'started_at', v_started
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_org_email_delivery_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_org_email_delivery_status(uuid) TO authenticated, service_role;
