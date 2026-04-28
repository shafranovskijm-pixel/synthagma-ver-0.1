
CREATE TABLE public.course_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  created_by UUID,
  reason TEXT NOT NULL DEFAULT 'manual',
  label TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_course_snapshots_course ON public.course_snapshots(course_id, created_at DESC);
CREATE INDEX idx_course_snapshots_org ON public.course_snapshots(organization_id, created_at DESC);

ALTER TABLE public.course_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Course snapshots viewable by org staff and admins"
ON public.course_snapshots
FOR SELECT
TO authenticated
USING (
  public.has_admin_staff_role(auth.uid(), 'admin'::text)
  OR public.has_admin_staff_role(auth.uid(), 'super_admin'::text)
  OR public.has_org_staff_permission(auth.uid(), organization_id, 'courses.view'::text)
  OR public.has_org_staff_permission(auth.uid(), organization_id, 'courses.manage'::text)
);

CREATE POLICY "Course snapshots inserted by org managers and admins"
ON public.course_snapshots
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_admin_staff_role(auth.uid(), 'admin'::text)
  OR public.has_admin_staff_role(auth.uid(), 'super_admin'::text)
  OR public.has_org_staff_permission(auth.uid(), organization_id, 'courses.manage'::text)
);

CREATE POLICY "Course snapshots deletable by org managers and admins"
ON public.course_snapshots
FOR DELETE
TO authenticated
USING (
  public.has_admin_staff_role(auth.uid(), 'admin'::text)
  OR public.has_admin_staff_role(auth.uid(), 'super_admin'::text)
  OR public.has_org_staff_permission(auth.uid(), organization_id, 'courses.manage'::text)
);

CREATE OR REPLACE FUNCTION public.restore_course_snapshot(_snapshot_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  snap RECORD;
  v_course_id UUID;
  v_org_id UUID;
  v_payload JSONB;
  lesson_rec JSONB;
  question_rec JSONB;
  doc_rec JSONB;
  new_lesson_id UUID;
  old_lesson_id UUID;
  id_map JSONB := '{}'::jsonb;
BEGIN
  SELECT * INTO snap FROM public.course_snapshots WHERE id = _snapshot_id;
  IF snap IS NULL THEN
    RAISE EXCEPTION 'Snapshot not found';
  END IF;

  v_course_id := snap.course_id;
  v_org_id := snap.organization_id;
  v_payload := snap.payload;

  IF NOT (
    public.has_admin_staff_role(auth.uid(), 'admin'::text)
    OR public.has_admin_staff_role(auth.uid(), 'super_admin'::text)
    OR public.has_org_staff_permission(auth.uid(), v_org_id, 'courses.manage'::text)
  ) THEN
    RAISE EXCEPTION 'Insufficient permissions to restore course';
  END IF;

  INSERT INTO public.course_snapshots (course_id, organization_id, created_by, reason, label, payload)
  SELECT
    v_course_id,
    v_org_id,
    auth.uid(),
    'before_restore',
    'Перед восстановлением версии',
    jsonb_build_object(
      'course', (SELECT to_jsonb(c) FROM public.courses c WHERE c.id = v_course_id),
      'lessons', COALESCE((SELECT jsonb_agg(to_jsonb(l)) FROM public.lessons l WHERE l.course_id = v_course_id), '[]'::jsonb),
      'test_questions', COALESCE((
        SELECT jsonb_agg(to_jsonb(tq))
        FROM public.test_questions tq
        WHERE tq.lesson_id IN (SELECT id FROM public.lessons WHERE course_id = v_course_id)
      ), '[]'::jsonb),
      'course_documents', COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM public.course_documents d WHERE d.course_id = v_course_id), '[]'::jsonb)
    );

  IF v_payload ? 'course' THEN
    UPDATE public.courses
    SET
      title = COALESCE((v_payload->'course'->>'title')::text, title),
      description = (v_payload->'course'->>'description'),
      duration = (v_payload->'course'->>'duration'),
      updated_at = now()
    WHERE id = v_course_id;
  END IF;

  DELETE FROM public.test_questions
  WHERE lesson_id IN (SELECT id FROM public.lessons WHERE course_id = v_course_id);
  DELETE FROM public.lessons WHERE course_id = v_course_id;
  DELETE FROM public.course_documents WHERE course_id = v_course_id;

  IF v_payload ? 'lessons' THEN
    FOR lesson_rec IN SELECT * FROM jsonb_array_elements(v_payload->'lessons') LOOP
      old_lesson_id := (lesson_rec->>'id')::uuid;
      new_lesson_id := gen_random_uuid();
      id_map := id_map || jsonb_build_object(old_lesson_id::text, new_lesson_id::text);

      INSERT INTO public.lessons (
        id, course_id, title, type, content, order_index, module_id,
        ai_avatar_name, ai_avatar_image_url, ai_avatar_voice_id,
        ai_avatar_system_prompt, ai_avatar_greeting, ai_avatar_subject,
        ai_avatar_style, ai_avatar_session_minutes, ai_avatar_model,
        is_locked, locked_until, created_at, updated_at
      )
      VALUES (
        new_lesson_id,
        v_course_id,
        lesson_rec->>'title',
        lesson_rec->>'type',
        lesson_rec->>'content',
        COALESCE((lesson_rec->>'order_index')::int, 0),
        NULLIF(lesson_rec->>'module_id','')::uuid,
        lesson_rec->>'ai_avatar_name',
        lesson_rec->>'ai_avatar_image_url',
        lesson_rec->>'ai_avatar_voice_id',
        lesson_rec->>'ai_avatar_system_prompt',
        lesson_rec->>'ai_avatar_greeting',
        lesson_rec->>'ai_avatar_subject',
        lesson_rec->>'ai_avatar_style',
        NULLIF(lesson_rec->>'ai_avatar_session_minutes','')::int,
        lesson_rec->>'ai_avatar_model',
        COALESCE((lesson_rec->>'is_locked')::boolean, false),
        NULLIF(lesson_rec->>'locked_until','')::timestamptz,
        now(),
        now()
      );
    END LOOP;
  END IF;

  IF v_payload ? 'test_questions' THEN
    FOR question_rec IN SELECT * FROM jsonb_array_elements(v_payload->'test_questions') LOOP
      old_lesson_id := (question_rec->>'lesson_id')::uuid;
      new_lesson_id := (id_map->>old_lesson_id::text)::uuid;
      IF new_lesson_id IS NULL THEN CONTINUE; END IF;

      INSERT INTO public.test_questions (lesson_id, question, options, correct_answer, order_index, explanation, image_url, is_bank_question)
      VALUES (
        new_lesson_id,
        question_rec->>'question',
        COALESCE(question_rec->'options', '[]'::jsonb),
        COALESCE((question_rec->>'correct_answer')::int, 0),
        COALESCE((question_rec->>'order_index')::int, 0),
        question_rec->>'explanation',
        question_rec->>'image_url',
        COALESCE((question_rec->>'is_bank_question')::boolean, false)
      );
    END LOOP;
  END IF;

  IF v_payload ? 'course_documents' THEN
    FOR doc_rec IN SELECT * FROM jsonb_array_elements(v_payload->'course_documents') LOOP
      BEGIN
        INSERT INTO public.course_documents (course_id, title, file_url, file_type, file_size, created_at)
        VALUES (
          v_course_id,
          doc_rec->>'title',
          doc_rec->>'file_url',
          doc_rec->>'file_type',
          NULLIF(doc_rec->>'file_size','')::bigint,
          now()
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'course_id', v_course_id,
    'restored_lessons', COALESCE(jsonb_array_length(v_payload->'lessons'),0),
    'restored_questions', COALESCE(jsonb_array_length(v_payload->'test_questions'),0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_course_snapshot(UUID) TO authenticated;
