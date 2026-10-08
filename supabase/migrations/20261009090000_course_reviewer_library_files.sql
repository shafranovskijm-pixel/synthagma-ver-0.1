-- Extend only the existing private Storage SELECT guard. Reviewer grants do
-- not become enrollments or table/staff permissions, and no bucket is public.
-- CREATE OR REPLACE preserves the existing function owner and EXECUTE grants.
CREATE OR REPLACE FUNCTION public.can_read_library_file_object(_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH path_parts AS (
    SELECT
      (storage.foldername(_object_name))[1] AS root_name,
      public.storage_try_uuid((storage.foldername(_object_name))[2]) AS organization_id
  )
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM path_parts p
    WHERE p.root_name = 'library'
      AND p.organization_id IS NOT NULL
      AND (
        EXISTS (
          SELECT 1
          FROM public.library_documents ld
          WHERE ld.organization_id = p.organization_id
            AND ld.storage_path = _object_name
            AND (
              public.can_read_electronic_library_document(ld.id)
              OR (
                ld.library_status = 'active'
                -- Paid content keeps its existing paid-document entitlement;
                -- an inspection grant cannot substitute for that entitlement.
                AND NOT EXISTS (
                  SELECT 1 FROM public.paid_umk_20260922_assets paid_asset
                  WHERE paid_asset.library_document_id = ld.id
                )
                AND EXISTS (
                  SELECT 1
                  FROM public.course_documents cd
                  JOIN public.courses c ON c.id = cd.course_id
                    AND c.organization_id = ld.organization_id
                  WHERE cd.library_document_id = ld.id
                    AND cd.visible_to_students
                    AND COALESCE(
                      c.landing_content @> '{"electronic_library":{"enabled":true}}'::jsonb,
                      false
                    )
                    -- Exact authenticated user/course, unrevoked and unexpired
                    -- grant, and still a draft; rechecked for each signing request.
                    AND public.can_review_course(cd.course_id)
                )
              )
            )
        )
        OR (
          NOT EXISTS (
            SELECT 1
            FROM public.library_documents linked_document
            WHERE linked_document.organization_id = p.organization_id
              AND linked_document.storage_path = _object_name
          )
          AND public.can_access_organization(p.organization_id, 'library.write')
        )
      )
  )
$function$;

COMMENT ON FUNCTION public.can_read_library_file_object(text) IS
  'Private library-files SELECT guard: existing staff/learner access or an active visible file in an exact current draft-course review grant. Signed URLs expire after the existing frontend TTL.';
