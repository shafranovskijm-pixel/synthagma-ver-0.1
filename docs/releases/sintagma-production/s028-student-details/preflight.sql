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
SELECT check_name,ok FROM checks ORDER BY check_name;
