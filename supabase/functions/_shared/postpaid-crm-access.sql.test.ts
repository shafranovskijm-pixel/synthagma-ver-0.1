// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { canonicalFunctionSql, installCanonicalQuotaFunctions, postpaidAccessFixture } from './postpaid-access.fixture';

const org='10000000-0000-0000-0000-000000000001';
const other='10000000-0000-0000-0000-000000000002';
const owner='20000000-0000-0000-0000-000000000001';
const staff='20000000-0000-0000-0000-000000000002';
const today="(now() AT TIME ZONE 'Europe/Moscow')::date";
const migration=readFileSync('supabase/migrations/20261016162000_postpaid_access.sql','utf8');
let db:PGlite;
const row=async(sql:string,args:unknown[]=[]) => (await db.query<any>(sql,args)).rows[0];
const gate=async(target=org,permission='sales.read')=>(await row('SELECT public.org_crm_access_allowed($1,$2) allowed',[target,permission])).allowed;
const save=async(target=org)=>(await row(`SELECT public.org_crm_save_client($1,NULL,'{"org_name":"Synthetic client"}') result`,[target])).result;
const active=async()=>db.exec(`INSERT INTO organization_billing_agreements VALUES('${org}',${today},NULL)`);
const consent=async(override='')=>db.exec(`INSERT INTO postpaid_feature_confirmations(organization_id,feature,notified_at,confirmed_at)
  VALUES('${org}','crm',now()-interval '2 days',now()-interval '1 day'); ${override}`);

beforeAll(async()=>{
  db=new PGlite(); await db.exec(postpaidAccessFixture); await installCanonicalQuotaFunctions(db);
  await db.exec(`CREATE TABLE org_crm_clients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,org_name text,inn text,email text,
    phone text,address text,notes text,created_by uuid,updated_at timestamptz DEFAULT now());
    ALTER TABLE org_crm_clients ENABLE ROW LEVEL SECURITY;
    CREATE POLICY org_crm_read ON org_crm_clients FOR SELECT TO authenticated USING(public.org_crm_access_allowed(organization_id,'sales.read'));
    GRANT SELECT ON org_crm_clients TO authenticated;`);
  for(const name of ['org_crm_require_write','org_crm_save_client']) {
    await db.exec(canonicalFunctionSql(name,'20261012200000_org_crm_beta.sql','fn'));
  }
  await db.exec(`REVOKE ALL ON FUNCTION public.org_crm_require_write(uuid,jsonb,text[]) FROM PUBLIC,anon,authenticated;
    REVOKE ALL ON FUNCTION public.org_crm_save_client(uuid,uuid,jsonb,timestamptz) FROM PUBLIC,anon;
    GRANT EXECUTE ON FUNCTION public.org_crm_save_client(uuid,uuid,jsonb,timestamptz) TO authenticated,service_role;`);
  const before=await row("SELECT proacl,prosecdef,proowner,proconfig,provolatile FROM pg_proc WHERE oid='org_crm_access_allowed(uuid,text)'::regprocedure");
  await db.exec(migration);
  expect(await row("SELECT proacl,prosecdef,proowner,proconfig,provolatile FROM pg_proc WHERE oid='org_crm_access_allowed(uuid,text)'::regprocedure")).toEqual(before);
},30000);
beforeEach(async()=>{
  await db.exec(`RESET ROLE; TRUNCATE postpaid_feature_confirmations,organization_billing_agreements,account_deletion_revocations,
    org_crm_clients,profiles,user_roles,org_staff,organizations;
    INSERT INTO organizations VALUES('${org}','free',NULL,NULL),('${other}','free',NULL,NULL);
    INSERT INTO profiles(user_id,organization_id) VALUES('${owner}','${org}');
    INSERT INTO user_roles VALUES('${owner}','organization');
    SELECT set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claim.sub','${owner}',false);`);
});
afterAll(async()=>db?.close());

describe('actual central CRM gate and write RPC with postpayment',()=>{
  it('opens free-plan CRM reads and the actual save-client RPC only with an active agreement and prior consent',async()=>{
    expect(await gate()).toBe(false); await active(); expect(await gate()).toBe(false);
    await db.exec('SET ROLE authenticated'); await expect(save()).rejects.toThrow('crm_forbidden');
    await db.exec('RESET ROLE'); await consent(); await db.exec('SET ROLE authenticated');
    expect(await gate()).toBe(true); expect(await gate(org,'sales.write')).toBe(true);
    expect(await save()).toMatchObject({id:expect.any(String)});
    expect((await db.query('SELECT * FROM org_crm_clients')).rows).toHaveLength(1);
    await expect(db.exec(`INSERT INTO org_crm_clients(organization_id,org_name) VALUES('${org}','Direct')`)).rejects.toThrow('permission denied');
  });
  it('does not let a legacy premium plan bypass missing postpaid consent',async()=>{
    await db.exec("UPDATE organizations SET subscription_plan='professional'");
    expect(await gate()).toBe(true); await active(); expect(await gate()).toBe(false);
    await expect(save()).rejects.toThrow('crm_forbidden');
  });
  it.each(['free','start','standard','professional','maximum'])('preserves legacy prepaid plan behavior: %s',async plan=>{
    await db.query('UPDATE organizations SET subscription_plan=$1',[plan]); await consent();
    expect(await gate()).toBe(['standard','professional','maximum'].includes(plan));
  });
  it.each([
    ['future confirmation',"confirmed_at=now()+interval '1 day'"],
    ['expired confirmation','effective_to=now()'],
    ['notice after confirmation','notified_at=now()'],
    ['different feature',"feature='webinar'"],
    ['different organization',`organization_id='${other}'`],
  ])('rejects invalid consent: %s',async(_name,assignment)=>{
    await active(); await consent(`UPDATE postpaid_feature_confirmations SET ${assignment}`);
    expect(await gate()).toBe(false); await expect(save()).rejects.toThrow('crm_forbidden');
  });
  it.each(['future','expired'])('does not grant free-plan CRM outside an %s agreement',async state=>{
    await db.exec(`INSERT INTO organization_billing_agreements VALUES('${org}',${today}${state==='future'?'+1':'-1'},${state==='expired'?today:'NULL'})`);
    await consent(); expect(await gate()).toBe(false);
  });
  it('retains tenant scope, revoked-user denial and permission-name checks',async()=>{
    await active(); await consent();
    expect(await gate(other)).toBe(false); expect(await gate(org,'settings.write')).toBe(false);
    await expect(save(other)).rejects.toThrow('crm_forbidden');
    await db.exec(`INSERT INTO account_deletion_revocations VALUES('${owner}')`);
    expect(await gate()).toBe(false); await expect(save()).rejects.toThrow('crm_forbidden');
  });
  it('retains separate staff read/write permissions and expiry',async()=>{
    await active(); await consent();
    await db.exec(`INSERT INTO org_staff VALUES('${staff}','${org}',NULL,ARRAY['sales.read']);
      SELECT set_config('request.jwt.claim.sub','${staff}',false); SET ROLE authenticated`);
    expect(await gate()).toBe(true); expect(await gate(org,'sales.write')).toBe(false);
    await expect(save()).rejects.toThrow('crm_forbidden');
    await db.exec(`RESET ROLE; UPDATE org_staff SET permissions=ARRAY['sales.read','sales.write']; SET ROLE authenticated`);
    expect(await save()).toMatchObject({id:expect.any(String)});
    await db.exec(`RESET ROLE; UPDATE org_staff SET expires_at=now(); SET ROLE authenticated`);
    expect(await gate()).toBe(false); await expect(save()).rejects.toThrow('crm_forbidden');
    expect((await db.query('SELECT * FROM org_crm_clients')).rows).toHaveLength(0);
  });
  it('keeps service-without-user and anonymous access closed',async()=>{
    await active(); await consent();
    await db.exec("SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false); SET ROLE service_role");
    expect(await gate()).toBe(false); await expect(save()).rejects.toThrow('crm_forbidden');
    await db.exec('RESET ROLE; SET ROLE anon'); await expect(gate()).rejects.toThrow('permission denied');
  });
  it('rolls back quota patches if the canonical CRM helper has drifted',async()=>{
    const isolated=new PGlite();
    try {
      await isolated.exec(postpaidAccessFixture); await installCanonicalQuotaFunctions(isolated);
      await isolated.exec(`CREATE OR REPLACE FUNCTION org_crm_access_allowed(p_organization_id uuid,p_permission text) RETURNS boolean LANGUAGE sql AS $$SELECT true$$`);
      const before=(await isolated.query("SELECT prosrc FROM pg_proc WHERE proname='get_organization_student_capacity'")).rows;
      await expect(isolated.exec(migration)).rejects.toThrow('CRM access canonical function drift');
      await isolated.exec('ROLLBACK');
      expect((await isolated.query("SELECT prosrc FROM pg_proc WHERE proname='get_organization_student_capacity'")).rows).toEqual(before);
    } finally {await isolated.close();}
  });
});
