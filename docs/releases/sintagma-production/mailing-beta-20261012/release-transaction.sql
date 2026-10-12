-- ONE SQL-editor request. Generated exact source, transactional ledger and asserting postchecks.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('sintagma-production-release',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $ledger$ BEGIN IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261012160000') THEN RAISE EXCEPTION 'Mailing release replay refused'; END IF; END $ledger$;
DO $preflight$
DECLARE r jsonb; count_before integer;
BEGIN
 FOR r IN SELECT value FROM jsonb_array_elements('[{"name":"mailing_deliverability_seeds","acl":["postgres=arwdDxtm/postgres","anon=arwdDxtm/postgres","authenticated=arwdDxtm/postgres","service_role=arwdDxtm/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=ar/postgres","sandbox_exec=ar/postgres"]},{"name":"mailing_senders","acl":["postgres=arwdDxtm/postgres","anon=arwdDxtm/postgres","authenticated=rdDxtm/postgres","service_role=arwdDxtm/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=ar/postgres","sandbox_exec=ar/postgres"]},{"name":"org_smtp_settings","acl":["postgres=arwdDxtm/postgres","anon=arwdDxtm/postgres","authenticated=arwdDxtm/postgres","service_role=arwdDxtm/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=ar/postgres","sandbox_exec=ar/postgres"]}]'::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('public.'||(r->>'name'))
   AND to_jsonb(c.relacl) IS NOT DISTINCT FROM r->'acl') THEN RAISE EXCEPTION 'Mailing secret table ACL drift: %',r->>'name'; END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements('[{"signature":"account_deletion_access_allowed()","body_md5":"6c078d0f1aa1f6b5af15485f0eaccb2a","definition_md5":"64b0a90b7db9813950ccca6dff208f3a"},{"signature":"activate_verified_mailing_senders(uuid)","body_md5":"23feb011ac2eb3c507047c3772c181a4","definition_md5":"c2bbc720b125947fcc2c94d2dc4de49c"},{"signature":"attest_cold_outreach_campaign(uuid)","body_md5":"816cce39f760fcfd4ec68aab1d2618b3","definition_md5":"b4f03bf0f9719694cc1bb7de63517df4"},{"signature":"can_access_organization(uuid,text)","body_md5":"ad720ba20dc32362ed009b2917cc2d9c","definition_md5":"2e11495f3d3e6ca261af8a08ed874269"},{"signature":"get_decrypted_org_smtp(uuid)","body_md5":"add968bede37330d84f072197ae63b73","definition_md5":"12a00b5c0fa039a1b579f6120b04e5fe"},{"signature":"get_mailing_deliverability_seed_secret(uuid)","body_md5":"75a55697836b343ed9b676e6bbadb9e6","definition_md5":"60def71497a32e8af6d184ac1b266de4"},{"signature":"get_mailing_sender_secret(uuid)","body_md5":"1cb3fdad3527aef79e3e8cb3bfa3f7b3","definition_md5":"ab27312058459827ee9ca8a5d8d238bd"},{"signature":"get_org_staff_permissions(uuid,uuid)","body_md5":"f8d82709ae27730782dc4f455b35b7de","definition_md5":"c0ea40b20bbd1a71aa31cdbcbb7fc0b3"},{"signature":"has_org_staff_permission(uuid,uuid,text)","body_md5":"b9c87ca03c3e95a57baf9122753792e2","definition_md5":"3d1fedafe94778fa19dd47acb71a3782"},{"signature":"has_role(app_role,uuid)","body_md5":"5457df2171dee5cee3641e64285928f2","definition_md5":"20c46f708cc2e7fa51b640290151a59e"},{"signature":"has_role(uuid,app_role)","body_md5":"4e852b30ef52ba5263c4e11d1aec8cf0","definition_md5":"82a7fa1cd06301bb83b010bc315aee0b"},{"signature":"import_mailing_senders_batch(uuid,jsonb)","body_md5":"01f3b1303be91d5b00b42fe3616bfdff","definition_md5":"f65d3e4c24494587abdc746a5f752f59"},{"signature":"normalize_org_staff_permission(text)","body_md5":"2d47924fe022372f2dc128a979d56a53","definition_md5":"bb385c2b288bb966297a8504df1696ea"},{"signature":"org_role_default_permissions(text)","body_md5":"2e440ec2b8552f215d00bd88ad7af166","definition_md5":"f2b39953a0c439d75079d72d5e103247"},{"signature":"set_mailing_sender_warmup(uuid,boolean,integer)","body_md5":"e62317f42ea40d69395f985d48306e97","definition_md5":"6c301847d450b62a14e3b35a62fffc2a"},{"signature":"trigger_encrypt_mailing_sender_password()","body_md5":"192b406c0a4d58dbaedf3d8595e86056","definition_md5":"90723df00301c8e25804d718996e7df0"},{"signature":"create_mailing_report_link(uuid,integer)","body_md5":"0c486cc5af7615f95d89d6a9781adc99","definition_md5":"952107681db76dcbf9a2fef9f658a8da"},{"signature":"import_mailing_contacts(uuid,jsonb)","body_md5":"7f668f365703dd34b305ec0a0c671aeb","definition_md5":"f44fceaab137f3c0f0bdd5abbff8621f"},{"signature":"revoke_mailing_report_link(uuid)","body_md5":"854b1c0eff3d68a80e6ce6973b821678","definition_md5":"b8417571b9011b9d75302786e424c8a2"}]'::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('public.'||(r->>'signature'))
    AND md5(replace(p.prosrc,chr(13)||chr(10),chr(10)))=r->>'body_md5'
    AND md5(replace(pg_get_functiondef(p.oid),chr(13)||chr(10),chr(10)))=r->>'definition_md5')
  THEN RAISE EXCEPTION 'Mailing helper/RPC drift: %',r->>'signature'; END IF;
 END LOOP;
 SELECT count(*) INTO count_before FROM pg_policies WHERE schemaname='public' AND tablename IN
  ('mailing_campaign_ledger','mailing_campaign_replies','mailing_contacts','mailing_deliverability_checks','mailing_deliverability_seeds','mailing_reply_scan_state','mailing_report_links','mailing_seed_ledger','mailing_send_jobs','mailing_senders');
 IF count_before<>33 THEN RAISE EXCEPTION 'Mailing policy inventory drift'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements('[{"table":"mailing_campaign_ledger","name":"account_deletion_no_revoked_access","command":"ALL","permissive":"RESTRICTIVE","roles":["authenticated"],"qual_md5":"99a326c0f33883b22c156502d80e9740","check_md5":"99a326c0f33883b22c156502d80e9740"},{"table":"mailing_campaign_ledger","name":"mailing_campaign_ledger_select","command":"SELECT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d688e2a352859c985d059b2f239fb39b","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_campaign_replies","name":"account_deletion_no_revoked_access","command":"ALL","permissive":"RESTRICTIVE","roles":["authenticated"],"qual_md5":"99a326c0f33883b22c156502d80e9740","check_md5":"99a326c0f33883b22c156502d80e9740"},{"table":"mailing_campaign_replies","name":"mailing_campaign_replies_select","command":"SELECT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"7485f72dadcf4de03e86687d8dadbeac","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_campaign_replies","name":"mailing_campaign_replies_update","command":"UPDATE","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"7485f72dadcf4de03e86687d8dadbeac","check_md5":"7485f72dadcf4de03e86687d8dadbeac"},{"table":"mailing_contacts","name":"account_deletion_no_revoked_access","command":"ALL","permissive":"RESTRICTIVE","roles":["authenticated"],"qual_md5":"99a326c0f33883b22c156502d80e9740","check_md5":"99a326c0f33883b22c156502d80e9740"},{"table":"mailing_contacts","name":"mailing_contacts_delete","command":"DELETE","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d688e2a352859c985d059b2f239fb39b","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_contacts","name":"mailing_contacts_insert","command":"INSERT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d41d8cd98f00b204e9800998ecf8427e","check_md5":"d688e2a352859c985d059b2f239fb39b"},{"table":"mailing_contacts","name":"mailing_contacts_select","command":"SELECT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d688e2a352859c985d059b2f239fb39b","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_contacts","name":"mailing_contacts_update","command":"UPDATE","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d688e2a352859c985d059b2f239fb39b","check_md5":"d688e2a352859c985d059b2f239fb39b"},{"table":"mailing_deliverability_checks","name":"account_deletion_no_revoked_access","command":"ALL","permissive":"RESTRICTIVE","roles":["authenticated"],"qual_md5":"99a326c0f33883b22c156502d80e9740","check_md5":"99a326c0f33883b22c156502d80e9740"},{"table":"mailing_deliverability_checks","name":"mailing_deliverability_checks_select","command":"SELECT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"632828bdf0e4e7e0349e9f51071a2bf0","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_deliverability_seeds","name":"account_deletion_no_revoked_access","command":"ALL","permissive":"RESTRICTIVE","roles":["authenticated"],"qual_md5":"99a326c0f33883b22c156502d80e9740","check_md5":"99a326c0f33883b22c156502d80e9740"},{"table":"mailing_deliverability_seeds","name":"mailing_deliverability_seeds_delete","command":"DELETE","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"632828bdf0e4e7e0349e9f51071a2bf0","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_deliverability_seeds","name":"mailing_deliverability_seeds_insert","command":"INSERT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d41d8cd98f00b204e9800998ecf8427e","check_md5":"632828bdf0e4e7e0349e9f51071a2bf0"},{"table":"mailing_deliverability_seeds","name":"mailing_deliverability_seeds_select","command":"SELECT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"632828bdf0e4e7e0349e9f51071a2bf0","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_deliverability_seeds","name":"mailing_deliverability_seeds_update","command":"UPDATE","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"632828bdf0e4e7e0349e9f51071a2bf0","check_md5":"632828bdf0e4e7e0349e9f51071a2bf0"},{"table":"mailing_reply_scan_state","name":"account_deletion_no_revoked_access","command":"ALL","permissive":"RESTRICTIVE","roles":["authenticated"],"qual_md5":"99a326c0f33883b22c156502d80e9740","check_md5":"99a326c0f33883b22c156502d80e9740"},{"table":"mailing_reply_scan_state","name":"mailing_reply_scan_state_select","command":"SELECT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"f3ea739fe17c1289096d94c2af4cf2f8","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_report_links","name":"account_deletion_no_revoked_access","command":"ALL","permissive":"RESTRICTIVE","roles":["authenticated"],"qual_md5":"99a326c0f33883b22c156502d80e9740","check_md5":"99a326c0f33883b22c156502d80e9740"},{"table":"mailing_report_links","name":"mailing_report_links_delete","command":"DELETE","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d688e2a352859c985d059b2f239fb39b","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_report_links","name":"mailing_report_links_insert","command":"INSERT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d41d8cd98f00b204e9800998ecf8427e","check_md5":"d688e2a352859c985d059b2f239fb39b"},{"table":"mailing_report_links","name":"mailing_report_links_select","command":"SELECT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d688e2a352859c985d059b2f239fb39b","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_report_links","name":"mailing_report_links_update","command":"UPDATE","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d688e2a352859c985d059b2f239fb39b","check_md5":"d688e2a352859c985d059b2f239fb39b"},{"table":"mailing_seed_ledger","name":"account_deletion_no_revoked_access","command":"ALL","permissive":"RESTRICTIVE","roles":["authenticated"],"qual_md5":"99a326c0f33883b22c156502d80e9740","check_md5":"99a326c0f33883b22c156502d80e9740"},{"table":"mailing_seed_ledger","name":"mailing_seed_ledger_select","command":"SELECT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d688e2a352859c985d059b2f239fb39b","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_send_jobs","name":"account_deletion_no_revoked_access","command":"ALL","permissive":"RESTRICTIVE","roles":["authenticated"],"qual_md5":"99a326c0f33883b22c156502d80e9740","check_md5":"99a326c0f33883b22c156502d80e9740"},{"table":"mailing_send_jobs","name":"mailing_send_jobs_select","command":"SELECT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"61afeaa742147cb7a12a05810d047066","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_senders","name":"account_deletion_no_revoked_access","command":"ALL","permissive":"RESTRICTIVE","roles":["authenticated"],"qual_md5":"99a326c0f33883b22c156502d80e9740","check_md5":"99a326c0f33883b22c156502d80e9740"},{"table":"mailing_senders","name":"mailing_senders_delete","command":"DELETE","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d688e2a352859c985d059b2f239fb39b","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_senders","name":"mailing_senders_insert","command":"INSERT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d41d8cd98f00b204e9800998ecf8427e","check_md5":"d688e2a352859c985d059b2f239fb39b"},{"table":"mailing_senders","name":"mailing_senders_select","command":"SELECT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d688e2a352859c985d059b2f239fb39b","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_senders","name":"mailing_senders_update","command":"UPDATE","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d688e2a352859c985d059b2f239fb39b","check_md5":"d688e2a352859c985d059b2f239fb39b"}]'::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_policies p WHERE schemaname='public' AND tablename=r->>'table' AND policyname=r->>'name'
   AND cmd=r->>'command' AND permissive=r->>'permissive' AND to_jsonb(roles)=r->'roles'
   AND md5(coalesce(qual,''))=r->>'qual_md5' AND md5(coalesce(with_check,''))=r->>'check_md5')
  THEN RAISE EXCEPTION 'Mailing policy drift: %.%',r->>'table',r->>'name'; END IF;
 END LOOP;
 IF to_regprocedure('public.save_mailing_sender(uuid,uuid,jsonb,text)') IS NOT NULL
 OR to_regprocedure('public.set_mailing_sender_active(uuid,uuid,boolean)') IS NOT NULL
 OR to_regprocedure('public.guard_mailing_sender_verification()') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.mailing_senders'::regclass AND tgname='mailing_sender_verification_guard')
 THEN RAISE EXCEPTION 'Mailing sender management already exists'; END IF;
END $preflight$;
CREATE TEMP TABLE mailing_security_before ON COMMIT DROP AS SELECT jsonb_build_object(
 'helpers',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',p.proacl) ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.oid IN ('public.account_deletion_access_allowed()'::regprocedure,'public.can_access_organization(uuid,text)'::regprocedure,'public.get_decrypted_org_smtp(uuid)'::regprocedure,'public.get_mailing_deliverability_seed_secret(uuid)'::regprocedure,'public.get_mailing_sender_secret(uuid)'::regprocedure,'public.get_org_staff_permissions(uuid,uuid)'::regprocedure,'public.has_org_staff_permission(uuid,uuid,text)'::regprocedure,'public.has_role(app_role,uuid)'::regprocedure,'public.has_role(uuid,app_role)'::regprocedure,'public.normalize_org_staff_permission(text)'::regprocedure,'public.org_role_default_permissions(text)'::regprocedure,'public.trigger_encrypt_mailing_sender_password()'::regprocedure)),
 'table_security',(SELECT jsonb_agg(jsonb_build_object('table',relname,'owner',relowner,'rls',relrowsecurity,'force',relforcerowsecurity) ORDER BY relname) FROM pg_class WHERE relname IN ('email_campaign_recipients','email_campaigns','mailing_campaign_ledger','mailing_campaign_replies','mailing_contacts','mailing_deliverability_checks','mailing_deliverability_seeds','mailing_reply_scan_state','mailing_report_links','mailing_seed_ledger','mailing_send_jobs','mailing_senders','org_smtp_settings') AND relnamespace='public'::regnamespace),
 'other_policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public' AND tablename IN ('email_campaign_recipients','email_campaigns','mailing_campaign_ledger','mailing_campaign_replies','mailing_contacts','mailing_deliverability_checks','mailing_deliverability_seeds','mailing_reply_scan_state','mailing_report_links','mailing_seed_ledger','mailing_send_jobs','mailing_senders','org_smtp_settings') AND NOT (tablename LIKE 'mailing_%' AND permissive='PERMISSIVE')),
 'nonselect_table_grants',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'grantor',g.grantor,'grantee',g.grantee,'privilege',g.privilege_type,'grantable',g.is_grantable) ORDER BY c.relname,g.grantor,g.grantee,g.privilege_type) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) g WHERE c.relnamespace='public'::regnamespace AND c.relname IN ('email_campaign_recipients','email_campaigns','mailing_campaign_ledger','mailing_campaign_replies','mailing_contacts','mailing_deliverability_checks','mailing_deliverability_seeds','mailing_reply_scan_state','mailing_report_links','mailing_seed_ledger','mailing_send_jobs','mailing_senders','org_smtp_settings') AND g.privilege_type<>'SELECT'),
 'nonselect_column_grants',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'column',a.attname,'grantor',g.grantor,'grantee',g.grantee,'privilege',g.privilege_type,'grantable',g.is_grantable) ORDER BY c.relname,a.attname,g.grantor,g.grantee,g.privilege_type) FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid CROSS JOIN LATERAL aclexplode(a.attacl) g WHERE c.relnamespace='public'::regnamespace AND c.relname IN ('email_campaign_recipients','email_campaigns','mailing_campaign_ledger','mailing_campaign_replies','mailing_contacts','mailing_deliverability_checks','mailing_deliverability_seeds','mailing_reply_scan_state','mailing_report_links','mailing_seed_ledger','mailing_send_jobs','mailing_senders','org_smtp_settings') AND g.privilege_type<>'SELECT'),
 'existing_triggers',(SELECT jsonb_agg(jsonb_build_object('table',tgrelid,'name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) ORDER BY tgrelid,tgname) FROM pg_trigger WHERE tgrelid IN ('public.email_campaign_recipients'::regclass,'public.email_campaigns'::regclass,'public.mailing_campaign_ledger'::regclass,'public.mailing_campaign_replies'::regclass,'public.mailing_contacts'::regclass,'public.mailing_deliverability_checks'::regclass,'public.mailing_deliverability_seeds'::regclass,'public.mailing_reply_scan_state'::regclass,'public.mailing_report_links'::regclass,'public.mailing_seed_ledger'::regclass,'public.mailing_send_jobs'::regclass,'public.mailing_senders'::regclass,'public.org_smtp_settings'::regclass) AND NOT tgisinternal AND tgname<>'mailing_sender_verification_guard')
) AS security_snapshot;
CREATE TEMP TABLE mailing_release_result(result jsonb) ON COMMIT PRESERVE ROWS;
DO $apply$ DECLARE source text:=$mailing_source$-- S-004: align mailing operations with sales permissions and safely edit senders.
-- No scheduling, activation, delivery, secret reads or existing business-row mutation.
DO $preflight$
DECLARE r jsonb; count_before integer;
BEGIN
 FOR r IN SELECT value FROM jsonb_array_elements('[{"name":"mailing_deliverability_seeds","acl":["postgres=arwdDxtm/postgres","anon=arwdDxtm/postgres","authenticated=arwdDxtm/postgres","service_role=arwdDxtm/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=ar/postgres","sandbox_exec=ar/postgres"]},{"name":"mailing_senders","acl":["postgres=arwdDxtm/postgres","anon=arwdDxtm/postgres","authenticated=rdDxtm/postgres","service_role=arwdDxtm/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=ar/postgres","sandbox_exec=ar/postgres"]},{"name":"org_smtp_settings","acl":["postgres=arwdDxtm/postgres","anon=arwdDxtm/postgres","authenticated=arwdDxtm/postgres","service_role=arwdDxtm/postgres","sandbox_exec_atxwvjxbqjgkbjlhsdch=ar/postgres","sandbox_exec=ar/postgres"]}]'::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('public.'||(r->>'name'))
   AND to_jsonb(c.relacl) IS NOT DISTINCT FROM r->'acl') THEN RAISE EXCEPTION 'Mailing secret table ACL drift: %',r->>'name'; END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements('[{"signature":"account_deletion_access_allowed()","body_md5":"6c078d0f1aa1f6b5af15485f0eaccb2a","definition_md5":"64b0a90b7db9813950ccca6dff208f3a"},{"signature":"activate_verified_mailing_senders(uuid)","body_md5":"23feb011ac2eb3c507047c3772c181a4","definition_md5":"c2bbc720b125947fcc2c94d2dc4de49c"},{"signature":"attest_cold_outreach_campaign(uuid)","body_md5":"816cce39f760fcfd4ec68aab1d2618b3","definition_md5":"b4f03bf0f9719694cc1bb7de63517df4"},{"signature":"can_access_organization(uuid,text)","body_md5":"ad720ba20dc32362ed009b2917cc2d9c","definition_md5":"2e11495f3d3e6ca261af8a08ed874269"},{"signature":"get_decrypted_org_smtp(uuid)","body_md5":"add968bede37330d84f072197ae63b73","definition_md5":"12a00b5c0fa039a1b579f6120b04e5fe"},{"signature":"get_mailing_deliverability_seed_secret(uuid)","body_md5":"75a55697836b343ed9b676e6bbadb9e6","definition_md5":"60def71497a32e8af6d184ac1b266de4"},{"signature":"get_mailing_sender_secret(uuid)","body_md5":"1cb3fdad3527aef79e3e8cb3bfa3f7b3","definition_md5":"ab27312058459827ee9ca8a5d8d238bd"},{"signature":"get_org_staff_permissions(uuid,uuid)","body_md5":"f8d82709ae27730782dc4f455b35b7de","definition_md5":"c0ea40b20bbd1a71aa31cdbcbb7fc0b3"},{"signature":"has_org_staff_permission(uuid,uuid,text)","body_md5":"b9c87ca03c3e95a57baf9122753792e2","definition_md5":"3d1fedafe94778fa19dd47acb71a3782"},{"signature":"has_role(app_role,uuid)","body_md5":"5457df2171dee5cee3641e64285928f2","definition_md5":"20c46f708cc2e7fa51b640290151a59e"},{"signature":"has_role(uuid,app_role)","body_md5":"4e852b30ef52ba5263c4e11d1aec8cf0","definition_md5":"82a7fa1cd06301bb83b010bc315aee0b"},{"signature":"import_mailing_senders_batch(uuid,jsonb)","body_md5":"01f3b1303be91d5b00b42fe3616bfdff","definition_md5":"f65d3e4c24494587abdc746a5f752f59"},{"signature":"normalize_org_staff_permission(text)","body_md5":"2d47924fe022372f2dc128a979d56a53","definition_md5":"bb385c2b288bb966297a8504df1696ea"},{"signature":"org_role_default_permissions(text)","body_md5":"2e440ec2b8552f215d00bd88ad7af166","definition_md5":"f2b39953a0c439d75079d72d5e103247"},{"signature":"set_mailing_sender_warmup(uuid,boolean,integer)","body_md5":"e62317f42ea40d69395f985d48306e97","definition_md5":"6c301847d450b62a14e3b35a62fffc2a"},{"signature":"trigger_encrypt_mailing_sender_password()","body_md5":"192b406c0a4d58dbaedf3d8595e86056","definition_md5":"90723df00301c8e25804d718996e7df0"},{"signature":"create_mailing_report_link(uuid,integer)","body_md5":"0c486cc5af7615f95d89d6a9781adc99","definition_md5":"952107681db76dcbf9a2fef9f658a8da"},{"signature":"import_mailing_contacts(uuid,jsonb)","body_md5":"7f668f365703dd34b305ec0a0c671aeb","definition_md5":"f44fceaab137f3c0f0bdd5abbff8621f"},{"signature":"revoke_mailing_report_link(uuid)","body_md5":"854b1c0eff3d68a80e6ce6973b821678","definition_md5":"b8417571b9011b9d75302786e424c8a2"}]'::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('public.'||(r->>'signature'))
    AND md5(replace(p.prosrc,chr(13)||chr(10),chr(10)))=r->>'body_md5'
    AND md5(replace(pg_get_functiondef(p.oid),chr(13)||chr(10),chr(10)))=r->>'definition_md5')
  THEN RAISE EXCEPTION 'Mailing helper/RPC drift: %',r->>'signature'; END IF;
 END LOOP;
 SELECT count(*) INTO count_before FROM pg_policies WHERE schemaname='public' AND tablename IN
  ('mailing_campaign_ledger','mailing_campaign_replies','mailing_contacts','mailing_deliverability_checks','mailing_deliverability_seeds','mailing_reply_scan_state','mailing_report_links','mailing_seed_ledger','mailing_send_jobs','mailing_senders');
 IF count_before<>33 THEN RAISE EXCEPTION 'Mailing policy inventory drift'; END IF;
 FOR r IN SELECT value FROM jsonb_array_elements('[{"table":"mailing_campaign_ledger","name":"account_deletion_no_revoked_access","command":"ALL","permissive":"RESTRICTIVE","roles":["authenticated"],"qual_md5":"99a326c0f33883b22c156502d80e9740","check_md5":"99a326c0f33883b22c156502d80e9740"},{"table":"mailing_campaign_ledger","name":"mailing_campaign_ledger_select","command":"SELECT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d688e2a352859c985d059b2f239fb39b","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_campaign_replies","name":"account_deletion_no_revoked_access","command":"ALL","permissive":"RESTRICTIVE","roles":["authenticated"],"qual_md5":"99a326c0f33883b22c156502d80e9740","check_md5":"99a326c0f33883b22c156502d80e9740"},{"table":"mailing_campaign_replies","name":"mailing_campaign_replies_select","command":"SELECT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"7485f72dadcf4de03e86687d8dadbeac","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_campaign_replies","name":"mailing_campaign_replies_update","command":"UPDATE","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"7485f72dadcf4de03e86687d8dadbeac","check_md5":"7485f72dadcf4de03e86687d8dadbeac"},{"table":"mailing_contacts","name":"account_deletion_no_revoked_access","command":"ALL","permissive":"RESTRICTIVE","roles":["authenticated"],"qual_md5":"99a326c0f33883b22c156502d80e9740","check_md5":"99a326c0f33883b22c156502d80e9740"},{"table":"mailing_contacts","name":"mailing_contacts_delete","command":"DELETE","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d688e2a352859c985d059b2f239fb39b","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_contacts","name":"mailing_contacts_insert","command":"INSERT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d41d8cd98f00b204e9800998ecf8427e","check_md5":"d688e2a352859c985d059b2f239fb39b"},{"table":"mailing_contacts","name":"mailing_contacts_select","command":"SELECT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d688e2a352859c985d059b2f239fb39b","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_contacts","name":"mailing_contacts_update","command":"UPDATE","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d688e2a352859c985d059b2f239fb39b","check_md5":"d688e2a352859c985d059b2f239fb39b"},{"table":"mailing_deliverability_checks","name":"account_deletion_no_revoked_access","command":"ALL","permissive":"RESTRICTIVE","roles":["authenticated"],"qual_md5":"99a326c0f33883b22c156502d80e9740","check_md5":"99a326c0f33883b22c156502d80e9740"},{"table":"mailing_deliverability_checks","name":"mailing_deliverability_checks_select","command":"SELECT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"632828bdf0e4e7e0349e9f51071a2bf0","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_deliverability_seeds","name":"account_deletion_no_revoked_access","command":"ALL","permissive":"RESTRICTIVE","roles":["authenticated"],"qual_md5":"99a326c0f33883b22c156502d80e9740","check_md5":"99a326c0f33883b22c156502d80e9740"},{"table":"mailing_deliverability_seeds","name":"mailing_deliverability_seeds_delete","command":"DELETE","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"632828bdf0e4e7e0349e9f51071a2bf0","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_deliverability_seeds","name":"mailing_deliverability_seeds_insert","command":"INSERT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d41d8cd98f00b204e9800998ecf8427e","check_md5":"632828bdf0e4e7e0349e9f51071a2bf0"},{"table":"mailing_deliverability_seeds","name":"mailing_deliverability_seeds_select","command":"SELECT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"632828bdf0e4e7e0349e9f51071a2bf0","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_deliverability_seeds","name":"mailing_deliverability_seeds_update","command":"UPDATE","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"632828bdf0e4e7e0349e9f51071a2bf0","check_md5":"632828bdf0e4e7e0349e9f51071a2bf0"},{"table":"mailing_reply_scan_state","name":"account_deletion_no_revoked_access","command":"ALL","permissive":"RESTRICTIVE","roles":["authenticated"],"qual_md5":"99a326c0f33883b22c156502d80e9740","check_md5":"99a326c0f33883b22c156502d80e9740"},{"table":"mailing_reply_scan_state","name":"mailing_reply_scan_state_select","command":"SELECT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"f3ea739fe17c1289096d94c2af4cf2f8","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_report_links","name":"account_deletion_no_revoked_access","command":"ALL","permissive":"RESTRICTIVE","roles":["authenticated"],"qual_md5":"99a326c0f33883b22c156502d80e9740","check_md5":"99a326c0f33883b22c156502d80e9740"},{"table":"mailing_report_links","name":"mailing_report_links_delete","command":"DELETE","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d688e2a352859c985d059b2f239fb39b","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_report_links","name":"mailing_report_links_insert","command":"INSERT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d41d8cd98f00b204e9800998ecf8427e","check_md5":"d688e2a352859c985d059b2f239fb39b"},{"table":"mailing_report_links","name":"mailing_report_links_select","command":"SELECT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d688e2a352859c985d059b2f239fb39b","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_report_links","name":"mailing_report_links_update","command":"UPDATE","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d688e2a352859c985d059b2f239fb39b","check_md5":"d688e2a352859c985d059b2f239fb39b"},{"table":"mailing_seed_ledger","name":"account_deletion_no_revoked_access","command":"ALL","permissive":"RESTRICTIVE","roles":["authenticated"],"qual_md5":"99a326c0f33883b22c156502d80e9740","check_md5":"99a326c0f33883b22c156502d80e9740"},{"table":"mailing_seed_ledger","name":"mailing_seed_ledger_select","command":"SELECT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d688e2a352859c985d059b2f239fb39b","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_send_jobs","name":"account_deletion_no_revoked_access","command":"ALL","permissive":"RESTRICTIVE","roles":["authenticated"],"qual_md5":"99a326c0f33883b22c156502d80e9740","check_md5":"99a326c0f33883b22c156502d80e9740"},{"table":"mailing_send_jobs","name":"mailing_send_jobs_select","command":"SELECT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"61afeaa742147cb7a12a05810d047066","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_senders","name":"account_deletion_no_revoked_access","command":"ALL","permissive":"RESTRICTIVE","roles":["authenticated"],"qual_md5":"99a326c0f33883b22c156502d80e9740","check_md5":"99a326c0f33883b22c156502d80e9740"},{"table":"mailing_senders","name":"mailing_senders_delete","command":"DELETE","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d688e2a352859c985d059b2f239fb39b","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_senders","name":"mailing_senders_insert","command":"INSERT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d41d8cd98f00b204e9800998ecf8427e","check_md5":"d688e2a352859c985d059b2f239fb39b"},{"table":"mailing_senders","name":"mailing_senders_select","command":"SELECT","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d688e2a352859c985d059b2f239fb39b","check_md5":"d41d8cd98f00b204e9800998ecf8427e"},{"table":"mailing_senders","name":"mailing_senders_update","command":"UPDATE","permissive":"PERMISSIVE","roles":["authenticated"],"qual_md5":"d688e2a352859c985d059b2f239fb39b","check_md5":"d688e2a352859c985d059b2f239fb39b"}]'::jsonb) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_policies p WHERE schemaname='public' AND tablename=r->>'table' AND policyname=r->>'name'
   AND cmd=r->>'command' AND permissive=r->>'permissive' AND to_jsonb(roles)=r->'roles'
   AND md5(coalesce(qual,''))=r->>'qual_md5' AND md5(coalesce(with_check,''))=r->>'check_md5')
  THEN RAISE EXCEPTION 'Mailing policy drift: %.%',r->>'table',r->>'name'; END IF;
 END LOOP;
 IF to_regprocedure('public.save_mailing_sender(uuid,uuid,jsonb,text)') IS NOT NULL
 OR to_regprocedure('public.set_mailing_sender_active(uuid,uuid,boolean)') IS NOT NULL
 OR to_regprocedure('public.guard_mailing_sender_verification()') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.mailing_senders'::regclass AND tgname='mailing_sender_verification_guard')
 THEN RAISE EXCEPTION 'Mailing sender management already exists'; END IF;
END $preflight$;

DROP POLICY "mailing_campaign_ledger_select" ON public."mailing_campaign_ledger";
CREATE POLICY "mailing_campaign_ledger_select" ON public."mailing_campaign_ledger" FOR SELECT TO authenticated
USING ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.read')))
;
DROP POLICY "mailing_campaign_replies_select" ON public."mailing_campaign_replies";
CREATE POLICY "mailing_campaign_replies_select" ON public."mailing_campaign_replies" FOR SELECT TO authenticated
USING ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.read')))
;
DROP POLICY "mailing_campaign_replies_update" ON public."mailing_campaign_replies";
CREATE POLICY "mailing_campaign_replies_update" ON public."mailing_campaign_replies" FOR UPDATE TO authenticated
USING ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.write')))
WITH CHECK ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.write')))
;
DROP POLICY "mailing_contacts_delete" ON public."mailing_contacts";
CREATE POLICY "mailing_contacts_delete" ON public."mailing_contacts" FOR DELETE TO authenticated
USING ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.write')))
;
DROP POLICY "mailing_contacts_insert" ON public."mailing_contacts";
CREATE POLICY "mailing_contacts_insert" ON public."mailing_contacts" FOR INSERT TO authenticated
WITH CHECK ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.write')))
;
DROP POLICY "mailing_contacts_select" ON public."mailing_contacts";
CREATE POLICY "mailing_contacts_select" ON public."mailing_contacts" FOR SELECT TO authenticated
USING ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.read')))
;
DROP POLICY "mailing_contacts_update" ON public."mailing_contacts";
CREATE POLICY "mailing_contacts_update" ON public."mailing_contacts" FOR UPDATE TO authenticated
USING ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.write')))
WITH CHECK ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.write')))
;
DROP POLICY "mailing_deliverability_checks_select" ON public."mailing_deliverability_checks";
CREATE POLICY "mailing_deliverability_checks_select" ON public."mailing_deliverability_checks" FOR SELECT TO authenticated
USING ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.read')))
;
DROP POLICY "mailing_deliverability_seeds_delete" ON public."mailing_deliverability_seeds";
CREATE POLICY "mailing_deliverability_seeds_delete" ON public."mailing_deliverability_seeds" FOR DELETE TO authenticated
USING ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.write')))
;
DROP POLICY "mailing_deliverability_seeds_insert" ON public."mailing_deliverability_seeds";
CREATE POLICY "mailing_deliverability_seeds_insert" ON public."mailing_deliverability_seeds" FOR INSERT TO authenticated
WITH CHECK ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.write')))
;
DROP POLICY "mailing_deliverability_seeds_select" ON public."mailing_deliverability_seeds";
CREATE POLICY "mailing_deliverability_seeds_select" ON public."mailing_deliverability_seeds" FOR SELECT TO authenticated
USING ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.read')))
;
DROP POLICY "mailing_deliverability_seeds_update" ON public."mailing_deliverability_seeds";
CREATE POLICY "mailing_deliverability_seeds_update" ON public."mailing_deliverability_seeds" FOR UPDATE TO authenticated
USING ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.write')))
WITH CHECK ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.write')))
;
DROP POLICY "mailing_reply_scan_state_select" ON public."mailing_reply_scan_state";
CREATE POLICY "mailing_reply_scan_state_select" ON public."mailing_reply_scan_state" FOR SELECT TO authenticated
USING (EXISTS(SELECT 1 FROM public.mailing_senders s WHERE s.id=mailing_reply_scan_state.sender_id AND public.can_access_organization(s.organization_id,'sales.read')))
;
DROP POLICY "mailing_report_links_delete" ON public."mailing_report_links";
CREATE POLICY "mailing_report_links_delete" ON public."mailing_report_links" FOR DELETE TO authenticated
USING ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.write')))
;
DROP POLICY "mailing_report_links_insert" ON public."mailing_report_links";
CREATE POLICY "mailing_report_links_insert" ON public."mailing_report_links" FOR INSERT TO authenticated
WITH CHECK ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.write')))
;
DROP POLICY "mailing_report_links_select" ON public."mailing_report_links";
CREATE POLICY "mailing_report_links_select" ON public."mailing_report_links" FOR SELECT TO authenticated
USING ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.read')))
;
DROP POLICY "mailing_report_links_update" ON public."mailing_report_links";
CREATE POLICY "mailing_report_links_update" ON public."mailing_report_links" FOR UPDATE TO authenticated
USING ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.write')))
WITH CHECK ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.write')))
;
DROP POLICY "mailing_seed_ledger_select" ON public."mailing_seed_ledger";
CREATE POLICY "mailing_seed_ledger_select" ON public."mailing_seed_ledger" FOR SELECT TO authenticated
USING ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.read')))
;
DROP POLICY "mailing_send_jobs_select" ON public."mailing_send_jobs";
CREATE POLICY "mailing_send_jobs_select" ON public."mailing_send_jobs" FOR SELECT TO authenticated
USING (EXISTS(SELECT 1 FROM public.email_campaigns c WHERE c.id=mailing_send_jobs.campaign_id AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(c.organization_id,'sales.read'))))
;
DROP POLICY "mailing_senders_delete" ON public."mailing_senders";
CREATE POLICY "mailing_senders_delete" ON public."mailing_senders" FOR DELETE TO authenticated
USING ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.write')))
;
DROP POLICY "mailing_senders_insert" ON public."mailing_senders";
CREATE POLICY "mailing_senders_insert" ON public."mailing_senders" FOR INSERT TO authenticated
WITH CHECK ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.write')))
;
DROP POLICY "mailing_senders_select" ON public."mailing_senders";
CREATE POLICY "mailing_senders_select" ON public."mailing_senders" FOR SELECT TO authenticated
USING ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.read')))
;
DROP POLICY "mailing_senders_update" ON public."mailing_senders";
CREATE POLICY "mailing_senders_update" ON public."mailing_senders" FOR UPDATE TO authenticated
USING ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.write')))
WITH CHECK ((public.has_role(auth.uid(),'admin'::public.app_role) OR public.can_access_organization(organization_id,'sales.write')))
;

CREATE OR REPLACE FUNCTION public.set_mailing_sender_warmup(p_sender_id uuid, p_enabled boolean DEFAULT NULL::boolean, p_daily_target integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_organization_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT organization_id
  INTO v_organization_id
  FROM public.mailing_senders
  WHERE id = p_sender_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sender_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.can_access_organization(v_organization_id, 'sales.write')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_enabled IS NULL AND p_daily_target IS NULL THEN
    RAISE EXCEPTION 'no_settings_supplied' USING ERRCODE = '22023';
  END IF;

  IF p_daily_target IS NOT NULL AND (p_daily_target < 1 OR p_daily_target > 10) THEN
    RAISE EXCEPTION 'daily_target_out_of_range' USING ERRCODE = '22023';
  END IF;

  IF p_enabled IS TRUE AND NOT EXISTS(SELECT 1 FROM public.mailing_senders WHERE id=p_sender_id AND is_active AND smtp_status='ok' AND imap_status='ok') THEN
    RAISE EXCEPTION 'warmup_requires_verified_active_sender' USING ERRCODE='22023';
  END IF;

  UPDATE public.mailing_senders
  SET
    warmup_enabled = COALESCE(p_enabled, warmup_enabled),
    warmup_daily_target = COALESCE(p_daily_target, warmup_daily_target),
    warmup_started_at = CASE
      WHEN p_enabled IS TRUE THEN COALESCE(warmup_started_at, now())
      ELSE warmup_started_at
    END,
    warmup_paused_reason = CASE
      WHEN p_enabled IS TRUE THEN NULL
      ELSE warmup_paused_reason
    END
  WHERE id = p_sender_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.set_mailing_sender_warmup(uuid,boolean,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_mailing_sender_warmup(uuid,boolean,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.import_mailing_senders_batch(p_organization_id uuid, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_row jsonb;
  v_email text;
  v_secret text;
  v_created int := 0;
  v_existing int := 0;
  v_invalid int := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF p_organization_id IS NULL THEN RAISE EXCEPTION 'organization_id_required'; END IF;
  IF NOT (
    public.has_role('admin'::public.app_role, auth.uid())
    OR public.can_access_organization(p_organization_id, 'sales.write')
  ) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'rows_must_be_array'; END IF;
  IF jsonb_array_length(p_rows) < 1 OR jsonb_array_length(p_rows) > 50 THEN
    RAISE EXCEPTION 'batch_size_out_of_range';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_email := lower(btrim(coalesce(v_row->>'email', '')));
    v_secret := coalesce(v_row->>'password', '');
    IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR v_secret = '' THEN
      v_invalid := v_invalid + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.mailing_senders (
      organization_id, label, from_name, from_email,
      smtp_host, smtp_port, smtp_security, smtp_username, password_encrypted,
      imap_host, imap_port, imap_security, imap_username,
      daily_limit, is_active, preset_key, created_by
    ) VALUES (
      p_organization_id,
      coalesce(nullif(btrim(v_row->>'label'), ''), v_email),
      nullif(btrim(v_row->>'from_name'), ''),
      v_email,
      coalesce(nullif(btrim(v_row->>'smtp_host'), ''), 'mail.torgi.com.ru'),
      coalesce(nullif(v_row->>'smtp_port', '')::integer, 465),
      coalesce(nullif(btrim(v_row->>'smtp_security'), ''), 'ssl'),
      coalesce(nullif(btrim(v_row->>'smtp_username'), ''), v_email),
      v_secret,
      coalesce(nullif(btrim(v_row->>'imap_host'), ''), 'mail.torgi.com.ru'),
      coalesce(nullif(v_row->>'imap_port', '')::integer, 993),
      coalesce(nullif(btrim(v_row->>'imap_security'), ''), 'ssl'),
      coalesce(nullif(btrim(v_row->>'imap_username'), ''), v_email),
      least(greatest(coalesce(nullif(v_row->>'daily_limit', '')::integer, 2), 1), 10),
      false,
      coalesce(nullif(btrim(v_row->>'preset_key'), ''), 'torgi'),
      auth.uid()
    )
    ON CONFLICT (organization_id, lower(from_email)) DO NOTHING;

    IF FOUND THEN v_created := v_created + 1;
    ELSE v_existing := v_existing + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('created', v_created, 'existing', v_existing, 'invalid', v_invalid);
END;
$function$;
REVOKE ALL ON FUNCTION public.import_mailing_senders_batch(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_mailing_senders_batch(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.activate_verified_mailing_senders(p_organization_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_activated integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF NOT (
    public.has_role('admin'::public.app_role, auth.uid())
    OR public.can_access_organization(p_organization_id, 'sales.write')
  ) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;

  UPDATE public.mailing_senders
  SET is_active = true, daily_limit = least(daily_limit, 2)
  WHERE organization_id = p_organization_id
    AND smtp_status = 'ok'
    AND imap_status = 'ok'
    AND is_active = false;
  GET DIAGNOSTICS v_activated = ROW_COUNT;
  RETURN v_activated;
END;
$function$;
REVOKE ALL ON FUNCTION public.activate_verified_mailing_senders(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.activate_verified_mailing_senders(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.attest_cold_outreach_campaign(p_campaign_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_org uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT organization_id INTO v_org FROM public.email_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign_not_found'; END IF;
  IF NOT (
    public.has_role('admin'::public.app_role, auth.uid())
    OR public.can_access_organization(v_org, 'sales.write')
  ) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.email_campaigns
  SET campaign_mode = 'cold_outreach', operator_attested_at = now(), operator_attested_by = auth.uid()
  WHERE id = p_campaign_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.attest_cold_outreach_campaign(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.attest_cold_outreach_campaign(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.import_mailing_contacts(p_organization_id uuid, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row jsonb;
  v_email text;
  v_added int := 0;
  v_dupes int := 0;
  v_invalid int := 0;
  v_seen text[] := ARRAY[]::text[];
  v_inserted uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;
  IF NOT (public.can_access_organization(p_organization_id, 'sales.write')) THEN
    RAISE EXCEPTION 'not authorized for this organization';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a json array';
  END IF;
  IF jsonb_array_length(p_rows) = 0 THEN
    RETURN jsonb_build_object('added', 0, 'duplicates', 0, 'invalid', 0);
  END IF;
  IF jsonb_array_length(p_rows) > 5000 THEN
    RAISE EXCEPTION 'too many rows in one import (max 5000)';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_email := lower(btrim(coalesce(v_row->>'email', '')));
    IF v_email = '' OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      v_invalid := v_invalid + 1;
      CONTINUE;
    END IF;
    IF v_email = ANY (v_seen) THEN
      v_dupes := v_dupes + 1;
      CONTINUE;
    END IF;
    v_seen := array_append(v_seen, v_email);

    INSERT INTO public.mailing_contacts (
      organization_id, email, first_name, last_name, organization, position, city, custom_fields, source
    ) VALUES (
      p_organization_id,
      v_email,
      nullif(btrim(coalesce(v_row->>'first_name','')), ''),
      nullif(btrim(coalesce(v_row->>'last_name','')), ''),
      nullif(btrim(coalesce(v_row->>'organization','')), ''),
      nullif(btrim(coalesce(v_row->>'position','')), ''),
      nullif(btrim(coalesce(v_row->>'city','')), ''),
      coalesce(v_row->'custom_fields', '{}'::jsonb),
      coalesce(nullif(btrim(coalesce(v_row->>'source','')), ''), 'import')
    )
    ON CONFLICT (organization_id, lower(email)) DO NOTHING
    RETURNING id INTO v_inserted;

    IF v_inserted IS NULL THEN
      v_dupes := v_dupes + 1;
    ELSE
      v_added := v_added + 1;
    END IF;
    v_inserted := NULL;
  END LOOP;

  RETURN jsonb_build_object('added', v_added, 'duplicates', v_dupes, 'invalid', v_invalid);
END;
$function$;
REVOKE ALL ON FUNCTION public.import_mailing_contacts(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_mailing_contacts(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_mailing_report_link(p_campaign_id uuid, p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_c public.email_campaigns;
  v_token text;
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 30);
BEGIN
  IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_c FROM public.email_campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Кампания не найдена';
  END IF;

  IF v_c.scope = 'platform' THEN
    IF NOT public.has_role('admin'::app_role, auth.uid()) THEN
      RAISE EXCEPTION 'Недостаточно прав';
    END IF;
  ELSE
    IF NOT (public.has_role('admin'::app_role, auth.uid())
            OR public.can_access_organization(v_c.organization_id, 'sales.write')) THEN
      RAISE EXCEPTION 'Недостаточно прав';
    END IF;
  END IF;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.mailing_report_links (campaign_id, organization_id, token, is_active, expires_at, created_by)
  VALUES (p_campaign_id, v_c.organization_id, v_token, true, now() + make_interval(days => v_days), auth.uid());

  RETURN jsonb_build_object('token', v_token, 'expires_at', now() + make_interval(days => v_days));
END;
$function$;
REVOKE ALL ON FUNCTION public.create_mailing_report_link(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_mailing_report_link(uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_mailing_report_link(p_link_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_link public.mailing_report_links;
  v_c public.email_campaigns;
BEGIN
  IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_link FROM public.mailing_report_links WHERE id = p_link_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  SELECT * INTO v_c FROM public.email_campaigns WHERE id = v_link.campaign_id;

  IF NOT (public.has_role('admin'::app_role, auth.uid())
          OR (v_c.scope <> 'platform' AND public.can_access_organization(v_c.organization_id, 'sales.write'))) THEN
    RAISE EXCEPTION 'Недостаточно прав';
  END IF;

  UPDATE public.mailing_report_links SET is_active = false, updated_at = now() WHERE id = p_link_id;
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.revoke_mailing_report_link(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revoke_mailing_report_link(uuid) TO authenticated;

-- Applies to RPC and legacy direct-column writes alike. No existing row changes.
CREATE OR REPLACE FUNCTION public.guard_mailing_sender_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $guard$
DECLARE smtp_changed boolean; imap_changed boolean;
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.smtp_status:='untested'; NEW.imap_status:='untested';
  NEW.last_tested_at:=NULL; NEW.imap_last_tested_at:=NULL;
  NEW.smtp_error_category:=NULL; NEW.imap_error_category:=NULL;
  NEW.smtp_latency_ms:=NULL; NEW.imap_latency_ms:=NULL;
  NEW.is_active:=false; NEW.warmup_enabled:=false;
  RETURN NEW;
 END IF;
 smtp_changed:=ROW(NEW.from_email,NEW.smtp_host,NEW.smtp_port,NEW.smtp_security,NEW.smtp_username,NEW.password_encrypted)
  IS DISTINCT FROM ROW(OLD.from_email,OLD.smtp_host,OLD.smtp_port,OLD.smtp_security,OLD.smtp_username,OLD.password_encrypted);
 imap_changed:=ROW(NEW.imap_host,NEW.imap_port,NEW.imap_security,coalesce(nullif(NEW.imap_username,''),NEW.smtp_username),NEW.password_encrypted)
  IS DISTINCT FROM ROW(OLD.imap_host,OLD.imap_port,OLD.imap_security,coalesce(nullif(OLD.imap_username,''),OLD.smtp_username),OLD.password_encrypted);
 IF smtp_changed THEN
  NEW.smtp_status:='untested'; NEW.last_tested_at:=NULL; NEW.smtp_error_category:=NULL; NEW.smtp_latency_ms:=NULL;
 END IF;
 IF imap_changed THEN
  NEW.imap_status:='untested'; NEW.imap_last_tested_at:=NULL; NEW.imap_error_category:=NULL; NEW.imap_latency_ms:=NULL;
 END IF;
 IF smtp_changed OR imap_changed THEN
  NEW.is_active:=false; NEW.warmup_enabled:=false; NEW.warmup_paused_reason:='credentials_changed'; NEW.last_error:=NULL;
 END IF;
 IF NEW.is_active AND (NEW.smtp_status<>'ok' OR NEW.imap_status<>'ok' OR nullif(NEW.password_encrypted,'') IS NULL) THEN
  RAISE EXCEPTION 'sender_requires_smtp_and_imap_verification' USING ERRCODE='22023';
 END IF;
 IF NOT NEW.is_active THEN
  NEW.warmup_enabled:=false;
  IF NOT smtp_changed AND NOT imap_changed AND OLD.is_active THEN NEW.warmup_paused_reason:='operator_disabled'; END IF;
 END IF;
 IF NEW.warmup_enabled AND (NOT NEW.is_active OR NEW.smtp_status<>'ok' OR NEW.imap_status<>'ok') THEN
  RAISE EXCEPTION 'warmup_requires_verified_active_sender' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END $guard$;
REVOKE ALL ON FUNCTION public.guard_mailing_sender_verification() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER mailing_sender_verification_guard
BEFORE INSERT OR UPDATE OF from_email,smtp_host,smtp_port,smtp_security,smtp_username,password_encrypted,
 imap_host,imap_port,imap_security,imap_username,is_active,warmup_enabled
ON public.mailing_senders FOR EACH ROW EXECUTE FUNCTION public.guard_mailing_sender_verification();

CREATE OR REPLACE FUNCTION public.save_mailing_sender(
 p_sender_id uuid,p_organization_id uuid,p_settings jsonb,p_password text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $save$
DECLARE existing jsonb:='{}'; draft public.mailing_senders; sender_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed()
  OR NOT public.can_access_organization(p_organization_id,'sales.write') THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
 END IF;
 IF p_settings IS NULL OR jsonb_typeof(p_settings)<>'object' THEN RAISE EXCEPTION 'settings_must_be_object' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_settings) k WHERE k NOT IN
  ('preset_key','label','from_name','from_email','smtp_host','smtp_port','smtp_security','smtp_username',
   'imap_host','imap_port','imap_security','imap_username','daily_limit')) THEN
  RAISE EXCEPTION 'unsupported_sender_setting' USING ERRCODE='22023';
 END IF;
 IF p_password IS NOT NULL AND (length(p_password)<1 OR length(p_password)>4096) THEN
  RAISE EXCEPTION 'invalid_password_length' USING ERRCODE='22023';
 END IF;
 IF p_sender_id IS NOT NULL THEN
  -- Deliberately select safe settings only; never decrypt or return the stored password.
  SELECT jsonb_build_object('preset_key',s.preset_key,'label',s.label,'from_name',s.from_name,'from_email',s.from_email,
   'smtp_host',s.smtp_host,'smtp_port',s.smtp_port,'smtp_security',s.smtp_security,'smtp_username',s.smtp_username,
   'imap_host',s.imap_host,'imap_port',s.imap_port,'imap_security',s.imap_security,'imap_username',s.imap_username,
   'daily_limit',s.daily_limit) INTO existing
  FROM public.mailing_senders s WHERE s.id=p_sender_id AND s.organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sender_not_found' USING ERRCODE='P0002'; END IF;
 ELSIF p_password IS NULL THEN RAISE EXCEPTION 'password_required' USING ERRCODE='22023';
 END IF;
 SELECT * INTO draft FROM jsonb_populate_record(NULL::public.mailing_senders,
  jsonb_build_object('smtp_port',465,'smtp_security','ssl','daily_limit',2)||existing||p_settings);
 draft.label:=btrim(draft.label); draft.from_email:=lower(btrim(draft.from_email));
 draft.smtp_host:=btrim(draft.smtp_host); draft.smtp_username:=btrim(draft.smtp_username);
 draft.imap_host:=nullif(btrim(draft.imap_host),''); draft.imap_username:=nullif(btrim(draft.imap_username),'');
 IF coalesce(draft.label,'')='' OR length(draft.label)>200 OR coalesce(draft.smtp_host,'')=''
  OR coalesce(draft.smtp_username,'')='' OR coalesce(draft.from_email,'') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  OR draft.smtp_host ~ '[[:space:]]' OR coalesce(draft.imap_host,'') ~ '[[:space:]]'
  OR draft.smtp_port IS NULL OR draft.smtp_port NOT BETWEEN 1 AND 65535
  OR draft.smtp_security IS NULL OR draft.smtp_security NOT IN ('ssl','starttls','none')
  OR draft.daily_limit IS NULL OR draft.daily_limit NOT BETWEEN 1 AND 200 THEN
  RAISE EXCEPTION 'invalid_sender_settings' USING ERRCODE='22023';
 END IF;
 IF draft.imap_host IS NOT NULL AND (draft.imap_port IS NULL OR draft.imap_port NOT BETWEEN 1 AND 65535
  OR draft.imap_security IS DISTINCT FROM 'ssl') THEN
  RAISE EXCEPTION 'imap_requires_tls_and_valid_port' USING ERRCODE='22023';
 END IF;
 IF p_sender_id IS NULL THEN
  INSERT INTO public.mailing_senders(organization_id,preset_key,label,from_name,from_email,
   smtp_host,smtp_port,smtp_security,smtp_username,password_encrypted,imap_host,imap_port,imap_security,imap_username,
   daily_limit,is_active,created_by)
  VALUES(p_organization_id,draft.preset_key,draft.label,draft.from_name,draft.from_email,
   draft.smtp_host,draft.smtp_port,draft.smtp_security,draft.smtp_username,public.encrypt_password(p_password),
   draft.imap_host,draft.imap_port,draft.imap_security,draft.imap_username,draft.daily_limit,false,auth.uid())
  RETURNING id INTO sender_id;
 ELSE
  UPDATE public.mailing_senders SET preset_key=draft.preset_key,label=draft.label,from_name=draft.from_name,
   from_email=draft.from_email,smtp_host=draft.smtp_host,smtp_port=draft.smtp_port,smtp_security=draft.smtp_security,
   smtp_username=draft.smtp_username,imap_host=draft.imap_host,imap_port=draft.imap_port,
   imap_security=draft.imap_security,imap_username=draft.imap_username,daily_limit=draft.daily_limit
  WHERE id=p_sender_id AND organization_id=p_organization_id;
  IF p_password IS NOT NULL THEN
   UPDATE public.mailing_senders SET password_encrypted=public.encrypt_password(p_password)
   WHERE id=p_sender_id AND organization_id=p_organization_id;
  END IF;
  sender_id:=p_sender_id;
 END IF;
 RETURN jsonb_build_object('id',sender_id);
END $save$;
REVOKE ALL ON FUNCTION public.save_mailing_sender(uuid,uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_mailing_sender(uuid,uuid,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_mailing_sender_active(p_sender_id uuid,p_organization_id uuid,p_is_active boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $active$
DECLARE sender_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed()
  OR NOT public.can_access_organization(p_organization_id,'sales.write') THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
 END IF;
 IF p_is_active IS NULL THEN RAISE EXCEPTION 'active_required' USING ERRCODE='22023'; END IF;
 UPDATE public.mailing_senders SET is_active=p_is_active WHERE id=p_sender_id AND organization_id=p_organization_id
 RETURNING id INTO sender_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'sender_not_found' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object('id',sender_id,'is_active',p_is_active);
END $active$;
REVOKE ALL ON FUNCTION public.set_mailing_sender_active(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_mailing_sender_active(uuid,uuid,boolean) TO authenticated;

-- Table SELECT overrides column restrictions; preserve non-secret UI reads only.
REVOKE SELECT ON public."mailing_senders" FROM authenticated,anon,PUBLIC;
REVOKE SELECT ("password_encrypted") ON public."mailing_senders" FROM authenticated,anon,PUBLIC;
GRANT SELECT ("id","organization_id","label","from_name","from_email","smtp_host","smtp_port","smtp_security","smtp_username","imap_host","imap_port","imap_security","imap_username","smtp_status","imap_status","last_tested_at","last_error","daily_limit","is_active","created_by","created_at","updated_at","preset_key","smtp_error_category","imap_error_category","smtp_latency_ms","imap_latency_ms","imap_last_tested_at","warmup_enabled","warmup_daily_target","warmup_start_count","warmup_started_at","warmup_paused_reason","warmup_last_run_at") ON public."mailing_senders" TO authenticated;

-- Table SELECT overrides column restrictions; preserve non-secret UI reads only.
REVOKE SELECT ON public."mailing_deliverability_seeds" FROM authenticated,anon,PUBLIC;
REVOKE SELECT ("secret_encrypted") ON public."mailing_deliverability_seeds" FROM authenticated,anon,PUBLIC;
GRANT SELECT ("id","organization_id","label","email","provider","imap_host","imap_port","imap_security","imap_username","auth_status","error_category","latency_ms","last_tested_at","last_checked_at","is_active","created_by","created_at","updated_at") ON public."mailing_deliverability_seeds" TO authenticated;

-- Table SELECT overrides column restrictions; preserve non-secret UI reads only.
REVOKE SELECT ON public."org_smtp_settings" FROM authenticated,anon,PUBLIC;
REVOKE SELECT ("password_encrypted") ON public."org_smtp_settings" FROM authenticated,anon,PUBLIC;
GRANT SELECT ("organization_id","host","port","username","from_email","from_name","encryption","is_verified","last_test_at","last_test_error","created_at","updated_at","provider_daily_limit","safe_warmup_enabled") ON public."org_smtp_settings" TO authenticated;
$mailing_source$; BEGIN
 IF md5(replace(source,chr(13)||chr(10),chr(10)))<>'73551f845a2946581879961f4676fb3a' THEN RAISE EXCEPTION 'Mailing source hash mismatch'; END IF;
 EXECUTE source;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261012160000','mailing_beta_sender_access',ARRAY[source]);
END $apply$;
DO $verify$ DECLARE r record; checks integer:=0; after_security jsonb; BEGIN
 FOR r IN SELECT 'policy:mailing_campaign_ledger.mailing_campaign_ledger_select' check_name,EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mailing_campaign_ledger' AND policyname='mailing_campaign_ledger_select' AND cmd='SELECT' AND roles=ARRAY['authenticated']::name[] AND permissive='PERMISSIVE' AND coalesce(qual,with_check) LIKE '%sales.read%' AND coalesce(qual,'') NOT LIKE '%current_organization_id%' AND coalesce(qual,'') NOT LIKE '%email.manage%' AND coalesce(with_check,'') NOT LIKE '%email.manage%') ok
UNION ALL
SELECT 'policy:mailing_campaign_replies.mailing_campaign_replies_select' check_name,EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mailing_campaign_replies' AND policyname='mailing_campaign_replies_select' AND cmd='SELECT' AND roles=ARRAY['authenticated']::name[] AND permissive='PERMISSIVE' AND coalesce(qual,with_check) LIKE '%sales.read%' AND coalesce(qual,'') NOT LIKE '%current_organization_id%' AND coalesce(qual,'') NOT LIKE '%email.manage%' AND coalesce(with_check,'') NOT LIKE '%email.manage%') ok
UNION ALL
SELECT 'policy:mailing_campaign_replies.mailing_campaign_replies_update' check_name,EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mailing_campaign_replies' AND policyname='mailing_campaign_replies_update' AND cmd='UPDATE' AND roles=ARRAY['authenticated']::name[] AND permissive='PERMISSIVE' AND coalesce(qual,with_check) LIKE '%sales.write%' AND coalesce(qual,'') NOT LIKE '%current_organization_id%' AND coalesce(qual,'') NOT LIKE '%email.manage%' AND coalesce(with_check,'') NOT LIKE '%email.manage%') ok
UNION ALL
SELECT 'policy:mailing_contacts.mailing_contacts_delete' check_name,EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mailing_contacts' AND policyname='mailing_contacts_delete' AND cmd='DELETE' AND roles=ARRAY['authenticated']::name[] AND permissive='PERMISSIVE' AND coalesce(qual,with_check) LIKE '%sales.write%' AND coalesce(qual,'') NOT LIKE '%current_organization_id%' AND coalesce(qual,'') NOT LIKE '%email.manage%' AND coalesce(with_check,'') NOT LIKE '%email.manage%') ok
UNION ALL
SELECT 'policy:mailing_contacts.mailing_contacts_insert' check_name,EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mailing_contacts' AND policyname='mailing_contacts_insert' AND cmd='INSERT' AND roles=ARRAY['authenticated']::name[] AND permissive='PERMISSIVE' AND coalesce(qual,with_check) LIKE '%sales.write%' AND coalesce(qual,'') NOT LIKE '%current_organization_id%' AND coalesce(qual,'') NOT LIKE '%email.manage%' AND coalesce(with_check,'') NOT LIKE '%email.manage%') ok
UNION ALL
SELECT 'policy:mailing_contacts.mailing_contacts_select' check_name,EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mailing_contacts' AND policyname='mailing_contacts_select' AND cmd='SELECT' AND roles=ARRAY['authenticated']::name[] AND permissive='PERMISSIVE' AND coalesce(qual,with_check) LIKE '%sales.read%' AND coalesce(qual,'') NOT LIKE '%current_organization_id%' AND coalesce(qual,'') NOT LIKE '%email.manage%' AND coalesce(with_check,'') NOT LIKE '%email.manage%') ok
UNION ALL
SELECT 'policy:mailing_contacts.mailing_contacts_update' check_name,EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mailing_contacts' AND policyname='mailing_contacts_update' AND cmd='UPDATE' AND roles=ARRAY['authenticated']::name[] AND permissive='PERMISSIVE' AND coalesce(qual,with_check) LIKE '%sales.write%' AND coalesce(qual,'') NOT LIKE '%current_organization_id%' AND coalesce(qual,'') NOT LIKE '%email.manage%' AND coalesce(with_check,'') NOT LIKE '%email.manage%') ok
UNION ALL
SELECT 'policy:mailing_deliverability_checks.mailing_deliverability_checks_select' check_name,EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mailing_deliverability_checks' AND policyname='mailing_deliverability_checks_select' AND cmd='SELECT' AND roles=ARRAY['authenticated']::name[] AND permissive='PERMISSIVE' AND coalesce(qual,with_check) LIKE '%sales.read%' AND coalesce(qual,'') NOT LIKE '%current_organization_id%' AND coalesce(qual,'') NOT LIKE '%email.manage%' AND coalesce(with_check,'') NOT LIKE '%email.manage%') ok
UNION ALL
SELECT 'policy:mailing_deliverability_seeds.mailing_deliverability_seeds_delete' check_name,EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mailing_deliverability_seeds' AND policyname='mailing_deliverability_seeds_delete' AND cmd='DELETE' AND roles=ARRAY['authenticated']::name[] AND permissive='PERMISSIVE' AND coalesce(qual,with_check) LIKE '%sales.write%' AND coalesce(qual,'') NOT LIKE '%current_organization_id%' AND coalesce(qual,'') NOT LIKE '%email.manage%' AND coalesce(with_check,'') NOT LIKE '%email.manage%') ok
UNION ALL
SELECT 'policy:mailing_deliverability_seeds.mailing_deliverability_seeds_insert' check_name,EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mailing_deliverability_seeds' AND policyname='mailing_deliverability_seeds_insert' AND cmd='INSERT' AND roles=ARRAY['authenticated']::name[] AND permissive='PERMISSIVE' AND coalesce(qual,with_check) LIKE '%sales.write%' AND coalesce(qual,'') NOT LIKE '%current_organization_id%' AND coalesce(qual,'') NOT LIKE '%email.manage%' AND coalesce(with_check,'') NOT LIKE '%email.manage%') ok
UNION ALL
SELECT 'policy:mailing_deliverability_seeds.mailing_deliverability_seeds_select' check_name,EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mailing_deliverability_seeds' AND policyname='mailing_deliverability_seeds_select' AND cmd='SELECT' AND roles=ARRAY['authenticated']::name[] AND permissive='PERMISSIVE' AND coalesce(qual,with_check) LIKE '%sales.read%' AND coalesce(qual,'') NOT LIKE '%current_organization_id%' AND coalesce(qual,'') NOT LIKE '%email.manage%' AND coalesce(with_check,'') NOT LIKE '%email.manage%') ok
UNION ALL
SELECT 'policy:mailing_deliverability_seeds.mailing_deliverability_seeds_update' check_name,EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mailing_deliverability_seeds' AND policyname='mailing_deliverability_seeds_update' AND cmd='UPDATE' AND roles=ARRAY['authenticated']::name[] AND permissive='PERMISSIVE' AND coalesce(qual,with_check) LIKE '%sales.write%' AND coalesce(qual,'') NOT LIKE '%current_organization_id%' AND coalesce(qual,'') NOT LIKE '%email.manage%' AND coalesce(with_check,'') NOT LIKE '%email.manage%') ok
UNION ALL
SELECT 'policy:mailing_reply_scan_state.mailing_reply_scan_state_select' check_name,EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mailing_reply_scan_state' AND policyname='mailing_reply_scan_state_select' AND cmd='SELECT' AND roles=ARRAY['authenticated']::name[] AND permissive='PERMISSIVE' AND coalesce(qual,with_check) LIKE '%sales.read%' AND coalesce(qual,'') NOT LIKE '%current_organization_id%' AND coalesce(qual,'') NOT LIKE '%email.manage%' AND coalesce(with_check,'') NOT LIKE '%email.manage%') ok
UNION ALL
SELECT 'policy:mailing_report_links.mailing_report_links_delete' check_name,EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mailing_report_links' AND policyname='mailing_report_links_delete' AND cmd='DELETE' AND roles=ARRAY['authenticated']::name[] AND permissive='PERMISSIVE' AND coalesce(qual,with_check) LIKE '%sales.write%' AND coalesce(qual,'') NOT LIKE '%current_organization_id%' AND coalesce(qual,'') NOT LIKE '%email.manage%' AND coalesce(with_check,'') NOT LIKE '%email.manage%') ok
UNION ALL
SELECT 'policy:mailing_report_links.mailing_report_links_insert' check_name,EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mailing_report_links' AND policyname='mailing_report_links_insert' AND cmd='INSERT' AND roles=ARRAY['authenticated']::name[] AND permissive='PERMISSIVE' AND coalesce(qual,with_check) LIKE '%sales.write%' AND coalesce(qual,'') NOT LIKE '%current_organization_id%' AND coalesce(qual,'') NOT LIKE '%email.manage%' AND coalesce(with_check,'') NOT LIKE '%email.manage%') ok
UNION ALL
SELECT 'policy:mailing_report_links.mailing_report_links_select' check_name,EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mailing_report_links' AND policyname='mailing_report_links_select' AND cmd='SELECT' AND roles=ARRAY['authenticated']::name[] AND permissive='PERMISSIVE' AND coalesce(qual,with_check) LIKE '%sales.read%' AND coalesce(qual,'') NOT LIKE '%current_organization_id%' AND coalesce(qual,'') NOT LIKE '%email.manage%' AND coalesce(with_check,'') NOT LIKE '%email.manage%') ok
UNION ALL
SELECT 'policy:mailing_report_links.mailing_report_links_update' check_name,EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mailing_report_links' AND policyname='mailing_report_links_update' AND cmd='UPDATE' AND roles=ARRAY['authenticated']::name[] AND permissive='PERMISSIVE' AND coalesce(qual,with_check) LIKE '%sales.write%' AND coalesce(qual,'') NOT LIKE '%current_organization_id%' AND coalesce(qual,'') NOT LIKE '%email.manage%' AND coalesce(with_check,'') NOT LIKE '%email.manage%') ok
UNION ALL
SELECT 'policy:mailing_seed_ledger.mailing_seed_ledger_select' check_name,EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mailing_seed_ledger' AND policyname='mailing_seed_ledger_select' AND cmd='SELECT' AND roles=ARRAY['authenticated']::name[] AND permissive='PERMISSIVE' AND coalesce(qual,with_check) LIKE '%sales.read%' AND coalesce(qual,'') NOT LIKE '%current_organization_id%' AND coalesce(qual,'') NOT LIKE '%email.manage%' AND coalesce(with_check,'') NOT LIKE '%email.manage%') ok
UNION ALL
SELECT 'policy:mailing_send_jobs.mailing_send_jobs_select' check_name,EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mailing_send_jobs' AND policyname='mailing_send_jobs_select' AND cmd='SELECT' AND roles=ARRAY['authenticated']::name[] AND permissive='PERMISSIVE' AND coalesce(qual,with_check) LIKE '%sales.read%' AND coalesce(qual,'') NOT LIKE '%current_organization_id%' AND coalesce(qual,'') NOT LIKE '%email.manage%' AND coalesce(with_check,'') NOT LIKE '%email.manage%') ok
UNION ALL
SELECT 'policy:mailing_senders.mailing_senders_delete' check_name,EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mailing_senders' AND policyname='mailing_senders_delete' AND cmd='DELETE' AND roles=ARRAY['authenticated']::name[] AND permissive='PERMISSIVE' AND coalesce(qual,with_check) LIKE '%sales.write%' AND coalesce(qual,'') NOT LIKE '%current_organization_id%' AND coalesce(qual,'') NOT LIKE '%email.manage%' AND coalesce(with_check,'') NOT LIKE '%email.manage%') ok
UNION ALL
SELECT 'policy:mailing_senders.mailing_senders_insert' check_name,EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mailing_senders' AND policyname='mailing_senders_insert' AND cmd='INSERT' AND roles=ARRAY['authenticated']::name[] AND permissive='PERMISSIVE' AND coalesce(qual,with_check) LIKE '%sales.write%' AND coalesce(qual,'') NOT LIKE '%current_organization_id%' AND coalesce(qual,'') NOT LIKE '%email.manage%' AND coalesce(with_check,'') NOT LIKE '%email.manage%') ok
UNION ALL
SELECT 'policy:mailing_senders.mailing_senders_select' check_name,EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mailing_senders' AND policyname='mailing_senders_select' AND cmd='SELECT' AND roles=ARRAY['authenticated']::name[] AND permissive='PERMISSIVE' AND coalesce(qual,with_check) LIKE '%sales.read%' AND coalesce(qual,'') NOT LIKE '%current_organization_id%' AND coalesce(qual,'') NOT LIKE '%email.manage%' AND coalesce(with_check,'') NOT LIKE '%email.manage%') ok
UNION ALL
SELECT 'policy:mailing_senders.mailing_senders_update' check_name,EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='mailing_senders' AND policyname='mailing_senders_update' AND cmd='UPDATE' AND roles=ARRAY['authenticated']::name[] AND permissive='PERMISSIVE' AND coalesce(qual,with_check) LIKE '%sales.write%' AND coalesce(qual,'') NOT LIKE '%current_organization_id%' AND coalesce(qual,'') NOT LIKE '%email.manage%' AND coalesce(with_check,'') NOT LIKE '%email.manage%') ok
UNION ALL
SELECT 'function:set_mailing_sender_warmup(uuid,boolean,integer)' check_name,EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.'||'set_mailing_sender_warmup(uuid,boolean,integer)') AND md5(replace(prosrc,chr(13)||chr(10),chr(10)))='bb670305950fac5beaf67d440a2f2def') ok
UNION ALL
SELECT 'function:import_mailing_senders_batch(uuid,jsonb)' check_name,EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.'||'import_mailing_senders_batch(uuid,jsonb)') AND md5(replace(prosrc,chr(13)||chr(10),chr(10)))='c660efb96f5ce331e40c913ebb6b550b') ok
UNION ALL
SELECT 'function:activate_verified_mailing_senders(uuid)' check_name,EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.'||'activate_verified_mailing_senders(uuid)') AND md5(replace(prosrc,chr(13)||chr(10),chr(10)))='df026c84c610b03bd39580d57b1607c1') ok
UNION ALL
SELECT 'function:attest_cold_outreach_campaign(uuid)' check_name,EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.'||'attest_cold_outreach_campaign(uuid)') AND md5(replace(prosrc,chr(13)||chr(10),chr(10)))='622cad16bd32920db5252e3a236fa8a0') ok
UNION ALL
SELECT 'function:import_mailing_contacts(uuid,jsonb)' check_name,EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.'||'import_mailing_contacts(uuid,jsonb)') AND md5(replace(prosrc,chr(13)||chr(10),chr(10)))='78df1b517a974c8323111388eb582c13') ok
UNION ALL
SELECT 'function:create_mailing_report_link(uuid,integer)' check_name,EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.'||'create_mailing_report_link(uuid,integer)') AND md5(replace(prosrc,chr(13)||chr(10),chr(10)))='658365c46016f180d0049475010ebe80') ok
UNION ALL
SELECT 'function:revoke_mailing_report_link(uuid)' check_name,EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.'||'revoke_mailing_report_link(uuid)') AND md5(replace(prosrc,chr(13)||chr(10),chr(10)))='54b5a8ff0779b5715ccd192b45f57d5c') ok
UNION ALL
SELECT 'function:guard_mailing_sender_verification()' check_name,EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.'||'guard_mailing_sender_verification()') AND md5(replace(prosrc,chr(13)||chr(10),chr(10)))='82e51c7fccb10f045d0e6048f2b3043c') ok
UNION ALL
SELECT 'function:save_mailing_sender(uuid,uuid,jsonb,text)' check_name,EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.'||'save_mailing_sender(uuid,uuid,jsonb,text)') AND md5(replace(prosrc,chr(13)||chr(10),chr(10)))='787422cfac36e1f04965e64e86046803') ok
UNION ALL
SELECT 'function:set_mailing_sender_active(uuid,uuid,boolean)' check_name,EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.'||'set_mailing_sender_active(uuid,uuid,boolean)') AND md5(replace(prosrc,chr(13)||chr(10),chr(10)))='225f12a1c394061349d2fb75f4053eb9') ok
UNION ALL
SELECT 'secret-read-denied:mailing_senders' check_name,NOT has_column_privilege('authenticated','public.mailing_senders','password_encrypted','SELECT') AND NOT has_column_privilege('anon','public.mailing_senders','password_encrypted','SELECT') AND has_column_privilege('service_role','public.mailing_senders','password_encrypted','SELECT') ok
UNION ALL
SELECT 'safe-settings-readable:mailing_senders' check_name,has_column_privilege('authenticated','public.mailing_senders','id','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','organization_id','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','label','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','from_name','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','from_email','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','smtp_host','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','smtp_port','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','smtp_security','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','smtp_username','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','imap_host','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','imap_port','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','imap_security','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','imap_username','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','smtp_status','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','imap_status','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','last_tested_at','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','last_error','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','daily_limit','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','is_active','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','created_by','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','created_at','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','updated_at','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','preset_key','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','smtp_error_category','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','imap_error_category','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','smtp_latency_ms','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','imap_latency_ms','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','imap_last_tested_at','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','warmup_enabled','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','warmup_daily_target','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','warmup_start_count','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','warmup_started_at','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','warmup_paused_reason','SELECT') AND has_column_privilege('authenticated','public.mailing_senders','warmup_last_run_at','SELECT') ok
UNION ALL
SELECT 'secret-read-denied:mailing_deliverability_seeds' check_name,NOT has_column_privilege('authenticated','public.mailing_deliverability_seeds','secret_encrypted','SELECT') AND NOT has_column_privilege('anon','public.mailing_deliverability_seeds','secret_encrypted','SELECT') AND has_column_privilege('service_role','public.mailing_deliverability_seeds','secret_encrypted','SELECT') ok
UNION ALL
SELECT 'safe-settings-readable:mailing_deliverability_seeds' check_name,has_column_privilege('authenticated','public.mailing_deliverability_seeds','id','SELECT') AND has_column_privilege('authenticated','public.mailing_deliverability_seeds','organization_id','SELECT') AND has_column_privilege('authenticated','public.mailing_deliverability_seeds','label','SELECT') AND has_column_privilege('authenticated','public.mailing_deliverability_seeds','email','SELECT') AND has_column_privilege('authenticated','public.mailing_deliverability_seeds','provider','SELECT') AND has_column_privilege('authenticated','public.mailing_deliverability_seeds','imap_host','SELECT') AND has_column_privilege('authenticated','public.mailing_deliverability_seeds','imap_port','SELECT') AND has_column_privilege('authenticated','public.mailing_deliverability_seeds','imap_security','SELECT') AND has_column_privilege('authenticated','public.mailing_deliverability_seeds','imap_username','SELECT') AND has_column_privilege('authenticated','public.mailing_deliverability_seeds','auth_status','SELECT') AND has_column_privilege('authenticated','public.mailing_deliverability_seeds','error_category','SELECT') AND has_column_privilege('authenticated','public.mailing_deliverability_seeds','latency_ms','SELECT') AND has_column_privilege('authenticated','public.mailing_deliverability_seeds','last_tested_at','SELECT') AND has_column_privilege('authenticated','public.mailing_deliverability_seeds','last_checked_at','SELECT') AND has_column_privilege('authenticated','public.mailing_deliverability_seeds','is_active','SELECT') AND has_column_privilege('authenticated','public.mailing_deliverability_seeds','created_by','SELECT') AND has_column_privilege('authenticated','public.mailing_deliverability_seeds','created_at','SELECT') AND has_column_privilege('authenticated','public.mailing_deliverability_seeds','updated_at','SELECT') ok
UNION ALL
SELECT 'secret-read-denied:org_smtp_settings' check_name,NOT has_column_privilege('authenticated','public.org_smtp_settings','password_encrypted','SELECT') AND NOT has_column_privilege('anon','public.org_smtp_settings','password_encrypted','SELECT') AND has_column_privilege('service_role','public.org_smtp_settings','password_encrypted','SELECT') ok
UNION ALL
SELECT 'safe-settings-readable:org_smtp_settings' check_name,has_column_privilege('authenticated','public.org_smtp_settings','organization_id','SELECT') AND has_column_privilege('authenticated','public.org_smtp_settings','host','SELECT') AND has_column_privilege('authenticated','public.org_smtp_settings','port','SELECT') AND has_column_privilege('authenticated','public.org_smtp_settings','username','SELECT') AND has_column_privilege('authenticated','public.org_smtp_settings','from_email','SELECT') AND has_column_privilege('authenticated','public.org_smtp_settings','from_name','SELECT') AND has_column_privilege('authenticated','public.org_smtp_settings','encryption','SELECT') AND has_column_privilege('authenticated','public.org_smtp_settings','is_verified','SELECT') AND has_column_privilege('authenticated','public.org_smtp_settings','last_test_at','SELECT') AND has_column_privilege('authenticated','public.org_smtp_settings','last_test_error','SELECT') AND has_column_privilege('authenticated','public.org_smtp_settings','created_at','SELECT') AND has_column_privilege('authenticated','public.org_smtp_settings','updated_at','SELECT') AND has_column_privilege('authenticated','public.org_smtp_settings','provider_daily_limit','SELECT') AND has_column_privilege('authenticated','public.org_smtp_settings','safe_warmup_enabled','SELECT') ok
UNION ALL
SELECT 'rpc-acl:set_mailing_sender_warmup(uuid,boolean,integer)' check_name,has_function_privilege('authenticated','public.set_mailing_sender_warmup(uuid,boolean,integer)','EXECUTE') AND NOT has_function_privilege('anon','public.set_mailing_sender_warmup(uuid,boolean,integer)','EXECUTE') ok
UNION ALL
SELECT 'rpc-acl:import_mailing_senders_batch(uuid,jsonb)' check_name,has_function_privilege('authenticated','public.import_mailing_senders_batch(uuid,jsonb)','EXECUTE') AND NOT has_function_privilege('anon','public.import_mailing_senders_batch(uuid,jsonb)','EXECUTE') ok
UNION ALL
SELECT 'rpc-acl:activate_verified_mailing_senders(uuid)' check_name,has_function_privilege('authenticated','public.activate_verified_mailing_senders(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.activate_verified_mailing_senders(uuid)','EXECUTE') ok
UNION ALL
SELECT 'rpc-acl:attest_cold_outreach_campaign(uuid)' check_name,has_function_privilege('authenticated','public.attest_cold_outreach_campaign(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.attest_cold_outreach_campaign(uuid)','EXECUTE') ok
UNION ALL
SELECT 'rpc-acl:import_mailing_contacts(uuid,jsonb)' check_name,has_function_privilege('authenticated','public.import_mailing_contacts(uuid,jsonb)','EXECUTE') AND NOT has_function_privilege('anon','public.import_mailing_contacts(uuid,jsonb)','EXECUTE') ok
UNION ALL
SELECT 'rpc-acl:create_mailing_report_link(uuid,integer)' check_name,has_function_privilege('authenticated','public.create_mailing_report_link(uuid,integer)','EXECUTE') AND NOT has_function_privilege('anon','public.create_mailing_report_link(uuid,integer)','EXECUTE') ok
UNION ALL
SELECT 'rpc-acl:revoke_mailing_report_link(uuid)' check_name,has_function_privilege('authenticated','public.revoke_mailing_report_link(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.revoke_mailing_report_link(uuid)','EXECUTE') ok
UNION ALL
SELECT 'rpc-acl:save_mailing_sender(uuid,uuid,jsonb,text)' check_name,has_function_privilege('authenticated','public.save_mailing_sender(uuid,uuid,jsonb,text)','EXECUTE') AND NOT has_function_privilege('anon','public.save_mailing_sender(uuid,uuid,jsonb,text)','EXECUTE') ok
UNION ALL
SELECT 'rpc-acl:set_mailing_sender_active(uuid,uuid,boolean)' check_name,has_function_privilege('authenticated','public.set_mailing_sender_active(uuid,uuid,boolean)','EXECUTE') AND NOT has_function_privilege('anon','public.set_mailing_sender_active(uuid,uuid,boolean)','EXECUTE') ok
UNION ALL
SELECT 'verification-trigger' check_name,EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.mailing_senders'::regclass AND tgname='mailing_sender_verification_guard' AND tgenabled='O' AND tgfoid='public.guard_mailing_sender_verification()'::regprocedure) ok
UNION ALL
SELECT 'restrictive-fences' check_name,(SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('mailing_campaign_ledger','mailing_campaign_replies','mailing_contacts','mailing_deliverability_checks','mailing_deliverability_seeds','mailing_reply_scan_state','mailing_report_links','mailing_seed_ledger','mailing_send_jobs','mailing_senders') AND permissive='RESTRICTIVE' AND policyname='account_deletion_no_revoked_access' AND md5(qual)='99a326c0f33883b22c156502d80e9740' AND md5(with_check)='99a326c0f33883b22c156502d80e9740')=10 ok LOOP IF r.ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Mailing postcheck failed: %',r.check_name; END IF; checks:=checks+1; END LOOP;
 SELECT security_snapshot INTO after_security FROM (SELECT jsonb_build_object(
 'helpers',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',p.proacl) ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.oid IN ('public.account_deletion_access_allowed()'::regprocedure,'public.can_access_organization(uuid,text)'::regprocedure,'public.get_decrypted_org_smtp(uuid)'::regprocedure,'public.get_mailing_deliverability_seed_secret(uuid)'::regprocedure,'public.get_mailing_sender_secret(uuid)'::regprocedure,'public.get_org_staff_permissions(uuid,uuid)'::regprocedure,'public.has_org_staff_permission(uuid,uuid,text)'::regprocedure,'public.has_role(app_role,uuid)'::regprocedure,'public.has_role(uuid,app_role)'::regprocedure,'public.normalize_org_staff_permission(text)'::regprocedure,'public.org_role_default_permissions(text)'::regprocedure,'public.trigger_encrypt_mailing_sender_password()'::regprocedure)),
 'table_security',(SELECT jsonb_agg(jsonb_build_object('table',relname,'owner',relowner,'rls',relrowsecurity,'force',relforcerowsecurity) ORDER BY relname) FROM pg_class WHERE relname IN ('email_campaign_recipients','email_campaigns','mailing_campaign_ledger','mailing_campaign_replies','mailing_contacts','mailing_deliverability_checks','mailing_deliverability_seeds','mailing_reply_scan_state','mailing_report_links','mailing_seed_ledger','mailing_send_jobs','mailing_senders','org_smtp_settings') AND relnamespace='public'::regnamespace),
 'other_policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public' AND tablename IN ('email_campaign_recipients','email_campaigns','mailing_campaign_ledger','mailing_campaign_replies','mailing_contacts','mailing_deliverability_checks','mailing_deliverability_seeds','mailing_reply_scan_state','mailing_report_links','mailing_seed_ledger','mailing_send_jobs','mailing_senders','org_smtp_settings') AND NOT (tablename LIKE 'mailing_%' AND permissive='PERMISSIVE')),
 'nonselect_table_grants',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'grantor',g.grantor,'grantee',g.grantee,'privilege',g.privilege_type,'grantable',g.is_grantable) ORDER BY c.relname,g.grantor,g.grantee,g.privilege_type) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) g WHERE c.relnamespace='public'::regnamespace AND c.relname IN ('email_campaign_recipients','email_campaigns','mailing_campaign_ledger','mailing_campaign_replies','mailing_contacts','mailing_deliverability_checks','mailing_deliverability_seeds','mailing_reply_scan_state','mailing_report_links','mailing_seed_ledger','mailing_send_jobs','mailing_senders','org_smtp_settings') AND g.privilege_type<>'SELECT'),
 'nonselect_column_grants',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'column',a.attname,'grantor',g.grantor,'grantee',g.grantee,'privilege',g.privilege_type,'grantable',g.is_grantable) ORDER BY c.relname,a.attname,g.grantor,g.grantee,g.privilege_type) FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid CROSS JOIN LATERAL aclexplode(a.attacl) g WHERE c.relnamespace='public'::regnamespace AND c.relname IN ('email_campaign_recipients','email_campaigns','mailing_campaign_ledger','mailing_campaign_replies','mailing_contacts','mailing_deliverability_checks','mailing_deliverability_seeds','mailing_reply_scan_state','mailing_report_links','mailing_seed_ledger','mailing_send_jobs','mailing_senders','org_smtp_settings') AND g.privilege_type<>'SELECT'),
 'existing_triggers',(SELECT jsonb_agg(jsonb_build_object('table',tgrelid,'name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) ORDER BY tgrelid,tgname) FROM pg_trigger WHERE tgrelid IN ('public.email_campaign_recipients'::regclass,'public.email_campaigns'::regclass,'public.mailing_campaign_ledger'::regclass,'public.mailing_campaign_replies'::regclass,'public.mailing_contacts'::regclass,'public.mailing_deliverability_checks'::regclass,'public.mailing_deliverability_seeds'::regclass,'public.mailing_reply_scan_state'::regclass,'public.mailing_report_links'::regclass,'public.mailing_seed_ledger'::regclass,'public.mailing_send_jobs'::regclass,'public.mailing_senders'::regclass,'public.org_smtp_settings'::regclass) AND NOT tgisinternal AND tgname<>'mailing_sender_verification_guard')
) AS security_snapshot) q;
 IF after_security IS DISTINCT FROM (SELECT security_snapshot FROM mailing_security_before) THEN RAISE EXCEPTION 'Unrelated mailing security changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261012160000' AND cardinality(statements)=1 AND md5(replace(statements[1],chr(13)||chr(10),chr(10)))='73551f845a2946581879961f4676fb3a') THEN RAISE EXCEPTION 'Mailing ledger mismatch'; END IF;
 INSERT INTO mailing_release_result VALUES(jsonb_build_object('committed',true,'checks_passed',checks,'ledger_source_match',true,'preserved_security',true,'transaction_id',txid_current()));
END $verify$;
NOTIFY pgrst,'reload schema'; COMMIT;
SELECT result AS release_result FROM mailing_release_result;
