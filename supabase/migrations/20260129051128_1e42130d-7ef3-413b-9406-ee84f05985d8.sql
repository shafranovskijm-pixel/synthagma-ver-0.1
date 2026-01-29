-- Tighten public access to organizations (branded login)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizations'
      AND policyname = 'Anyone can view organizations by login_slug for branded login'
  ) THEN
    EXECUTE 'DROP POLICY "Anyone can view organizations by login_slug for branded login" ON public.organizations';
  END IF;
END $$;

-- Provide a safe, public RPC for branded login page that returns only non-sensitive fields
CREATE OR REPLACE FUNCTION public.public_get_organization_by_slug(p_slug text)
RETURNS TABLE (
  id uuid,
  name text,
  website_url text,
  login_branding jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name, o.website_url, o.login_branding
  FROM public.organizations o
  WHERE o.login_slug = p_slug
    AND o.login_slug IS NOT NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.public_get_organization_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_organization_by_slug(text) TO anon, authenticated;


-- Prevent students from bypassing the secure test_questions_for_students view
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'test_questions'
      AND policyname = 'Test questions viewable with course access'
  ) THEN
    EXECUTE 'DROP POLICY "Test questions viewable with course access" ON public.test_questions';
  END IF;
END $$;

CREATE POLICY "Org users can view test questions"
ON public.test_questions
FOR SELECT
TO authenticated
USING (
  has_role('organization'::app_role, auth.uid())
  OR has_role('admin'::app_role, auth.uid())
);
