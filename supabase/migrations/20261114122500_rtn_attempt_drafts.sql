-- Server-side partial answers for the exact immutable RTN attempt. No key,
-- score, source revision or previous completed result can be changed here.
DO $preflight$ BEGIN
 IF to_regclass('rtn_private.attempts') IS NULL
 OR to_regprocedure('rtn_private.record_activity(uuid,uuid,uuid,text)') IS NULL
 OR to_regprocedure('rtn_private.assert_learner_assignment(uuid)') IS NULL
 THEN RAISE EXCEPTION 'RTN attempts and reviewed activity integration required';END IF;
END;$preflight$;
CREATE TABLE rtn_private.attempt_drafts(
 attempt_id uuid PRIMARY KEY REFERENCES rtn_private.attempts(id) ON DELETE CASCADE,
 answers jsonb NOT NULL CHECK(jsonb_typeof(answers)='object' AND octet_length(answers::text)<=1048576),
 revision bigint NOT NULL CHECK(revision>0),saved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rtn_private.attempt_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rtn_private.attempt_drafts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION rtn_private.valid_partial_answers(p_questions jsonb,p_answers jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $fn$
DECLARE pair record;q jsonb;choice jsonb;seen text[];BEGIN
 IF jsonb_typeof(p_answers) IS DISTINCT FROM 'object' OR octet_length(p_answers::text)>1048576 THEN RETURN false;END IF;
 FOR pair IN SELECT * FROM jsonb_each(p_answers) LOOP
  SELECT value INTO q FROM jsonb_array_elements(p_questions) WHERE value->>'id'=pair.key;
  IF q IS NULL OR jsonb_typeof(pair.value) IS DISTINCT FROM 'array' OR jsonb_array_length(pair.value)>30 THEN RETURN false;END IF;
  seen:=ARRAY[]::text[];
  FOR choice IN SELECT value FROM jsonb_array_elements(pair.value) LOOP
   IF jsonb_typeof(choice) IS DISTINCT FROM 'string' OR choice#>>'{}'=ANY(seen)
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(q->'options')o WHERE o->>'id'=choice#>>'{}') THEN RETURN false;END IF;
   seen:=array_append(seen,choice#>>'{}');
  END LOOP;
 END LOOP;RETURN true;
END;$fn$;
REVOKE ALL ON FUNCTION rtn_private.valid_partial_answers(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.get_rtn_attempt_draft(p_attempt_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE t rtn_private.attempts;d rtn_private.attempt_drafts;BEGIN
 SELECT * INTO t FROM rtn_private.attempts WHERE id=p_attempt_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'rtn_attempt_not_found' USING ERRCODE='P0002';END IF;
 PERFORM rtn_private.assert_learner_assignment(t.assignment_id);
 SELECT * INTO d FROM rtn_private.attempt_drafts WHERE attempt_id=t.id;
 RETURN jsonb_build_object('attempt_id',t.id,'status',t.status,'revision',coalesce(d.revision,0),
  'answers',CASE WHEN t.status='submitted' THEN t.answers ELSE coalesce(d.answers,'{}') END,'saved_at',d.saved_at);
END;$fn$;

CREATE FUNCTION public.save_rtn_attempt_draft(p_attempt_id uuid,p_answers jsonb,p_expected_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE t rtn_private.attempts;d rtn_private.attempt_drafts;BEGIN
 IF p_expected_revision IS NULL OR p_expected_revision<0 THEN RAISE EXCEPTION 'rtn_invalid_draft_revision' USING ERRCODE='22023';END IF;
 SELECT * INTO t FROM rtn_private.attempts WHERE id=p_attempt_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'rtn_attempt_not_found' USING ERRCODE='P0002';END IF;
 PERFORM rtn_private.assert_learner_assignment(t.assignment_id);
 -- Same subject -> organization -> attempt order as quota and privacy erasure.
 PERFORM pg_advisory_xact_lock(hashtextextended(t.student_user_id::text,42007));
 PERFORM pg_advisory_xact_lock(hashtextextended(t.organization_id::text,42));
 PERFORM rtn_private.assert_learner_assignment(t.assignment_id);
 SELECT * INTO STRICT t FROM rtn_private.attempts WHERE id=p_attempt_id FOR UPDATE;
 SELECT * INTO d FROM rtn_private.attempt_drafts WHERE attempt_id=t.id;
 IF t.status='submitted' THEN
  RETURN jsonb_build_object('attempt_id',t.id,'status',t.status,'revision',coalesce(d.revision,0),'answers',t.answers,'saved_at',t.submitted_at,'replayed',true);
 END IF;
 IF NOT rtn_private.valid_partial_answers(t.question_snapshot,p_answers) THEN RAISE EXCEPTION 'rtn_invalid_partial_answers' USING ERRCODE='22023';END IF;
 -- Exact retry is a no-op even if the response to the previous save was lost.
 IF coalesce(d.answers,'{}')=p_answers THEN
  RETURN jsonb_build_object('attempt_id',t.id,'status',t.status,'revision',coalesce(d.revision,0),'answers',p_answers,'saved_at',d.saved_at,'replayed',true);
 END IF;
 IF p_expected_revision<>coalesce(d.revision,0) THEN RAISE EXCEPTION 'rtn_draft_revision_conflict' USING ERRCODE='40001';END IF;
 INSERT INTO rtn_private.attempt_drafts(attempt_id,answers,revision,saved_at) VALUES(t.id,p_answers,coalesce(d.revision,0)+1,now())
 ON CONFLICT(attempt_id) DO UPDATE SET answers=excluded.answers,revision=excluded.revision,saved_at=excluded.saved_at RETURNING * INTO d;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_answers)e WHERE jsonb_array_length(e.value)>0) THEN
  PERFORM rtn_private.record_activity(t.assignment_id,t.id,t.release_id,'attempt_answer');
 END IF;
 RETURN jsonb_build_object('attempt_id',t.id,'status',t.status,'revision',d.revision,'answers',d.answers,'saved_at',d.saved_at,'replayed',false);
END;$fn$;
DO $acl$ DECLARE f record;g record;BEGIN
 FOR f IN SELECT p.oid,p.proowner,p.oid::regprocedure signature FROM pg_proc p
 WHERE p.oid IN('public.get_rtn_attempt_draft(uuid)'::regprocedure,'public.save_rtn_attempt_draft(uuid,jsonb,bigint)'::regprocedure) LOOP
  FOR g IN SELECT DISTINCT grantee FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=f.oid),acldefault('f',f.proowner))) WHERE grantee<>f.proowner LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',f.signature,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
  END LOOP;
 END LOOP;
END;$acl$;
GRANT EXECUTE ON FUNCTION public.get_rtn_attempt_draft(uuid),public.save_rtn_attempt_draft(uuid,jsonb,bigint) TO authenticated;
