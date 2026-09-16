-- S-011: ordinary (non mailing_send_jobs) runs and SMTP attempts.
-- No lease expiry, stale takeover, attempt reset, SMTP call, quota mutation or cron.
-- A lost/ambiguous attempt is deliberately a manual-reconciliation condition.

CREATE TABLE public.ordinary_campaign_runs (
  run_token uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('running', 'finished', 'uncertain')),
  initial_status text NOT NULL,
  initial_started_at timestamptz,
  snapshot_updated_at timestamptz,
  requested_by uuid,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  outcome text,
  reason text
);
CREATE UNIQUE INDEX ordinary_campaign_one_active_run
  ON public.ordinary_campaign_runs(campaign_id)
  WHERE state IN ('running', 'uncertain');

CREATE TABLE public.ordinary_campaign_attempts (
  attempt_token uuid PRIMARY KEY,
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE RESTRICT,
  recipient_id uuid NOT NULL REFERENCES public.email_campaign_recipients(id) ON DELETE RESTRICT,
  run_token uuid NOT NULL REFERENCES public.ordinary_campaign_runs(run_token) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('claimed', 'dispatching', 'sent', 'failed', 'uncertain')),
  smtp_message_id text,
  error_category text,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  dispatching_at timestamptz,
  finished_at timestamptz,
  UNIQUE (campaign_id, recipient_id),
  CHECK (smtp_message_id IS NULL OR
    (length(smtp_message_id) BETWEEN 3 AND 512 AND smtp_message_id !~ E'[\r\n]'))
);
CREATE INDEX ordinary_campaign_attempts_run ON public.ordinary_campaign_attempts(run_token);
ALTER TABLE public.ordinary_campaign_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordinary_campaign_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ordinary_campaign_runs, public.ordinary_campaign_attempts
  FROM PUBLIC, anon, authenticated;
-- Service callers read ledgers, but may mutate them only through the owner RPCs.
REVOKE ALL ON public.ordinary_campaign_runs, public.ordinary_campaign_attempts FROM service_role;
GRANT SELECT ON public.ordinary_campaign_runs, public.ordinary_campaign_attempts TO service_role;

CREATE FUNCTION public.guard_ordinary_campaign_configuration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_run uuid;
BEGIN
  SELECT run_token INTO v_run FROM public.ordinary_campaign_runs
  WHERE campaign_id = OLD.id AND state IN ('running', 'uncertain');
  IF v_run IS NULL THEN RETURN NEW; END IF;
  -- Freeze all configured content/audience/sender/consent, including future columns.
  IF (to_jsonb(NEW) - ARRAY['status','started_at','completed_at','updated_at',
       'total_recipients','sent_count','failed_count','open_count','click_count',
       'unsubscribe_count','user_paused','paused_reason','ab_sample_started_at'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','started_at','completed_at','updated_at',
       'total_recipients','sent_count','failed_count','open_count','click_count',
       'unsubscribe_count','user_paused','paused_reason','ab_sample_started_at']) THEN
    RAISE EXCEPTION 'ordinary_campaign_configuration_locked' USING ERRCODE = '55000';
  END IF;
  IF (NEW.status IS DISTINCT FROM OLD.status OR
      NEW.paused_reason IS DISTINCT FROM OLD.paused_reason OR
      (OLD.user_paused AND NOT NEW.user_paused))
     AND current_setting('app.ordinary_campaign_run_token', true) IS DISTINCT FROM v_run::text THEN
    RAISE EXCEPTION 'ordinary_campaign_status_owned_by_run' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_ordinary_campaign_configuration() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER ordinary_campaign_configuration_guard
BEFORE UPDATE ON public.email_campaigns
FOR EACH ROW EXECUTE FUNCTION public.guard_ordinary_campaign_configuration();

CREATE FUNCTION public.guard_ordinary_recipient_configuration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_campaign uuid; v_owned boolean;
BEGIN
  IF TG_OP='UPDATE' AND NEW.campaign_id IS DISTINCT FROM OLD.campaign_id THEN
    RAISE EXCEPTION 'ordinary_recipient_campaign_immutable' USING ERRCODE='55000';
  END IF;
  v_campaign := CASE WHEN TG_OP = 'INSERT' THEN NEW.campaign_id ELSE OLD.campaign_id END;
  -- Same lock order as owner RPCs: campaign, run, recipient, attempt.
  PERFORM 1 FROM public.email_campaigns WHERE id = v_campaign FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.ordinary_campaign_runs
    WHERE campaign_id = v_campaign AND state IN ('running', 'uncertain')) THEN
    IF TG_OP = 'DELETE' OR (TG_OP = 'INSERT' AND auth.role() IS DISTINCT FROM 'service_role') THEN
      RAISE EXCEPTION 'ordinary_recipient_configuration_locked' USING ERRCODE = '55000';
    END IF;
    IF TG_OP = 'UPDATE' AND
      (to_jsonb(NEW) - ARRAY['status','error','sent_at','opened_at']) IS DISTINCT FROM
      (to_jsonb(OLD) - ARRAY['status','error','sent_at','opened_at']) THEN
      RAISE EXCEPTION 'ordinary_recipient_configuration_locked' USING ERRCODE = '55000';
    END IF;
    IF TG_OP='UPDATE' AND (NEW.status IS DISTINCT FROM OLD.status OR
        NEW.error IS DISTINCT FROM OLD.error OR NEW.sent_at IS DISTINCT FROM OLD.sent_at) THEN
      -- Only a narrow open-tracking update bypasses the SMTP-attempt owner.
      IF NOT (OLD.status='sent' AND NEW.status='opened' AND
          NEW.error IS NOT DISTINCT FROM OLD.error AND NEW.sent_at IS NOT DISTINCT FROM OLD.sent_at) THEN
        SELECT EXISTS(SELECT 1 FROM public.ordinary_campaign_attempts a
          JOIN public.ordinary_campaign_runs r ON r.run_token=a.run_token
          WHERE a.campaign_id=v_campaign AND a.recipient_id=OLD.id
            AND a.attempt_token::text=current_setting('app.ordinary_campaign_attempt_token',true)
            AND r.state IN ('running','uncertain')
            AND auth.role()='service_role') INTO v_owned;
        IF NOT v_owned THEN
          RAISE EXCEPTION 'ordinary_recipient_status_owned_by_attempt' USING ERRCODE='55000';
        END IF;
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_ordinary_recipient_configuration() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER ordinary_recipient_configuration_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.email_campaign_recipients
FOR EACH ROW EXECUTE FUNCTION public.guard_ordinary_recipient_configuration();

CREATE FUNCTION public.claim_ordinary_campaign_run(
  p_campaign_id uuid,
  p_token uuid,
  p_expected_updated_at timestamptz DEFAULT NULL,
  p_is_service_role boolean DEFAULT false,
  p_consent_confirmed boolean DEFAULT false,
  p_requested_by uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c public.email_campaigns; v_existing public.ordinary_campaign_runs; v_consent_at timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_token IS NULL OR p_campaign_id IS NULL THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'invalid_request');
  END IF;
  SELECT * INTO v_c FROM public.email_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('claimed', false, 'reason', 'campaign_not_found'); END IF;
  SELECT * INTO v_existing FROM public.ordinary_campaign_runs
    WHERE campaign_id = p_campaign_id AND state IN ('running', 'uncertain');
  IF FOUND THEN RETURN jsonb_build_object('claimed', false, 'reason',
    CASE WHEN v_existing.state = 'uncertain' THEN 'manual_reconciliation_required' ELSE 'already_running' END);
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_c.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'campaign_changed');
  END IF;
  IF v_c.delivery_mode = 'fast_2_day' OR EXISTS
    (SELECT 1 FROM public.mailing_send_jobs WHERE campaign_id = p_campaign_id) THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'managed_by_mailing_send_jobs');
  END IF;
  IF v_c.status NOT IN ('draft','scheduled','paused','failed') THEN
    RETURN jsonb_build_object('claimed', false, 'reason',
      CASE WHEN v_c.status = 'sending' THEN 'unowned_sending_requires_review' ELSE 'campaign_not_startable' END);
  END IF;
  IF v_c.scheduled_at > now() AND v_c.status = 'scheduled' THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'scheduled_in_future');
  END IF;
  IF coalesce(p_is_service_role, false) AND coalesce(v_c.user_paused, false) THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'user_paused');
  END IF;
  IF v_c.paused_reason IS NOT NULL AND v_c.paused_reason NOT IN ('quota', 'daily_quota', 'user_paused','ordinary_ab_wait') THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'manual_reconciliation_required');
  END IF;
  IF v_c.paused_reason='ordinary_ab_wait' AND v_c.ab_winner IS NULL THEN
    RETURN jsonb_build_object('claimed',false,'reason','ab_wait_until_winner');
  END IF;
  IF EXISTS (SELECT 1 FROM public.ordinary_campaign_attempts
    WHERE campaign_id = p_campaign_id AND state IN ('claimed','dispatching','uncertain')) THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'unresolved_attempt');
  END IF;
  IF EXISTS (SELECT 1 FROM public.ordinary_campaign_runs WHERE run_token = p_token) THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'run_token_reused');
  END IF;
  IF coalesce(v_c.campaign_mode, '') = 'cold_outreach' THEN
    IF v_c.operator_attested_at IS NULL THEN
      RETURN jsonb_build_object('claimed', false, 'reason', 'operator_attestation_required');
    END IF;
  ELSIF coalesce(p_is_service_role, false) OR v_c.status = 'paused' THEN
    IF v_c.consent_confirmed_at IS NULL OR v_c.recipient_filter->>'draft_consent_confirmed' = 'false' THEN
      RETURN jsonb_build_object('claimed', false, 'reason', 'consent_required');
    END IF;
  ELSE
    IF p_consent_confirmed IS DISTINCT FROM true OR p_requested_by IS NULL THEN
      RETURN jsonb_build_object('claimed', false, 'reason', 'consent_required');
    END IF;
    -- Caller authentication/authorization happens in the service-only Edge runner;
    -- p_is_service_role describes that already-authenticated caller, not DB privilege.
    SELECT public.confirm_campaign_send_consent_admin(p_campaign_id, p_requested_by, 'launch') INTO v_consent_at;
    UPDATE public.email_campaigns SET recipient_filter=jsonb_set(
      coalesce(recipient_filter,'{}'::jsonb),'{draft_consent_confirmed}','true'::jsonb,true)
      WHERE id=p_campaign_id;
  END IF;
  INSERT INTO public.ordinary_campaign_runs(run_token,campaign_id,state,initial_status,
    initial_started_at,snapshot_updated_at,requested_by)
  VALUES(p_token,p_campaign_id,'running',v_c.status,v_c.started_at,v_c.updated_at,p_requested_by);
  PERFORM set_config('app.ordinary_campaign_run_token', p_token::text, true);
  UPDATE public.email_campaigns SET status='sending', user_paused=false, paused_reason=NULL,
    started_at=coalesce(started_at,now()), completed_at=NULL WHERE id=p_campaign_id;
  RETURN jsonb_build_object('claimed',true,'reason','claimed','run_token',p_token);
END;
$$;

CREATE FUNCTION public.claim_ordinary_campaign_recipient(
  p_campaign_id uuid, p_recipient_id uuid, p_run_token uuid, p_attempt_token uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c public.email_campaigns; v_r public.email_campaign_recipients;
  v_run public.ordinary_campaign_runs; v_a public.ordinary_campaign_attempts;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501';
  END IF;
  IF p_attempt_token IS NULL THEN RETURN jsonb_build_object('claimed',false,'reason','invalid_request'); END IF;
  SELECT * INTO v_c FROM public.email_campaigns WHERE id=p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('claimed',false,'reason','campaign_not_found'); END IF;
  SELECT * INTO v_run FROM public.ordinary_campaign_runs
    WHERE run_token=p_run_token AND campaign_id=p_campaign_id AND state='running' FOR UPDATE;
  IF NOT FOUND OR v_c.status <> 'sending' OR v_c.user_paused OR v_c.paused_reason IS NOT NULL THEN
    RETURN jsonb_build_object('claimed',false,'reason','run_not_active');
  END IF;
  SELECT * INTO v_r FROM public.email_campaign_recipients
    WHERE id=p_recipient_id AND campaign_id=p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('claimed',false,'reason','recipient_mismatch'); END IF;
  SELECT * INTO v_a FROM public.ordinary_campaign_attempts
    WHERE campaign_id=p_campaign_id AND recipient_id=p_recipient_id;
  IF FOUND THEN RETURN jsonb_build_object('claimed',false,'reason','attempt_exists',
    'state',v_a.state,'attempt_token',v_a.attempt_token,'smtp_message_id',v_a.smtp_message_id); END IF;
  IF v_r.status <> 'pending' THEN RETURN jsonb_build_object('claimed',false,'reason','recipient_not_pending'); END IF;
  IF EXISTS(SELECT 1 FROM public.ordinary_campaign_attempts WHERE attempt_token=p_attempt_token) THEN
    RETURN jsonb_build_object('claimed',false,'reason','attempt_token_reused');
  END IF;
  INSERT INTO public.ordinary_campaign_attempts(attempt_token,campaign_id,recipient_id,run_token,state)
    VALUES(p_attempt_token,p_campaign_id,p_recipient_id,p_run_token,'claimed');
  RETURN jsonb_build_object('claimed',true,'reason','claimed','attempt_token',p_attempt_token,'state','claimed');
END;
$$;

CREATE FUNCTION public.transition_ordinary_campaign_attempt(
  p_campaign_id uuid, p_recipient_id uuid, p_run_token uuid, p_attempt_token uuid,
  p_state text, p_smtp_message_id text DEFAULT NULL, p_error_category text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_a public.ordinary_campaign_attempts; v_run public.ordinary_campaign_runs;
  v_sent bigint; v_failed bigint; v_campaign_status text; v_user_paused boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501';
  END IF;
  SELECT status,user_paused INTO v_campaign_status,v_user_paused
    FROM public.email_campaigns WHERE id=p_campaign_id FOR UPDATE;
  SELECT * INTO v_run FROM public.ordinary_campaign_runs WHERE campaign_id=p_campaign_id
    AND run_token=p_run_token AND state IN ('running','uncertain') FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('transitioned',false,'reason','run_mismatch'); END IF;
  PERFORM 1 FROM public.email_campaign_recipients
    WHERE id=p_recipient_id AND campaign_id=p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('transitioned',false,'reason','recipient_mismatch'); END IF;
  SELECT * INTO v_a FROM public.ordinary_campaign_attempts WHERE attempt_token=p_attempt_token
    AND campaign_id=p_campaign_id AND recipient_id=p_recipient_id AND run_token=p_run_token FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('transitioned',false,'reason','attempt_mismatch'); END IF;
  IF p_error_category IS NOT NULL AND (length(p_error_category)>80 OR p_error_category !~ '^[a-z0-9_]+$') THEN
    RETURN jsonb_build_object('transitioned',false,'reason','invalid_error_category');
  END IF;
  IF p_smtp_message_id IS NOT NULL AND (length(p_smtp_message_id) NOT BETWEEN 3 AND 512
      OR p_smtp_message_id ~ E'[\r\n]' OR p_smtp_message_id !~ '^<[^<>[:space:]]+@[^<>[:space:]]+>$') THEN
    RETURN jsonb_build_object('transitioned',false,'reason','invalid_message_id');
  END IF;
  IF v_a.smtp_message_id IS NOT NULL AND p_smtp_message_id IS NOT NULL
    AND v_a.smtp_message_id <> p_smtp_message_id THEN
    RETURN jsonb_build_object('transitioned',false,'reason','message_id_immutable');
  END IF;
  IF NOT ((v_a.state='claimed' AND p_state IN ('dispatching','failed')) OR
    (v_a.state='dispatching' AND (p_state IN ('sent','uncertain') OR
      (p_state='failed' AND p_error_category='smtp_rejected')))) THEN
    RETURN jsonb_build_object('transitioned',false,'reason','invalid_transition','state',v_a.state);
  END IF;
  IF p_state='dispatching' AND (v_run.state <> 'running' OR p_smtp_message_id IS NULL
    OR v_campaign_status <> 'sending' OR coalesce(v_user_paused,false)) THEN
    RETURN jsonb_build_object('transitioned',false,'reason','dispatch_not_allowed');
  END IF;
  UPDATE public.ordinary_campaign_attempts SET state=p_state,
    smtp_message_id=coalesce(smtp_message_id,p_smtp_message_id), error_category=p_error_category,
    dispatching_at=CASE WHEN p_state='dispatching' THEN now() ELSE dispatching_at END,
    finished_at=CASE WHEN p_state IN ('sent','failed','uncertain') THEN now() ELSE NULL END
    WHERE attempt_token=p_attempt_token;
  PERFORM set_config('app.ordinary_campaign_attempt_token',p_attempt_token::text,true);
  IF p_state='sent' THEN
    UPDATE public.email_campaign_recipients SET status='sent',sent_at=now(),error=NULL
      WHERE id=p_recipient_id;
  ELSIF p_state='failed' THEN
    UPDATE public.email_campaign_recipients SET status='failed',error=coalesce(p_error_category,'pre_smtp_failed')
      WHERE id=p_recipient_id;
  ELSIF p_state='uncertain' THEN
    UPDATE public.email_campaign_recipients SET error='ordinary_smtp_outcome_unknown' WHERE id=p_recipient_id;
  END IF;
  SELECT count(*) FILTER (WHERE status IN ('sent','opened','bounced')),
    count(*) FILTER (WHERE status='failed') INTO v_sent,v_failed
    FROM public.email_campaign_recipients WHERE campaign_id=p_campaign_id;
  UPDATE public.email_campaigns SET sent_count=v_sent,failed_count=v_failed WHERE id=p_campaign_id;
  RETURN jsonb_build_object('transitioned',true,'reason','transitioned','state',p_state,
    'smtp_message_id',coalesce(v_a.smtp_message_id,p_smtp_message_id));
END;
$$;

CREATE FUNCTION public.finish_ordinary_campaign_run(
  p_campaign_id uuid, p_token uuid, p_outcome text, p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_run public.ordinary_campaign_runs; v_c public.email_campaigns; v_total bigint; v_pending bigint;
  v_pending_sample bigint;
  v_sent bigint; v_failed bigint; v_unresolved bigint; v_attempts bigint;
  v_status text; v_state text := 'finished'; v_reason text; v_user_paused boolean := false;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501';
  END IF;
  IF p_outcome NOT IN ('completed','paused','failed','uncertain','quota_unknown','preflight_failed')
    OR p_outcome IS NULL THEN RETURN jsonb_build_object('finished',false,'reason','invalid_outcome'); END IF;
  SELECT * INTO v_c FROM public.email_campaigns WHERE id=p_campaign_id FOR UPDATE;
  SELECT * INTO v_run FROM public.ordinary_campaign_runs
    WHERE run_token=p_token AND campaign_id=p_campaign_id AND state='running' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('finished',false,'reason','run_not_active'); END IF;
  SELECT count(*),count(*) FILTER(WHERE status='pending'),count(*) FILTER(WHERE status='pending' AND subject_variant IS NOT NULL),
    count(*) FILTER(WHERE status IN ('sent','opened','bounced')),count(*) FILTER(WHERE status='failed')
    INTO v_total,v_pending,v_pending_sample,v_sent,v_failed FROM public.email_campaign_recipients WHERE campaign_id=p_campaign_id;
  SELECT count(*) FILTER(WHERE run_token=p_token),count(*) FILTER(WHERE state IN ('claimed','dispatching','uncertain'))
    INTO v_attempts,v_unresolved FROM public.ordinary_campaign_attempts WHERE campaign_id=p_campaign_id;
  v_reason := left(coalesce(p_reason,p_outcome),160);
  IF p_outcome IN ('uncertain','quota_unknown') OR v_unresolved > 0 THEN
    v_status := 'paused'; v_state := 'uncertain'; v_user_paused := true;
    v_reason := CASE WHEN p_outcome='quota_unknown' OR p_reason='quota_unknown'
      THEN 'quota_unknown' ELSE 'ordinary_manual_reconciliation_required' END;
  ELSIF p_outcome='preflight_failed' THEN
    IF v_attempts > 0 THEN
      RETURN jsonb_build_object('finished',false,'reason','attempts_already_exist');
    END IF;
    v_status := CASE WHEN v_run.initial_status='draft' THEN 'draft' ELSE 'paused' END;
    v_user_paused := v_status='paused';
    v_reason := CASE WHEN v_status='draft' THEN NULL ELSE 'preflight_failed' END;
  ELSIF p_outcome='completed' AND v_total>0 AND v_pending=0 THEN
    v_status := 'completed'; v_reason := NULL;
  ELSIF p_outcome='paused' AND p_reason='quota_denied' THEN
    v_status := 'paused'; v_user_paused := false; v_reason := 'quota';
  ELSIF p_outcome='completed' AND v_total>0 AND v_pending>0 AND v_pending_sample=0
    AND v_c.ab_test_enabled AND nullif(btrim(v_c.subject_b),'') IS NOT NULL AND v_c.ab_winner IS NULL THEN
    v_status := 'paused'; v_user_paused := false; v_reason := 'ordinary_ab_wait';
  ELSIF p_outcome='completed' THEN
    v_status := 'paused'; v_user_paused := true;
    v_reason := CASE WHEN v_total=0 THEN 'empty_materialization' ELSE 'pending_recipients_remain' END;
  ELSIF p_outcome='failed' THEN
    v_status := 'failed';
  ELSE
    v_status := 'paused'; v_user_paused := true;
  END IF;
  PERFORM set_config('app.ordinary_campaign_run_token',p_token::text,true);
  -- Update campaign while the run still owns the status; then retire the owner.
  UPDATE public.email_campaigns SET status=v_status,user_paused=v_user_paused,paused_reason=v_reason,
    total_recipients=v_total,sent_count=v_sent,failed_count=v_failed,
    started_at=CASE WHEN v_status='draft' THEN v_run.initial_started_at ELSE started_at END,
    completed_at=CASE WHEN v_status='completed' THEN now() ELSE NULL END WHERE id=p_campaign_id;
  UPDATE public.ordinary_campaign_runs SET state=v_state,outcome=p_outcome,reason=v_reason,
    finished_at=CASE WHEN v_state='finished' THEN now() ELSE NULL END WHERE run_token=p_token;
  RETURN jsonb_build_object('finished',true,'status',v_status,'reason',v_reason,'run_state',v_state,
    'counts',jsonb_build_object('total',v_total,'pending',v_pending,'sent',v_sent,'failed',v_failed,'unresolved',v_unresolved));
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ordinary_campaign_run(uuid,uuid,timestamptz,boolean,boolean,uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finish_ordinary_campaign_run(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_ordinary_campaign_recipient(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.transition_ordinary_campaign_attempt(uuid,uuid,uuid,uuid,text,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ordinary_campaign_run(uuid,uuid,timestamptz,boolean,boolean,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_ordinary_campaign_run(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_ordinary_campaign_recipient(uuid,uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_ordinary_campaign_attempt(uuid,uuid,uuid,uuid,text,text,text) TO service_role;
