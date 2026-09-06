-- Temporary safety gate for the not-yet-released driving-school module.
-- Reversible permission change only. No data/schema deletion and no legacy objects.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $gate$
DECLARE r record; n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname='public' AND p.proname = ANY(ARRAY['driving_touch_updated_at','driving_can_manage','driving_can_read','driving_membership','driving_is_member','driving_assert_manage','driving_log','driving_student_minutes','driving_connect_module','driving_module_status','driving_my_schools','driving_get_state','driving_save_program','driving_save_car','driving_save_instructor','driving_save_group','driving_set_resource_status','driving_add_shift','driving_save_student','driving_link_student_account','driving_assign_student','driving_create_invite','driving_accept_invite','driving_book_lesson','driving_lesson_action','driving_add_entry','driving_reverse_entry','driving_save_course','driving_submit_attempt','driving_save_settings']);
  IF n <> 30 THEN RAISE EXCEPTION 'Driving gate expected 30 exact functions, found %', n; END IF;
  FOR r IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
    WHERE ns.nspname='public' AND p.proname = ANY(ARRAY['driving_touch_updated_at','driving_can_manage','driving_can_read','driving_membership','driving_is_member','driving_assert_manage','driving_log','driving_student_minutes','driving_connect_module','driving_module_status','driving_my_schools','driving_get_state','driving_save_program','driving_save_car','driving_save_instructor','driving_save_group','driving_set_resource_status','driving_add_shift','driving_save_student','driving_link_student_account','driving_assign_student','driving_create_invite','driving_accept_invite','driving_book_lesson','driving_lesson_action','driving_add_entry','driving_reverse_entry','driving_save_course','driving_submit_attempt','driving_save_settings'])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.signature);
  END LOOP;
END $gate$;
REVOKE ALL ON TABLE public.driving_schools, public.driving_programs, public.driving_cars, public.driving_instructors, public.driving_shifts, public.driving_groups, public.driving_students, public.driving_lessons, public.driving_courses, public.driving_entries, public.driving_entry_reversals, public.driving_operations, public.driving_audit, public.driving_memberships, public.driving_invites FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.driving_audit_id_seq FROM PUBLIC, anon, authenticated;
COMMIT;
