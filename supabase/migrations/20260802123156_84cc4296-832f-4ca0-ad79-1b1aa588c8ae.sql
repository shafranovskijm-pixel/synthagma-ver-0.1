CREATE OR REPLACE FUNCTION public.update_student_group_settings(p_group_id uuid, p_patch jsonb)
RETURNS public.student_groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_row public.student_groups;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT organization_id INTO v_org FROM public.student_groups WHERE id = p_group_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  IF NOT (
    public.has_role('admin'::app_role, auth.uid())
    OR v_org = public.current_organization_id()
    OR EXISTS (
      SELECT 1 FROM public.org_staff s
      WHERE s.user_id = auth.uid()
        AND s.organization_id = v_org
        AND (s.expires_at IS NULL OR s.expires_at > now())
    )
    OR EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = v_org AND o.owner_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  UPDATE public.student_groups g SET
    name                  = COALESCE(NULLIF(p_patch->>'name',''), g.name),
    color                 = COALESCE(p_patch->>'color', g.color),
    start_date            = CASE WHEN p_patch ? 'start_date' THEN NULLIF(p_patch->>'start_date','')::date ELSE g.start_date END,
    end_date              = CASE WHEN p_patch ? 'end_date' THEN NULLIF(p_patch->>'end_date','')::date ELSE g.end_date END,
    group_number          = CASE WHEN p_patch ? 'group_number' THEN NULLIF(p_patch->>'group_number','') ELSE g.group_number END,
    program_title         = CASE WHEN p_patch ? 'program_title' THEN NULLIF(p_patch->>'program_title','') ELSE g.program_title END,
    program_hours         = CASE WHEN p_patch ? 'program_hours' THEN NULLIF(p_patch->>'program_hours','')::integer ELSE g.program_hours END,
    program_form          = CASE WHEN p_patch ? 'program_form' THEN NULLIF(p_patch->>'program_form','') ELSE g.program_form END,
    default_price         = CASE WHEN p_patch ? 'default_price' THEN NULLIF(p_patch->>'default_price','')::numeric ELSE g.default_price END,
    course_id             = CASE WHEN p_patch ? 'course_id' THEN NULLIF(p_patch->>'course_id','')::uuid ELSE g.course_id END,
    max_seats             = CASE WHEN p_patch ? 'max_seats' THEN NULLIF(p_patch->>'max_seats','')::integer ELSE g.max_seats END,
    strict_order          = COALESCE((p_patch->>'strict_order')::boolean, g.strict_order),
    limit_access_time     = COALESCE((p_patch->>'limit_access_time')::boolean, g.limit_access_time),
    schedule_access       = COALESCE((p_patch->>'schedule_access')::boolean, g.schedule_access),
    block_resubmit        = COALESCE((p_patch->>'block_resubmit')::boolean, g.block_resubmit),
    show_locked_lessons   = COALESCE((p_patch->>'show_locked_lessons')::boolean, g.show_locked_lessons),
    enable_channel        = COALESCE((p_patch->>'enable_channel')::boolean, g.enable_channel),
    enable_group_chat     = COALESCE((p_patch->>'enable_group_chat')::boolean, g.enable_group_chat),
    block_student_dialogs = COALESCE((p_patch->>'block_student_dialogs')::boolean, g.block_student_dialogs),
    updated_at            = now()
  WHERE g.id = p_group_id
  RETURNING g.* INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_student_group_settings(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_student_group_settings(uuid, jsonb) TO service_role;