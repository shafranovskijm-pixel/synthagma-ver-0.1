-- 1. lesson_attachments: заменить permissive SELECT на строго ограниченный
DROP POLICY IF EXISTS "Authenticated users can read lesson attachments" ON public.lesson_attachments;

CREATE OR REPLACE FUNCTION public.can_read_lesson_attachment(_lesson_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.has_role('admin'::public.app_role, auth.uid())
    OR public.can_access_lesson(_lesson_id, 'courses.read')
    OR EXISTS (
      SELECT 1
      FROM public.lessons l
      JOIN public.courses c ON c.id = l.course_id
      WHERE l.id = _lesson_id
        AND (
          -- зачисление напрямую
          EXISTS (
            SELECT 1 FROM public.enrollments e
            WHERE e.user_id = auth.uid()
              AND e.course_id = c.id
              AND e.status IN ('active', 'completed')
              AND (e.expires_at IS NULL OR e.expires_at > now())
          )
          -- назначение через учебную группу
          OR EXISTS (
            SELECT 1
            FROM public.profiles pr
            JOIN public.student_groups sg ON sg.id = pr.student_group_id
            WHERE pr.user_id = auth.uid()
              AND sg.course_id = c.id
          )
          -- сотрудники/владелец организации покрыты can_access_lesson выше
        )
    )
  )
$$;

CREATE POLICY "Lesson attachments readable by course participants"
ON public.lesson_attachments
FOR SELECT
TO authenticated
USING (public.can_read_lesson_attachment(lesson_id));

-- 2. presentations / presentation-files: убрать неограниченные политики
DROP POLICY IF EXISTS "Authenticated users can delete presentation files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update presentation files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload presentation files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload presentations" ON storage.objects;
DROP POLICY IF EXISTS "Organizations can delete presentations" ON storage.objects;
DROP POLICY IF EXISTS "Organizations can update presentations" ON storage.objects;
DROP POLICY IF EXISTS "Presentation files list authenticated" ON storage.objects;

CREATE POLICY "presentation_tenant_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id IN ('presentations', 'presentation-files')
  AND public.can_read_course_file_object(name)
);

CREATE POLICY "presentation_tenant_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN ('presentations', 'presentation-files')
  AND public.can_manage_course_file_object(name)
);

CREATE POLICY "presentation_tenant_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id IN ('presentations', 'presentation-files')
  AND public.can_manage_course_file_object(name)
)
WITH CHECK (
  bucket_id IN ('presentations', 'presentation-files')
  AND public.can_manage_course_file_object(name)
);

CREATE POLICY "presentation_tenant_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id IN ('presentations', 'presentation-files')
  AND public.can_manage_course_file_object(name)
);