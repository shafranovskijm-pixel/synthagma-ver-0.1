CREATE OR REPLACE FUNCTION public.public_lookup_user_by_login(login_input text)
 RETURNS TABLE(user_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT p.user_id
  FROM public.profiles p
  WHERE LOWER(p.login) = LOWER(login_input)
    AND p.user_id IS NOT NULL
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT lsp.user_id
  FROM public.labor_safety_profiles lsp
  WHERE LOWER(lsp.login) = LOWER(login_input)
    AND lsp.user_id IS NOT NULL;

  RETURN;
END;
$$;