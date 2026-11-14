-- A source PDF staying byte-identical does not renew a normative review.
-- Admission uses an immutable, explicitly reviewed deadline, independent of
-- source-check timestamps. Existing active attempts/results remain frozen.
CREATE TEMP TABLE rtn_normative_old_functions ON COMMIT DROP AS
 SELECT p.oid,to_jsonb(p)-'prosrc' AS metadata,p.prosrc,pg_get_functiondef(p.oid) AS definition
 FROM pg_proc p WHERE p.oid IN(
  to_regprocedure('public.review_rtn_keys(uuid,uuid,jsonb,text,jsonb)'),
  to_regprocedure('public.publish_rtn_release(uuid,date,text)'),
  to_regprocedure('public.assign_rtn_training(uuid,uuid,uuid[],uuid)'),
  to_regprocedure('public.start_rtn_attempt(uuid)'),
  to_regprocedure('public.get_rtn_workspace(uuid)'),
  to_regprocedure('public.get_rtn_student_workspace()'),
  to_regprocedure('public.get_rtn_assignment(uuid)'),
  to_regprocedure('public.get_rtn_editorial_workspace()'));
DO $preimage$ DECLARE expected record;actual pg_proc%ROWTYPE;BEGIN
 IF current_user<>'postgres' OR NOT EXISTS(SELECT 1 FROM rtn_private.rollout_state WHERE quota_integration_ready AND privacy_integration_ready)
  OR to_regprocedure('rtn_private.lock_actor()') IS NULL OR to_regprocedure('rtn_private.erasure_allowed(uuid)') IS NULL
  OR(SELECT count(*) FROM pg_temp.rtn_normative_old_functions)<>8
 THEN RAISE EXCEPTION 'RTN_NORMATIVE_REQUIRES_REVIEWED_QUOTA_DRAFT_PRIVACY';END IF;
 FOR expected IN SELECT * FROM(VALUES
  ('public.review_rtn_keys(uuid,uuid,jsonb,text,jsonb)','601100b092669ded55374dd041a53281'),
  ('public.publish_rtn_release(uuid,date,text)','af41bfb9b5a4d33684ace3c77ecc9c74'),
  ('public.assign_rtn_training(uuid,uuid,uuid[],uuid)','b1b0f254074ef2dabdc7dac714c6a52d'),
  ('public.start_rtn_attempt(uuid)','2f10919cb8b5080e3df8817e3d81dc16'),
  ('public.get_rtn_workspace(uuid)','409b1667afb34808dce69499898d3578'),
  ('public.get_rtn_student_workspace()','ac98481d6a0fc2ce233999bae58a9a5b'),
  ('public.get_rtn_assignment(uuid)','28efb5100855d2d709faa7bb50e80e51'),
  ('public.get_rtn_editorial_workspace()','eb3e599346fceba5b6385ee62ebd1c8f')
 )x(signature,body_md5) LOOP
  SELECT * INTO actual FROM pg_proc WHERE oid=to_regprocedure(expected.signature);
  IF actual.oid IS NULL OR md5(actual.prosrc) IS DISTINCT FROM expected.body_md5 OR pg_get_userbyid(actual.proowner)<>'postgres'
   OR actual.proacl::text IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
   OR actual.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public'] OR NOT actual.prosecdef
  THEN RAISE EXCEPTION 'RTN_NORMATIVE_PREIMAGE_OR_AUTHORITY_CHANGED:%',expected.signature;END IF;
 END LOOP;
END;$preimage$;

ALTER TABLE rtn_private.key_sets
 ADD COLUMN normative_cutoff_at timestamptz,
 ADD COLUMN editorial_review_before date,
 ADD COLUMN normative_limits jsonb NOT NULL DEFAULT '[]',
 ADD CONSTRAINT rtn_normative_limits_shape CHECK(jsonb_typeof(normative_limits)='array'
  AND jsonb_array_length(normative_limits)<=100000
  AND((normative_cutoff_at IS NULL AND normative_limits='[]') OR(normative_cutoff_at IS NOT NULL AND jsonb_array_length(normative_limits)>0))),
 ADD CONSTRAINT rtn_editorial_weekly_window CHECK(editorial_review_before IS NULL OR(
  editorial_review_before<=(reviewed_at AT TIME ZONE 'Europe/Moscow')::date+7
  AND normative_cutoff_at IS NOT NULL AND normative_cutoff_at<=editorial_review_before::timestamp AT TIME ZONE 'Europe/Moscow'));
-- No invented historical backfill: a previous review without a declared date
-- remains usable by its already-started frozen attempts, but needs a new review
-- before it can admit a new assignment/attempt. No old row is rewritten.

CREATE FUNCTION rtn_private.normative_bounds(p_module jsonb,p_questions jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE item record;declared text;day date;cutoff timestamptz;minimum timestamptz;limits jsonb:='[]';BEGIN
 IF octet_length(coalesce(p_module,'null')::text)+octet_length(coalesce(p_questions,'null')::text)>33554432
 THEN RAISE EXCEPTION 'rtn_normative_metadata_too_large' USING ERRCODE='22023';END IF;
 -- Traverse objects/arrays only. The exact path and declared field distinguish
 -- an editorial review deadline from a document's declared validity limit.
 FOR item IN
  WITH RECURSIVE nodes(value,path,depth) AS(
   SELECT jsonb_build_object('module',p_module,'questions',p_questions),ARRAY[]::text[],0
   UNION ALL
   SELECT child.value,n.path||child.key,n.depth+1 FROM nodes n
   CROSS JOIN LATERAL(
    SELECT key,value FROM jsonb_each(CASE WHEN jsonb_typeof(n.value)='object' THEN n.value ELSE '{}'::jsonb END)
    UNION ALL
    SELECT (ordinality-1)::text,value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.value)='array' THEN n.value ELSE '[]'::jsonb END) WITH ORDINALITY
   )child WHERE n.depth<32 AND jsonb_typeof(child.value) IN('object','array')
  )
  SELECT n.path,e.key,e.value,n.value->>'url' source_url FROM nodes n
  CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(n.value)='object' THEN n.value ELSE '{}'::jsonb END)e
  WHERE e.key IN('valid_until','normative_valid_until','review_before','review_required_before')
  ORDER BY n.path,e.key
 LOOP
  IF jsonb_typeof(item.value) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'rtn_invalid_normative_date' USING ERRCODE='22023';END IF;
  declared:=item.value#>>'{}';
  IF declared !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR left(declared,4)='0000'
  THEN RAISE EXCEPTION 'rtn_invalid_normative_date' USING ERRCODE='22023';END IF;
  BEGIN day:=declared::date;EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
   RAISE EXCEPTION 'rtn_invalid_normative_date' USING ERRCODE='22023';END;
  IF to_char(day,'YYYY-MM-DD')<>declared THEN RAISE EXCEPTION 'rtn_invalid_normative_date' USING ERRCODE='22023';END IF;
  cutoff:=day::timestamp AT TIME ZONE 'Europe/Moscow';
  IF minimum IS NULL OR cutoff<minimum THEN minimum:=cutoff;END IF;
  limits:=limits||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('path',item.path||item.key,'field',item.key,'date',declared,
   'kind',CASE WHEN item.key IN('review_before','review_required_before') THEN 'editorial_review' ELSE 'declared_validity' END,
   'source_url',CASE WHEN item.source_url ~ '^https?://' THEN left(item.source_url,4000) END,'exclusive',true,'timezone','Europe/Moscow')));
  IF jsonb_array_length(limits)>100000 THEN RAISE EXCEPTION 'rtn_normative_metadata_too_large' USING ERRCODE='22023';END IF;
 END LOOP;
 -- Deep containers cannot silently hide an earlier deadline.
 IF EXISTS(WITH RECURSIVE nodes(value,depth) AS(
  SELECT jsonb_build_object('module',p_module,'questions',p_questions),0
  UNION ALL SELECT child.value,n.depth+1 FROM nodes n CROSS JOIN LATERAL(
   SELECT value FROM jsonb_each(CASE WHEN jsonb_typeof(n.value)='object' THEN n.value ELSE '{}'::jsonb END)
   UNION ALL SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.value)='array' THEN n.value ELSE '[]'::jsonb END)
  )child WHERE n.depth<33 AND jsonb_typeof(child.value) IN('object','array')
 )SELECT 1 FROM nodes WHERE depth=33)
 THEN RAISE EXCEPTION 'rtn_normative_metadata_too_deep' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('cutoff_at',minimum,'limits',limits);
END;$fn$;

CREATE FUNCTION rtn_private.editorial_deadline(p_module jsonb,p_reviewed_at timestamptz) RETURNS date
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE value date;BEGIN
 IF NOT coalesce(p_module?'review_before',false) THEN RETURN NULL;END IF;
 -- normative_bounds validates the exact ISO calendar date before this helper
 -- is used. A nested evidence review date cannot substitute for this field.
 IF p_reviewed_at IS NULL OR jsonb_typeof(p_module->'review_before') IS DISTINCT FROM 'string'
  OR(p_module->>'review_before') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 THEN RAISE EXCEPTION 'rtn_invalid_normative_date' USING ERRCODE='22023';END IF;
 BEGIN value:=(p_module->>'review_before')::date;EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
  RAISE EXCEPTION 'rtn_invalid_normative_date' USING ERRCODE='22023';END;
 IF value>(p_reviewed_at AT TIME ZONE 'Europe/Moscow')::date+7
 THEN RAISE EXCEPTION 'rtn_editorial_review_deadline_exceeds_week' USING ERRCODE='22023';END IF;
 RETURN value;
END;$fn$;
CREATE FUNCTION rtn_private.normative_current(p_key_set uuid,p_at timestamptz) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce((SELECT editorial_review_before IS NOT NULL
  AND editorial_review_before<=(reviewed_at AT TIME ZONE 'Europe/Moscow')::date+7
  AND normative_cutoff_at IS NOT NULL AND p_at<normative_cutoff_at
  AND p_at<editorial_review_before::timestamp AT TIME ZONE 'Europe/Moscow'
  FROM rtn_private.key_sets WHERE id=p_key_set),false)
$fn$;
CREATE FUNCTION rtn_private.assert_normative_current(p_key_set uuid,p_at timestamptz) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE cutoff timestamptz;editorial date;BEGIN
 SELECT normative_cutoff_at,editorial_review_before INTO cutoff,editorial FROM rtn_private.key_sets WHERE id=p_key_set;
 IF NOT FOUND OR NOT rtn_private.normative_current(p_key_set,p_at) THEN
  RAISE EXCEPTION 'rtn_normative_review_required' USING ERRCODE='22023',DETAIL=CASE WHEN editorial IS NULL THEN 'weekly_editorial_review_deadline_required' ELSE 'review_deadline_reached' END;
 END IF;
END;$fn$;
CREATE FUNCTION rtn_private.assert_bank_normative_current(p_bank uuid,p_at timestamptz) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE key_set uuid;BEGIN
 -- Select the latest applicable edition FIRST. Filtering by freshness here
 -- would silently fall back to an older edition, which is forbidden.
 SELECT key_set_id INTO key_set FROM rtn_private.releases WHERE bank_id=p_bank AND effective_from<=(p_at AT TIME ZONE 'Europe/Moscow')::date
  ORDER BY effective_from DESC,published_at DESC,id DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'rtn_released_bank_required' USING ERRCODE='22023';END IF;
 PERFORM rtn_private.assert_normative_current(key_set,p_at);
END;$fn$;

DO $hooks$ DECLARE old record;body text;anchor text;BEGIN
 SELECT * INTO STRICT old FROM pg_temp.rtn_normative_old_functions WHERE oid='public.review_rtn_keys(uuid,uuid,jsonb,text,jsonb)'::regprocedure;
 body:=replace(old.prosrc,'DECLARE actor uuid;','DECLARE bounds jsonb;editorial date;actor uuid;');
 anchor:=' actor:=rtn_private.assert_admin();';
 body:=replace(body,anchor,anchor||E'\n bounds:=rtn_private.normative_bounds(p_module,p_questions);');
 anchor:='AND questions=p_questions AND materials=coalesce(p_module->''materials'',''[]'')';
 body:=replace(body,' SELECT id INTO kid FROM rtn_private.key_sets',E' editorial:=rtn_private.editorial_deadline(p_module,clock_timestamp());\n SELECT id INTO kid FROM rtn_private.key_sets');
 body:=replace(body,anchor,anchor||' AND editorial_review_before IS NOT DISTINCT FROM editorial AND normative_cutoff_at IS NOT DISTINCT FROM(bounds->>''cutoff_at'')::timestamptz AND normative_limits=bounds->''limits''');
 body:=replace(body,'INSERT INTO rtn_private.key_sets(bank_id,bank_revision_id,questions,materials,display_title,source_generation,review_note,reviewed_by)',
  'INSERT INTO rtn_private.key_sets(bank_id,bank_revision_id,questions,materials,display_title,source_generation,review_note,reviewed_by,reviewed_at,normative_cutoff_at,normative_limits,editorial_review_before)');
 body:=replace(body,'v_title,generation,p_review_note,actor) RETURNING id INTO kid;',
  'v_title,generation,p_review_note,actor,clock_timestamp(),(bounds->>''cutoff_at'')::timestamptz,bounds->''limits'',editorial) RETURNING id INTO kid;');
 IF body=old.prosrc OR position('normative_limits=bounds' IN body)=0 OR position('bounds->''limits'',editorial) RETURNING' IN body)=0
 THEN RAISE EXCEPTION 'RTN_NORMATIVE_REVIEW_ANCHOR_CHANGED';END IF;
 EXECUTE replace(old.definition,old.prosrc,body);

 SELECT * INTO STRICT old FROM pg_temp.rtn_normative_old_functions WHERE oid='public.publish_rtn_release(uuid,date,text)'::regprocedure;
 anchor:=' INSERT INTO rtn_private.releases(bank_id,key_set_id,effective_from,release_note,published_by)';
 IF(length(old.prosrc)-length(replace(old.prosrc,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'RTN_NORMATIVE_PUBLICATION_ANCHOR_CHANGED';END IF;
 body:=replace(old.prosrc,anchor,E' PERFORM rtn_private.assert_normative_current(k.id,greatest(clock_timestamp(),p_effective_from::timestamp AT TIME ZONE ''Europe/Moscow''));\n'||anchor);
 EXECUTE replace(old.definition,old.prosrc,body);

 SELECT * INTO STRICT old FROM pg_temp.rtn_normative_old_functions WHERE oid='public.assign_rtn_training(uuid,uuid,uuid[],uuid)'::regprocedure;
 anchor:=E' FOR sid IN SELECT DISTINCT unnest(p_student_ids) LOOP';
 IF(length(old.prosrc)-length(replace(old.prosrc,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'RTN_NORMATIVE_ASSIGNMENT_ANCHOR_CHANGED';END IF;
 body:=replace(old.prosrc,anchor,E' PERFORM rtn_private.assert_bank_normative_current(p_bank_id,clock_timestamp());\n'||anchor);
 EXECUTE replace(old.definition,old.prosrc,body);

 SELECT * INTO STRICT old FROM pg_temp.rtn_normative_old_functions WHERE oid='public.start_rtn_attempt(uuid)'::regprocedure;
 anchor:='  INSERT INTO rtn_private.attempts(organization_id,assignment_id,student_user_id,release_id,title_snapshot,code_snapshot,question_snapshot,key_snapshot,total)';
 IF(length(old.prosrc)-length(replace(old.prosrc,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'RTN_NORMATIVE_START_ANCHOR_CHANGED';END IF;
 body:=replace(old.prosrc,anchor,E'  PERFORM rtn_private.assert_normative_current(k.id,clock_timestamp());\n'||anchor);
 body:=replace(body,'WHERE bank_id=a.bank_id AND effective_from<=(now() AT TIME ZONE ''Europe/Moscow'')::date',
  'WHERE bank_id=a.bank_id AND effective_from<=(clock_timestamp() AT TIME ZONE ''Europe/Moscow'')::date');
 EXECUTE replace(old.definition,old.prosrc,body);

 SELECT * INTO STRICT old FROM pg_temp.rtn_normative_old_functions WHERE oid='public.get_rtn_workspace(uuid)'::regprocedure;
 body:=replace(old.prosrc,'''available_for_training'',r.id IS NOT NULL AND rtn_private.entitled(p_organization_id,b.id)',
  '''normative_status'',CASE WHEN rtn_private.normative_current(active_k.id,clock_timestamp()) THEN ''current'' ELSE ''review_required'' END,''normative_cutoff_at'',CASE WHEN active_k.editorial_review_before IS NOT NULL THEN active_k.normative_cutoff_at END,'||E'\n  '||
  '''available_for_training'',r.id IS NOT NULL AND rtn_private.entitled(p_organization_id,b.id) AND rtn_private.normative_current(active_k.id,clock_timestamp())');
 IF body=old.prosrc THEN RAISE EXCEPTION 'RTN_NORMATIVE_WORKSPACE_ANCHOR_CHANGED';END IF;EXECUTE replace(old.definition,old.prosrc,body);

 SELECT * INTO STRICT old FROM pg_temp.rtn_normative_old_functions WHERE oid='public.get_rtn_student_workspace()'::regprocedure;
 anchor:='''access_allowed'',rtn_private.entitled(a.organization_id,b.id),';
 body:=replace(old.prosrc,anchor,anchor||E'\n  ''can_start'',rtn_private.entitled(a.organization_id,b.id) AND rtn_private.normative_current(current_k.id,clock_timestamp()),\n  ''normative_status'',CASE WHEN rtn_private.normative_current(current_k.id,clock_timestamp()) THEN ''current'' ELSE ''review_required'' END,''normative_cutoff_at'',CASE WHEN current_k.editorial_review_before IS NOT NULL THEN current_k.normative_cutoff_at END,''last_attempt_status'',t.status,');
 IF body=old.prosrc THEN RAISE EXCEPTION 'RTN_NORMATIVE_STUDENT_ANCHOR_CHANGED';END IF;EXECUTE replace(old.definition,old.prosrc,body);

 SELECT * INTO STRICT old FROM pg_temp.rtn_normative_old_functions WHERE oid='public.get_rtn_assignment(uuid)'::regprocedure;
 anchor:='''status'',a.status),';
 body:=replace(old.prosrc,anchor,'''status'',a.status,''can_start'',rtn_private.normative_current(k.id,clock_timestamp()),''normative_status'',CASE WHEN rtn_private.normative_current(k.id,clock_timestamp()) THEN ''current'' ELSE ''review_required'' END,''normative_cutoff_at'',CASE WHEN k.editorial_review_before IS NOT NULL THEN k.normative_cutoff_at END),');
 IF body=old.prosrc THEN RAISE EXCEPTION 'RTN_NORMATIVE_ASSIGNMENT_DETAIL_ANCHOR_CHANGED';END IF;EXECUTE replace(old.definition,old.prosrc,body);

 SELECT * INTO STRICT old FROM pg_temp.rtn_normative_old_functions WHERE oid='public.get_rtn_editorial_workspace()'::regprocedure;
 anchor:='''material_count'',jsonb_array_length(k.materials),';
 body:=replace(old.prosrc,anchor,anchor||'''normative_status'',CASE WHEN rtn_private.normative_current(k.id,clock_timestamp()) THEN ''current'' ELSE ''review_required'' END,''normative_cutoff_at'',k.normative_cutoff_at,''editorial_review_before'',k.editorial_review_before,''normative_limits'',k.normative_limits,');
 IF body=old.prosrc THEN RAISE EXCEPTION 'RTN_NORMATIVE_EDITORIAL_ANCHOR_CHANGED';END IF;EXECUTE replace(old.definition,old.prosrc,body);
END;$hooks$;

-- Provider-specific default grants must not expose a new private helper.
DO $new_acl$ DECLARE r record;g record;BEGIN
 FOR r IN SELECT p.oid,p.proowner,p.oid::regprocedure::text signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='rtn_private' AND p.proname IN('normative_bounds','editorial_deadline','normative_current','assert_normative_current','assert_bank_normative_current') LOOP
  FOR g IN SELECT DISTINCT a.grantee FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=r.oid),acldefault('f',r.proowner)))a WHERE a.grantee<>r.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',r.signature,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
  END LOOP;
 END LOOP;
END;$new_acl$;
DO $postimage$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_temp.rtn_normative_old_functions old LEFT JOIN pg_proc p ON p.oid=old.oid WHERE p.oid IS NULL OR to_jsonb(p)-'prosrc' IS DISTINCT FROM old.metadata)
 THEN RAISE EXCEPTION 'RTN_NORMATIVE_EXISTING_FUNCTION_AUTHORITY_CHANGED';END IF;
END;$postimage$;
