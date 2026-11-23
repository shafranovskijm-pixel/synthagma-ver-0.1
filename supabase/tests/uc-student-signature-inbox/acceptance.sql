CREATE TEMP TABLE inbox_checks(label text PRIMARY KEY);
CREATE FUNCTION public.inbox_check(ok boolean,label text)RETURNS void LANGUAGE plpgsql AS $$BEGIN PERFORM public.inbox_test_assert(ok,label);INSERT INTO inbox_checks VALUES(label);END$$;
DO $$DECLARE org uuid:='10000000-0000-4000-8000-000000000001';otherorg uuid:='10000000-0000-4000-8000-000000000002';a uuid:='00000000-0000-4000-8000-000000000001';peer uuid:='00000000-0000-4000-8000-000000000002';sid uuid:='20000000-0000-4000-8000-000000000001';b1 uuid:='30000000-0000-4000-8000-000000000001';snap uuid:='40000000-0000-4000-8000-000000000001';pol uuid:='50000000-0000-4000-8000-000000000001';evt uuid:='60000000-0000-4000-8000-000000000001';v jsonb;first jsonb;second jsonb;h text:=encode(sha256(convert_to('<p>own frozen source</p>','UTF8')),'hex');before text;after_value text;
BEGIN
 v:=public.read_student_document_inbox(org);PERFORM public.inbox_check(v->>'ok'='true'AND v->>'total_count'='0'AND v->'items'='[]'::jsonb,'empty own scope');
 PERFORM set_config('test.inbox.role','anon',false);PERFORM public.inbox_check(public.read_student_document_inbox(org)->>'code'='ACCESS_DENIED','anonymous denied');
 PERFORM set_config('test.inbox.role','service_role',false);PERFORM public.inbox_check(public.read_student_document_inbox(org)->>'code'='ACCESS_DENIED','service actor denied');
 PERFORM set_config('test.inbox.role','authenticated',false);PERFORM public.inbox_check(public.read_student_document_inbox(otherorg)->>'code'='ACCESS_DENIED','foreign organization denied');
 PERFORM set_config('test.inbox.active','false',false);PERFORM public.inbox_check(public.read_student_document_inbox(org)->>'code'='ACCESS_DENIED','revoked account denied');PERFORM set_config('test.inbox.active','true',false);
 PERFORM public.inbox_check(public.read_student_document_inbox(org,NULL,NULL,51)->>'code'='INVALID_INPUT','page size bounded');
 PERFORM public.inbox_check(public.read_student_document_inbox(org,'2026-01-01',NULL,50)->>'code'='INVALID_INPUT','half cursor denied');
 INSERT INTO public.document_signatures(id,organization_id,recipient_user_id,document_title,document_type,status,sender_name,signature_token,created_at,hidden_for_recipient,document_html)
 VALUES(sid,org,a,'Own document','order','sent','Centre','own-transient-token','2026-11-23T00:00:00Z',false,'<p>own frozen source</p>'),
 ('20000000-0000-4000-8000-000000000002',org,peer,'PEER_SECRET','order','sent','Centre','PEER_TOKEN','2026-11-23T00:00:00Z',false,'PEER_HTML'),
 ('20000000-0000-4000-8000-000000000003',otherorg,a,'FOREIGN_SECRET','order','sent','Centre','FOREIGN_TOKEN','2026-11-23T00:00:00Z',false,'FOREIGN_HTML'),
 ('20000000-0000-4000-8000-000000000004',org,a,'Hidden','order','sent','Centre','hidden-token','2026-11-23T00:00:00Z',true,'hidden'),
 ('20000000-0000-4000-8000-000000000005',org,a,'Draft','order','draft','Centre','draft-token','2026-11-23T00:00:00Z',false,'draft');
 v:=public.read_student_document_inbox(org);PERFORM public.inbox_check(v->>'total_count'='1'AND v->>'pending_count'='1'AND v#>>'{items,0,state}'='pending','own sent visible peer foreign hidden draft excluded');
 PERFORM public.inbox_check(v::text NOT LIKE '%PEER_%'AND v::text NOT LIKE '%FOREIGN_%'AND v::text NOT LIKE '%own frozen source%','no peer secret or HTML output');
 INSERT INTO public.uc_signature_assurance_document_snapshots VALUES(snap,org,sid,'recipient',NULL,h,a);
 INSERT INTO public.uc_signature_assurance_bindings VALUES(b1,org,sid,'recipient',1,snap,pol,repeat('a',64),a);
 INSERT INTO public.uc_signature_assurance_events VALUES(evt,org,sid,'signature','recipient',2,'account_confirmed',b1,snap,pol,a,
 jsonb_build_object('conclusion','policy_eligible_account_confirmation','document_html_sha256',h,'document_revision_id',NULL,'policy_sha256',repeat('a',64)),'2026-11-23T00:01:00Z');
 v:=public.read_student_document_inbox(org);PERFORM public.inbox_check(v#>>'{items,0,state}'='confirmed'AND v->>'pending_count'='0'AND v#>>'{items,0,legacy_status}'='sent'AND v#>'{items,0,signed_at}'='null'::jsonb,'exact account event clears pending without legacy signed mutation');
 PERFORM public.inbox_check(v#>>'{items,0,assurance,conclusion}'='policy_eligible_account_confirmation'AND v#>>'{items,0,assurance,source_current}'='true'AND v#>>'{items,0,assurance,event_id}'=evt::text,'exact immutable assurance projection');
 UPDATE public.document_signatures SET expires_at='2026-01-01'WHERE id=sid;v:=public.read_student_document_inbox(org);PERFORM public.inbox_check(v#>>'{items,0,state}'='confirmed','expiry does not erase earlier genuine confirmation');
 UPDATE public.document_signatures SET expires_at=NULL,document_html='<p>changed</p>'WHERE id=sid;v:=public.read_student_document_inbox(org);PERFORM public.inbox_check(v#>>'{items,0,state}'='source_changed'AND v#>>'{items,0,assurance,conclusion}'='not_confirmed'AND v#>'{items,0,assurance,confirmed_at}'='null'::jsonb,'changed current source cannot reuse old confirmation');
 UPDATE public.document_signatures SET document_html='<p>own frozen source</p>'WHERE id=sid;
 INSERT INTO public.signature_revisions VALUES('70000000-0000-4000-8000-000000000001',sid,'<p>own frozen source</p>');UPDATE public.document_signatures SET current_revision_id='70000000-0000-4000-8000-000000000001'WHERE id=sid;
 v:=public.read_student_document_inbox(org);PERFORM public.inbox_check(v#>>'{items,0,state}'='source_changed','same bytes different revision not reused');
 UPDATE public.document_signatures SET current_revision_id=NULL WHERE id=sid;
 INSERT INTO public.uc_signature_assurance_bindings VALUES('30000000-0000-4000-8000-000000000002',org,sid,'recipient',3,snap,pol,repeat('a',64),a);
 v:=public.read_student_document_inbox(org);PERFORM public.inbox_check(v#>>'{items,0,state}'='closed'AND v#>>'{items,0,assurance,conclusion}'='not_confirmed','previous binding event cannot satisfy latest binding');
 DELETE FROM public.uc_signature_assurance_bindings WHERE revision=3;UPDATE public.uc_signature_assurance_events SET party_role='sender'WHERE id=evt;
 v:=public.read_student_document_inbox(org);PERFORM public.inbox_check(v#>>'{items,0,state}'='pending'AND v->>'pending_count'='1','sender confirmation cannot confirm recipient');
 UPDATE public.uc_signature_assurance_events SET party_role='recipient',actor_user_id=peer WHERE id=evt;v:=public.read_student_document_inbox(org);PERFORM public.inbox_check(v#>>'{items,0,state}'='closed'AND v#>>'{items,0,assurance,conclusion}'='not_confirmed','wrong actual account cannot confirm recipient');
 UPDATE public.uc_signature_assurance_events SET actor_user_id=a,kind='invitation_revoked'WHERE id=evt;v:=public.read_student_document_inbox(org);PERFORM public.inbox_check(v#>>'{items,0,state}'='revoked'AND v->>'pending_count'='0','new revoked event explicit');
 UPDATE public.uc_signature_assurance_events SET kind='recipient_rejected'WHERE id=evt;v:=public.read_student_document_inbox(org);PERFORM public.inbox_check(v#>>'{items,0,state}'='rejected','new rejection explicit');
 DELETE FROM public.uc_signature_assurance_events WHERE id=evt;UPDATE public.document_signatures SET expires_at='2026-01-01'WHERE id=sid;v:=public.read_student_document_inbox(org);PERFORM public.inbox_check(v#>>'{items,0,state}'='expired'AND v->>'pending_count'='0','unconfirmed expired excluded pending');
 UPDATE public.document_signatures SET status='signed',signed_at='2026-01-01'WHERE id=sid;v:=public.read_student_document_inbox(org);PERFORM public.inbox_check(v#>>'{items,0,state}'='signed'AND v#>>'{items,0,assurance,conclusion}'='legacy_unknown','legacy signed stays legacy');
 UPDATE public.document_signatures SET status='sent',signed_at=NULL,expires_at=NULL WHERE id=sid;
 UPDATE public.document_signatures SET hidden_for_recipient=false WHERE id='20000000-0000-4000-8000-000000000004';
 first:=public.read_student_document_inbox(org,NULL,NULL,1);second:=public.read_student_document_inbox(org,(first#>>'{next_cursor,created_at}')::timestamptz,(first#>>'{next_cursor,id}')::uuid,1);
 PERFORM public.inbox_check(first->>'total_count'='2'AND second->>'total_count'='2'AND first#>>'{items,0,id}'<>second#>>'{items,0,id}'AND second->'next_cursor'='null'::jsonb,'equal timestamp cursor no duplicate or skipped row');
 SELECT md5(string_agg(to_jsonb(s)::text,''ORDER BY id))INTO before FROM public.document_signatures s;PERFORM public.read_student_document_inbox(org);SELECT md5(string_agg(to_jsonb(s)::text,''ORDER BY id))INTO after_value FROM public.document_signatures s;
 PERFORM public.inbox_check(before=after_value,'read RPC leaves source facts unchanged');
 PERFORM public.inbox_check(has_function_privilege('authenticated','public.read_student_document_inbox(uuid,timestamptz,uuid,integer)','EXECUTE')AND NOT has_function_privilege('anon','public.read_student_document_inbox(uuid,timestamptz,uuid,integer)','EXECUTE')AND NOT has_function_privilege('service_role','public.read_student_document_inbox(uuid,timestamptz,uuid,integer)','EXECUTE'),'only authenticated execute grant');
END$$;

-- Larger archive plus off-page active invitations: exact count must remain true,
-- while the real query plan hashes only the page and active bound candidates.
DO $archive_work$
DECLARE org uuid:='10000000-0000-4000-8000-000000000001';a uuid:='00000000-0000-4000-8000-000000000001';pol uuid:='50000000-0000-4000-8000-000000000001';n integer;sid uuid;snap uuid;b uuid;
 html text:=repeat('archive-source-',4000);h text;v jsonb;body text;query text;plan jsonb;source_rows integer;pair text[];
BEGIN
 h:=encode(sha256(convert_to(html,'UTF8')),'hex');
 FOR n IN 1..500 LOOP
  sid:=md5('archive-signature-'||n)::uuid;snap:=md5('archive-snapshot-'||n)::uuid;b:=md5('archive-binding-'||n)::uuid;
  INSERT INTO public.document_signatures(id,organization_id,recipient_user_id,document_title,document_type,status,signature_token,created_at,hidden_for_recipient,document_html,signed_at)
  VALUES(sid,org,a,'Archived own document','order','signed','own-archive-'||n,'2000-01-01Z',false,html,'2000-01-02Z');
  INSERT INTO public.uc_signature_assurance_document_snapshots VALUES(snap,org,sid,'recipient',NULL,h,a);
  INSERT INTO public.uc_signature_assurance_bindings VALUES(b,org,sid,'recipient',1,snap,pol,repeat('a',64),a);
 END LOOP;
 FOR n IN 501..502 LOOP
  sid:=md5('archive-signature-'||n)::uuid;snap:=md5('archive-snapshot-'||n)::uuid;b:=md5('archive-binding-'||n)::uuid;
  INSERT INTO public.document_signatures(id,organization_id,recipient_user_id,document_title,document_type,status,signature_token,created_at,hidden_for_recipient,document_html)
  VALUES(sid,org,a,'Off-page active invitation','order','sent','own-active-'||n,'1900-01-01Z',false,CASE n WHEN 501 THEN html ELSE html||'changed' END);
  INSERT INTO public.uc_signature_assurance_document_snapshots VALUES(snap,org,sid,'recipient',NULL,h,a);
  INSERT INTO public.uc_signature_assurance_bindings VALUES(b,org,sid,'recipient',1,snap,pol,repeat('a',64),a);
 END LOOP;
 v:=public.read_student_document_inbox(org,NULL,NULL,50);
 PERFORM public.inbox_check(v->>'total_count'='504'AND jsonb_array_length(v->'items')=50 AND v->>'pending_count'='3','off-page active count validates exact hash and excludes changed source');
 SELECT prosrc INTO body FROM pg_proc WHERE oid='public.read_student_document_inbox(uuid,timestamptz,uuid,integer)'::regprocedure;
 query:=substr(body,strpos(body,' WITH visible AS MATERIALIZED('));query:=substr(query,1,strpos(query,E'\n RETURN answer;')-1);query:=replace(query,')INTO answer;',');');
 FOREACH pair SLICE 1 IN ARRAY ARRAY[['p_organization_id','$1'],['actor','$2'],['p_after_created_at','$3'],['p_after_id','$4'],['p_limit','$5'],['observed','$6']] LOOP
  query:=regexp_replace(query,'\m'||pair[1]||'\M',pair[2],'g');
 END LOOP;
 EXECUTE 'EXPLAIN(ANALYZE,FORMAT JSON,COSTS FALSE,TIMING FALSE,SUMMARY FALSE)'||query INTO plan USING org,a,NULL::timestamptz,NULL::uuid,50,statement_timestamp();
 WITH RECURSIVE nodes(node_doc)AS(SELECT plan->0->'Plan'UNION ALL SELECT child FROM nodes CROSS JOIN LATERAL jsonb_array_elements(coalesce(node_doc->'Plans','[]'::jsonb))child)
 SELECT(node_doc->>'Actual Rows')::numeric::integer INTO source_rows FROM nodes WHERE node_doc->>'Subplan Name'='CTE current_sources';
 PERFORM public.inbox_check(source_rows=52,'actual plan hashes50 page plus2 active candidates rather than500 archive documents');
END;$archive_work$;


-- The provider-specific default remains, while this new RPC is narrow.
DO $new_rpc_acl_acceptance$
DECLARE f pg_proc%ROWTYPE;BEGIN
 SELECT *INTO f FROM pg_proc WHERE oid='public.read_student_document_inbox(uuid,timestamptz,uuid,integer)'::regprocedure;
 PERFORM public.inbox_check(NOT has_function_privilege('uc_fixture_extra_executor',f.oid,'EXECUTE') AND has_function_privilege('authenticated',f.oid,'EXECUTE') AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner)))a WHERE a.grantee NOT IN(f.proowner,'authenticated'::regrole) OR(a.grantee<>f.proowner AND a.is_grantable)),'new RPC strips extra default executor and auth grant option');
 PERFORM public.inbox_check(has_function_privilege('uc_fixture_extra_executor','public.uc_fixture_old_function_acl()','EXECUTE') AND(SELECT proacl::text FROM pg_proc WHERE oid='public.uc_fixture_old_function_acl()'::regprocedure)IS NOT DISTINCT FROM(SELECT old_function_acl FROM uc_fixture_acl_before),'old function explicit ACL preserved');
 PERFORM public.inbox_check((SELECT md5(coalesce(string_agg(md5(to_jsonb(d)::text),''ORDER BY oid),''))FROM pg_default_acl d)IS NOT DISTINCT FROM(SELECT default_acl_fingerprint FROM uc_fixture_acl_before),'provider function defaults preserved');
END;$new_rpc_acl_acceptance$;

SELECT count(*)AS distinct_checks FROM inbox_checks;
