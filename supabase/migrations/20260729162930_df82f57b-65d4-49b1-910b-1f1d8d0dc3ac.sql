
-- ============================================================
-- Phase 5C.1.c — cleanup migration (Section G)
-- Frontend org-scope UI now uses get_org_email_delivery_status and
-- backend org sends use claim_org_email_quota, so the legacy
-- consume_email_quota is no longer reachable from org paths.
-- ============================================================

-- Re-create consume_email_quota with an internal service_role guard
-- (defence in depth on top of the revoked grants below).
CREATE OR REPLACE FUNCTION public.consume_email_quota(p_scope_key text, p_count integer, p_skip_warmup boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_state RECORD;
  v_today date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_day int;
  v_limit int;
  v_sent_today int;
  v_started date;
  v_total int;
  v_role text;
BEGIN
  -- Phase 5C.1.c: only service_role may call this. Even if grants leak,
  -- the JWT role check aborts the mutation.
  v_role := current_setting('request.jwt.claim.role', true);
  IF v_role IS NULL OR v_role <> 'service_role' THEN
    RAISE EXCEPTION 'Only service_role may call consume_email_quota' USING ERRCODE = '42501';
  END IF;

  IF p_count <= 0 THEN
    RAISE EXCEPTION 'Count must be > 0';
  END IF;

  INSERT INTO public.email_warmup_state(scope_key, started_at, sent_today, sent_today_date, total_sent)
  VALUES (p_scope_key, v_today, 0, v_today, 0)
  ON CONFLICT (scope_key) DO NOTHING;

  SELECT * INTO v_state FROM public.email_warmup_state
  WHERE scope_key = p_scope_key FOR UPDATE;

  v_started := v_state.started_at;
  v_day := (v_today - v_started)::int + 1;
  IF v_day < 1 THEN v_day := 1; END IF;
  v_limit := _email_daily_limit(v_day);

  IF v_state.sent_today_date <> v_today THEN
    v_sent_today := 0;
  ELSE
    v_sent_today := v_state.sent_today;
  END IF;

  IF NOT p_skip_warmup AND (v_sent_today + p_count > v_limit) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'day', v_day,
      'daily_limit', v_limit,
      'sent_today', v_sent_today,
      'remaining', GREATEST(v_limit - v_sent_today, 0),
      'requested', p_count,
      'skip_warmup', false
    );
  END IF;

  v_total := v_state.total_sent + p_count;

  UPDATE public.email_warmup_state
  SET sent_today = v_sent_today + p_count,
      sent_today_date = v_today,
      total_sent = v_total,
      updated_at = now()
  WHERE scope_key = p_scope_key;

  RETURN jsonb_build_object(
    'allowed', true,
    'day', v_day,
    'daily_limit', v_limit,
    'sent_today', v_sent_today + p_count,
    'remaining', GREATEST(v_limit - (v_sent_today + p_count), 0),
    'consumed', p_count,
    'total_sent', v_total,
    'skip_warmup', p_skip_warmup
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_email_quota(text, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_email_quota(text, integer, boolean) TO service_role;

-- get_warmup_status: internal check already restricts to admin/own-org.
-- Since org UI no longer calls it (we routed to get_org_email_delivery_status),
-- we can safely tighten grants: keep authenticated (admins still call it for
-- 'platform' warmup badge) and drop anon.
REVOKE EXECUTE ON FUNCTION public.get_warmup_status(text) FROM anon;
