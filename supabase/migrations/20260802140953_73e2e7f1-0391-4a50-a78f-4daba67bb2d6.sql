REVOKE EXECUTE ON FUNCTION public.update_student_group_settings(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_student_group_settings(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_student_group_settings(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_student_group_settings(uuid, jsonb) TO service_role;