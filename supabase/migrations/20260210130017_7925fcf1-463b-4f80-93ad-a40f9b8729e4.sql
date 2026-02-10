-- Fix: Add authentication check to create_organization and revoke anon access
-- Both overloads need to be updated

-- Update the 5-param version
CREATE OR REPLACE FUNCTION public.create_organization(p_name text, p_email text, p_phone text DEFAULT NULL::text, p_inn text DEFAULT NULL::text, p_contact_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_id uuid;
BEGIN
  -- Require authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Prevent duplicate org creation by same user
  IF EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND organization_id IS NOT NULL) THEN
    RAISE EXCEPTION 'User already belongs to an organization';
  END IF;

  INSERT INTO public.organizations (name, email, phone, inn, contact_name)
  VALUES (p_name, p_email, p_phone, p_inn, p_contact_name)
  RETURNING id INTO new_id;
  
  RETURN new_id;
END;
$function$;

-- Update the 9-param version
CREATE OR REPLACE FUNCTION public.create_organization(p_name text, p_email text, p_phone text DEFAULT NULL::text, p_inn text DEFAULT NULL::text, p_contact_name text DEFAULT NULL::text, p_kpp text DEFAULT NULL::text, p_ogrn text DEFAULT NULL::text, p_legal_address text DEFAULT NULL::text, p_director_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_id uuid;
BEGIN
  -- Require authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Prevent duplicate org creation by same user
  IF EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND organization_id IS NOT NULL) THEN
    RAISE EXCEPTION 'User already belongs to an organization';
  END IF;

  INSERT INTO public.organizations (name, email, phone, inn, contact_name, kpp, ogrn, legal_address, director_name)
  VALUES (p_name, p_email, p_phone, p_inn, p_contact_name, p_kpp, p_ogrn, p_legal_address, p_director_name)
  RETURNING id INTO new_id;
  
  RETURN new_id;
END;
$function$;

-- Revoke anonymous access
REVOKE EXECUTE ON FUNCTION public.create_organization(text, text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_organization(text, text, text, text, text, text, text, text, text) FROM anon;
