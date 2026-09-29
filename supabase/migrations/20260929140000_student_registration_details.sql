-- Staff registration/import fields. Profession intentionally awaits the client's clarification.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department text;
COMMENT ON COLUMN public.profiles.department IS 'Подразделение сотрудника; не учебная группа и не код подразделения паспорта';

CREATE OR REPLACE FUNCTION public.save_student_registration_details(
  p_organization_id uuid,
  p_user_id uuid,
  p_actor_id uuid,
  p_department text DEFAULT NULL,
  p_snils text DEFAULT NULL,
  p_birth_date date DEFAULT NULL,
  p_confirm_identity boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_role text := COALESCE(NULLIF(auth.jwt()->>'role', ''), NULLIF(current_setting('request.jwt.claim.role', true), ''), '');
  v_department text := NULLIF(btrim(p_department), '');
  v_snils text := NULLIF(btrim(p_snils), '');
  v_profile public.profiles;
  v_identification public.video_identifications;
BEGIN
  IF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_actor_id IS NULL OR NOT (
    public.has_role(p_actor_id, 'admin'::public.app_role)
    OR public.is_org_owner(p_actor_id, p_organization_id)
    OR (EXISTS (SELECT 1 FROM public.org_staff s WHERE s.user_id = p_actor_id
      AND s.organization_id = p_organization_id AND (s.expires_at IS NULL OR s.expires_at > now()))
      AND public.has_org_staff_permission(p_actor_id, p_organization_id, 'students.write'))
  ) THEN
    RAISE EXCEPTION 'student_details_access_denied' USING ERRCODE = '42501';
  END IF;
  -- Serialize repeated imports/confirmation and prevent a concurrent archive/tenant move.
  SELECT * INTO v_profile FROM public.profiles WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_profile.organization_id IS DISTINCT FROM p_organization_id
     OR NOT public.is_student_profile(p_user_id, p_organization_id) THEN
    RAISE EXCEPTION 'student_not_in_organization' USING ERRCODE = '42501';
  END IF;
  IF v_profile.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'student_archived' USING ERRCODE = '22023';
  END IF;
  IF length(v_department) > 200 OR v_department ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid_department' USING ERRCODE = '22023';
  END IF;
  IF v_snils IS NOT NULL THEN
    IF v_snils !~ '^[0-9[:space:]-]+$' THEN
      RAISE EXCEPTION 'invalid_snils' USING ERRCODE = '22023';
    END IF;
    v_snils := regexp_replace(v_snils, '[[:space:]-]', '', 'g');
    IF length(v_snils) <> 11 THEN
      RAISE EXCEPTION 'invalid_snils' USING ERRCODE = '22023';
    END IF;
    v_snils := substr(v_snils, 1, 3) || '-' || substr(v_snils, 4, 3) || '-' || substr(v_snils, 7, 3) || ' ' || substr(v_snils, 10, 2);
  END IF;
  IF p_birth_date > CURRENT_DATE OR p_birth_date < DATE '0001-01-01' THEN
    RAISE EXCEPTION 'invalid_birth_date' USING ERRCODE = '22023';
  END IF;

  IF v_department IS NOT NULL THEN
    UPDATE public.profiles SET department = v_department WHERE user_id = p_user_id;
  END IF;
  IF v_snils IS NOT NULL OR p_birth_date IS NOT NULL THEN
    INSERT INTO public.student_frdo_data AS existing (user_id, organization_id, snils, birth_date)
    VALUES (p_user_id, p_organization_id, v_snils, p_birth_date)
    ON CONFLICT (user_id, organization_id) DO UPDATE SET
      snils = COALESCE(EXCLUDED.snils, existing.snils),
      birth_date = COALESCE(EXCLUDED.birth_date, existing.birth_date);
  END IF;

  IF p_confirm_identity IS TRUE THEN
    SELECT * INTO v_identification FROM public.video_identifications
    WHERE user_id = p_user_id AND organization_id = p_organization_id
    ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.video_identifications
        (user_id, organization_id, status, verified_by, verified_at)
      VALUES (p_user_id, p_organization_id, 'verified', p_actor_id, now())
      RETURNING * INTO v_identification;
    ELSIF v_identification.status <> 'verified' OR v_identification.verified_by IS NULL OR v_identification.verified_at IS NULL THEN
      UPDATE public.video_identifications SET status = 'verified', verified_by = p_actor_id,
        verified_at = now(), rejection_reason = NULL
      WHERE id = v_identification.id RETURNING * INTO v_identification;
    END IF;
  END IF;
  RETURN jsonb_build_object('success', true, 'user_id', p_user_id,
    'organization_id', p_organization_id, 'identity_confirmed', p_confirm_identity IS TRUE,
    'identification_id', v_identification.id);
END;
$function$;

REVOKE ALL ON FUNCTION public.save_student_registration_details(uuid, uuid, uuid, text, text, date, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_student_registration_details(uuid, uuid, uuid, text, text, date, boolean) TO service_role;
