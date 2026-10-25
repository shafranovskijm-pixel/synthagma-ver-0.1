-- UC024637: frozen disposal journal supplement. Old schema1 packages remain immutable.
BEGIN;
SET LOCAL search_path=pg_catalog,public;
DO $preflight$ BEGIN
 IF to_regclass('public.uc_archive_package_supplements') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname IN('uc_ap_journal','uc_ap_freeze','uc_ap_access'))THEN RAISE EXCEPTION 'ARCHIVE_SUPPLEMENT_COLLISION';END IF;
 IF (SELECT md5(p.prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname='uc_archive_prepare_package')IS DISTINCT FROM 'fa833c59812675786e23155b98779edb'THEN RAISE EXCEPTION 'ARCHIVE_SUPPLEMENT_PREIMAGE_uc_archive_prepare_package';END IF;
 IF (SELECT md5(p.prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname='uc_archive_package_access')IS DISTINCT FROM '64991149a013bc21df9f91ab3498d68e'THEN RAISE EXCEPTION 'ARCHIVE_SUPPLEMENT_PREIMAGE_uc_archive_package_access';END IF;
 IF (SELECT md5(p.prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname='archive_package_context')IS DISTINCT FROM '3603bbe2ac0d635ee63c53108748a870'THEN RAISE EXCEPTION 'ARCHIVE_SUPPLEMENT_PREIMAGE_archive_package_context';END IF;
 IF (SELECT md5(p.prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname='commit_archive_package')IS DISTINCT FROM 'b3d07d50ba266fa7ec5f9b63438bc5b3'THEN RAISE EXCEPTION 'ARCHIVE_SUPPLEMENT_PREIMAGE_commit_archive_package';END IF;
 IF (SELECT md5(p.prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname='commit_archive_restore')IS DISTINCT FROM '97b948e93fb82531ea3964a1d622d7c6'THEN RAISE EXCEPTION 'ARCHIVE_SUPPLEMENT_PREIMAGE_commit_archive_restore';END IF;
 IF (SELECT md5(p.prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname='uc_archive_personal_counts')IS DISTINCT FROM '7b7edd25b62d9d5808376a2eaaa30bdb'THEN RAISE EXCEPTION 'ARCHIVE_SUPPLEMENT_PREIMAGE_uc_archive_personal_counts';END IF;
 IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid='public.apply_archive_case(uuid,jsonb,uuid,uuid,bigint,jsonb)'::regprocedure)IS DISTINCT FROM 'fd21e2cf91938e333f685fc94e02e435'THEN RAISE EXCEPTION 'ARCHIVE_SUPPLEMENT_PREIMAGE_apply_archive_case';END IF;
END $preflight$;
CREATE TABLE public.uc_archive_package_supplements(
 package_id uuid PRIMARY KEY REFERENCES public.uc_archive_package_builds(id) ON DELETE RESTRICT,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 case_id uuid NOT NULL REFERENCES public.uc_archive_cases(id) ON DELETE RESTRICT,
 input_revision bigint NOT NULL CHECK(input_revision BETWEEN 1 AND 9007199254740991),input_state_hash text NOT NULL CHECK(input_state_hash~'^[a-f0-9]{64}$'),
 actor_id uuid NOT NULL,disposal_journal jsonb NOT NULL CHECK(jsonb_typeof(disposal_journal)='object'),
 supplementary_members jsonb NOT NULL CHECK(jsonb_typeof(supplementary_members)='array'),captures jsonb NOT NULL CHECK(jsonb_typeof(captures)='array'),
 retained_people uuid[] NOT NULL,snapshot_sha256 text NOT NULL CHECK(snapshot_sha256~'^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(octet_length(disposal_journal::text)+octet_length(supplementary_members::text)+octet_length(captures::text)<=8388608)
);
ALTER TABLE public.uc_archive_package_supplements ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER uc_archive_package_supplement_immutable BEFORE UPDATE OR DELETE ON public.uc_archive_package_supplements FOR EACH ROW EXECUTE FUNCTION public.uc_archive_immutable();

CREATE FUNCTION public.uc_ap_journal(p_org uuid,p_case uuid,p_ceiling bigint DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $supplement$
DECLARE v_ceiling bigint;v_rows jsonb;v_body jsonb;BEGIN
 SELECT coalesce(max(a.sequence),0) INTO v_ceiling FROM public.uc_archive_disposal_act_revisions a WHERE a.organization_id=p_org AND a.case_id=p_case AND (p_ceiling IS NULL OR a.sequence<=p_ceiling);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'act_id',a.act_id,'revision',a.revision,'prior_id',a.prior_id,'sequence',a.sequence,'record_data',literal.value,'record_sha256',public.uc_archive_event_hash(literal.value)) ORDER BY a.sequence),'[]') INTO v_rows
 FROM public.uc_archive_disposal_act_revisions a CROSS JOIN LATERAL(SELECT public.uc_archive_json_literal(to_jsonb(a)-ARRAY['request_sha256','retained_people']) value)literal WHERE a.organization_id=p_org AND a.case_id=p_case AND a.sequence<=v_ceiling;
 IF jsonb_array_length(v_rows)>10000 OR octet_length(v_rows::text)>4194304 THEN PERFORM public.uc_archive_error('LIMIT_EXCEEDED');END IF;
 v_body:=jsonb_build_object('ceiling',v_ceiling,'revision_count',jsonb_array_length(v_rows),'revisions',v_rows);
 RETURN v_body||jsonb_build_object('journal_sha256',public.uc_archive_event_hash(v_body));
END $supplement$;

CREATE FUNCTION public.uc_ap_freeze(p_head public.uc_archive_cases) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $supplement$
DECLARE v_journal jsonb;v_raw_rows jsonb;v_ref jsonb;v_proof jsonb;v_member jsonb;v_members jsonb:='[]';v_captures jsonb:='[]';v_mapping jsonb;v_file jsonb;v_files uuid[];v_file_id uuid;v_member_id uuid;v_people uuid[];BEGIN
 v_journal:=public.uc_ap_journal(p_head.organization_id,p_head.id,NULL);
 SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.sequence),'[]') INTO v_raw_rows FROM public.uc_archive_disposal_act_revisions a WHERE a.organization_id=p_head.organization_id AND a.case_id=p_head.id AND a.sequence<=(v_journal->>'ceiling')::bigint;
 SELECT coalesce(array_agg(DISTINCT person.id),'{}') INTO v_people FROM public.uc_archive_disposal_act_revisions a CROSS JOIN LATERAL unnest(a.retained_people||ARRAY[a.actor_id])person(id) WHERE a.organization_id=p_head.organization_id AND a.case_id=p_head.id AND a.sequence<=(v_journal->>'ceiling')::bigint AND person.id IS NOT NULL;
 -- Do not multiply journal records by participants; raw traversal only discovers source references.
 FOR v_ref IN WITH RECURSIVE nodes(value) AS(SELECT v_raw_rows UNION ALL SELECT child.value FROM nodes n CROSS JOIN LATERAL(SELECT a.value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.value)='array' THEN n.value ELSE '[]'::jsonb END)a UNION ALL SELECT o.value FROM jsonb_each(CASE WHEN jsonb_typeof(n.value)='object' THEN n.value ELSE '{}'::jsonb END)o)child) SELECT DISTINCT n.value FROM nodes n WHERE n.value->>'kind'='organization_document_version' LOOP
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_head.members)m WHERE m.value->'source'=v_ref) THEN CONTINUE;END IF;
  IF jsonb_array_length(v_members)+jsonb_array_length(p_head.members)>=10000 THEN PERFORM public.uc_archive_error('LIMIT_EXCEEDED');END IF;
  v_proof:=public.uc_archive_source(p_head.organization_id,p_head.scope,v_ref,true,true);v_member_id:=gen_random_uuid();v_files:='{}';v_mapping:='[]';
  FOR v_file IN SELECT f.value FROM jsonb_array_elements(v_proof->'private_files')f LOOP
   v_file_id:=gen_random_uuid();v_files:=array_append(v_files,v_file_id);v_mapping:=v_mapping||jsonb_build_array(jsonb_build_object('file_id',v_file_id,'private_file',v_file));
  END LOOP;
  v_member:=jsonb_build_object('id',v_member_id,'source',v_ref,'required',true,'relationship','evidence','subjects',v_proof->'subjects','attribution_actors',v_proof->'attribution_actors','file_ids',to_jsonb(v_files),'label',v_proof->'label');
  v_members:=v_members||jsonb_build_array(v_member);v_captures:=v_captures||jsonb_build_array(jsonb_build_object('member_id',v_member_id,'source_proof',v_proof,'file_mapping',v_mapping));
  v_people:=v_people||public.uc_archive_people(v_proof->'subjects')||public.uc_archive_people(v_proof->'attribution_actors');
 END LOOP;
 SELECT coalesce(array_agg(DISTINCT p.id ORDER BY p.id),'{}') INTO v_people FROM unnest(v_people||ARRAY[auth.uid()])p(id) WHERE p.id IS NOT NULL;
 PERFORM public.uc_archive_fence(p_head.organization_id,p_head.scope,v_people,true,NULL);
 RETURN jsonb_build_object('disposal_journal',v_journal,'supplementary_members',v_members,'captures',v_captures,'retained_people',to_jsonb(v_people));
END $supplement$;

CREATE FUNCTION public.uc_ap_access(p_build public.uc_archive_package_builds,p_scope jsonb,p_lock boolean DEFAULT false) RETURNS public.uc_archive_package_supplements LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $supplement$
DECLARE v_row public.uc_archive_package_supplements;v_capture jsonb;v_current jsonb;v_frozen jsonb;BEGIN
 SELECT s.* INTO v_row FROM public.uc_archive_package_supplements s WHERE s.package_id=p_build.id;
 IF v_row.package_id IS NULL THEN RETURN v_row;END IF;
 IF v_row.organization_id IS DISTINCT FROM p_build.organization_id OR v_row.case_id IS DISTINCT FROM p_build.case_id OR v_row.input_revision IS DISTINCT FROM p_build.input_revision OR v_row.input_state_hash IS DISTINCT FROM p_build.input_state_hash OR v_row.actor_id IS DISTINCT FROM p_build.actor_id THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 PERFORM public.uc_archive_fence(p_build.organization_id,p_scope,v_row.retained_people,p_lock,NULL);
 IF public.uc_ap_journal(p_build.organization_id,p_build.case_id,(v_row.disposal_journal->>'ceiling')::bigint) IS DISTINCT FROM v_row.disposal_journal OR public.uc_archive_event_hash(jsonb_build_object('disposal_journal',v_row.disposal_journal,'supplementary_members',v_row.supplementary_members,'captures',v_row.captures,'retained_people',to_jsonb(v_row.retained_people))) IS DISTINCT FROM v_row.snapshot_sha256 THEN PERFORM public.uc_archive_error('HASH_MISMATCH');END IF;
 FOR v_capture IN SELECT c.value FROM jsonb_array_elements(v_row.captures)c LOOP
  v_frozen:=v_capture->'source_proof';v_current:=public.uc_archive_source(p_build.organization_id,p_scope,v_frozen->'source',p_lock,true);
  IF v_current IS DISTINCT FROM v_frozen THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 END LOOP;
 RETURN v_row;
END $supplement$;

CREATE OR REPLACE FUNCTION public.uc_archive_prepare_package(p_head public.uc_archive_cases,p_request uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $archive$
DECLARE head public.uc_archive_cases;build_row public.uc_archive_package_builds;v_supplement jsonb;v_people uuid[];BEGIN
 head:=public.uc_archive_case_access(p_head.organization_id,p_head.scope,p_head.id,true);
 IF head.revision<>p_head.revision OR head.state_hash<>p_head.state_hash THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');END IF;
 IF NOT(public.uc_archive_caps(head.organization_id,head.scope)->>'can_operate')::boolean OR jsonb_array_length(head.members)=0 THEN PERFORM public.uc_archive_error('APPROVAL_REQUIRED');END IF;
 v_supplement:=public.uc_ap_freeze(head);v_people:=head.retained_subjects||head.attribution_actors||public.uc_archive_people(v_supplement->'retained_people');
 INSERT INTO public.uc_archive_package_builds(case_id,organization_id,actor_id,input_revision,input_state_hash,phase,request_id,retained_people)VALUES(head.id,head.organization_id,auth.uid(),head.revision,head.state_hash,'prepared',p_request,v_people)RETURNING *INTO build_row;
 INSERT INTO public.uc_archive_package_supplements(package_id,organization_id,case_id,input_revision,input_state_hash,actor_id,disposal_journal,supplementary_members,captures,retained_people,snapshot_sha256)VALUES(build_row.id,head.organization_id,head.id,head.revision,head.state_hash,auth.uid(),v_supplement->'disposal_journal',v_supplement->'supplementary_members',v_supplement->'captures',public.uc_archive_people(v_supplement->'retained_people'),public.uc_archive_event_hash(v_supplement));
 RETURN public.uc_archive_package_projection(build_row);
END;$archive$;
CREATE OR REPLACE FUNCTION public.uc_archive_package_access(p_org uuid,p_scope jsonb,p_package uuid,p_write boolean DEFAULT false,p_current boolean DEFAULT false)RETURNS public.uc_archive_package_builds LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $archive$
DECLARE build_row public.uc_archive_package_builds;head public.uc_archive_cases;BEGIN
 SELECT b.*INTO build_row FROM public.uc_archive_package_builds b WHERE b.id=p_package AND b.organization_id=p_org;
 IF build_row.id IS NULL THEN PERFORM public.uc_archive_error('NOT_FOUND');END IF;
 head:=public.uc_archive_case_access(p_org,p_scope,build_row.case_id,p_write);
 PERFORM public.uc_archive_fence(p_org,head.scope,build_row.retained_people||head.retained_subjects||head.attribution_actors,p_write,NULL);
 PERFORM public.uc_ap_access(build_row,head.scope,p_write);
 IF p_current AND(head.revision<>build_row.input_revision OR head.state_hash<>build_row.input_state_hash)THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 IF p_write THEN SELECT b.*INTO build_row FROM public.uc_archive_package_builds b WHERE b.id=build_row.id FOR UPDATE NOWAIT;END IF;RETURN build_row;
END;$archive$;
CREATE OR REPLACE FUNCTION public.archive_package_context(p_org uuid,p_scope jsonb,p_package uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE supplement_row public.uc_archive_package_supplements;build_row public.uc_archive_package_builds;case_event public.uc_archive_case_events;head public.uc_archive_cases;rule_row public.uc_archive_rule_revisions;member_files jsonb;member_value jsonb;capture_value jsonb;linked_capture jsonb;dependency_ref jsonb;event_value jsonb;record_value jsonb;records_value jsonb:='[]';files_value jsonb:='[]';case_history jsonb;source_history jsonb;blockers_value jsonb:='[]';BEGIN
 build_row:=public.uc_archive_package_access(p_org,p_scope,p_package,false,true);head:=public.uc_archive_case_access(p_org,p_scope,build_row.case_id,false);
 IF build_row.actor_id<>auth.uid()OR NOT(public.uc_archive_caps(p_org,head.scope)->>'can_operate')::boolean THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 supplement_row:=public.uc_ap_access(build_row,head.scope,false);
 IF supplement_row.package_id IS NULL AND build_row.phase<>'sealed' AND EXISTS(SELECT 1 FROM public.uc_archive_disposal_act_revisions a WHERE a.organization_id=p_org AND a.case_id=head.id)THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 IF head.rule_version_id IS NOT NULL THEN SELECT r.*INTO rule_row FROM public.uc_archive_rule_revisions r WHERE r.id=head.rule_version_id AND r.organization_id=p_org;END IF;
 FOR member_value IN SELECT m.value FROM jsonb_array_elements(head.members)m LOOP
  SELECT candidate.capture INTO linked_capture FROM public.uc_archive_case_events e CROSS JOIN LATERAL(SELECT e.private_capture capture WHERE e.private_capture->>'member_id'=member_value->>'id'UNION ALL SELECT a.value FROM jsonb_array_elements(coalesce(e.private_capture->'automatic_members','[]'::jsonb))a WHERE a.value->>'member_id'=member_value->>'id')candidate WHERE e.organization_id=p_org AND e.case_id=head.id AND e.revision<=build_row.input_revision ORDER BY e.revision DESC LIMIT 1;
  IF linked_capture IS NULL THEN PERFORM public.uc_archive_error('PACKAGE_INCOMPLETE');END IF;capture_value:=linked_capture->'source_proof';
  IF capture_value->'source'IS DISTINCT FROM member_value->'source'THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
  -- Current source authorization is mandatory even though the copied record is the immutable earlier capture.
  PERFORM public.uc_archive_source(p_org,head.scope,member_value->'source',false,false);
  source_history:='[]';
  FOR event_value IN SELECT h.value FROM jsonb_array_elements(capture_value->'history')h LOOP
   record_value:=public.uc_archive_json_literal(event_value->'payload');
   source_history:=source_history||jsonb_build_array(jsonb_build_object('id',event_value->'id','sequence',event_value->'sequence','source_revision',event_value->'source_revision','payload',record_value,'payload_sha256',public.uc_archive_event_hash(record_value)));
  END LOOP;
  record_value:=public.uc_archive_json_literal(capture_value->'captured_record');
  records_value:=records_value||jsonb_build_array(jsonb_build_object('export_id',member_value->'id','member_id',member_value->'id','source',member_value->'source','record_data',record_value,'record_sha256',public.uc_archive_event_hash(record_value),'references','[]'::jsonb,'history_kind',capture_value->'history_kind','expected_event_count',capture_value->'expected_event_count','events',source_history));
  member_files:=coalesce(linked_capture->'file_mapping','[]'::jsonb);
  IF rule_row.id IS NOT NULL AND member_value->'source'=rule_row.source_reference AND rule_row.source_check IS NOT NULL THEN
   SELECT coalesce(jsonb_agg(jsonb_set(f.value,'{private_file,known_sha256}',to_jsonb(rule_row.source_byte_sha256),true)ORDER BY f.ordinality),'[]')INTO member_files FROM jsonb_array_elements(member_files)WITH ORDINALITY f(value,ordinality);
  END IF;files_value:=files_value||member_files;
  IF capture_value->>'history_kind'='unverified_legacy'THEN blockers_value:=blockers_value||jsonb_build_array('PACKAGE_INCOMPLETE');END IF;
  blockers_value:=blockers_value||coalesce(capture_value->'source_blockers','[]'::jsonb);
 END LOOP;
 IF supplement_row.package_id IS NOT NULL THEN
  FOR linked_capture IN SELECT c.value FROM jsonb_array_elements(supplement_row.captures)c LOOP
   SELECT m.value INTO member_value FROM jsonb_array_elements(supplement_row.supplementary_members)m WHERE m.value->'id'=linked_capture->'member_id';capture_value:=linked_capture->'source_proof';
   IF member_value IS NULL OR capture_value->'source' IS DISTINCT FROM member_value->'source' THEN PERFORM public.uc_archive_error('PACKAGE_INCOMPLETE');END IF;
   record_value:=public.uc_archive_json_literal(capture_value->'captured_record');
   records_value:=records_value||jsonb_build_array(jsonb_build_object('export_id',member_value->'id','member_id',member_value->'id','source',member_value->'source','record_data',record_value,'record_sha256',public.uc_archive_event_hash(record_value),'references','[]'::jsonb,'history_kind','immutable_source','expected_event_count',0,'events','[]'::jsonb));
   files_value:=files_value||(linked_capture->'file_mapping');
  END LOOP;
 END IF;
 SELECT coalesce(jsonb_agg(public.uc_archive_event_projection(e)ORDER BY e.revision),'[]')INTO case_history FROM public.uc_archive_case_events e WHERE e.organization_id=p_org AND e.case_id=head.id AND e.revision<=build_row.input_revision;
 IF jsonb_array_length(case_history)<>build_row.input_revision OR jsonb_array_length(files_value)>10000 THEN PERFORM public.uc_archive_error('PACKAGE_INCOMPLETE');END IF;
 -- Every org-version reference carried by the case or its authority/history facts needs a copied member.
 FOR dependency_ref IN WITH RECURSIVE nodes(value)AS(SELECT jsonb_build_object('case_snapshot',public.uc_archive_case_projection(head),'case_events',case_history)UNION ALL SELECT child.value FROM nodes n CROSS JOIN LATERAL(SELECT a.value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.value)='array'THEN n.value ELSE'[]'::jsonb END)a UNION ALL SELECT o.value FROM jsonb_each(CASE WHEN jsonb_typeof(n.value)='object'THEN n.value ELSE'{}'::jsonb END)o)child)SELECT DISTINCT n.value FROM nodes n WHERE n.value->>'kind'='organization_document_version'LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(head.members)m WHERE m.value->'source'=dependency_ref)THEN blockers_value:=blockers_value||jsonb_build_array('PACKAGE_INCOMPLETE');END IF;
 END LOOP;
 SELECT coalesce(jsonb_agg(x.value ORDER BY x.value),'[]')INTO blockers_value FROM(SELECT DISTINCT b.value FROM jsonb_array_elements(blockers_value)b)x;
 RETURN jsonb_build_object('schema_version',CASE WHEN supplement_row.package_id IS NULL THEN 1 ELSE 2 END,'build',public.uc_archive_package_projection(build_row),'actor_id',build_row.actor_id,'request_id',build_row.request_id,'case_snapshot',public.uc_archive_case_projection(head),'case_events',case_history,'records',records_value,'private_files',files_value,'blockers',blockers_value,'created_at',build_row.created_at,'lease_id',build_row.lease_id,'lease_until',build_row.lease_until)||CASE WHEN supplement_row.package_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('supplementary_members',supplement_row.supplementary_members,'disposal_journal',supplement_row.disposal_journal)END;
END;$archive$;


-- UC024 fragment 63_archive_disposal_review.sql
-- A persisted destruction REVIEW is not destruction authority. No expiry job, physical deletion or implicit legal acceptance exists.
CREATE OR REPLACE FUNCTION public.commit_archive_package(p_package uuid,p_lease uuid,p_manifest jsonb,p_manifest_sha256 text,p_manifest_bytes bigint,p_files jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE build_row public.uc_archive_package_builds;head public.uc_archive_cases;context_value jsonb;manifest_literal text;file_value jsonb;proof_value jsonb;mapping_value jsonb;descriptor jsonb;member_value jsonb;object_value storage.objects;expected_files jsonb:='[]';all_people uuid[];expected_path text;claims_text text:=current_setting('request.jwt.claims',true);sub_text text:=current_setting('request.jwt.claim.sub',true);role_text text:=current_setting('request.jwt.claim.role',true);projected boolean:=false;replayed boolean:=false;BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR coalesce(claims_text,'')=''OR jsonb_typeof(claims_text::jsonb)IS DISTINCT FROM'object'OR claims_text::jsonb->>'role'IS DISTINCT FROM'service_role'OR nullif(claims_text::jsonb->>'sub','')IS NOT NULL THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 SELECT b.*INTO build_row FROM public.uc_archive_package_builds b WHERE b.id=p_package;
 IF build_row.id IS NULL THEN PERFORM public.uc_archive_error('NOT_FOUND');END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);PERFORM set_config('request.jwt.claim.role','',true);PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',build_row.actor_id)::text,true);projected:=true;
 SELECT c.*INTO head FROM public.uc_archive_cases c WHERE c.id=build_row.case_id AND c.organization_id=build_row.organization_id;
 build_row:=public.uc_archive_package_access(build_row.organization_id,head.scope,build_row.id,true,true);
 IF NOT(public.uc_archive_caps(build_row.organization_id,head.scope)->>'can_operate')::boolean OR p_lease IS NULL OR build_row.lease_id IS DISTINCT FROM p_lease OR build_row.phase NOT IN('generating','sealed')THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 context_value:=public.archive_package_context(build_row.organization_id,head.scope,build_row.id);
 IF NOT public.uc_custom_journal_shape(p_manifest,ARRAY['schema_version','package_id','organization_id','case_id','case_revision','case_state_hash','created_at','completeness','case_snapshot','members','case_events','records','files','missing_member_ids','blockers']||CASE WHEN context_value->'schema_version'='2'::jsonb THEN ARRAY['supplementary_members','disposal_journal'] ELSE '{}'::text[] END)OR p_manifest->'schema_version'IS DISTINCT FROM context_value->'schema_version' OR p_manifest->>'package_id'IS DISTINCT FROM build_row.id::text OR p_manifest->>'organization_id'IS DISTINCT FROM build_row.organization_id::text OR p_manifest->>'case_id'IS DISTINCT FROM build_row.case_id::text OR p_manifest->'case_revision'IS DISTINCT FROM to_jsonb(build_row.input_revision)OR p_manifest->>'case_state_hash'IS DISTINCT FROM build_row.input_state_hash
 OR p_manifest->'created_at'IS DISTINCT FROM context_value->'created_at'OR p_manifest->'case_snapshot'IS DISTINCT FROM context_value->'case_snapshot'OR p_manifest->'members'IS DISTINCT FROM((context_value->'case_snapshot'->'members')||coalesce(context_value->'supplementary_members','[]'::jsonb)) OR context_value->'schema_version'='2'::jsonb AND(p_manifest->'supplementary_members'IS DISTINCT FROM context_value->'supplementary_members'OR p_manifest->'disposal_journal'IS DISTINCT FROM context_value->'disposal_journal')OR p_manifest->'case_events'IS DISTINCT FROM context_value->'case_events'OR p_manifest->'records'IS DISTINCT FROM context_value->'records'OR p_manifest->'missing_member_ids'IS DISTINCT FROM'[]'::jsonb OR p_manifest->'blockers'IS DISTINCT FROM context_value->'blockers'OR p_manifest->>'completeness'IS DISTINCT FROM(CASE WHEN jsonb_array_length(context_value->'blockers')=0 THEN'complete'ELSE'partial'END)
 OR jsonb_typeof(p_manifest->'files')IS DISTINCT FROM'array'OR jsonb_typeof(p_files)IS DISTINCT FROM'array'OR jsonb_array_length(p_files)>10000 OR jsonb_array_length(p_files)<>jsonb_array_length(context_value->'private_files')OR jsonb_array_length(p_manifest->'files')<>jsonb_array_length(p_files)THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 manifest_literal:=public.uc_archive_event_canonical(p_manifest);
 IF p_manifest_sha256 IS DISTINCT FROM public.uc_document_registry_hash(manifest_literal)OR p_manifest_bytes IS DISTINCT FROM octet_length(convert_to(manifest_literal,'UTF8'))::bigint OR p_manifest_bytes NOT BETWEEN 1 AND 4194304 THEN PERFORM public.uc_archive_error('HASH_MISMATCH');END IF;
 IF build_row.phase='sealed'THEN
  IF build_row.manifest IS DISTINCT FROM p_manifest OR build_row.manifest_sha256<>p_manifest_sha256 OR build_row.manifest_bytes<>p_manifest_bytes THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;replayed:=true;
 ELSE
  IF build_row.lease_until<=clock_timestamp()THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_files)f GROUP BY f.value->>'id'HAVING count(*)>1)OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_manifest->'files')f GROUP BY f.value->>'id'HAVING count(*)>1)THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
  FOR file_value IN SELECT f.value FROM jsonb_array_elements(p_manifest->'files')f LOOP
   SELECT f.value INTO proof_value FROM jsonb_array_elements(p_files)f WHERE f.value->'id'=file_value->'id';
   SELECT f.value INTO mapping_value FROM jsonb_array_elements(context_value->'private_files')f WHERE f.value->'file_id'=file_value->'id';descriptor:=mapping_value->'private_file';
   SELECT m.value INTO member_value FROM jsonb_array_elements((context_value->'case_snapshot'->'members')||coalesce(context_value->'supplementary_members','[]'::jsonb))m WHERE m.value->'id'=file_value->'member_id'AND m.value->'file_ids'@>jsonb_build_array(file_value->'id');
   IF proof_value IS NULL OR mapping_value IS NULL OR member_value IS NULL OR NOT public.uc_custom_journal_shape(proof_value,ARRAY['id','member_id','object_id','object_updated_at','byte_sha256','byte_size','mime_type','readback_sha256'])OR NOT public.uc_custom_journal_shape(file_value,ARRAY['id','member_id','source','byte_sha256','byte_size','mime_type','original_name','archive_path'])OR NOT public.uc_custom_journal_uuid(proof_value->'object_id')OR proof_value->'member_id'IS DISTINCT FROM member_value->'id'OR file_value->'source'IS DISTINCT FROM member_value->'source'OR proof_value->'byte_size'IS DISTINCT FROM descriptor->'byte_size'OR proof_value->'mime_type'IS DISTINCT FROM descriptor->'mime_type'OR file_value->'byte_size'IS DISTINCT FROM proof_value->'byte_size'OR file_value->'mime_type'IS DISTINCT FROM proof_value->'mime_type'OR file_value->'byte_sha256'IS DISTINCT FROM proof_value->'byte_sha256'OR proof_value->'readback_sha256'IS DISTINCT FROM proof_value->'byte_sha256'OR coalesce(proof_value->>'byte_sha256','')!~'^[a-f0-9]{64}$'OR descriptor?'known_sha256'AND descriptor->'known_sha256'IS DISTINCT FROM proof_value->'byte_sha256'OR file_value->>'original_name'IS DISTINCT FROM(file_value->>'id')||'.bin'OR file_value->>'archive_path'IS DISTINCT FROM'files/'||(file_value->>'id')||'/'||(file_value->>'byte_sha256')||'.bin'THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
   expected_path:=build_row.organization_id::text||'/'||build_row.id::text||'/files/'||(file_value->>'id')||'/'||(file_value->>'byte_sha256')||'.bin';
   SELECT o.*INTO object_value FROM storage.objects o JOIN storage.buckets bucket ON bucket.id=o.bucket_id AND NOT bucket.public WHERE o.id=(proof_value->>'object_id')::uuid AND o.bucket_id='archive-case-artifacts'AND o.name=expected_path FOR SHARE OF o NOWAIT;
   IF object_value.id IS NULL OR object_value.updated_at IS DISTINCT FROM(proof_value->>'object_updated_at')::timestamptz OR object_value.owner IS NOT NULL OR nullif(object_value.owner_id,'')IS NOT NULL OR object_value.metadata->>'mimetype'IS DISTINCT FROM proof_value->>'mime_type'OR coalesce(object_value.metadata->>'size',object_value.metadata->>'contentLength')IS DISTINCT FROM proof_value->>'byte_size'OR NOT public.uc_custom_journal_uuid(object_value.user_metadata->'lease_id')OR(object_value.user_metadata-'lease_id')IS DISTINCT FROM jsonb_build_object('package_id',build_row.id,'file_id',file_value->'id','sha256',file_value->'byte_sha256')THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
   INSERT INTO public.uc_archive_package_files(id,package_id,organization_id,member_id,source_reference,bucket_id,object_path,object_id,object_updated_at,byte_sha256,byte_size,mime_type,readback_sha256,retained_people)VALUES((file_value->>'id')::uuid,build_row.id,build_row.organization_id,(file_value->>'member_id')::uuid,member_value->'source','archive-case-artifacts',expected_path,object_value.id,object_value.updated_at,proof_value->>'byte_sha256',(proof_value->>'byte_size')::bigint,proof_value->>'mime_type',proof_value->>'readback_sha256',build_row.retained_people);
  END LOOP;
  PERFORM public.uc_archive_package_access(build_row.organization_id,head.scope,build_row.id,true,true);
  UPDATE public.uc_archive_package_builds b SET phase='sealed',manifest=p_manifest,manifest_sha256=p_manifest_sha256,manifest_bytes=p_manifest_bytes,completeness=p_manifest->>'completeness',blockers=p_manifest->'blockers',sealed_at=clock_timestamp()WHERE b.id=build_row.id AND b.lease_id=p_lease RETURNING b.*INTO build_row;
  IF build_row.id IS NULL THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 END IF;
 PERFORM set_config('request.jwt.claim.sub',coalesce(sub_text,''),true);PERFORM set_config('request.jwt.claim.role',coalesce(role_text,''),true);PERFORM set_config('request.jwt.claims',coalesce(claims_text,''),true);projected:=false;
 RETURN public.uc_archive_package_projection(build_row)||jsonb_build_object('actor_id',build_row.actor_id,'request_id',build_row.request_id,'replayed',replayed);
 EXCEPTION WHEN OTHERS THEN IF projected THEN PERFORM set_config('request.jwt.claim.sub',coalesce(sub_text,''),true);PERFORM set_config('request.jwt.claim.role',coalesce(role_text,''),true);PERFORM set_config('request.jwt.claims',coalesce(claims_text,''),true);END IF;RAISE;
END;$archive$;


-- UC024 fragment 66_archive_file_context.sql
-- Exact job-bound Storage context. This is not a caller-path or generic file-read API.
CREATE OR REPLACE FUNCTION public.commit_archive_restore(p_restore uuid,p_lease uuid,p_manifest_sha256 text,p_files jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $archive$
DECLARE run_row public.uc_archive_restore_runs;package_row public.uc_archive_package_builds;head public.uc_archive_cases;manifest_value jsonb;file_value jsonb;proof_value jsonb;object_row storage.objects;path_value text;projection_value jsonb;projection_hash text;verified_ids uuid[]:='{}';claims_text text:=current_setting('request.jwt.claims',true);sub_text text:=current_setting('request.jwt.claim.sub',true);role_text text:=current_setting('request.jwt.claim.role',true);projected boolean:=false;BEGIN
 IF auth.role()IS DISTINCT FROM'service_role'OR auth.uid()IS NOT NULL OR coalesce(claims_text,'')=''OR jsonb_typeof(claims_text::jsonb)IS DISTINCT FROM'object'OR claims_text::jsonb->>'role'IS DISTINCT FROM'service_role'OR nullif(claims_text::jsonb->>'sub','')IS NOT NULL THEN PERFORM public.uc_archive_error('ACCESS_DENIED');END IF;
 SELECT r.*INTO run_row FROM public.uc_archive_restore_runs r WHERE r.id=p_restore;
 IF run_row.id IS NULL THEN PERFORM public.uc_archive_error('NOT_FOUND');END IF;
 SELECT b.*INTO package_row FROM public.uc_archive_package_builds b WHERE b.id=run_row.package_id AND b.organization_id=run_row.organization_id;
 SELECT c.*INTO head FROM public.uc_archive_cases c WHERE c.id=package_row.case_id AND c.organization_id=run_row.organization_id;
 PERFORM set_config('request.jwt.claim.sub','',true);PERFORM set_config('request.jwt.claim.role','',true);PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',run_row.actor_id)::text,true);projected:=true;
 run_row:=public.uc_archive_restore_access(run_row.organization_id,head.scope,run_row.id,true);
 IF p_lease IS NULL OR run_row.lease_id IS DISTINCT FROM p_lease OR run_row.manifest_sha256 IS DISTINCT FROM p_manifest_sha256 OR run_row.state NOT IN('verifying','verified')THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 manifest_value:=package_row.manifest;
 IF run_row.state='verified'THEN
  -- Replay still requires current rights to the entire source, manifest and all copied subjects.
  PERFORM public.archive_restore_context(run_row.organization_id,head.scope,run_row.id);
 ELSE
  IF run_row.lease_until<=clock_timestamp()OR jsonb_typeof(p_files)IS DISTINCT FROM'array'OR jsonb_array_length(p_files)<>jsonb_array_length(manifest_value->'files')OR jsonb_array_length(p_files)>10000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_files)f GROUP BY f.value->>'file_id'HAVING count(*)>1)THEN PERFORM public.uc_archive_error('PACKAGE_INCOMPLETE');END IF;
  FOR file_value IN SELECT f.value FROM jsonb_array_elements(manifest_value->'files')f LOOP
   SELECT f.value INTO proof_value FROM jsonb_array_elements(p_files)f WHERE f.value->'file_id'=file_value->'id';
   IF proof_value IS NULL OR NOT public.uc_custom_journal_shape(proof_value,ARRAY['file_id','object_id','object_updated_at','byte_sha256','byte_size','mime_type','readback_sha256'])OR NOT public.uc_custom_journal_uuid(proof_value->'object_id')OR proof_value->'byte_sha256'IS DISTINCT FROM file_value->'byte_sha256'OR proof_value->'readback_sha256'IS DISTINCT FROM file_value->'byte_sha256'OR proof_value->'byte_size'IS DISTINCT FROM file_value->'byte_size'OR proof_value->'mime_type'IS DISTINCT FROM file_value->'mime_type'THEN PERFORM public.uc_archive_error('HASH_MISMATCH');END IF;
   PERFORM public.archive_sealed_file_context(run_row.organization_id,head.scope,run_row.package_id,(file_value->>'id')::uuid);
   path_value:=run_row.organization_id::text||'/restores/'||run_row.id::text||'/files/'||(file_value->>'id')||'/'||(file_value->>'byte_sha256')||'.bin';
   SELECT o.*INTO object_row FROM storage.objects o JOIN storage.buckets bucket ON bucket.id=o.bucket_id AND NOT bucket.public WHERE o.id=(proof_value->>'object_id')::uuid AND o.bucket_id='archive-case-artifacts'AND o.name=path_value FOR SHARE OF o NOWAIT;
   IF object_row.id IS NULL OR object_row.updated_at IS DISTINCT FROM(proof_value->>'object_updated_at')::timestamptz OR object_row.owner IS NOT NULL OR nullif(object_row.owner_id,'')IS NOT NULL OR object_row.metadata->>'mimetype'IS DISTINCT FROM file_value->>'mime_type'OR coalesce(object_row.metadata->>'size',object_row.metadata->>'contentLength')IS DISTINCT FROM file_value->>'byte_size'OR NOT public.uc_custom_journal_uuid(object_row.user_metadata->'lease_id')OR(object_row.user_metadata-'lease_id')IS DISTINCT FROM jsonb_build_object('restore_id',run_row.id,'package_id',run_row.package_id,'file_id',file_value->'id','sha256',file_value->'byte_sha256')THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
   INSERT INTO public.uc_archive_restore_files(restore_id,id,package_id,organization_id,bucket_id,object_path,object_id,object_updated_at,byte_sha256,byte_size,mime_type,readback_sha256,retained_people)VALUES(run_row.id,(file_value->>'id')::uuid,run_row.package_id,run_row.organization_id,'archive-case-artifacts',path_value,object_row.id,object_row.updated_at,file_value->>'byte_sha256',(file_value->>'byte_size')::bigint,file_value->>'mime_type',proof_value->>'readback_sha256',run_row.retained_people);
   verified_ids:=verified_ids||(file_value->>'id')::uuid;
  END LOOP;
  projection_value:=jsonb_build_object('schema_version',manifest_value->'schema_version','restore_id',run_row.id,'source_organization_id',run_row.organization_id,'target_organization_id',run_row.organization_id,'source_case_id',package_row.case_id,'source_manifest_sha256',run_row.manifest_sha256,'historical_only',true,'case_snapshot',manifest_value->'case_snapshot','case_events',manifest_value->'case_events','records',manifest_value->'records')||CASE WHEN manifest_value->'schema_version'='2'::jsonb THEN jsonb_build_object('supplementary_members',manifest_value->'supplementary_members','disposal_journal',manifest_value->'disposal_journal')ELSE '{}'::jsonb END;
  projection_hash:=public.uc_archive_event_hash(projection_value);
  INSERT INTO public.uc_archive_restore_projections(restore_id,organization_id,entity_kind,export_id,projection,projection_sha256,retained_people)VALUES(run_row.id,run_row.organization_id,'case_snapshot',package_row.case_id,projection_value,projection_hash,run_row.retained_people);
  FOR file_value IN SELECT r.value FROM jsonb_array_elements(manifest_value->'records')r LOOP INSERT INTO public.uc_archive_restore_projections(restore_id,organization_id,entity_kind,export_id,projection,projection_sha256,retained_people)VALUES(run_row.id,run_row.organization_id,'record',(file_value->>'export_id')::uuid,file_value,public.uc_archive_event_hash(file_value),run_row.retained_people);END LOOP;
  FOR file_value IN SELECT e.value FROM jsonb_array_elements(manifest_value->'case_events')e LOOP INSERT INTO public.uc_archive_restore_projections(restore_id,organization_id,entity_kind,export_id,projection,projection_sha256,retained_people)VALUES(run_row.id,run_row.organization_id,'case_event',(file_value->>'id')::uuid,file_value,public.uc_archive_event_hash(file_value),run_row.retained_people);END LOOP;
  FOR file_value IN SELECT f.value FROM jsonb_array_elements(manifest_value->'files')f LOOP
   projection_value:=jsonb_build_object('file_id',file_value->'id','source_package_id',run_row.package_id,'quarantine_path','quarantine/'||run_row.id::text||'/'||(file_value->>'archive_path'),'byte_sha256',file_value->'byte_sha256','byte_size',file_value->'byte_size','readback_sha256',file_value->'byte_sha256');
   INSERT INTO public.uc_archive_restore_projections(restore_id,organization_id,entity_kind,export_id,projection,projection_sha256,retained_people)VALUES(run_row.id,run_row.organization_id,'file_readback',(file_value->>'id')::uuid,projection_value,public.uc_archive_event_hash(projection_value),run_row.retained_people);
  END LOOP;
  PERFORM public.uc_archive_restore_access(run_row.organization_id,head.scope,run_row.id,true);
  UPDATE public.uc_archive_restore_runs r SET state='verified',verified_file_ids=verified_ids,projection_sha256=projection_hash,completed_at=clock_timestamp()WHERE r.id=run_row.id AND r.lease_id=p_lease RETURNING r.*INTO run_row;
  IF run_row.id IS NULL THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
 END IF;
 PERFORM set_config('request.jwt.claim.sub',coalesce(sub_text,''),true);PERFORM set_config('request.jwt.claim.role',coalesce(role_text,''),true);PERFORM set_config('request.jwt.claims',coalesce(claims_text,''),true);projected:=false;
 RETURN public.uc_archive_restore_projection(run_row);
 EXCEPTION WHEN OTHERS THEN IF projected THEN PERFORM set_config('request.jwt.claim.sub',coalesce(sub_text,''),true);PERFORM set_config('request.jwt.claim.role',coalesce(role_text,''),true);PERFORM set_config('request.jwt.claims',coalesce(claims_text,''),true);END IF;RAISE;
END;$archive$;


-- UC024 fragment 69a_archive_restore_storage.sql
-- Called only from the archive Storage BEFORE INSERT trigger after its original service-JWT/NULL-owner checks.
CREATE OR REPLACE FUNCTION public.uc_archive_personal_counts(p_user uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $archive$
 SELECT coalesce(jsonb_agg(jsonb_build_object('table',counts.table_name,'column','archive_retention_review_required','count',counts.n)ORDER BY counts.table_name),'[]'::jsonb)FROM(
 SELECT 'uc_archive_cases'::text table_name,count(*)n FROM public.uc_archive_cases r WHERE r.user_id=p_user OR r.created_by=p_user OR p_user=ANY(r.retained_subjects) OR p_user=ANY(r.attribution_actors)
 UNION ALL
 SELECT 'uc_archive_case_events'::text table_name,count(*)n FROM public.uc_archive_case_events r WHERE r.actor_id=p_user OR p_user=ANY(r.retained_people)
 UNION ALL
 SELECT 'uc_archive_requests'::text table_name,count(*)n FROM public.uc_archive_requests r WHERE r.actor_id=p_user OR p_user=ANY(r.retained_people)
 UNION ALL
 SELECT 'uc_archive_authority_revisions'::text table_name,count(*)n FROM public.uc_archive_authority_revisions r WHERE r.appointed_user_id=p_user OR r.actor_id=p_user OR p_user=ANY(r.retained_people)
 UNION ALL
 SELECT 'uc_archive_rule_revisions'::text table_name,count(*)n FROM public.uc_archive_rule_revisions r WHERE r.actor_id=p_user OR p_user=ANY(r.retained_people)
 UNION ALL
 SELECT 'uc_archive_package_builds'::text table_name,count(*)n FROM public.uc_archive_package_builds r WHERE r.actor_id=p_user OR p_user=ANY(r.retained_people)
 UNION ALL
 SELECT 'uc_archive_package_files'::text table_name,count(*)n FROM public.uc_archive_package_files r WHERE p_user=ANY(r.retained_people)
 UNION ALL
 SELECT 'uc_archive_restore_runs'::text table_name,count(*)n FROM public.uc_archive_restore_runs r WHERE r.actor_id=p_user OR p_user=ANY(r.retained_people)
 UNION ALL
 SELECT 'uc_archive_restore_files'::text table_name,count(*)n FROM public.uc_archive_restore_files r WHERE p_user=ANY(r.retained_people)
 UNION ALL
 SELECT 'uc_archive_restore_projections'::text table_name,count(*)n FROM public.uc_archive_restore_projections r WHERE p_user=ANY(r.retained_people)
 UNION ALL
 SELECT 'uc_archive_disposal_reviews'::text table_name,count(*)n FROM public.uc_archive_disposal_reviews r WHERE r.actor_id=p_user OR p_user=ANY(r.retained_people)
 UNION ALL
 SELECT 'uc_archive_rule_source_checks'::text table_name,count(*)n FROM public.uc_archive_rule_source_checks r WHERE r.actor_id=p_user OR p_user=ANY(r.retained_people)
 UNION ALL
 SELECT 'uc_archive_disposal_act_revisions'::text table_name,count(*)n FROM public.uc_archive_disposal_act_revisions r WHERE r.actor_id=p_user OR p_user=ANY(r.retained_people)
 UNION ALL
 SELECT 'uc_archive_package_supplements'::text table_name,count(*)n FROM public.uc_archive_package_supplements r WHERE r.actor_id=p_user OR p_user=ANY(r.retained_people)
 )counts WHERE counts.n>0
$archive$;

CREATE OR REPLACE FUNCTION public.apply_archive_case(p_organization_id uuid,p_scope jsonb,p_request_id uuid,p_case_id uuid,p_expected_revision bigint,p_action jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' SET lock_timeout='2000ms' SET statement_timeout='20000ms' AS $archive$
DECLARE org uuid:=p_organization_id;action_kind text:=p_action->>'kind';independent boolean;command_hash text;previous public.uc_archive_requests;head public.uc_archive_cases;value_result jsonb;receipt_value jsonb;caps jsonb;all_people uuid[];source_value jsonb;BEGIN
 IF p_request_id IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 9007199254740991 OR jsonb_typeof(p_action)IS DISTINCT FROM'object'OR octet_length(p_action::text)>196608 THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 independent:=action_kind IN('open_case','save_rule_draft','review_rule','approve_rule','appoint_authority','revoke_authority');
 IF independent IS DISTINCT FROM(p_case_id IS NULL)OR independent AND p_expected_revision<>0 OR action_kind IN('save_rule_draft','review_rule','approve_rule','appoint_authority','revoke_authority')AND p_scope->>'kind'<>'organization'THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;
 PERFORM public.uc_archive_fence(org,p_scope,ARRAY[auth.uid()],true,p_request_id);caps:=public.uc_archive_caps(org,p_scope);PERFORM public.uc_archive_action_capability(caps,action_kind);
 INSERT INTO public.uc_archive_org_keys(organization_id)VALUES(org)ON CONFLICT DO NOTHING;
 command_hash:=public.uc_archive_hash(jsonb_build_object('organization_id',org,'scope',p_scope,'case_id',p_case_id,'expected_revision',p_expected_revision,'action',p_action));
 SELECT r.*INTO previous FROM public.uc_archive_requests r WHERE r.actor_id=auth.uid()AND r.request_id=p_request_id;
 IF previous.id IS NOT NULL THEN
  IF previous.organization_id<>org OR previous.scope<>p_scope OR previous.command_sha256<>command_hash THEN PERFORM public.uc_archive_error('SOURCE_CHANGED');END IF;
  PERFORM public.uc_archive_fence(org,p_scope,previous.retained_people,true,NULL);
  IF previous.case_id IS NOT NULL THEN PERFORM public.uc_archive_case_access(org,p_scope,previous.case_id,true);END IF;
  FOR source_value IN WITH RECURSIVE nodes(value)AS(SELECT previous.receipt UNION ALL SELECT e.value FROM nodes n CROSS JOIN LATERAL(SELECT a.value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.value)='array'THEN n.value ELSE'[]'::jsonb END)a UNION ALL SELECT o.value FROM jsonb_each(CASE WHEN jsonb_typeof(n.value)='object'THEN n.value ELSE'{}'::jsonb END)o)e)SELECT DISTINCT n.value FROM nodes n WHERE n.value->>'kind'='organization_document_version'LOOP PERFORM public.uc_archive_org_version(org,source_value,false,false);END LOOP;
  IF action_kind='prepare_package'THEN PERFORM public.uc_archive_package_access(org,p_scope,(previous.receipt->'value'->>'id')::uuid,false,false);END IF;
  PERFORM public.uc_archive_action_capability(public.uc_archive_caps(org,p_scope),action_kind);RETURN previous.receipt||jsonb_build_object('replayed',true);
 END IF;
 IF independent THEN
  IF action_kind='open_case'THEN head:=public.uc_archive_open_case(org,p_scope,p_action);value_result:=public.uc_archive_case_projection(head);
  ELSIF action_kind IN('appoint_authority','revoke_authority')THEN value_result:=public.uc_archive_apply_authority(org,p_action);
  ELSE value_result:=public.uc_archive_apply_rule(org,p_action);END IF;
 ELSE
  head:=public.uc_archive_case_access(org,p_scope,p_case_id,true);
  IF head.revision<>p_expected_revision THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');END IF;
  IF action_kind='prepare_package'THEN
   IF NOT public.uc_custom_journal_shape(p_action,ARRAY['kind'])THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;value_result:=public.uc_archive_prepare_package(head,p_request_id);
  ELSIF action_kind='prepare_restore'THEN
   IF NOT public.uc_custom_journal_shape(p_action,ARRAY['kind','package_id'])OR NOT public.uc_custom_journal_uuid(p_action->'package_id')THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;value_result:=public.uc_archive_prepare_restore(head,p_request_id,(p_action->>'package_id')::uuid);
  ELSIF action_kind='prepare_destruction_plan'THEN
   IF NOT public.uc_custom_journal_shape(p_action,ARRAY['kind'])THEN PERFORM public.uc_archive_error('INVALID_INPUT');END IF;value_result:=public.uc_archive_prepare_disposal(head);
  ELSE head:=public.uc_archive_apply_case(org,p_scope,p_case_id,p_action);value_result:=public.uc_archive_case_projection(head);END IF;
 END IF;
 all_people:=public.uc_archive_json_people(p_action||jsonb_build_object('_result',value_result))||coalesce(head.retained_subjects,'{}')||coalesce(head.attribution_actors,'{}')||ARRAY[auth.uid()];IF action_kind='prepare_package'THEN SELECT all_people||b.retained_people INTO all_people FROM public.uc_archive_package_builds b WHERE b.id=(value_result->>'id')::uuid AND b.organization_id=org AND b.case_id=head.id;END IF;PERFORM public.uc_archive_fence(org,p_scope,all_people,true,NULL);
 receipt_value:=jsonb_build_object('version',1,'ok',true,'organization_id',org,'scope',p_scope,'actor_id',auth.uid(),'request_id',p_request_id,'action_kind',action_kind,'case_id',head.id,'revision',head.revision,'state_hash',head.state_hash,'value',value_result,'replayed',false);
 INSERT INTO public.uc_archive_requests(organization_id,actor_id,request_id,scope,case_id,command_sha256,receipt,retained_people)VALUES(org,auth.uid(),p_request_id,p_scope,head.id,command_hash,receipt_value,all_people);
 RETURN receipt_value;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN PERFORM public.uc_archive_error('INVALID_INPUT');WHEN unique_violation OR lock_not_available OR serialization_failure OR deadlock_detected THEN PERFORM public.uc_archive_error('REVISION_CONFLICT');
END;$archive$;

DO $private_acl$
DECLARE v_rel regclass;v_kind text;v_owner oid;v_grant record;v_fn record;v_name text;v_col record;BEGIN
 FOREACH v_rel IN ARRAY ARRAY['public.uc_archive_package_supplements'::regclass] LOOP
  SELECT CASE WHEN c.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,c.relowner INTO v_kind,v_owner FROM pg_class c WHERE c.oid=v_rel;
  FOR v_grant IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(CASE WHEN coalesce(array_length(c.relacl,1),0)=0 THEN acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner) ELSE c.relacl END)a WHERE c.oid=v_rel AND a.grantee<>c.relowner LOOP
   v_name:=CASE WHEN v_grant.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(v_grant.grantee)) END;EXECUTE format('REVOKE ALL ON %s %s FROM %s',v_kind,v_rel,v_name);
  END LOOP;
  IF v_kind='TABLE' THEN
   FOR v_col IN SELECT a.attname,a.attacl FROM pg_attribute a WHERE a.attrelid=v_rel AND a.attnum>0 AND NOT a.attisdropped AND coalesce(array_length(a.attacl,1),0)>0 LOOP
    FOR v_grant IN SELECT DISTINCT a.grantee FROM aclexplode(v_col.attacl)a WHERE a.grantee<>v_owner LOOP
     v_name:=CASE WHEN v_grant.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(v_grant.grantee)) END;EXECUTE format('REVOKE ALL (%I) ON TABLE %s FROM %s',v_col.attname,v_rel,v_name);
    END LOOP;
   END LOOP;
  END IF;
 END LOOP;
 FOR v_fn IN SELECT p.oid,p.proname,p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('uc_ap_journal','uc_ap_freeze','uc_ap_access') LOOP
  FOR v_grant IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(CASE WHEN coalesce(array_length(p.proacl,1),0)=0 THEN acldefault('f',p.proowner) ELSE p.proacl END)a WHERE p.oid=v_fn.oid AND a.grantee<>p.proowner LOOP
   IF v_grant.grantee=0 THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',v_fn.oid::regprocedure);ELSE SELECT rolname INTO v_name FROM pg_roles WHERE oid=v_grant.grantee;EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',v_fn.oid::regprocedure,v_name);END IF;
  END LOOP;

 END LOOP;
END $private_acl$;
COMMENT ON TABLE public.uc_archive_package_supplements IS 'Immutable per-package disposal revision ceiling and extra evidence captures. Historical projection only; not a live decision, legal acceptance or deletion authority.';
COMMIT;
