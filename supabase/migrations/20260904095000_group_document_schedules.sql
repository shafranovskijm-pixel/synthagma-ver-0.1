-- Explicitly saved schedule facts; never infer or migrate legacy calendar data.
CREATE TABLE public.group_document_schedules (
  group_id uuid PRIMARY KEY REFERENCES public.student_groups(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  course_id uuid,
  slots jsonb NOT NULL CHECK (jsonb_typeof(slots) = 'array' AND jsonb_array_length(slots) <= 4),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL
);
ALTER TABLE public.group_document_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.group_document_schedules FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.group_document_schedules TO authenticated;
CREATE POLICY group_document_schedules_read ON public.group_document_schedules
FOR SELECT TO authenticated USING (
  public.can_access_organization(organization_id, 'documents.read')
  OR public.can_access_organization(organization_id, 'documents.write')
);

CREATE FUNCTION public.save_group_document_schedule(
  p_organization_id uuid, p_group_id uuid, p_expected_course_id uuid,
  p_expected_revision integer, p_slots jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_group public.student_groups%ROWTYPE;
  v_saved public.group_document_schedules%ROWTYPE;
  v_slot jsonb;
  v_date date;
  v_seen integer[] := '{}';
  v_number integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT COALESCE((
    public.can_access_organization(p_organization_id, 'documents.write')
  ), false) THEN RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_group FROM public.student_groups WHERE id = p_group_id FOR UPDATE;
  IF NOT FOUND OR v_group.organization_id IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'group_scope_mismatch' USING ERRCODE = '42501';
  END IF;
  IF v_group.course_id IS DISTINCT FROM p_expected_course_id THEN
    RAISE EXCEPTION 'group_course_changed' USING ERRCODE = '40001';
  END IF;
  IF p_slots IS NULL OR jsonb_typeof(p_slots) <> 'array' THEN
    RAISE EXCEPTION 'invalid_slots' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_slots) > 4 THEN RAISE EXCEPTION 'too_many_slots' USING ERRCODE = '22023'; END IF;
  FOR v_slot IN SELECT value FROM jsonb_array_elements(p_slots) LOOP
    IF jsonb_typeof(v_slot) <> 'object' THEN RAISE EXCEPTION 'invalid_slot' USING ERRCODE = '22023'; END IF;
    IF NOT (v_slot ?& ARRAY['slot','date','time_from','time_to','topic'])
      OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_slot) AS k(key) WHERE key NOT IN ('slot','date','time_from','time_to','topic'))
      OR jsonb_typeof(v_slot->'slot') <> 'number'
      OR (v_slot->>'slot') !~ '^[1-4]$'
      OR jsonb_typeof(v_slot->'date') <> 'string'
      OR jsonb_typeof(v_slot->'time_from') <> 'string'
      OR jsonb_typeof(v_slot->'time_to') <> 'string'
      OR jsonb_typeof(v_slot->'topic') <> 'string'
      OR length(v_slot->>'topic') > 2000 THEN
      RAISE EXCEPTION 'invalid_slot_fields' USING ERRCODE = '22023';
    END IF;
    v_number := (v_slot->>'slot')::integer;
    -- XML 1.0 text must remain valid in the retained DOCX. Keep TAB/LF/CR.
    IF EXISTS (
      SELECT 1 FROM generate_series(1, length(v_slot->>'topic')) AS chars(pos)
      WHERE ascii(substr(v_slot->>'topic', pos, 1)) BETWEEN 1 AND 8
        OR ascii(substr(v_slot->>'topic', pos, 1)) IN (11, 12, 65534, 65535)
        OR ascii(substr(v_slot->>'topic', pos, 1)) BETWEEN 14 AND 31
    ) THEN RAISE EXCEPTION 'invalid_xml_text' USING ERRCODE = '22023'; END IF;
    IF v_number = ANY(v_seen) THEN RAISE EXCEPTION 'duplicate_slot' USING ERRCODE = '22023'; END IF;
    v_seen := array_append(v_seen, v_number);
    IF v_slot->>'date' <> '' THEN
      IF (v_slot->>'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'invalid_date' USING ERRCODE = '22023'; END IF;
      BEGIN
        v_date := (v_slot->>'date')::date;
      EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
        RAISE EXCEPTION 'invalid_date' USING ERRCODE = '22023';
      END;
      IF to_char(v_date, 'YYYY-MM-DD') <> v_slot->>'date'
        OR (v_group.start_date IS NOT NULL AND v_date < v_group.start_date)
        OR (v_group.end_date IS NOT NULL AND v_date > v_group.end_date) THEN
        RAISE EXCEPTION 'date_outside_group_period' USING ERRCODE = '22023';
      END IF;
    END IF;
    IF ((v_slot->>'time_from') <> '' AND (v_slot->>'time_from') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
      OR ((v_slot->>'time_to') <> '' AND (v_slot->>'time_to') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') THEN
      RAISE EXCEPTION 'invalid_time' USING ERRCODE = '22023';
    END IF;
    IF v_slot->>'time_from' <> '' AND v_slot->>'time_to' <> '' AND v_slot->>'time_to' <= v_slot->>'time_from' THEN
      RAISE EXCEPTION 'invalid_time_period' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  SELECT * INTO v_saved FROM public.group_document_schedules WHERE group_id = p_group_id FOR UPDATE;
  IF FOUND THEN
    IF p_expected_revision IS NULL OR v_saved.revision <> p_expected_revision THEN
      RAISE EXCEPTION 'schedule_revision_conflict' USING ERRCODE = '40001';
    END IF;
    UPDATE public.group_document_schedules SET organization_id = p_organization_id,
      course_id = p_expected_course_id, slots = p_slots, revision = revision + 1,
      updated_at = clock_timestamp(), updated_by = v_uid
    WHERE group_id = p_group_id RETURNING * INTO v_saved;
  ELSE
    IF p_expected_revision IS NOT NULL THEN RAISE EXCEPTION 'schedule_revision_conflict' USING ERRCODE = '40001'; END IF;
    INSERT INTO public.group_document_schedules(group_id,organization_id,course_id,slots,revision,updated_at,updated_by)
      VALUES(p_group_id,p_organization_id,p_expected_course_id,p_slots,1,clock_timestamp(),v_uid)
      RETURNING * INTO v_saved;
  END IF;
  RETURN to_jsonb(v_saved);
END;
$function$;
REVOKE ALL ON FUNCTION public.save_group_document_schedule(uuid,uuid,uuid,integer,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_group_document_schedule(uuid,uuid,uuid,integer,jsonb) TO authenticated;
