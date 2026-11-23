-- Isolated synthetic acceptance only. Real existing19Nov guards are in fixture.sql.
-- Claims here are synthetic test input; no production identity or HTTP proof.
CREATE TABLE public.chain_checks(label text PRIMARY KEY);
CREATE FUNCTION public.chain_id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
CREATE FUNCTION public.chain_check(label text,ok boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'CHAIN_ASSERT_FAILED:%',label;END IF;INSERT INTO public.chain_checks VALUES(label);END$$;
CREATE FUNCTION public.chain_actor(who uuid,role_name text DEFAULT 'authenticated') RETURNS void LANGUAGE plpgsql AS $$BEGIN PERFORM set_config('request.jwt.claim.sub',coalesce(who::text,''),false);PERFORM set_config('request.jwt.claim.role',role_name,false);END$$;
CREATE FUNCTION public.chain_read(s jsonb,q jsonb,o uuid DEFAULT public.chain_id(1)) RETURNS jsonb LANGUAGE sql AS $$SELECT public.uc_read_document_chain(o,s,q)$$;
CREATE FUNCTION public.chain_denied(label text,s jsonb,q jsonb,expected text,o uuid DEFAULT public.chain_id(1)) RETURNS void LANGUAGE plpgsql AS $$DECLARE seen text;BEGIN BEGIN PERFORM public.chain_read(s,q,o);EXCEPTION WHEN OTHERS THEN seen:=SQLSTATE;END;PERFORM public.chain_check(label,seen=expected);END$$;
CREATE FUNCTION public.chain_snapshot() RETURNS text LANGUAGE sql SECURITY DEFINER AS $$SELECT md5(jsonb_build_object('enrollments',(SELECT coalesce(jsonb_agg(to_jsonb(e)ORDER BY id),'[]')FROM enrollments e),'drafts',(SELECT coalesce(jsonb_agg(to_jsonb(d)ORDER BY id),'[]')FROM uc_automatic_admission_drafts d),'registry',(SELECT coalesce(jsonb_agg(to_jsonb(r)ORDER BY id),'[]')FROM uc_document_registry_records r),'education',(SELECT coalesce(jsonb_agg(to_jsonb(i)ORDER BY id),'[]')FROM education_document_records i),'issuance',(SELECT coalesce(jsonb_agg(to_jsonb(i)ORDER BY record_id),'[]')FROM uc_education_issuance_states i))::text)$$;
INSERT INTO organizations VALUES(chain_id(1),'Synthetic UC'),(chain_id(2),'Foreign UC');
INSERT INTO profiles(user_id,organization_id,full_name)VALUES(chain_id(10),chain_id(1),'Owner'),(chain_id(11),chain_id(1),'Learner'),(chain_id(12),chain_id(1),'PEER PRIVATE NAME'),(chain_id(13),chain_id(1),'Teacher'),(chain_id(14),chain_id(1),'Sales'),(chain_id(15),chain_id(1),'Viewer'),(chain_id(16),chain_id(1),'Expired'),(chain_id(17),chain_id(2),'Foreign owner'),(chain_id(18),chain_id(2),'Foreign learner'),(chain_id(19),chain_id(1),'Blocked'),(chain_id(60),chain_id(1),'Deleted'),(chain_id(61),chain_id(1),'Archived learner');
UPDATE profiles SET blocked_at=now() WHERE user_id=chain_id(19);
UPDATE profiles SET archived_at=now() WHERE user_id=chain_id(61);
INSERT INTO user_roles VALUES(chain_id(10),'organization'),(chain_id(11),'student'),(chain_id(12),'student'),(chain_id(15),'admin'),(chain_id(16),'admin'),(chain_id(17),'organization'),(chain_id(18),'student'),(chain_id(19),'organization'),(chain_id(60),'organization'),(chain_id(61),'student');
INSERT INTO account_deletion_revocations VALUES(chain_id(60));
INSERT INTO admin_staff VALUES(chain_id(15),'viewer',NULL),(chain_id(16),'admin',now()-interval '1day');
INSERT INTO org_staff(id,user_id,organization_id,role)VALUES(chain_id(70),chain_id(13),chain_id(1),'teacher'),(chain_id(71),chain_id(14),chain_id(1),'sales_manager');
INSERT INTO courses VALUES(chain_id(20),chain_id(1),'Course'),(chain_id(21),chain_id(2),'Foreign course');
INSERT INTO enrollments(id,user_id,course_id)VALUES(chain_id(30),chain_id(11),chain_id(20)),(chain_id(31),chain_id(12),chain_id(20)),(chain_id(32),chain_id(18),chain_id(21)),(chain_id(33),chain_id(61),chain_id(20));
INSERT INTO student_groups VALUES(chain_id(40),chain_id(1),chain_id(20),'A'),(chain_id(41),chain_id(1),chain_id(20),'B'),(chain_id(42),chain_id(2),chain_id(21),'Foreign group'),(chain_id(43),chain_id(1),NULL,'Unbound');
INSERT INTO student_group_memberships_effective VALUES(chain_id(1),chain_id(40),chain_id(11)),(chain_id(1),chain_id(40),chain_id(12)),(chain_id(2),chain_id(42),chain_id(18));
INSERT INTO org_staff_document_groups VALUES(chain_id(70),chain_id(1),chain_id(40));
INSERT INTO fixture_programs VALUES(chain_id(30),jsonb_build_object('enrollment_snapshot_id',chain_id(80),'binding_id',chain_id(81),'binding_revision',1,'version_id',chain_id(82),'snapshot_hash',repeat('a',64),'facts_hash',repeat('b',64),'file_document_id',chain_id(83),'file_version_id',chain_id(84),'file_review_id',chain_id(85)));
SELECT chain_actor(chain_id(10));
SET ROLE authenticated;
DO $$DECLARE r jsonb;BEGIN
 r:=chain_read('{"kind":"organization"}','{"kind":"list","after_enrollment_id":null,"limit":20}');
 PERFORM chain_check('01_three_honest_missing_slots_no_invented_numbers',r->>'viewer'='staff'AND jsonb_array_length(r->'rows')>=2 AND r#>>'{rows,0,admission_order,state}'='not_created' AND r#>>'{rows,0,completion_order,state}'='not_created' AND r#>>'{rows,0,education_document,state}'='not_created' AND r#>'{rows,0,admission_order,number}'='null'::jsonb AND r->'total_count'='null'::jsonb);
 PERFORM chain_check('02_new_rpc_authenticated_only_acl',has_function_privilege('authenticated','public.uc_read_document_chain(uuid,jsonb,jsonb)','EXECUTE')AND NOT has_function_privilege('anon','public.uc_read_document_chain(uuid,jsonb,jsonb)','EXECUTE')AND NOT has_function_privilege('service_role','public.uc_read_document_chain(uuid,jsonb,jsonb)','EXECUTE'));
 PERFORM chain_denied('03_strict_scope_keys','{"kind":"organization","extra":true}','{"kind":"list","after_enrollment_id":null,"limit":20}','22023');
 PERFORM chain_denied('04_bounded_page_limit','{"kind":"organization"}','{"kind":"list","after_enrollment_id":null,"limit":51}','22023');
END$$;
SELECT chain_actor(chain_id(11));
DO $$DECLARE r jsonb;s jsonb:=jsonb_build_object('kind','student','student_user_id',chain_id(11),'enrollment_id',null,'group_id',null);BEGIN
 r:=chain_read(s,'{"kind":"list","after_enrollment_id":null,"limit":20}');
 PERFORM chain_check('05_real_self_metadata_excludes_peer',r->>'viewer'='self'AND jsonb_array_length(r->'rows')=1 AND r#>>'{rows,0,student_user_id}'=chain_id(11)::text AND strpos(r::text,'PEER PRIVATE NAME')=0 AND r#>>'{capabilities,can_open_sources}'='false');
 PERFORM chain_denied('06_student_cannot_read_organization','{"kind":"organization"}','{"kind":"list","after_enrollment_id":null,"limit":20}','42501');
 PERFORM chain_denied('07_student_cannot_read_peer',jsonb_build_object('kind','student','student_user_id',chain_id(12),'enrollment_id',null,'group_id',null),'{"kind":"list","after_enrollment_id":null,"limit":20}','42501');
 PERFORM chain_denied('08_student_cannot_read_foreign_org',s,'{"kind":"list","after_enrollment_id":null,"limit":20}','42501',chain_id(2));
END$$;
SELECT chain_actor(chain_id(13));
DO $$DECLARE r jsonb;BEGIN
 r:=chain_read(jsonb_build_object('kind','group','group_id',chain_id(40)),'{"kind":"list","after_enrollment_id":null,"limit":20}');
 PERFORM chain_check('09_assigned_teacher_reads_own_group',jsonb_array_length(r->'rows')=2);
 PERFORM chain_denied('10_teacher_other_group_denied',jsonb_build_object('kind','group','group_id',chain_id(41)),'{"kind":"list","after_enrollment_id":null,"limit":20}','42501');
END$$;
SELECT chain_actor(chain_id(14));SELECT chain_denied('11_sales_without_journals_denied','{"kind":"organization"}','{"kind":"list","after_enrollment_id":null,"limit":20}','42501');
SELECT chain_actor(chain_id(16));SELECT chain_denied('12_expired_admin_denied','{"kind":"organization"}','{"kind":"list","after_enrollment_id":null,"limit":20}','42501');
SELECT chain_actor(chain_id(19));SELECT chain_denied('13_blocked_actor_denied','{"kind":"organization"}','{"kind":"list","after_enrollment_id":null,"limit":20}','42501');
SELECT chain_actor(chain_id(60));SELECT chain_denied('14_deleted_actor_denied','{"kind":"organization"}','{"kind":"list","after_enrollment_id":null,"limit":20}','42501');
SELECT chain_actor(chain_id(61));SELECT chain_denied('15_archived_self_denied',jsonb_build_object('kind','student','student_user_id',chain_id(61),'enrollment_id',null,'group_id',null),'{"kind":"list","after_enrollment_id":null,"limit":20}','42501');
RESET ROLE;
-- Participant/group membership alone must never become a personal order bridge.
INSERT INTO uc_document_registry_records(id,organization_id,group_id,scope_group_ids,data,context_binding,registration_id,status,registered_at,revision)
 VALUES(chain_id(100),chain_id(1),chain_id(40),ARRAY[chain_id(40)],jsonb_build_object('document_type','enrollment_order','document_date','2026-11-01','subject',jsonb_build_object('kind','none'),'context',jsonb_build_object('kind','organization')),'{}','GROUP-ONLY','registered','2026-11-01Z',1);
SELECT chain_actor(chain_id(10));SET ROLE authenticated;
DO $$DECLARE r jsonb;BEGIN r:=chain_read('{"kind":"organization"}',jsonb_build_object('kind','detail','enrollment_id',chain_id(30),'group_id',chain_id(40)));PERFORM chain_check('16_shared_group_does_not_imply_personal_order',r#>>'{row,admission_order,state}'='not_created');END$$;
RESET ROLE;
INSERT INTO fixture_source_proofs VALUES(chain_id(1),jsonb_build_object('kind','org_document_version','document_id',chain_id(200),'version_id',chain_id(201),'content_hash',repeat('a',64)),true),(chain_id(1),jsonb_build_object('kind','org_document_version','document_id',chain_id(204),'version_id',chain_id(205),'content_hash',repeat('b',64)),true);
INSERT INTO uc_document_registry_records(id,organization_id,group_id,scope_group_ids,data,context_binding,registration_id,status,registered_at,revision)
 SELECT chain_id(101),chain_id(1),chain_id(40),ARRAY[chain_id(40)],jsonb_build_object('document_type','enrollment_order','document_date','2026-11-02','source',jsonb_build_object('kind','org_document_version','document_id',chain_id(200),'version_id',chain_id(201),'content_hash',repeat('a',64)),'subject',jsonb_build_object('kind','student','user_id',chain_id(11)),'context',jsonb_build_object('kind','enrollment','enrollment_id',chain_id(30))),jsonb_build_object('kind','enrollment','organization_id',chain_id(1),'enrollment_id',chain_id(30),'user_id',chain_id(11),'course_id',chain_id(20)),'ENR-1','registered','2026-11-02Z',1;
SELECT chain_actor(chain_id(10));SET ROLE authenticated;
DO $$DECLARE r jsonb;src jsonb;BEGIN
 r:=chain_read('{"kind":"organization"}',jsonb_build_object('kind','detail','enrollment_id',chain_id(30),'group_id',chain_id(40)));src:=r#>'{row,admission_order,source}';
 PERFORM chain_check('17_exact_personal_registered_order_visible',r#>>'{row,admission_order,state}'='registered'AND r#>>'{row,admission_order,number}'='ENR-1'AND src->>'id'=chain_id(101)::text AND r#>>'{row,admission_order,capabilities,can_open}'='true');
 r:=chain_read('{"kind":"organization"}',jsonb_build_object('kind','source','enrollment_id',chain_id(30),'group_id',chain_id(40),'source',src));
 PERFORM chain_check('18_source_targets_exact_record_revision_only',r->>'availability'='available'AND r#>>'{target,record_id}'=chain_id(101)::text AND r#>>'{target,revision}'='1'AND NOT(r->'target'?'file_url')AND NOT(r->'target'?'document_html'));
 PERFORM chain_denied('19_source_stale_revision_denied','{"kind":"organization"}',jsonb_build_object('kind','source','enrollment_id',chain_id(30),'group_id',chain_id(40),'source',src||'{"revision":2}'),'PT409');
 PERFORM chain_denied('20_source_wrong_version_denied','{"kind":"organization"}',jsonb_build_object('kind','source','enrollment_id',chain_id(30),'group_id',chain_id(40),'source',src||jsonb_build_object('version_id',chain_id(999))),'PT409');
 PERFORM chain_denied('21_source_cross_enrollment_denied','{"kind":"organization"}',jsonb_build_object('kind','source','enrollment_id',chain_id(31),'group_id',chain_id(40),'source',src),'PT404');
END$$;
SELECT chain_actor(chain_id(11));
DO $$DECLARE r jsonb;s jsonb:=jsonb_build_object('kind','student','student_user_id',chain_id(11),'enrollment_id',null,'group_id',null);src jsonb;BEGIN
 r:=chain_read(s,jsonb_build_object('kind','detail','enrollment_id',chain_id(30),'group_id',chain_id(40)));src:=r#>'{row,admission_order,source}';PERFORM chain_check('22_self_registered_metadata_without_group_file',r#>>'{row,admission_order,state}'='registered'AND r#>>'{row,admission_order,capabilities,can_open}'='false'AND r#>>'{row,admission_order,why_code}'='INDIVIDUAL_EXTRACT_UNAVAILABLE');
 r:=chain_read(s,jsonb_build_object('kind','source','enrollment_id',chain_id(30),'group_id',chain_id(40),'source',src));PERFORM chain_check('23_self_source_honestly_unavailable',r->>'availability'='unavailable'AND r->'target'='null'::jsonb AND length(r->>'why')>0);
END$$;
RESET ROLE;
-- A newer order must not steal the earlier journal row's exact source.
INSERT INTO uc_document_registry_records SELECT chain_id(102),organization_id,group_id,scope_group_ids,data,context_binding,redacted,'ENR-2',status,'2026-11-03Z',revision,legacy_claim FROM uc_document_registry_records WHERE id=chain_id(101);
SELECT chain_actor(chain_id(10));SET ROLE authenticated;
DO $$DECLARE r jsonb;q jsonb:=jsonb_build_object('kind','journal_source','journal_type','admission_orders','row_id','registered-admission:'||chain_id(101),'source_id',chain_id(101),'source_revision',1,'enrollment_id',chain_id(30),'group_id',chain_id(40));BEGIN
 r:=chain_read('{"kind":"organization"}',q);PERFORM chain_check('24_old_journal_row_resolves_itself_not_latest_order',r->>'availability'='available'AND r#>>'{target,record_id}'=chain_id(101)::text AND r#>>'{source,id}'=chain_id(101)::text);
 PERFORM chain_denied('25_journal_stale_revision_denied','{"kind":"organization"}',q||'{"source_revision":2}','PT409');
 PERFORM chain_denied('26_journal_row_id_source_id_must_match','{"kind":"organization"}',q||jsonb_build_object('row_id','registered-admission:'||chain_id(102)),'PT404');
 PERFORM chain_denied('27_journal_enrollment_must_match','{"kind":"organization"}',q||jsonb_build_object('enrollment_id',chain_id(31)),'PT404');
 r:=chain_read('{"kind":"organization"}',q||jsonb_build_object('journal_type','activity','row_id','activity:'||chain_id(101)));
 PERFORM chain_check('28_unsupported_journal_kind_has_no_fake_source',r->>'availability'='unavailable'AND r->'source'='null'::jsonb AND r->'target'='null'::jsonb);
END$$;
RESET ROLE;
INSERT INTO education_document_records(id,organization_id,enrollment_id,user_id,course_id,group_id,created_at,document_type,document_number,issue_date) VALUES(chain_id(300),chain_id(1),chain_id(30),chain_id(11),chain_id(20),chain_id(40),'2026-11-04Z','qualification','QUAL-1','2026-11-04');
INSERT INTO uc_education_issuance_states(record_id,organization_id,user_id,revision,course_id,enrollment_id,group_id,proof,artifact) VALUES(chain_id(300),chain_id(1),chain_id(11),1,chain_id(20),chain_id(30),chain_id(40),'{"fixture_verified":true}',jsonb_build_object('source',jsonb_build_object('kind','org_document_version','document_id',chain_id(204),'version_id',chain_id(205),'content_hash',repeat('b',64))));
SELECT chain_actor(chain_id(10));SET ROLE authenticated;
DO $$DECLARE r jsonb;src jsonb;BEGIN
 r:=chain_read('{"kind":"organization"}',jsonb_build_object('kind','detail','enrollment_id',chain_id(30),'group_id',chain_id(40)));src:=r#>'{row,education_document,source}';PERFORM chain_check('29_controlled_issuance_is_separate_from_missing_completion_order',r#>>'{row,education_document,state}'='issued'AND r#>>'{row,education_document,number}'='QUAL-1'AND r#>>'{row,completion_order,state}'='not_created');
 r:=chain_read('{"kind":"organization"}',jsonb_build_object('kind','source','enrollment_id',chain_id(30),'group_id',chain_id(40),'source',src));PERFORM chain_check('30_controlled_education_source_exact',r->>'availability'='available'AND r#>>'{target,record_id}'=chain_id(300)::text);
END$$;
SELECT chain_actor(chain_id(11));
DO $$DECLARE r jsonb;BEGIN r:=chain_read(jsonb_build_object('kind','student','student_user_id',chain_id(11),'enrollment_id',null,'group_id',null),jsonb_build_object('kind','detail','enrollment_id',chain_id(30),'group_id',chain_id(40)));PERFORM chain_check('31_self_issuance_does_not_borrow_staff_downloader',r#>>'{row,education_document,state}'='issued'AND r#>>'{row,education_document,capabilities,can_open}'='false');END$$;
RESET ROLE;
INSERT INTO education_document_records(id,organization_id,enrollment_id,user_id,course_id,group_id,created_at,document_type,document_number,issue_date)VALUES(chain_id(301),chain_id(1),chain_id(30),chain_id(11),chain_id(20),chain_id(40),'2026-11-05Z','qualification','OLD-UNVERIFIED','2026-11-05');
SELECT chain_actor(chain_id(10));SET ROLE authenticated;
DO $$DECLARE r jsonb;BEGIN r:=chain_read('{"kind":"organization"}',jsonb_build_object('kind','detail','enrollment_id',chain_id(30),'group_id',chain_id(40)));PERFORM chain_check('32_legacy_record_not_promoted_to_controlled',r#>>'{row,education_document,state}'='legacy_unverified'AND r#>'{row,education_document,source}'='null'::jsonb);END$$;
RESET ROLE;
DELETE FROM education_document_records WHERE id=chain_id(301);
UPDATE uc_education_issuance_states SET annulment='{"fixture_reason":"annulled"}' WHERE record_id=chain_id(300);
SELECT chain_actor(chain_id(10));SET ROLE authenticated;
DO $$DECLARE r jsonb;BEGIN r:=chain_read('{"kind":"organization"}',jsonb_build_object('kind','detail','enrollment_id',chain_id(30),'group_id',chain_id(40)));PERFORM chain_check('33_annulment_state_retained',r#>>'{row,education_document,state}'='annulled');END$$;
RESET ROLE;
-- The draft belongs to the peer, with its exact program/effective snapshot.
INSERT INTO fixture_programs SELECT chain_id(31),program_ref FROM fixture_programs WHERE enrollment_id=chain_id(30);
INSERT INTO uc_automatic_admission_drafts(id,organization_id,enrollment_id,user_id,course_id,group_id,document_date,effective_admission_date,recorded_at,updated_at,status,revision,preparation_mode,missing_facts,source_revision,program_ref,policy_revisions)
 SELECT chain_id(400),chain_id(1),chain_id(31),chain_id(12),chain_id(20),chain_id(40),'2026-11-06','2026-11-06','2026-11-06Z','2026-11-06Z','prepared',1,'automatic','{}',1,program_ref,'{"organization":0,"group":0,"enrollment":0}' FROM fixture_programs WHERE enrollment_id=chain_id(31);
SELECT chain_actor(chain_id(10));SET ROLE authenticated;
DO $$DECLARE r jsonb;src jsonb;BEGIN
 r:=chain_read('{"kind":"organization"}',jsonb_build_object('kind','detail','enrollment_id',chain_id(31),'group_id',chain_id(40)));src:=r#>'{row,admission_order,source}';PERFORM chain_check('34_prepared_draft_not_registered_order',r#>>'{row,admission_order,state}'='draft'AND r#>'{row,admission_order,number}'='null'::jsonb);
 r:=chain_read('{"kind":"organization"}',jsonb_build_object('kind','source','enrollment_id',chain_id(31),'group_id',chain_id(40),'source',src));PERFORM chain_check('35_draft_target_exact_projection',r->>'availability'='available'AND r#>>'{target,draft,id}'=chain_id(400)::text AND r#>>'{target,draft,revision}'='1');
END$$;
RESET ROLE;
UPDATE enrollments SET document_facts_revision=2 WHERE id=chain_id(31);
SELECT chain_actor(chain_id(10));SET ROLE authenticated;
DO $$DECLARE r jsonb;src jsonb;BEGIN r:=chain_read('{"kind":"organization"}',jsonb_build_object('kind','detail','enrollment_id',chain_id(31),'group_id',chain_id(40)));src:=r#>'{row,admission_order,source}';PERFORM chain_check('36_stale_draft_needs_information',r#>>'{row,admission_order,state}'='needs_information'AND r#>>'{row,admission_order,capabilities,can_open}'='false');r:=chain_read('{"kind":"organization"}',jsonb_build_object('kind','source','enrollment_id',chain_id(31),'group_id',chain_id(40),'source',src));PERFORM chain_check('37_stale_draft_source_unavailable',r->>'availability'='unavailable'AND r->'target'='null'::jsonb);END$$;
RESET ROLE;
INSERT INTO student_group_memberships_effective VALUES(chain_id(1),chain_id(41),chain_id(11));
SELECT chain_actor(chain_id(10));SET ROLE authenticated;
DO $$DECLARE r jsonb;BEGIN r:=chain_read('{"kind":"organization"}',jsonb_build_object('kind','detail','enrollment_id',chain_id(30),'group_id',null));PERFORM chain_check('38_multiple_groups_not_guessed',r#>>'{row,association_state}'='choose_group'AND r#>'{row,group_id}'='null'::jsonb);END$$;
RESET ROLE;
-- Missing information is a visible draft, not an invented registered order.
DELETE FROM fixture_programs WHERE enrollment_id=chain_id(31);
UPDATE uc_automatic_admission_drafts SET program_ref=NULL,missing_facts=ARRAY['program_not_confirmed'],source_revision=2,status='needs_information' WHERE id=chain_id(400);
SELECT chain_actor(chain_id(10));SET ROLE authenticated;
DO $$DECLARE r jsonb;src jsonb;BEGIN r:=chain_read('{"kind":"organization"}',jsonb_build_object('kind','detail','enrollment_id',chain_id(31),'group_id',chain_id(40)));src:=r#>'{row,admission_order,source}';PERFORM chain_check('41_missing_information_draft_still_has_safe_preview',r#>>'{row,admission_order,state}'='needs_information'AND r#>>'{row,admission_order,capabilities,can_open}'='true');r:=chain_read('{"kind":"organization"}',jsonb_build_object('kind','source','enrollment_id',chain_id(31),'group_id',chain_id(40),'source',src));PERFORM chain_check('42_missing_information_preview_not_registered',r->>'availability'='available'AND r#>>'{target,draft,status}'='needs_information'AND r#>>'{target,draft,registered_locked}'='false');END$$;
RESET ROLE;
-- Bounded page projection over many enrollments; no full organization JSON array.
DO $$DECLARE n integer;BEGIN FOR n IN 1..60 LOOP INSERT INTO courses VALUES(chain_id(1000+n),chain_id(1),'Page course'||n);INSERT INTO enrollments(id,user_id,course_id) VALUES(chain_id(2000+n),chain_id(11),chain_id(1000+n));END LOOP;END$$;
SELECT chain_actor(chain_id(10));SET ROLE authenticated;
DO $$DECLARE r jsonb;next jsonb;before text;after text;BEGIN
 before:=chain_snapshot();r:=chain_read('{"kind":"organization"}','{"kind":"list","after_enrollment_id":null,"limit":50}');next:=chain_read('{"kind":"organization"}',jsonb_build_object('kind','list','after_enrollment_id',r->'next_after_enrollment_id','limit',50));after:=chain_snapshot();
 PERFORM chain_check('39_bounded_keyset_page',jsonb_array_length(r->'rows')=50 AND r->>'next_after_enrollment_id'IS NOT NULL AND jsonb_array_length(next->'rows')<50 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'rows')a JOIN jsonb_array_elements(next->'rows')b ON a->>'enrollment_id'=b->>'enrollment_id'));
 PERFORM chain_check('40_readonly_old_rows_and_numbers_unchanged',before=after);
END$$;
RESET ROLE;
SELECT count(*) AS distinct_checks FROM chain_checks;
SELECT label FROM chain_checks ORDER BY label;
