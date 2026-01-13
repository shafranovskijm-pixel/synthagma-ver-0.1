-- Update create_organization function to support additional fields
CREATE OR REPLACE FUNCTION public.create_organization(
  p_name text, 
  p_email text, 
  p_phone text DEFAULT NULL::text, 
  p_inn text DEFAULT NULL::text, 
  p_contact_name text DEFAULT NULL::text,
  p_kpp text DEFAULT NULL::text,
  p_ogrn text DEFAULT NULL::text,
  p_legal_address text DEFAULT NULL::text,
  p_director_name text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO public.organizations (name, email, phone, inn, contact_name, kpp, ogrn, legal_address, director_name)
  VALUES (p_name, p_email, p_phone, p_inn, p_contact_name, p_kpp, p_ogrn, p_legal_address, p_director_name)
  RETURNING id INTO new_id;
  
  RETURN new_id;
END;
$$;