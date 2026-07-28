CREATE OR REPLACE FUNCTION public.get_decrypted_student_passwords_for_users(
  p_organization_id uuid,
  p_user_ids uuid[]
)
RETURNS TABLE(user_id uuid, decrypted_password text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_is_owner boolean;
  v_is_staff boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  IF array_length(p_user_ids, 1) > 100 THEN
    RAISE EXCEPTION 'too many user_ids (max 100)' USING ERRCODE = '22023';
  END IF;

  v_is_admin := public.has_role(v_uid, 'admin');
  SELECT EXISTS(
    SELECT 1 FROM public.organizations o
    WHERE o.id = p_organization_id AND o.user_id = v_uid
  ) INTO v_is_owner;
  v_is_staff := public.has_org_staff_permission(v_uid, p_organization_id, 'students.write');

  IF NOT (v_is_admin OR v_is_owner OR v_is_staff) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.user_id,
         public.decrypt_password(p.generated_password) AS decrypted_password
  FROM public.profiles p
  WHERE p.organization_id = p_organization_id
    AND p.user_id = ANY(p_user_ids)
    AND public.is_student_profile(p.user_id, p_organization_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_decrypted_student_passwords_for_users(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_decrypted_student_passwords_for_users(uuid, uuid[]) TO authenticated, service_role;