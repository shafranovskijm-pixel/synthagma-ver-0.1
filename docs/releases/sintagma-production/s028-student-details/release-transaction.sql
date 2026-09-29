-- S028 ONLY. Prepared locally; execution requires the selected production project.
-- Original source 4876 bytes; SHA256 d1d72f75a1c843f4bd4f1ca65bec63b65f579af474be27f7935927aaec15ff24.
-- No learner rows are intentionally modified by this schema migration.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(hashtextextended('sintagma-production-release',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $s028_release$
DECLARE
 v_failures text;
 v_previous_department_metadata jsonb;
 v_source text := $s028_exact_migration$-- Staff registration/import fields. Profession intentionally awaits the client's clarification.
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
$s028_exact_migration$;
BEGIN
 IF md5(v_source) <> '8c9402bfaeb72420586be5a67ded3476' THEN RAISE EXCEPTION 'S028 embedded source changed'; END IF;
 WITH required_columns(relation_name,column_name) AS (VALUES
 ('public.profiles','user_id'),('public.profiles','organization_id'),('public.profiles','archived_at'),
 ('public.student_frdo_data','user_id'),('public.student_frdo_data','organization_id'),('public.student_frdo_data','snils'),('public.student_frdo_data','birth_date'),
 ('public.org_staff','user_id'),('public.org_staff','organization_id'),('public.org_staff','expires_at'),
 ('public.video_identifications','id'),('public.video_identifications','user_id'),('public.video_identifications','organization_id'),
 ('public.video_identifications','status'),('public.video_identifications','created_at'),('public.video_identifications','verified_by'),
 ('public.video_identifications','verified_at'),('public.video_identifications','rejection_reason')),
 required_functions(signature) AS (VALUES ('auth.jwt()'),('public.has_role(uuid,public.app_role)'),
 ('public.is_org_owner(uuid,uuid)'),('public.has_org_staff_permission(uuid,uuid,text)'),('public.is_student_profile(uuid,uuid)')),
 checks(check_name,ok) AS (
 SELECT 'required columns exist',NOT EXISTS(SELECT 1 FROM required_columns r WHERE NOT EXISTS(
   SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass(r.relation_name) AND a.attname=r.column_name AND a.attnum>0 AND NOT a.attisdropped))
 UNION ALL SELECT 'required helpers exist',NOT EXISTS(SELECT 1 FROM required_functions WHERE to_regprocedure(signature) IS NULL)
 UNION ALL SELECT 'reviewed owner helper',COALESCE((SELECT md5(replace(prosrc,chr(13)||chr(10),chr(10)))='5894db724b2a3cbc52701cabfb2cf73c' FROM pg_proc WHERE oid=to_regprocedure('public.is_org_owner(uuid,uuid)')),false)
 UNION ALL SELECT 'reviewed student helper',COALESCE((SELECT md5(replace(prosrc,chr(13)||chr(10),chr(10)))='84081e97d17f223d9e2ffa4145bf8949' FROM pg_proc WHERE oid=to_regprocedure('public.is_student_profile(uuid,uuid)')),false)
 UNION ALL SELECT 'API roles exist',NOT EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role')) r(name) WHERE to_regrole(name) IS NULL)
 UNION ALL SELECT 'public schema create permission',has_schema_privilege(current_user,'public','CREATE') AND has_schema_privilege(current_user,'public','USAGE')
 UNION ALL SELECT 'profiles ALTER ownership',COALESCE((SELECT pg_has_role(current_user,relowner,'USAGE') FROM pg_class WHERE oid=to_regclass('public.profiles')),false)
 UNION ALL SELECT 'ledger insert permission',has_table_privilege(current_user,'supabase_migrations.schema_migrations','INSERT')
 UNION ALL SELECT 'FRDO unique user and org',EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.student_frdo_data') AND contype='u' AND pg_get_constraintdef(oid)='UNIQUE (user_id, organization_id)')
 UNION ALL SELECT 'S028 ledger absent',NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260929140000')
 UNION ALL SELECT 'department absent or compatible nullable text',NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.profiles') AND attname='department' AND attnum>0 AND NOT attisdropped AND (atttypid<>'text'::regtype OR attnotnull OR attgenerated<>''))
 UNION ALL SELECT 'S028 RPC absent',to_regprocedure('public.save_student_registration_details(uuid,uuid,uuid,text,text,date,boolean)') IS NULL
 )
 SELECT string_agg(check_name,', ' ORDER BY check_name) INTO v_failures FROM checks WHERE ok IS DISTINCT FROM true;
 IF v_failures IS NOT NULL THEN RAISE EXCEPTION 'S028 preconditions failed: %',v_failures; END IF;
 SELECT jsonb_build_object('exists',true,'type',format_type(atttypid,atttypmod),'nullable',NOT attnotnull,
   'comment',col_description(attrelid,attnum)) INTO v_previous_department_metadata FROM pg_attribute
 WHERE attrelid=to_regclass('public.profiles') AND attname='department' AND attnum>0 AND NOT attisdropped;
 RAISE NOTICE 'S028 previous department metadata: %',COALESCE(v_previous_department_metadata,'{"exists":false}'::jsonb);
 EXECUTE v_source;
 INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
 VALUES('20260929140000','student_registration_details',ARRAY[v_source]);
 WITH f AS (SELECT * FROM pg_proc WHERE oid=to_regprocedure('public.save_student_registration_details(uuid,uuid,uuid,text,text,date,boolean)')),
 checks(check_name,ok) AS (
 SELECT 'department text and nullable',EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.profiles') AND attname='department' AND attnum>0 AND NOT attisdropped AND atttypid='text'::regtype AND NOT attnotnull)
 UNION ALL SELECT 'exact RPC body',COALESCE((SELECT md5(prosrc)='cb2ac19a504c810c9d15e38dd4f9b0f5' FROM f),false)
 UNION ALL SELECT 'RPC security definer',COALESCE((SELECT prosecdef FROM f),false)
 UNION ALL SELECT 'RPC fixed search path',COALESCE((SELECT proconfig @> ARRAY['search_path=public, pg_temp'] FROM f),false)
 UNION ALL SELECT 'anon execute denied',NOT COALESCE((SELECT has_function_privilege('anon',oid,'EXECUTE') FROM f),true)
 UNION ALL SELECT 'authenticated execute denied',NOT COALESCE((SELECT has_function_privilege('authenticated',oid,'EXECUTE') FROM f),true)
 UNION ALL SELECT 'PUBLIC execute denied',NOT EXISTS(SELECT 1 FROM f,LATERAL aclexplode(COALESCE(f.proacl,acldefault('f',f.proowner))) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE')
 UNION ALL SELECT 'service_role execute granted',COALESCE((SELECT has_function_privilege('service_role',oid,'EXECUTE') FROM f),false)
 UNION ALL SELECT 'exact ledger row',EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260929140000' AND name='student_registration_details' AND array_length(statements,1)=1 AND md5(statements[1])='8c9402bfaeb72420586be5a67ded3476')
 )
 SELECT string_agg(check_name,', ' ORDER BY check_name) INTO v_failures FROM checks WHERE ok IS DISTINCT FROM true;
 IF v_failures IS NOT NULL THEN RAISE EXCEPTION 'S028 postconditions failed: %',v_failures; END IF;
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260929140000'
   AND name='student_registration_details' AND statements IS NOT DISTINCT FROM ARRAY[v_source]) THEN
   RAISE EXCEPTION 'S028 exact ledger source mismatch';
 END IF;
END;
$s028_release$;
NOTIFY pgrst,'reload schema';
COMMIT;
