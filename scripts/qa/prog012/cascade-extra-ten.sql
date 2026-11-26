-- SOURCE ONLY. Extra10 rollback subgroups for existing C15/C16 identities.
-- Run only after new V4 core + exact18 base/18 concurrency in the dedicated lab.
-- No production rows, credentials, API calls or material answer banks.
\set ON_ERROR_STOP on
DO $gate$ BEGIN
 IF current_database() IS DISTINCT FROM 'sintagma_pcr_v4_r2_lab_20261028'
 OR host(inet_server_addr()) IS DISTINCT FROM '127.0.0.1' OR inet_server_port() IS DISTINCT FROM 5432
 OR current_setting('server_version_num') IS DISTINCT FROM '170011'
 OR lower(replace(current_setting('data_directory'),chr(92),'/')) IS DISTINCT FROM lower('/var/lib/postgresql/data')
 OR current_setting('pcr.lab_authorized',true) IS DISTINCT FROM 'source-reviewed-root-run-only'
 THEN RAISE EXCEPTION 'PCR_V4_EXACT_ISOLATED_LAB_REQUIRED';END IF;
END;$gate$;
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='3s';
SET LOCAL search_path=pg_catalog,public,pg_temp;
DO $pre$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.course_documents'::regclass AND attname='module_id' AND NOT attisdropped)
 OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.platform_course_publication_deleted_parents'::regclass AND attname='statement_finished' AND NOT attisdropped)
 OR EXISTS(SELECT 1 FROM public.platform_course_publication_deleted_parents)
 THEN RAISE EXCEPTION 'PCR_CASCADE_PRECONDITIONS_OR_EMPTY_CONTEXT_REQUIRED';END IF;
END;$pre$;
CREATE TEMP TABLE pcr_lifecycle_observed(table_name text,row_id uuid);
CREATE TEMP TABLE pcr_lifecycle_fixtures(ordinal integer PRIMARY KEY,label text UNIQUE,action text,organization_id uuid,ids jsonb,before_tree jsonb,before_generation uuid);
CREATE TEMP TABLE pcr_lifecycle_preservation AS SELECT
 public.pcr_v2_sha(coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.sequence) FROM public.platform_course_publication_review_events e),'[]'::jsonb)) AS reviews,
 public.pcr_v2_sha(coalesce((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.id) FROM public.qa_retained_results h),'[]'::jsonb)) AS retained;
CREATE FUNCTION pg_temp.pcr_lifecycle_must(p_ok boolean,p_label text) RETURNS void LANGUAGE plpgsql AS $qa$
BEGIN IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'PCR_CASCADE_SUBCASE_FAILED:%',p_label;END IF;END;$qa$;
CREATE FUNCTION pg_temp.pcr_lifecycle_tree(p_f jsonb) RETURNS jsonb LANGUAGE sql AS $qa$
 SELECT jsonb_build_object(
 'course',(SELECT to_jsonb(r) FROM public.courses r WHERE r.id=(p_f->>'c')::uuid),
 'module',(SELECT to_jsonb(r) FROM public.course_modules r WHERE r.id=(p_f->>'m')::uuid),
 'lesson',(SELECT to_jsonb(r) FROM public.lessons r WHERE r.id=(p_f->>'l')::uuid),
 'question',(SELECT to_jsonb(r) FROM public.test_questions r WHERE r.id=(p_f->>'q')::uuid),
 'attachment',(SELECT to_jsonb(r) FROM public.lesson_attachments r WHERE r.id=(p_f->>'a')::uuid),
 'document',(SELECT to_jsonb(r) FROM public.course_documents r WHERE r.id=(p_f->>'d')::uuid),
 'listing',(SELECT to_jsonb(r) FROM public.marketplace_courses r WHERE r.id=(p_f->>'s')::uuid));
$qa$;
CREATE FUNCTION pg_temp.pcr_lifecycle_seed(p_org uuid) RETURNS jsonb LANGUAGE plpgsql AS $qa$
DECLARE f jsonb:=jsonb_build_object('c',gen_random_uuid(),'m',gen_random_uuid(),'l',gen_random_uuid(),'q',gen_random_uuid(),'a',gen_random_uuid(),'d',gen_random_uuid(),'s',gen_random_uuid());
BEGIN
 INSERT INTO public.courses(id,organization_id,title) VALUES((f->>'c')::uuid,p_org,'SYNTHETIC lifecycle only');
 INSERT INTO public.course_modules(id,course_id,title,order_index) VALUES((f->>'m')::uuid,(f->>'c')::uuid,'SYNTHETIC module',0);
 INSERT INTO public.lessons(id,course_id,module_id,title,type,content,order_index) VALUES((f->>'l')::uuid,(f->>'c')::uuid,(f->>'m')::uuid,'SYNTHETIC text','text','Synthetic lifecycle text, no qualification or approval.',0);
 INSERT INTO public.test_questions(id,lesson_id,question,options,correct_answer,explanation,order_index) VALUES((f->>'q')::uuid,(f->>'l')::uuid,'SYNTHETIC control','["A","B"]'::jsonb,0,'Synthetic fixture only',0);
 INSERT INTO public.lesson_attachments(id,lesson_id,name,file_url,order_index) VALUES((f->>'a')::uuid,(f->>'l')::uuid,'SYNTHETIC attachment','https://example.invalid/lifecycle',0);
 INSERT INTO public.course_documents(id,course_id,module_id,name,file_url,sort_order) VALUES((f->>'d')::uuid,(f->>'c')::uuid,(f->>'m')::uuid,'SYNTHETIC document','https://example.invalid/lifecycle',0);
 INSERT INTO public.marketplace_courses(id,course_id,organization_id,is_validated,is_active) VALUES((f->>'s')::uuid,(f->>'c')::uuid,p_org,false,true);
 RETURN f;
END;$qa$;
INSERT INTO pcr_lifecycle_fixtures(ordinal,label,action,organization_id,ids)
SELECT n,label,action,org,pg_temp.pcr_lifecycle_seed(org) FROM(VALUES
 (1,'C15_CLIENT_COURSE_CASCADE','course','20000000-0000-0000-0000-000000000001'::uuid),
 (2,'C15_CLIENT_LESSON_CASCADE','lesson','20000000-0000-0000-0000-000000000001'::uuid),
 (3,'C15_CLIENT_MODULE_SET_NULL','module','20000000-0000-0000-0000-000000000001'::uuid),
 (4,'C16_OWN_COURSE_CASCADE','course','4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid),
 (5,'C16_OWN_LESSON_CASCADE','lesson','4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid),
 (6,'C16_OWN_MODULE_SET_NULL','module','4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid),
 (7,'C15_NESTED_PARENT_BEFORE_MODULE_SET_NULL','nested','20000000-0000-0000-0000-000000000001'::uuid),
 (8,'C15_CANCELLED_CLIENT_PARENT_NO_TOMBSTONE','cancel','20000000-0000-0000-0000-000000000001'::uuid)
)v(n,label,action,org);
UPDATE pcr_lifecycle_fixtures f SET before_tree=pg_temp.pcr_lifecycle_tree(ids),before_generation=(SELECT r.generation FROM public.platform_course_publication_scope_revisions r WHERE r.course_id=(f.ids->>'c')::uuid);
CREATE FUNCTION public.qa_pcr_lifecycle_record_setnull() RETURNS trigger LANGUAGE plpgsql AS $qa$
BEGIN IF OLD.module_id IS NOT NULL AND NEW.module_id IS NULL THEN INSERT INTO pg_temp.pcr_lifecycle_observed VALUES(TG_TABLE_NAME,OLD.id);END IF;RETURN NEW;END;$qa$;
CREATE TRIGGER qa_pcr_lifecycle_setnull_observe BEFORE UPDATE OF module_id ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.qa_pcr_lifecycle_record_setnull();
CREATE TRIGGER qa_pcr_lifecycle_setnull_observe BEFORE UPDATE OF module_id ON public.course_documents FOR EACH ROW EXECUTE FUNCTION public.qa_pcr_lifecycle_record_setnull();
CREATE FUNCTION public.qa_pcr_lifecycle_parent_before() RETURNS trigger LANGUAGE plpgsql AS $qa$
DECLARE f record;
BEGIN
 SELECT * INTO f FROM pg_temp.pcr_lifecycle_fixtures WHERE (ids->>'c')::uuid=OLD.id;
 IF f.action='nested' THEN
  DELETE FROM public.course_modules WHERE id=(f.ids->>'m')::uuid;
  PERFORM pg_temp.pcr_lifecycle_must(EXISTS(SELECT 1 FROM public.platform_course_publication_deleted_parents w WHERE w.transaction_id=pg_current_xact_id()::text AND w.parent_table='courses' AND w.parent_id=OLD.id AND NOT w.statement_finished),'NESTED_BEFORE_MUST_RETAIN_UNFINISHED_PARENT_WITNESS');
 ELSIF f.action='cancel' THEN RETURN NULL;
 END IF;
 RETURN OLD;
END;$qa$;
-- Nine z characters sort after the existing eight-z PCR BEFORE classifier.
CREATE TRIGGER zzzzzzzzz_qa_pcr_lifecycle_parent_before BEFORE DELETE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.qa_pcr_lifecycle_parent_before();
DO $cases$
DECLARE r record;t jsonb;
BEGIN
 FOR r IN SELECT * FROM pg_temp.pcr_lifecycle_fixtures ORDER BY ordinal LOOP
  IF r.action IN('course','nested','cancel') THEN DELETE FROM public.courses WHERE id=(r.ids->>'c')::uuid;
  ELSIF r.action='lesson' THEN DELETE FROM public.lessons WHERE id=(r.ids->>'l')::uuid;
  ELSIF r.action='module' THEN DELETE FROM public.course_modules WHERE id=(r.ids->>'m')::uuid;
  ELSE RAISE EXCEPTION 'PCR_CASCADE_UNKNOWN_ACTION';END IF;
  t:=pg_temp.pcr_lifecycle_tree(r.ids);
  IF r.action IN('course','nested') THEN
   PERFORM pg_temp.pcr_lifecycle_must(NOT EXISTS(SELECT 1 FROM jsonb_each(t)e WHERE e.value IS DISTINCT FROM 'null'::jsonb),r.label||'_ALL_DESCENDANTS_GONE');
  ELSIF r.action='lesson' THEN
   PERFORM pg_temp.pcr_lifecycle_must(t->'lesson'='null'::jsonb AND t->'question'='null'::jsonb AND t->'attachment'='null'::jsonb AND t->'course'=r.before_tree->'course' AND t->'module'=r.before_tree->'module' AND t->'document'=r.before_tree->'document' AND t->'listing'=r.before_tree->'listing',r.label||'_ONLY_LESSON_SUBTREE_REMOVED');
  ELSIF r.action='module' THEN
   PERFORM pg_temp.pcr_lifecycle_must(t->'module'='null'::jsonb AND t->'course'=r.before_tree->'course' AND t->'question'=r.before_tree->'question' AND t->'attachment'=r.before_tree->'attachment' AND t->'listing'=r.before_tree->'listing' AND t->'lesson'->'module_id'='null'::jsonb AND t->'document'->'module_id'='null'::jsonb AND ((t->'lesson')-ARRAY['module_id','updated_at'])=((r.before_tree->'lesson')-ARRAY['module_id','updated_at']) AND ((t->'document')-ARRAY['module_id','updated_at'])=((r.before_tree->'document')-ARRAY['module_id','updated_at']),r.label||'_NATIVE_SETNULL_RETAINED_ROWS');
  ELSIF r.action='cancel' THEN PERFORM pg_temp.pcr_lifecycle_must(t=r.before_tree,r.label||'_ALL_SOURCE_ROWS_EXACT');
  END IF;
  IF r.action IN('module','nested') THEN
   PERFORM pg_temp.pcr_lifecycle_must((SELECT count(*)=2 FROM pg_temp.pcr_lifecycle_observed o WHERE (o.table_name='lessons' AND o.row_id=(r.ids->>'l')::uuid) OR(o.table_name='course_documents' AND o.row_id=(r.ids->>'d')::uuid)),r.label||'_BOTH_SETNULL_ROUTES_OBSERVED');
  END IF;
  IF r.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid THEN
   PERFORM pg_temp.pcr_lifecycle_must((SELECT generation=r.before_generation AND active=(r.action<>'course') FROM public.platform_course_publication_scope_revisions WHERE course_id=(r.ids->>'c')::uuid),r.label||'_GENERATION_RETAINED_AND_ACTIVE_STATE_CORRECT');
  END IF;
  PERFORM pg_temp.pcr_lifecycle_must(NOT EXISTS(SELECT 1 FROM public.platform_course_publication_deleted_parents),r.label||'_NO_LEFTOVER_WITNESS');
  RAISE NOTICE 'PCR_CASCADE_SUBCASE_PASS %',r.label;
 END LOOP;
END;$cases$;
DO $orphan$
DECLARE f jsonb;v_state text;v_message text;
BEGIN
 SELECT ids INTO f FROM pg_temp.pcr_lifecycle_fixtures WHERE label='C15_CLIENT_COURSE_CASCADE';
 BEGIN
  INSERT INTO public.test_questions(id,lesson_id,question,options,correct_answer) VALUES(gen_random_uuid(),(f->>'l')::uuid,'SYNTHETIC rejected orphan','["A","B"]'::jsonb,0);
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_state=RETURNED_SQLSTATE,v_message=MESSAGE_TEXT;END;
 PERFORM pg_temp.pcr_lifecycle_must(v_state='40001' AND v_message='PCR_PARENT_UNAVAILABLE_RETRY','ORPHAN_INSERT_STILL_FAILS_CLOSED');
 PERFORM pg_temp.pcr_lifecycle_must(NOT EXISTS(SELECT 1 FROM public.platform_course_publication_deleted_parents),'ORPHAN_NO_CONTEXT_LEAK');
 RAISE NOTICE 'PCR_CASCADE_SUBCASE_PASS C15_ORPHAN_INSERT_STILL_REJECTED';
END;$orphan$;
DO $history$ BEGIN
 PERFORM pg_temp.pcr_lifecycle_must((SELECT reviews=public.pcr_v2_sha(coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.sequence) FROM public.platform_course_publication_review_events e),'[]'::jsonb)) AND retained=public.pcr_v2_sha(coalesce((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.id) FROM public.qa_retained_results h),'[]'::jsonb)) FROM pg_temp.pcr_lifecycle_preservation),'EXISTING_REVIEW_AND_RETAINED_HISTORY_EXACT');
 RAISE NOTICE 'PCR_CASCADE_SUBCASE_PASS C16_RETAINED_HISTORY_EXACT';
END;$history$;
ROLLBACK;
\echo PCR_CASCADE_EXTRA10_ROLLBACK_COMPLETE
