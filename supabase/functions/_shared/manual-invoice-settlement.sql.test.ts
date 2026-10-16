// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';

let db: PGlite;
const admin = '10000000-0000-0000-0000-000000000001';
const org = '20000000-0000-0000-0000-000000000001';
const invoice = '30000000-0000-0000-0000-000000000001';
const row = async (sql: string) => (await db.query<any>(sql)).rows[0];
const confirm = async () => (await row(`SELECT confirm_manual_subscription_invoice('${invoice}') result`)).result;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.role',true),'')$$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE TABLE organizations(id uuid PRIMARY KEY,paid_until timestamptz,subscription_plan text);
    CREATE TABLE user_roles(user_id uuid,role text);
    CREATE TABLE account_deletion_revocations(user_id uuid PRIMARY KEY);
    CREATE TABLE subscription_invoices(id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations(id),amount numeric(12,2),
      status text,paid_at timestamptz,payment_method text,payment_id text,tbank_order_id text,tbank_terminal_key text,
      plan text,period_months integer,billing_kind text NOT NULL DEFAULT 'prepaid',postpaid_statement_id uuid,
      service_period_start date,service_period_end date);
    GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role,anon;
    CREATE FUNCTION public.postpaid_authorize_invoice_write(uuid,text) RETURNS void LANGUAGE sql AS $$SELECT$$;
    CREATE FUNCTION public.has_active_postpaid_agreement(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
  `);
  const bankSql=readFileSync('supabase/migrations/20261016110000_atomic_payment_settlement.sql','utf8');
  await db.exec(bankSql.slice(bankSql.indexOf('CREATE FUNCTION public.tbank_add_calendar_months'), bankSql.indexOf('CREATE FUNCTION public.apply_tbank_payment_event')));
  await db.exec(readFileSync('supabase/migrations/20261016161000_manual_invoice_settlement.sql','utf8'));
},30000);
beforeEach(async () => {
  await db.exec(`RESET ROLE;
    TRUNCATE manual_invoice_settlements,subscription_invoices,organizations,user_roles,account_deletion_revocations CASCADE;
    INSERT INTO user_roles VALUES('${admin}','admin');
    INSERT INTO organizations VALUES('${org}','2040-01-31T12:00:00Z','professional');
    INSERT INTO subscription_invoices(id,organization_id,amount,status,payment_method,plan,period_months)
      VALUES('${invoice}','${org}',4490,'pending','invoice','start',1);
    SELECT set_config('request.jwt.claim.sub','${admin}',false),set_config('request.jwt.claim.role','authenticated',false);`);
});
afterAll(async () => db?.close());

describe('actual manual invoice settlement migration',()=>{
  it('atomically confirms an invoice once and clamps the access month end',async()=>{
    await db.exec('SET ROLE authenticated');
    expect(await confirm()).toMatchObject({applied:true,billing_kind:'prepaid'});
    expect(await confirm()).toMatchObject({applied:false,outcome:'already_confirmed'});
    await db.exec('RESET ROLE');
    expect(new Date((await row('SELECT paid_until FROM organizations')).paid_until).toISOString()).toBe('2040-02-29T12:00:00.000Z');
    expect((await row('SELECT subscription_plan FROM organizations')).subscription_plan).toBe('professional');
    expect((await row('SELECT status,paid_at FROM subscription_invoices'))).toMatchObject({status:'paid',paid_at:expect.any(Date)});
    expect(Number((await row('SELECT count(*) n FROM manual_invoice_settlements')).n)).toBe(1);
  });
  it('settles postpaid debt without altering current plan or access, even when replayed',async()=>{
    await db.exec(`UPDATE subscription_invoices SET billing_kind='postpaid',postpaid_statement_id=gen_random_uuid(),
      service_period_start='2026-10-01',service_period_end='2026-11-01';`);
    const before=await row('SELECT * FROM organizations');
    expect(await confirm()).toMatchObject({applied:true,billing_kind:'postpaid'});
    expect(await confirm()).toMatchObject({applied:false});
    expect(await row('SELECT * FROM organizations')).toEqual(before);
  });
  it('does not replay historical paid rows without a settlement ledger',async()=>{
    await db.exec("UPDATE subscription_invoices SET status='paid'");
    expect(await confirm()).toMatchObject({applied:false,outcome:'historical_paid'});
    expect(Number((await row('SELECT count(*) n FROM manual_invoice_settlements')).n)).toBe(0);
  });
  it('requires reconciliation of a prior prepaid invoice after postpaid activation',async()=>{
    await db.exec('CREATE OR REPLACE FUNCTION public.has_active_postpaid_agreement(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT true$$');
    try { await expect(confirm()).rejects.toThrow('requires reconciliation'); }
    finally { await db.exec('CREATE OR REPLACE FUNCTION public.has_active_postpaid_agreement(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$'); }
    expect((await row('SELECT status FROM subscription_invoices')).status).toBe('pending');
  });
  it.each(["DELETE FROM user_roles","INSERT INTO account_deletion_revocations VALUES('"+admin+"')",
    "SELECT set_config('request.jwt.claim.sub','',false)","SELECT set_config('request.jwt.claim.role','service_role',false)"])
    ('denies unauthorized/revoked actors: %s',async sql=>{await db.exec(sql);await expect(confirm()).rejects.toThrow('Active platform administrator');});
  it.each(["payment_method='tbank'","payment_id='12'","tbank_terminal_key='bound'","tbank_order_id='bound'"])
    ('does not manually settle bank identities: %s',async assignment=>{await db.exec(`UPDATE subscription_invoices SET ${assignment}`);await expect(confirm()).rejects.toThrow('Bank invoice');});
  it.each(["status='canceled'","amount=0","amount=-1","amount=NULL","amount='NaN'::numeric"])
    ('rejects invalid invoice state: %s',async assignment=>{await db.exec(`UPDATE subscription_invoices SET ${assignment}`);await expect(confirm()).rejects.toThrow('positive pending');});
  it('rolls back paid status and entitlement if ledger insertion fails',async()=>{
    await db.exec(`CREATE FUNCTION fixture_fail_ledger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'ledger failure'; END$$;
      CREATE TRIGGER fixture_fail BEFORE INSERT ON manual_invoice_settlements FOR EACH ROW EXECUTE FUNCTION fixture_fail_ledger();`);
    const before=await row('SELECT * FROM organizations');
    try {
      await expect(confirm()).rejects.toThrow('ledger failure');
      expect(await row('SELECT * FROM organizations')).toEqual(before);
      expect((await row('SELECT status,paid_at FROM subscription_invoices'))).toEqual({status:'pending',paid_at:null});
    } finally {await db.exec('DROP TRIGGER fixture_fail ON manual_invoice_settlements; DROP FUNCTION fixture_fail_ledger()');}
    expect(await confirm()).toMatchObject({applied:true});
  });
  it('does not allow anonymous execution or direct browser ledger writes',async()=>{
    await db.exec('SET ROLE anon');await expect(confirm()).rejects.toThrow('permission denied');
    await db.exec('RESET ROLE; SET ROLE authenticated');
    await expect(db.exec('DELETE FROM manual_invoice_settlements')).rejects.toThrow('permission denied');
  });
});
