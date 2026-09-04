-- Explicit operator-entered marks for the four retained client journal columns.
-- No legacy attendance/progress backfill and no inferred mark vocabulary.
CREATE TABLE public.group_class_journal_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.student_groups(id) ON DELETE CASCADE,
  -- Keep the source identity when a learner moves or their profile is removed.
  user_id uuid NOT NULL,
  slot integer NOT NULL CHECK (slot BETWEEN 1 AND 4),
  course_id uuid,
  source_date text NOT NULL CHECK (source_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  mark text NOT NULL CHECK (length(mark) <= 12),
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL,
  CONSTRAINT group_class_journal_marks_cell_key UNIQUE (group_id, user_id, slot)
);
COMMENT ON TABLE public.group_class_journal_marks IS
  'Explicit group journal cell text. Empty text is a deliberate clear. Course/date changes do not migrate existing marks; source_date and course_id identify the last explicitly saved cell context.';

ALTER TABLE public.group_class_journal_marks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.group_class_journal_marks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.group_class_journal_marks TO authenticated;
CREATE POLICY group_class_journal_marks_read ON public.group_class_journal_marks
FOR SELECT TO authenticated USING (
  (
    public.can_access_organization(organization_id, 'documents.read')
    OR public.can_access_organization(organization_id, 'documents.write')
  )
  AND EXISTS (
    SELECT 1 FROM public.student_groups g
    WHERE g.id = group_class_journal_marks.group_id
      AND g.organization_id = group_class_journal_marks.organization_id
  )
);

CREATE FUNCTION public.save_group_class_journal_mark(
  p_organization_id uuid,
  p_group_id uuid,
  p_expected_course_id uuid,
  p_user_id uuid,
  p_slot integer,
  p_expected_date text,
  p_expected_revision integer,
  p_mark text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_group public.student_groups%ROWTYPE;
  v_saved public.group_class_journal_marks%ROWTYPE;
  v_date date;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
  IF NOT COALESCE(public.can_access_organization(p_organization_id, 'documents.write'), false) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;
  IF p_slot IS NULL OR p_slot NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'invalid_mark_slot' USING ERRCODE = '22023';
  END IF;
  IF p_mark IS NULL OR length(p_mark) > 12 THEN
    RAISE EXCEPTION 'invalid_mark_text' USING ERRCODE = '22023';
  END IF;
  -- PostgreSQL UTF-8 already rejects NUL and unpaired surrogates. XML 1.0 also
  -- forbids these remaining controls/noncharacters; keep TAB, LF and CR intact.
  IF EXISTS (
    SELECT 1 FROM generate_series(1, length(p_mark)) AS chars(pos)
    WHERE ascii(substr(p_mark, pos, 1)) BETWEEN 1 AND 8
      OR ascii(substr(p_mark, pos, 1)) IN (11, 12, 65534, 65535)
      OR ascii(substr(p_mark, pos, 1)) BETWEEN 14 AND 31
  ) THEN RAISE EXCEPTION 'invalid_xml_text' USING ERRCODE = '22023'; END IF;
  IF p_expected_date IS NULL OR p_expected_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'invalid_mark_date' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_date := p_expected_date::date;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION 'invalid_mark_date' USING ERRCODE = '22023';
  END;
  IF to_char(v_date, 'YYYY-MM-DD') <> p_expected_date THEN
    RAISE EXCEPTION 'invalid_mark_date' USING ERRCODE = '22023';
  END IF;

  -- Serializes cell inserts as well as updates and protects the expected course
  -- and column date from a concurrent edit of the group settings.
  SELECT * INTO v_group FROM public.student_groups WHERE id = p_group_id FOR UPDATE;
  IF NOT FOUND OR v_group.organization_id IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'group_scope_mismatch' USING ERRCODE = '42501';
  END IF;
  IF v_group.course_id IS DISTINCT FROM p_expected_course_id THEN
    RAISE EXCEPTION 'group_course_changed' USING ERRCODE = '40001';
  END IF;
  IF v_group.training_dates[p_slot] IS NULL
    OR to_char(v_group.training_dates[p_slot], 'YYYY-MM-DD') IS DISTINCT FROM p_expected_date THEN
    RAISE EXCEPTION 'group_training_date_changed' USING ERRCODE = '40001';
  END IF;
  -- Hold a matching live profile while saving, but do not attach a cascading FK:
  -- moving/archiving/deleting the learner later must retain their stored marks.
  PERFORM 1 FROM public.profiles p
  WHERE p.user_id = p_user_id
    AND p.organization_id = p_organization_id
    AND p.student_group_id = p_group_id
    AND p.archived_at IS NULL
  FOR SHARE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION 'student_scope_mismatch' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_saved FROM public.group_class_journal_marks
  WHERE group_id = p_group_id AND user_id = p_user_id AND slot = p_slot FOR UPDATE;
  IF FOUND THEN
    IF v_saved.organization_id IS DISTINCT FROM p_organization_id THEN
      RAISE EXCEPTION 'mark_scope_mismatch' USING ERRCODE = '42501';
    END IF;
    IF p_expected_revision IS NULL OR v_saved.revision <> p_expected_revision THEN
      RAISE EXCEPTION 'mark_revision_conflict' USING ERRCODE = '40001';
    END IF;
    UPDATE public.group_class_journal_marks SET
      mark = p_mark, course_id = p_expected_course_id, source_date = p_expected_date,
      revision = revision + 1, updated_at = clock_timestamp(), updated_by = v_uid
    WHERE id = v_saved.id RETURNING * INTO v_saved;
  ELSE
    IF p_expected_revision IS NOT NULL THEN
      RAISE EXCEPTION 'mark_revision_conflict' USING ERRCODE = '40001';
    END IF;
    INSERT INTO public.group_class_journal_marks
      (organization_id, group_id, user_id, slot, course_id, source_date, mark, revision, updated_at, updated_by)
    VALUES
      (p_organization_id, p_group_id, p_user_id, p_slot, p_expected_course_id, p_expected_date, p_mark, 1, clock_timestamp(), v_uid)
    RETURNING * INTO v_saved;
  END IF;
  RETURN to_jsonb(v_saved);
END;
$function$;
REVOKE ALL ON FUNCTION public.save_group_class_journal_mark(uuid,uuid,uuid,uuid,integer,text,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_group_class_journal_mark(uuid,uuid,uuid,uuid,integer,text,integer,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
