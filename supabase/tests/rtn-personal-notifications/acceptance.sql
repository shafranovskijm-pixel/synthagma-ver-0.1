-- SYNTHETIC dedicated local fixture only. No live identities, events or erasure.
SET ROLE postgres;
SELECT lab.check('personal two private tables RLS and no direct ordinary or service writes',
 (SELECT count(*)=2 AND bool_and(relrowsecurity) FROM pg_class WHERE oid IN('rtn_private.personal_subscriptions'::regclass,'rtn_private.personal_deliveries'::regclass))
 AND NOT has_table_privilege('authenticated','rtn_private.personal_subscriptions','SELECT')
 AND NOT has_table_privilege('service_role','rtn_private.personal_deliveries','INSERT'));
SELECT lab.check('personal authenticated RPC grants exclude anon service sandbox and private helpers',
 has_function_privilege('authenticated','public.get_my_rtn_notifications(uuid,bigint,integer)','EXECUTE')
 AND NOT has_function_privilege('anon','public.get_my_rtn_subscription(uuid)','EXECUTE')
 AND NOT has_function_privilege('service_role','public.save_my_rtn_subscription(uuid,boolean,text[],text[],bigint)','EXECUTE')
 AND NOT has_function_privilege('sandbox_exec_atxwvjxbqjgkbjlhsdch','public.mark_my_rtn_notifications_read(uuid,uuid[])','EXECUTE')
 AND NOT has_function_privilege('authenticated','rtn_private.lock_personal_subject(uuid)','EXECUTE'));
SELECT lab.check('personal patches keep old function OIDs authority and unrelated source exact',
 NOT EXISTS(SELECT 1 FROM jsonb_array_elements(lab.ctx('personal_old_authority'))old
 LEFT JOIN pg_proc p ON p.oid=(old->>'oid')::oid
 WHERE p.oid IS NULL OR to_jsonb(p)-'prosrc' IS DISTINCT FROM old-'prosrc'
 OR(p.oid NOT IN('rtn_private.personal_counts(uuid)'::regprocedure,'rtn_private.erase_account_links(uuid,uuid)'::regprocedure,
 'rtn_private.organization_retention_count(uuid,uuid)'::regprocedure) AND p.prosrc IS DISTINCT FROM old->>'prosrc')));
UPDATE rtn_private.rollout_state SET stage='paid' WHERE id=1;
-- The only source-writing helper is synthetic fixture owner-only.
CREATE FUNCTION lab.personal_news(p_number integer,p_historical boolean DEFAULT false,p_notifiable boolean DEFAULT true,
 p_topic text DEFAULT 'general',p_observed timestamptz DEFAULT NULL,p_published timestamptz DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE event uuid;url text:='https://www.gosnadzor.ru/news/9/'||p_number||'/';new_time timestamptz;BEGIN
 -- Explicit synthetic after-cutoff time avoids WASM millisecond clock ties.
 new_time:=greatest(clock_timestamp(),(SELECT max(enabled_since)+interval '1 microsecond' FROM rtn_private.personal_subscriptions));
 INSERT INTO rtn_private.update_events(kind,topic,event_key,content_sha256,news_source_id,canonical_url,title,
  published_at,observed_at,historical,notifiable)
 VALUES('news',p_topic,url,md5(p_number::text)||md5(p_number::text),1,url,'Synthetic personal news '||p_number,
  coalesce(p_published,new_time),coalesce(p_observed,new_time),p_historical,p_notifiable) RETURNING id INTO event;
 RETURN event;
END;$fn$;
REVOKE ALL ON FUNCTION lab.personal_news(integer,boolean,boolean,text,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec_atxwvjxbqjgkbjlhsdch;
SELECT lab.personal_news(1,false,true,'general',clock_timestamp()-interval '1 day',clock_timestamp()-interval '1 day');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
SELECT lab.keep('personal_default',public.get_my_rtn_subscription('11111111-1111-4111-8111-111111111111'));
SELECT lab.check('personal missing preference is explicitly off generation zero',lab.ctx('personal_default')#>'{subscription,enabled}'='false'
 AND lab.ctx('personal_default')#>>'{subscription,generation}'='0' AND lab.ctx('personal_default')->>'delivery_mode'='own_pull');
SELECT lab.check('personal preference echoes only real caller and requested authorized organization',
 lab.ctx('personal_default')->>'actor_id'='81000000-0000-4000-8000-000000000001'
 AND lab.ctx('personal_default')->>'organization_id'='11111111-1111-4111-8111-111111111111');
SELECT lab.keep('personal_default_pull',public.get_my_rtn_notifications('11111111-1111-4111-8111-111111111111'));
SELECT lab.check('personal default pull does not materialize history',lab.ctx('personal_default_pull')->'items'='[]' AND lab.ctx('personal_default_pull')->>'unread_count'='0');
SELECT lab.denied('personal foreign organization denied',$$SELECT public.get_my_rtn_subscription('22222222-2222-4222-8222-222222222222')$$);
SELECT lab.denied('personal null enabled rejected',$$SELECT public.save_my_rtn_subscription('11111111-1111-4111-8111-111111111111',NULL,'{}','{}',0)$$,'22023');
SELECT lab.denied('personal missing generation rejected',$$SELECT public.save_my_rtn_subscription('11111111-1111-4111-8111-111111111111',true,ARRAY['general'],ARRAY['news'],NULL)$$,'22023');
SELECT lab.denied('personal arbitrary regex topic not approved',$$SELECT public.save_my_rtn_subscription('11111111-1111-4111-8111-111111111111',true,ARRAY['unregistered-topic'],ARRAY['news'],0)$$,'22023');
SELECT lab.denied('personal unsupported union kind rejected',$$SELECT public.save_my_rtn_subscription('11111111-1111-4111-8111-111111111111',true,ARRAY['general'],ARRAY['questions'],0)$$,'22023');
SELECT lab.denied('personal empty enabled selection rejected',$$SELECT public.save_my_rtn_subscription('11111111-1111-4111-8111-111111111111',true,'{}',ARRAY['news'],0)$$,'22023');
SELECT lab.denied('personal null array element rejected',$$SELECT public.save_my_rtn_subscription('11111111-1111-4111-8111-111111111111',true,ARRAY['general',NULL],ARRAY['news'],0)$$,'22023');
SELECT lab.denied('personal duplicate selection rejected',$$SELECT public.save_my_rtn_subscription('11111111-1111-4111-8111-111111111111',true,ARRAY['general','general'],ARRAY['news'],0)$$,'22023');
SELECT lab.denied('personal multidimensional selection rejected',$$SELECT public.save_my_rtn_subscription('11111111-1111-4111-8111-111111111111',true,ARRAY[['general']],ARRAY['news'],0)$$,'22023');
SELECT lab.check('personal off semantic noop does not create preference',public.save_my_rtn_subscription('11111111-1111-4111-8111-111111111111',false,'{}','{}',0)#>>'{subscription,generation}'='0');
SELECT lab.keep('personal_a_pref',public.save_my_rtn_subscription('11111111-1111-4111-8111-111111111111',true,ARRAY['general'],ARRAY['news'],0));
SELECT lab.check('personal enable has server cutoff and first generation',lab.ctx('personal_a_pref')#>>'{subscription,generation}'='1'
 AND lab.ctx('personal_a_pref')#>'{subscription,enabled_since}'<>'null' AND lab.ctx('personal_a_pref')#>'{subscription,effective_enabled}'='true');
SELECT lab.check('personal repeated identical save keeps cutoff generation',public.save_my_rtn_subscription('11111111-1111-4111-8111-111111111111',true,ARRAY['general'],ARRAY['news'],1)=lab.ctx('personal_a_pref'));
SELECT lab.denied('personal stale device CAS cannot overwrite',$$SELECT public.save_my_rtn_subscription('11111111-1111-4111-8111-111111111111',false,'{}','{}',0)$$,'40001');
SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',false);
SELECT public.save_my_rtn_subscription('22222222-2222-4222-8222-222222222222',true,ARRAY['general'],ARRAY['news'],0);
SET ROLE postgres;
SELECT lab.check('personal both genuine callers own separate preference rows',(SELECT count(*)=2 FROM rtn_private.personal_subscriptions));
SELECT lab.keep('personal_new_event',to_jsonb(lab.personal_news(2)));
SELECT lab.personal_news(3,true,false);
SELECT lab.personal_news(4,false,false);
SELECT lab.personal_news(5,false,true,'industrial-safety');
SELECT lab.personal_news(6,false,true,'general',clock_timestamp(),clock_timestamp()-interval '1 day');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
SELECT lab.keep('personal_first_pull',public.get_my_rtn_notifications('11111111-1111-4111-8111-111111111111'));
SELECT lab.check('personal only future subscribed nonhistorical notifiable event delivers',lab.ctx('personal_first_pull')->>'materialized_count'='1'
 AND jsonb_array_length(lab.ctx('personal_first_pull')->'items')=1
 AND lab.ctx('personal_first_pull')#>>'{items,0,event,id}'=lab.ctx('personal_new_event')#>>'{}');
SELECT lab.check('personal event payload matches canonical exact reader',lab.ctx('personal_first_pull')#>'{items,0,event}'=
 public.get_rtn_update('11111111-1111-4111-8111-111111111111',(lab.ctx('personal_new_event')#>>'{}')::uuid)->'event');
SELECT lab.check('personal replay pull is idempotent',public.get_my_rtn_notifications('11111111-1111-4111-8111-111111111111')->>'materialized_count'='0');
SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',false);
SELECT public.get_my_rtn_notifications('22222222-2222-4222-8222-222222222222');
SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
SELECT lab.denied('personal inaccessible canonical ID rejected',$$SELECT public.mark_my_rtn_notifications_read('11111111-1111-4111-8111-111111111111',ARRAY[(lab.ctx('personal_new_event')#>>'{}')::uuid,'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid])$$);
SELECT lab.check('personal failed read leaves own unread intact',public.get_my_rtn_notifications('11111111-1111-4111-8111-111111111111')->>'unread_count'='1');
SELECT lab.check('personal read affects only existing own event',public.mark_my_rtn_notifications_read('11111111-1111-4111-8111-111111111111',
 ARRAY[(lab.ctx('personal_new_event')#>>'{}')::uuid])->>'matched_count'='1');
SELECT lab.check('personal read repeat idempotent',public.mark_my_rtn_notifications_read('11111111-1111-4111-8111-111111111111',
 ARRAY[(lab.ctx('personal_new_event')#>>'{}')::uuid])->>'matched_count'='1');
SET ROLE postgres;
SELECT lab.check('personal peer stays unread on same canonical event',(SELECT read_at IS NULL FROM rtn_private.personal_deliveries
 WHERE recipient_user_id='81000000-0000-4000-8000-000000000002' AND event_id=(lab.ctx('personal_new_event')#>>'{}')::uuid));
SELECT lab.keep('personal_old_event',to_jsonb((SELECT id FROM rtn_private.update_events WHERE event_key='https://www.gosnadzor.ru/news/9/1/')));
SET ROLE authenticated;
SELECT lab.check('personal authorized event without own row is no-op not a delivery',public.mark_my_rtn_notifications_read('11111111-1111-4111-8111-111111111111',
 ARRAY[(lab.ctx('personal_old_event')#>>'{}')::uuid])->>'matched_count'='0');
SELECT public.save_my_rtn_subscription('11111111-1111-4111-8111-111111111111',false,'{}','{}',1);
SET ROLE postgres;
SELECT lab.personal_news(7);
SET ROLE authenticated;
SELECT lab.keep('personal_off_history',public.get_my_rtn_notifications('11111111-1111-4111-8111-111111111111'));
SELECT lab.check('personal unsubscribe stops new delivery and preserves own read history',
 lab.ctx('personal_off_history')->>'materialized_count'='0' AND jsonb_array_length(lab.ctx('personal_off_history')->'items')=1
 AND lab.ctx('personal_off_history')#>'{items,0,read_at}'<>'null');
SELECT public.save_my_rtn_subscription('11111111-1111-4111-8111-111111111111',true,ARRAY['general'],ARRAY['news'],2);
SELECT lab.check('personal resubscribe does not replay off-period news',public.get_my_rtn_notifications('11111111-1111-4111-8111-111111111111')->>'materialized_count'='0');
SET ROLE postgres;
SELECT lab.personal_news(n) FROM generate_series(100,150)n;
SET ROLE authenticated;
SELECT lab.keep('personal_batch',public.get_my_rtn_notifications('11111111-1111-4111-8111-111111111111',NULL,10));
SELECT lab.check('personal batch cap and pagination truthfully return incomplete',
 lab.ctx('personal_batch')->>'materialized_count'='50' AND lab.ctx('personal_batch')->'materialization_pending'='true'
 AND jsonb_array_length(lab.ctx('personal_batch')->'items')=10 AND lab.ctx('personal_batch')->'has_more'='true');
SELECT lab.keep('personal_last_batch',public.get_my_rtn_notifications('11111111-1111-4111-8111-111111111111'));
SELECT lab.check('personal bounded catchup eventually completes without duplicates',lab.ctx('personal_last_batch')->>'materialized_count'='1'
 AND lab.ctx('personal_last_batch')->'materialization_pending'='false' AND lab.ctx('personal_last_batch')->>'unread_count'='51');
SELECT lab.check('personal page cursor returns strictly older canonical sequences',
 NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.get_my_rtn_notifications('11111111-1111-4111-8111-111111111111',
 (lab.ctx('personal_batch')->>'next_before_sequence')::bigint,10)->'items')x
 WHERE(x#>>'{event,sequence}')::bigint>=(lab.ctx('personal_batch')->>'next_before_sequence')::bigint));
SELECT lab.denied('personal bounded page refuses oversized limit',$$SELECT public.get_my_rtn_notifications('11111111-1111-4111-8111-111111111111',NULL,51)$$,'22023');
SELECT lab.denied('personal negative cursor rejected',$$SELECT public.get_my_rtn_notifications('11111111-1111-4111-8111-111111111111',0,20)$$,'22023');
SET ROLE postgres;
UPDATE rtn_private.personal_subscriptions SET kinds=ARRAY['news','unsupported']
 WHERE user_id='81000000-0000-4000-8000-000000000001';
SELECT lab.personal_news(200);
SET ROLE authenticated;
SELECT lab.check('personal corrupted stored kind fails closed without new delivery',
 public.get_my_rtn_subscription('11111111-1111-4111-8111-111111111111')#>'{subscription,effective_enabled}'='false'
 AND public.get_my_rtn_subscription('11111111-1111-4111-8111-111111111111')#>'{subscription,needs_reconfiguration}'='true'
 AND public.get_my_rtn_notifications('11111111-1111-4111-8111-111111111111')->>'materialized_count'='0');
SET ROLE postgres;
UPDATE rtn_private.personal_subscriptions SET kinds=ARRAY['news',NULL]
 WHERE user_id='81000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SELECT lab.check('personal corrupted null kind fails closed',
 public.get_my_rtn_subscription('11111111-1111-4111-8111-111111111111')#>'{subscription,effective_enabled}'='false'
 AND public.get_my_rtn_notifications('11111111-1111-4111-8111-111111111111')->>'materialized_count'='0');
SET ROLE postgres;
UPDATE rtn_private.personal_subscriptions SET kinds=ARRAY[['news']]
 WHERE user_id='81000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SELECT lab.check('personal malformed stored dimensions are reconfigurable not enabled',
 public.get_my_rtn_subscription('11111111-1111-4111-8111-111111111111')#>'{subscription,needs_reconfiguration}'='true'
 AND public.get_my_rtn_notifications('11111111-1111-4111-8111-111111111111')->>'materialized_count'='0');
SET ROLE postgres;
UPDATE rtn_private.personal_subscriptions SET kinds=ARRAY['news']
 WHERE user_id='81000000-0000-4000-8000-000000000001';
UPDATE public.profiles SET blocked_at=clock_timestamp() WHERE user_id='81000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SELECT lab.denied('personal blocked actor cannot materialize',$$SELECT public.get_my_rtn_notifications('11111111-1111-4111-8111-111111111111')$$);
SET ROLE postgres;
UPDATE public.profiles SET blocked_at=NULL,archived_at=clock_timestamp() WHERE user_id='81000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SELECT lab.denied('personal archived actor cannot read old history',$$SELECT public.get_my_rtn_notifications('11111111-1111-4111-8111-111111111111')$$);
SET ROLE postgres;
UPDATE public.profiles SET archived_at=NULL WHERE user_id='81000000-0000-4000-8000-000000000001';
INSERT INTO billing_access_private.active_holds VALUES('11111111-1111-4111-8111-111111111111');
SET ROLE authenticated;
SELECT lab.denied('personal billing hold denies old unread data',$$SELECT public.get_my_rtn_notifications('11111111-1111-4111-8111-111111111111')$$);
SET ROLE postgres;
DELETE FROM billing_access_private.active_holds WHERE organization_id='11111111-1111-4111-8111-111111111111';
INSERT INTO public.account_deletion_revocations VALUES('81000000-0000-4000-8000-000000000001');
SET ROLE authenticated;
SELECT lab.denied('personal revoked actor cannot recreate state',$$SELECT public.save_my_rtn_subscription('11111111-1111-4111-8111-111111111111',false,'{}','{}',3)$$);
SET ROLE postgres;
DELETE FROM public.account_deletion_revocations WHERE user_id='81000000-0000-4000-8000-000000000001';
SELECT lab.denied('personal owner cannot delete without confirmed workflow',$$DELETE FROM rtn_private.personal_deliveries$$);
SET ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT lab.denied('personal service cannot call ordinary pull',$$SELECT public.get_my_rtn_notifications('11111111-1111-4111-8111-111111111111')$$);
SELECT lab.denied('personal service cannot directly insert recipient',$$INSERT INTO rtn_private.personal_subscriptions(organization_id,user_id,enabled,generation)VALUES('11111111-1111-4111-8111-111111111111','81000000-0000-4000-8000-000000000002',false,1)$$);
SET ROLE anon;
SELECT lab.denied('personal anonymous cannot read preference',$$SELECT public.get_my_rtn_subscription('11111111-1111-4111-8111-111111111111')$$);
SET ROLE postgres;
SELECT lab.check('personal count chain recognizes declared target links without content blocker',
 EXISTS(SELECT 1 FROM jsonb_array_elements(rtn_private.personal_counts('81000000-0000-4000-8000-000000000001'))x WHERE x->>'table'='rtn_private.personal_subscriptions')
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rtn_private.personal_counts('81000000-0000-4000-8000-000000000001'))x WHERE x->>'column'='content_reference_requires_review'));
SELECT lab.check('personal other recipient data blocks empty organization retention',rtn_private.organization_retention_count('11111111-1111-4111-8111-111111111111','81000000-0000-4000-8000-000000000002')>0);
-- Real confirmed erasure flow for synthetic nonowner editor, not a direct cleanup.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000202',false);
SELECT public.save_my_rtn_subscription('11111111-1111-4111-8111-111111111111',true,ARRAY['general'],ARRAY['news'],0);
SET ROLE postgres;
SELECT lab.personal_news(500);
SET ROLE authenticated;
SELECT public.get_my_rtn_notifications('11111111-1111-4111-8111-111111111111');
SET ROLE postgres;
SELECT lab.keep('personal_global_before_erase',(SELECT jsonb_agg(to_jsonb(e)ORDER BY sequence) FROM rtn_private.update_events e));
SELECT lab.keep('personal_peer_before_erase',(SELECT jsonb_agg(to_jsonb(d)ORDER BY id) FROM rtn_private.personal_deliveries d WHERE recipient_user_id='81000000-0000-4000-8000-000000000002'));
SELECT lab.check('personal snapshot counts new preferences and deliveries',EXISTS(SELECT 1 FROM jsonb_array_elements(public.account_deletion_snapshot('81000000-0000-4000-8000-000000000202')->'categories')x WHERE x->>'key'='rtn_training'));
INSERT INTO public.account_deletion_revocations VALUES('81000000-0000-4000-8000-000000000202');
INSERT INTO public.account_deletion_jobs(id,user_id,receipt_hash,state,consent_version,snapshot)
 VALUES('99000000-0000-4000-8000-000000001401','81000000-0000-4000-8000-000000000202','personal-synthetic-receipt','cleanup_pending','full-personal-data-v1',
 '{"emptyOrganization":false,"organizationId":"11111111-1111-4111-8111-111111111111"}');
SET ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',false);
SELECT lab.check('personal actual confirmed erasure bridge succeeds',public.account_deletion_erase_data('99000000-0000-4000-8000-000000001401','personal-synthetic-receipt')->>'erased'='true');
SET ROLE postgres;
SELECT lab.check('personal confirmed erasure removes only target new rows and final count empty',
 NOT EXISTS(SELECT 1 FROM rtn_private.personal_subscriptions WHERE user_id='81000000-0000-4000-8000-000000000202')
 AND NOT EXISTS(SELECT 1 FROM rtn_private.personal_deliveries WHERE recipient_user_id='81000000-0000-4000-8000-000000000202')
 AND rtn_private.personal_counts('81000000-0000-4000-8000-000000000202')='[]'
 AND lab.ctx('personal_peer_before_erase')=(SELECT jsonb_agg(to_jsonb(d)ORDER BY id) FROM rtn_private.personal_deliveries d WHERE recipient_user_id='81000000-0000-4000-8000-000000000002')
 AND lab.ctx('personal_global_before_erase')=(SELECT jsonb_agg(to_jsonb(e)ORDER BY sequence) FROM rtn_private.update_events e));
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT lab.denied('personal erased actor cannot recreate preferences',$$SELECT public.save_my_rtn_subscription('11111111-1111-4111-8111-111111111111',true,ARRAY['general'],ARRAY['news'],0)$$);
SET ROLE postgres;
-- A declared new table is not a blanket exemption for another embedded UUID.
UPDATE rtn_private.personal_subscriptions SET topics=ARRAY['81000000-0000-4000-8000-000000000002']
 WHERE user_id='81000000-0000-4000-8000-000000000002';
SELECT lab.check('personal unexpected UUID outside declared link remains review blocker',EXISTS(
 SELECT 1 FROM jsonb_array_elements(rtn_private.personal_counts('81000000-0000-4000-8000-000000000002'))x WHERE x->>'column'='content_reference_requires_review'));
SELECT lab.check('personal client course result invoice bytes preserved',lab.ctx('personal_old_data')=(SELECT jsonb_build_array(
 (SELECT jsonb_agg(c)FROM public.courses c),(SELECT jsonb_agg(t)FROM public.test_attempts t),(SELECT jsonb_agg(i)FROM public.subscription_invoices i))));
SELECT lab.check('personal erasure leaves no context or invented Auth deletion',NOT EXISTS(SELECT 1 FROM rtn_private.erasure_contexts)
 AND EXISTS(SELECT 1 FROM auth.users WHERE id='81000000-0000-4000-8000-000000000202'));
-- Restore actorA as the native race subject without altering any tested outcome.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
SET ROLE postgres;
