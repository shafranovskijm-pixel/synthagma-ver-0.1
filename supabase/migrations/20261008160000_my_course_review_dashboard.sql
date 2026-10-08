-- Read-only reviewer entry. No enrollment, progress, history or answer-key access.
CREATE OR REPLACE FUNCTION public.get_my_course_reviews()
RETURNS TABLE(course_id uuid, title text, duration text, grant_expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT c.id, c.title, c.duration, g.expires_at
  FROM public.course_review_grants g
  JOIN public.courses c ON c.id = g.course_id
  JOIN public.profiles p ON p.user_id = auth.uid()
  WHERE auth.uid() IS NOT NULL
    AND g.user_id = auth.uid()
    AND p.organization_id = c.organization_id
    AND g.revoked_at IS NULL
    AND g.expires_at > now()
    AND c.is_published = false
    AND public.can_review_course(c.id)
  ORDER BY c.title, c.id;
$function$;

REVOKE ALL ON FUNCTION public.get_my_course_reviews() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_course_reviews() TO authenticated;
COMMENT ON FUNCTION public.get_my_course_reviews() IS
  'Own active draft-course review grants only; safe card fields, no student records or answer keys.';
