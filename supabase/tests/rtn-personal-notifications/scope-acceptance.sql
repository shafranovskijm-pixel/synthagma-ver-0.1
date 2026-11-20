-- Additional synthetic real-guard scope/retention boundaries. No old tests replay.
SET ROLE postgres;
INSERT INTO rtn_private.sources(id,code,title,page_url,document_url,trusted_anchor_rule,parser) VALUES
 ('92000000-0000-4000-8000-000000001401','personal-industrial','Synthetic personal source A','https://www.gosnadzor.ru/service/list/lab/',
 'https://www.gosnadzor.ru/upload/lab-a.pdf','a1','industrial-pdf'),
 ('92000000-0000-4000-8000-000000001402','personal-energy','Synthetic personal source B','https://www.gosnadzor.ru/energy/lab/',
 'https://www.gosnadzor.ru/upload/lab-b.xlsx','energy-xlsx','energy-xlsx');
INSERT INTO rtn_private.banks(id,source_id,code,title,domain) VALUES
 ('93000000-0000-4000-8000-000000001401','92000000-0000-4000-8000-000000001401','PERSONAL-A','Synthetic personal bank A','industrial-safety'),
 ('93000000-0000-4000-8000-000000001402','92000000-0000-4000-8000-000000001402','PERSONAL-B','Synthetic personal bank B','energy_supervision_knowledge_check');
INSERT INTO auth.users(id) VALUES('81000000-0000-4000-8000-000000001407');
INSERT INTO public.profiles(id,user_id,organization_id,full_name)
 VALUES('71000000-0000-4000-8000-000000001407','81000000-0000-4000-8000-000000001407','cdd87239-1b04-47c9-8cd6-7ad57af4c54b','Synthetic personal pilot owner');
INSERT INTO public.user_roles VALUES('81000000-0000-4000-8000-000000001407','organization');
INSERT INTO rtn_private.pilot_grants(organization_id,bank_id)
 VALUES('cdd87239-1b04-47c9-8cd6-7ad57af4c54b','93000000-0000-4000-8000-000000001401');
UPDATE rtn_private.rollout_state SET stage='pilot' WHERE id=1;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000001407',false);
SELECT lab.keep('personal_pilot_options',public.get_my_rtn_subscription('cdd87239-1b04-47c9-8cd6-7ad57af4c54b'));
SELECT lab.check('personal topic options are exact current pilot bank vocabulary',
 lab.ctx('personal_pilot_options')#>'{options,topics}'='["general","industrial-safety"]'
 AND lab.ctx('personal_pilot_options')#>'{options,kinds}'='["news","source_change","bank_release"]');
SELECT lab.denied('personal hidden pilot bank topic is not selectable',
 $$SELECT public.save_my_rtn_subscription('cdd87239-1b04-47c9-8cd6-7ad57af4c54b',true,ARRAY['energy_supervision_knowledge_check'],ARRAY['source_change'],0)$$,'22023');
SELECT public.save_my_rtn_subscription('cdd87239-1b04-47c9-8cd6-7ad57af4c54b',true,ARRAY['industrial-safety'],ARRAY['source_change'],0);
SET ROLE postgres;
INSERT INTO rtn_private.source_revisions(id,source_id,sha256,original_path,media_type,byte_size,document_url) VALUES
 ('94000000-0000-4000-8000-000000001401','92000000-0000-4000-8000-000000001401',repeat('e',64),'personal/a.pdf','application/pdf',100,'https://www.gosnadzor.ru/upload/lab-a.pdf'),
 ('94000000-0000-4000-8000-000000001402','92000000-0000-4000-8000-000000001402',repeat('f',64),'personal/b.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',100,'https://www.gosnadzor.ru/upload/lab-b.xlsx');
INSERT INTO rtn_private.update_events(id,kind,topic,event_key,content_sha256,bank_id,source_revision_id,canonical_url,title,observed_at,historical,notifiable) VALUES
 ('90000000-0000-4000-8000-000000001401','source_change','industrial-safety','93000000-0000-4000-8000-000000001401:94000000-0000-4000-8000-000000001401',repeat('e',64),
 '93000000-0000-4000-8000-000000001401','94000000-0000-4000-8000-000000001401','https://www.gosnadzor.ru/upload/lab-a.pdf','Synthetic personal changed A',
 (SELECT enabled_since+interval '1 microsecond' FROM rtn_private.personal_subscriptions WHERE user_id='81000000-0000-4000-8000-000000001407'),false,true),
 ('90000000-0000-4000-8000-000000001402','source_change','energy_supervision_knowledge_check','93000000-0000-4000-8000-000000001402:94000000-0000-4000-8000-000000001402',repeat('f',64),
 '93000000-0000-4000-8000-000000001402','94000000-0000-4000-8000-000000001402','https://www.gosnadzor.ru/upload/lab-b.xlsx','Synthetic personal changed B',
 (SELECT enabled_since+interval '1 microsecond' FROM rtn_private.personal_subscriptions WHERE user_id='81000000-0000-4000-8000-000000001407'),false,true);
SET ROLE authenticated;
SELECT lab.keep('personal_pilot_pull',public.get_my_rtn_notifications('cdd87239-1b04-47c9-8cd6-7ad57af4c54b'));
SELECT lab.check('personal source event requires exact bank entitlement',
 lab.ctx('personal_pilot_pull')->>'materialized_count'='1'
 AND jsonb_array_length(lab.ctx('personal_pilot_pull')->'items')=1
 AND lab.ctx('personal_pilot_pull')#>>'{items,0,event,id}'='90000000-0000-4000-8000-000000001401');
SELECT lab.denied('personal read cannot open hidden bank event',
 $$SELECT public.mark_my_rtn_notifications_read('cdd87239-1b04-47c9-8cd6-7ad57af4c54b',ARRAY['90000000-0000-4000-8000-000000001402']::uuid[])$$);
SET ROLE postgres;
DELETE FROM rtn_private.pilot_grants WHERE organization_id='cdd87239-1b04-47c9-8cd6-7ad57af4c54b';
SET ROLE authenticated;
SELECT lab.denied('personal pilot grant withdrawal denies prior delivered history',
 $$SELECT public.get_my_rtn_notifications('cdd87239-1b04-47c9-8cd6-7ad57af4c54b')$$);
SET ROLE postgres;
UPDATE rtn_private.rollout_state SET stage='paid' WHERE id=1;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000999',false);
SELECT lab.check('personal agreed postpaid access remains admitted',public.get_my_rtn_subscription('44444444-4444-4444-8444-444444444444')->>'delivery_mode'='own_pull');
SELECT lab.denied('personal unpaid organization denied despite admin actor',
 $$SELECT public.get_my_rtn_subscription('33333333-3333-4333-8333-333333333333')$$);
SELECT lab.denied('personal expired paid access denied',
 $$SELECT public.get_my_rtn_subscription('55555555-5555-4555-8555-555555555555')$$);
SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000201',false);
SELECT lab.check('personal course-read teacher can manage only own preference',
 public.save_my_rtn_subscription('11111111-1111-4111-8111-111111111111',true,ARRAY['general'],ARRAY['news'],0)#>'{subscription,enabled}'='true');
SET ROLE postgres;
UPDATE public.org_staff SET expires_at=clock_timestamp()-interval '1 day' WHERE user_id='81000000-0000-4000-8000-000000000201';
SET ROLE authenticated;
SELECT lab.denied('personal expired staff cannot read own old preferences',
 $$SELECT public.get_my_rtn_subscription('11111111-1111-4111-8111-111111111111')$$);
SET ROLE postgres;
UPDATE public.org_staff SET expires_at=NULL WHERE user_id='81000000-0000-4000-8000-000000000201';
-- Empty organization with residual peer preferences must show a snapshot blocker.
INSERT INTO public.organizations(id,name,is_paid,paid_until,subscription_plan)
 VALUES('88888888-8888-4888-8888-888888888888','Synthetic personal retention',true,clock_timestamp()+interval '30 days','start');
INSERT INTO auth.users(id) VALUES('88880000-0000-4000-8000-000000001401');
INSERT INTO public.profiles(id,user_id,organization_id,full_name)
 VALUES('78888888-8888-4888-8888-888888888888','88880000-0000-4000-8000-000000001401','88888888-8888-4888-8888-888888888888','Synthetic retention owner');
INSERT INTO public.user_roles VALUES('88880000-0000-4000-8000-000000001401','organization');
INSERT INTO rtn_private.personal_subscriptions(organization_id,user_id,enabled,generation)
 VALUES('88888888-8888-4888-8888-888888888888','81000000-0000-4000-8000-000000000002',false,1);
SELECT lab.check('personal residual peer context enters empty organization snapshot blocker',
 jsonb_array_length(public.account_deletion_snapshot('88880000-0000-4000-8000-000000001401')->'blockers')>0);
INSERT INTO public.account_deletion_revocations VALUES('88880000-0000-4000-8000-000000001401');
INSERT INTO public.account_deletion_jobs(id,user_id,receipt_hash,state,consent_version,snapshot)
 VALUES('99000000-0000-4000-8000-000000001402','88880000-0000-4000-8000-000000001401','personal-retention-receipt','cleanup_pending','full-personal-data-v1',
 '{"emptyOrganization":true,"organizationId":"88888888-8888-4888-8888-888888888888"}');
SET ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT lab.check('personal peer context also blocks confirmed empty organization erasure',
 public.account_deletion_erase_data('99000000-0000-4000-8000-000000001402','personal-retention-receipt')->>'code'='PLAN_CHANGED');
SET ROLE postgres;
SELECT lab.check('personal retention denial preserves peer and owner without cascade',
 EXISTS(SELECT 1 FROM rtn_private.personal_subscriptions WHERE organization_id='88888888-8888-4888-8888-888888888888'
 AND user_id='81000000-0000-4000-8000-000000000002')
 AND EXISTS(SELECT 1 FROM public.profiles WHERE user_id='88880000-0000-4000-8000-000000001401'));
