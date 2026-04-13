DROP FUNCTION IF EXISTS public.public_validate_registration_link(text);

CREATE OR REPLACE FUNCTION public.public_validate_registration_link(token_input text)
 RETURNS TABLE(id uuid, token text, organization_id uuid, company_id uuid, course_id uuid, name text, expires_at timestamp with time zone, used_count integer, student_group_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    rl.id,
    rl.token,
    rl.organization_id,
    rl.company_id,
    rl.course_id,
    rl.name,
    rl.expires_at,
    rl.used_count,
    rl.student_group_id
  FROM registration_links rl
  WHERE rl.token = token_input
  LIMIT 1;
END;
$function$;