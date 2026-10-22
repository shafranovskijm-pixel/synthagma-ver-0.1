// @vitest-environment node
// Runs real historical policies/helpers and the exact new migration in an
// empty in-memory PostgreSQL. No URLs, credentials or production connection.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';

const migrations = new URL('../../migrations/', import.meta.url);
const read = (name: string) => readFile(new URL(name, migrations), 'utf8');
const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
let db: PGlite;
let reproduction: Record<string, unknown>;
let releaseRollbackPreserved = false;
let unexpectedPolicyRejected = false;
let originalWitness: unknown;

async function installFunction(file: string, name: string) {
  const sql = await read(file);
  const start = sql.search(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\s*\\(`));
  if (start < 0) throw new Error(`Missing function ${name} in ${file}`);
  const rest = sql.slice(start);
  const body = /\bAS\s+(\$[A-Za-z0-9_]*\$)/i.exec(rest);
  if (!body) throw new Error(`Missing body delimiter for ${name}`);
  const end = rest.indexOf(`${body[1]};`, body.index + body[0].length);
  if (end < 0) throw new Error(`Missing closing delimiter for ${name}`);
  await db.exec(rest.slice(0, end + body[1].length + 1));
}

async function actor(n: number | null, role = 'authenticated') {
  await db.exec(`RESET ROLE; SET LOCAL ROLE ${role}; SET LOCAL request.jwt.claim.sub='${n === null ? '' : uid(n)}';`);
}
async function scalar(sql: string, params: unknown[] = []) {
  const result = await db.query<{ value: unknown }>(sql, params);
  return result.rows[0]?.value;
}
async function rows(table: string) {
  return (await db.query<{ organization_id: string | null }>(`SELECT organization_id FROM public.${table}`)).rows;
}
async function denied(sql: string, params: unknown[] = [], pattern = /row-level security|crm_forbidden|permission denied|crm_lead_scope_mismatch/i) {
  await db.exec('SAVEPOINT expected_denial');
  await expect(db.query(sql, params)).rejects.toThrow(pattern);
  await db.exec('ROLLBACK TO SAVEPOINT expected_denial; RELEASE SAVEPOINT expected_denial');
}
async function securitySnapshot() {
  return (await db.query(`SELECT jsonb_build_object(
    'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'body',pg_get_functiondef(p.oid),'acl',p.proacl) ORDER BY p.oid::regprocedure::text)
      FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f'),
    'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public'),
    'triggers',(SELECT jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgrelid,t.tgname) FROM pg_trigger t WHERE NOT t.tgisinternal)
  ) AS snapshot`)).rows[0].snapshot;
}
async function witness() {
  return (await db.query(`SELECT jsonb_build_object(
    'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY user_id,role) FROM public.user_roles r),
    'managers',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.sales_managers m),
    'table',(SELECT jsonb_build_object('acl',relacl,'rls',relrowsecurity,'force',relforcerowsecurity) FROM pg_class WHERE oid='public.org_crm_clients'::regclass),
    'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE schemaname='public' AND tablename='org_crm_clients'),
    'data',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.org_crm_clients c),
    'deletionPolicies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename) FROM pg_policies p WHERE schemaname='public' AND policyname='account_deletion_no_revoked_access')
  ) AS snapshot`)).rows[0].snapshot;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TYPE public.app_role AS ENUM('admin','sales_manager','organization','student','company');
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE public.organizations(id uuid PRIMARY KEY);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid UNIQUE,organization_id uuid,full_name text,email text);
    CREATE TABLE public.user_roles(user_id uuid,role public.app_role);
    CREATE TABLE public.org_staff(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,organization_id uuid,role text,
      display_name text NOT NULL DEFAULT '',sections_access jsonb NOT NULL DEFAULT '[]',expires_at timestamptz,
      created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),UNIQUE(user_id,organization_id));
    CREATE TABLE public.admin_staff(user_id uuid UNIQUE,role text,full_name text,email text);
    CREATE TABLE public.account_deletion_revocations(user_id uuid PRIMARY KEY);
    CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now();RETURN NEW;END $$;
    CREATE TABLE public.sales_companies_db(id uuid PRIMARY KEY,organization_id uuid,created_at timestamptz DEFAULT now());
    CREATE TABLE public.sales_contracts(id uuid PRIMARY KEY,organization_id uuid,created_at timestamptz DEFAULT now());
    CREATE TABLE public.document_signatures(id uuid PRIMARY KEY,organization_id uuid,created_at timestamptz DEFAULT now());
  `);
  await installFunction('20260110234906_159335d2-99b0-4002-b8c0-e8dc0e87993b.sql', 'has_role');
  await installFunction('20260429060323_9023b604-40d6-4551-bf02-4fc5315bdf0e.sql', 'has_role');
  await installFunction('20260422090332_1856ddfd-409c-45c8-8ee1-2acc959c793e.sql', 'get_org_staff_permissions');
  await installFunction('20261012110000_staff_workspace_access.sql', 'org_role_default_permissions');
  for (const name of ['normalize_org_staff_permission', 'has_org_staff_permission', 'current_organization_id']) {
    await installFunction('20260728072432_172e4e18-e52e-495d-b1ff-d3e5d3c04b9d.sql', name);
  }
  for (const name of ['can_access_organization', 'is_org_owner']) {
    await installFunction('20260822122025_6be7e00b-82ec-44a9-8476-fac0e09cdd0c.sql', name);
  }
  await installFunction('20261007160000_self_account_deletion.sql', 'account_deletion_access_allowed');
  for (const file of [
    '20260216024439_4a1d4046-6e1b-4033-b26b-d517fedef52d.sql',
    '20260422065743_e8b41312-8216-4903-82cc-7c74301b6584.sql',
    '20260422071431_ff9adcb8-b9b1-45e3-920c-f84ffa87aaef.sql',
    '20260422071512_6c3e4fa7-ab68-4462-8602-2eb0b528a264.sql',
  ]) await db.exec(await read(file));
  await db.exec('ALTER TABLE public.commercial_proposals ADD COLUMN organization_id uuid');
  for (const file of [
    '20260422073316_c91cbb47-543a-4c97-8fcc-b2297a77866a.sql',
    '20260422073340_5c894dc2-477c-461f-bccc-de5a9e0c2a69.sql',
    '20260426051607_523228cb-f753-4e30-a4ed-ad21906b2d89.sql',
    '20260628091140_f18be303-505c-4d40-8524-114437cf9890.sql',
    '20260707125018_b88738a4-2547-41c7-aac3-e074b2f31586.sql',
  ]) await db.exec(await read(file));
  await db.exec(`
    CREATE TABLE public.org_crm_clients(id uuid PRIMARY KEY,organization_id uuid,notes text);
    ALTER TABLE public.org_crm_clients ENABLE ROW LEVEL SECURITY;
    CREATE POLICY org_crm_read ON public.org_crm_clients FOR SELECT TO authenticated USING(false);
    INSERT INTO public.organizations VALUES('${uid(100)}'),('${uid(200)}');
    INSERT INTO auth.users SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,18)n;
    INSERT INTO public.profiles(user_id,organization_id,full_name,email)
      SELECT id,CASE WHEN right(id::text,2) IN('04','10','17') THEN '${uid(200)}'::uuid ELSE '${uid(100)}'::uuid END,
        'Synthetic '||right(id::text,2),'synthetic-'||right(id::text,2)||'@example.invalid' FROM auth.users;
    INSERT INTO public.user_roles SELECT id,CASE WHEN right(id::text,2)='01' THEN 'admin'::app_role
      WHEN right(id::text,2) IN('02','12','14','15','18') THEN 'sales_manager'::app_role
      WHEN right(id::text,2) IN('09','17') THEN 'organization'::app_role ELSE 'student'::app_role END FROM auth.users;
    INSERT INTO public.admin_staff VALUES('${uid(3)}','sales_manager','Platform employee','platform@example.invalid');
    INSERT INTO public.org_staff(user_id,organization_id,role,sections_access,expires_at,can_receive_crm_tasks) VALUES
      ('${uid(4)}','${uid(100)}','sales_manager','[]',NULL,true),
      ('${uid(5)}','${uid(100)}','teacher','["sales.read"]',NULL,true),
      ('${uid(6)}','${uid(100)}','sales_manager','[]',now()-interval '1 day',true),
      ('${uid(7)}','${uid(100)}','sales_manager','[]',NULL,true),
      ('${uid(10)}','${uid(200)}','sales_manager','[]',NULL,true),
      ('${uid(11)}','${uid(100)}','sales_manager','[]',NULL,true),
      ('${uid(11)}','${uid(200)}','sales_manager','[]',NULL,true),
      ('${uid(14)}','${uid(100)}','sales_manager','[]',NULL,true),
      ('${uid(16)}','${uid(100)}','teacher','[]',NULL,true);
    INSERT INTO public.sales_managers(id,user_id,full_name,is_active)
      SELECT ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
        ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'Synthetic manager '||n,n<>12
      FROM unnest(ARRAY[2,3,12,13,15,18])n ON CONFLICT(user_id) DO NOTHING;
    INSERT INTO public.account_deletion_revocations VALUES('${uid(7)}'),('${uid(15)}');
    INSERT INTO public.sales_leads(id,org_name,organization_id,status) VALUES
      ('${uid(301)}','A','${uid(100)}','new'),('${uid(302)}','B','${uid(200)}','new'),
      ('${uid(303)}','Platform',NULL,'new'),('${uid(304)}','Platform closed',NULL,'client');
    INSERT INTO public.sales_tasks(id,organization_id,lead_id,title,due_date) VALUES
      ('${uid(401)}','${uid(100)}','${uid(301)}','A',now()),
      ('${uid(402)}','${uid(200)}','${uid(302)}','B',now()),
      ('${uid(403)}',NULL,'${uid(303)}','Platform',now());
    INSERT INTO public.sales_lead_activities(id,organization_id,lead_id,manager_id,activity_type,description)
      SELECT '${uid(501)}','${uid(100)}','${uid(301)}',id,'note','A' FROM public.sales_managers WHERE user_id='${uid(4)}';
    INSERT INTO public.sales_lead_activities(id,organization_id,lead_id,manager_id,activity_type,description)
      SELECT '${uid(502)}','${uid(200)}','${uid(302)}',id,'note','B' FROM public.sales_managers WHERE user_id='${uid(10)}';
    INSERT INTO public.sales_lead_activities(id,organization_id,lead_id,manager_id,activity_type,description)
      SELECT '${uid(503)}',NULL,'${uid(303)}',id,'note','Platform' FROM public.sales_managers WHERE user_id='${uid(2)}';
    INSERT INTO public.org_crm_clients VALUES('${uid(800)}','${uid(100)}','Unchanged new workspace');
    GRANT USAGE ON SCHEMA public,auth TO authenticated,anon,service_role;
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
    REVOKE ALL ON public.account_deletion_revocations FROM PUBLIC,authenticated,anon;
  `);
  for (const table of ['sales_leads', 'sales_tasks', 'sales_lead_activities', 'sales_managers']) {
    await db.exec(`CREATE POLICY account_deletion_no_revoked_access ON public.${table}
      AS RESTRICTIVE FOR ALL TO authenticated USING(public.account_deletion_access_allowed())
      WITH CHECK(public.account_deletion_access_allowed())`);
  }
  await db.exec('BEGIN');
  await actor(4);
  reproduction = {
    writerASeesForeignLead: await scalar('SELECT EXISTS(SELECT 1 FROM public.sales_leads WHERE organization_id=$1) value', [uid(200)]),
    writerASeesPlatformTasks: await scalar('SELECT EXISTS(SELECT 1 FROM public.sales_tasks WHERE organization_id IS NULL) value'),
    foreignAssignees: (await db.query('SELECT * FROM public.list_org_task_assignees($1)', [uid(200)])).rows.length,
  };
  await db.exec('ROLLBACK');
  originalWitness = await witness();
  const before = await securitySnapshot();
  const migration = await read('20261016140000_legacy_crm_access.sql');
  const forcedFailure = migration.replace("NOTIFY pgrst,'reload schema';", () => "DO $$ BEGIN RAISE EXCEPTION 'synthetic_release_failure'; END $$;");
  await expect(db.exec(forcedFailure)).rejects.toThrow('synthetic_release_failure');
  await db.exec('ROLLBACK');
  releaseRollbackPreserved = JSON.stringify(await securitySnapshot()) === JSON.stringify(before);
  await db.exec('CREATE POLICY unreviewed_extra ON public.sales_tasks FOR SELECT USING(true)');
  await expect(db.exec(migration)).rejects.toThrow('unexpected permissive policies');
  await db.exec('ROLLBACK; DROP POLICY unreviewed_extra ON public.sales_tasks');
  unexpectedPolicyRejected = true;
  await db.exec(migration);
}, 60_000);

beforeEach(async () => { await db.exec('BEGIN'); });
afterEach(async () => { await db.exec('ROLLBACK'); });
afterAll(async () => { await db?.close(); });

describe('legacy CRM security migration against real historical policies', () => {
  it('reproduces the old cross-tenant access, refuses unknown policies and rolls back DDL on failure', () => {
    expect(reproduction).toEqual({ writerASeesForeignLead: true, writerASeesPlatformTasks: true, foreignAssignees: 3 });
    expect(releaseRollbackPreserved).toBe(true);
    expect(unexpectedPolicyRejected).toBe(true);
  });

  it('preserves manager IDs/data, global roles, new CRM and account-deletion fences during release', async () => {
    expect(await witness()).toEqual(originalWitness);
    expect(await scalar(`SELECT count(*)::integer value FROM pg_policies WHERE schemaname='public'
      AND tablename IN('sales_leads','sales_tasks','sales_lead_activities') AND permissive='PERMISSIVE'`)).toBe(12);
  });

  it.each([4, 10, 11, 9])('permits only the authorized tenant scopes for owner/staff %i', async user => {
    await actor(user);
    const expected = user === 10 ? [uid(200)] : user === 11 ? [uid(100), uid(200)] : [uid(100)];
    for (const table of ['sales_leads', 'sales_tasks', 'sales_lead_activities']) {
      expect((await rows(table)).map(row => row.organization_id).sort()).toEqual(expected);
    }
    expect(await scalar('SELECT public.is_platform_sales_manager(auth.uid()) value')).toBe(false);
  });

  it.each([6, 7, 8, 12, 13, 15, 16])('denies expired/revoked/learner/inactive/orphan/unprivileged actor %i', async user => {
    await actor(user);
    for (const table of ['sales_leads', 'sales_tasks', 'sales_lead_activities']) expect(await rows(table)).toEqual([]);
    await denied('SELECT * FROM public.list_org_task_assignees($1)', [uid(100)]);
    await denied('SELECT public.claim_sales_leads($1)', [[uid(303)]]);
  });

  it('separates read permission from writes, even for a trigger-provisioned manager', async () => {
    await actor(5);
    expect((await rows('sales_leads')).map(x => x.organization_id)).toEqual([uid(100)]);
    await denied(`INSERT INTO public.sales_leads(org_name,organization_id) VALUES('forbidden',$1)`, [uid(100)]);
    expect((await db.query(`UPDATE public.sales_leads SET notes='forbidden' WHERE id=$1 RETURNING id`, [uid(301)])).rows).toEqual([]);
    expect((await db.query('DELETE FROM public.sales_tasks WHERE id=$1 RETURNING id', [uid(401)])).rows).toEqual([]);
  });

  it('allows same-tenant CRUD and rejects tenant changes and cross-tenant children', async () => {
    await actor(4);
    const result = await db.query<{ id: string }>(`INSERT INTO public.sales_leads(org_name,organization_id) VALUES('New A',$1) RETURNING id`, [uid(100)]);
    const lead = result.rows[0].id;
    expect((await db.query('UPDATE public.sales_leads SET notes=$1 WHERE id=$2 RETURNING id', ['saved', lead])).rows).toHaveLength(1);
    await denied('UPDATE public.sales_leads SET organization_id=$1 WHERE id=$2', [uid(200), lead]);
    await denied('INSERT INTO public.sales_tasks(organization_id,lead_id,title,due_date) VALUES($1,$2,$3,now())', [uid(100), uid(302), 'wrong tenant']);
    await denied(`INSERT INTO public.sales_lead_activities(organization_id,lead_id,manager_id,activity_type)
      VALUES($1,$2,$3,'note')`, [uid(100), uid(302), '10000000-0000-0000-0000-000000000002']);
    expect((await db.query('DELETE FROM public.sales_leads WHERE id=$1 RETURNING id', [lead])).rows).toHaveLength(1);
    await denied('SELECT * FROM public.list_org_task_assignees($1)', [uid(200)]);
  });

  it.each([2, 3])('preserves explicit platform manager %i and restricts it to platform rows', async user => {
    await actor(user);
    expect(await scalar('SELECT public.is_platform_sales_manager(auth.uid()) value')).toBe(true);
    expect(await scalar('SELECT public.is_active_sales_manager(auth.uid()) value')).toBe(true);
    expect((await rows('sales_leads')).map(x => x.organization_id)).toEqual([null, null]);
    expect((await rows('sales_tasks')).map(x => x.organization_id)).toEqual([null]);
    const inserted = await db.query<{ organization_id: string | null }>(
      "INSERT INTO public.sales_leads(org_name) VALUES('Platform manual lead') RETURNING organization_id");
    expect(inserted.rows).toEqual([{ organization_id: null }]);
    expect((await db.query("UPDATE public.sales_tasks SET title='Platform update' WHERE id=$1 RETURNING id", [uid(403)])).rows).toHaveLength(1);
    await denied('SELECT * FROM public.list_org_task_assignees($1)', [uid(100)]);
  });

  it('preserves platform administrator access to all scopes and safe assignees', async () => {
    await actor(1);
    expect(await rows('sales_leads')).toHaveLength(4);
    const assignees = (await db.query<{ user_id: string }>('SELECT * FROM public.list_org_task_assignees($1)', [uid(100)])).rows.map(x => x.user_id);
    expect(assignees).toContain(uid(9));
    expect(assignees).toContain(uid(4));
    expect(assignees).not.toContain(uid(6));
    expect(assignees).not.toContain(uid(7));
    expect(assignees).not.toContain(uid(17));
  });

  it('claims only new unassigned platform leads and writes one truthful log across retries', async () => {
    await actor(2);
    expect(await scalar('SELECT public.claim_sales_leads($1) value', [[uid(301), uid(302), uid(303), uid(304), uid(303)]])).toBe(1);
    expect(await scalar('SELECT public.claim_sales_leads($1) value', [[uid(303)]])).toBe(0);
    expect(await scalar('SELECT count(*)::integer value FROM public.sales_lead_activities WHERE lead_id=$1 AND activity_type=$2', [uid(303), 'status_change'])).toBe(1);
    const events = (await db.query<{ organization_id: string | null; description: string }>('SELECT organization_id,description FROM public.sales_lead_activities WHERE lead_id=$1 AND activity_type=$2', [uid(303), 'status_change'])).rows;
    expect(events).toEqual([{ organization_id: null, description: 'Лид взят из общего пула' }]);
    await actor(18);
    expect(await scalar('SELECT public.claim_sales_leads($1) value', [[uid(303)]])).toBe(0);
    await db.exec('RESET ROLE');
    expect(await scalar('SELECT assigned_manager_id IS NULL value FROM public.sales_leads WHERE id=$1', [uid(302)])).toBe(true);
    expect(await scalar('SELECT status value FROM public.sales_leads WHERE id=$1', [uid(304)])).toBe('client');
  });

  it('rolls a claim back if the accompanying activity cannot be written', async () => {
    await db.exec(`CREATE FUNCTION public.reject_synthetic_activity() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic_activity_failure'; END $$;
      CREATE TRIGGER reject_synthetic_activity BEFORE INSERT ON public.sales_lead_activities
      FOR EACH ROW EXECUTE FUNCTION public.reject_synthetic_activity()`);
    await actor(2);
    await denied('SELECT public.claim_sales_leads($1)', [[uid(303)]], /synthetic_activity_failure/);
    expect(await scalar('SELECT assigned_manager_id IS NULL value FROM public.sales_leads WHERE id=$1', [uid(303)])).toBe(true);
    expect(await scalar('SELECT status value FROM public.sales_leads WHERE id=$1', [uid(303)])).toBe('new');
  });

  it('keeps a compatibility profile while any eligible org membership remains', async () => {
    await db.exec(`DELETE FROM public.org_staff WHERE user_id='${uid(11)}' AND organization_id='${uid(100)}'`);
    expect(await scalar('SELECT is_active value FROM public.sales_managers WHERE user_id=$1', [uid(11)])).toBe(true);
    await db.exec(`UPDATE public.org_staff SET expires_at=now()-interval '1 day' WHERE user_id='${uid(11)}'`);
    expect(await scalar('SELECT is_active value FROM public.sales_managers WHERE user_id=$1', [uid(11)])).toBe(false);
  });

  it('does not let organization edits deactivate or reactivate an independent platform manager', async () => {
    await db.exec(`DELETE FROM public.org_staff WHERE user_id='${uid(14)}'`);
    expect(await scalar('SELECT is_active value FROM public.sales_managers WHERE user_id=$1', [uid(14)])).toBe(true);
    await db.exec(`INSERT INTO public.org_staff(user_id,organization_id,role,can_receive_crm_tasks)
      VALUES('${uid(12)}','${uid(100)}','sales_manager',true)`);
    expect(await scalar('SELECT is_active value FROM public.sales_managers WHERE user_id=$1', [uid(12)])).toBe(false);
  });

  it('checks explicit actors for service callers and closes anonymous/internal entry points', async () => {
    await actor(null, 'service_role');
    expect(await scalar('SELECT public.is_platform_sales_manager($1) value', [uid(2)])).toBe(true);
    expect(await scalar('SELECT public.is_platform_sales_manager($1) value', [uid(4)])).toBe(false);
    expect(await scalar('SELECT public.is_platform_sales_manager($1) value', [uid(15)])).toBe(false);
    await actor(null, 'anon');
    await denied('SELECT public.is_platform_sales_manager($1)', [uid(2)]);
    await denied('SELECT public.claim_sales_leads($1)', [[uid(303)]]);
    await denied('SELECT * FROM public.list_org_task_assignees($1)', [uid(100)]);
    await actor(4);
    await denied('SELECT public.sync_org_staff_to_sales_managers()');
  });
});
