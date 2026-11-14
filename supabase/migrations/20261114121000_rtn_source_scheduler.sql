-- Provider-owned atomic payload: RTN scheduling is configured ONLY through
-- supabase--create_http_schedule after the managed cron_auth helper is ready.
-- Declarative desired state lives beside rtn-source-cron/schedule.json.
-- This preflight does not create/rotate a Vault secret, hand-author an HTTP
-- cron command, alter an old schedule, or grant any browser cron authority.
DO $ready$ BEGIN
 IF to_regprocedure('public.enqueue_due_rtn_checks()') IS NULL
  OR to_regprocedure('public.claim_rtn_check(uuid)') IS NULL
  OR to_regprocedure('public.complete_rtn_check(uuid,uuid,jsonb)') IS NULL
  OR NOT EXISTS(SELECT 1 FROM rtn_private.rollout_state WHERE id=1 AND quota_integration_ready AND privacy_integration_ready)
  OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='rtn_private' AND table_name='key_sets' AND column_name='editorial_review_before')
 THEN RAISE EXCEPTION 'RTN_MANAGED_SCHEDULER_REQUIRES_COMPLETE_REVIEWED_SCHEMA';END IF;
END;$ready$;
