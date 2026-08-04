CREATE OR REPLACE FUNCTION public.update_student_group_settings(p_group_id uuid, p_patch jsonb)
 RETURNS student_groups
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_row public.student_groups;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'invalid_patch' USING ERRCODE = '22023';
  END IF;

  SELECT g.organization_id
    INTO v_org
  FROM public.student_groups g
  WHERE g.id = p_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.organization_id = v_org
    )
    OR EXISTS (
      SELECT 1
      FROM public.org_staff s
      WHERE s.user_id = auth.uid()
        AND s.organization_id = v_org
        AND (s.expires_at IS NULL OR s.expires_at > now())
    )
  ) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.student_groups AS g
  SET
    name = CASE WHEN p_patch ? 'name' THEN COALESCE(NULLIF(btrim(p_patch->>'name'), ''), g.name) ELSE g.name END,
    color = CASE WHEN p_patch ? 'color' THEN NULLIF(btrim(p_patch->>'color'), '') ELSE g.color END,
    start_date = CASE WHEN p_patch ? 'start_date' THEN NULLIF(p_patch->>'start_date', '')::date ELSE g.start_date END,
    end_date = CASE WHEN p_patch ? 'end_date' THEN NULLIF(p_patch->>'end_date', '')::date ELSE g.end_date END,
    group_number = CASE WHEN p_patch ? 'group_number' THEN NULLIF(btrim(p_patch->>'group_number'), '') ELSE g.group_number END,
    program_title = CASE WHEN p_patch ? 'program_title' THEN NULLIF(btrim(p_patch->>'program_title'), '') ELSE g.program_title END,
    program_hours = CASE WHEN p_patch ? 'program_hours' THEN NULLIF(p_patch->>'program_hours', '')::integer ELSE g.program_hours END,
    program_form = CASE WHEN p_patch ? 'program_form' THEN NULLIF(btrim(p_patch->>'program_form'), '') ELSE g.program_form END,
    default_price = CASE WHEN p_patch ? 'default_price' THEN NULLIF(p_patch->>'default_price', '')::numeric ELSE g.default_price END,
    training_address = CASE WHEN p_patch ? 'training_address' THEN NULLIF(btrim(p_patch->>'training_address'), '') ELSE g.training_address END,
    schedule_text = CASE WHEN p_patch ? 'schedule_text' THEN NULLIF(btrim(p_patch->>'schedule_text'), '') ELSE g.schedule_text END,
    course_id = CASE WHEN p_patch ? 'course_id' THEN NULLIF(p_patch->>'course_id', '')::uuid ELSE g.course_id END,
    max_seats = CASE WHEN p_patch ? 'max_seats' THEN NULLIF(p_patch->>'max_seats', '')::integer ELSE g.max_seats END,
    strict_order = CASE WHEN p_patch ? 'strict_order' THEN (p_patch->>'strict_order')::boolean ELSE g.strict_order END,
    limit_access_time = CASE WHEN p_patch ? 'limit_access_time' THEN (p_patch->>'limit_access_time')::boolean ELSE g.limit_access_time END,
    schedule_access = CASE WHEN p_patch ? 'schedule_access' THEN (p_patch->>'schedule_access')::boolean ELSE g.schedule_access END,
    block_resubmit = CASE WHEN p_patch ? 'block_resubmit' THEN (p_patch->>'block_resubmit')::boolean ELSE g.block_resubmit END,
    show_locked_lessons = CASE WHEN p_patch ? 'show_locked_lessons' THEN (p_patch->>'show_locked_lessons')::boolean ELSE g.show_locked_lessons END,
    enable_channel = CASE WHEN p_patch ? 'enable_channel' THEN (p_patch->>'enable_channel')::boolean ELSE g.enable_channel END,
    enable_group_chat = CASE WHEN p_patch ? 'enable_group_chat' THEN (p_patch->>'enable_group_chat')::boolean ELSE g.enable_group_chat END,
    block_student_dialogs = CASE WHEN p_patch ? 'block_student_dialogs' THEN (p_patch->>'block_student_dialogs')::boolean ELSE g.block_student_dialogs END,
    updated_at = now()
  WHERE g.id = p_group_id
  RETURNING g.* INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'group_update_failed' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$function$;