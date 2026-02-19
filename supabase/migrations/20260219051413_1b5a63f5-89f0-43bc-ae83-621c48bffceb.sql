
-- 1. Add 'company' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'company';

-- 2. Extend companies table
ALTER TABLE public.companies 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS login_email TEXT,
  ADD COLUMN IF NOT EXISTS generated_password TEXT;

-- 3. Trigger to encrypt company password
CREATE TRIGGER trigger_encrypt_company_password
  BEFORE INSERT OR UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_encrypt_profile_password();

-- 4. current_company_id() function
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT c.id FROM public.companies c
    WHERE c.user_id = auth.uid()
    LIMIT 1
  );
END;
$$;

-- 5. get_decrypted_company_credentials function
CREATE OR REPLACE FUNCTION public.get_decrypted_company_credentials(p_company_id uuid)
RETURNS TABLE(login_email text, login_password text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin can decrypt any
  IF has_role('admin'::app_role, auth.uid()) THEN
    RETURN QUERY 
    SELECT c.login_email, decrypt_password(c.generated_password) as login_password
    FROM companies c WHERE c.id = p_company_id;
    RETURN;
  END IF;
  
  -- Organization can decrypt for their companies
  IF has_role('organization'::app_role, auth.uid()) THEN
    RETURN QUERY 
    SELECT c.login_email, decrypt_password(c.generated_password) as login_password
    FROM companies c WHERE c.id = p_company_id AND c.organization_id = current_organization_id();
    RETURN;
  END IF;
  
  -- Company can see own credentials
  IF has_role('company'::app_role, auth.uid()) AND current_company_id() = p_company_id THEN
    RETURN QUERY 
    SELECT c.login_email, decrypt_password(c.generated_password) as login_password
    FROM companies c WHERE c.id = p_company_id;
    RETURN;
  END IF;
  
  RETURN;
END;
$$;

-- 6. RLS policies for company role

-- profiles: company can view employees
CREATE POLICY "Companies can view their employees"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  company_id IS NOT NULL 
  AND company_id = public.current_company_id()
);

-- enrollments: company can view employee enrollments  
CREATE POLICY "Companies can view employee enrollments"
ON public.enrollments
FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT p.user_id FROM public.profiles p 
    WHERE p.company_id = public.current_company_id()
  )
);

-- courses: company can view courses of their org
CREATE POLICY "Companies can view org courses"
ON public.courses
FOR SELECT
TO authenticated
USING (
  organization_id = (
    SELECT c.organization_id FROM public.companies c 
    WHERE c.id = public.current_company_id()
  )
);

-- companies: company can view and update own record
CREATE POLICY "Companies can view own record"
ON public.companies
FOR SELECT
TO authenticated
USING (id = public.current_company_id());

CREATE POLICY "Companies can update own record"
ON public.companies
FOR UPDATE
TO authenticated
USING (id = public.current_company_id());

-- company_documents: company can view own documents
CREATE POLICY "Companies can view own documents"
ON public.company_documents
FOR SELECT
TO authenticated
USING (company_id = public.current_company_id());

-- lesson_progress: company can view employee lesson progress
CREATE POLICY "Companies can view employee lesson progress"
ON public.lesson_progress
FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT p.user_id FROM public.profiles p 
    WHERE p.company_id = public.current_company_id()
  )
);
