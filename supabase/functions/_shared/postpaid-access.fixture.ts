import { readFileSync } from 'node:fs';
import type { PGlite } from '@electric-sql/pglite';

export const canonicalQuotaFunctions = [
  ['get_organization_student_capacity', '20260729122713_8d75f5e1-8974-4d18-8e08-f582266b6261.sql'],
  ['create_student_profile_with_capacity', '20260729123226_b27fb233-4614-4833-a85d-c26ad0264354.sql'],
  ['enforce_course_insert_limit', '20260822123030_eb38356e-5837-4f86-8959-7599ff9adae5.sql'],
] as const;

export function canonicalFunctionSql(name: string, file: string, delimiter = 'function') {
  const sql = readFileSync(`supabase/migrations/${file}`, 'utf8').replace(/\r\n/g, '\n');
  let start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if(start<0) start = sql.indexOf(`CREATE FUNCTION public.${name}(`);
  const end = sql.indexOf(`$${delimiter}$;`, sql.indexOf(`AS $${delimiter}$`, start)) + delimiter.length + 3;
  if(start<0 || end<start) throw new Error(`Missing canonical definition ${name}`);
  return sql.slice(start,end);
}

/** Install the exact historical definitions whose prosrc matches the live snapshot. */
export async function installCanonicalQuotaFunctions(db: PGlite) {
  for (const [name, file] of canonicalQuotaFunctions) {
    await db.exec(canonicalFunctionSql(name,file));
  }
  await db.exec(canonicalFunctionSql('org_crm_access_allowed','20261012200000_org_crm_beta.sql','fn'));
  await db.exec(`REVOKE ALL ON FUNCTION public.org_crm_access_allowed(uuid,text) FROM PUBLIC,anon;
    GRANT EXECUTE ON FUNCTION public.org_crm_access_allowed(uuid,text) TO authenticated,service_role;`);
}

export const postpaidAccessFixture = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE legacy_capacity_reader;
CREATE SCHEMA auth;
CREATE TYPE public.app_role AS ENUM('admin','organization','student');
CREATE TYPE public.company_staff_role AS ENUM('viewer');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.role',true),'')$$;
CREATE TABLE organizations(id uuid PRIMARY KEY, subscription_plan text, custom_max_students integer, custom_max_courses integer);
CREATE TABLE profiles(user_id uuid PRIMARY KEY, organization_id uuid, archived_at timestamptz, full_name text, email text,
  login text, generated_password text, company_id uuid, student_group_id uuid, region text);
CREATE TABLE user_roles(user_id uuid PRIMARY KEY,role public.app_role);
CREATE TABLE org_staff(user_id uuid,organization_id uuid,expires_at timestamptz,permissions text[]);
CREATE TABLE companies(id uuid PRIMARY KEY,user_id uuid,organization_id uuid);
CREATE TABLE company_staff(user_id uuid,company_id uuid);
CREATE TABLE organization_usage(organization_id uuid,month_start date,students_added_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY(organization_id,month_start));
CREATE TABLE courses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,system_key text,title text);
CREATE TABLE organization_billing_agreements(organization_id uuid PRIMARY KEY,effective_from date NOT NULL,effective_to date);
CREATE TABLE postpaid_feature_confirmations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,feature text,
  notified_at timestamptz,confirmed_at timestamptz,effective_to timestamptz);
CREATE TABLE account_deletion_revocations(user_id uuid PRIMARY KEY);
CREATE FUNCTION public.account_deletion_access_allowed() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=auth.uid())$$;
CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=$1 AND role=$2)$$;
CREATE FUNCTION public.has_org_staff_permission(uuid,uuid,text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS(SELECT 1 FROM public.org_staff WHERE user_id=$1 AND organization_id=$2 AND $3=ANY(permissions))$$;
CREATE FUNCTION public.has_company_access(uuid,uuid,public.company_staff_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS(SELECT 1 FROM public.company_staff WHERE user_id=$1 AND company_id=$2)$$;
${canonicalFunctionSql('can_access_organization','20260822122025_6be7e00b-82ec-44a9-8476-fac0e09cdd0c.sql')}
GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role,anon,legacy_capacity_reader;
GRANT SELECT ON profiles TO authenticated;
GRANT SELECT,INSERT,UPDATE ON courses TO authenticated;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY fixture_courses_tenant ON courses TO authenticated USING (
  organization_id=(SELECT p.organization_id FROM profiles p WHERE p.user_id=auth.uid())
) WITH CHECK (organization_id=(SELECT p.organization_id FROM profiles p WHERE p.user_id=auth.uid()));
`;
