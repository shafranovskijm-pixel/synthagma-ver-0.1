-- Homework answers are learner-owned private files, never course-authoring assets.
BEGIN;
INSERT INTO storage.buckets(id,name,public,file_size_limit)
VALUES ('homework-files','homework-files',false,20971520)
ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='homework-files' AND NOT public AND file_size_limit=20971520)
 THEN RAISE EXCEPTION 'HOMEWORK_BUCKET_CONFIGURATION_MISMATCH'; END IF;
END $$;

CREATE FUNCTION public.can_upload_homework_file(p_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT auth.uid() IS NOT NULL AND public.account_deletion_access_allowed()
 AND p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9]{1,19}/[0-9a-f-]{36}$'
 AND split_part(p_name,'/',1)=auth.uid()::text
 AND EXISTS (
  SELECT 1 FROM public.lessons l JOIN public.courses c ON c.id=l.course_id
  JOIN public.enrollments e ON e.course_id=c.id AND e.user_id=auth.uid()
  WHERE c.id=public.storage_try_uuid(split_part(p_name,'/',2))
   AND l.id=public.storage_try_uuid(split_part(p_name,'/',3)) AND l.type='homework'
   AND e.learning_progress_epoch::text=split_part(p_name,'/',4)
   AND e.status IS DISTINCT FROM 'cancelled'
   AND c.id NOT IN ('7630559a-6caf-42e7-97f9-1cd0e4598c39'::uuid,'7e5bc4e6-0629-4186-9745-a821cbe7255a'::uuid)
   AND public.can_access_course_as_learner(c.id)
   AND public.storage_try_uuid(split_part(p_name,'/',5)) IS NOT NULL
 );
$$;
CREATE FUNCTION public.can_read_homework_file(p_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT auth.uid() IS NOT NULL AND public.account_deletion_access_allowed()
 AND p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9]{1,19}/[0-9a-f-]{36}$'
 AND (
  (split_part(p_name,'/',1)=auth.uid()::text
   AND public.can_access_course_as_learner(public.storage_try_uuid(split_part(p_name,'/',2))))
  OR EXISTS (
   SELECT 1 FROM public.homework_submissions h
   WHERE h.student_id=public.storage_try_uuid(split_part(p_name,'/',1))
    AND h.course_id=public.storage_try_uuid(split_part(p_name,'/',2))
    AND h.lesson_id=public.storage_try_uuid(split_part(p_name,'/',3))
    AND h.learning_progress_epoch::text=split_part(p_name,'/',4)
    AND h.attachments @> jsonb_build_array(jsonb_build_object('bucket','homework-files','path',p_name))
    AND (h.student_id=auth.uid() OR public.can_access_course(h.course_id,'homework.read'))
    AND public.csz_homework_select_allowed(h.student_id,h.course_id,h.lesson_id,h.organization_id)
  )
 );
$$;
REVOKE ALL ON FUNCTION public.can_upload_homework_file(text),public.can_read_homework_file(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_upload_homework_file(text),public.can_read_homework_file(text) TO authenticated,anon;

CREATE POLICY homework_files_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='homework-files' AND public.can_upload_homework_file(name)
  AND coalesce(owner_id,owner::text)=auth.uid()::text);
CREATE POLICY homework_files_read ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='homework-files' AND public.can_read_homework_file(name));
-- Restrictive fences prevent unrelated broad bucket policies from granting access.
CREATE POLICY homework_files_insert_fence ON storage.objects AS RESTRICTIVE FOR INSERT TO public
 WITH CHECK(bucket_id<>'homework-files' OR (public.can_upload_homework_file(name)
  AND coalesce(owner_id,owner::text)=auth.uid()::text));
CREATE POLICY homework_files_read_fence ON storage.objects AS RESTRICTIVE FOR SELECT TO public
 USING(bucket_id<>'homework-files' OR public.can_read_homework_file(name));
CREATE POLICY homework_files_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO public
 USING(bucket_id<>'homework-files') WITH CHECK(bucket_id<>'homework-files');
CREATE POLICY homework_files_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO public
 USING(bucket_id<>'homework-files');

CREATE FUNCTION public.guard_homework_file_references() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a jsonb; v_path text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.attachments IS NOT DISTINCT FROM OLD.attachments THEN RETURN NEW; END IF;
 IF jsonb_typeof(NEW.attachments) IS DISTINCT FROM 'array' THEN RETURN NEW; END IF;
 FOR a IN SELECT value FROM jsonb_array_elements(NEW.attachments) LOOP
  IF a->>'bucket'='homework-files' OR starts_with(coalesce(a->>'url',''),'homework-file:') THEN
   v_path:=a->>'path';
   IF a->>'bucket' IS DISTINCT FROM 'homework-files' OR v_path IS NULL
    OR a->>'url' IS DISTINCT FROM 'homework-file:'||v_path
    OR split_part(v_path,'/',1) IS DISTINCT FROM NEW.student_id::text
    OR split_part(v_path,'/',2) IS DISTINCT FROM NEW.course_id::text
    OR split_part(v_path,'/',3) IS DISTINCT FROM NEW.lesson_id::text
    OR split_part(v_path,'/',4) IS DISTINCT FROM NEW.learning_progress_epoch::text
    OR NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='homework-files' AND o.name=v_path
       AND coalesce(o.owner_id,o.owner::text)=NEW.student_id::text)
   THEN RAISE EXCEPTION 'HOMEWORK_FILE_REFERENCE_INVALID' USING ERRCODE='42501'; END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_homework_file_references() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER homework_file_reference_guard BEFORE INSERT OR UPDATE OF attachments
 ON public.homework_submissions FOR EACH ROW EXECUTE FUNCTION public.guard_homework_file_references();
COMMIT;
