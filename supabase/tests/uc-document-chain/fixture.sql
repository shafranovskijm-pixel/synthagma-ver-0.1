-- Synthetic isolated lab only. Existing19Nov authority definitions and enrollment/source fences are copied exactly.
-- Billing hold, source-file availability and program availability are explicit fixture collaborators.
-- No production tokens, claims, documents or data. Never run this fixture against production.
SET check_function_bodies=off;
DO $roles$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon;END IF;IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated;END IF;IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role;END IF;END;$roles$;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
 GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
 CREATE TYPE app_role AS ENUM('admin','organization','student','company','sales_manager');
 CREATE TABLE organizations(id uuid PRIMARY KEY,name text); CREATE TABLE profiles(user_id uuid PRIMARY KEY,organization_id uuid,full_name text,archived_at timestamptz,blocked_at timestamptz);
 CREATE TABLE user_roles(user_id uuid,role app_role); CREATE TABLE org_staff(id uuid PRIMARY KEY,user_id uuid,organization_id uuid,role text,sections_access jsonb DEFAULT '[]',expires_at timestamptz);
 CREATE TABLE admin_staff(user_id uuid,role text,expires_at timestamptz); CREATE TABLE account_deletion_revocations(user_id uuid);
 CREATE TABLE courses(id uuid PRIMARY KEY,organization_id uuid,title text); CREATE TABLE lessons(id uuid PRIMARY KEY,course_id uuid,title text,type text,content text);
 CREATE TABLE enrollments(id uuid PRIMARY KEY,user_id uuid,course_id uuid,learning_progress_reset_at timestamptz,learning_progress_epoch bigint DEFAULT 0,UNIQUE(user_id,course_id));
 CREATE TABLE student_groups(id uuid PRIMARY KEY,organization_id uuid,course_id uuid,name text);
 CREATE TABLE student_group_memberships_effective(organization_id uuid,group_id uuid,user_id uuid);
 CREATE TABLE org_staff_document_groups(staff_id uuid,organization_id uuid,group_id uuid);
 CREATE TABLE lesson_progress(id uuid PRIMARY KEY,user_id uuid,lesson_id uuid,completed boolean,completed_at timestamptz);
 CREATE TABLE test_attempts(id uuid PRIMARY KEY,user_id uuid,lesson_id uuid,session_id uuid,completed_at timestamptz,score integer,max_score integer,passed boolean,answers jsonb);
 CREATE TABLE homework_submissions(id uuid PRIMARY KEY,organization_id uuid,student_id uuid,course_id uuid,lesson_id uuid,status text,score integer,reviewed_at timestamptz,submitted_at timestamptz,content text,attachments jsonb,reviewer_comment text,learning_progress_epoch bigint DEFAULT 0);
 CREATE TABLE group_program_enrollment_snapshots(id uuid PRIMARY KEY,organization_id uuid,group_id uuid,enrollment_id uuid,user_id uuid,course_id uuid,version_id uuid);
 CREATE TABLE uc_learning_outcome_states(id uuid PRIMARY KEY,organization_id uuid,enrollment_id uuid,user_id uuid,course_id uuid,group_id uuid,criteria_id uuid,program_version_id uuid,program_enrollment_snapshot_id uuid,decision_id uuid);
 CREATE TABLE uc_learning_criteria_versions(id uuid PRIMARY KEY,organization_id uuid,course_id uuid,program_version_id uuid,state text,redacted boolean DEFAULT false,revision bigint,definition jsonb);
 CREATE TABLE uc_learning_attempt_contexts(session_id uuid,user_id uuid,lesson_id uuid,state_id uuid,criteria_id uuid,binding_state text,scope jsonb);
 CREATE TABLE uc_learning_attestation_decisions(id uuid PRIMARY KEY,state_id uuid,organization_id uuid,user_id uuid,redacted boolean DEFAULT false,recorded_at timestamptz,outcome text,revision_created bigint);
 CREATE TABLE uc_conducted_sessions(id uuid PRIMARY KEY,organization_id uuid,course_id uuid,group_id uuid,lesson_id uuid);
 CREATE TABLE uc_conducted_session_versions(id uuid PRIMARY KEY,session_id uuid,organization_id uuid,redacted boolean DEFAULT false,revision bigint,attendance jsonb,starts_at timestamptz);
 CREATE TABLE uc_automatic_admission_drafts(id uuid PRIMARY KEY,organization_id uuid,enrollment_id uuid,user_id uuid,course_id uuid,group_id uuid,document_date date,recorded_at timestamptz,status text,revision bigint);
 CREATE FUNCTION public.uc_admission_draft_projection(uuid) RETURNS jsonb LANGUAGE sql AS $$SELECT '{"stale":false,"registered_locked":false}'::jsonb$$;
 CREATE TABLE education_document_records(id uuid PRIMARY KEY,organization_id uuid,enrollment_id uuid,user_id uuid,course_id uuid,group_id uuid,deleted_at timestamptz,created_at timestamptz,document_type text,document_number text);
 CREATE TABLE uc_education_issuance_states(record_id uuid PRIMARY KEY,organization_id uuid,user_id uuid,redacted boolean DEFAULT false,annulment jsonb,revision bigint);
 CREATE TABLE uc_document_registry_records(id uuid PRIMARY KEY,organization_id uuid,group_id uuid,scope_group_ids uuid[] DEFAULT '{}',data jsonb,context_binding jsonb,redacted boolean DEFAULT false,registration_id text,status text,registered_at timestamptz,revision bigint);
 CREATE TABLE uc_copy_registry_records(id uuid PRIMARY KEY,organization_id uuid,group_id uuid,data jsonb,redacted boolean DEFAULT false,registration_id text,archived boolean DEFAULT false,registered_at timestamptz,revision bigint,copy_type text);
 CREATE SCHEMA billing_access_private; CREATE TABLE billing_access_private.fixture_actor_holds(user_id uuid); CREATE TABLE billing_access_private.fixture_target_holds(organization_id uuid);
 CREATE FUNCTION billing_access_private.actor_allowed(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT $1 IS NOT NULL AND NOT EXISTS(SELECT 1 FROM billing_access_private.fixture_actor_holds WHERE user_id=$1)$$;
 CREATE FUNCTION billing_access_private.target_allowed(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT billing_access_private.actor_allowed($2) AND NOT EXISTS(SELECT 1 FROM billing_access_private.fixture_target_holds WHERE organization_id=$1)$$;
CREATE OR REPLACE FUNCTION public.org_role_default_permissions(_role text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE _role
    WHEN 'owner' THEN ARRAY[
      'courses.read','courses.write','students.read','students.write',
      'companies.read','companies.write','library.read','library.write',
      'documents.read','documents.write','documents.sign','documents.issue','journals.read','journals.write',
      'frdo.read','frdo.write','labor_safety.read','labor_safety.write',
      'services.read','services.write','staff.read','staff.write',
      'billing.read','billing.write','settings.read','settings.write',
      'chats.read','chats.write','homework.read','homework.write',
      'webinars.read','webinars.write','sales.read','sales.write'
    ]
    WHEN 'admin' THEN ARRAY[
      'courses.read','courses.write','students.read','students.write',
      'companies.read','companies.write','library.read','library.write',
      'documents.read','documents.write','documents.sign','documents.issue','journals.read','journals.write',
      'frdo.read','frdo.write','labor_safety.read','labor_safety.write',
      'services.read','services.write','staff.read',
      'billing.read','settings.read',
      'chats.read','chats.write','homework.read','homework.write',
      'webinars.read','webinars.write','sales.read'
    ]
    WHEN 'school_editor' THEN ARRAY[
      'courses.read','courses.write','library.read','library.write',
      'documents.read','services.read','services.write',
      'settings.read','webinars.read','webinars.write'
    ]
    WHEN 'course_editor' THEN ARRAY[
      'courses.read','courses.write','library.read','library.write',
      'documents.read','webinars.read'
    ]
    WHEN 'teacher' THEN ARRAY[
      'courses.read','students.read','library.read','chats.read','chats.write',
      'homework.read','homework.write','documents.read','journals.read'
    ]
    WHEN 'sales_manager' THEN ARRAY[
      'sales.read','sales.write','companies.read','companies.write',
      'services.read','documents.read','chats.read','chats.write','students.read'
    ]
    ELSE ARRAY[]::text[]
  END
$function$;

CREATE OR REPLACE FUNCTION public.get_org_staff_permissions(_user_id uuid, _organization_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  staff_role text;
  base_perms text[];
  override_perms text[];
BEGIN
  SELECT role,
         COALESCE(
           ARRAY(SELECT jsonb_array_elements_text(sections_access)),
           ARRAY[]::text[]
         )
    INTO staff_role, override_perms
    FROM public.org_staff
   WHERE user_id = _user_id AND organization_id = _organization_id
   LIMIT 1;

  IF staff_role IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;

  base_perms := public.org_role_default_permissions(staff_role);

  -- merge: union of base + overrides (overrides могут только добавлять права)
  RETURN ARRAY(
    SELECT DISTINCT unnest(base_perms || override_perms)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_org_staff_permission(_user_id uuid, _organization_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH perms AS (
    SELECT unnest(public.get_org_staff_permissions(_user_id, _organization_id)) AS permission
  )
  SELECT billing_access_private.target_allowed(_organization_id,_user_id) AND EXISTS (
    SELECT 1
    FROM perms
    WHERE permission = _permission
       OR permission = public.normalize_org_staff_permission(_permission)
       OR public.normalize_org_staff_permission(permission) = public.normalize_org_staff_permission(_permission)
  )
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_role app_role, _user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN billing_access_private.actor_allowed(_user_id) AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT billing_access_private.actor_allowed(_user_id) AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$function$;

CREATE OR REPLACE FUNCTION public.is_org_owner(_user_id uuid, _organization_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT billing_access_private.target_allowed(_organization_id,_user_id) AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = 'organization'::public.app_role
      AND p.organization_id = _organization_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.org_staff os
        WHERE os.user_id = _user_id
          AND os.organization_id = _organization_id
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_student_profile(_target_user_id uuid, _org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    _target_user_id IS NOT NULL
    AND _org_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _target_user_id
        AND role IN ('admin', 'organization', 'company', 'sales_manager')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.org_staff
      WHERE user_id = _target_user_id
        AND organization_id = _org_id
        AND (expires_at IS NULL OR expires_at > now())
    );
$function$;

CREATE OR REPLACE FUNCTION public.normalize_org_staff_permission(_permission text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _permission IS NULL THEN NULL
    WHEN _permission LIKE '%.view'   THEN regexp_replace(_permission, '\.view$',   '.read')
    WHEN _permission LIKE '%.manage' THEN regexp_replace(_permission, '\.manage$', '.write')
    ELSE _permission
  END
$function$;

CREATE OR REPLACE FUNCTION public.uc_document_has_action(p_org uuid, p_action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT public.uc_platform_document_action_allowed(auth.uid(),p_action)
  AND public.account_deletion_access_allowed()
  AND p_org IS NOT NULL AND p_action IN ('read','write','sign','issue')
  AND coalesce(public.can_access_organization(p_org,'documents.'||p_action),false)
$function$;

CREATE OR REPLACE FUNCTION public.account_deletion_access_allowed()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=auth.uid())
   AND billing_access_private.actor_allowed(auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.can_access_organization(_organization_id uuid, _permission text DEFAULT 'settings.read'::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.account_deletion_access_allowed()
    AND billing_access_private.target_allowed(_organization_id,auth.uid())
    AND _organization_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.profiles p ON p.user_id = ur.user_id
        WHERE ur.user_id = auth.uid()
          AND ur.role = 'organization'::public.app_role
          AND p.organization_id = _organization_id
          AND NOT EXISTS (
            SELECT 1
            FROM public.org_staff os
            WHERE os.user_id = auth.uid()
              AND os.organization_id = _organization_id
          )
      )
      OR (
        _permission IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.org_staff os
          WHERE os.user_id = auth.uid()
            AND os.organization_id = _organization_id
            AND (os.expires_at IS NULL OR os.expires_at > now())
        )
        AND public.has_org_staff_permission(auth.uid(), _organization_id, _permission)
      )
    )
$function$;

CREATE OR REPLACE FUNCTION public.is_user_blocked(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT NOT billing_access_private.actor_allowed(_user_id) OR EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = _user_id AND blocked_at IS NOT NULL
  );
$function$;

CREATE OR REPLACE FUNCTION public.uc_document_org_access(p_org uuid, p_write boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT public.uc_document_has_action(p_org,CASE WHEN p_write THEN 'write' ELSE 'read' END)
$function$;

CREATE OR REPLACE FUNCTION public.uc_document_record_scope(p_org uuid, p_group uuid, p_enrollment uuid, p_user uuid, p_course uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 IF p_enrollment IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id
  WHERE e.id=p_enrollment AND c.organization_id=p_org AND (p_user IS NULL OR e.user_id=p_user) AND (p_course IS NULL OR e.course_id=p_course)) THEN RETURN false; END IF;
 IF p_course IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.courses c WHERE c.id=p_course AND c.organization_id=p_org) THEN RETURN false; END IF;
 IF p_group IS NOT NULL AND p_course IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.student_groups g WHERE g.id=p_group AND g.organization_id=p_org AND g.course_id=p_course) THEN RETURN false; END IF;
 IF p_group IS NOT NULL AND p_user IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.student_group_memberships_effective m
  WHERE m.organization_id=p_org AND m.group_id=p_group AND m.user_id=p_user) THEN RETURN false; END IF;
 RETURN public.uc_document_scope_allowed(p_org,p_group,p_enrollment);
END;$function$;

CREATE OR REPLACE FUNCTION public.uc_document_scope_allowed(p_org uuid, p_group uuid DEFAULT NULL::uuid, p_enrollment uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_user uuid;v_course uuid;v_group_course uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.account_deletion_access_allowed() OR p_org IS NULL
 OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=p_org) THEN RETURN false; END IF;
 IF p_group IS NOT NULL THEN
  SELECT course_id INTO v_group_course FROM public.student_groups WHERE id=p_group AND organization_id=p_org;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_group_course IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.courses c WHERE c.id=v_group_course AND c.organization_id=p_org) THEN RETURN false; END IF;
 END IF;
 IF p_enrollment IS NOT NULL THEN
  SELECT e.user_id,e.course_id INTO v_user,v_course FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id
   WHERE e.id=p_enrollment AND c.organization_id=p_org;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_group IS NOT NULL AND (v_group_course IS DISTINCT FROM v_course OR NOT EXISTS(
   SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id=p_org AND m.group_id=p_group AND m.user_id=v_user))
  THEN RETURN false; END IF;
 END IF;
 IF public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_org_owner(auth.uid(),p_org) THEN RETURN true; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.org_staff s WHERE s.organization_id=p_org AND s.user_id=auth.uid()
   AND (s.expires_at IS NULL OR s.expires_at>now())) THEN RETURN false; END IF;
 IF NOT public.uc_document_teacher_limited(p_org) THEN RETURN true; END IF;
 RETURN EXISTS(SELECT 1 FROM public.org_staff s JOIN public.org_staff_document_groups a ON a.staff_id=s.id AND a.organization_id=s.organization_id
  JOIN public.student_groups g ON g.id=a.group_id AND g.organization_id=a.organization_id
  WHERE s.organization_id=p_org AND s.user_id=auth.uid() AND (s.expires_at IS NULL OR s.expires_at>now())
   AND (p_group IS NULL OR g.id=p_group)
   AND (p_enrollment IS NULL OR (g.course_id=v_course AND EXISTS(SELECT 1 FROM public.student_group_memberships_effective m
     WHERE m.organization_id=p_org AND m.group_id=g.id AND m.user_id=v_user)))
   AND (p_group IS NOT NULL OR p_enrollment IS NOT NULL));
END;$function$;

CREATE OR REPLACE FUNCTION public.uc_document_student_scope_allowed(p_org uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT auth.uid() IS NOT NULL AND public.account_deletion_access_allowed() AND (
 p_user=auth.uid() OR (NOT public.uc_document_teacher_limited(p_org)) OR EXISTS(
  SELECT 1 FROM public.student_group_memberships_effective m
  WHERE m.organization_id=p_org AND m.user_id=p_user AND public.uc_document_scope_allowed(p_org,m.group_id,NULL)));
$function$;

CREATE OR REPLACE FUNCTION public.uc_document_teacher_limited(p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT NOT public.has_role(auth.uid(),'admin'::public.app_role)
 AND EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=auth.uid() AND s.role='teacher')
 AND NOT public.is_org_owner(auth.uid(),p_org)
 AND NOT EXISTS(SELECT 1 FROM public.org_staff s WHERE s.user_id=auth.uid() AND s.organization_id=p_org AND s.role<>'teacher'
  AND (s.expires_at IS NULL OR s.expires_at>now()));
$function$;

CREATE OR REPLACE FUNCTION public.uc_identification_actor_allowed(p_actor uuid, p_write boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT coalesce(p_actor IS NOT NULL AND p_write IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_actor)
 AND public.uc_platform_document_action_allowed(p_actor,CASE WHEN p_write THEN 'write' ELSE 'read' END)
 AND NOT EXISTS(SELECT 1 FROM public.admin_staff a WHERE a.user_id=p_actor AND(a.expires_at<=now() OR p_write AND a.role NOT IN('super_admin','admin')))
 AND(NOT p_write OR NOT public.has_role(p_actor,'sales_manager'::public.app_role)),false)
$function$;

CREATE OR REPLACE FUNCTION public.uc_identification_target_allowed(p_org uuid, p_user uuid, p_write boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT coalesce(p_org IS NOT NULL AND p_user IS NOT NULL AND p_write IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.organizations WHERE id=p_org)
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user AND p.organization_id=p_org AND(NOT p_write OR p.archived_at IS NULL))
 AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=p_user AND organization_id IS DISTINCT FROM p_org)
 AND public.is_student_profile(p_user,p_org)
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user),false)
$function$;

CREATE OR REPLACE FUNCTION public.uc_platform_document_action_allowed(p_user uuid, p_action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 SELECT p_user IS NOT NULL AND p_action IN ('read','write','sign','issue')
 AND NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)
 AND (NOT public.has_role('admin'::public.app_role,p_user)
  OR NOT EXISTS(SELECT 1 FROM public.admin_staff WHERE user_id=p_user)
  OR EXISTS(SELECT 1 FROM public.admin_staff WHERE user_id=p_user AND
     (role IN ('super_admin','admin') OR p_action='read' AND role IN ('viewer','sales_manager'))
     AND (expires_at IS NULL OR expires_at>now()))
   AND NOT EXISTS(SELECT 1 FROM public.admin_staff WHERE user_id=p_user
     AND (NOT (role IN ('super_admin','admin') OR p_action='read' AND role IN ('viewer','sales_manager')) OR expires_at<=now())))
$function$

SET check_function_bodies=on;
ALTER TABLE public.profiles ADD COLUMN student_group_id uuid;
ALTER TABLE public.enrollments ADD COLUMN status text DEFAULT 'active',ADD COLUMN document_facts_revision bigint DEFAULT 1;
ALTER TABLE public.uc_automatic_admission_drafts ADD COLUMN observed_group_id uuid,ADD COLUMN effective_admission_date date,ADD COLUMN updated_at timestamptz DEFAULT statement_timestamp(),ADD COLUMN preparation_mode text DEFAULT 'automatic',ADD COLUMN missing_facts text[] DEFAULT '{}',ADD COLUMN source_revision bigint DEFAULT 1,ADD COLUMN program_ref jsonb,ADD COLUMN policy_revisions jsonb DEFAULT '{"organization":0,"group":0,"enrollment":0}';
ALTER TABLE public.uc_document_registry_records ADD COLUMN legacy_claim jsonb;
ALTER TABLE public.education_document_records ADD COLUMN issue_date date,ADD COLUMN document_status text DEFAULT 'original';
ALTER TABLE public.uc_education_issuance_states ADD COLUMN course_id uuid,ADD COLUMN enrollment_id uuid,ADD COLUMN group_id uuid,ADD COLUMN proof jsonb,ADD COLUMN artifact jsonb;
CREATE TABLE public.uc_admission_document_preferences(id uuid,organization_id uuid,scope_key text,scope_kind text,group_id uuid,enrollment_id uuid,user_id uuid,revision bigint,enabled boolean,document_date date,effective_admission_date date,timezone text);
CREATE TABLE public.fixture_programs(enrollment_id uuid PRIMARY KEY,program_ref jsonb);
CREATE TABLE public.fixture_source_proofs(organization_id uuid,source jsonb,available boolean DEFAULT true,PRIMARY KEY(organization_id,source));
CREATE FUNCTION public.uc_custom_journal_shape(p jsonb,p_keys text[])RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$BEGIN IF jsonb_typeof(p)IS DISTINCT FROM'object'THEN RETURN false;END IF;RETURN coalesce(p?&p_keys AND(SELECT count(*)FROM jsonb_object_keys(p))=cardinality(p_keys),false);END$$;
CREATE FUNCTION public.uc_custom_journal_uuid(p jsonb)RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$SELECT coalesce(jsonb_typeof(p)='string'AND p#>>'{}'~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false)$$;
CREATE FUNCTION public.uc_admission_program(uuid,uuid,uuid,uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT program_ref FROM public.fixture_programs WHERE enrollment_id=$4$$;
CREATE FUNCTION public.uc_document_registry_source(p_org uuid,p_source jsonb,p_required boolean DEFAULT true,p_own_write boolean DEFAULT false)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$SELECT CASE WHEN available THEN '{"verified":true}'::jsonb ELSE NULL END FROM public.fixture_source_proofs WHERE organization_id=p_org AND source=p_source$$;
CREATE FUNCTION public.uc_document_registry_caps(p_org uuid,p_group uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$SELECT jsonb_build_object('can_open_file',public.uc_document_org_access(p_org,false))$$;
CREATE FUNCTION public.uc_education_issue_can(p_org uuid,p_group uuid,p_enrollment uuid,p_user uuid,p_course uuid,p_action text)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$SELECT coalesce(public.uc_identification_actor_allowed(auth.uid(),false)AND public.account_deletion_access_allowed()AND public.uc_document_has_action(p_org,p_action)AND public.uc_document_record_scope(p_org,p_group,p_enrollment,p_user,p_course),false)$$;
CREATE FUNCTION public.uc_education_issue_source(p_org uuid,p_source jsonb,p_required boolean DEFAULT true)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$SELECT public.uc_document_registry_source(p_org,p_source,false,false)$$;
CREATE FUNCTION public.uc_read_education_journal_workspace(uuid,jsonb,jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$BEGIN RAISE EXCEPTION 'UNBOUNDED_JOURNAL_RPC_MUST_NOT_BE_CALLED';END$$;
CREATE SCHEMA uc_education_journal_private;

CREATE FUNCTION public.uc_admission_document_effective(p_org uuid,p_group uuid,p_enrollment uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE orgp public.uc_admission_document_preferences;gp public.uc_admission_document_preferences;ep public.uc_admission_document_preferences;observed timestamptz;zone text;BEGIN
 SELECT * INTO orgp FROM public.uc_admission_document_preferences WHERE organization_id=p_org AND scope_key='organization';
 SELECT * INTO gp FROM public.uc_admission_document_preferences WHERE organization_id=p_org AND scope_key='group:'||p_group;
 SELECT * INTO ep FROM public.uc_admission_document_preferences WHERE organization_id=p_org AND scope_key='enrollment:'||p_enrollment||':group:'||coalesce(p_group::text,'none');
 -- The technical intent records when the system observed assignment. Lesson
 -- started_at is nullable and is never substituted for a legal admission date.
 IF p_enrollment IS NOT NULL THEN SELECT coalesce((SELECT recorded_at FROM public.uc_automatic_admission_drafts WHERE enrollment_id=p_enrollment),statement_timestamp()) INTO observed;END IF;
 zone:=coalesce(orgp.timezone,'Europe/Moscow');
 RETURN jsonb_build_object('enabled',coalesce(ep.enabled,gp.enabled,orgp.enabled,true),
 'document_date',coalesce(ep.document_date,gp.document_date,(observed AT TIME ZONE zone)::date),
 'effective_admission_date',coalesce(ep.effective_admission_date,gp.effective_admission_date,(observed AT TIME ZONE zone)::date),'timezone',zone,
 'sources',jsonb_build_object('enabled',CASE WHEN ep.enabled IS NOT NULL THEN 'enrollment' WHEN gp.enabled IS NOT NULL THEN 'group' WHEN orgp.enabled IS NOT NULL THEN 'organization' ELSE 'default' END,
 'document_date',CASE WHEN ep.document_date IS NOT NULL THEN 'enrollment' WHEN gp.document_date IS NOT NULL THEN 'group' ELSE 'enrollment_event' END,
 'effective_admission_date',CASE WHEN ep.effective_admission_date IS NOT NULL THEN 'enrollment' WHEN gp.effective_admission_date IS NOT NULL THEN 'group' ELSE 'enrollment_event' END),
 'policy_revisions',jsonb_build_object('organization',coalesce(orgp.revision,0),'group',coalesce(gp.revision,0),'enrollment',coalesce(ep.revision,0)));
END;$fn$;

CREATE FUNCTION public.uc_admission_document_registered(p_enrollment uuid,p_group uuid DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
 -- participant_ids include staff and erasure actors, not educational subjects.
 -- A group document without an exact retained subject bridge is not guessed.
 SELECT EXISTS(SELECT 1 FROM public.uc_document_registry_records r
 JOIN public.enrollments e ON e.id=p_enrollment JOIN public.courses c ON c.id=e.course_id
 WHERE r.organization_id=c.organization_id AND NOT r.redacted AND r.data->>'document_type'='enrollment_order'
 AND r.data->'subject'->>'kind'='student' AND r.data->'subject'->>'user_id'=e.user_id::text
 AND r.context_binding->>'enrollment_id'=e.id::text AND r.context_binding->>'user_id'=e.user_id::text
 AND r.context_binding->>'course_id'=e.course_id::text AND r.context_binding->>'organization_id'=c.organization_id::text
 AND r.context_binding->>'kind' IN('enrollment','enrollment_contract')
 AND r.data->'context'->>'kind'=r.context_binding->>'kind' AND r.data->'context'->>'enrollment_id'=e.id::text)
$fn$;

CREATE FUNCTION public.uc_admission_document_source(p_enrollment uuid,p_selected_group uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE e public.enrollments;org uuid;primary_group uuid;choices uuid[];chosen uuid;g public.student_groups;program jsonb;missing text[]:='{}';eff jsonb;BEGIN
 SELECT * INTO e FROM public.enrollments WHERE id=p_enrollment;
 SELECT organization_id INTO org FROM public.courses WHERE id=e.course_id;
 IF e.id IS NULL OR org IS NULL OR NOT coalesce(public.uc_identification_target_allowed(org,e.user_id,false),false) THEN RETURN NULL;END IF;
 SELECT student_group_id INTO primary_group FROM public.profiles WHERE user_id=e.user_id AND organization_id=org;
 SELECT array_agg(s.id ORDER BY s.id) INTO choices FROM public.student_groups s JOIN public.student_group_memberships_effective m ON m.group_id=s.id AND m.organization_id=s.organization_id
 WHERE s.organization_id=org AND m.user_id=e.user_id AND(s.course_id=e.course_id OR s.course_id IS NULL);
 IF NOT coalesce(primary_group=ANY(choices),false) THEN primary_group:=NULL;END IF;
 IF p_selected_group IS NOT NULL AND p_selected_group=ANY(choices) THEN chosen:=p_selected_group;
 ELSIF coalesce(cardinality(choices),0)=1 THEN chosen:=choices[1];END IF;
 IF chosen IS NULL THEN missing:=array_append(missing,CASE WHEN coalesce(cardinality(choices),0)>1 THEN 'ambiguous_group' ELSE 'group_not_selected' END);
 ELSE
  SELECT * INTO g FROM public.student_groups WHERE id=chosen AND organization_id=org;
  IF g.course_id IS DISTINCT FROM e.course_id THEN missing:=array_append(missing,'group_course_not_bound');END IF;
  program:=public.uc_admission_program(org,e.user_id,chosen,e.id);
  IF program IS NULL THEN missing:=array_append(missing,'program_not_confirmed');END IF;
 END IF;
 IF e.status IN('cancelled','revoked') THEN missing:=array_append(missing,'enrollment_cancelled');END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE user_id=e.user_id AND archived_at IS NOT NULL) THEN missing:=array_append(missing,'student_archived');END IF;
 eff:=public.uc_admission_document_effective(org,chosen,e.id);
 RETURN jsonb_build_object('organization_id',org,'enrollment_id',e.id,'course_id',e.course_id,'user_id',e.user_id,'observed_group_id',primary_group,'group_id',chosen,
 'source_revision',e.document_facts_revision,'program_ref',program,'missing_facts',to_jsonb(missing),'effective',eff);
END;$fn$;

CREATE OR REPLACE FUNCTION public.uc_admission_draft_projection(p_draft uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE d public.uc_automatic_admission_drafts;s jsonb;stale boolean;BEGIN
 SELECT * INTO d FROM public.uc_automatic_admission_drafts WHERE id=p_draft;
 IF d.id IS NULL THEN RETURN NULL;END IF;
 s:=public.uc_admission_document_source(d.enrollment_id,d.group_id);
 stale:=s IS NULL OR(s->>'group_id')::uuid IS DISTINCT FROM d.group_id OR(s->>'source_revision')::bigint IS DISTINCT FROM d.source_revision
 OR s->'program_ref' IS DISTINCT FROM coalesce(d.program_ref,'null'::jsonb)
 OR s#>'{effective,policy_revisions}' IS DISTINCT FROM d.policy_revisions
 OR(s#>>'{effective,document_date}')::date IS DISTINCT FROM d.document_date OR(s#>>'{effective,effective_admission_date}')::date IS DISTINCT FROM d.effective_admission_date
 OR s->'missing_facts' IS DISTINCT FROM to_jsonb(d.missing_facts);
 RETURN to_jsonb(d)||jsonb_build_object('stale',coalesce(stale,true),'registered_locked',public.uc_admission_document_registered(d.enrollment_id,d.group_id),'live_missing_facts',coalesce(s->'missing_facts','[]'));
END;$fn$;

CREATE FUNCTION uc_education_journal_private.enrollments(p_org uuid,p_scope jsonb)
RETURNS TABLE(enrollment_id uuid,user_id uuid,course_id uuid,person_label text,course_label text,group_id uuid,group_label text,reset_at timestamptz,learning_epoch bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 WITH a AS MATERIALIZED(SELECT auth.uid() AS actor,
  p_scope->>'kind'='student' AND p_scope->>'student_user_id'=auth.uid()::text AS own,
  public.uc_document_teacher_limited(p_org) AS limited),
 selected_group AS(SELECT g.id,g.name,g.course_id FROM public.student_groups g WHERE g.organization_id=p_org AND g.id=(p_scope->>'group_id')::uuid)
 SELECT e.id,e.user_id,e.course_id,coalesce(nullif(btrim(p.full_name),''),'Имя не указано'),coalesce(c.title,'Курс'),g.id,g.name,e.learning_progress_reset_at,coalesce(e.learning_progress_epoch,0)
 FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id AND c.organization_id=p_org
 JOIN public.profiles p ON p.user_id=e.user_id AND p.organization_id=p_org CROSS JOIN a LEFT JOIN selected_group g ON true
 WHERE (p_scope->>'kind'<>'student' OR e.user_id=(p_scope->>'student_user_id')::uuid)
 AND(p_scope->>'enrollment_id' IS NULL OR e.id=(p_scope->>'enrollment_id')::uuid)
 AND(p_scope->>'group_id' IS NULL OR(g.id IS NOT NULL AND(g.course_id IS NULL OR g.course_id=e.course_id)
  AND EXISTS(SELECT 1 FROM public.student_group_memberships_effective m WHERE m.organization_id=p_org AND m.group_id=g.id AND m.user_id=e.user_id)))
 AND public.uc_identification_target_allowed(p_org,e.user_id,false)
 AND(a.own OR NOT a.limited OR public.uc_document_record_scope(p_org,g.id,e.id,e.user_id,e.course_id))
$fn$;

CREATE FUNCTION uc_education_journal_private.source_allowed(p_org uuid,p_scope jsonb,p_group uuid,p_enrollment uuid,p_user uuid,p_course uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
 SELECT CASE WHEN p_scope->>'kind'='student' AND p_scope->>'student_user_id'=auth.uid()::text
 THEN p_user=auth.uid()
 WHEN public.uc_document_teacher_limited(p_org) THEN p_group IS NOT NULL AND
  CASE WHEN p_user IS NULL THEN public.uc_document_scope_allowed(p_org,p_group,NULL)
  ELSE public.uc_document_record_scope(p_org,p_group,p_enrollment,p_user,p_course) END
 ELSE true END
$fn$;

GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;

-- Explicit fixture adapter for navigation-to-management capability only.
CREATE FUNCTION public.uc_document_action_allowed(p_org uuid,p_action text,p_group uuid,p_enrollment uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$SELECT public.can_access_organization(p_org,'documents.'||p_action) AND public.uc_document_scope_allowed(p_org,p_group,p_enrollment)$$;

-- Synthetic provider-default compatibility fixture only; never production SQL.
DO $acl_role$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='uc_fixture_extra_executor')THEN CREATE ROLE uc_fixture_extra_executor;END IF;END;$acl_role$;
CREATE FUNCTION public.uc_fixture_old_function_acl()RETURNS integer LANGUAGE sql AS $$SELECT 17$$;
GRANT EXECUTE ON FUNCTION public.uc_fixture_old_function_acl()TO uc_fixture_extra_executor;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO uc_fixture_extra_executor;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated WITH GRANT OPTION;
CREATE TEMP TABLE uc_fixture_acl_before AS SELECT
 (SELECT proacl::text FROM pg_proc WHERE oid='public.uc_fixture_old_function_acl()'::regprocedure)old_function_acl,
 (SELECT md5(coalesce(string_agg(md5(to_jsonb(d)::text),''ORDER BY oid),''))FROM pg_default_acl d)default_acl_fingerprint;
