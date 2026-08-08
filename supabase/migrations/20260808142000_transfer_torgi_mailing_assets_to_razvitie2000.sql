-- 20260808142000_transfer_torgi_mailing_assets_to_razvitie2000.sql
-- Idempotent, atomic tenant re-attachment of mailing sender ngal@torgi.com.ru
-- from ООО "ИЦ "ГОРЭЛТЕХ"" to ЧОУ ДПО "ИНСТИТУТ РАЗВИТИЕ 2000".
DO $$
DECLARE
  v_sender uuid := 'bda1efbd-5a11-4ff5-b23a-4aab41188ce7';
  v_campaign uuid := '41f94aea-899e-4aca-a911-17fe19c9bf05';
  v_seed uuid[] := ARRAY['91c43efc-f95a-4321-baba-757a7d5f6cec','36d58c69-39cb-4c3c-bead-52253918b1d1','534975b4-0090-48a7-bb92-c146204e27d6']::uuid[];
  v_source uuid := '7237f9d4-3670-4a19-8946-a43c68fd3473';
  v_target uuid := 'ab809b2b-5d0e-4321-8856-9d887c227651';
  v_cur_org uuid;
  v_email text;
  v_pw_before text;
  v_pw_after text;
  v_n int;
  v_seed_seed int; v_seed_sent int; v_seed_failed int;
  v_upd_sender int; v_upd_campaign int; v_upd_seed int;
BEGIN
  -- lock sender row
  SELECT organization_id, lower(from_email), md5(coalesce(password_encrypted::text,''))
    INTO v_cur_org, v_email, v_pw_before
  FROM public.mailing_senders WHERE id = v_sender FOR UPDATE;

  IF v_cur_org IS NULL THEN
    RAISE EXCEPTION 'GUARD: sender % not found', v_sender;
  END IF;

  -- idempotency: already migrated
  IF v_cur_org = v_target THEN
    RAISE NOTICE 'Already migrated: sender % already belongs to target org', v_sender;
    RETURN;
  END IF;

  IF v_cur_org <> v_source THEN
    RAISE EXCEPTION 'GUARD: sender org % is neither source nor target', v_cur_org;
  END IF;
  IF v_email <> 'ngal@torgi.com.ru' THEN
    RAISE EXCEPTION 'GUARD: unexpected from_email';
  END IF;

  -- exactly one sender with this email globally
  SELECT count(*) INTO v_n FROM public.mailing_senders WHERE lower(from_email) = 'ngal@torgi.com.ru';
  IF v_n <> 1 THEN RAISE EXCEPTION 'GUARD: expected 1 sender with email, found %', v_n; END IF;

  -- org names
  SELECT count(*) INTO v_n FROM public.organizations WHERE id = v_source AND name = 'ООО "ИЦ "ГОРЭЛТЕХ"';
  IF v_n <> 1 THEN RAISE EXCEPTION 'GUARD: source org name mismatch'; END IF;
  SELECT count(*) INTO v_n FROM public.organizations WHERE id = v_target AND name = 'ЧОУ ДПО "ИНСТИТУТ РАЗВИТИЕ 2000"';
  IF v_n <> 1 THEN RAISE EXCEPTION 'GUARD: target org name mismatch'; END IF;
  SELECT count(*) INTO v_n FROM public.organizations WHERE name = 'ЧОУ ДПО "ИНСТИТУТ РАЗВИТИЕ 2000"';
  IF v_n <> 1 THEN RAISE EXCEPTION 'GUARD: target org name not unique (%)', v_n; END IF;

  -- target has no duplicate sender with same email
  SELECT count(*) INTO v_n FROM public.mailing_senders
   WHERE organization_id = v_target AND lower(from_email) = 'ngal@torgi.com.ru';
  IF v_n <> 0 THEN RAISE EXCEPTION 'GUARD: target already has sender with this email'; END IF;

  -- campaign guards (locked)
  PERFORM 1 FROM public.email_campaigns WHERE id = v_campaign FOR UPDATE;
  SELECT count(*) INTO v_n FROM public.email_campaigns
   WHERE id = v_campaign AND sender_id = v_sender AND organization_id = v_source
     AND status = 'draft' AND coalesce(total_recipients,0) = 0
     AND coalesce(sent_count,0) = 0 AND coalesce(failed_count,0) = 0
     AND started_at IS NULL AND completed_at IS NULL AND scheduled_at IS NULL;
  IF v_n <> 1 THEN RAISE EXCEPTION 'GUARD: draft campaign state mismatch'; END IF;

  -- only this campaign references the sender
  SELECT count(*) INTO v_n FROM public.email_campaigns WHERE sender_id = v_sender;
  IF v_n <> 1 THEN RAISE EXCEPTION 'GUARD: expected exactly 1 campaign for sender, found %', v_n; END IF;

  -- seed ledger guards (locked)
  PERFORM 1 FROM public.mailing_seed_ledger WHERE sender_id = v_sender FOR UPDATE;
  SELECT count(*), coalesce(sum(seed_count),0), coalesce(sum(sent_count),0), coalesce(sum(failed_count),0)
    INTO v_n, v_seed_seed, v_seed_sent, v_seed_failed
  FROM public.mailing_seed_ledger
  WHERE sender_id = v_sender AND id = ANY(v_seed)
    AND organization_id = v_source AND campaign_id = v_campaign;
  IF v_n <> 3 OR v_seed_seed <> 7 OR v_seed_sent <> 7 OR v_seed_failed <> 0 THEN
    RAISE EXCEPTION 'GUARD: seed ledger mismatch (n=%, seed=%, sent=%, failed=%)', v_n, v_seed_seed, v_seed_sent, v_seed_failed;
  END IF;
  SELECT count(*) INTO v_n FROM public.mailing_seed_ledger WHERE sender_id = v_sender;
  IF v_n <> 3 THEN RAISE EXCEPTION 'GUARD: extra seed ledger rows (%)', v_n; END IF;

  -- all other links must be zero
  SELECT count(*) INTO v_n FROM public.mailing_campaign_ledger WHERE sender_id = v_sender OR campaign_id = v_campaign;
  IF v_n <> 0 THEN RAISE EXCEPTION 'GUARD: mailing_campaign_ledger not empty (%)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.email_conversations WHERE sender_id = v_sender OR campaign_id = v_campaign;
  IF v_n <> 0 THEN RAISE EXCEPTION 'GUARD: email_conversations not empty (%)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.email_warmup_pings WHERE sender_id = v_sender;
  IF v_n <> 0 THEN RAISE EXCEPTION 'GUARD: email_warmup_pings not empty (%)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.email_campaign_recipients WHERE campaign_id = v_campaign;
  IF v_n <> 0 THEN RAISE EXCEPTION 'GUARD: campaign recipients not empty (%)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.mailing_report_links WHERE campaign_id = v_campaign;
  IF v_n <> 0 THEN RAISE EXCEPTION 'GUARD: report links not empty (%)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.email_campaign_clicks WHERE campaign_id = v_campaign;
  IF v_n <> 0 THEN RAISE EXCEPTION 'GUARD: campaign clicks not empty (%)', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.email_campaign_consent_log WHERE campaign_id = v_campaign;
  IF v_n <> 0 THEN RAISE EXCEPTION 'GUARD: consent log not empty (%)', v_n; END IF;

  -- 1) sender: tenant + reset test state (password_encrypted untouched)
  UPDATE public.mailing_senders SET
    organization_id = v_target,
    smtp_status = 'untested',
    imap_status = 'untested',
    last_tested_at = NULL,
    imap_last_tested_at = NULL,
    last_error = NULL,
    smtp_error_category = NULL,
    imap_error_category = NULL,
    smtp_latency_ms = NULL,
    imap_latency_ms = NULL,
    updated_at = now()
  WHERE id = v_sender;
  GET DIAGNOSTICS v_upd_sender = ROW_COUNT;

  -- 2) draft campaign tenant
  UPDATE public.email_campaigns SET organization_id = v_target
  WHERE id = v_campaign;
  GET DIAGNOSTICS v_upd_campaign = ROW_COUNT;

  -- 3) seed ledger tenant (historic counts untouched)
  UPDATE public.mailing_seed_ledger SET organization_id = v_target, updated_at = now()
  WHERE id = ANY(v_seed) AND sender_id = v_sender;
  GET DIAGNOSTICS v_upd_seed = ROW_COUNT;

  IF v_upd_sender <> 1 OR v_upd_campaign <> 1 OR v_upd_seed <> 3 THEN
    RAISE EXCEPTION 'GUARD: affected rows mismatch (sender=%, campaign=%, seed=%)', v_upd_sender, v_upd_campaign, v_upd_seed;
  END IF;

  -- ciphertext unchanged check (boolean only)
  SELECT md5(coalesce(password_encrypted::text,'')) INTO v_pw_after
  FROM public.mailing_senders WHERE id = v_sender;
  IF v_pw_before IS DISTINCT FROM v_pw_after THEN
    RAISE EXCEPTION 'GUARD: password ciphertext changed';
  END IF;

  RAISE NOTICE 'Transfer OK: sender=1 campaign=1 seed=3 password_ciphertext_unchanged=true';
END $$;