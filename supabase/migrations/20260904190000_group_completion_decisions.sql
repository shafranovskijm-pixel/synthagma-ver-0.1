-- Explicit operator confirmations for GORELTECH only. No grade inference,
-- document issuance, enrollment status/progress mutation, or historic backfill.
-- A conservative source generation invalidates confirmations on INSERT and every
-- explicitly targeted non-telemetry column, even no-op resets and physical
-- delete/reinsert of the same UUID. Pure time_spent/updated_at bookkeeping does
-- not revoke an operator decision. The sequence is independent of row lifetime;
-- do not reset it or make it CYCLE.
CREATE SEQUENCE public.enrollment_document_facts_generation_seq
  AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 NO MAXVALUE NO CYCLE;
REVOKE ALL ON SEQUENCE public.enrollment_document_facts_generation_seq
  FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.enrollments
  ADD COLUMN document_facts_revision bigint NOT NULL DEFAULT 0
  CHECK (document_facts_revision >= 0);

CREATE FUNCTION public.bump_enrollment_document_facts_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
BEGIN
  NEW.document_facts_revision := nextval('public.enrollment_document_facts_generation_seq'::regclass);
  RETURN NEW;
END;
$function$;
-- UPDATE OF observes the statement's target columns, not OLD/NEW value equality:
-- SET progress=progress is still an explicit learning/reset write. Including the
-- token column prevents callers from restoring a previous generation. Discover
-- all current non-telemetry columns instead of silently omitting access/identity
-- fields. Later migrations adding enrollment columns must recreate this trigger
-- with the refreshed catalog list; do not add a broad telemetry exclusion to the
-- trigger body, where an explicit no-op reset could become indistinguishable.
DO $completion_source_trigger$
DECLARE v_columns text;
BEGIN
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
  INTO v_columns
  FROM pg_catalog.pg_attribute a
  WHERE a.attrelid = 'public.enrollments'::regclass AND a.attnum > 0
    AND NOT a.attisdropped AND a.attname NOT IN ('time_spent', 'updated_at');
  IF v_columns IS NULL THEN RAISE EXCEPTION 'completion_source_columns_missing'; END IF;
  EXECUTE format(
    'CREATE TRIGGER zz_enrollment_document_facts_revision BEFORE INSERT OR UPDATE OF %s ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.bump_enrollment_document_facts_revision()',
    v_columns);
END;
$completion_source_trigger$;
REVOKE ALL ON FUNCTION public.bump_enrollment_document_facts_revision() FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON COLUMN public.enrollments.document_facts_revision IS
  'Opaque document-source generation, not learning progress or a per-row count. Every INSERT or UPDATE targeting a non-telemetry column receives nextval from a persistent NO CYCLE sequence, including same-value resets and direct token writes. Only time_spent/updated_at-only statements preserve it. Existing rows start at 0. Expose as decimal string. Refresh the column-specific trigger after adding enrollment columns.';

CREATE FUNCTION public._group_completion_xml_text(p_text text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $function$
  SELECT p_text IS NULL OR NOT EXISTS (
    SELECT 1 FROM generate_series(1, length(p_text)) AS chars(pos)
    WHERE ascii(substr(p_text, pos, 1)) BETWEEN 1 AND 8
      OR ascii(substr(p_text, pos, 1)) IN (11, 12, 65534, 65535)
      OR ascii(substr(p_text, pos, 1)) BETWEEN 14 AND 31
  );
$function$;
-- ECMAScript trim whitespace; test raw XML validity separately, BEFORE trimming.
CREATE FUNCTION public._group_completion_nonblank(p_text text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $function$
  SELECT p_text IS NOT NULL AND length(btrim(p_text,
    chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||
    chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||
    chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||
    chr(8287)||chr(12288)||chr(65279))) > 0;
$function$;
CREATE FUNCTION public._group_completion_date(p_text text)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $function$
DECLARE v_date date;
BEGIN
  IF p_text IS NULL THEN RETURN NULL; END IF;
  IF p_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'invalid_completion_date' USING ERRCODE = '22023';
  END IF;
  BEGIN v_date := p_text::date;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION 'invalid_completion_date' USING ERRCODE = '22023';
  END;
  IF NOT isfinite(v_date) OR to_char(v_date, 'YYYY-MM-DD') IS DISTINCT FROM p_text THEN
    RAISE EXCEPTION 'invalid_completion_date' USING ERRCODE = '22023';
  END IF;
  RETURN v_date;
END;
$function$;

-- Do not reuse broad historic organization membership checks. Permissions are
-- actor-derived; there is no caller-supplied actor and no service-key fallback.
CREATE FUNCTION public._group_completion_can_access(p_organization_id uuid, p_manage boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $function$
  SELECT auth.uid() IS NOT NULL
    AND p_organization_id = '7237f9d4-3670-4a19-8946-a43c68fd3473'::uuid
    AND EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = p_organization_id
      AND regexp_replace(COALESCE(o.inn, ''), '\D', '', 'g') = '7806541216'
      AND COALESCE(o.name, '') ~* 'ГОРЭЛТЕХ')
    AND COALESCE(public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.is_org_owner(auth.uid(), p_organization_id)
      OR (EXISTS (SELECT 1 FROM public.org_staff s
          WHERE s.user_id = auth.uid() AND s.organization_id = p_organization_id
            AND (s.expires_at IS NULL OR s.expires_at > now()))
        AND (public.has_org_staff_permission(auth.uid(), p_organization_id, 'documents.manage')
          OR (p_manage IS FALSE AND public.has_org_staff_permission(auth.uid(), p_organization_id, 'documents.read')))), false);
$function$;

CREATE TABLE public.group_completion_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  enrollment_facts_revision bigint NOT NULL CHECK (enrollment_facts_revision >= 0),
  course_id uuid NOT NULL,
  group_start_date date,
  group_end_date date,
  grade_text text NOT NULL CHECK (length(grade_text) <= 100
    AND public._group_completion_nonblank(grade_text) AND public._group_completion_xml_text(grade_text)),
  issuance_decision text NOT NULL CHECK (issuance_decision IN ('with_document', 'without_document')),
  protocol_number text CHECK (length(protocol_number) <= 200 AND public._group_completion_xml_text(protocol_number)),
  protocol_date date,
  decision_note text CHECK (length(decision_note) <= 1000 AND public._group_completion_xml_text(decision_note)),
  revision integer NOT NULL CHECK (revision >= 1),
  confirmed_by uuid NOT NULL,
  confirmed_at timestamptz NOT NULL,
  UNIQUE (organization_id, group_id, user_id),
  CHECK (group_start_date IS NULL OR isfinite(group_start_date)),
  CHECK (group_end_date IS NULL OR isfinite(group_end_date)),
  CHECK (group_start_date IS NULL OR group_end_date IS NULL OR group_start_date <= group_end_date),
  CHECK (protocol_date IS NULL OR isfinite(protocol_date))
);
COMMENT ON TABLE public.group_completion_decisions IS
  'Latest explicit staff decision for an exact learner/enrollment and group context. No default decision, no inferred grade. Stale rows remain visible for audit but cannot classify the current cohort. No cascading FKs: history survives source deletion.';
CREATE TABLE public.group_completion_decision_history (
  decision_id uuid NOT NULL,
  revision integer NOT NULL,
  organization_id uuid NOT NULL,
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  decision jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (decision_id, revision)
);
ALTER TABLE public.group_completion_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_completion_decision_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.group_completion_decisions, public.group_completion_decision_history
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public._group_completion_decision_json(p_row public.group_completion_decisions)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $function$
  SELECT to_jsonb(p_row) || jsonb_build_object('enrollment_facts_revision', p_row.enrollment_facts_revision::text);
$function$;
CREATE FUNCTION public.audit_group_completion_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
BEGIN
  INSERT INTO public.group_completion_decision_history
    (decision_id, revision, organization_id, group_id, user_id, decision)
  VALUES (NEW.id, NEW.revision, NEW.organization_id, NEW.group_id, NEW.user_id,
    public._group_completion_decision_json(NEW));
  RETURN NEW;
END;
$function$;
CREATE TRIGGER group_completion_decision_audit
AFTER INSERT OR UPDATE ON public.group_completion_decisions FOR EACH ROW
EXECUTE FUNCTION public.audit_group_completion_decision();
CREATE FUNCTION public.protect_group_completion_history()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $function$
BEGIN RAISE EXCEPTION 'completion_history_is_immutable' USING ERRCODE = '42501'; END;
$function$;
CREATE TRIGGER group_completion_history_immutable
BEFORE UPDATE OR DELETE ON public.group_completion_decision_history FOR EACH ROW
EXECUTE FUNCTION public.protect_group_completion_history();

CREATE FUNCTION public.read_group_completion_decisions(p_organization_id uuid, p_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE v_result jsonb;
BEGIN
  IF NOT COALESCE(public._group_completion_can_access(p_organization_id, false), false) THEN
    RAISE EXCEPTION 'completion_access_denied' USING ERRCODE = '42501';
  END IF;
  -- The entire group/roster/enrollment/decision context is one MVCC SQL statement.
  WITH scoped_group AS (
    SELECT g.* FROM public.student_groups g
    WHERE g.id = p_group_id AND g.organization_id = p_organization_id
      AND (g.course_id IS NULL OR EXISTS (SELECT 1 FROM public.courses c
        WHERE c.id = g.course_id AND c.organization_id = p_organization_id))
  ), roster AS (
    SELECT p.user_id, p.full_name, p.id FROM public.profiles p JOIN scoped_group g ON g.id = p.student_group_id
    WHERE p.organization_id = p_organization_id AND p.archived_at IS NULL
  )
  SELECT jsonb_build_object(
    'organization_id', p_organization_id,
    'can_manage', public._group_completion_can_access(p_organization_id, true),
    'group', jsonb_build_object('id', g.id, 'organization_id', g.organization_id,
      'course_id', g.course_id, 'name', g.name, 'start_date', g.start_date, 'end_date', g.end_date),
    'students', COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id', p.user_id, 'full_name', p.full_name,
      'enrollments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'user_id', e.user_id,
        'course_id', e.course_id, 'status', e.status, 'progress', e.progress, 'started_at', e.started_at,
        'completed_at', e.completed_at, 'document_facts_revision', e.document_facts_revision::text) ORDER BY e.id)
        FROM public.enrollments e WHERE e.user_id = p.user_id AND e.course_id = g.course_id), '[]'::jsonb),
      'decision', (SELECT public._group_completion_decision_json(d) FROM public.group_completion_decisions d
        WHERE d.organization_id = p_organization_id AND d.group_id = p_group_id AND d.user_id = p.user_id)
    ) ORDER BY p.full_name, p.user_id, p.id) FROM roster p), '[]'::jsonb)
  ) INTO v_result FROM scoped_group g;
  IF v_result IS NULL THEN RAISE EXCEPTION 'completion_group_scope_mismatch' USING ERRCODE = '42501'; END IF;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public.save_group_completion_decision(
  p_organization_id uuid, p_group_id uuid, p_user_id uuid,
  p_expected_enrollment_id uuid, p_expected_enrollment_revision text,
  p_expected_course_id uuid, p_expected_start_date text, p_expected_end_date text,
  p_expected_decision_revision integer, p_grade_text text, p_issuance_decision text,
  p_protocol_number text DEFAULT NULL, p_protocol_date text DEFAULT NULL, p_decision_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE
  v_group public.student_groups%ROWTYPE;
  v_enrollment public.enrollments%ROWTYPE;
  v_decision public.group_completion_decisions%ROWTYPE;
  v_source_revision bigint;
  v_start date;
  v_end date;
  v_protocol_date date;
  v_count integer;
BEGIN
  IF NOT COALESCE(public._group_completion_can_access(p_organization_id, true), false) THEN
    RAISE EXCEPTION 'completion_manage_denied' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_expected_enrollment_id IS NULL OR p_expected_course_id IS NULL THEN
    RAISE EXCEPTION 'completion_identity_required' USING ERRCODE = '22023';
  END IF;
  IF NOT public._group_completion_nonblank(p_grade_text) OR length(p_grade_text) > 100
    OR p_issuance_decision IS NULL OR p_issuance_decision NOT IN ('with_document', 'without_document')
    OR length(p_protocol_number) > 200 OR length(p_decision_note) > 1000
    OR NOT public._group_completion_xml_text(p_grade_text)
    OR NOT public._group_completion_xml_text(p_protocol_number)
    OR NOT public._group_completion_xml_text(p_decision_note) THEN
    RAISE EXCEPTION 'invalid_completion_decision_text' USING ERRCODE = '22023';
  END IF;
  IF p_expected_enrollment_revision IS NULL OR p_expected_enrollment_revision !~ '^(0|[1-9][0-9]{0,18})$' THEN
    RAISE EXCEPTION 'invalid_enrollment_facts_revision' USING ERRCODE = '22023';
  END IF;
  BEGIN v_source_revision := p_expected_enrollment_revision::bigint;
  EXCEPTION WHEN numeric_value_out_of_range THEN
    RAISE EXCEPTION 'invalid_enrollment_facts_revision' USING ERRCODE = '22023';
  END;
  v_start := public._group_completion_date(p_expected_start_date);
  v_end := public._group_completion_date(p_expected_end_date);
  v_protocol_date := public._group_completion_date(p_protocol_date);
  IF v_start IS NOT NULL AND v_end IS NOT NULL AND v_start > v_end THEN
    RAISE EXCEPTION 'invalid_completion_period' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_group FROM public.student_groups g WHERE g.id = p_group_id FOR UPDATE;
  IF NOT FOUND OR v_group.organization_id IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'completion_group_scope_mismatch' USING ERRCODE = '42501';
  END IF;
  IF v_group.course_id IS DISTINCT FROM p_expected_course_id
    OR v_group.start_date IS DISTINCT FROM v_start OR v_group.end_date IS DISTINCT FROM v_end THEN
    RAISE EXCEPTION 'completion_group_context_changed' USING ERRCODE = '40001';
  END IF;
  PERFORM 1 FROM public.courses c WHERE c.id = v_group.course_id AND c.organization_id = p_organization_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'completion_course_scope_mismatch' USING ERRCODE = '42501'; END IF;
  -- Preserve identity after later archive/move; never delete historical decisions.
  PERFORM 1 FROM public.profiles p WHERE p.user_id = p_user_id AND p.organization_id = p_organization_id
    AND p.student_group_id = p_group_id AND p.archived_at IS NULL FOR SHARE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'completion_student_scope_ambiguous' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.enrollments e WHERE e.user_id = p_user_id AND e.course_id = p_expected_course_id FOR UPDATE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'completion_enrollment_ambiguous' USING ERRCODE = '40001'; END IF;
  SELECT * INTO v_enrollment FROM public.enrollments e
    WHERE e.id = p_expected_enrollment_id AND e.user_id = p_user_id AND e.course_id = p_expected_course_id;
  IF NOT FOUND OR v_enrollment.document_facts_revision IS DISTINCT FROM v_source_revision
    OR v_enrollment.status IS NULL OR v_enrollment.status NOT IN ('active', 'completed') THEN
    RAISE EXCEPTION 'completion_enrollment_changed' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO v_decision FROM public.group_completion_decisions d
    WHERE d.organization_id = p_organization_id AND d.group_id = p_group_id AND d.user_id = p_user_id FOR UPDATE;
  IF FOUND THEN
    IF p_expected_decision_revision IS NULL OR v_decision.revision <> p_expected_decision_revision THEN
      RAISE EXCEPTION 'completion_decision_revision_conflict' USING ERRCODE = '40001';
    END IF;
    UPDATE public.group_completion_decisions SET enrollment_id = p_expected_enrollment_id,
      enrollment_facts_revision = v_source_revision, course_id = p_expected_course_id,
      group_start_date = v_start, group_end_date = v_end, grade_text = p_grade_text,
      issuance_decision = p_issuance_decision,
      protocol_number = CASE WHEN public._group_completion_nonblank(p_protocol_number) THEN p_protocol_number END,
      protocol_date = v_protocol_date,
      decision_note = CASE WHEN public._group_completion_nonblank(p_decision_note) THEN p_decision_note END,
      revision = revision + 1, confirmed_by = auth.uid(), confirmed_at = clock_timestamp()
    WHERE id = v_decision.id RETURNING * INTO v_decision;
  ELSE
    IF p_expected_decision_revision IS NOT NULL THEN
      RAISE EXCEPTION 'completion_decision_revision_conflict' USING ERRCODE = '40001';
    END IF;
    INSERT INTO public.group_completion_decisions (organization_id, group_id, user_id, enrollment_id,
      enrollment_facts_revision, course_id, group_start_date, group_end_date, grade_text,
      issuance_decision, protocol_number, protocol_date, decision_note, revision, confirmed_by, confirmed_at)
    VALUES (p_organization_id, p_group_id, p_user_id, p_expected_enrollment_id, v_source_revision,
      p_expected_course_id, v_start, v_end, p_grade_text, p_issuance_decision,
      CASE WHEN public._group_completion_nonblank(p_protocol_number) THEN p_protocol_number END,
      v_protocol_date, CASE WHEN public._group_completion_nonblank(p_decision_note) THEN p_decision_note END,
      1, auth.uid(), clock_timestamp()) RETURNING * INTO v_decision;
  END IF;
  RETURN public._group_completion_decision_json(v_decision);
END;
$function$;

REVOKE ALL ON FUNCTION public._group_completion_xml_text(text), public._group_completion_nonblank(text),
  public._group_completion_date(text), public._group_completion_can_access(uuid,boolean),
  public._group_completion_decision_json(public.group_completion_decisions), public.audit_group_completion_decision(),
  public.protect_group_completion_history() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.read_group_completion_decisions(uuid,uuid),
  public.save_group_completion_decision(uuid,uuid,uuid,uuid,text,uuid,text,text,integer,text,text,text,text,text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.read_group_completion_decisions(uuid,uuid),
  public.save_group_completion_decision(uuid,uuid,uuid,uuid,text,uuid,text,text,integer,text,text,text,text,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
