
-- Public lookup of invitation by token (returns only safe fields)
CREATE OR REPLACE FUNCTION public.lookup_staff_invitation(_token text)
RETURNS TABLE (
  email text,
  expires_at timestamptz,
  accepted_at timestamptz,
  invitation_type text,
  full_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email, expires_at, accepted_at, invitation_type, full_name
  FROM public.staff_invitations
  WHERE token = _token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_staff_invitation(text) TO anon, authenticated;
