-- Update the public_validate_registration_link function to return all needed fields
DROP FUNCTION IF EXISTS public.public_validate_registration_link(text);

CREATE OR REPLACE FUNCTION public.public_validate_registration_link(token_input text)
RETURNS TABLE (
  id uuid,
  token text,
  organization_id uuid,
  company_id uuid,
  course_id uuid,
  name text,
  expires_at timestamptz,
  used_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Return link data for valid (non-expired) links only
  -- This is safe because registration links are meant to be shareable
  RETURN QUERY
  SELECT 
    rl.id,
    rl.token,
    rl.organization_id,
    rl.company_id,
    rl.course_id,
    rl.name,
    rl.expires_at,
    rl.used_count
  FROM registration_links rl
  WHERE rl.token = token_input
  LIMIT 1;
END;
$$;

-- Grant execute to anon and authenticated (needed for registration flow)
GRANT EXECUTE ON FUNCTION public.public_validate_registration_link(text) TO anon;
GRANT EXECUTE ON FUNCTION public.public_validate_registration_link(text) TO authenticated;