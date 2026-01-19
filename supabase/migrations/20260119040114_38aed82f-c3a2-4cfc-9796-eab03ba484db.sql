-- ============================================
-- SECURITY FIX: Remove dangerous public access policies
-- ============================================

-- 1. DROP the dangerous public profile policy that exposes passwords
DROP POLICY IF EXISTS "Allow login lookup by login field" ON public.profiles;

-- 2. DROP the dangerous public registration_links policy
DROP POLICY IF EXISTS "Public can view valid links" ON public.registration_links;

-- 3. Create a secure RPC for login lookup (unauthenticated, minimal data)
CREATE OR REPLACE FUNCTION public.public_lookup_user_by_login(login_input TEXT)
RETURNS TABLE(user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only return user_id, nothing else (no passwords, no PII)
  RETURN QUERY
  SELECT p.user_id
  FROM profiles p
  WHERE p.login = login_input
  LIMIT 1;
END;
$$;

-- Grant execute to anon for login flow
GRANT EXECUTE ON FUNCTION public.public_lookup_user_by_login(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.public_lookup_user_by_login(TEXT) TO authenticated;

-- 4. Fix registration_links: Create secure RPC for public link validation
CREATE OR REPLACE FUNCTION public.public_validate_registration_link(token_input TEXT)
RETURNS TABLE(
  organization_id UUID,
  company_id UUID,
  course_id UUID,
  name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only return non-sensitive data for valid links
  RETURN QUERY
  SELECT 
    rl.organization_id,
    rl.company_id,
    rl.course_id,
    rl.name
  FROM registration_links rl
  WHERE rl.token = token_input
    AND (rl.expires_at IS NULL OR rl.expires_at > now())
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_validate_registration_link(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.public_validate_registration_link(TEXT) TO authenticated;

-- 5. Fix test_questions: Create a secure view that hides correct_answer for students
CREATE OR REPLACE VIEW public.test_questions_for_students AS
SELECT 
  tq.id,
  tq.lesson_id,
  tq.question,
  tq.options,
  tq.order_index,
  tq.explanation,
  tq.is_bank_question,
  -- Hide correct_answer from students (only visible to org users)
  CASE 
    WHEN has_role('organization'::app_role, auth.uid()) 
      OR has_role('admin'::app_role, auth.uid())
    THEN tq.correct_answer
    ELSE NULL
  END as correct_answer
FROM test_questions tq
WHERE EXISTS (
  SELECT 1
  FROM lessons l
  JOIN courses c ON c.id = l.course_id
  WHERE l.id = tq.lesson_id
    AND (
      c.is_published = true 
      OR c.organization_id = current_organization_id()
    )
);

-- Grant access to the secure view
GRANT SELECT ON public.test_questions_for_students TO authenticated;

-- 6. Make sensitive storage buckets private
UPDATE storage.buckets SET public = false 
WHERE id IN (
  'student-documents',
  'org-documents', 
  'course-files',
  'library-files',
  'program-files'
);

-- Keep intentionally public buckets (branding/avatars)
UPDATE storage.buckets SET public = true
WHERE id IN ('org-branding', 'avatars');