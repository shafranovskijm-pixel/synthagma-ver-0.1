-- Future, explicitly reviewed question editions only. No old row/date backfill.
-- Questions do not depend on RSS/news/archive availability.
CREATE TEMP TABLE rtn_policy_old_functions ON COMMIT DROP AS
 SELECT p.oid,to_jsonb(p)-'prosrc' metadata,p.prosrc,pg_get_functiondef(p.oid) definition
 FROM pg_proc p WHERE p.oid IN(
  to_regprocedure('rtn_private.normative_current(uuid,timestamptz)'),
  to_regprocedure('rtn_private.assert_normative_current(uuid,timestamptz)'),
  to_regprocedure('public.get_rtn_workspace(uuid)'),
  to_regprocedure('public.get_rtn_editorial_workspace()'),
  to_regprocedure('public.get_rtn_student_workspace()'),
  to_regprocedure('public.get_rtn_assignment(uuid)'));
DO $preimage$ DECLARE wanted record;p pg_proc%ROWTYPE;BEGIN
 IF current_user<>'postgres' OR to_regclass('rtn_private.key_review_policies') IS NOT NULL
  OR to_regprocedure('public.review_rtn_keys_v2(uuid,uuid,jsonb,text,jsonb,jsonb)') IS NOT NULL
  OR(SELECT count(*) FROM pg_temp.rtn_policy_old_functions)<>6
 THEN RAISE EXCEPTION 'RTN_REVIEW_POLICY_PREIMAGE_CHANGED';END IF;
 FOR wanted IN SELECT * FROM(VALUES
  ('rtn_private.normative_current(uuid,timestamptz)','f9388b26694431b354059ab4ba5eb10c'),
  ('rtn_private.assert_normative_current(uuid,timestamptz)','b7510187acf75cf63aab4aa0d669deb3'),
  ('public.get_rtn_workspace(uuid)','f2ea884f5aa049fd0c94e4c4a986ff63'),
  ('public.get_rtn_editorial_workspace()','ebed8648316baa47b455a4184cdd7d9a'),
  ('public.get_rtn_student_workspace()','c6b8feb5eac30a4fbc4d225e2ca036f4'),
  ('public.get_rtn_assignment(uuid)','310195e49ac2dc174de9f58431e43cd5')
 )x(signature,body_md5) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(wanted.signature);
  IF p.oid IS NULL OR md5(p.prosrc) IS DISTINCT FROM wanted.body_md5
   OR pg_get_userbyid(p.proowner)<>'postgres' OR NOT p.prosecdef OR p.provolatile<>'s'
   OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public']
   OR p.proacl::text IS DISTINCT FROM (CASE WHEN wanted.signature LIKE 'public.%'
    THEN '{postgres=X/postgres,authenticated=X/postgres}' ELSE '{postgres=X/postgres}' END)
  THEN RAISE EXCEPTION 'RTN_REVIEW_POLICY_PREIMAGE_CHANGED:%',wanted.signature;END IF;
 END LOOP;
 IF md5((SELECT prosrc FROM pg_proc WHERE oid='public.review_rtn_keys(uuid,uuid,jsonb,text,jsonb)'::regprocedure))
  IS DISTINCT FROM 'f4afd2f9d53f21d813d47a215b32a796'
 THEN RAISE EXCEPTION 'RTN_REVIEW_POLICY_REVIEW_PREIMAGE_CHANGED';END IF;
END;$preimage$;

CREATE TABLE rtn_private.key_review_policies(
 key_set_id uuid PRIMARY KEY REFERENCES rtn_private.key_sets(id),
 policy_version text NOT NULL CHECK(policy_version='source-tracked-v2'),
 legal_validity text NOT NULL CHECK(legal_validity IN('bounded','no_declared_cutoff_reviewed')),
 legal_cutoff_at timestamptz,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((legal_validity='bounded' AND legal_cutoff_at IS NOT NULL)
  OR(legal_validity='no_declared_cutoff_reviewed' AND legal_cutoff_at IS NULL))
);
ALTER TABLE rtn_private.key_review_policies ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER rtn_key_review_policy_frozen BEFORE UPDATE OR DELETE ON rtn_private.key_review_policies
 FOR EACH ROW EXECUTE FUNCTION rtn_private.reject_mutation();
CREATE TRIGGER rtn_key_review_policy_no_truncate BEFORE TRUNCATE ON rtn_private.key_review_policies
 FOR EACH STATEMENT EXECUTE FUNCTION rtn_private.reject_mutation();
-- No duplicate reviewer identity/free-text note: the established erasure path
-- scrubs key_sets.review_note/reviewed_by, and never deletes global key sets.

CREATE FUNCTION rtn_private.review_policy_status(p_key_set uuid,p_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE k rtn_private.key_sets;policy rtn_private.key_review_policies;
 b rtn_private.banks;br rtn_private.bank_revisions;sr rtn_private.source_revisions;s rtn_private.sources;
 latest_parent uuid;latest_child uuid;permitted boolean:=false;reason text:='not_reviewed';
 policy_name text:='not_reviewed';validity text:='unassessed';hard_cutoff timestamptz;BEGIN
 SELECT * INTO k FROM rtn_private.key_sets WHERE id=p_key_set;
 IF FOUND AND p_at IS NOT NULL THEN
  SELECT * INTO policy FROM rtn_private.key_review_policies WHERE key_set_id=k.id;
  IF NOT FOUND THEN
   policy_name:='legacy-weekly-v1';
   permitted:=coalesce(k.editorial_review_before IS NOT NULL
    AND k.editorial_review_before<=(k.reviewed_at AT TIME ZONE 'Europe/Moscow')::date+7
    AND k.normative_cutoff_at IS NOT NULL AND p_at<k.normative_cutoff_at
    AND p_at<k.editorial_review_before::timestamp AT TIME ZONE 'Europe/Moscow',false);
   reason:=CASE WHEN permitted THEN 'ready' ELSE 'legacy_review_required' END;
  ELSE
   policy_name:=policy.policy_version;validity:=policy.legal_validity;hard_cutoff:=policy.legal_cutoff_at;
   IF hard_cutoff IS NOT NULL AND p_at>=hard_cutoff THEN reason:='legal_limit_reached';
   ELSE
    SELECT * INTO b FROM rtn_private.banks WHERE id=k.bank_id;
    SELECT * INTO br FROM rtn_private.bank_revisions WHERE id=k.bank_revision_id AND bank_id=k.bank_id;
    SELECT * INTO sr FROM rtn_private.source_revisions WHERE id=br.source_revision_id AND source_id=b.source_id;
    SELECT * INTO s FROM rtn_private.sources WHERE id=b.source_id;
    IF s.id IS NULL OR sr.id IS NULL OR s.last_sha256 IS DISTINCT FROM sr.sha256
     OR s.source_generation IS DISTINCT FROM k.source_generation
    THEN reason:='source_revision_changed';
    ELSE
     SELECT id INTO latest_parent FROM rtn_private.bank_revisions
      WHERE bank_id=coalesce(b.parent_bank_id,b.id) AND source_revision_id=sr.id
      ORDER BY normalization_version DESC,created_at DESC,id DESC LIMIT 1;
     SELECT id INTO latest_child FROM rtn_private.bank_revisions
      WHERE bank_id=b.id AND source_revision_id=sr.id
      ORDER BY normalization_version DESC,created_at DESC,id DESC LIMIT 1;
     IF latest_parent IS NULL OR latest_child IS DISTINCT FROM br.id
      OR(b.parent_bank_id IS NULL AND latest_parent IS DISTINCT FROM br.id)
      OR(b.parent_bank_id IS NOT NULL AND latest_parent IS DISTINCT FROM br.parent_bank_revision_id)
     THEN reason:='normalization_changed';
     ELSE permitted:=true;reason:='ready';END IF;
    END IF;
   END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('allowed',permitted,'admission_reason',reason,'approval_policy',policy_name,
  'legal_validity',validity,'legal_cutoff_at',hard_cutoff,'editorial_review_before',k.editorial_review_before,
  'editorial_status',CASE WHEN k.editorial_review_before IS NULL OR p_at IS NULL THEN 'unassessed'
   WHEN p_at>=k.editorial_review_before::timestamp AT TIME ZONE 'Europe/Moscow' THEN 'due' ELSE 'scheduled' END,
  'key_reviewed_at',k.reviewed_at);
END;$fn$;

CREATE FUNCTION rtn_private.review_policy_summary(p_key_set uuid,p_at timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT(value-'allowed')||CASE WHEN value->>'approval_policy'='source-tracked-v2'
  THEN jsonb_build_object('normative_cutoff_at',value->'legal_cutoff_at') ELSE '{}'::jsonb END
 FROM(SELECT rtn_private.review_policy_status(p_key_set,p_at)value)x
$fn$;

CREATE FUNCTION public.review_rtn_keys_v2(p_bank_id uuid,p_bank_revision_id uuid,p_questions jsonb,
 p_review_note text,p_module jsonb,p_policy jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE actor uuid;bounds jsonb;hard_cutoff timestamptz;validity text;legal_note text;combined_note text;
 result jsonb;kid uuid;k rtn_private.key_sets;prior rtn_private.key_review_policies;
 separator constant text:=E'\n\nНормативная проверка: ';BEGIN
 actor:=rtn_private.assert_admin();
 IF p_policy IS NULL OR jsonb_typeof(p_policy) IS DISTINCT FROM 'object'
  OR octet_length(p_policy::text)>16384
  OR(SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_policy)key)
    IS DISTINCT FROM ARRAY['legal_assessment','legal_review_note','version']::text[]
  OR p_policy->>'version' IS DISTINCT FROM 'source-tracked-v2'
  OR p_policy->>'legal_assessment' IS DISTINCT FROM 'applicable_norms_and_end_dates_reviewed'
  OR jsonb_typeof(p_policy->'legal_review_note') IS DISTINCT FROM 'string'
 THEN RAISE EXCEPTION 'rtn_explicit_legal_assessment_required' USING ERRCODE='22023';END IF;
 legal_note:=btrim(p_policy->>'legal_review_note');
 IF length(legal_note) NOT BETWEEN 20 AND 2500 OR length(btrim(coalesce(p_review_note,''))) NOT BETWEEN 10 AND 4000
  OR position(separator IN legal_note)>0 OR position(separator IN p_review_note)>0
 THEN RAISE EXCEPTION 'rtn_substantive_legal_assessment_required' USING ERRCODE='22023';END IF;
 combined_note:=p_review_note||separator||legal_note;
 IF length(combined_note)>4000 THEN RAISE EXCEPTION 'rtn_review_note_too_large' USING ERRCODE='22023';END IF;
 bounds:=rtn_private.normative_bounds(p_module,p_questions);
 SELECT min((limit_row->>'date')::date::timestamp AT TIME ZONE 'Europe/Moscow') INTO hard_cutoff
  FROM jsonb_array_elements(bounds->'limits')limit_row WHERE limit_row->>'kind'='declared_validity';
 validity:=CASE WHEN hard_cutoff IS NULL THEN 'no_declared_cutoff_reviewed' ELSE 'bounded' END;
 -- The old RPC supplies all genuine source/question/material/actor checks and
 -- source/review locks. A sidecar is installed only for a NEW reviewed row.
 result:=public.review_rtn_keys(p_bank_id,p_bank_revision_id,p_questions,combined_note,p_module);
 kid:=(result->>'key_set_id')::uuid;
 SELECT * INTO STRICT k FROM rtn_private.key_sets WHERE id=kid;
 SELECT * INTO prior FROM rtn_private.key_review_policies WHERE key_set_id=kid;
 IF FOUND THEN
  IF prior.policy_version<>'source-tracked-v2' OR prior.legal_validity IS DISTINCT FROM validity
   OR prior.legal_cutoff_at IS DISTINCT FROM hard_cutoff
  THEN RAISE EXCEPTION 'rtn_review_policy_replay_conflict' USING ERRCODE='40001';END IF;
 ELSIF coalesce((result->>'replayed')::boolean,true) THEN
  RAISE EXCEPTION 'rtn_new_review_required_for_policy_v2' USING ERRCODE='22023';
 ELSE
  IF k.reviewed_by IS DISTINCT FROM actor OR k.editorial_review_before IS NULL
   OR NOT rtn_private.valid_questions(k.questions,true)
  THEN RAISE EXCEPTION 'rtn_explicit_legal_assessment_required' USING ERRCODE='22023';END IF;
  INSERT INTO rtn_private.key_review_policies(key_set_id,policy_version,legal_validity,legal_cutoff_at)
   VALUES(kid,'source-tracked-v2',validity,hard_cutoff);
 END IF;
 RETURN result||rtn_private.review_policy_summary(kid,clock_timestamp());
END;$fn$;

DO $hooks$ DECLARE old record;body text;anchor text;replacement text;BEGIN
 SELECT * INTO STRICT old FROM pg_temp.rtn_policy_old_functions
  WHERE oid='rtn_private.normative_current(uuid,timestamptz)'::regprocedure;
 body:=E' SELECT coalesce((rtn_private.review_policy_status(p_key_set,p_at)->>''allowed'')::boolean,false)\n';
 EXECUTE replace(old.definition,old.prosrc,body);

 SELECT * INTO STRICT old FROM pg_temp.rtn_policy_old_functions
  WHERE oid='rtn_private.assert_normative_current(uuid,timestamptz)'::regprocedure;
 anchor:='DETAIL=CASE WHEN editorial IS NULL THEN ''weekly_editorial_review_deadline_required'' ELSE ''review_deadline_reached'' END';
 replacement:='DETAIL=coalesce(rtn_private.review_policy_status(p_key_set,p_at)->>''admission_reason'',''not_reviewed'')';
 IF(length(old.prosrc)-length(replace(old.prosrc,anchor,'')))/length(anchor)<>1
 THEN RAISE EXCEPTION 'RTN_REVIEW_POLICY_ASSERT_ANCHOR_CHANGED';END IF;
 EXECUTE replace(old.definition,old.prosrc,replace(old.prosrc,anchor,replacement));

 SELECT * INTO STRICT old FROM pg_temp.rtn_policy_old_functions WHERE oid='public.get_rtn_workspace(uuid)'::regprocedure;
 body:=old.prosrc;
 anchor:='jsonb_agg(jsonb_build_object(''id'',b.id';
 IF(length(body)-length(replace(body,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'RTN_REVIEW_POLICY_WORKSPACE_START_CHANGED';END IF;
 body:=replace(body,anchor,'jsonb_agg((jsonb_build_object(''id'',b.id');
 anchor:='''check_status'',coalesce(open_check.status,s.last_status,''not_checked'')) ORDER BY b.code)';
 replacement:='''check_status'',coalesce(open_check.status,s.last_status,''not_checked'')) || rtn_private.review_policy_summary(active_k.id,clock_timestamp())) ORDER BY b.code)';
 IF(length(body)-length(replace(body,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'RTN_REVIEW_POLICY_WORKSPACE_END_CHANGED';END IF;
 body:=replace(body,anchor,replacement);
 anchor:='''question_count'',coalesce(active_br.question_count,br.question_count,0),''release_id'',r.id,''source_revision_id''';
 replacement:='''question_count'',coalesce(active_br.question_count,br.question_count,0),''release_id'',r.id,''published_at'',r.published_at,''source_revision_id''';
 IF(length(body)-length(replace(body,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'RTN_REVIEW_POLICY_RELEASE_DATE_CHANGED';END IF;
 body:=replace(body,anchor,replacement);
 anchor:='''active_release'',CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(''release_id'',r.id,';
 replacement:=anchor||'''published_at'',r.published_at,';
 IF(length(body)-length(replace(body,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'RTN_REVIEW_POLICY_ACTIVE_RELEASE_CHANGED';END IF;
 body:=replace(body,anchor,replacement);
 EXECUTE replace(old.definition,old.prosrc,body);

 SELECT * INTO STRICT old FROM pg_temp.rtn_policy_old_functions WHERE oid='public.get_rtn_editorial_workspace()'::regprocedure;
 body:=old.prosrc;
 anchor:=E' RETURN jsonb_build_object(\n';
 replacement:=anchor||E'  ''review_policy_capabilities'',jsonb_build_object(''source_tracked_v2'',true,''version'',''source-tracked-v2'',''legal_assessment'',''applicable_norms_and_end_dates_reviewed''),\n';
 IF(length(body)-length(replace(body,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'RTN_REVIEW_POLICY_CAPABILITY_CHANGED';END IF;
 body:=replace(body,anchor,replacement);
 anchor:='jsonb_agg(jsonb_build_object(''id'',k.id';
 IF(length(body)-length(replace(body,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'RTN_REVIEW_POLICY_EDITORIAL_START_CHANGED';END IF;
 body:=replace(body,anchor,'jsonb_agg((jsonb_build_object(''id'',k.id');
 anchor:='''reviewed_at'',k.reviewed_at) ORDER BY k.reviewed_at DESC,k.id)';
 replacement:='''reviewed_at'',k.reviewed_at) || rtn_private.review_policy_summary(k.id,clock_timestamp())) ORDER BY k.reviewed_at DESC,k.id)';
 IF(length(body)-length(replace(body,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'RTN_REVIEW_POLICY_EDITORIAL_END_CHANGED';END IF;
 body:=replace(body,anchor,replacement);
 EXECUTE replace(old.definition,old.prosrc,body);

 SELECT * INTO STRICT old FROM pg_temp.rtn_policy_old_functions WHERE oid='public.get_rtn_student_workspace()'::regprocedure;
 body:=old.prosrc;anchor:='jsonb_agg(jsonb_build_object(''id'',a.id';
 IF(length(body)-length(replace(body,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'RTN_REVIEW_POLICY_STUDENT_START_CHANGED';END IF;
 body:=replace(body,anchor,'jsonb_agg((jsonb_build_object(''id'',a.id');
 anchor:='AND jsonb_array_length(k2.materials)>0)) ORDER BY a.assigned_at DESC)';
 replacement:='AND jsonb_array_length(k2.materials)>0)) || rtn_private.review_policy_summary(current_k.id,clock_timestamp())) ORDER BY a.assigned_at DESC)';
 IF(length(body)-length(replace(body,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'RTN_REVIEW_POLICY_STUDENT_END_CHANGED';END IF;
 body:=replace(body,anchor,replacement);EXECUTE replace(old.definition,old.prosrc,body);

 SELECT * INTO STRICT old FROM pg_temp.rtn_policy_old_functions WHERE oid='public.get_rtn_assignment(uuid)'::regprocedure;
 anchor:='''normative_cutoff_at'',CASE WHEN k.editorial_review_before IS NOT NULL THEN k.normative_cutoff_at END),';
 replacement:='''normative_cutoff_at'',CASE WHEN k.editorial_review_before IS NOT NULL THEN k.normative_cutoff_at END) || rtn_private.review_policy_summary(k.id,clock_timestamp()),';
 IF(length(old.prosrc)-length(replace(old.prosrc,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'RTN_REVIEW_POLICY_ASSIGNMENT_END_CHANGED';END IF;
 EXECUTE replace(old.definition,old.prosrc,replace(old.prosrc,anchor,replacement));
END;$hooks$;

DO $new_acl$ DECLARE r record;g record;BEGIN
 FOR g IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL
  aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a
  WHERE c.oid='rtn_private.key_review_policies'::regclass AND a.grantee<>c.relowner LOOP
  EXECUTE format('REVOKE ALL ON TABLE rtn_private.key_review_policies FROM %s',CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
 END LOOP;
 FOR r IN SELECT p.oid,p.proowner,p.oid::regprocedure::text signature,p.proname FROM pg_proc p
  WHERE p.oid IN('rtn_private.review_policy_status(uuid,timestamptz)'::regprocedure,
   'rtn_private.review_policy_summary(uuid,timestamptz)'::regprocedure,
   'public.review_rtn_keys_v2(uuid,uuid,jsonb,text,jsonb,jsonb)'::regprocedure) LOOP
  FOR g IN SELECT DISTINCT a.grantee FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=r.oid),acldefault('f',r.proowner)))a WHERE a.grantee<>r.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',r.signature,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
  END LOOP;
  IF r.proname='review_rtn_keys_v2' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',r.signature);END IF;
 END LOOP;
END;$new_acl$;
DO $postimage$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_temp.rtn_policy_old_functions old LEFT JOIN pg_proc p ON p.oid=old.oid
  WHERE p.oid IS NULL OR to_jsonb(p)-'prosrc' IS DISTINCT FROM old.metadata)
 THEN RAISE EXCEPTION 'RTN_REVIEW_POLICY_EXISTING_AUTHORITY_CHANGED';END IF;
END;$postimage$;
