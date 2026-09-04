-- Independent, prepared-but-UNSIGNED enrollment orders. Never alter the nine
-- draft-document RPCs, the existing document archive, or billing buckets.
DO $preflight$
BEGIN
  IF to_regprocedure('extensions.digest(text,text)') IS NULL THEN
    RAISE EXCEPTION 'extensions.digest(text,text) is required; verify pgcrypto installation before this migration';
  END IF;
END;
$preflight$;

CREATE TABLE public.goreltech_enrollment_orders (
  organization_id uuid NOT NULL,
  group_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[A-F0-9]{64}$'),
  document_date date NOT NULL CHECK (isfinite(document_date)),
  signatory jsonb NOT NULL CHECK (jsonb_typeof(signatory) = 'object'),
  template_sha256 text NOT NULL CHECK (template_sha256 = '1A5E190569CE7CB152B39C644B3C7200DB88053F5BC9FD4E1F8D9FDE08BAB54C'),
  document_number text NOT NULL,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'completed')),
  file_path text,
  docx_sha256 text CHECK (docx_sha256 ~ '^[A-F0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY (organization_id, group_id, operation_id),
  UNIQUE (organization_id, document_number),
  CHECK ((status = 'reserved' AND file_path IS NULL AND docx_sha256 IS NULL AND completed_at IS NULL)
    OR (status = 'completed' AND file_path IS NOT NULL AND docx_sha256 IS NOT NULL AND completed_at IS NOT NULL))
);
COMMENT ON TABLE public.goreltech_enrollment_orders IS
  'Frozen enrollment-order source and reserved number; completed means prepared for signature, never signed/issued. No cascading foreign keys: deleting group/user must not erase the historic order. Signatory text is explicitly caller-confirmed, not authority verification.';
ALTER TABLE public.goreltech_enrollment_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.goreltech_enrollment_orders FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO storage.buckets (id, name, public)
VALUES ('goreltech-issued-documents', 'goreltech-issued-documents', false);
-- Restrictive policies intersect existing permissive policies, even generic
-- authenticated allow-all policies. Only this new bucket is affected.
CREATE POLICY goreltech_issued_objects_read_guard ON storage.objects AS RESTRICTIVE
  FOR SELECT TO anon, authenticated USING (bucket_id <> 'goreltech-issued-documents');
CREATE POLICY goreltech_issued_objects_insert_guard ON storage.objects AS RESTRICTIVE
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id <> 'goreltech-issued-documents');
CREATE POLICY goreltech_issued_objects_update_guard ON storage.objects AS RESTRICTIVE
  FOR UPDATE TO anon, authenticated USING (bucket_id <> 'goreltech-issued-documents')
  WITH CHECK (bucket_id <> 'goreltech-issued-documents');
CREATE POLICY goreltech_issued_objects_delete_guard ON storage.objects AS RESTRICTIVE
  FOR DELETE TO anon, authenticated USING (bucket_id <> 'goreltech-issued-documents');
CREATE POLICY goreltech_issued_bucket_insert_guard ON storage.buckets AS RESTRICTIVE
  FOR INSERT TO anon, authenticated WITH CHECK (id <> 'goreltech-issued-documents');
CREATE POLICY goreltech_issued_bucket_update_guard ON storage.buckets AS RESTRICTIVE
  FOR UPDATE TO anon, authenticated USING (id <> 'goreltech-issued-documents')
  WITH CHECK (id <> 'goreltech-issued-documents');
CREATE POLICY goreltech_issued_bucket_delete_guard ON storage.buckets AS RESTRICTIVE
  FOR DELETE TO anon, authenticated USING (id <> 'goreltech-issued-documents');

CREATE FUNCTION public._assert_goreltech_enrollment_order_access(
  p_actor_id uuid, p_organization_id uuid, p_allow_read boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  IF COALESCE(NULLIF(auth.jwt()->>'role', ''), NULLIF(current_setting('request.jwt.claim.role', true), ''), '')
      IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NULL OR NOT COALESCE(
    public.has_role(p_actor_id, 'admin'::public.app_role)
    OR public.is_org_owner(p_actor_id, p_organization_id)
    OR (EXISTS (SELECT 1 FROM public.org_staff s
        WHERE s.user_id = p_actor_id AND s.organization_id = p_organization_id
          AND (s.expires_at IS NULL OR s.expires_at > now()))
      AND (public.has_org_staff_permission(p_actor_id, p_organization_id, 'documents.manage')
        OR (p_allow_read IS TRUE AND public.has_org_staff_permission(p_actor_id, p_organization_id, 'documents.read')))), false) THEN
    RAISE EXCEPTION 'actor cannot access organization orders' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS DISTINCT FROM '7237f9d4-3670-4a19-8946-a43c68fd3473'::uuid
    OR NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = p_organization_id
      AND regexp_replace(COALESCE(o.inn, ''), '\D', '', 'g') = '7806541216'
      AND COALESCE(o.name, '') ~* 'ГОРЭЛТЕХ') THEN
    RAISE EXCEPTION 'exact GORELTECH organization required' USING ERRCODE = '42501';
  END IF;
END;
$function$;

-- One SQL statement supplies one MVCC source snapshot, not several network
-- reads. No FRDO/passport/email query, completion/attestation/issuance dependency.
CREATE FUNCTION public._goreltech_enrollment_order_snapshot(p_organization_id uuid, p_group_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
  WITH scoped_group AS (
    SELECT g.* FROM public.student_groups g
    WHERE g.id = p_group_id AND g.organization_id = p_organization_id
  ), scoped_course AS (
    SELECT c.* FROM public.courses c JOIN scoped_group g ON g.course_id = c.id
    WHERE c.organization_id = p_organization_id
  ), roster AS (
    SELECT p.id, p.user_id, p.organization_id, p.student_group_id, p.archived_at, p.full_name
    FROM public.profiles p JOIN scoped_group g ON g.id = p.student_group_id
    WHERE p.organization_id = p_organization_id AND p.archived_at IS NULL
  )
  SELECT jsonb_build_object(
    'organization', jsonb_build_object('id', o.id, 'name', o.name, 'inn', o.inn,
      'kpp', o.kpp, 'ogrn', o.ogrn, 'legal_address', o.legal_address),
    'group', jsonb_build_object('id', g.id, 'organization_id', g.organization_id, 'course_id', g.course_id,
      'group_number', g.group_number, 'program_title', g.program_title, 'program_hours', g.program_hours,
      'start_date', g.start_date, 'end_date', g.end_date),
    'course', (SELECT jsonb_build_object('id', c.id, 'organization_id', c.organization_id,
      'title', c.title, 'duration', c.duration, 'frdo_duration_hours', c.frdo_duration_hours) FROM scoped_course c),
    'profiles', COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id', p.user_id,
      'organization_id', p.organization_id, 'student_group_id', p.student_group_id,
      'archived_at', p.archived_at, 'full_name', p.full_name, 'email', NULL) ORDER BY p.user_id, p.id) FROM roster p), '[]'::jsonb),
    'enrollments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'user_id', e.user_id,
      'course_id', e.course_id, 'status', e.status, 'progress', e.progress, 'completed_at', e.completed_at) ORDER BY e.id)
      FROM public.enrollments e JOIN scoped_course c ON c.id = e.course_id
      WHERE EXISTS (SELECT 1 FROM roster p WHERE p.user_id = e.user_id)), '[]'::jsonb),
    'studentFrdoData', '[]'::jsonb,
    'metadata', jsonb_build_object('clientResponsiblePersonName', 'Ляпко Дарья Константиновна',
      'clientOrganizationShortName', 'ООО «ИЦ «ГОРЭЛТЕХ»',
      'responsiblePersonSource', 'goreltech-client-template-v20', 'documentStage', 'enrollment_prepared_unsigned')
  ) FROM scoped_group g JOIN public.organizations o ON o.id = g.organization_id;
$function$;

CREATE FUNCTION public._goreltech_enrollment_order_result(p_row public.goreltech_enrollment_orders)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp
AS $function$
  SELECT jsonb_build_object('organizationId', p_row.organization_id, 'groupId', p_row.group_id,
    'actorId', p_row.actor_id, 'operationId', p_row.operation_id, 'status', p_row.status,
    'snapshot', p_row.snapshot, 'snapshotCanonical', p_row.snapshot::text, 'snapshotHash', p_row.snapshot_hash,
    'documentNumber', p_row.document_number, 'documentDate', to_char(p_row.document_date, 'YYYY-MM-DD'),
    'signatory', p_row.signatory, 'templateSha256', p_row.template_sha256,
    'filePath', p_row.file_path, 'docxSha256', p_row.docx_sha256,
    'createdAt', p_row.created_at, 'completedAt', p_row.completed_at);
$function$;

CREATE FUNCTION public.preview_goreltech_enrollment_order(p_actor_id uuid, p_organization_id uuid, p_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_snapshot jsonb;
BEGIN
  PERFORM public._assert_goreltech_enrollment_order_access(p_actor_id, p_organization_id);
  v_snapshot := public._goreltech_enrollment_order_snapshot(p_organization_id, p_group_id);
  IF v_snapshot IS NULL THEN RAISE EXCEPTION 'group scope mismatch' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('organizationId', p_organization_id, 'groupId', p_group_id, 'actorId', p_actor_id,
    'snapshot', v_snapshot, 'snapshotCanonical', v_snapshot::text,
    'snapshotHash', upper(encode(extensions.digest(v_snapshot::text, 'sha256'), 'hex')));
END;
$function$;

CREATE FUNCTION public.reserve_goreltech_enrollment_order(
  p_actor_id uuid, p_organization_id uuid, p_group_id uuid, p_operation_id uuid,
  p_expected_snapshot_hash text, p_document_date text, p_signatory jsonb, p_template_sha256 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_saved public.goreltech_enrollment_orders%ROWTYPE;
  v_snapshot jsonb;
  v_hash text;
  v_date date;
  v_start date;
  v_end date;
  v_number integer;
  v_hours numeric[];
  v_signatory jsonb;
  -- Match JavaScript String.trim used by the Edge source/signatory validators, including NBSP/BOM.
  -- This validates presence only; the frozen source strings stay unchanged.
  v_title_whitespace CONSTANT text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
  PERFORM public._assert_goreltech_enrollment_order_access(p_actor_id, p_organization_id);
  IF p_group_id IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'group and operation IDs required' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('goreltech-enrollment-order:' || p_organization_id::text
    || ':' || p_group_id::text || ':' || p_operation_id::text, 0));
  SELECT * INTO v_saved FROM public.goreltech_enrollment_orders r
    WHERE r.organization_id = p_organization_id AND r.group_id = p_group_id AND r.operation_id = p_operation_id;
  IF FOUND THEN
    IF v_saved.actor_id IS DISTINCT FROM p_actor_id THEN RAISE EXCEPTION 'operation belongs to another actor' USING ERRCODE = '42501'; END IF;
    RETURN public._goreltech_enrollment_order_result(v_saved);
  END IF;

  -- Serialize group versions consistently with the existing draft RPCs. The
  -- actual row lock also protects group settings until freeze has committed.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_group_id::text, 0));
  PERFORM 1 FROM public.student_groups g WHERE g.id = p_group_id AND g.organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'group scope mismatch' USING ERRCODE = '42501'; END IF;
  IF p_document_date IS NULL OR p_document_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'explicit document date required' USING ERRCODE = '22023';
  END IF;
  BEGIN v_date := p_document_date::date;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION 'invalid document date' USING ERRCODE = '22023'; END;
  IF NOT isfinite(v_date) OR to_char(v_date, 'YYYY-MM-DD') <> p_document_date THEN
    RAISE EXCEPTION 'invalid document date' USING ERRCODE = '22023';
  END IF;
  IF p_template_sha256 IS NULL OR upper(p_template_sha256) <> '1A5E190569CE7CB152B39C644B3C7200DB88053F5BC9FD4E1F8D9FDE08BAB54C' THEN
    RAISE EXCEPTION 'unrecognized enrollment template' USING ERRCODE = '22023';
  END IF;
  IF p_signatory IS NULL OR jsonb_typeof(p_signatory) <> 'object'
    OR jsonb_typeof(p_signatory->'name') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_signatory->'position') IS DISTINCT FROM 'string'
    OR NULLIF(btrim(p_signatory->>'name', v_title_whitespace), '') IS NULL
    OR NULLIF(btrim(p_signatory->>'position', v_title_whitespace), '') IS NULL
    -- Edge checks original JS string.length (UTF-16 units), not trimmed codepoints.
    OR EXISTS (SELECT 1 FROM jsonb_each_text(p_signatory) s
      CROSS JOIN LATERAL generate_series(1, length(s.value)) chars(pos)
      GROUP BY s.key HAVING sum(CASE WHEN ascii(substr(s.value, chars.pos, 1)) > 65535 THEN 2 ELSE 1 END)
        > CASE s.key WHEN 'name' THEN 300 ELSE 200 END)
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_signatory) k WHERE k NOT IN ('name', 'position')) THEN
    RAISE EXCEPTION 'explicit signatory name and position required' USING ERRCODE = '22023';
  END IF;
  v_signatory := jsonb_build_object('name', btrim(p_signatory->>'name', v_title_whitespace),
    'position', btrim(p_signatory->>'position', v_title_whitespace));
  v_snapshot := public._goreltech_enrollment_order_snapshot(p_organization_id, p_group_id);
  v_hash := upper(encode(extensions.digest(v_snapshot::text, 'sha256'), 'hex'));
  IF p_expected_snapshot_hash IS NULL OR upper(p_expected_snapshot_hash) IS DISTINCT FROM v_hash THEN
    RAISE EXCEPTION 'snapshot changed; preview and confirm again' USING ERRCODE = '40001';
  END IF;

  -- Requirements of enrollment only: no future test results or issued records.
  IF NULLIF(btrim(v_snapshot#>>'{organization,name}', v_title_whitespace), '') IS NULL
    OR NULLIF(btrim(v_snapshot#>>'{group,group_number}', v_title_whitespace), '') IS NULL
    OR COALESCE(NULLIF(btrim(v_snapshot#>>'{group,program_title}', v_title_whitespace), ''),
      NULLIF(btrim(v_snapshot#>>'{course,title}', v_title_whitespace), '')) IS NULL
    OR v_snapshot->'course' = 'null'::jsonb
    OR v_snapshot#>>'{course,organization_id}' IS DISTINCT FROM p_organization_id::text
    OR v_snapshot#>>'{course,id}' IS DISTINCT FROM v_snapshot#>>'{group,course_id}' THEN
    RAISE EXCEPTION 'required enrollment group/course details missing' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT hours) INTO v_hours FROM (
    SELECT CASE WHEN btrim(value, v_title_whitespace) ~ '^-?[0-9]+([.][0-9]+)?$'
      THEN btrim(value, v_title_whitespace)::numeric END AS hours
    FROM unnest(ARRAY[v_snapshot#>>'{group,program_hours}', v_snapshot#>>'{course,frdo_duration_hours}', v_snapshot#>>'{course,duration}']) value
  ) parsed WHERE hours IS NOT NULL;
  IF COALESCE(cardinality(v_hours), 0) <> 1 OR v_hours[1] <= 0 THEN
    RAISE EXCEPTION 'program hours missing or conflicting' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(v_snapshot#>>'{group,start_date}', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    OR COALESCE(v_snapshot#>>'{group,end_date}', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'group period missing or invalid' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_start := (v_snapshot#>>'{group,start_date}')::date;
    v_end := (v_snapshot#>>'{group,end_date}')::date;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION 'group period invalid' USING ERRCODE = '22023'; END;
  IF v_start > v_end OR to_char(v_start, 'YYYY-MM-DD') <> v_snapshot#>>'{group,start_date}'
    OR to_char(v_end, 'YYYY-MM-DD') <> v_snapshot#>>'{group,end_date}' THEN
    RAISE EXCEPTION 'group period invalid' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_snapshot->'profiles') = 0
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_snapshot->'profiles') p
      WHERE NULLIF(btrim(p->>'full_name', v_title_whitespace), '') IS NULL OR NULLIF(p->>'user_id', '') IS NULL)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_snapshot->'profiles') p GROUP BY p->>'user_id' HAVING count(*) <> 1)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_snapshot->'profiles') p WHERE
      (SELECT count(*) FROM jsonb_array_elements(v_snapshot->'enrollments') e
        WHERE e->>'user_id' = p->>'user_id' AND e->>'course_id' = v_snapshot#>>'{course,id}') <> 1) THEN
    RAISE EXCEPTION 'roster needs named participants with exactly one enrollment each' USING ERRCODE = '22023';
  END IF;
  -- PostgreSQL rejects NUL/surrogates. Reject remaining XML 1.0 forbidden chars
  -- before reserving a number; no silent correction of names or signed facts.
  IF EXISTS (SELECT 1 FROM (
      SELECT value AS txt FROM jsonb_each_text(p_signatory)
      UNION ALL SELECT p->>'full_name' FROM jsonb_array_elements(v_snapshot->'profiles') p
      UNION ALL SELECT v_snapshot#>>'{organization,name}'
      UNION ALL SELECT v_snapshot#>>'{group,group_number}'
      UNION ALL SELECT v_snapshot#>>'{group,program_title}'
      UNION ALL SELECT v_snapshot#>>'{course,title}'
    ) texts CROSS JOIN LATERAL generate_series(1, length(texts.txt)) chars(pos)
    WHERE ascii(substr(texts.txt, pos, 1)) BETWEEN 1 AND 8
      OR ascii(substr(texts.txt, pos, 1)) IN (11, 12, 65534, 65535)
      OR ascii(substr(texts.txt, pos, 1)) BETWEEN 14 AND 31) THEN
    RAISE EXCEPTION 'invalid XML source text' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.document_number_sequences (organization_id, doc_type, year, last_number)
  VALUES (p_organization_id, 'group_order', extract(year FROM v_date)::integer, 1)
  ON CONFLICT (organization_id, doc_type, year) DO UPDATE
    SET last_number = document_number_sequences.last_number + 1, updated_at = now()
  RETURNING last_number INTO v_number;
  IF v_number <= 0 THEN RAISE EXCEPTION 'invalid existing document number counter' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.goreltech_enrollment_orders
    (organization_id, group_id, operation_id, actor_id, snapshot, snapshot_hash, document_date,
      signatory, template_sha256, document_number)
  VALUES (p_organization_id, p_group_id, p_operation_id, p_actor_id, v_snapshot, v_hash, v_date,
    v_signatory, upper(p_template_sha256), 'УЦ-' || v_number::text || '/' || to_char(v_date, 'YYYY'))
  RETURNING * INTO v_saved;
  RETURN public._goreltech_enrollment_order_result(v_saved);
END;
$function$;

CREATE FUNCTION public.get_goreltech_enrollment_order(p_actor_id uuid, p_organization_id uuid, p_group_id uuid, p_operation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_saved public.goreltech_enrollment_orders%ROWTYPE;
BEGIN
  PERFORM public._assert_goreltech_enrollment_order_access(p_actor_id, p_organization_id);
  IF p_group_id IS NULL OR p_operation_id IS NULL THEN RAISE EXCEPTION 'group and operation IDs required' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_saved FROM public.goreltech_enrollment_orders r
    WHERE r.organization_id = p_organization_id AND r.group_id = p_group_id AND r.operation_id = p_operation_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_saved.actor_id IS DISTINCT FROM p_actor_id THEN RAISE EXCEPTION 'operation belongs to another actor' USING ERRCODE = '42501'; END IF;
  RETURN public._goreltech_enrollment_order_result(v_saved);
END;
$function$;

CREATE FUNCTION public.complete_goreltech_enrollment_order(
  p_actor_id uuid, p_organization_id uuid, p_group_id uuid, p_operation_id uuid, p_file_path text, p_docx_sha256 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_saved public.goreltech_enrollment_orders%ROWTYPE; v_expected_path text;
BEGIN
  PERFORM public._assert_goreltech_enrollment_order_access(p_actor_id, p_organization_id);
  IF p_group_id IS NULL OR p_operation_id IS NULL THEN RAISE EXCEPTION 'group and operation IDs required' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('goreltech-enrollment-order:' || p_organization_id::text
    || ':' || p_group_id::text || ':' || p_operation_id::text, 0));
  SELECT * INTO v_saved FROM public.goreltech_enrollment_orders r
    WHERE r.organization_id = p_organization_id AND r.group_id = p_group_id AND r.operation_id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reserved order not found' USING ERRCODE = '22023'; END IF;
  IF v_saved.actor_id IS DISTINCT FROM p_actor_id THEN RAISE EXCEPTION 'operation belongs to another actor' USING ERRCODE = '42501'; END IF;
  IF v_saved.status = 'completed' THEN RETURN public._goreltech_enrollment_order_result(v_saved); END IF;
  IF p_docx_sha256 IS NULL OR p_docx_sha256 !~* '^[A-F0-9]{64}$' THEN RAISE EXCEPTION 'invalid DOCX hash' USING ERRCODE = '22023'; END IF;
  v_expected_path := p_organization_id::text || '/enrollment-orders/' || p_group_id::text || '/'
    || p_operation_id::text || '/' || upper(p_docx_sha256) || '.docx';
  IF p_file_path IS DISTINCT FROM v_expected_path THEN RAISE EXCEPTION 'file path scope mismatch' USING ERRCODE = '22023'; END IF;
  -- This proves registered storage-object existence, not its byte hash: the
  -- authenticated Edge compiler must verify bytes before invoking completion.
  PERFORM 1 FROM storage.objects o WHERE o.bucket_id = 'goreltech-issued-documents' AND o.name = v_expected_path FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'uploaded private DOCX not found' USING ERRCODE = '22023'; END IF;
  UPDATE public.goreltech_enrollment_orders r SET status = 'completed', file_path = v_expected_path,
    docx_sha256 = upper(p_docx_sha256), completed_at = clock_timestamp()
  WHERE r.organization_id = p_organization_id AND r.group_id = p_group_id AND r.operation_id = p_operation_id
  RETURNING * INTO v_saved;
  RETURN public._goreltech_enrollment_order_result(v_saved);
END;
$function$;

CREATE FUNCTION public.list_goreltech_enrollment_orders(p_actor_id uuid, p_organization_id uuid, p_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  PERFORM public._assert_goreltech_enrollment_order_access(p_actor_id, p_organization_id, true);
  IF p_group_id IS NULL THEN RAISE EXCEPTION 'group ID required' USING ERRCODE = '22023'; END IF;
  -- No live-group FK/read requirement: authorized organization staff can still
  -- read completed historical orders after the original group was deleted.
  RETURN COALESCE((SELECT jsonb_agg(public._goreltech_enrollment_order_result(r) ORDER BY r.created_at, r.operation_id)
    FROM public.goreltech_enrollment_orders r
    WHERE r.organization_id = p_organization_id AND r.group_id = p_group_id AND r.status = 'completed'), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public._assert_goreltech_enrollment_order_access(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._goreltech_enrollment_order_snapshot(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._goreltech_enrollment_order_result(public.goreltech_enrollment_orders) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.preview_goreltech_enrollment_order(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_goreltech_enrollment_order(uuid,uuid,uuid,uuid,text,text,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_goreltech_enrollment_order(uuid,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_goreltech_enrollment_order(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_goreltech_enrollment_orders(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_goreltech_enrollment_order(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_goreltech_enrollment_order(uuid,uuid,uuid,uuid,text,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_goreltech_enrollment_order(uuid,uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_goreltech_enrollment_order(uuid,uuid,uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_goreltech_enrollment_orders(uuid,uuid,uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
