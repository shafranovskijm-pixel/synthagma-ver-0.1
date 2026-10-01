-- Additional student groups preserve profiles.student_group_id and enrollments.
-- Composite keys prevent cross-tenant memberships even through service-role writes.
CREATE UNIQUE INDEX IF NOT EXISTS student_groups_membership_tenant_key
  ON public.student_groups (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_membership_tenant_key
  ON public.profiles (user_id, organization_id);

CREATE TABLE IF NOT EXISTS public.student_group_memberships (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id),
  FOREIGN KEY (group_id, organization_id)
    REFERENCES public.student_groups(id, organization_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, organization_id)
    REFERENCES public.profiles(user_id, organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS student_group_memberships_by_user
  ON public.student_group_memberships (organization_id, user_id, group_id);
ALTER TABLE public.student_group_memberships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_group_memberships_read ON public.student_group_memberships;
-- Organization membership alone must not expose other learners' additional groups.
CREATE POLICY student_group_memberships_read ON public.student_group_memberships
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_org_owner(auth.uid(), organization_id)
    OR (EXISTS (SELECT 1 FROM public.org_staff s WHERE s.user_id = auth.uid()
      AND s.organization_id = student_group_memberships.organization_id
      AND (s.expires_at IS NULL OR s.expires_at > now()))
      AND public.has_org_staff_permission(auth.uid(), organization_id, 'students.read'))
    OR user_id = auth.uid()
  );
-- Client writes go only through the atomic, permission-checked RPC.
REVOKE ALL ON public.student_group_memberships FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.student_group_memberships TO authenticated;
GRANT ALL ON public.student_group_memberships TO service_role;

CREATE OR REPLACE VIEW public.student_group_memberships_effective
  WITH (security_invoker = true) AS
  SELECT p.organization_id, p.student_group_id AS group_id, p.user_id
  FROM public.profiles p
  JOIN public.student_groups g
    ON g.id = p.student_group_id AND g.organization_id = p.organization_id
  UNION
  SELECT m.organization_id, m.group_id, m.user_id
  FROM public.student_group_memberships m;

CREATE OR REPLACE VIEW public.student_group_profiles_effective
  WITH (security_invoker = true) AS
  SELECT p.*, m.group_id
  FROM public.profiles p
  JOIN public.student_group_memberships_effective m
    ON m.user_id = p.user_id AND m.organization_id = p.organization_id;

REVOKE ALL ON public.student_group_memberships_effective, public.student_group_profiles_effective
  FROM PUBLIC, anon;
GRANT SELECT ON public.student_group_memberships_effective, public.student_group_profiles_effective
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.add_students_to_groups(
  p_organization_id uuid,
  p_user_ids uuid[],
  p_group_ids uuid[]
)
RETURNS TABLE(organization_id uuid, group_id uuid, user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE
  v_users uuid[];
  v_groups uuid[];
  v_user uuid;
  v_profile public.profiles;
  v_group uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE((
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_org_owner(auth.uid(), p_organization_id)
    OR (EXISTS (SELECT 1 FROM public.org_staff s WHERE s.user_id = auth.uid()
      AND s.organization_id = p_organization_id AND (s.expires_at IS NULL OR s.expires_at > now()))
      AND public.has_org_staff_permission(auth.uid(), p_organization_id, 'students.write'))
  ), false) THEN
    RAISE EXCEPTION 'student_group_access_denied' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL OR p_user_ids IS NULL OR p_group_ids IS NULL
    OR array_position(p_user_ids, NULL) IS NOT NULL OR array_position(p_group_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_membership_request' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT u ORDER BY u) INTO v_users FROM unnest(p_user_ids) u;
  SELECT array_agg(DISTINCT g ORDER BY g) INTO v_groups FROM unnest(p_group_ids) g;
  IF COALESCE(cardinality(v_users), 0) NOT BETWEEN 1 AND 1000
    OR COALESCE(cardinality(v_groups), 0) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'invalid_membership_batch_size' USING ERRCODE = '22023';
  END IF;
  -- Consistent ordering serializes duplicate/repeated bulk requests and tenant moves.
  FOREACH v_user IN ARRAY v_users LOOP
    SELECT * INTO v_profile FROM public.profiles p WHERE p.user_id = v_user FOR UPDATE;
    IF NOT FOUND OR v_profile.organization_id IS DISTINCT FROM p_organization_id
      OR NOT public.is_student_profile(v_user, p_organization_id) THEN
      RAISE EXCEPTION 'student_not_in_organization' USING ERRCODE = '42501';
    END IF;
    IF v_profile.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'student_archived' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOREACH v_group IN ARRAY v_groups LOOP
    PERFORM 1 FROM public.student_groups g
      WHERE g.id = v_group AND g.organization_id = p_organization_id FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'group_not_in_organization' USING ERRCODE = '42501';
    END IF;
  END LOOP;
  INSERT INTO public.student_group_memberships AS target (organization_id, group_id, user_id)
  SELECT p_organization_id, g, u FROM unnest(v_groups) g CROSS JOIN unnest(v_users) u
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.user_id = u AND p.organization_id = p_organization_id AND p.student_group_id = g)
  ON CONFLICT ON CONSTRAINT student_group_memberships_pkey DO NOTHING;
  RETURN QUERY SELECT m.organization_id, m.group_id, m.user_id
    FROM public.student_group_memberships_effective m
    WHERE m.organization_id = p_organization_id
      AND m.group_id = ANY(v_groups) AND m.user_id = ANY(v_users)
    ORDER BY m.group_id, m.user_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.add_students_to_groups(uuid, uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_students_to_groups(uuid, uuid[], uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_organization_student_group_counts(p_organization_id uuid)
RETURNS TABLE(group_id uuid, total_count bigint, active_count bigint, archived_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_access_organization(p_organization_id, 'students.read') THEN
    RAISE EXCEPTION 'student_group_access_denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH learners AS (
    SELECT p.user_id, p.archived_at FROM public.profiles p
    WHERE p.organization_id = p_organization_id
      AND public.is_student_profile(p.user_id, p_organization_id)
  ), bindings AS (
    SELECT l.user_id, l.archived_at, m.group_id FROM learners l
    LEFT JOIN public.student_group_memberships_effective m
      ON m.user_id = l.user_id AND m.organization_id = p_organization_id
  )
  SELECT b.group_id, COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE b.archived_at IS NULL)::bigint,
    COUNT(*) FILTER (WHERE b.archived_at IS NOT NULL)::bigint
  FROM bindings b GROUP BY b.group_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_organization_student_group_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_organization_student_group_counts(uuid) TO authenticated, service_role;

-- Preserve the deployed pagination and document numbering logic. Replace only
-- legacy membership predicates; fail atomically if their definitions drifted.
DO $migration$
DECLARE
  v_definition text;
  v_patched text;
BEGIN
  SELECT pg_get_functiondef('public.get_organization_students_page(uuid,integer,integer,text,uuid,text,text,text,text)'::regprocedure)
    INTO v_definition;
  v_patched := replace(v_definition,
    '(p_group_filter = ''no_group'' AND p.student_group_id IS NULL)',
    '(p_group_filter = ''no_group'' AND NOT EXISTS (SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id = p.organization_id AND m.user_id = p.user_id))');
  v_patched := replace(v_patched, 'p.student_group_id::text = p_group_filter',
    'EXISTS (SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id = p.organization_id AND m.user_id = p.user_id AND m.group_id::text = p_group_filter)');
  IF v_patched = v_definition AND position('student_group_memberships_effective' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'unrecognized_students_page_membership_predicate';
  END IF;
  IF position('p.student_group_id::text = p_group_filter' IN v_patched) > 0
    OR position('p_group_filter = ''no_group'' AND p.student_group_id IS NULL' IN v_patched) > 0 THEN
    RAISE EXCEPTION 'students_page_membership_patch_incomplete';
  END IF;
  EXECUTE v_patched;

  SELECT pg_get_functiondef('public.issue_education_document_batch(uuid,uuid,uuid,jsonb)'::regprocedure)
    INTO v_definition;
  v_patched := replace(v_definition, 'pr.student_group_id = p_group_id',
    'EXISTS (SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id = pr.organization_id AND m.user_id = pr.user_id AND m.group_id = p_group_id)');
  IF v_patched = v_definition AND position('student_group_memberships_effective' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'unrecognized_document_batch_membership_predicate';
  END IF;
  EXECUTE v_patched;
END;
$migration$;
