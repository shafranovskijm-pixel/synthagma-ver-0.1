-- AUTHORED, NOT EXECUTED. Root-only isolated fixture acceptance, never production.
-- Prerequisite: reviewed UC013/014/015 + UC017 installed with exact privacy stack.
-- The harness seeds actual approved programme, teacher assignment, observed
-- history, published calendar and purpose=lesson_roster snapshot; then sets
-- uc017.qa.context JSON in this same connection. No fake helper/RLS replacement.
-- Context keys: organization_id, group_id, other_group_id, actor_id,
-- calendar_version_id, calendar_hash, lesson_id, snapshot_id, starts_at, ends_at,
-- academic_hours, teacher_user_id, attendance[{user_id,status}].
-- All writes roll back. Additional two-connection races are in QA_PLAN.json.
BEGIN;
SET LOCAL ROLE authenticated;
DO $acceptance$ DECLARE c jsonb:=current_setting('uc017.qa.context')::jsonb;a jsonb;r jsonb;v jsonb;old jsonb;d jsonb;req uuid:=gen_random_uuid();org uuid;grp uuid;sid uuid;version_id uuid;hash text;BEGIN
 org:=(c->>'organization_id')::uuid;grp:=(c->>'group_id')::uuid;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',c->>'actor_id','role','authenticated')::text,true);
 a:=(c-ARRAY['organization_id','group_id','other_group_id','actor_id'])||jsonb_build_object('action','confirm_session','reason','Synthetic QA actual teacher proof','human_attested',true);
 -- Negative evidence: null marks, future date, foreign lesson/calendar/hash and
 -- partial roster are refused before a receipt or session becomes durable.
 BEGIN PERFORM public.apply_conducted_session_action(org,grp,0,gen_random_uuid(),jsonb_set(a,'{attendance,0,status}','null'));RAISE EXCEPTION 'UC017 accepted null attendance';EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM NOT LIKE 'UC_SESSION_INVALID_INPUT%' THEN RAISE;END IF;END;
 BEGIN PERFORM public.apply_conducted_session_action(org,grp,0,gen_random_uuid(),jsonb_set(a,'{ends_at}',to_jsonb((clock_timestamp()+interval '1 day')::text)));RAISE EXCEPTION 'UC017 accepted future session';EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM NOT LIKE 'UC_SESSION_INVALID_INPUT%' THEN RAISE;END IF;END;
 BEGIN PERFORM public.apply_conducted_session_action(org,grp,0,gen_random_uuid(),jsonb_set(a,'{calendar_hash}',to_jsonb(repeat('0',64))));RAISE EXCEPTION 'UC017 accepted wrong calendar hash';EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM NOT LIKE 'UC_SESSION_SOURCE_UNAVAILABLE%' THEN RAISE;END IF;END;
 BEGIN PERFORM public.apply_conducted_session_action(org,grp,0,gen_random_uuid(),jsonb_set(a,'{attendance}','[]'));RAISE EXCEPTION 'UC017 accepted partial roster';EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM NOT LIKE 'UC_SESSION_INVALID_INPUT%' THEN RAISE;END IF;END;
 r:=public.apply_conducted_session_action(org,grp,0,req,a);sid:=(r->'receipt'->>'session_id')::uuid;version_id:=(r->'receipt'->>'version_id')::uuid;hash:=r->'receipt'->>'content_hash';
 IF r->'receipt'->>'revision'<>'1' OR(r->'receipt'->>'replayed')::boolean THEN RAISE EXCEPTION 'UC017 first receipt mismatch';END IF;
 v:=public.read_conducted_sessions(org,grp,jsonb_build_object('kind','session','session_id',sid,'revision',1,'after_user_id',NULL,'limit',50));
 IF v->'version'->>'id'<>version_id::text OR NOT(v->>'source_current')::boolean OR v->'version'->'attendance'->0->>'status' IS DISTINCT FROM a->'attendance'->0->>'status' THEN RAISE EXCEPTION 'UC017 saved attendance mismatch';END IF;old:=v;
 r:=public.apply_conducted_session_action(org,grp,0,req,a);IF NOT(r->'receipt'->>'replayed')::boolean OR r->'receipt'->>'version_id'<>version_id::text THEN RAISE EXCEPTION 'UC017 replay mismatch';END IF;
 BEGIN PERFORM public.apply_conducted_session_action(org,grp,0,req,jsonb_set(a,'{reason}','"Different reason"'));RAISE EXCEPTION 'UC017 accepted request conflict';EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM NOT LIKE 'UC_SESSION_REQUEST_CONFLICT%' THEN RAISE;END IF;END;
 BEGIN PERFORM public.apply_conducted_session_action(org,grp,0,gen_random_uuid(),a);RAISE EXCEPTION 'UC017 accepted duplicate lesson';EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM NOT LIKE 'UC_SESSION_REVISION_CONFLICT%' THEN RAISE;END IF;END;
 a:=jsonb_build_object('action','correct_attendance','session_id',sid,'expected_content_hash',hash,'attendance',jsonb_set(c->'attendance','{0,status}','"excused"'),'reason','Synthetic reasoned correction','human_attested',true);
 r:=public.apply_conducted_session_action(org,grp,1,gen_random_uuid(),a);IF r->'receipt'->>'revision'<>'2' THEN RAISE EXCEPTION 'UC017 correction revision mismatch';END IF;
 v:=public.read_conducted_sessions(org,grp,jsonb_build_object('kind','session','session_id',sid,'revision',1,'after_user_id',NULL,'limit',50));IF v->'version' IS DISTINCT FROM old->'version' OR (v->>'source_current')::boolean THEN RAISE EXCEPTION 'UC017 rewrote original version or presents old revision as current';END IF;
 BEGIN PERFORM public.apply_conducted_session_action(org,grp,1,gen_random_uuid(),a);RAISE EXCEPTION 'UC017 accepted stale correction';EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM NOT LIKE 'UC_SESSION_REVISION_CONFLICT%' THEN RAISE;END IF;END;
 v:=public.read_conducted_sessions(org,grp,jsonb_build_object('kind','session','session_id',sid,'revision',2,'after_user_id',NULL,'limit',50));
 a:=jsonb_build_object('action','create_draft','session_id',sid,'expected_content_hash',v->'version'->>'content_hash','kind','journal','expected_draft_revision',0,'student_ids',jsonb_build_array(c->'attendance'->0->>'user_id'),'reason','Synthetic journal draft','human_review_required',true);
 r:=public.apply_conducted_session_action(org,grp,2,gen_random_uuid(),a);d:=public.read_conducted_sessions(org,grp,jsonb_build_object('kind','draft','draft_id',r->'receipt'->>'draft_id'));
 IF NOT(d->'draft'->>'source_current')::boolean OR(d->'draft'->>'officially_issued')::boolean OR d->'draft'->'source_proof'->>'session_revision'<>'2' OR d->'draft'->'source_proof'->'attendance'->0->>'status'<>'excused' THEN RAISE EXCEPTION 'UC017 pinned draft mismatch';END IF;
 BEGIN PERFORM public.read_conducted_sessions(org,(c->>'other_group_id')::uuid,jsonb_build_object('kind','session','session_id',sid,'revision',NULL,'after_user_id',NULL,'limit',50));RAISE EXCEPTION 'UC017 cross-group data leak';EXCEPTION WHEN SQLSTATE '42501' THEN NULL;WHEN SQLSTATE 'P0001' THEN IF SQLERRM NOT LIKE 'UC_SESSION_NOT_FOUND%' AND SQLERRM NOT LIKE 'UC_SESSION_SOURCE_UNAVAILABLE%' THEN RAISE;END IF;END;
 RAISE NOTICE 'UC017 bounded positive/negative/CAS/idempotency/preservation/draft checks passed in rollback fixture';
END;$acceptance$;
ROLLBACK;
