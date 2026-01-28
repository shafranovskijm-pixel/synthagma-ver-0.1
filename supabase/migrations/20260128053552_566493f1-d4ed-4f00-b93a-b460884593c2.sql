-- Fix Security Definer Views - Convert to Security Invoker
-- This addresses the SUPA_security_definer_view security finding

-- Drop and recreate profiles_safe view with SECURITY INVOKER
DROP VIEW IF EXISTS public.profiles_safe;

CREATE VIEW public.profiles_safe 
WITH (security_invoker = true)
AS 
SELECT 
  id,
  user_id,
  full_name,
  organization_id,
  company_id,
  avatar_url,
  created_at,
  updated_at,
  last_visit_at
FROM profiles;

-- Grant access to the view
GRANT SELECT ON public.profiles_safe TO authenticated;
GRANT SELECT ON public.profiles_safe TO anon;

-- Drop and recreate test_questions_for_students view with SECURITY INVOKER
DROP VIEW IF EXISTS public.test_questions_for_students;

CREATE VIEW public.test_questions_for_students 
WITH (security_invoker = true)
AS 
SELECT 
  tq.id,
  tq.lesson_id,
  tq.question,
  tq.options,
  tq.order_index,
  tq.explanation,
  tq.is_bank_question,
  -- Only show correct_answer to organization admins, not students
  CASE
    WHEN (has_role('organization'::app_role, auth.uid()) OR has_role('admin'::app_role, auth.uid())) 
    THEN tq.correct_answer
    ELSE NULL::integer
  END AS correct_answer
FROM test_questions tq
WHERE (
  EXISTS (
    SELECT 1
    FROM lessons l
    JOIN courses c ON c.id = l.course_id
    WHERE l.id = tq.lesson_id 
    AND (c.is_published = true OR c.organization_id = current_organization_id())
  )
);

-- Grant access to the view
GRANT SELECT ON public.test_questions_for_students TO authenticated;
GRANT SELECT ON public.test_questions_for_students TO anon;

-- Add comment explaining the security model
COMMENT ON VIEW public.test_questions_for_students IS 'View that hides correct_answer from students. Uses SECURITY INVOKER with inline role check to mask the correct_answer field for non-admin users.';
COMMENT ON VIEW public.profiles_safe IS 'Safe view of profiles that excludes sensitive fields like login and generated_password. Uses SECURITY INVOKER to respect RLS policies.';