-- UC012 security prerequisite: FRDO write authority is separate from OCR processing.
-- No data backfill, legal verification, admission decision, notification or number allocation.
DO $preflight$ BEGIN
 IF(SELECT count(*)<>29 OR md5(jsonb_agg(jsonb_build_array(column_name,udt_name,is_nullable,column_default) ORDER BY column_name)::text)<>'5b37bda17b96827a701218ba819e3313' FROM information_schema.columns WHERE table_schema='public' AND table_name='student_frdo_data') THEN RAISE EXCEPTION 'FRDO write: unreviewed factual column schema';END IF;
 IF EXISTS(SELECT 1 FROM(VALUES
 ('public.save_student_frdo_data(uuid,uuid,jsonb)','be41cf663726f16f9552211112949895'),
 ('public.save_student_registration_details(uuid,uuid,uuid,text,text,date,boolean)','ce46926124398999b7afab7d1c8b1d12'),
 ('public.sync_frdo_name_from_profile()','f137a55572406a9488b7146453ab0cc0'),
 ('public.auto_create_education_document()','2d8d598ea6a1b372292c04a688f52221'),
 ('public.is_student_profile(uuid,uuid)','92c79c1ec4600ef54941dc9590b39aa8'),
 ('public.is_org_owner(uuid,uuid)','362aca6afc26c775be594843258b2ab2'),
 ('public.has_org_staff_permission(uuid,uuid,text)','3d1fedafe94778fa19dd47acb71a3782'),
 ('public.get_org_staff_permissions(uuid,uuid)','c0ea40b20bbd1a71aa31cdbcbb7fc0b3'),
 ('public.uc_platform_document_action_allowed(uuid,text)','e5a1436d0cc46218d379c3ffec8c0d0d'),
 ('public.uc_document_student_scope_allowed(uuid,uuid)','9f92bb0ec735fb21e62ca5b342c5672c'),
 ('public.uc_document_scope_allowed(uuid,uuid,uuid)','2a7407e7d178c7561b1d390f0884c6b6'),
 ('public.uc_document_teacher_limited(uuid)','72cdbafda69c66500e0d9ae87e8ae403'),
 ('public.account_deletion_subject_write_guard()','cd0003cc49bdf9a3d074c9e624146e46')
 ) f(signature,hash) WHERE to_regprocedure(signature) IS NULL OR md5(pg_get_functiondef(to_regprocedure(signature)))<>hash) THEN RAISE EXCEPTION 'FRDO write: unreviewed authority or writer baseline';END IF;
 IF(SELECT count(*) FROM pg_policies p WHERE schemaname='public' AND tablename='student_frdo_data' AND(
  policyname='Org admins can manage students FRDO data' AND md5(to_jsonb(p)::text)='7820af4d5a09642908ea9ee6d9aa2236'
  OR policyname='Students can update their own FRDO data' AND md5(to_jsonb(p)::text)='7cc79968c36d3f07a73881fa29396c29'
  OR policyname='Students can view their own FRDO data' AND md5(to_jsonb(p)::text)='ea9e7417c73032e217838737ef24588b'
  OR policyname='account_deletion_no_revoked_access' AND md5(to_jsonb(p)::text)='8b0f260786f1217612a6a999e8232f1d'
  OR policyname='uc_document_assigned_read' AND md5(to_jsonb(p)::text)='42c7cf82ad2a6b558556cf6c937150ec'))<>5 THEN RAISE EXCEPTION 'FRDO write: unreviewed policy baseline';END IF;
END $preflight$;

-- UUID/authority metadata only. Trusted wrappers delete contexts before return;
-- exception/transaction rollback removes them on failure. No personal values are stored.
CREATE TABLE public.uc_student_frdo_write_contexts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),transaction_id bigint NOT NULL DEFAULT txid_current(),backend_pid integer NOT NULL DEFAULT pg_backend_pid(),
 kind text NOT NULL CHECK(kind IN('registration_details','profile_name_sync')),organization_id uuid NOT NULL,user_id uuid NOT NULL,
 actor_id uuid,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(kind<>'registration_details' OR actor_id IS NOT NULL)
);
ALTER TABLE public.uc_student_frdo_write_contexts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.uc_student_frdo_write_contexts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.uc_student_frdo_pair_valid(p_org uuid,p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT p_org IS NOT NULL AND p_user IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.organizations WHERE id=p_org)
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user AND p.organization_id=p_org AND p.archived_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user AND p.organization_id IS DISTINCT FROM p_org)
 AND public.is_student_profile(p_user,p_org)
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)
$fn$;
CREATE FUNCTION public.uc_student_frdo_staff_org_allowed(p_actor uuid,p_org uuid,p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT p_actor IS NOT NULL AND p_org IS NOT NULL AND p_permission IN('frdo.write','students.write','documents.write')
 AND EXISTS(SELECT 1 FROM public.organizations WHERE id=p_org)
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_actor)
 AND public.uc_platform_document_action_allowed(p_actor,'write')
  AND NOT public.has_role(p_actor,'sales_manager'::public.app_role)
  AND NOT EXISTS(SELECT 1 FROM public.admin_staff a WHERE a.user_id=p_actor AND(a.role NOT IN('super_admin','admin') OR a.expires_at<=now()))
  AND(public.has_role(p_actor,'admin'::public.app_role) OR public.is_org_owner(p_actor,p_org)
   OR EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=p_actor AND s.organization_id=p_org AND(s.expires_at IS NULL OR s.expires_at>now()))
     AND public.has_org_staff_permission(p_actor,p_org,p_permission))
$fn$;
CREATE FUNCTION public.uc_student_frdo_staff_can_write(p_actor uuid,p_org uuid,p_user uuid,p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT public.uc_student_frdo_staff_org_allowed(p_actor,p_org,p_permission) AND public.uc_student_frdo_pair_valid(p_org,p_user)
 AND(
   public.has_role(p_actor,'admin'::public.app_role) OR public.is_org_owner(p_actor,p_org)
   OR NOT EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=p_actor AND s.role='teacher')
   OR EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=p_actor AND s.organization_id=p_org AND s.role<>'teacher' AND(s.expires_at IS NULL OR s.expires_at>now()))
   OR EXISTS(SELECT 1 FROM public.org_staff s JOIN public.org_staff_document_groups a ON a.staff_id=s.id AND a.organization_id=s.organization_id
    JOIN public.student_groups g ON g.id=a.group_id AND g.organization_id=a.organization_id
    JOIN public.student_group_memberships_effective m ON m.group_id=g.id AND m.organization_id=g.organization_id AND m.user_id=p_user
    WHERE s.user_id=p_actor AND s.organization_id=p_org AND(s.expires_at IS NULL OR s.expires_at>now())
     AND(g.course_id IS NULL OR EXISTS(SELECT 1 FROM public.courses c WHERE c.id=g.course_id AND c.organization_id=p_org)))
  )
$fn$;
CREATE FUNCTION public.uc_student_frdo_actor_can_write(p_actor uuid,p_org uuid,p_user uuid,p_allow_self boolean DEFAULT true)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT p_actor IS NOT NULL AND public.uc_student_frdo_pair_valid(p_org,p_user)
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_actor)
 AND public.uc_platform_document_action_allowed(p_actor,'write')
 AND NOT public.has_role(p_actor,'sales_manager'::public.app_role)
 AND NOT EXISTS(SELECT 1 FROM public.admin_staff a WHERE a.user_id=p_actor AND(a.role NOT IN('super_admin','admin') OR a.expires_at<=now()))
 AND(p_allow_self AND p_actor=p_user OR public.uc_student_frdo_staff_can_write(p_actor,p_org,p_user,'frdo.write'))
$fn$;
CREATE FUNCTION public.can_write_student_frdo_data(p_organization_id uuid,p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(auth.role()='authenticated' AND public.uc_student_frdo_actor_can_write(auth.uid(),p_organization_id,p_user_id,true),false)
$fn$;
CREATE FUNCTION public.can_prepare_student_registration_details(p_organization_id uuid,p_group_id uuid,p_with_frdo boolean,p_confirm_identity boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(auth.role()='authenticated' AND p_with_frdo IS NOT NULL AND p_confirm_identity IS NOT NULL
 AND public.uc_student_frdo_staff_org_allowed(auth.uid(),p_organization_id,'students.write')
 AND(NOT p_with_frdo OR public.uc_student_frdo_staff_org_allowed(auth.uid(),p_organization_id,'frdo.write'))
 AND(NOT p_confirm_identity OR public.uc_student_frdo_staff_org_allowed(auth.uid(),p_organization_id,'documents.write'))
 AND public.uc_document_scope_allowed(p_organization_id,p_group_id,NULL),false)
$fn$;
CREATE FUNCTION public.uc_student_frdo_delete_allowed(p_org uuid,p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 SELECT coalesce(auth.role()='authenticated' AND public.uc_student_frdo_actor_can_write(auth.uid(),p_org,p_user,false),false)
$fn$;
CREATE FUNCTION public.uc_student_frdo_fields_match(p_new jsonb,p_old jsonb,p_fields text[])
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $fn$
 SELECT CASE WHEN p_old IS NULL THEN
  (p_new-ARRAY['id','user_id','organization_id','created_at','updated_at']-p_fields)=
  (to_jsonb(jsonb_populate_record(NULL::public.student_frdo_data,'{"citizenship_code":"643","training_form":"Очная","financing_source":"Платное обучение","education_form":"в образовательной организации"}'::jsonb))-ARRAY['id','user_id','organization_id','created_at','updated_at']-p_fields)
 ELSE(p_new-p_fields-'updated_at')=(p_old-p_fields-'updated_at') END
$fn$;
CREATE FUNCTION public.uc_student_frdo_registration_stub(p_row jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 WITH names AS(SELECT regexp_split_to_array(btrim(p.full_name),'\s+') parts FROM public.profiles p WHERE p.user_id=(p_row->>'user_id')::uuid AND p.organization_id=(p_row->>'organization_id')::uuid AND nullif(btrim(p.full_name),'') IS NOT NULL)
 SELECT coalesce((SELECT(p_row->>'last_name',p_row->>'first_name',p_row->>'middle_name',p_row->>'gender') IS NOT DISTINCT FROM
  (coalesce(parts[1],''),coalesce(parts[2],''),coalesce(parts[3],''),CASE WHEN lower(parts[3]) ~ '(ич|ыч)$' THEN 'Муж' WHEN lower(parts[3]) ~ 'на$' THEN 'Жен' END) FROM names),false)
$fn$;
CREATE FUNCTION public.uc_guard_student_frdo_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE n jsonb;o jsonb;c public.uc_student_frdo_write_contexts;v_org uuid;v_user uuid;
BEGIN
 IF TG_OP='DELETE' THEN
  -- Retain the existing trusted account-erasure route, not a general service DELETE.
  IF auth.role()='service_role' AND auth.uid() IS NULL
   AND current_setting('sintagma.account_deletion_erase_user',true)=OLD.user_id::text
   AND EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=OLD.user_id) THEN RETURN OLD;END IF;
  IF public.uc_student_frdo_delete_allowed(OLD.organization_id,OLD.user_id) THEN RETURN OLD;END IF;
  RAISE EXCEPTION 'frdo_write_access_denied' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF(NEW.id,NEW.user_id,NEW.organization_id,NEW.created_at) IS DISTINCT FROM(OLD.id,OLD.user_id,OLD.organization_id,OLD.created_at)
  THEN RAISE EXCEPTION 'frdo_identity_is_immutable' USING ERRCODE='42501';END IF;
  o:=to_jsonb(OLD);
 END IF;
 n:=to_jsonb(NEW);v_org:=NEW.organization_id;v_user:=NEW.user_id;
 IF public.can_write_student_frdo_data(v_org,v_user) THEN RETURN NEW;END IF;
 IF auth.role()='service_role' AND auth.uid() IS NULL AND public.uc_student_frdo_pair_valid(v_org,v_user) THEN
  SELECT * INTO c FROM public.uc_student_frdo_write_contexts WHERE transaction_id=txid_current() AND backend_pid=pg_backend_pid() AND organization_id=v_org AND user_id=v_user ORDER BY created_at DESC,id DESC LIMIT 1;
  IF FOUND THEN
   IF c.kind='registration_details' AND public.uc_student_frdo_actor_can_write(c.actor_id,v_org,v_user,false)
    AND public.uc_student_frdo_fields_match(n,o,ARRAY['snils','birth_date']) THEN RETURN NEW;END IF;
   IF c.kind='profile_name_sync' AND TG_OP='UPDATE' AND public.uc_student_frdo_fields_match(n,o,ARRAY['last_name','first_name','middle_name']) THEN RETURN NEW;END IF;
  ELSIF public.uc_student_frdo_registration_stub(n) AND public.uc_student_frdo_fields_match(n,o,ARRAY['last_name','first_name','middle_name','gender'])
   AND(TG_OP='INSERT' OR NOT EXISTS(SELECT 1 FROM unnest(ARRAY['last_name','first_name','middle_name','gender']) key WHERE nullif(btrim(o->>key),'') IS NOT NULL AND(o->>key) IS DISTINCT FROM(n->>key))) THEN
   -- Existing register-student service caller: names/gender derived from its
   -- exact current student profile only; preserve existing manual name/gender
   -- overrides and never accept passport, education or review facts.
   RETURN NEW;
  END IF;
 END IF;
 RAISE EXCEPTION 'frdo_write_access_denied' USING ERRCODE='42501';
END;$fn$;
CREATE TRIGGER uc_student_frdo_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.student_frdo_data FOR EACH ROW EXECUTE FUNCTION public.uc_guard_student_frdo_write();

-- Keep all previous SELECT policies and legacy read/history behavior. Restrictive
-- fences close every overlapping mutation policy; explicit writers can read the
-- same exact row they are already authorized to edit, enabling partial upserts.
CREATE POLICY uc_frdo_authorized_writer ON public.student_frdo_data FOR ALL TO authenticated
 USING(public.can_write_student_frdo_data(organization_id,user_id)) WITH CHECK(public.can_write_student_frdo_data(organization_id,user_id));
CREATE POLICY uc_frdo_insert_boundary ON public.student_frdo_data AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(public.can_write_student_frdo_data(organization_id,user_id));
CREATE POLICY uc_frdo_update_boundary ON public.student_frdo_data AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(public.can_write_student_frdo_data(organization_id,user_id)) WITH CHECK(public.can_write_student_frdo_data(organization_id,user_id));
CREATE POLICY uc_frdo_delete_boundary ON public.student_frdo_data AS RESTRICTIVE FOR DELETE TO authenticated
 USING(public.uc_student_frdo_delete_allowed(organization_id,user_id));

-- Preserve full-form RPC data semantics. Only its caller gate changes; per-field
-- passport/OCR upserts remain partial and are independently protected above.
DO $rpc$ DECLARE src text;needle text;replacement text;BEGIN
 src:=pg_get_functiondef('public.save_student_frdo_data(uuid,uuid,jsonb)'::regprocedure);
 needle:=$old$  IF auth.uid() IS NULL THEN$old$;
 replacement:=$new$  IF auth.uid() IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' OR NOT public.account_deletion_access_allowed() THEN$new$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'FRDO RPC auth marker changed';END IF;src:=replace(src,needle,replacement);
 needle:=$old$  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.organization_id = p_organization_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.org_staff s
      WHERE s.user_id = auth.uid()
        AND s.organization_id = p_organization_id
        AND (s.expires_at IS NULL OR s.expires_at > now())
    )
  ) THEN$old$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'FRDO RPC authority marker changed';END IF;
 src:=replace(src,needle,'  IF NOT public.can_write_student_frdo_data(p_organization_id,p_user_id) THEN');EXECUTE src;
END $rpc$;

DO $registration$ DECLARE src text;needle text;BEGIN
 src:=pg_get_functiondef('public.save_student_registration_details(uuid,uuid,uuid,text,text,date,boolean)'::regprocedure);
 needle:=$old$  IF p_actor_id IS NULL OR NOT (
    public.has_role(p_actor_id, 'admin'::public.app_role)
    OR public.is_org_owner(p_actor_id, p_organization_id)
    OR (EXISTS (SELECT 1 FROM public.org_staff s WHERE s.user_id = p_actor_id
      AND s.organization_id = p_organization_id AND (s.expires_at IS NULL OR s.expires_at > now()))
      AND public.has_org_staff_permission(p_actor_id, p_organization_id, 'students.write'))
  ) THEN$old$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'Registration staff authority marker changed';END IF;
 src:=replace(src,needle,$new$  IF NOT public.uc_student_frdo_staff_can_write(p_actor_id,p_organization_id,p_user_id,'students.write')
    OR(p_confirm_identity IS TRUE AND NOT public.uc_student_frdo_staff_can_write(p_actor_id,p_organization_id,p_user_id,'documents.write')) THEN$new$);
 needle:='  v_identification public.video_identifications;';IF position(needle IN src)=0 THEN RAISE EXCEPTION 'Registration declaration marker changed';END IF;
 src:=replace(src,needle,needle||E'\n  v_frdo_context uuid;');
 needle:=$old$  IF v_snils IS NOT NULL OR p_birth_date IS NOT NULL THEN
    INSERT INTO public.student_frdo_data$old$;
 IF position(needle IN src)=0 THEN RAISE EXCEPTION 'Registration FRDO entry marker changed';END IF;
 src:=replace(src,needle,$new$  IF v_snils IS NOT NULL OR p_birth_date IS NOT NULL THEN
    IF auth.role() IS DISTINCT FROM 'service_role' OR auth.uid() IS NOT NULL OR NOT public.uc_student_frdo_actor_can_write(p_actor_id,p_organization_id,p_user_id,false) THEN
      RAISE EXCEPTION 'frdo_write_access_denied' USING ERRCODE='42501';
    END IF;
    INSERT INTO public.uc_student_frdo_write_contexts(kind,organization_id,user_id,actor_id)
    VALUES('registration_details',p_organization_id,p_user_id,p_actor_id) RETURNING id INTO v_frdo_context;
    INSERT INTO public.student_frdo_data$new$);
 needle:='      birth_date = COALESCE(EXCLUDED.birth_date, existing.birth_date);';IF position(needle IN src)=0 THEN RAISE EXCEPTION 'Registration FRDO exit marker changed';END IF;
 src:=replace(src,needle,needle||E'\n    DELETE FROM public.uc_student_frdo_write_contexts WHERE id=v_frdo_context;');EXECUTE src;
END $registration$;

-- The organization lock must precede the programme roster lock in both issuers.
-- Move the existing lock only; preserve all completion, provenance and counter guards.
DO $issuance_lock$ DECLARE src text;lock_line text;source_line text;BEGIN
 src:=pg_get_functiondef('public.auto_create_education_document()'::regprocedure);
 lock_line:='  PERFORM pg_advisory_xact_lock(hashtextextended(v_course.organization_id::text, 0));';
 source_line:='  v_program_source:=public.uc_program_issuance_source(v_course.organization_id,v_group_id,NEW.id,NEW.user_id,NEW.course_id);';
 IF (length(src)-length(replace(src,lock_line,'')))/length(lock_line)<>1 OR position(source_line IN src)=0 OR position(lock_line IN src)<position(source_line IN src) THEN RAISE EXCEPTION 'FRDO release: unreviewed issuance lock order';END IF;
 src:=replace(src,lock_line||E'\n','');src:=replace(src,source_line,lock_line||E'\n'||source_line);EXECUTE src;
END $issuance_lock$;

CREATE OR REPLACE FUNCTION public.sync_frdo_name_from_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE parts text[];old_parts text[];ctx uuid;
BEGIN
 IF NEW.full_name IS NULL OR btrim(NEW.full_name)='' OR OLD.full_name IS NOT DISTINCT FROM NEW.full_name
  OR NOT public.uc_student_frdo_pair_valid(NEW.organization_id,NEW.user_id) THEN RETURN NEW;END IF;
 IF auth.uid() IS NOT NULL THEN
  -- Editing a profile without FRDO authority must not silently edit FRDO facts.
  IF NOT public.uc_student_frdo_actor_can_write(auth.uid(),NEW.organization_id,NEW.user_id,true) THEN RETURN NEW;END IF;
 ELSIF auth.role() IS DISTINCT FROM 'service_role' THEN RETURN NEW;
 END IF;
 parts:=regexp_split_to_array(btrim(NEW.full_name),'\s+');old_parts:=regexp_split_to_array(btrim(coalesce(OLD.full_name,'')),'\s+');
 INSERT INTO public.uc_student_frdo_write_contexts(kind,organization_id,user_id,actor_id)VALUES('profile_name_sync',NEW.organization_id,NEW.user_id,auth.uid()) RETURNING id INTO ctx;
 UPDATE public.student_frdo_data f SET
  last_name=CASE WHEN coalesce(f.last_name,'') IN('',coalesce(old_parts[1],'')) THEN coalesce(parts[1],'') ELSE f.last_name END,
  first_name=CASE WHEN coalesce(f.first_name,'') IN('',coalesce(old_parts[2],'')) THEN coalesce(parts[2],'') ELSE f.first_name END,
  middle_name=CASE WHEN coalesce(f.middle_name,'') IN('',coalesce(old_parts[3],'')) THEN coalesce(parts[3],'') ELSE f.middle_name END,
  updated_at=now()
 WHERE f.user_id=NEW.user_id AND f.organization_id=NEW.organization_id;
 DELETE FROM public.uc_student_frdo_write_contexts WHERE id=ctx;RETURN NEW;
END;$fn$;

DO $grants$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(
  'uc_student_frdo_pair_valid','uc_student_frdo_staff_org_allowed','uc_student_frdo_staff_can_write','uc_student_frdo_actor_can_write','can_write_student_frdo_data','can_prepare_student_registration_details','uc_student_frdo_delete_allowed','uc_student_frdo_fields_match','uc_student_frdo_registration_stub','uc_guard_student_frdo_write') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.oid::regprocedure);
  IF f.proname IN('can_write_student_frdo_data','can_prepare_student_registration_details','uc_student_frdo_delete_allowed') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.oid::regprocedure);END IF;
 END LOOP;
END $grants$;
