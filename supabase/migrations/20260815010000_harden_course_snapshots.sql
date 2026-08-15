-- Course snapshots inherit access from the course, but profile membership by
-- itself is not sufficient: student profiles also carry organization_id.
-- Only platform admins, organization owners and explicitly permitted org
-- staff may inspect or mutate version history.
CREATE OR REPLACE FUNCTION public.can_access_course_snapshots(
  _course_id uuid,
  _permission text DEFAULT 'courses.read'
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.courses c
    WHERE c.id = _course_id
      AND auth.uid() IS NOT NULL
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR EXISTS (
          SELECT 1
          FROM public.admin_staff platform_staff
          WHERE platform_staff.user_id = auth.uid()
            AND platform_staff.role IN ('admin', 'super_admin')
            AND (
              platform_staff.expires_at IS NULL
              OR platform_staff.expires_at > now()
            )
        )
        OR (
          public.has_role(auth.uid(), 'organization'::public.app_role)
          AND EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.user_id = auth.uid()
              AND p.organization_id = c.organization_id
          )
        )
        OR (
          EXISTS (
            SELECT 1
            FROM public.org_staff os
            WHERE os.user_id = auth.uid()
              AND os.organization_id = c.organization_id
              AND (os.expires_at IS NULL OR os.expires_at > now())
          )
          AND public.has_org_staff_permission(
            auth.uid(),
            c.organization_id,
            _permission
          )
        )
      )
  )
$$;

REVOKE ALL ON FUNCTION public.can_access_course_snapshots(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_course_snapshots(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_course_snapshots(uuid, text)
  TO authenticated, service_role;

DROP POLICY IF EXISTS "Course snapshots viewable by org staff and admins"
  ON public.course_snapshots;
DROP POLICY IF EXISTS "Course snapshots inserted by org managers and admins"
  ON public.course_snapshots;
DROP POLICY IF EXISTS "Course snapshots deletable by org managers and admins"
  ON public.course_snapshots;
DROP POLICY IF EXISTS "Course snapshots readable through course access"
  ON public.course_snapshots;
DROP POLICY IF EXISTS "Course snapshots creatable through course access"
  ON public.course_snapshots;
DROP POLICY IF EXISTS "Course snapshots deletable through course access"
  ON public.course_snapshots;

CREATE POLICY "Course snapshots readable through course access"
ON public.course_snapshots
FOR SELECT
TO authenticated
USING (
  public.can_access_course_snapshots(course_id, 'courses.read')
  AND EXISTS (
    SELECT 1
    FROM public.courses c
    WHERE c.id = course_snapshots.course_id
      AND c.organization_id = course_snapshots.organization_id
  )
);

CREATE POLICY "Course snapshots creatable through course access"
ON public.course_snapshots
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_access_course_snapshots(course_id, 'courses.write')
  AND EXISTS (
    SELECT 1
    FROM public.courses c
    WHERE c.id = course_snapshots.course_id
      AND c.organization_id = course_snapshots.organization_id
  )
);

CREATE POLICY "Course snapshots deletable through course access"
ON public.course_snapshots
FOR DELETE
TO authenticated
USING (
  public.can_access_course_snapshots(course_id, 'courses.write')
  AND EXISTS (
    SELECT 1
    FROM public.courses c
    WHERE c.id = course_snapshots.course_id
      AND c.organization_id = course_snapshots.organization_id
  )
);

CREATE OR REPLACE FUNCTION public.create_course_snapshot(
  _course_id uuid,
  _reason text DEFAULT 'manual',
  _label text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course public.courses%ROWTYPE;
  v_snapshot public.course_snapshots%ROWTYPE;
BEGIN
  IF _course_id IS NULL OR NULLIF(btrim(_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Invalid course snapshot request'
      USING ERRCODE = '22023';
  END IF;

  -- Lock the parent first. Besides serializing snapshots/restores for this
  -- course, this blocks concurrent inserts into child tables through their FK.
  SELECT c.*
  INTO v_course
  FROM public.courses c
  WHERE c.id = _course_id
    AND public.can_access_course_snapshots(c.id, 'courses.write')
  FOR UPDATE;

  IF NOT FOUND OR v_course.id IS NULL OR v_course.organization_id IS NULL THEN
    RAISE EXCEPTION 'Course not found or not accessible'
      USING ERRCODE = '42501';
  END IF;

  -- Lock all mutable children in the same deterministic order used by restore.
  -- Every aggregate below is therefore one coherent transactional version.
  PERFORM cm.id
  FROM public.course_modules cm
  WHERE cm.course_id = _course_id
  ORDER BY cm.id
  FOR UPDATE;

  PERFORM l.id
  FROM public.lessons l
  WHERE l.course_id = _course_id
  ORDER BY l.id
  FOR UPDATE;

  PERFORM tq.id
  FROM public.test_questions tq
  JOIN public.lessons l ON l.id = tq.lesson_id
  WHERE l.course_id = _course_id
  ORDER BY tq.id
  FOR UPDATE OF tq;

  PERFORM d.id
  FROM public.course_documents d
  WHERE d.course_id = _course_id
  ORDER BY d.id
  FOR UPDATE;

  INSERT INTO public.course_snapshots (
    course_id,
    organization_id,
    created_by,
    reason,
    label,
    payload
  )
  VALUES (
    _course_id,
    v_course.organization_id,
    auth.uid(),
    btrim(_reason),
    _label,
    jsonb_build_object(
      'course', to_jsonb(v_course),
      'course_modules', COALESCE((
        SELECT jsonb_agg(to_jsonb(cm) ORDER BY cm.order_index, cm.id)
        FROM public.course_modules cm
        WHERE cm.course_id = _course_id
      ), '[]'::jsonb),
      'lessons', COALESCE((
        SELECT jsonb_agg(to_jsonb(l) ORDER BY l.order_index, l.id)
        FROM public.lessons l
        WHERE l.course_id = _course_id
      ), '[]'::jsonb),
      'test_questions', COALESCE((
        SELECT jsonb_agg(to_jsonb(tq) ORDER BY tq.lesson_id, tq.order_index, tq.id)
        FROM public.test_questions tq
        JOIN public.lessons l ON l.id = tq.lesson_id
        WHERE l.course_id = _course_id
      ), '[]'::jsonb),
      'course_documents', COALESCE((
        SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at, d.id)
        FROM public.course_documents d
        WHERE d.course_id = _course_id
      ), '[]'::jsonb)
    )
  )
  RETURNING * INTO v_snapshot;

  RETURN to_jsonb(v_snapshot);
END;
$$;

REVOKE ALL ON FUNCTION public.create_course_snapshot(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_course_snapshot(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_course_snapshot(uuid, text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.create_course_snapshot(uuid, text, text) IS
  'Creates one authorized, tenant-matched, transactionally coherent course snapshot.';

CREATE OR REPLACE FUNCTION public.restore_course_snapshot(_snapshot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_id uuid;
  v_snapshot_org_id uuid;
  v_course_org_id uuid;
  v_payload jsonb;
  v_has_module_snapshot boolean := false;
  module_rec jsonb;
  lesson_rec jsonb;
  question_rec jsonb;
  doc_rec jsonb;
  v_module_id uuid;
  v_lesson_id uuid;
  v_question_id uuid;
  v_document_id uuid;
  v_snapshot_module_ids uuid[] := ARRAY[]::uuid[];
  v_snapshot_lesson_ids uuid[] := ARRAY[]::uuid[];
  v_snapshot_question_ids uuid[] := ARRAY[]::uuid[];
  v_snapshot_document_ids uuid[] := ARRAY[]::uuid[];
  v_extra_module_ids uuid[] := ARRAY[]::uuid[];
  v_extra_lesson_ids uuid[] := ARRAY[]::uuid[];
  dependency_rec record;
  v_dependency_found boolean;
BEGIN
  -- SECURITY DEFINER bypasses table RLS, so authorization is part of the
  -- lookup itself. Missing and cross-tenant ids intentionally fail alike.
  IF _snapshot_id IS NULL THEN
    RAISE EXCEPTION 'Snapshot not found or not accessible'
      USING ERRCODE = '42501';
  END IF;

  SELECT cs.course_id, cs.organization_id, cs.payload
  INTO v_course_id, v_snapshot_org_id, v_payload
  FROM public.course_snapshots cs
  WHERE cs.id = _snapshot_id
    AND public.can_access_course_snapshots(cs.course_id, 'courses.write')
  FOR SHARE;

  IF NOT FOUND
    OR v_course_id IS NULL
    OR v_snapshot_org_id IS NULL
    OR v_payload IS NULL
  THEN
    RAISE EXCEPTION 'Snapshot not found or not accessible'
      USING ERRCODE = '42501';
  END IF;

  -- The live course is the source of truth for tenant ownership. Lock it so
  -- concurrent restores or course moves cannot change that decision midway.
  SELECT c.organization_id
  INTO v_course_org_id
  FROM public.courses c
  WHERE c.id = v_course_id
  FOR UPDATE;

  IF NOT FOUND OR v_course_org_id IS NULL THEN
    RAISE EXCEPTION 'Snapshot not found or not accessible'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_access_course_snapshots(v_course_id, 'courses.write') THEN
    RAISE EXCEPTION 'Snapshot not found or not accessible'
      USING ERRCODE = '42501';
  END IF;

  IF v_snapshot_org_id IS DISTINCT FROM v_course_org_id THEN
    RAISE EXCEPTION 'Snapshot organization does not match course organization'
      USING ERRCODE = '23514';
  END IF;

  IF jsonb_typeof(v_payload) IS DISTINCT FROM 'object'
    OR NOT (v_payload ? 'course')
    OR jsonb_typeof(v_payload->'course') IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION 'Invalid course snapshot payload'
      USING ERRCODE = '22023';
  END IF;

  IF NULLIF(v_payload->'course'->>'id', '')::uuid IS DISTINCT FROM v_course_id
    OR NULLIF(v_payload->'course'->>'organization_id', '')::uuid
      IS DISTINCT FROM v_course_org_id
  THEN
    RAISE EXCEPTION 'Snapshot payload does not match target course tenant'
      USING ERRCODE = '23514';
  END IF;

  IF NOT (v_payload ? 'lessons')
    OR jsonb_typeof(v_payload->'lessons') IS DISTINCT FROM 'array'
    OR NOT (v_payload ? 'test_questions')
    OR jsonb_typeof(v_payload->'test_questions') IS DISTINCT FROM 'array'
    OR NOT (v_payload ? 'course_documents')
    OR jsonb_typeof(v_payload->'course_documents') IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'Invalid course snapshot collections'
      USING ERRCODE = '22023';
  END IF;

  v_has_module_snapshot := v_payload ? 'course_modules';
  IF v_has_module_snapshot
    AND jsonb_typeof(v_payload->'course_modules') IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'Invalid course module snapshot collection'
      USING ERRCODE = '22023';
  END IF;

  -- Validate every id and tenant relationship before the first mutation.
  IF v_has_module_snapshot THEN
    FOR module_rec IN SELECT * FROM jsonb_array_elements(v_payload->'course_modules') LOOP
      IF jsonb_typeof(module_rec) IS DISTINCT FROM 'object'
        OR NULLIF(module_rec->>'course_id', '')::uuid IS DISTINCT FROM v_course_id
      THEN
        RAISE EXCEPTION 'Snapshot module does not belong to target course'
          USING ERRCODE = '23514';
      END IF;

      v_module_id := NULLIF(module_rec->>'id', '')::uuid;
      IF v_module_id IS NULL THEN
        RAISE EXCEPTION 'Snapshot module id is missing'
          USING ERRCODE = '22023';
      END IF;
      IF v_module_id = ANY(v_snapshot_module_ids) THEN
        RAISE EXCEPTION 'Snapshot contains duplicate module ids'
          USING ERRCODE = '22023';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM public.course_modules cm
        WHERE cm.id = v_module_id
          AND cm.course_id <> v_course_id
      ) THEN
        RAISE EXCEPTION 'Snapshot module id belongs to another course'
          USING ERRCODE = '23514';
      END IF;
      v_snapshot_module_ids := array_append(v_snapshot_module_ids, v_module_id);
    END LOOP;
  END IF;

  FOR lesson_rec IN SELECT * FROM jsonb_array_elements(v_payload->'lessons') LOOP
    IF jsonb_typeof(lesson_rec) IS DISTINCT FROM 'object'
      OR NULLIF(lesson_rec->>'course_id', '')::uuid IS DISTINCT FROM v_course_id
    THEN
      RAISE EXCEPTION 'Snapshot lesson does not belong to target course'
        USING ERRCODE = '23514';
    END IF;

    v_lesson_id := NULLIF(lesson_rec->>'id', '')::uuid;
    IF v_lesson_id IS NULL THEN
      RAISE EXCEPTION 'Snapshot lesson id is missing'
        USING ERRCODE = '22023';
    END IF;
    IF v_lesson_id = ANY(v_snapshot_lesson_ids) THEN
      RAISE EXCEPTION 'Snapshot contains duplicate lesson ids'
        USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.lessons l
      WHERE l.id = v_lesson_id
        AND l.course_id <> v_course_id
    ) THEN
      RAISE EXCEPTION 'Snapshot lesson id belongs to another course'
        USING ERRCODE = '23514';
    END IF;

    v_module_id := NULLIF(lesson_rec->>'module_id', '')::uuid;
    IF v_module_id IS NOT NULL THEN
      IF v_has_module_snapshot THEN
        IF NOT (v_module_id = ANY(v_snapshot_module_ids)) THEN
          RAISE EXCEPTION 'Snapshot lesson references a module outside the snapshot'
            USING ERRCODE = '23514';
        END IF;
      ELSIF NOT EXISTS (
        SELECT 1
        FROM public.course_modules cm
        WHERE cm.id = v_module_id
          AND cm.course_id = v_course_id
      ) THEN
        RAISE EXCEPTION 'Legacy snapshot lesson module is no longer available'
          USING ERRCODE = '23514';
      END IF;
    END IF;

    v_snapshot_lesson_ids := array_append(v_snapshot_lesson_ids, v_lesson_id);
  END LOOP;

  FOR question_rec IN SELECT * FROM jsonb_array_elements(v_payload->'test_questions') LOOP
    IF jsonb_typeof(question_rec) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid snapshot test question'
        USING ERRCODE = '22023';
    END IF;

    v_question_id := NULLIF(question_rec->>'id', '')::uuid;
    v_lesson_id := NULLIF(question_rec->>'lesson_id', '')::uuid;
    IF v_question_id IS NULL OR v_lesson_id IS NULL THEN
      RAISE EXCEPTION 'Snapshot question id or lesson id is missing'
        USING ERRCODE = '22023';
    END IF;
    IF v_question_id = ANY(v_snapshot_question_ids) THEN
      RAISE EXCEPTION 'Snapshot contains duplicate question ids'
        USING ERRCODE = '22023';
    END IF;
    IF NOT (v_lesson_id = ANY(v_snapshot_lesson_ids)) THEN
      RAISE EXCEPTION 'Snapshot question references a lesson outside the snapshot'
        USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.test_questions tq
      JOIN public.lessons l ON l.id = tq.lesson_id
      WHERE tq.id = v_question_id
        AND l.course_id <> v_course_id
    ) THEN
      RAISE EXCEPTION 'Snapshot question id belongs to another course'
        USING ERRCODE = '23514';
    END IF;
    v_snapshot_question_ids := array_append(v_snapshot_question_ids, v_question_id);
  END LOOP;

  FOR doc_rec IN SELECT * FROM jsonb_array_elements(v_payload->'course_documents') LOOP
    IF jsonb_typeof(doc_rec) IS DISTINCT FROM 'object'
      OR NULLIF(doc_rec->>'course_id', '')::uuid IS DISTINCT FROM v_course_id
    THEN
      RAISE EXCEPTION 'Snapshot document does not belong to target course'
        USING ERRCODE = '23514';
    END IF;

    v_document_id := NULLIF(doc_rec->>'id', '')::uuid;
    IF v_document_id IS NULL THEN
      RAISE EXCEPTION 'Snapshot document id is missing'
        USING ERRCODE = '22023';
    END IF;
    IF v_document_id = ANY(v_snapshot_document_ids) THEN
      RAISE EXCEPTION 'Snapshot contains duplicate document ids'
        USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.course_documents d
      WHERE d.id = v_document_id
        AND d.course_id <> v_course_id
    ) THEN
      RAISE EXCEPTION 'Snapshot document id belongs to another course'
        USING ERRCODE = '23514';
    END IF;
    v_snapshot_document_ids := array_append(v_snapshot_document_ids, v_document_id);
  END LOOP;

  -- Lock every mutable child row in the same deterministic order used by the
  -- snapshot-creation RPC. The course row is already locked, so FK-backed
  -- inserts are blocked while these existing rows are stabilized.
  PERFORM cm.id
  FROM public.course_modules cm
  WHERE cm.course_id = v_course_id
  ORDER BY cm.id
  FOR UPDATE;

  -- Legacy snapshots did not contain course_modules. Repeat ownership after
  -- locking all current course modules; a module that moved away is rejected,
  -- and the locked course row prevents a foreign module moving into the course.
  IF NOT v_has_module_snapshot THEN
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_payload->'lessons') AS legacy_lesson
      WHERE NULLIF(legacy_lesson->>'module_id', '') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.course_modules cm
          WHERE cm.id = (legacy_lesson->>'module_id')::uuid
            AND cm.course_id = v_course_id
        )
    ) THEN
      RAISE EXCEPTION 'Legacy snapshot lesson module is no longer available'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_has_module_snapshot THEN
    SELECT COALESCE(array_agg(cm.id ORDER BY cm.id), ARRAY[]::uuid[])
    INTO v_extra_module_ids
    FROM public.course_modules cm
    WHERE cm.course_id = v_course_id
      AND NOT (cm.id = ANY(v_snapshot_module_ids));
  END IF;

  PERFORM l.id
  FROM public.lessons l
  WHERE l.course_id = v_course_id
  ORDER BY l.id
  FOR UPDATE;

  SELECT COALESCE(array_agg(l.id ORDER BY l.id), ARRAY[]::uuid[])
  INTO v_extra_lesson_ids
  FROM public.lessons l
  WHERE l.course_id = v_course_id
    AND NOT (l.id = ANY(v_snapshot_lesson_ids));

  PERFORM tq.id
  FROM public.test_questions tq
  JOIN public.lessons l ON l.id = tq.lesson_id
  WHERE l.course_id = v_course_id
  ORDER BY tq.id
  FOR UPDATE OF tq;

  PERFORM d.id
  FROM public.course_documents d
  WHERE d.course_id = v_course_id
  ORDER BY d.id
  FOR UPDATE;

  -- Removing a lesson with an FK cascade can erase learner progress, attempts,
  -- attachments, homework, tutor-session links or future dependent tables.
  -- Only test_questions are excluded because they are part of the snapshot and
  -- are reconciled explicitly below. Everything else makes restore fail closed.
  IF cardinality(v_extra_lesson_ids) > 0 THEN
    FOR dependency_rec IN
      SELECT ns.nspname AS schema_name,
             rel.relname AS table_name,
             src_att.attname AS column_name
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      JOIN LATERAL generate_subscripts(con.conkey, 1) key_pos(i) ON true
      JOIN pg_attribute src_att
        ON src_att.attrelid = con.conrelid
       AND src_att.attnum = con.conkey[key_pos.i]
      JOIN pg_attribute target_att
        ON target_att.attrelid = con.confrelid
       AND target_att.attnum = con.confkey[key_pos.i]
      WHERE con.contype = 'f'
        AND con.confrelid = 'public.lessons'::regclass
        AND target_att.attname = 'id'
        AND NOT (ns.nspname = 'public' AND rel.relname = 'test_questions')
    LOOP
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM %I.%I dep WHERE dep.%I = ANY ($1))',
        dependency_rec.schema_name,
        dependency_rec.table_name,
        dependency_rec.column_name
      )
      INTO v_dependency_found
      USING v_extra_lesson_ids;

      IF v_dependency_found THEN
        RAISE EXCEPTION 'Restore blocked: lessons have dependent data in %.%',
          dependency_rec.schema_name,
          dependency_rec.table_name
          USING ERRCODE = '23503';
      END IF;
    END LOOP;
  END IF;

  -- A removed module may have unlock schedules or per-user overrides. Lessons
  -- are excluded because safe extra lessons are removed explicitly later and
  -- snapshot lessons are reassigned before module deletion.
  IF v_has_module_snapshot AND cardinality(v_extra_module_ids) > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM public.lessons l
      WHERE l.module_id = ANY(v_extra_module_ids)
        AND l.course_id <> v_course_id
    ) THEN
      RAISE EXCEPTION 'Restore blocked: module is referenced by another course'
        USING ERRCODE = '23514';
    END IF;

    FOR dependency_rec IN
      SELECT ns.nspname AS schema_name,
             rel.relname AS table_name,
             src_att.attname AS column_name
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      JOIN LATERAL generate_subscripts(con.conkey, 1) key_pos(i) ON true
      JOIN pg_attribute src_att
        ON src_att.attrelid = con.conrelid
       AND src_att.attnum = con.conkey[key_pos.i]
      JOIN pg_attribute target_att
        ON target_att.attrelid = con.confrelid
       AND target_att.attnum = con.confkey[key_pos.i]
      WHERE con.contype = 'f'
        AND con.confrelid = 'public.course_modules'::regclass
        AND target_att.attname = 'id'
        AND NOT (ns.nspname = 'public' AND rel.relname = 'lessons')
    LOOP
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM %I.%I dep WHERE dep.%I = ANY ($1))',
        dependency_rec.schema_name,
        dependency_rec.table_name,
        dependency_rec.column_name
      )
      INTO v_dependency_found
      USING v_extra_module_ids;

      IF v_dependency_found THEN
        RAISE EXCEPTION 'Restore blocked: modules have dependent data in %.%',
          dependency_rec.schema_name,
          dependency_rec.table_name
          USING ERRCODE = '23503';
      END IF;
    END LOOP;
  END IF;

  -- Test attempts keep question ids in JSON rather than an FK. The live
  -- questions are locked above; fail closed if restore would delete or rewrite
  -- the question set used by any existing attempt.
  IF EXISTS (
    SELECT 1
    FROM public.test_attempts ta
    WHERE ta.lesson_id = ANY(v_snapshot_lesson_ids)
  ) AND (
    SELECT COALESCE(
      jsonb_agg(to_jsonb(tq) ORDER BY tq.lesson_id, tq.order_index, tq.id),
      '[]'::jsonb
    )
    FROM public.test_questions tq
    WHERE tq.lesson_id = ANY(v_snapshot_lesson_ids)
  ) IS DISTINCT FROM (
    SELECT COALESCE(
      jsonb_agg(
        snapshot_question.value
        ORDER BY
          (snapshot_question.value->>'lesson_id')::uuid,
          COALESCE((snapshot_question.value->>'order_index')::int, 0),
          (snapshot_question.value->>'id')::uuid
      ),
      '[]'::jsonb
    )
    FROM jsonb_array_elements(v_payload->'test_questions') AS snapshot_question(value)
  ) THEN
    RAISE EXCEPTION 'Restore blocked: test attempts depend on a different question version'
      USING ERRCODE = '23503';
  END IF;

  -- Save a rollback point only after all validation and dependency guards pass.
  INSERT INTO public.course_snapshots (
    course_id,
    organization_id,
    created_by,
    reason,
    label,
    payload
  )
  SELECT
    v_course_id,
    v_course_org_id,
    auth.uid(),
    'before_restore',
    'Перед восстановлением версии',
    jsonb_build_object(
      'course', (SELECT to_jsonb(c) FROM public.courses c WHERE c.id = v_course_id),
      'course_modules', COALESCE((
        SELECT jsonb_agg(to_jsonb(cm) ORDER BY cm.order_index, cm.id)
        FROM public.course_modules cm
        WHERE cm.course_id = v_course_id
      ), '[]'::jsonb),
      'lessons', COALESCE((
        SELECT jsonb_agg(to_jsonb(l) ORDER BY l.order_index, l.id)
        FROM public.lessons l
        WHERE l.course_id = v_course_id
      ), '[]'::jsonb),
      'test_questions', COALESCE((
        SELECT jsonb_agg(to_jsonb(tq) ORDER BY tq.lesson_id, tq.order_index, tq.id)
        FROM public.test_questions tq
        WHERE tq.lesson_id IN (
          SELECT id FROM public.lessons WHERE course_id = v_course_id
        )
      ), '[]'::jsonb),
      'course_documents', COALESCE((
        SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at, d.id)
        FROM public.course_documents d
        WHERE d.course_id = v_course_id
      ), '[]'::jsonb)
    );

  UPDATE public.courses
  SET
    title = COALESCE((v_payload->'course'->>'title')::text, title),
    description = v_payload->'course'->>'description',
    duration = v_payload->'course'->>'duration',
    updated_at = now()
  WHERE id = v_course_id
    AND organization_id = v_course_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target course changed during restore'
      USING ERRCODE = '40001';
  END IF;

  IF v_has_module_snapshot THEN
    FOR module_rec IN SELECT * FROM jsonb_array_elements(v_payload->'course_modules') LOOP
      v_module_id := (module_rec->>'id')::uuid;
      INSERT INTO public.course_modules AS existing_module (
        id, course_id, title, order_index, created_at, updated_at
      )
      VALUES (
        v_module_id,
        v_course_id,
        COALESCE(module_rec->>'title', 'Новый модуль'),
        COALESCE((module_rec->>'order_index')::int, 0),
        COALESCE(NULLIF(module_rec->>'created_at', '')::timestamptz, now()),
        now()
      )
      ON CONFLICT (id) DO UPDATE
      SET title = EXCLUDED.title,
          order_index = EXCLUDED.order_index,
          updated_at = now()
      WHERE existing_module.course_id = v_course_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Snapshot module id belongs to another course'
          USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END IF;

  -- Preserve snapshot lesson ids. Updating existing rows in place keeps every
  -- learner-owned FK row (progress, attempts, homework, attachments) attached.
  FOR lesson_rec IN SELECT * FROM jsonb_array_elements(v_payload->'lessons') LOOP
    v_lesson_id := (lesson_rec->>'id')::uuid;
    v_module_id := NULLIF(lesson_rec->>'module_id', '')::uuid;

    INSERT INTO public.lessons AS existing_lesson (
      id, course_id, title, type, content, order_index, module_id,
      ai_avatar_name, ai_avatar_image_url, ai_avatar_voice_id,
      ai_avatar_system_prompt, ai_avatar_greeting, ai_avatar_subject,
      ai_avatar_style, ai_avatar_session_minutes, ai_avatar_model,
      ai_avatar_allow_interruptions, ai_avatar_language,
      ai_avatar_llm_model, ai_avatar_llm_provider,
      ai_avatar_stt_model, ai_avatar_stt_provider,
      ai_avatar_tts_provider, ai_avatar_tts_voice,
      is_locked, test_max_attempts, test_passing_score,
      test_questions_count, test_questions_to_show, test_show_answers,
      created_at, updated_at
    )
    VALUES (
      v_lesson_id,
      v_course_id,
      lesson_rec->>'title',
      COALESCE(lesson_rec->>'type', 'text'),
      lesson_rec->>'content',
      COALESCE((lesson_rec->>'order_index')::int, 0),
      v_module_id,
      lesson_rec->>'ai_avatar_name',
      lesson_rec->>'ai_avatar_image_url',
      lesson_rec->>'ai_avatar_voice_id',
      lesson_rec->>'ai_avatar_system_prompt',
      lesson_rec->>'ai_avatar_greeting',
      lesson_rec->>'ai_avatar_subject',
      lesson_rec->>'ai_avatar_style',
      NULLIF(lesson_rec->>'ai_avatar_session_minutes', '')::int,
      lesson_rec->>'ai_avatar_model',
      NULLIF(lesson_rec->>'ai_avatar_allow_interruptions', '')::boolean,
      lesson_rec->>'ai_avatar_language',
      lesson_rec->>'ai_avatar_llm_model',
      lesson_rec->>'ai_avatar_llm_provider',
      lesson_rec->>'ai_avatar_stt_model',
      lesson_rec->>'ai_avatar_stt_provider',
      lesson_rec->>'ai_avatar_tts_provider',
      lesson_rec->>'ai_avatar_tts_voice',
      COALESCE((lesson_rec->>'is_locked')::boolean, false),
      NULLIF(lesson_rec->>'test_max_attempts', '')::int,
      COALESCE((lesson_rec->>'test_passing_score')::int, 60),
      NULLIF(lesson_rec->>'test_questions_count', '')::int,
      NULLIF(lesson_rec->>'test_questions_to_show', '')::int,
      COALESCE((lesson_rec->>'test_show_answers')::boolean, true),
      COALESCE(NULLIF(lesson_rec->>'created_at', '')::timestamptz, now()),
      now()
    )
    ON CONFLICT (id) DO UPDATE
    SET title = EXCLUDED.title,
        type = EXCLUDED.type,
        content = EXCLUDED.content,
        order_index = EXCLUDED.order_index,
        module_id = EXCLUDED.module_id,
        ai_avatar_name = EXCLUDED.ai_avatar_name,
        ai_avatar_image_url = EXCLUDED.ai_avatar_image_url,
        ai_avatar_voice_id = EXCLUDED.ai_avatar_voice_id,
        ai_avatar_system_prompt = EXCLUDED.ai_avatar_system_prompt,
        ai_avatar_greeting = EXCLUDED.ai_avatar_greeting,
        ai_avatar_subject = EXCLUDED.ai_avatar_subject,
        ai_avatar_style = EXCLUDED.ai_avatar_style,
        ai_avatar_session_minutes = EXCLUDED.ai_avatar_session_minutes,
        ai_avatar_model = EXCLUDED.ai_avatar_model,
        ai_avatar_allow_interruptions = EXCLUDED.ai_avatar_allow_interruptions,
        ai_avatar_language = EXCLUDED.ai_avatar_language,
        ai_avatar_llm_model = EXCLUDED.ai_avatar_llm_model,
        ai_avatar_llm_provider = EXCLUDED.ai_avatar_llm_provider,
        ai_avatar_stt_model = EXCLUDED.ai_avatar_stt_model,
        ai_avatar_stt_provider = EXCLUDED.ai_avatar_stt_provider,
        ai_avatar_tts_provider = EXCLUDED.ai_avatar_tts_provider,
        ai_avatar_tts_voice = EXCLUDED.ai_avatar_tts_voice,
        is_locked = EXCLUDED.is_locked,
        test_max_attempts = EXCLUDED.test_max_attempts,
        test_passing_score = EXCLUDED.test_passing_score,
        test_questions_count = EXCLUDED.test_questions_count,
        test_questions_to_show = EXCLUDED.test_questions_to_show,
        test_show_answers = EXCLUDED.test_show_answers,
        updated_at = now()
    WHERE existing_lesson.course_id = v_course_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Snapshot lesson id belongs to another course'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  DELETE FROM public.test_questions tq
  WHERE tq.lesson_id = ANY(v_snapshot_lesson_ids)
    AND NOT (tq.id = ANY(v_snapshot_question_ids));

  FOR question_rec IN SELECT * FROM jsonb_array_elements(v_payload->'test_questions') LOOP
    v_question_id := (question_rec->>'id')::uuid;
    v_lesson_id := (question_rec->>'lesson_id')::uuid;

    INSERT INTO public.test_questions AS existing_question (
      id, lesson_id, question, options, correct_answer, order_index,
      explanation, image_url, is_bank_question
    )
    VALUES (
      v_question_id,
      v_lesson_id,
      question_rec->>'question',
      COALESCE(question_rec->'options', '[]'::jsonb),
      NULLIF(question_rec->>'correct_answer', '')::int,
      COALESCE((question_rec->>'order_index')::int, 0),
      question_rec->>'explanation',
      question_rec->>'image_url',
      COALESCE((question_rec->>'is_bank_question')::boolean, false)
    )
    ON CONFLICT (id) DO UPDATE
    SET lesson_id = EXCLUDED.lesson_id,
        question = EXCLUDED.question,
        options = EXCLUDED.options,
        correct_answer = EXCLUDED.correct_answer,
        order_index = EXCLUDED.order_index,
        explanation = EXCLUDED.explanation,
        image_url = EXCLUDED.image_url,
        is_bank_question = EXCLUDED.is_bank_question
    WHERE EXISTS (
      SELECT 1
      FROM public.lessons existing_owner
      WHERE existing_owner.id = existing_question.lesson_id
        AND existing_owner.course_id = v_course_id
    );

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Snapshot question id belongs to another course'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  FOR doc_rec IN SELECT * FROM jsonb_array_elements(v_payload->'course_documents') LOOP
    v_document_id := (doc_rec->>'id')::uuid;
    INSERT INTO public.course_documents AS existing_document (
      id, course_id, name, type, description, file_url, created_at, updated_at
    )
    VALUES (
      v_document_id,
      v_course_id,
      doc_rec->>'name',
      COALESCE(doc_rec->>'type', 'material'),
      doc_rec->>'description',
      doc_rec->>'file_url',
      COALESCE(NULLIF(doc_rec->>'created_at', '')::timestamptz, now()),
      now()
    )
    ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        type = EXCLUDED.type,
        description = EXCLUDED.description,
        file_url = EXCLUDED.file_url,
        updated_at = now()
    WHERE existing_document.course_id = v_course_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Snapshot document id belongs to another course'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  DELETE FROM public.course_documents d
  WHERE d.course_id = v_course_id
    AND NOT (d.id = ANY(v_snapshot_document_ids));

  -- Delete only genuinely extra lessons and only after the generic FK guard
  -- proved that the delete cannot cascade or null out learner-owned data.
  DELETE FROM public.lessons l
  WHERE l.id = ANY(v_extra_lesson_ids)
    AND l.course_id = v_course_id;

  IF v_has_module_snapshot THEN
    DELETE FROM public.course_modules cm
    WHERE cm.id = ANY(v_extra_module_ids)
      AND cm.course_id = v_course_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'course_id', v_course_id,
    'restored_modules', cardinality(v_snapshot_module_ids),
    'restored_lessons', cardinality(v_snapshot_lesson_ids),
    'restored_questions', cardinality(v_snapshot_question_ids),
    'removed_lessons', cardinality(v_extra_lesson_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.restore_course_snapshot(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_course_snapshot(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.restore_course_snapshot(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.restore_course_snapshot(uuid) IS
  'Restores an authorized, tenant-matched course snapshot while preserving lesson ids and dependent learner data.';
