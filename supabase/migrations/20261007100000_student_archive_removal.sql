-- Removing an archived learner is a roster operation, not erasure of learning
-- evidence. Markers are tenant-scoped; enrollments, attempts and billing stay intact.
CREATE TABLE IF NOT EXISTS public.student_roster_removals (
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  user_id uuid NOT NULL,
  removed_at timestamptz NOT NULL DEFAULT now(),
  removed_by uuid NOT NULL,
  PRIMARY KEY (organization_id, user_id)
);
ALTER TABLE public.student_roster_removals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_roster_removals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.student_roster_removals TO authenticated;
GRANT ALL ON public.student_roster_removals TO service_role;
CREATE POLICY student_roster_removals_read ON public.student_roster_removals
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_org_owner(auth.uid(), organization_id)
    OR (EXISTS (SELECT 1 FROM public.org_staff s WHERE s.user_id = auth.uid()
      AND s.organization_id = student_roster_removals.organization_id
      AND (s.expires_at IS NULL OR s.expires_at > now()))
      AND public.has_org_staff_permission(auth.uid(), organization_id, 'students.read'))
  );

CREATE OR REPLACE FUNCTION public.set_archived_student_removed(
  p_organization_id uuid, p_user_id uuid, p_removed boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_profile public.profiles; v_changed integer; v_removed_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE((
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_org_owner(auth.uid(), p_organization_id)
    OR (EXISTS (SELECT 1 FROM public.org_staff s WHERE s.user_id = auth.uid()
      AND s.organization_id = p_organization_id AND (s.expires_at IS NULL OR s.expires_at > now()))
      AND public.has_org_staff_permission(auth.uid(), p_organization_id, 'students.write'))
  ), false) THEN RAISE EXCEPTION 'student_removal_forbidden' USING ERRCODE = '42501'; END IF;
  IF p_removed IS NULL THEN RAISE EXCEPTION 'invalid_removal_state' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_profile FROM public.profiles p WHERE p.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_profile.organization_id IS DISTINCT FROM p_organization_id
    OR NOT public.is_student_profile(p_user_id, p_organization_id) THEN
    RAISE EXCEPTION 'student_not_in_organization' USING ERRCODE = '42501';
  END IF;
  IF p_removed AND v_profile.archived_at IS NULL THEN
    RAISE EXCEPTION 'student_must_be_archived' USING ERRCODE = '22023';
  END IF;
  IF p_removed THEN
    INSERT INTO public.student_roster_removals(organization_id, user_id, removed_by)
      VALUES (p_organization_id, p_user_id, auth.uid()) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    SELECT r.removed_at INTO v_removed_at FROM public.student_roster_removals r
      WHERE r.organization_id = p_organization_id AND r.user_id = p_user_id;
  ELSE
    DELETE FROM public.student_roster_removals r
      WHERE r.organization_id = p_organization_id AND r.user_id = p_user_id;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    IF v_changed > 0 THEN
      UPDATE public.profiles SET archived_at = COALESCE(archived_at, now()) WHERE user_id = p_user_id;
    END IF;
  END IF;
  IF v_changed > 0 THEN
    INSERT INTO public.student_deletion_log(student_id, student_full_name, student_login,
      student_email, organization_id, deleted_by, deletion_type, reason, metadata)
    VALUES (p_user_id, v_profile.full_name, v_profile.login, v_profile.email,
      p_organization_id, auth.uid(), CASE WHEN p_removed THEN 'soft' ELSE 'archive' END,
      CASE WHEN p_removed THEN 'removed_from_archive' ELSE 'restored_to_archive' END,
      jsonb_build_object('history_preserved', true, 'roster_removed', p_removed));
  END IF;
  RETURN jsonb_build_object('organization_id', p_organization_id, 'user_id', p_user_id,
    'removed', p_removed, 'removed_at', v_removed_at, 'changed', v_changed > 0);
END;
$function$;
REVOKE ALL ON FUNCTION public.set_archived_student_removed(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_archived_student_removed(uuid,uuid,boolean) TO authenticated;

-- Patch the deployed definitions to preserve prior pagination/group fixes.
-- Every replacement is bounded to a known predicate and fails on schema drift.
DO $migration$
DECLARE v_signature text; v_original text; v_updated text;
  v_predicate text := 'p.organization_id = p_organization_id';
  v_filter text := 'p.organization_id = p_organization_id AND NOT EXISTS (SELECT 1 FROM public.student_roster_removals srr WHERE srr.organization_id = p_organization_id AND srr.user_id = p.user_id)';
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_organization_students_page(uuid,integer,integer,text,uuid,text,text,text,text)',
    'public.get_organization_students_counts(uuid)',
    'public.get_organization_student_group_counts(uuid)',
    'public.get_organization_dashboard_summary(uuid)',
    'public.get_organization_course_overview(uuid)'
  ] LOOP
    SELECT pg_get_functiondef(v_signature::regprocedure) INTO v_original;
    IF position('student_roster_removals' IN v_original) > 0 THEN CONTINUE; END IF;
    v_updated := replace(v_original, v_predicate, v_filter);
    IF v_updated = v_original THEN RAISE EXCEPTION 'student_roster_filter_drift: %', v_signature; END IF;
    EXECUTE v_updated;
  END LOOP;
  FOREACH v_signature IN ARRAY ARRAY[
    'public.get_course_student_test_results_page(uuid,integer,integer,text,text,text)',
    'public.get_course_students_page(uuid,integer,integer,text,text)',
    'public.get_course_students_stats(uuid)'
  ] LOOP
    SELECT pg_get_functiondef(v_signature::regprocedure) INTO v_original;
    IF position('student_roster_removals' IN v_original) > 0 THEN CONTINUE; END IF;
    -- This predicate is shared by the result rows and course counters.
    v_updated := replace(v_original, 'WHERE e.course_id = p_course_id',
      'WHERE e.course_id = p_course_id AND NOT EXISTS (SELECT 1 FROM public.student_roster_removals srr WHERE srr.organization_id = v_org AND srr.user_id = e.user_id)');
    IF v_updated = v_original THEN RAISE EXCEPTION 'student_roster_filter_drift: %', v_signature; END IF;
    EXECUTE v_updated;
  END LOOP;
END;
$migration$;
