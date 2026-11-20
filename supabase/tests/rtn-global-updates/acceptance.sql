SET ROLE postgres;
SELECT lab.keep('updates_old_data',(SELECT jsonb_build_array((SELECT jsonb_agg(c) FROM public.courses c),
 (SELECT jsonb_agg(t) FROM public.test_attempts t),(SELECT jsonb_agg(i) FROM public.subscription_invoices i))));
SELECT lab.keep('updates_old_rtn_counts',jsonb_build_object('attempts',(SELECT count(*) FROM rtn_private.attempts),
 'assignments',(SELECT count(*) FROM rtn_private.assignments),'keys',(SELECT count(*) FROM rtn_private.key_sets)));
SELECT lab.check('new tables have RLS and no ordinary direct table privileges',
 (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN('rtn_private.news_sources'::regclass,'rtn_private.update_events'::regclass))
 AND NOT has_table_privilege('authenticated','rtn_private.update_events','SELECT')
 AND NOT has_table_privilege('service_role','rtn_private.update_events','INSERT')
 AND NOT has_table_privilege('anon','rtn_private.news_sources','SELECT'));
SELECT lab.check('public readers are authenticated only and private helpers remain private',
 has_function_privilege('authenticated','public.get_rtn_updates(uuid,text,text,bigint,integer)','EXECUTE')
 AND NOT has_function_privilege('anon','public.get_rtn_updates(uuid,text,text,bigint,integer)','EXECUTE')
 AND NOT has_function_privilege('service_role','public.get_rtn_update(uuid,uuid)','EXECUTE')
 AND NOT has_function_privilege('sandbox_exec_atxwvjxbqjgkbjlhsdch','public.get_rtn_update_summary(uuid)','EXECUTE')
 AND NOT has_function_privilege('authenticated','rtn_private.update_source_health()','EXECUTE'));
SELECT lab.check('provider default function grants and preexisting overload unchanged',
 lab.ctx('provider_function_defaults')=(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_default_acl d WHERE d.defaclrole='postgres'::regrole)
 AND lab.ctx('preexisting_rtn_overload')=(SELECT to_jsonb(p) FROM pg_proc p WHERE oid='public.get_rtn_workspace(text,integer)'::regprocedure));
SELECT lab.check('all three readers preserve explicit definer owner and restricted search path',
 (SELECT count(*)=3 AND bool_and(prosecdef AND provolatile='s' AND pg_get_userbyid(proowner)='postgres'
  AND proconfig=ARRAY['search_path=pg_catalog, public']) FROM pg_proc
  WHERE oid IN('public.get_rtn_updates(uuid,text,text,bigint,integer)'::regprocedure,
   'public.get_rtn_update(uuid,uuid)'::regprocedure,'public.get_rtn_update_summary(uuid)'::regprocedure)));
UPDATE rtn_private.rollout_state SET stage='paid' WHERE id=1;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
SELECT lab.keep('empty_feed',public.get_rtn_updates('11111111-1111-4111-8111-111111111111'));
SELECT lab.check('empty feed retains unknown never-checked source state',
 lab.ctx('empty_feed')->'events'='[]'::jsonb AND lab.ctx('empty_feed')#>>'{source_health,status}'='never_checked'
 AND lab.ctx('empty_feed')#>>'{source_health,coverage_kind}'='unknown'
 AND lab.ctx('empty_feed')#>'{source_health,last_success_at}'='null'::jsonb);
SELECT lab.denied('foreign organization read is denied',$$SELECT public.get_rtn_updates('22222222-2222-4222-8222-222222222222')$$);
SELECT lab.denied('invalid page limit is rejected',$$SELECT public.get_rtn_updates('11111111-1111-4111-8111-111111111111',NULL,NULL,NULL,51)$$,'22023');
SELECT lab.denied('invalid cursor is rejected',$$SELECT public.get_rtn_updates('11111111-1111-4111-8111-111111111111',NULL,NULL,0,20)$$,'22023');
SELECT lab.denied('unknown event kind is rejected',$$SELECT public.get_rtn_updates('11111111-1111-4111-8111-111111111111','official_keys')$$,'22023');
SET ROLE postgres;
UPDATE public.profiles SET blocked_at=now() WHERE user_id='81000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SELECT lab.denied('blocked actor read is denied',$$SELECT public.get_rtn_update_summary('11111111-1111-4111-8111-111111111111')$$);
SET ROLE postgres;
UPDATE public.profiles SET blocked_at=NULL,archived_at=now() WHERE user_id='81000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SELECT lab.denied('archived exact-organization actor is denied',$$SELECT public.get_rtn_update_summary('11111111-1111-4111-8111-111111111111')$$);
SET ROLE postgres;
UPDATE public.profiles SET archived_at=NULL WHERE user_id='81000000-0000-4000-8000-000000000001';
INSERT INTO public.account_deletion_revocations VALUES('81000000-0000-4000-8000-000000000001');
SET ROLE authenticated;
SELECT lab.denied('revoked actor read is denied',$$SELECT public.get_rtn_update_summary('11111111-1111-4111-8111-111111111111')$$);
SET ROLE postgres;
DELETE FROM public.account_deletion_revocations WHERE user_id='81000000-0000-4000-8000-000000000001';
INSERT INTO billing_access_private.active_holds VALUES('11111111-1111-4111-8111-111111111111');
SET ROLE authenticated;
SELECT lab.denied('billing hold denies feed despite paid plan',$$SELECT public.get_rtn_updates('11111111-1111-4111-8111-111111111111')$$);
SET ROLE postgres;
DELETE FROM billing_access_private.active_holds WHERE organization_id='11111111-1111-4111-8111-111111111111';
UPDATE public.organizations SET paid_until=now()-interval '1 second' WHERE id='11111111-1111-4111-8111-111111111111';
SET ROLE authenticated;
SELECT lab.denied('expired subscription denies feed',$$SELECT public.get_rtn_updates('11111111-1111-4111-8111-111111111111')$$);
SET ROLE postgres;
UPDATE public.organizations SET paid_until=now()+interval '30 days' WHERE id='11111111-1111-4111-8111-111111111111';
-- Global public news metadata only; these are invented synthetic test fixtures.
INSERT INTO rtn_private.update_events(id,kind,topic,event_key,content_sha256,news_source_id,canonical_url,title,published_at)
 VALUES('90000000-0000-4000-8000-000000000001','news','general','https://www.gosnadzor.ru/news/1/100/',repeat('a',64),1,
 'https://www.gosnadzor.ru/news/1/100/','Synthetic official news title','2026-11-20T10:00:00Z');
SELECT lab.denied('duplicate source hash cannot create another event',$$INSERT INTO rtn_private.update_events(kind,topic,event_key,content_sha256,news_source_id,canonical_url,title,published_at)
 VALUES('news','general','https://www.gosnadzor.ru/news/1/100/',repeat('a',64),1,'https://www.gosnadzor.ru/news/1/100/','Duplicate','2026-11-20T10:00:00Z')$$,'23505');
INSERT INTO rtn_private.update_events(id,kind,topic,event_key,content_sha256,previous_event_id,news_source_id,canonical_url,title,published_at)
 VALUES('90000000-0000-4000-8000-000000000002','news','general','https://www.gosnadzor.ru/news/1/100/',repeat('b',64),
 '90000000-0000-4000-8000-000000000001',1,'https://www.gosnadzor.ru/news/1/100/','Explicit correction','2026-11-20T10:00:00Z');
SELECT lab.denied('stale predecessor cannot fork news correction history',$$INSERT INTO rtn_private.update_events(kind,topic,event_key,content_sha256,previous_event_id,news_source_id,canonical_url,title,published_at)
 VALUES('news','general','https://www.gosnadzor.ru/news/1/100/',repeat('c',64),'90000000-0000-4000-8000-000000000001',1,
 'https://www.gosnadzor.ru/news/1/100/','Fork attempt','2026-11-20T10:00:00Z')$$,'23514');
SELECT lab.denied('global news rejects unofficial source URLs',$$INSERT INTO rtn_private.update_events(kind,topic,event_key,content_sha256,news_source_id,canonical_url,title,published_at)
 VALUES('news','general','https://attacker.test/news/1/100/',repeat('c',64),1,'https://attacker.test/news/1/100/','Wrong host','2026-11-20T10:00:00Z')$$,'23514');
SELECT lab.denied('news event cannot omit its fixed source identity',$$INSERT INTO rtn_private.update_events(kind,topic,event_key,content_sha256,canonical_url,title,published_at)
 VALUES('news','general','https://www.gosnadzor.ru/news/1/101/',repeat('c',64),'https://www.gosnadzor.ru/news/1/101/','Missing identity','2026-11-20T10:00:00Z')$$,'23514');
SELECT lab.denied('news cannot claim normative effective date',$$INSERT INTO rtn_private.update_events(kind,topic,event_key,content_sha256,news_source_id,canonical_url,title,published_at,effective_from)
 VALUES('news','general','https://www.gosnadzor.ru/news/1/101/',repeat('c',64),1,'https://www.gosnadzor.ru/news/1/101/','Not law','2026-11-20T10:00:00Z','2026-11-21')$$,'23514');
SELECT lab.denied('historical event cannot be notifiable',$$INSERT INTO rtn_private.update_events(kind,topic,event_key,content_sha256,news_source_id,canonical_url,title,published_at,notifiable)
 VALUES('news','general','https://www.gosnadzor.ru/news/1/101/',repeat('c',64),1,'https://www.gosnadzor.ru/news/1/101/','No bootstrap blast','2026-11-20T10:00:00Z',true)$$,'23514');
SELECT lab.denied('stored news event cannot be overwritten',$$UPDATE rtn_private.update_events SET title='Overwrite' WHERE id='90000000-0000-4000-8000-000000000001'$$);
SELECT lab.denied('stored news event cannot be deleted',$$DELETE FROM rtn_private.update_events WHERE id='90000000-0000-4000-8000-000000000001'$$);
SELECT lab.denied('global history cannot be truncated',$$TRUNCATE rtn_private.update_events$$);
SET ROLE authenticated;
SELECT lab.keep('feed_page',public.get_rtn_updates('11111111-1111-4111-8111-111111111111','news','general',NULL,1));
SELECT lab.check('bounded keyset page returns one event and explicit continuation',jsonb_array_length(lab.ctx('feed_page')->'events')=1
 AND(lab.ctx('feed_page')->>'has_more')::boolean AND lab.ctx('feed_page')#>>'{events,0,id}'='90000000-0000-4000-8000-000000000002');
SELECT lab.keep('feed_second',public.get_rtn_updates('11111111-1111-4111-8111-111111111111','news','general',(lab.ctx('feed_page')->>'next_before_sequence')::bigint,1));
SELECT lab.check('cursor continuation preserves old explicit version',lab.ctx('feed_second')#>>'{events,0,id}'='90000000-0000-4000-8000-000000000001'
 AND NOT(lab.ctx('feed_second')->>'has_more')::boolean);
SELECT lab.keep('exact_event',public.get_rtn_update('11111111-1111-4111-8111-111111111111','90000000-0000-4000-8000-000000000002'));
SELECT lab.keep('event_summary',public.get_rtn_update_summary('11111111-1111-4111-8111-111111111111'));
SELECT lab.check('feed detail and homepage summary resolve same immutable event',lab.ctx('exact_event')->'event'=lab.ctx('feed_page')#>'{events,0}'
 AND lab.ctx('exact_event')->'event'=lab.ctx('event_summary')->'latest_event'
 AND lab.ctx('event_summary')->>'count_semantics'='known_events_not_unread');
SELECT lab.denied('missing exact event is not a fabricated empty detail',$$SELECT public.get_rtn_update('11111111-1111-4111-8111-111111111111','90000000-0000-4000-8000-000000000099')$$);
SET ROLE postgres;
-- Unknown personal UUID text must still be found by the existing scanner. The
-- new global table does not receive a blanket privacy exemption.
INSERT INTO rtn_private.update_events(kind,topic,event_key,content_sha256,news_source_id,canonical_url,title,own_summary,published_at)
 VALUES('news','general','https://www.gosnadzor.ru/news/1/102/',repeat('d',64),1,'https://www.gosnadzor.ru/news/1/102/',
 'Synthetic scanner sentinel','81000000-0000-4000-8000-000000000001','2026-11-20T10:00:00Z');
SELECT lab.check('unknown personal content reference remains fail closed',EXISTS(SELECT 1 FROM jsonb_array_elements(rtn_private.personal_counts('81000000-0000-4000-8000-000000000001')) x
 WHERE x->>'table'='rtn_private.update_events' AND x->>'column'='content_reference_requires_review'));
SELECT lab.check('existing client course result and invoice bytes unchanged',lab.ctx('updates_old_data')=(SELECT jsonb_build_array(
 (SELECT jsonb_agg(c) FROM public.courses c),(SELECT jsonb_agg(t) FROM public.test_attempts t),(SELECT jsonb_agg(i) FROM public.subscription_invoices i))));
SELECT lab.check('no old RTN assignments attempts keys were created or rewritten',lab.ctx('updates_old_rtn_counts')=jsonb_build_object(
 'attempts',(SELECT count(*) FROM rtn_private.attempts),'assignments',(SELECT count(*) FROM rtn_private.assignments),'keys',(SELECT count(*) FROM rtn_private.key_sets)));

-- Additional explicitly synthetic source/release rows qualify the event
-- reference boundaries; they are not a real normative publication/learning run.
INSERT INTO rtn_private.sources(id,code,title,page_url,document_url,trusted_anchor_rule,parser) VALUES
 ('92000000-0000-4000-8000-000000000001','lab-industrial','Synthetic source A','https://www.gosnadzor.ru/service/list/lab/',
  'https://www.gosnadzor.ru/upload/lab-a.pdf','a1','industrial-pdf'),
 ('92000000-0000-4000-8000-000000000002','lab-energy','Synthetic source B','https://www.gosnadzor.ru/energy/lab/',
  'https://www.gosnadzor.ru/upload/lab-b.xlsx','energy-xlsx','energy-xlsx');
INSERT INTO rtn_private.banks(id,source_id,code,title,domain) VALUES
 ('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','LAB-A','Synthetic bank A','industrial-safety'),
 ('93000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000002','LAB-B','Synthetic bank B','energy_supervision_knowledge_check');
INSERT INTO rtn_private.source_revisions(id,source_id,sha256,original_path,media_type,byte_size,document_url) VALUES
 ('94000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',repeat('e',64),'lab/a.pdf','application/pdf',100,'https://www.gosnadzor.ru/upload/lab-a.pdf'),
 ('94000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000002',repeat('f',64),'lab/b.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',100,'https://www.gosnadzor.ru/upload/lab-b.xlsx');
INSERT INTO rtn_private.update_events(id,kind,topic,event_key,content_sha256,bank_id,source_revision_id,canonical_url,title) VALUES
 ('90000000-0000-4000-8000-000000000010','source_change','industrial-safety','93000000-0000-4000-8000-000000000001:94000000-0000-4000-8000-000000000001',repeat('e',64),
 '93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','https://www.gosnadzor.ru/upload/lab-a.pdf','Synthetic changed source A'),
 ('90000000-0000-4000-8000-000000000011','source_change','energy_supervision_knowledge_check','93000000-0000-4000-8000-000000000002:94000000-0000-4000-8000-000000000002',repeat('f',64),
 '93000000-0000-4000-8000-000000000002','94000000-0000-4000-8000-000000000002','https://www.gosnadzor.ru/upload/lab-b.xlsx','Synthetic changed source B');
SELECT lab.denied('source event rejects cross-bank source revision',$$INSERT INTO rtn_private.update_events(kind,topic,event_key,content_sha256,bank_id,source_revision_id,canonical_url,title)
 VALUES('source_change','industrial-safety','wrong-identity',repeat('f',64),'93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000002',
 'https://www.gosnadzor.ru/upload/lab-b.xlsx','Invalid source pair')$$,'23514');
INSERT INTO rtn_private.bank_revisions(id,bank_id,source_revision_id,questions,normalized_sha256,normalization_note,question_count)
 VALUES('95000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001',
 '[{"id":"fixture-q1","number":1,"text":"Synthetic question","options":[]}]',repeat('e',64),'Synthetic fixture only; not a real normalized bank',1);
INSERT INTO rtn_private.key_sets(id,bank_id,bank_revision_id,questions,display_title,source_generation,review_note,reviewed_by)
 VALUES('96000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','[]',
 'Synthetic key reference',1,'Synthetic schema fixture only; no approved content','81000000-0000-4000-8000-000000000999');
INSERT INTO rtn_private.releases(id,bank_id,key_set_id,effective_from,release_note,published_by,published_at)
 VALUES('97000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001',
 '2026-11-20','Synthetic release reference only; not admission acceptance','81000000-0000-4000-8000-000000000999','2026-11-20T10:00:00Z');
INSERT INTO rtn_private.update_events(id,kind,topic,event_key,content_sha256,bank_id,source_revision_id,release_id,canonical_url,title,published_at,effective_from)
 VALUES('90000000-0000-4000-8000-000000000012','bank_release','industrial-safety','97000000-0000-4000-8000-000000000001',repeat('e',64),
 '93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','97000000-0000-4000-8000-000000000001',
 'https://www.gosnadzor.ru/upload/lab-a.pdf','Synthetic preparation release','2026-11-20T10:00:00Z','2026-11-20');
SELECT lab.denied('release event rejects invented publication date',$$INSERT INTO rtn_private.update_events(kind,topic,event_key,content_sha256,bank_id,source_revision_id,release_id,canonical_url,title,published_at,effective_from)
 VALUES('bank_release','industrial-safety','97000000-0000-4000-8000-000000000001',repeat('e',64),'93000000-0000-4000-8000-000000000001',
 '94000000-0000-4000-8000-000000000001','97000000-0000-4000-8000-000000000001','https://www.gosnadzor.ru/upload/lab-a.pdf',
 'Wrong publication','2026-11-21T10:00:00Z','2026-11-20')$$,'23514');
SELECT lab.check('source and release event kinds retain distinct factual identities',
 (SELECT count(*)=3 FROM rtn_private.update_events WHERE kind IN('source_change','bank_release'))
 AND(SELECT published_at IS NULL AND effective_from IS NULL FROM rtn_private.update_events WHERE id='90000000-0000-4000-8000-000000000010')
 AND(SELECT published_at='2026-11-20T10:00:00Z'::timestamptz AND effective_from='2026-11-20'::date FROM rtn_private.update_events WHERE id='90000000-0000-4000-8000-000000000012'));
SET ROLE authenticated;
SELECT lab.keep('questions_page',public.get_rtn_updates('11111111-1111-4111-8111-111111111111','questions',NULL,NULL,1));
SELECT lab.keep('questions_second',public.get_rtn_updates('11111111-1111-4111-8111-111111111111','questions',NULL,
 (lab.ctx('questions_page')->>'next_before_sequence')::bigint,2));
SELECT lab.check('questions union filter uses one ordered cursor across source and release events',
 lab.ctx('questions_page')#>>'{events,0,kind}'='bank_release'
 AND(lab.ctx('questions_page')->>'has_more')::boolean
 AND jsonb_array_length(lab.ctx('questions_second')->'events')=2
 AND NOT(lab.ctx('questions_second')->>'has_more')::boolean
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(lab.ctx('questions_second')->'events') x WHERE x->>'kind'<>'source_change'));
SET ROLE postgres;
INSERT INTO public.profiles(id,user_id,organization_id,full_name)
 VALUES('71000000-0000-4000-8000-000000000707','81000000-0000-4000-8000-000000000707','cdd87239-1b04-47c9-8cd6-7ad57af4c54b','Synthetic pilot owner');
INSERT INTO public.user_roles VALUES('81000000-0000-4000-8000-000000000707','organization');
INSERT INTO rtn_private.pilot_grants(organization_id,bank_id)
 VALUES('cdd87239-1b04-47c9-8cd6-7ad57af4c54b','93000000-0000-4000-8000-000000000001');
UPDATE rtn_private.rollout_state SET stage='pilot' WHERE id=1;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000707',false);
SELECT lab.keep('pilot_feed',public.get_rtn_updates('cdd87239-1b04-47c9-8cd6-7ad57af4c54b'));
SELECT lab.check('pilot reader sees only granted bank metadata plus public news',
 EXISTS(SELECT 1 FROM jsonb_array_elements(lab.ctx('pilot_feed')->'events') x WHERE x->>'bank_id'='93000000-0000-4000-8000-000000000001')
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(lab.ctx('pilot_feed')->'events') x WHERE x->>'bank_id'='93000000-0000-4000-8000-000000000002'));
SELECT lab.denied('hidden bank exact event is denied despite another pilot bank grant',$$SELECT public.get_rtn_update('cdd87239-1b04-47c9-8cd6-7ad57af4c54b','90000000-0000-4000-8000-000000000011')$$);
SET ROLE postgres;
UPDATE rtn_private.rollout_state SET stage='paid' WHERE id=1;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000999',false);
SELECT lab.check('agreed postpaid organization retains source metadata access',public.get_rtn_update_summary('44444444-4444-4444-8444-444444444444')->>'count_semantics'='known_events_not_unread');
SELECT lab.denied('unpaid ungranted organization remains denied',$$SELECT public.get_rtn_update_summary('33333333-3333-4333-8333-333333333333')$$);
SET ROLE postgres;
UPDATE rtn_private.news_sources SET last_status='partial',last_checked_at='2026-11-20T10:00:00Z',last_success_at='2026-11-20T10:00:00Z',
 coverage_kind='finite_rss_window',coverage_from='2026-11-19T10:00:00Z',coverage_until='2026-11-20T10:00:00Z' WHERE id=1;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000001',false);
SELECT lab.check('finite RSS health remains partial and never claims full archive',
 public.get_rtn_update_summary('11111111-1111-4111-8111-111111111111')#>>'{source_health,status}'='partial'
 AND public.get_rtn_update_summary('11111111-1111-4111-8111-111111111111')#>'{source_health,complete_archive}'='false'::jsonb);
SET ROLE postgres;
INSERT INTO rtn_private.update_events(kind,topic,event_key,content_sha256,news_source_id,canonical_url,title,published_at)
 SELECT 'news','general','https://www.gosnadzor.ru/news/2/'||n::text||'/',repeat('a',64),1,
 'https://www.gosnadzor.ru/news/2/'||n::text||'/','Synthetic bounded count fixture '||n,'2026-11-20T10:00:00Z'::timestamptz
 FROM generate_series(1000,2000) n;
SET ROLE authenticated;
SELECT lab.keep('capped_summary',public.get_rtn_update_summary('11111111-1111-4111-8111-111111111111'));
SELECT lab.check('homepage count is bounded and explicitly reports lower bound',lab.ctx('capped_summary')->>'event_count'='1000'
 AND(lab.ctx('capped_summary')->>'count_is_lower_bound')::boolean);
SET ROLE postgres;
