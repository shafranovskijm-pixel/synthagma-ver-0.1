CREATE OR REPLACE FUNCTION public.count_org_completions_this_month(org_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)
  FROM enrollments e
  JOIN courses c ON c.id = e.course_id
  WHERE c.organization_id = org_id
    AND e.status = 'completed'
    AND e.completed_at >= date_trunc('month', now())
    AND e.completed_at < date_trunc('month', now()) + interval '1 month';
$$;