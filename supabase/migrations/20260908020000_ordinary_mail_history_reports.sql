-- S-012. Durable ordinary-mail facts, confirmed history, exact reply attribution,
-- and an at-most-once Telegram outbox. No secrets, SMTP, stale-claim takeover,
-- new schedule, or backfill of historical delivery guesses.
CREATE TABLE public.ordinary_campaign_messages (
  attempt_token uuid PRIMARY KEY REFERENCES public.ordinary_campaign_attempts(attempt_token) ON DELETE RESTRICT,
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE RESTRICT,
  recipient_id uuid NOT NULL REFERENCES public.email_campaign_recipients(id) ON DELETE RESTRICT,
  run_token uuid NOT NULL REFERENCES public.ordinary_campaign_runs(run_token) ON DELETE RESTRICT,
  smtp_message_id text NOT NULL UNIQUE,
  remote_email text NOT NULL,
  from_email text NOT NULL,
  from_name text,
  reply_to text,
  sender_kind text NOT NULL CHECK(sender_kind IN ('pool','mailing','platform_env','org_legacy')),
  sender_pool_id uuid REFERENCES public.email_sender_pool(id) ON DELETE RESTRICT,
  mailing_sender_id uuid REFERENCES public.mailing_senders(id) ON DELETE RESTRICT,
  subject text NOT NULL,
  html_body text NOT NULL,
  text_body text,
  prepared_payload jsonb NOT NULL,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((sender_kind='pool') = (sender_pool_id IS NOT NULL)),
  CHECK ((sender_kind='mailing') = (mailing_sender_id IS NOT NULL))
);
CREATE INDEX ordinary_campaign_messages_campaign ON public.ordinary_campaign_messages(campaign_id,run_token);
ALTER TABLE public.email_messages
  ADD COLUMN campaign_id uuid REFERENCES public.email_campaigns(id) ON DELETE RESTRICT,
  ADD COLUMN recipient_id uuid REFERENCES public.email_campaign_recipients(id) ON DELETE RESTRICT,
  ADD COLUMN ordinary_attempt_token uuid REFERENCES public.ordinary_campaign_attempts(attempt_token) ON DELETE RESTRICT;
CREATE UNIQUE INDEX ordinary_outgoing_message_attempt ON public.email_messages(ordinary_attempt_token)
  WHERE direction='outgoing' AND ordinary_attempt_token IS NOT NULL;

CREATE TABLE public.ordinary_mail_report_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE RESTRICT,
  run_token uuid REFERENCES public.ordinary_campaign_runs(run_token) ON DELETE RESTRICT,
  related_message_id uuid REFERENCES public.email_messages(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK(kind IN ('run_report','reply')),
  scope text NOT NULL CHECK(scope IN ('platform','org')),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT,
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','dispatching','sent','failed','uncertain')),
  claim_token uuid UNIQUE,
  target_chat_id text,
  telegram_message_id bigint,
  error_category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  finished_at timestamptz,
  CHECK(scope='platform' OR organization_id IS NOT NULL)
);
CREATE INDEX ordinary_mail_report_pending ON public.ordinary_mail_report_events(created_at,id) WHERE state='pending';
CREATE TABLE public.ordinary_inbox_scan_state (
  sender_pool_id uuid PRIMARY KEY REFERENCES public.email_sender_pool(id) ON DELETE RESTRICT,
  state text NOT NULL DEFAULT 'idle' CHECK(state IN ('idle','scanning','uncertain')),
  claim_token uuid UNIQUE,
  uid_validity bigint CHECK(uid_validity>0),
  last_uid bigint NOT NULL DEFAULT 0 CHECK(last_uid>=0),
  claimed_at timestamptz,
  checkpoint_at timestamptz,
  released_at timestamptz
);
CREATE TABLE public.ordinary_inbox_receipts (
  sender_pool_id uuid NOT NULL REFERENCES public.email_sender_pool(id) ON DELETE RESTRICT,
  uid_validity bigint NOT NULL CHECK(uid_validity>0),
  imap_uid bigint NOT NULL CHECK(imap_uid>0),
  message_id uuid REFERENCES public.email_messages(id) ON DELETE RESTRICT,
  ignored_reason text CHECK(ignored_reason IN ('warmup','bounce','self','invalid_sender')),
  stored_at timestamptz NOT NULL DEFAULT now(),
  CHECK((message_id IS NOT NULL) <> (ignored_reason IS NOT NULL)),
  PRIMARY KEY(sender_pool_id,uid_validity,imap_uid)
);

ALTER TABLE public.ordinary_campaign_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordinary_mail_report_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordinary_inbox_scan_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordinary_inbox_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ordinary_campaign_messages,public.ordinary_mail_report_events,
  public.ordinary_inbox_scan_state,public.ordinary_inbox_receipts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.ordinary_campaign_messages,public.ordinary_mail_report_events,
  public.ordinary_inbox_scan_state,public.ordinary_inbox_receipts TO service_role;
GRANT SELECT ON public.ordinary_campaign_messages,public.ordinary_mail_report_events TO authenticated;
CREATE POLICY ordinary_message_admin_read ON public.ordinary_campaign_messages FOR SELECT TO authenticated
  USING(public.has_role(auth.uid(),'admin'));
CREATE POLICY ordinary_report_admin_read ON public.ordinary_mail_report_events FOR SELECT TO authenticated
  USING(public.has_role(auth.uid(),'admin'));

CREATE FUNCTION public.guard_ordinary_message_facts() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RAISE EXCEPTION 'ordinary_message_facts_immutable' USING ERRCODE='55000';
END;
$$;
CREATE TRIGGER ordinary_message_facts_immutable BEFORE UPDATE OR DELETE ON public.ordinary_campaign_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_ordinary_message_facts();

CREATE FUNCTION public.prepare_ordinary_campaign_message(
  p_campaign_id uuid,p_recipient_id uuid,p_run_token uuid,p_attempt_token uuid,p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_c public.email_campaigns; v_a public.ordinary_campaign_attempts;
  v_old public.ordinary_campaign_messages; v_remote text; v_kind text;
  v_pool uuid; v_mailing uuid; v_from text; v_msg text; v_payload jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_c FROM public.email_campaigns WHERE id=p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('prepared',false,'reason','campaign_not_found'); END IF;
  PERFORM 1 FROM public.ordinary_campaign_runs WHERE run_token=p_run_token AND campaign_id=p_campaign_id
    AND state='running' FOR UPDATE;
  IF NOT FOUND OR v_c.status<>'sending' OR v_c.user_paused THEN
    RETURN jsonb_build_object('prepared',false,'reason','run_not_active'); END IF;
  SELECT lower(btrim(email)) INTO v_remote FROM public.email_campaign_recipients
    WHERE id=p_recipient_id AND campaign_id=p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('prepared',false,'reason','recipient_mismatch'); END IF;
  SELECT * INTO v_a FROM public.ordinary_campaign_attempts WHERE attempt_token=p_attempt_token
    AND run_token=p_run_token AND campaign_id=p_campaign_id AND recipient_id=p_recipient_id FOR UPDATE;
  IF NOT FOUND OR v_a.state<>'claimed' THEN RETURN jsonb_build_object('prepared',false,'reason','attempt_not_claimed'); END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RETURN jsonb_build_object('prepared',false,'reason','invalid_payload'); END IF;
  v_kind:=p_payload->>'sender_kind'; v_from:=btrim(p_payload->>'from_email'); v_msg:=p_payload->>'smtp_message_id';
  IF v_kind IS NULL OR v_kind NOT IN ('pool','mailing','platform_env','org_legacy')
    OR v_from IS NULL OR length(v_from)>320 OR v_from !~ '^[^<>[:space:]@]+@[^<>[:space:]@]+$'
    OR v_msg IS NULL OR length(v_msg)>512 OR v_msg !~ '^<[^<>[:space:]]+@[^<>[:space:]]+>$'
    OR p_payload->>'subject' IS NULL OR length(p_payload->>'subject')>2000 OR p_payload->>'subject' ~ E'[\r\n]'
    OR p_payload->>'html_body' IS NULL OR length(p_payload->>'html_body')>200000
    OR length(coalesce(p_payload->>'text_body',''))>60000
    OR length(coalesce(p_payload->>'from_name',''))>300 OR coalesce(p_payload->>'from_name','') ~ E'[\r\n]'
    OR (nullif(p_payload->>'reply_to','') IS NOT NULL AND
      (length(p_payload->>'reply_to')>320 OR p_payload->>'reply_to' !~ '^[^<>[:space:]@]+@[^<>[:space:]@]+$')) THEN
    RETURN jsonb_build_object('prepared',false,'reason','invalid_payload'); END IF;
  BEGIN
    v_pool:=nullif(p_payload->>'sender_pool_id','')::uuid;
    v_mailing:=nullif(p_payload->>'mailing_sender_id','')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('prepared',false,'reason','invalid_sender_id'); END;
  IF (v_kind='pool') IS DISTINCT FROM (v_pool IS NOT NULL) OR
     (v_kind='mailing') IS DISTINCT FROM (v_mailing IS NOT NULL) THEN
    RETURN jsonb_build_object('prepared',false,'reason','sender_mismatch'); END IF;
  IF v_kind='pool' THEN
    IF v_c.scope<>'platform' OR v_c.recipient_filter->>'platform_sender_pool_id' IS DISTINCT FROM v_pool::text OR
      NOT EXISTS(SELECT 1 FROM public.email_sender_pool WHERE id=v_pool AND is_active AND lower(btrim(email))=lower(v_from)) THEN
      RETURN jsonb_build_object('prepared',false,'reason','sender_mismatch'); END IF;
  ELSIF v_kind='mailing' THEN
    IF v_c.scope<>'org' OR v_c.sender_id IS DISTINCT FROM v_mailing OR NOT EXISTS(
      SELECT 1 FROM public.mailing_senders WHERE id=v_mailing AND organization_id=v_c.organization_id
        AND is_active AND smtp_status='ok' AND lower(btrim(from_email))=lower(v_from)) THEN
      RETURN jsonb_build_object('prepared',false,'reason','sender_mismatch'); END IF;
  ELSIF v_kind='platform_env' THEN
    IF v_c.scope<>'platform' OR nullif(v_c.recipient_filter->>'platform_sender_pool_id','') IS NOT NULL THEN
      RETURN jsonb_build_object('prepared',false,'reason','sender_mismatch'); END IF;
  ELSE
    IF v_c.scope<>'org' OR v_c.sender_id IS NOT NULL OR NOT EXISTS(
      SELECT 1 FROM public.org_smtp_settings WHERE organization_id=v_c.organization_id AND lower(btrim(from_email))=lower(v_from)) THEN
      RETURN jsonb_build_object('prepared',false,'reason','sender_mismatch'); END IF;
  END IF;
  v_payload:=jsonb_build_object('smtp_message_id',v_msg,'from_email',v_from,'from_name',nullif(p_payload->>'from_name',''),
    'reply_to',nullif(p_payload->>'reply_to',''),'sender_kind',v_kind,'sender_pool_id',v_pool,'mailing_sender_id',v_mailing,
    'subject',p_payload->>'subject','html_body',p_payload->>'html_body','text_body',p_payload->>'text_body');
  SELECT * INTO v_old FROM public.ordinary_campaign_messages WHERE attempt_token=p_attempt_token;
  IF FOUND THEN RETURN jsonb_build_object('prepared',v_old.prepared_payload=v_payload,
    'reason',CASE WHEN v_old.prepared_payload=v_payload THEN 'already_prepared' ELSE 'message_immutable' END,
    'message_id',v_old.smtp_message_id); END IF;
  IF EXISTS(SELECT 1 FROM public.ordinary_campaign_messages WHERE smtp_message_id=v_msg) THEN
    RETURN jsonb_build_object('prepared',false,'reason','message_id_reused'); END IF;
  INSERT INTO public.ordinary_campaign_messages(attempt_token,campaign_id,recipient_id,run_token,smtp_message_id,
    remote_email,from_email,from_name,reply_to,sender_kind,sender_pool_id,mailing_sender_id,subject,html_body,text_body,prepared_payload)
  VALUES(p_attempt_token,p_campaign_id,p_recipient_id,p_run_token,v_msg,v_remote,v_from,v_payload->>'from_name',v_payload->>'reply_to',
    v_kind,v_pool,v_mailing,p_payload->>'subject',p_payload->>'html_body',p_payload->>'text_body',v_payload);
  RETURN jsonb_build_object('prepared',true,'reason','prepared','message_id',v_msg);
END;
$$;

CREATE FUNCTION public.guard_ordinary_prepared_dispatch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.state IN ('dispatching','sent') AND NEW.state IS DISTINCT FROM OLD.state AND NOT EXISTS(
    SELECT 1 FROM public.ordinary_campaign_messages WHERE attempt_token=NEW.attempt_token
      AND campaign_id=NEW.campaign_id AND recipient_id=NEW.recipient_id AND run_token=NEW.run_token
      AND smtp_message_id=NEW.smtp_message_id) THEN
    RAISE EXCEPTION 'ordinary_message_not_prepared' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ordinary_prepared_dispatch_guard BEFORE UPDATE ON public.ordinary_campaign_attempts
  FOR EACH ROW EXECUTE FUNCTION public.guard_ordinary_prepared_dispatch();

CREATE FUNCTION public.record_ordinary_sent_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_f public.ordinary_campaign_messages; v_conversation uuid;
BEGIN
  IF NEW.state<>'sent' OR OLD.state='sent' THEN RETURN NEW; END IF;
  SELECT * INTO STRICT v_f FROM public.ordinary_campaign_messages WHERE attempt_token=NEW.attempt_token;
  -- Other SMTP routes retain immutable facts but do not pretend to have a pool inbox.
  IF v_f.sender_kind<>'pool' THEN RETURN NEW; END IF;
  INSERT INTO public.email_conversations(sender_id,remote_email,subject)
    VALUES(v_f.sender_pool_id,v_f.remote_email,v_f.subject)
    ON CONFLICT(sender_id,remote_email) DO UPDATE SET remote_email=EXCLUDED.remote_email
    RETURNING id INTO v_conversation;
  INSERT INTO public.email_messages(conversation_id,direction,from_email,from_name,to_email,subject,body_text,body_html,
    message_id,received_at,is_read,campaign_id,recipient_id,ordinary_attempt_token)
  VALUES(v_conversation,'outgoing',v_f.from_email,v_f.from_name,v_f.remote_email,v_f.subject,v_f.text_body,v_f.html_body,
    v_f.smtp_message_id,coalesce(NEW.finished_at,now()),true,v_f.campaign_id,v_f.recipient_id,v_f.attempt_token);
  RETURN NEW;
END;
$$;
CREATE TRIGGER ordinary_sent_history AFTER UPDATE ON public.ordinary_campaign_attempts
  FOR EACH ROW EXECUTE FUNCTION public.record_ordinary_sent_history();

CREATE FUNCTION public.record_ordinary_run_report() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_c public.email_campaigns; v_counts jsonb; v_senders jsonb;
BEGIN
  IF OLD.state<>'running' OR NEW.state NOT IN ('finished','uncertain') THEN RETURN NEW; END IF;
  SELECT * INTO STRICT v_c FROM public.email_campaigns WHERE id=NEW.campaign_id;
  SELECT jsonb_build_object('total',count(*),'pending',count(*) FILTER(WHERE status='pending'),
    'sent',count(*) FILTER(WHERE status IN ('sent','opened','bounced')),'failed',count(*) FILTER(WHERE status='failed'),
    'unresolved',(SELECT count(*) FROM public.ordinary_campaign_attempts WHERE campaign_id=NEW.campaign_id
      AND state IN ('claimed','dispatching','uncertain'))) INTO v_counts
    FROM public.email_campaign_recipients WHERE campaign_id=NEW.campaign_id;
  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('from_email',from_email,'from_name',from_name,'sender_kind',sender_kind,
    'sender_pool_id',sender_pool_id,'mailing_sender_id',mailing_sender_id)),'[]'::jsonb) INTO v_senders
    FROM public.ordinary_campaign_messages WHERE run_token=NEW.run_token;
  INSERT INTO public.ordinary_mail_report_events(event_key,campaign_id,run_token,kind,scope,organization_id,payload)
  VALUES('run:'||NEW.run_token,NEW.campaign_id,NEW.run_token,'run_report',v_c.scope,v_c.organization_id,
    jsonb_build_object('campaign_id',v_c.id,'campaign_name',v_c.name,'scope',v_c.scope,'organization_id',v_c.organization_id,
      'run_token',NEW.run_token,'status',v_c.status,'outcome',NEW.outcome,'reason',NEW.reason,'counts',v_counts,
      'senders',v_senders,'occurred_at',now())) ON CONFLICT(event_key) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ordinary_run_report AFTER UPDATE ON public.ordinary_campaign_runs
  FOR EACH ROW EXECUTE FUNCTION public.record_ordinary_run_report();

CREATE FUNCTION public.list_ordinary_mail_report_candidates(p_platform_ready boolean,p_bot_ready boolean,
  p_campaign_id uuid DEFAULT NULL,p_event_id uuid DEFAULT NULL,p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_events jsonb; v_blocked bigint;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501'; END IF;
  WITH candidates AS (
    SELECT e.id,e.campaign_id,e.scope,e.organization_id,e.created_at,
      coalesce(p_bot_ready,false) AND ((e.scope='platform' AND coalesce(p_platform_ready,false)) OR
        (e.scope='org' AND EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=e.organization_id
          AND o.telegram_notify_enabled AND o.telegram_notify_chat_id ~ '^-?[0-9]{5,20}$'))) AS eligible
    FROM public.ordinary_mail_report_events e WHERE e.state='pending'
      AND (p_campaign_id IS NULL OR e.campaign_id=p_campaign_id) AND (p_event_id IS NULL OR e.id=p_event_id)
  ), eligible AS (
    SELECT * FROM candidates WHERE eligible ORDER BY created_at,id LIMIT greatest(1,least(coalesce(p_limit,20),20))
  ) SELECT (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'campaign_id',campaign_id,
      'scope',scope,'organization_id',organization_id) ORDER BY created_at,id),'[]'::jsonb) FROM eligible),
    (SELECT count(*) FROM candidates WHERE NOT eligible) INTO v_events,v_blocked;
  RETURN jsonb_build_object('events',v_events,'blocked',v_blocked);
END;
$$;
CREATE FUNCTION public.claim_ordinary_mail_report(p_event_id uuid,p_claim_token uuid,p_target_chat_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_e public.ordinary_mail_report_events;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_e FROM public.ordinary_mail_report_events WHERE id=p_event_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('claimed',false,'reason','event_not_found'); END IF;
  IF v_e.state<>'pending' THEN RETURN jsonb_build_object('claimed',false,'reason','event_not_pending','state',v_e.state); END IF;
  IF p_claim_token IS NULL OR p_target_chat_id IS NULL OR p_target_chat_id !~ '^-?[0-9]{5,20}$' THEN
    RETURN jsonb_build_object('claimed',false,'reason','target_not_configured'); END IF;
  IF v_e.scope='org' AND NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=v_e.organization_id
    AND telegram_notify_enabled AND telegram_notify_chat_id=p_target_chat_id) THEN
    RETURN jsonb_build_object('claimed',false,'reason','target_not_configured'); END IF;
  -- Platform target comes only from the service handler's existing server binding,
  -- never a client payload; DB intentionally does not copy that secret/config.
  IF EXISTS(SELECT 1 FROM public.ordinary_mail_report_events WHERE claim_token=p_claim_token) THEN
    RETURN jsonb_build_object('claimed',false,'reason','claim_token_reused'); END IF;
  UPDATE public.ordinary_mail_report_events SET state='dispatching',claim_token=p_claim_token,
    target_chat_id=p_target_chat_id,claimed_at=now() WHERE id=p_event_id;
  RETURN jsonb_build_object('claimed',true,'reason','claimed','event_id',v_e.id,'claim_token',p_claim_token,
    'kind',v_e.kind,'payload',v_e.payload,'target_chat_id',p_target_chat_id);
END;
$$;
CREATE FUNCTION public.finish_ordinary_mail_report(p_event_id uuid,p_claim_token uuid,p_state text,
  p_telegram_message_id bigint DEFAULT NULL,p_error_category text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_e public.ordinary_mail_report_events;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_e FROM public.ordinary_mail_report_events WHERE id=p_event_id FOR UPDATE;
  IF NOT FOUND OR v_e.state<>'dispatching' OR v_e.claim_token IS DISTINCT FROM p_claim_token OR p_claim_token IS NULL THEN
    RETURN jsonb_build_object('finished',false,'reason','claim_mismatch'); END IF;
  IF p_state IS NULL OR p_state NOT IN ('sent','failed','uncertain')
    OR (p_state='sent' AND (p_telegram_message_id IS NULL OR p_telegram_message_id<=0))
    OR (p_state<>'sent' AND p_telegram_message_id IS NOT NULL)
    OR (p_error_category IS NOT NULL AND (length(p_error_category)>80 OR p_error_category !~ '^[a-z0-9_]+$')) THEN
    RETURN jsonb_build_object('finished',false,'reason','invalid_outcome'); END IF;
  UPDATE public.ordinary_mail_report_events SET state=p_state,telegram_message_id=p_telegram_message_id,
    error_category=p_error_category,finished_at=now() WHERE id=p_event_id;
  RETURN jsonb_build_object('finished',true,'reason','finished','state',p_state);
END;
$$;

CREATE FUNCTION public.claim_ordinary_inbox_scan(p_sender_pool_id uuid,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_s public.ordinary_inbox_scan_state;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501'; END IF;
  IF p_token IS NULL OR NOT EXISTS(SELECT 1 FROM public.email_sender_pool WHERE id=p_sender_pool_id AND is_active) THEN
    RETURN jsonb_build_object('claimed',false,'reason','sender_not_active'); END IF;
  INSERT INTO public.ordinary_inbox_scan_state(sender_pool_id) VALUES(p_sender_pool_id) ON CONFLICT DO NOTHING;
  SELECT * INTO v_s FROM public.ordinary_inbox_scan_state WHERE sender_pool_id=p_sender_pool_id FOR UPDATE;
  IF v_s.state<>'idle' THEN RETURN jsonb_build_object('claimed',false,'reason',
    CASE WHEN v_s.state='uncertain' THEN 'manual_reconciliation_required' ELSE 'already_scanning' END); END IF;
  IF EXISTS(SELECT 1 FROM public.ordinary_inbox_scan_state WHERE claim_token=p_token) THEN
    RETURN jsonb_build_object('claimed',false,'reason','claim_token_reused'); END IF;
  UPDATE public.ordinary_inbox_scan_state SET state='scanning',claim_token=p_token,claimed_at=now(),released_at=NULL
    WHERE sender_pool_id=p_sender_pool_id;
  RETURN jsonb_build_object('claimed',true,'reason','claimed','last_uid',v_s.last_uid,'uid_validity',v_s.uid_validity);
END;
$$;
CREATE FUNCTION public.checkpoint_ordinary_inbox_scan(p_sender_pool_id uuid,p_token uuid,p_uid_validity bigint,p_last_uid bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_s public.ordinary_inbox_scan_state;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_s FROM public.ordinary_inbox_scan_state WHERE sender_pool_id=p_sender_pool_id FOR UPDATE;
  IF NOT FOUND OR v_s.state<>'scanning' OR v_s.claim_token IS DISTINCT FROM p_token OR p_token IS NULL THEN
    RETURN jsonb_build_object('updated',false,'reason','claim_mismatch'); END IF;
  IF p_uid_validity IS NULL OR p_uid_validity<=0 OR p_last_uid IS NULL OR p_last_uid<0 OR
    (v_s.uid_validity IS DISTINCT FROM p_uid_validity AND p_last_uid<>0) OR
    (v_s.uid_validity=p_uid_validity AND p_last_uid<v_s.last_uid) THEN
    RETURN jsonb_build_object('updated',false,'reason','invalid_checkpoint'); END IF;
  IF p_last_uid>v_s.last_uid AND NOT EXISTS(SELECT 1 FROM public.ordinary_inbox_receipts
    WHERE sender_pool_id=p_sender_pool_id AND uid_validity=p_uid_validity AND imap_uid=p_last_uid) THEN
    RETURN jsonb_build_object('updated',false,'reason','message_not_stored'); END IF;
  UPDATE public.ordinary_inbox_scan_state SET uid_validity=p_uid_validity,last_uid=p_last_uid,checkpoint_at=now()
    WHERE sender_pool_id=p_sender_pool_id;
  UPDATE public.email_sender_pool SET imap_last_uid=p_last_uid,imap_last_scan_at=now() WHERE id=p_sender_pool_id;
  RETURN jsonb_build_object('updated',true,'reason','updated');
END;
$$;
CREATE FUNCTION public.release_ordinary_inbox_scan(p_sender_pool_id uuid,p_token uuid,p_outcome text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_s public.ordinary_inbox_scan_state;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_s FROM public.ordinary_inbox_scan_state WHERE sender_pool_id=p_sender_pool_id FOR UPDATE;
  IF NOT FOUND OR v_s.state<>'scanning' OR v_s.claim_token IS DISTINCT FROM p_token OR p_token IS NULL THEN
    RETURN jsonb_build_object('released',false,'reason','claim_mismatch'); END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('completed','failed','uncertain') THEN
    RETURN jsonb_build_object('released',false,'reason','invalid_outcome'); END IF;
  UPDATE public.ordinary_inbox_scan_state SET state=CASE WHEN p_outcome='uncertain' THEN 'uncertain' ELSE 'idle' END,
    released_at=now() WHERE sender_pool_id=p_sender_pool_id;
  RETURN jsonb_build_object('released',true,'reason',p_outcome);
END;
$$;

CREATE FUNCTION public.store_ordinary_inbox_message(p_sender_kind text,p_sender_id uuid,p_uid_validity bigint,p_uid bigint,
  p_message jsonb,p_scan_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_s public.ordinary_inbox_scan_state; v_pool_email text; v_remote text; v_conversation uuid;
  v_message uuid; v_existing public.email_messages; v_f public.ordinary_campaign_messages; v_c public.email_campaigns;
  v_refs text[]; v_matches integer; v_message_header text; v_received timestamptz; v_duplicate boolean:=false; v_ignored text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501'; END IF;
  IF p_sender_kind IS DISTINCT FROM 'pool' THEN RETURN jsonb_build_object('stored',false,'reason','unsupported_sender_kind'); END IF;
  SELECT * INTO v_s FROM public.ordinary_inbox_scan_state WHERE sender_pool_id=p_sender_id FOR UPDATE;
  IF NOT FOUND OR v_s.state<>'scanning' OR v_s.claim_token IS DISTINCT FROM p_scan_token OR p_scan_token IS NULL
    OR v_s.uid_validity IS DISTINCT FROM p_uid_validity THEN
    RETURN jsonb_build_object('stored',false,'reason','scan_mismatch'); END IF;
  IF p_uid IS NULL OR p_uid<=0 OR p_uid_validity IS NULL OR p_uid_validity<=0 THEN
    RETURN jsonb_build_object('stored',false,'reason','invalid_uid'); END IF;
  SELECT message_id,ignored_reason INTO v_message,v_ignored FROM public.ordinary_inbox_receipts
    WHERE sender_pool_id=p_sender_id AND uid_validity=p_uid_validity AND imap_uid=p_uid;
  IF FOUND THEN
    SELECT * INTO v_existing FROM public.email_messages WHERE id=v_message;
    RETURN jsonb_build_object('stored',true,'duplicate',true,'ignored',v_ignored IS NOT NULL,'message_id',v_message,
      'conversation_id',v_existing.conversation_id,'attributed',v_existing.campaign_id IS NOT NULL,'campaign_id',v_existing.campaign_id);
  END IF;
  v_ignored:=nullif(p_message->>'ignored_reason','');
  IF v_ignored IS NOT NULL THEN
    IF v_ignored NOT IN ('warmup','bounce','self','invalid_sender') THEN
      RETURN jsonb_build_object('stored',false,'reason','invalid_ignored_reason'); END IF;
    INSERT INTO public.ordinary_inbox_receipts(sender_pool_id,uid_validity,imap_uid,ignored_reason)
      VALUES(p_sender_id,p_uid_validity,p_uid,v_ignored);
    RETURN jsonb_build_object('stored',true,'duplicate',false,'ignored',true,'message_id',NULL,
      'conversation_id',NULL,'attributed',false,'campaign_id',NULL);
  END IF;
  SELECT lower(btrim(email)) INTO v_pool_email FROM public.email_sender_pool WHERE id=p_sender_id AND is_active;
  v_remote:=lower(btrim(p_message->>'from_email')); v_message_header:=nullif(btrim(p_message->>'message_id'),'');
  IF NOT FOUND OR jsonb_typeof(p_message) IS DISTINCT FROM 'object' OR v_remote IS NULL
    OR length(v_remote)>320 OR v_remote !~ '^[^<>[:space:]@]+@[^<>[:space:]@]+$'
    OR lower(btrim(p_message->>'to_email')) IS DISTINCT FROM v_pool_email
    OR length(coalesce(p_message->>'body_html',''))>200000 OR length(coalesce(p_message->>'body_text',''))>60000
    OR length(coalesce(p_message->>'subject',''))>2000 OR length(coalesce(p_message->>'from_name',''))>300
    OR length(coalesce(p_message->>'headers_raw',''))>64000
    OR (v_message_header IS NOT NULL AND (length(v_message_header)>512 OR v_message_header ~ E'[\r\n]'))
    OR length(coalesce(p_message->>'in_reply_to',''))>512
    OR jsonb_typeof(coalesce(p_message->'references_ids','[]'::jsonb)) IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('stored',false,'reason','invalid_message'); END IF;
  IF jsonb_array_length(coalesce(p_message->'references_ids','[]'::jsonb))>100 OR EXISTS(
    SELECT 1 FROM jsonb_array_elements(coalesce(p_message->'references_ids','[]'::jsonb)) x
      WHERE jsonb_typeof(x)<>'string' OR length(x#>>'{}')>512) THEN
    RETURN jsonb_build_object('stored',false,'reason','invalid_references'); END IF;
  BEGIN v_received:=coalesce(nullif(p_message->>'received_at','')::timestamptz,now());
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RETURN jsonb_build_object('stored',false,'reason','invalid_received_at'); END;
  SELECT coalesce(array_agg(btrim(value)),'{}'::text[]) INTO v_refs
    FROM jsonb_array_elements_text(coalesce(p_message->'references_ids','[]'::jsonb));
  v_refs:=array_append(v_refs,nullif(btrim(p_message->>'in_reply_to'),''));
  -- A Message-ID, the actual pool inbox, and the outbound recipient must all match.
  -- References spanning different campaigns are deliberately left unattributed.
  SELECT count(DISTINCT f.campaign_id) INTO v_matches FROM public.ordinary_campaign_messages f
    JOIN public.ordinary_campaign_attempts a USING(attempt_token)
    WHERE f.sender_kind='pool' AND f.sender_pool_id=p_sender_id AND lower(f.from_email)=v_pool_email
      AND lower(coalesce(nullif(f.reply_to,''),f.from_email))=v_pool_email
      AND f.remote_email=v_remote AND f.smtp_message_id=ANY(v_refs) AND a.state='sent';
  IF v_matches=1 THEN
    SELECT f.* INTO v_f FROM public.ordinary_campaign_messages f JOIN public.ordinary_campaign_attempts a USING(attempt_token)
      WHERE f.sender_kind='pool' AND f.sender_pool_id=p_sender_id AND lower(f.from_email)=v_pool_email
        AND lower(coalesce(nullif(f.reply_to,''),f.from_email))=v_pool_email
        AND f.remote_email=v_remote AND f.smtp_message_id=ANY(v_refs) AND a.state='sent'
      ORDER BY (f.smtp_message_id=nullif(btrim(p_message->>'in_reply_to'),'')) DESC NULLS LAST,f.prepared_at DESC,f.attempt_token LIMIT 1;
  END IF;
  SELECT m.* INTO v_existing FROM public.email_messages m JOIN public.email_conversations c ON c.id=m.conversation_id
    WHERE c.sender_id=p_sender_id AND m.message_id=v_message_header ORDER BY m.created_at,m.id LIMIT 1;
  IF FOUND THEN
    IF v_existing.direction<>'incoming' THEN RETURN jsonb_build_object('stored',false,'reason','message_id_collision'); END IF;
    v_message:=v_existing.id; v_conversation:=v_existing.conversation_id; v_duplicate:=true;
  ELSE
    INSERT INTO public.email_conversations(sender_id,remote_email,remote_name,subject)
      VALUES(p_sender_id,v_remote,p_message->>'from_name',p_message->>'subject')
      ON CONFLICT(sender_id,remote_email) DO UPDATE SET remote_email=EXCLUDED.remote_email RETURNING id INTO v_conversation;
    INSERT INTO public.email_messages(conversation_id,direction,from_email,from_name,to_email,subject,body_text,body_html,
      message_id,in_reply_to,references_ids,headers_raw,received_at,campaign_id,recipient_id,ordinary_attempt_token)
    VALUES(v_conversation,'incoming',v_remote,p_message->>'from_name',v_pool_email,p_message->>'subject',p_message->>'body_text',
      p_message->>'body_html',v_message_header,p_message->>'in_reply_to',array_to_string(v_refs,' '),p_message->>'headers_raw',
      v_received,v_f.campaign_id,v_f.recipient_id,v_f.attempt_token) RETURNING id INTO v_message;
  END IF;
  INSERT INTO public.ordinary_inbox_receipts(sender_pool_id,uid_validity,imap_uid,message_id)
    VALUES(p_sender_id,p_uid_validity,p_uid,v_message);
  IF NOT v_duplicate AND v_f.campaign_id IS NOT NULL THEN
    SELECT * INTO STRICT v_c FROM public.email_campaigns WHERE id=v_f.campaign_id;
    INSERT INTO public.ordinary_mail_report_events(event_key,campaign_id,run_token,related_message_id,kind,scope,organization_id,payload)
    VALUES('reply:'||v_message,v_c.id,v_f.run_token,v_message,'reply',v_c.scope,v_c.organization_id,
      jsonb_build_object('campaign_id',v_c.id,'campaign_name',v_c.name,'scope',v_c.scope,'organization_id',v_c.organization_id,
        'run_token',v_f.run_token,'status',v_c.status,'occurred_at',now(),
        'senders',jsonb_build_array(jsonb_build_object('from_email',v_f.from_email,'from_name',v_f.from_name,
          'sender_kind',v_f.sender_kind,'sender_pool_id',v_f.sender_pool_id,'mailing_sender_id',v_f.mailing_sender_id)),
        'matched',jsonb_build_object('attempt_token',v_f.attempt_token,'recipient_id',v_f.recipient_id,'smtp_message_id',v_f.smtp_message_id),
        'reply',jsonb_build_object('from_email',v_remote,'from_name',p_message->>'from_name','subject',p_message->>'subject',
          'text',p_message->>'body_text','received_at',v_received,'message_id',v_message_header,'classification','unclassified')))
    ON CONFLICT(event_key) DO NOTHING;
  END IF;
  RETURN jsonb_build_object('stored',true,'duplicate',v_duplicate,'message_id',v_message,'conversation_id',v_conversation,
    'attributed',CASE WHEN v_duplicate THEN v_existing.campaign_id IS NOT NULL ELSE v_f.campaign_id IS NOT NULL END,
    'campaign_id',CASE WHEN v_duplicate THEN v_existing.campaign_id ELSE v_f.campaign_id END);
END;
$$;

-- Replace only the already installed scanner job's command; preserve its cadence.
-- Both endpoints authenticate using the existing mailing worker cron secret.
CREATE FUNCTION public.invoke_ordinary_mail_workers() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE v_url text; v_secret text; v_scan bigint; v_report bigint;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name='mailing_campaign_worker_url' LIMIT 1;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='mailing_campaign_cron_secret' LIMIT 1;
  IF coalesce(v_url,'')='' OR coalesce(v_secret,'')='' OR v_url !~ '/mailing-campaign-worker/?$' THEN RETURN NULL; END IF;
  SELECT net.http_post(url:=regexp_replace(v_url,'/mailing-campaign-worker/?$','/inbox-scanner'),
    headers:=jsonb_build_object('Content-Type','application/json','X-Cron-Secret',v_secret),body:='{}'::jsonb,
    timeout_milliseconds:=55000) INTO v_scan;
  SELECT net.http_post(url:=regexp_replace(v_url,'/mailing-campaign-worker/?$','/notify-mailing-campaign-report'),
    headers:=jsonb_build_object('Content-Type','application/json','X-Cron-Secret',v_secret),body:='{}'::jsonb,
    timeout_milliseconds:=55000) INTO v_report;
  RETURN jsonb_build_object('scanner_request_id',v_scan,'report_request_id',v_report);
EXCEPTION WHEN undefined_table OR undefined_function OR invalid_schema_name THEN RETURN NULL;
END;
$$;
DO $$
DECLARE v_job bigint;
BEGIN
  IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='cron') THEN
    SELECT jobid INTO v_job FROM cron.job WHERE jobname='inbox-scanner-every-5min';
    IF v_job IS NOT NULL THEN
      PERFORM cron.alter_job(v_job,command:='SELECT public.invoke_ordinary_mail_workers();');
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_ordinary_message_facts(),public.guard_ordinary_prepared_dispatch(),public.record_ordinary_sent_history(),
  public.record_ordinary_run_report() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.prepare_ordinary_campaign_message(uuid,uuid,uuid,uuid,jsonb),
  public.list_ordinary_mail_report_candidates(boolean,boolean,uuid,uuid,integer),
  public.claim_ordinary_mail_report(uuid,uuid,text),public.finish_ordinary_mail_report(uuid,uuid,text,bigint,text),
  public.claim_ordinary_inbox_scan(uuid,uuid),public.checkpoint_ordinary_inbox_scan(uuid,uuid,bigint,bigint),
  public.release_ordinary_inbox_scan(uuid,uuid,text),public.store_ordinary_inbox_message(text,uuid,bigint,bigint,jsonb,uuid),
  public.invoke_ordinary_mail_workers() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_ordinary_campaign_message(uuid,uuid,uuid,uuid,jsonb),
  public.list_ordinary_mail_report_candidates(boolean,boolean,uuid,uuid,integer),
  public.claim_ordinary_mail_report(uuid,uuid,text),public.finish_ordinary_mail_report(uuid,uuid,text,bigint,text),
  public.claim_ordinary_inbox_scan(uuid,uuid),public.checkpoint_ordinary_inbox_scan(uuid,uuid,bigint,bigint),
  public.release_ordinary_inbox_scan(uuid,uuid,text),public.store_ordinary_inbox_message(text,uuid,bigint,bigint,jsonb,uuid),
  public.invoke_ordinary_mail_workers() TO service_role;
