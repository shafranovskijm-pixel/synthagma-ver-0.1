-- Read-only group metadata. Existing views, row policies, functions and data stay intact.
-- SECURITY INVOKER deliberately retains the calling role's ordinary table RLS.
BEGIN;

DO $preflight$
DECLARE relation_name text;
BEGIN
  IF to_regprocedure('public.get_group_roster_metadata(uuid,uuid)') IS NOT NULL
     OR to_regprocedure('public.get_group_participant_metadata(uuid,uuid,uuid[],uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'group_metadata_function_already_exists' USING ERRCODE='55000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.student_group_profiles_effective'::regclass
    AND relkind='v' AND reloptions @> ARRAY['security_invoker=true']) THEN
    RAISE EXCEPTION 'group_metadata_requires_invoker_view' USING ERRCODE='55000';
  END IF;
  FOREACH relation_name IN ARRAY ARRAY['student_groups','profiles','student_group_memberships',
    'courses','enrollments','student_identity_documents','org_contracts','test_attempts','student_frdo_data'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=relation_name AND c.relrowsecurity) THEN
      RAISE EXCEPTION 'group_metadata_requires_existing_rls' USING ERRCODE='55000';
    END IF;
  END LOOP;
END;
$preflight$;

CREATE FUNCTION public.get_group_roster_metadata(p_organization_id uuid,p_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $function$
DECLARE result_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'group_metadata_unauthenticated' USING ERRCODE='42501';
  END IF;
  IF p_organization_id IS NULL OR p_group_id IS NULL THEN
    RAISE EXCEPTION 'group_metadata_invalid_scope' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.student_groups g
    WHERE g.id=p_group_id AND g.organization_id=p_organization_id) THEN
    RAISE EXCEPTION 'group_metadata_scope_unavailable' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'user_id',p.user_id,'full_name',p.full_name,'email',p.email,'login',p.login,
    'phone',p.phone,'archived_at',p.archived_at,'department',p.department
  ) ORDER BY p.user_id),'[]'::jsonb) INTO result_rows
  FROM public.student_group_profiles_effective p
  WHERE p.organization_id=p_organization_id AND p.group_id=p_group_id;
  RETURN jsonb_build_object('version',1,'organization_id',p_organization_id,
    'group_id',p_group_id,'profiles',result_rows);
END;
$function$;

CREATE FUNCTION public.get_group_participant_metadata(
  p_organization_id uuid,p_group_id uuid,p_user_ids uuid[],p_linked_course_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $function$
DECLARE
  actual_course_id uuid;
  actual_user_ids uuid[];
  requested_user_ids uuid[];
  identity_rows jsonb;
  contract_rows jsonb;
  attempt_rows jsonb;
  frdo_rows jsonb;
  enrollment_rows jsonb;
  enrollment_error boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'group_metadata_unauthenticated' USING ERRCODE='42501';
  END IF;
  IF p_organization_id IS NULL OR p_group_id IS NULL OR p_user_ids IS NULL
    OR array_position(p_user_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'group_metadata_invalid_scope' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT value ORDER BY value),'{}'::uuid[])
    INTO requested_user_ids FROM unnest(p_user_ids) AS ids(value);
  IF cardinality(requested_user_ids)<>cardinality(p_user_ids) THEN
    RAISE EXCEPTION 'group_metadata_duplicate_subject' USING ERRCODE='22023';
  END IF;

  SELECT g.course_id INTO actual_course_id FROM public.student_groups g
    WHERE g.id=p_group_id AND g.organization_id=p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_metadata_scope_unavailable' USING ERRCODE='42501';
  END IF;
  IF actual_course_id IS DISTINCT FROM p_linked_course_id THEN
    RAISE EXCEPTION 'group_metadata_course_changed' USING ERRCODE='40001';
  END IF;
  IF actual_course_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.courses c
    WHERE c.id=actual_course_id AND c.organization_id=p_organization_id) THEN
    -- The former page kept participant details when its org-scoped course
    -- lookup returned no row. Keep that branch without reading course evidence.
    enrollment_error := true;
  END IF;

  -- The group is already caller-visible. The primary arm therefore matches
  -- the effective view's existing group join; the additional arm keeps its RLS.
  -- Every requested subject must still be active and in this visible group.
  -- New members outside the completed first-read snapshot stay outside this
  -- response; their concurrent addition must not invalidate an existing load.
  SELECT coalesce(array_agg(p.user_id ORDER BY p.user_id),'{}'::uuid[])
    INTO actual_user_ids
  FROM public.profiles p
  WHERE p.organization_id=p_organization_id AND p.user_id=ANY(requested_user_ids)
    AND p.archived_at IS NULL AND (
    p.student_group_id=p_group_id OR EXISTS (
      SELECT 1 FROM public.student_group_memberships m
      WHERE m.organization_id=p_organization_id AND m.group_id=p_group_id AND m.user_id=p.user_id
    )
  );
  IF actual_user_ids IS DISTINCT FROM requested_user_ids THEN
    RAISE EXCEPTION 'group_metadata_roster_changed' USING ERRCODE='40001';
  END IF;

  -- Preserve the old distinction: unavailable linked-course evidence is
  -- explicitly unknown; failed common-course inference must fail the load.
  -- PostgreSQL cancellation/assert failures deliberately escape WHEN OTHERS:
  -- a statement timeout must fail the request rather than bypass its budget.
  IF NOT enrollment_error THEN
   BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object('course_id',e.course_id,'user_id',e.user_id,
      'status',e.status,'progress',e.progress,'completed_at',e.completed_at) ORDER BY e.id),'[]'::jsonb)
      INTO enrollment_rows
    FROM public.enrollments e WHERE e.user_id=ANY(actual_user_ids)
      AND (actual_course_id IS NULL OR e.course_id=actual_course_id);
  EXCEPTION WHEN OTHERS THEN
    IF actual_course_id IS NULL THEN RAISE; END IF;
    enrollment_error := true;
    enrollment_rows := NULL;
   END;
  END IF;

  -- Identity badges historically include every same-subject row visible to
  -- this caller. organization_id is metadata used to seed exact-org folders;
  -- it must not turn the badge and the folder into one different definition.
  SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',d.user_id,'type',d.type,
    'organization_id',d.organization_id) ORDER BY d.id),'[]'::jsonb) INTO identity_rows
  FROM public.student_identity_documents d WHERE d.user_id=ANY(actual_user_ids);

  SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'student_user_id',c.student_user_id)
    ORDER BY c.id),'[]'::jsonb) INTO contract_rows
  FROM public.org_contracts c WHERE c.organization_id=p_organization_id
    AND c.student_user_id=ANY(actual_user_ids);

  SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'user_id',a.user_id)
    ORDER BY a.id),'[]'::jsonb) INTO attempt_rows
  FROM public.test_attempts a WHERE a.user_id=ANY(actual_user_ids);

  SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',f.user_id,'last_name',f.last_name,
    'first_name',f.first_name,'middle_name',f.middle_name,'birth_date',f.birth_date,
    'gender',f.gender,'snils',f.snils,'citizenship_code',f.citizenship_code,
    'education_level',f.education_level,'passport_series',f.passport_series,
    'passport_number',f.passport_number) ORDER BY f.id),'[]'::jsonb) INTO frdo_rows
  FROM public.student_frdo_data f WHERE f.organization_id=p_organization_id
    AND f.user_id=ANY(actual_user_ids);

  RETURN jsonb_build_object('version',1,'organization_id',p_organization_id,
    'group_id',p_group_id,'user_ids',to_jsonb(actual_user_ids),'linked_course_id',actual_course_id,
    'identity_rows',identity_rows,'contract_rows',contract_rows,'attempt_rows',attempt_rows,
    'frdo_rows',frdo_rows,'enrollment_rows',enrollment_rows,'enrollment_error',enrollment_error);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_group_roster_metadata(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_group_participant_metadata(uuid,uuid,uuid[],uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_group_roster_metadata(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_participant_metadata(uuid,uuid,uuid[],uuid) TO authenticated;

COMMIT;
