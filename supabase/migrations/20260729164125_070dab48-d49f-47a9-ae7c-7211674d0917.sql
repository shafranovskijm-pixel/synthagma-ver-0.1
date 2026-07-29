-- Phase 5C.1.c.1 — corrective legacy quota merge (additive, idempotent).
-- Rebuilds the migration performed in 20260729162329 so that when several
-- organizations share the same normalized from_email, all their legacy
-- scope_key totals are aggregated into one hashed sender-state row before
-- being merged, instead of overwriting one another via GREATEST.

CREATE OR REPLACE FUNCTION public._phase_5c1c1_merge_legacy_quotas()
RETURNS TABLE(sender_hash text, org_count int, legacy_total int, legacy_today int, final_total int, final_today int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r RECORD;
  v_today date := (now() AT TIME ZONE 'Europe/Moscow')::date;
  v_existing RECORD;
  v_new_started date;
  v_new_total int;
  v_new_today int;
BEGIN
  FOR r IN
    WITH normalized AS (
      SELECT organization_id,
             lower(trim(from_email)) AS norm_from
        FROM public.org_smtp_settings
       WHERE from_email IS NOT NULL AND trim(from_email) <> ''
    ),
    grouped AS (
      SELECT norm_from,
             array_agg(DISTINCT organization_id::text) AS org_ids,
             count(DISTINCT organization_id)::int      AS orgcnt
        FROM normalized
       GROUP BY norm_from
    )
    SELECT norm_from,
           org_ids,
           orgcnt,
           'sender:' || encode(extensions.digest(norm_from::bytea, 'sha256'::text), 'hex') AS sender
      FROM grouped
  LOOP
    -- Collect DISTINCT legacy scope_keys for all orgs sharing this sender.
    WITH legacy_keys AS (
      SELECT DISTINCT unnest(
               (SELECT array_agg(k) FROM (
                  SELECT oid AS k FROM unnest(r.org_ids) oid
                  UNION ALL
                  SELECT 'org:' || oid FROM unnest(r.org_ids) oid
               ) s)
             ) AS scope_key
    ),
    legacy_agg AS (
      SELECT MIN(w.started_at)                                                    AS min_started,
             COALESCE(SUM(w.total_sent), 0)::int                                  AS legacy_total,
             COALESCE(SUM(CASE WHEN w.sent_today_date = v_today
                               THEN w.sent_today ELSE 0 END), 0)::int             AS legacy_today
        FROM public.email_warmup_state w
        JOIN legacy_keys lk ON lk.scope_key = w.scope_key
    )
    SELECT min_started, legacy_total, legacy_today
      INTO v_new_started, v_new_total, v_new_today
      FROM legacy_agg;

    IF v_new_started IS NULL THEN
      -- No legacy state for this sender across any of its orgs.
      sender_hash := r.sender;
      org_count := r.orgcnt;
      legacy_total := 0;
      legacy_today := 0;
      SELECT total_sent,
             CASE WHEN sent_today_date = v_today THEN sent_today ELSE 0 END
        INTO final_total, final_today
        FROM public.email_warmup_state WHERE scope_key = r.sender;
      final_total := COALESCE(final_total, 0);
      final_today := COALESCE(final_today, 0);
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Advisory lock to serialize with concurrent claim_org_email_quota.
    PERFORM pg_advisory_xact_lock(
      ('x' || substr(md5(r.sender), 1, 16))::bit(64)::bigint
    );

    SELECT * INTO v_existing FROM public.email_warmup_state WHERE scope_key = r.sender FOR UPDATE;

    IF v_existing.scope_key IS NULL THEN
      INSERT INTO public.email_warmup_state(scope_key, started_at, sent_today, sent_today_date, total_sent)
      VALUES (r.sender, v_new_started, v_new_today, v_today, v_new_total);
    ELSE
      -- Idempotent merge: never shrink existing counters.
      UPDATE public.email_warmup_state
         SET started_at      = LEAST(v_existing.started_at, v_new_started),
             total_sent      = GREATEST(v_existing.total_sent, v_new_total),
             sent_today      = CASE
                                 WHEN v_existing.sent_today_date = v_today
                                   THEN GREATEST(v_existing.sent_today, v_new_today)
                                 ELSE v_new_today
                               END,
             sent_today_date = v_today,
             updated_at      = now()
       WHERE scope_key = r.sender;
    END IF;

    SELECT total_sent,
           CASE WHEN sent_today_date = v_today THEN sent_today ELSE 0 END
      INTO final_total, final_today
      FROM public.email_warmup_state WHERE scope_key = r.sender;

    sender_hash  := r.sender;
    org_count    := r.orgcnt;
    legacy_total := v_new_total;
    legacy_today := v_new_today;
    RETURN NEXT;
  END LOOP;
END;
$fn$;

REVOKE ALL ON FUNCTION public._phase_5c1c1_merge_legacy_quotas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._phase_5c1c1_merge_legacy_quotas() TO service_role;

-- Run merge and assert monotonicity (hashed state never below aggregated legacy).
DO $$
DECLARE
  row RECORD;
BEGIN
  FOR row IN SELECT * FROM public._phase_5c1c1_merge_legacy_quotas() LOOP
    IF row.final_total < row.legacy_total THEN
      RAISE EXCEPTION
        'Phase 5C.1.c.1: total_sent regressed for sender % (final=%, legacy=%)',
        row.sender_hash, row.final_total, row.legacy_total;
    END IF;
    IF row.final_today < row.legacy_today THEN
      RAISE EXCEPTION
        'Phase 5C.1.c.1: sent_today regressed for sender % (final=%, legacy=%)',
        row.sender_hash, row.final_today, row.legacy_today;
    END IF;
    RAISE NOTICE 'Phase 5C.1.c.1 merge sender=% orgs=% legacy_total=% legacy_today=% final_total=% final_today=%',
      row.sender_hash, row.org_count, row.legacy_total, row.legacy_today, row.final_total, row.final_today;
  END LOOP;
END $$;
