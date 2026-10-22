// @vitest-environment node
// Regression tests for an EXISTING guard confirmed in the 2026-10-16 live
// schema snapshot. No replacement migration and no production connection.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const directory = new URL('../../migrations/', import.meta.url);
const read = (name: string) => readFile(new URL(name, directory), 'utf8');
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
let db: PGlite;
async function installFunction(file: string, name: string) {
  const source = await read(file);
  const start = source.search(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\s*\\(`));
  if (start < 0) throw new Error(`Function missing: ${name}`);
  const rest = source.slice(start);
  const delimiter = /\bAS\s+(\$[A-Za-z0-9_]*\$)/i.exec(rest)!;
  const end = rest.indexOf(`${delimiter[1]};`, delimiter.index + delimiter[0].length);
  await db.exec(rest.slice(0, end + delimiter[1].length + 1));
}
async function actor(user: number | null, role = 'authenticated') {
  // SET ROLE alone leaves session_user=postgres and bypasses the OLD guard.
  // Match the actual PostgREST connection role instead of weakening the guard.
  await db.exec(`RESET SESSION AUTHORIZATION; RESET ROLE; SET SESSION AUTHORIZATION authenticator;
    SET ROLE ${role}; SELECT set_config('request.jwt.claim.role','${role}',true);
    SELECT set_config('request.jwt.claim.sub','${user == null ? '' : id(user)}',true);`);
}
async function denied(sql: string) {
  await db.exec('SAVEPOINT denial');
  await expect(db.exec(sql)).rejects.toThrow(/Only platform billing administrators|row-level security|Only trusted billing/);
  await db.exec('ROLLBACK TO SAVEPOINT denial; RELEASE SAVEPOINT denial');
}
const protectedChanges = [
  "subscription_plan='maximum'", 'custom_price=1', 'custom_discount=4489',
  "paid_until='2099-01-01'", 'is_paid=true', "tariff_type='paid'", 'monthly_price=1',
  "tariff_custom_label='Unlimited'", 'custom_max_courses=-1', 'custom_max_students=-1',
  'custom_max_trained_per_month=-1', 'custom_ai_generations_limit=-1',
  'custom_storage_limit_bytes=999999999', 'storage_limit_bytes=999999999',
  'ai_tokens_limit=999999999', `enabled_features='["all"]'::jsonb`,
  "custom_enabled_categories=ARRAY['crm']", 'ai_enabled=false', 'frdo_enabled=false',
];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
    CREATE ROLE authenticator LOGIN; GRANT authenticated,anon,service_role TO authenticator;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.role',true),'') $$;
    CREATE TYPE public.app_role AS ENUM('admin','organization','student');
    CREATE TABLE public.user_roles(user_id uuid,role public.app_role);
    CREATE TABLE public.profiles(user_id uuid UNIQUE,organization_id uuid);
    CREATE TABLE public.org_staff(user_id uuid,organization_id uuid,role text,sections_access jsonb,expires_at timestamptz,created_at timestamptz DEFAULT now());
    CREATE TABLE public.account_deletion_revocations(user_id uuid PRIMARY KEY);
    CREATE TABLE public.organizations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,email text,
      branding jsonb DEFAULT '{}',student_dashboard_settings jsonb DEFAULT '{}',menu_settings jsonb DEFAULT '{}',
      subscription_plan text DEFAULT 'free',custom_max_courses integer,custom_max_students integer,
      custom_max_trained_per_month integer,custom_ai_generations_limit integer,custom_storage_limit_bytes bigint,
      is_paid boolean DEFAULT false,paid_until timestamptz,tariff_type text DEFAULT 'trial',monthly_price numeric DEFAULT 0,
      tariff_custom_label text,custom_price numeric,custom_discount numeric,storage_limit_bytes bigint DEFAULT 104857600,
      ai_tokens_limit bigint DEFAULT 100000,enabled_features jsonb DEFAULT '[]',custom_enabled_categories text[] DEFAULT '{}',
      ai_enabled boolean DEFAULT true,frdo_enabled boolean DEFAULT true,balance numeric DEFAULT 0);
    GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
    GRANT SELECT,INSERT,UPDATE,DELETE ON public.organizations TO authenticated,anon,service_role;
  `);
  await installFunction('20260110234906_159335d2-99b0-4002-b8c0-e8dc0e87993b.sql','has_role');
  await installFunction('20260429060323_9023b604-40d6-4551-bf02-4fc5315bdf0e.sql','has_role');
  await installFunction('20260422090332_1856ddfd-409c-45c8-8ee1-2acc959c793e.sql','get_org_staff_permissions');
  await installFunction('20261012110000_staff_workspace_access.sql','org_role_default_permissions');
  for (const name of ['normalize_org_staff_permission','has_org_staff_permission','current_organization_id']) {
    await installFunction('20260728072432_172e4e18-e52e-495d-b1ff-d3e5d3c04b9d.sql',name);
  }
  await installFunction('20260822122025_6be7e00b-82ec-44a9-8476-fac0e09cdd0c.sql','can_access_organization');
  await installFunction('20261007160000_self_account_deletion.sql','account_deletion_access_allowed');
  const guards = await read('20260822122920_1acc140d-c059-4397-a0fb-5a65380137cb.sql');
  const start = guards.indexOf('CREATE OR REPLACE FUNCTION public.guard_organization_course_quota_config()');
  const end = guards.indexOf('-- Organization settings access also used to include the account balance.', start);
  await db.exec(guards.slice(start,end));
  await installFunction('20260822122920_1acc140d-c059-4397-a0fb-5a65380137cb.sql','guard_organization_balance');
  await db.exec(`
    CREATE TRIGGER guard_organization_balance_insert BEFORE INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.guard_organization_balance();
    CREATE TRIGGER guard_organization_balance_update BEFORE UPDATE OF balance ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.guard_organization_balance();
    ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Admins can do everything with organizations" ON public.organizations FOR ALL USING(public.has_role('admin'::app_role,auth.uid()));
    CREATE POLICY "Org staff can update organization" ON public.organizations FOR UPDATE TO authenticated
      USING(public.can_access_organization(id,'settings.write')) WITH CHECK(public.can_access_organization(id,'settings.write'));
    CREATE POLICY "Org staff can view organization" ON public.organizations FOR SELECT TO authenticated USING(public.can_access_organization(id,'settings.read'));
    CREATE POLICY "Org users can view their organization" ON public.organizations FOR SELECT USING(id=public.current_organization_id());
    CREATE POLICY public_insert_organizations ON public.organizations FOR INSERT WITH CHECK(auth.uid() IS NOT NULL);
    CREATE POLICY account_deletion_no_revoked_access ON public.organizations AS RESTRICTIVE FOR ALL TO authenticated
      USING(public.account_deletion_access_allowed()) WITH CHECK(public.account_deletion_access_allowed());
    INSERT INTO public.user_roles VALUES('${id(1)}','organization'),('${id(2)}','student'),('${id(3)}','student'),
      ('${id(4)}','admin'),('${id(5)}','admin'),('${id(6)}','student'),('${id(7)}','organization');
    INSERT INTO public.profiles VALUES('${id(1)}','${id(100)}'),('${id(2)}','${id(100)}'),('${id(3)}','${id(100)}'),
      ('${id(4)}',NULL),('${id(5)}',NULL),('${id(6)}','${id(100)}'),('${id(7)}','${id(200)}');
    INSERT INTO public.org_staff(user_id,organization_id,role,sections_access,expires_at) VALUES('${id(2)}','${id(100)}','teacher','["settings.read","settings.write"]',NULL),
      ('${id(6)}','${id(100)}','teacher','["settings.read","settings.write"]',now()-interval '1 day');
    INSERT INTO public.account_deletion_revocations VALUES('${id(5)}');
    INSERT INTO public.organizations(id,name,email,subscription_plan,custom_price,custom_discount)
      VALUES('${id(100)}','Synthetic A','a@example.invalid','start',4490,0),('${id(200)}','Synthetic B','b@example.invalid','free',NULL,NULL);
  `);
},30000);
beforeEach(async () => { await db.exec('BEGIN'); });
afterEach(async () => { await db.exec('ROLLBACK; RESET SESSION AUTHORIZATION; RESET ROLE'); });
afterAll(async () => { await db?.close(); });

describe('existing organization billing guard, with PostgREST-like session identity', () => {
  it.each([1,2])('owner/settings staff %i cannot alter any protected billing/entitlement field', async user => {
    await actor(user);
    expect((await db.query('SELECT session_user,current_user')).rows[0]).toEqual({ session_user:'authenticator',current_user:'authenticated' });
    for (const change of protectedChanges) await denied(`UPDATE public.organizations SET ${change} WHERE id='${id(100)}'`);
    await denied(`UPDATE public.organizations SET balance=100000 WHERE id='${id(100)}'`);
  });
  it.each([1,2])('preserves ordinary branding/menu settings and unchanged billing fields for actor %i', async user => {
    await actor(user);
    const result=await db.query(`UPDATE public.organizations SET name='Renamed',branding='{"color":"blue"}',
      student_dashboard_settings='{"showAiChat":false}',menu_settings='{"order":["courses"]}',
      custom_price=custom_price,subscription_plan=subscription_plan WHERE id=$1 RETURNING name,branding`,[id(100)]);
    expect(result.rows).toEqual([{name:'Renamed',branding:{color:'blue'}}]);
  });
  it.each([3,5,6,7])('learner/revoked admin/expired staff/foreign owner %i cannot mutate tenant billing', async user => {
    await actor(user);
    expect((await db.query('UPDATE public.organizations SET custom_price=1,paid_until=$1 WHERE id=$2 RETURNING id',['2099-01-01',id(100)])).rows).toEqual([]);
  });
  it('normalizes an authenticated public organization insert to the canonical free baseline', async () => {
    await actor(3);
    await db.exec(`INSERT INTO public.organizations(id,name,email,subscription_plan,custom_price,custom_discount,is_paid,paid_until,custom_max_courses)
      VALUES('${id(300)}','Synthetic public registration','new@example.invalid','maximum',1,900,true,'2099-01-01',-1)`);
    await actor(null,'service_role');
    const row=(await db.query('SELECT subscription_plan,custom_price,custom_discount,is_paid,paid_until,custom_max_courses,tariff_type FROM public.organizations WHERE id=$1',[id(300)])).rows[0];
    expect(row).toEqual({subscription_plan:'free',custom_price:null,custom_discount:null,is_paid:false,paid_until:null,custom_max_courses:null,tariff_type:'free'});
  });
  it('rejects anonymous registration and revoked-admin registration', async () => {
    await actor(null,'anon');
    await denied("INSERT INTO public.organizations(name,email) VALUES('anonymous','a@example.invalid')");
    await actor(5);
    await denied("INSERT INTO public.organizations(name,email,subscription_plan) VALUES('revoked','r@example.invalid','maximum')");
  });
  it.each(['admin','service'])('retains legitimate %s billing adjustment and paid registration', async context => {
    await actor(context==='admin'?4:null,context==='admin'?'authenticated':'service_role');
    const result=await db.query(`UPDATE public.organizations SET custom_price=3990,custom_discount=100,
      subscription_plan='professional',paid_until='2099-01-01' WHERE id=$1 RETURNING subscription_plan,custom_price`,[id(100)]);
    expect(result.rows).toEqual([{subscription_plan:'professional',custom_price:'3990'}]);
    await db.exec(`INSERT INTO public.organizations(id,name,email,subscription_plan,is_paid)
      VALUES('${id(300)}','Trusted','trusted@example.invalid','professional',true)`);
  });
});
