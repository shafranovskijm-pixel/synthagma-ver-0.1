-- Drop the shorter overload of create_organization (5 params version)
-- Keep only the extended version with kpp, ogrn, legal_address, director_name
DROP FUNCTION IF EXISTS public.create_organization(text, text, text, text, text);
