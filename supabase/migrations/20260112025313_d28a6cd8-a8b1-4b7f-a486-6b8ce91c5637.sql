-- Create a security definer function to bypass RLS for organization creation
CREATE OR REPLACE FUNCTION public.create_organization(
  p_name text,
  p_email text,
  p_phone text DEFAULT NULL,
  p_inn text DEFAULT NULL,
  p_contact_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO public.organizations (name, email, phone, inn, contact_name)
  VALUES (p_name, p_email, p_phone, p_inn, p_contact_name)
  RETURNING id INTO new_id;
  
  RETURN new_id;
END;
$$;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION public.create_organization TO anon;
GRANT EXECUTE ON FUNCTION public.create_organization TO authenticated;