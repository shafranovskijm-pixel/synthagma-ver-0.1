import type { PGlite } from '@electric-sql/pglite';
import { installCanonicalQuotaFunctions } from './postpaid-access.fixture';

/** Additive synthetic prerequisites for the existing combined release fixture.
 * Run before the actual release SQL. It does NOT install any new migration,
 * create agreements, or claim the synthetic authorization helpers are live.
 */
export async function installPostpaidPrerequisites(db: PGlite) {
  await db.exec(`
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS custom_max_students integer, ADD COLUMN IF NOT EXISTS custom_max_courses integer;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS blocked_at timestamptz, ADD COLUMN IF NOT EXISTS login text,
      ADD COLUMN IF NOT EXISTS generated_password text, ADD COLUMN IF NOT EXISTS company_id uuid,
      ADD COLUMN IF NOT EXISTS student_group_id uuid, ADD COLUMN IF NOT EXISTS region text;
    ALTER TABLE courses ADD COLUMN IF NOT EXISTS system_key text;
    ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS time_spent integer DEFAULT 0;
    ALTER TABLE org_staff ADD COLUMN IF NOT EXISTS permissions text[];
    CREATE TYPE public.company_staff_role AS ENUM('viewer');
    CREATE TABLE companies(id uuid PRIMARY KEY,user_id uuid,organization_id uuid);
    CREATE TABLE company_staff(user_id uuid,company_id uuid);
    CREATE TABLE organization_usage(organization_id uuid,month_start date,students_added_count integer NOT NULL DEFAULT 0,PRIMARY KEY(organization_id,month_start));
    CREATE TABLE lessons(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),course_id uuid REFERENCES courses(id));
    CREATE TABLE lesson_progress(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,lesson_id uuid REFERENCES lessons(id),completed boolean DEFAULT false,
      completed_at timestamptz,time_spent integer DEFAULT 0,video_position numeric DEFAULT 0);
    CREATE TABLE test_attempt_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,lesson_id uuid REFERENCES lessons(id),started_at timestamptz DEFAULT now());
    CREATE TABLE test_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,lesson_id uuid REFERENCES lessons(id),completed_at timestamptz DEFAULT now());
    CREATE TABLE homework_submissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),student_id uuid,course_id uuid,organization_id uuid,lesson_id uuid,
      content text,attachments jsonb DEFAULT '[]',status text DEFAULT 'pending',submitted_at timestamptz DEFAULT now());
    CREATE TABLE org_crm_clients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,title text,updated_at timestamptz DEFAULT now());
    CREATE TABLE org_crm_deals(LIKE org_crm_clients INCLUDING ALL);
    CREATE TABLE org_crm_tasks(LIKE org_crm_clients INCLUDING ALL);
    CREATE TABLE org_crm_activities(LIKE org_crm_clients INCLUDING ALL);
    CREATE TABLE webinars(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,status text DEFAULT 'scheduled');
    CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT public.has_role($2,$1) $$;
    CREATE FUNCTION public.has_org_staff_permission(uuid,uuid,text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS(SELECT 1 FROM org_staff WHERE user_id=$1 AND organization_id=$2 AND $3=ANY(permissions)) $$;
    CREATE FUNCTION public.has_company_access(uuid,uuid,public.company_staff_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS(SELECT 1 FROM company_staff WHERE user_id=$1 AND company_id=$2) $$;
    CREATE FUNCTION public.can_access_course_as_learner(course uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT public.account_deletion_access_allowed() AND EXISTS(SELECT 1 FROM enrollments e JOIN courses c ON c.id=e.course_id JOIN profiles p ON p.user_id=e.user_id
       WHERE e.user_id=auth.uid() AND c.id=course AND c.organization_id=p.organization_id AND p.archived_at IS NULL AND p.blocked_at IS NULL) $$;
  `);
  await installCanonicalQuotaFunctions(db);
  await db.exec(`REVOKE ALL ON FUNCTION public.create_student_profile_with_capacity(uuid,uuid,text,text,text,text,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
    GRANT EXECUTE ON FUNCTION public.create_student_profile_with_capacity(uuid,uuid,text,text,text,text,uuid,uuid,text) TO service_role;`);
}
