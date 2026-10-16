// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";

const id = (n: number) => `${n.toString(16).padStart(8, "0")}-0000-0000-0000-000000000000`;
let db: PGlite;
const sql = (name: string) => readFileSync(resolve(process.cwd(), "supabase/migrations", name), "utf8");
const one = async (query: string, params: unknown[] = []) => (await db.query<any>(query, params)).rows[0];
const event = async (n = 10, kind = "subscription", status = "CONFIRMED", amount = 449000, paymentId = String(n)) =>
  (await one("SELECT public.apply_tbank_payment_event($1,$2,$3,'fixture-terminal',$4,$5) result", [kind, id(n), paymentId, amount, status])).result;
const invoice = async (n: number, plan = "start", created = "2026-10-01", months = 1) => db.query(
  `INSERT INTO subscription_invoices(id,organization_id,invoice_number,plan,amount,period_months,status,created_at,payment_method,payment_id,tbank_order_id,tbank_terminal_key)
   VALUES($1,$2,$3,$4,4490,$5,'pending',$6,'tbank',$7,$8,'fixture-terminal')`,
  [id(n), id(1), `fixture-${n}`, plan, months, created, String(n), `sub_${id(n).replaceAll("-", "").slice(0, 28)}`],
);

beforeAll(async () => {
  db = new PGlite();
  // Minimal schema contracts, with no hosted URL or business records. The
  // production ledger and settlement SQL below are executed unmodified.
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE organizations(id uuid PRIMARY KEY, balance numeric NOT NULL DEFAULT 0,subscription_plan text,paid_until timestamptz);
    CREATE TABLE organization_billing_agreements(organization_id uuid PRIMARY KEY,effective_from date NOT NULL,effective_to date);
    CREATE TABLE user_roles(user_id uuid,role text);
    CREATE TABLE profiles(user_id uuid PRIMARY KEY,organization_id uuid,archived_at timestamptz);
    CREATE TABLE account_deletion_revocations(user_id uuid PRIMARY KEY);
    CREATE TABLE subscription_invoices(id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations(id),invoice_number text,
      invoice_date date DEFAULT current_date,plan text,amount numeric(12,2),period_months int,status text,created_at timestamptz DEFAULT now(),
      payment_id text,payment_method text,paid_at timestamptz,buyer_name text,buyer_inn text,buyer_kpp text);
    CREATE TABLE courses(id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations(id),title text,default_access_days int);
    CREATE TABLE course_payments(id uuid PRIMARY KEY,organization_id uuid REFERENCES organizations(id),course_id uuid REFERENCES courses(id),
      user_id uuid,amount numeric,status text,robokassa_inv_id bigint UNIQUE,payment_method text,paid_at timestamptz);
    CREATE TABLE enrollments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,course_id uuid REFERENCES courses(id),
      status text,progress int,access_days int,expires_at timestamptz,started_at timestamptz DEFAULT now(),completed_at timestamptz,
      UNIQUE(user_id,course_id));
    CREATE TABLE balance_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid REFERENCES organizations(id),
      amount numeric,type text,description text,related_order_id uuid,performed_by uuid);
    CREATE TABLE admin_notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type text,title text,message text,related_entity_id text,metadata jsonb);
    GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;
    GRANT SELECT,INSERT,UPDATE ON subscription_invoices TO authenticated;
  `);
  await db.exec(sql("20260822164000_atomic_tbank_balance_credit.sql"));
  await db.exec(sql("20260412113747_4067e6e8-c9ad-4001-8c78-6e85bc7ecb10.sql").replace(/ALTER TABLE public\.enrollments[\s\S]*?;/, ""));
  await db.exec(sql("20261016110000_atomic_payment_settlement.sql"));
  await db.exec(sql("20261016164000_postpaid_bank_guard.sql"));
}, 30000);
beforeEach(async () => {
  await db.exec(`RESET ROLE; SET timezone='UTC'; SELECT set_config('request.jwt.claim.role','service_role',false);
    TRUNCATE organization_billing_agreements,tbank_payment_settlements,admin_notifications,balance_transactions,enrollments,course_payments,courses,subscription_invoices,profiles,organizations,user_roles,account_deletion_revocations CASCADE;
    INSERT INTO organizations VALUES('${id(1)}',0,'start','2040-11-16T12:00:00Z');
    INSERT INTO profiles VALUES('${id(2)}','${id(1)}',NULL);
    INSERT INTO courses VALUES('${id(3)}','${id(1)}','Fixture course',30);
    INSERT INTO course_payments(id,organization_id,course_id,user_id,amount,status,robokassa_inv_id,payment_method,tbank_terminal_key)
    VALUES('${id(20)}','${id(1)}','${id(3)}','${id(2)}',4490,'pending',20,'tbank','fixture-terminal');`);
  await invoice(10);
});
afterAll(async () => { await db?.close(); });

describe("actual atomic payment migration", () => {
  it("ships identical SQL release copies and executable read-only diagnostics", async () => {
    const release = (name: string) => readFileSync(resolve(process.cwd(), "docs/releases/sintagma-production/payment-settlement-20261016", name), "utf8");
    expect(release("10-ledger-prerequisite.sql")).toBe(sql("20260822164000_atomic_tbank_balance_credit.sql"));
    expect(release("20-atomic-payment-settlement.sql")).toBe(sql("20261016110000_atomic_payment_settlement.sql"));
    await db.exec(release("00-preflight.sql"));
    const postcheck = await db.exec(release("30-postcheck.sql"));
    expect(postcheck[0].rows[0]).toEqual({ ledger_rpc: true, settlement_rpc: true, settlement_table: true });
    expect(postcheck[1].rows.every((r: any) => r.service_can_execute && !r.browser_can_execute && !r.anon_can_execute)).toBe(true);
  });
  it("accepts a pending invoice inserted by the previous checkout during SQL-first rollout", async () => {
    await db.query(`INSERT INTO subscription_invoices(id,organization_id,invoice_number,plan,amount,period_months,status,payment_method,payment_id)
      VALUES($1,$2,'legacy-checkout','start',3490,1,'pending','tbank','12')`, [id(12), id(1)]);
    expect((await one("SELECT tbank_order_id FROM subscription_invoices WHERE id=$1", [id(12)])).tbank_order_id).toBe(`sub_${id(12).replaceAll("-", "").slice(0, 28)}`);
    expect((await event(12, "subscription", "CONFIRMED", 349000)).applied).toBe(true);
  });
  it("preserves the remaining term when paying early", async () => {
    expect((await event()).applied).toBe(true);
    const org = await one("SELECT paid_until,balance FROM organizations");
    expect(new Date(org.paid_until).toISOString()).toBe("2040-12-16T12:00:00.000Z");
    expect(Number(org.balance)).toBe(4490);
    expect((await one("SELECT status FROM subscription_invoices")).status).toBe("paid");
  });
  it("records a prior prepaid checkout after postpaid activation once, without changing plan or access", async () => {
    await db.query(`INSERT INTO organization_billing_agreements VALUES($1,(now() AT TIME ZONE 'Europe/Moscow')::date,NULL)`,[id(1)]);
    await db.exec("UPDATE organizations SET subscription_plan='free'");
    const access=await one('SELECT subscription_plan,paid_until FROM organizations');
    expect(await event()).toMatchObject({applied:true,outcome:'review_required',requires_review:true});
    expect(await one('SELECT subscription_plan,paid_until FROM organizations')).toEqual(access);
    expect(Number((await one('SELECT balance FROM organizations')).balance)).toBe(4490);
    expect((await one('SELECT status FROM subscription_invoices')).status).toBe('paid');
    expect((await one('SELECT review_reason FROM tbank_payment_settlements')).review_reason).toBe('prepaid_payment_after_postpaid_activation');
    expect((await one('SELECT metadata FROM admin_notifications')).metadata.reason).toBe('prepaid_payment_after_postpaid_activation');
    expect(await event()).toMatchObject({applied:false,outcome:'review_required',requires_review:true});
    expect(await one('SELECT subscription_plan,paid_until FROM organizations')).toEqual(access);
    for(const table of ['balance_transactions','tbank_payment_settlements','admin_notifications']) {
      expect(Number((await one(`SELECT count(*) n FROM ${table}`)).n)).toBe(1);
    }
  });
  it.each(['future','expired'])('keeps ordinary early renewal for an %s postpaid agreement', async state => {
    await db.query(`INSERT INTO organization_billing_agreements VALUES($1,
      (now() AT TIME ZONE 'Europe/Moscow')::date + $2::int,
      CASE WHEN $2::int<0 THEN (now() AT TIME ZONE 'Europe/Moscow')::date ELSE NULL END)`,[id(1),state==='future'?1:-1]);
    expect(await event()).toMatchObject({applied:true,outcome:'applied',requires_review:false});
    expect(new Date((await one('SELECT paid_until FROM organizations')).paid_until).toISOString()).toBe('2040-12-16T12:00:00.000Z');
    expect(Number((await one('SELECT count(*) n FROM admin_notifications')).n)).toBe(0);
  });
  it('rolls back received money and paid status if the postpaid review notification fails, then retries once', async()=>{
    await db.query(`INSERT INTO organization_billing_agreements VALUES($1,(now() AT TIME ZONE 'Europe/Moscow')::date,NULL)`,[id(1)]);
    const before=await one('SELECT * FROM organizations');
    await db.exec(`CREATE FUNCTION fixture_fail_review() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'review notification failure'; END$$;
      CREATE TRIGGER fixture_fail_review BEFORE INSERT ON admin_notifications FOR EACH ROW EXECUTE FUNCTION fixture_fail_review()`);
    try {
      await expect(event()).rejects.toThrow('review notification failure');
      expect(await one('SELECT * FROM organizations')).toEqual(before);
      expect((await one('SELECT status FROM subscription_invoices')).status).toBe('pending');
      expect(Number((await one('SELECT count(*) n FROM balance_transactions')).n)).toBe(0);
      expect(Number((await one('SELECT count(*) n FROM tbank_payment_settlements')).n)).toBe(0);
    } finally {await db.exec('DROP TRIGGER fixture_fail_review ON admin_notifications; DROP FUNCTION fixture_fail_review()');}
    expect(await event()).toMatchObject({applied:true,requires_review:true});
    expect(Number((await one('SELECT count(*) n FROM balance_transactions')).n)).toBe(1);
  });
  it('does not alter course payment grants merely because the organization uses postpayment', async()=>{
    await db.query(`INSERT INTO organization_billing_agreements VALUES($1,(now() AT TIME ZONE 'Europe/Moscow')::date,NULL)`,[id(1)]);
    expect(await event(20,'course')).toMatchObject({applied:true,outcome:'applied'});
    expect((await one('SELECT status FROM enrollments')).status).toBe('active');
  });
  it('rejects a repeated postpaid bank patch without modifying the settlement function', async()=>{
    const before=await one("SELECT prosrc FROM pg_proc WHERE proname='apply_tbank_payment_event'");
    await expect(db.exec(sql('20261016164000_postpaid_bank_guard.sql'))).rejects.toThrow('canonical settlement function drift');
    await db.exec('ROLLBACK');
    expect(await one("SELECT prosrc FROM pg_proc WHERE proname='apply_tbank_payment_event'")).toEqual(before);
  });
  it("does not downgrade or change the term on replay after a newer annual upgrade", async () => {
    await event();
    await invoice(11, "professional", "2026-10-10", 12);
    await event(11);
    const before = await one("SELECT subscription_plan,paid_until,balance FROM organizations");
    expect(before.subscription_plan).toBe("professional");
    expect((await event()).applied).toBe(false);
    expect(await one("SELECT subscription_plan,paid_until,balance FROM organizations")).toEqual(before);
    expect(Number((await one("SELECT count(*) n FROM balance_transactions")).n)).toBe(2);
  });
  it("records an older first delivery for reconciliation without overwriting a newer different plan", async () => {
    await invoice(11, "professional", "2026-10-10", 12);
    await event(11);
    const before = await one("SELECT subscription_plan,paid_until FROM organizations");
    expect(await event()).toMatchObject({ applied: true, outcome: "review_required", requires_review: true });
    expect(await one("SELECT subscription_plan,paid_until FROM organizations")).toEqual(before);
    expect((await one("SELECT status FROM subscription_invoices WHERE id=$1", [id(10)])).status).toBe("paid");
    expect(Number((await one("SELECT count(*) n FROM admin_notifications")).n)).toBe(1);
    expect((await event()).applied).toBe(false);
    expect(Number((await one("SELECT count(*) n FROM admin_notifications")).n)).toBe(1);
  });
  it("extends the same plan even when its first callback arrives out of order", async () => {
    await invoice(11, "start", "2026-10-10"); await event(11); await event();
    expect(new Date((await one("SELECT paid_until FROM organizations")).paid_until).toISOString()).toBe("2041-01-16T12:00:00.000Z");
  });
  it.each([
    ["2040-01-31T12:00:00Z", 1, "2040-02-29T12:00:00.000Z"],
    ["2040-02-29T12:00:00Z", 12, "2041-02-28T12:00:00.000Z"],
    ["2041-01-31T12:00:00Z", 1, "2041-02-28T12:00:00.000Z"],
  ])("clamps calendar month ends: %s + %s", async (date, months, expected) => {
    await db.exec("SET timezone='Pacific/Auckland'");
    const result = await one("SELECT tbank_add_calendar_months($1,$2) result", [date, months]);
    expect(new Date(result.result).toISOString()).toBe(expected);
  });
  it("grants course access and records payment and ledger in one transaction", async () => {
    expect((await event(20, "course")).applied).toBe(true);
    const row = await one("SELECT status,progress,access_days,expires_at,started_at FROM enrollments");
    expect(row).toMatchObject({ status: "active", progress: 0, access_days: 30 });
    expect(new Date(row.expires_at).getTime() - new Date(row.started_at).getTime()).toBe(30 * 86400000);
    expect((await one("SELECT status FROM course_payments")).status).toBe("paid");
    expect((await event(20, "course")).applied).toBe(false);
    expect(Number((await one("SELECT count(*) n FROM enrollments")).n)).toBe(1);
  });
  it("rolls back balance, ledger, payment and settlement when enrollment insertion fails, then safely retries", async () => {
    await db.exec(`CREATE FUNCTION fixture_fail_enrollment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture enrollment failure'; END $$;
      CREATE TRIGGER fixture_failure BEFORE INSERT ON enrollments FOR EACH ROW EXECUTE FUNCTION fixture_fail_enrollment();`);
    try {
      await expect(event(20, "course")).rejects.toThrow("fixture enrollment failure");
      expect(Number((await one("SELECT balance FROM organizations")).balance)).toBe(0);
      expect(Number((await one("SELECT count(*) n FROM balance_transactions")).n)).toBe(0);
      expect(Number((await one("SELECT count(*) n FROM tbank_payment_settlements")).n)).toBe(0);
      expect((await one("SELECT status FROM course_payments")).status).toBe("pending");
    } finally { await db.exec("DROP TRIGGER fixture_failure ON enrollments; DROP FUNCTION fixture_fail_enrollment()"); }
    expect((await event(20, "course")).applied).toBe(true);
  });
  it("rolls back subscription access and money if a paid-status side-effect trigger fails", async () => {
    // This stands in for the existing referral enqueue trigger: an AFTER
    // status-write failure must roll back the earlier entitlement and ledger.
    const before = await one("SELECT * FROM organizations");
    await db.exec(`CREATE FUNCTION fixture_fail_paid() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.status='paid' THEN RAISE EXCEPTION 'fixture paid trigger failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fixture_paid_failure AFTER UPDATE OF status ON subscription_invoices FOR EACH ROW EXECUTE FUNCTION fixture_fail_paid();`);
    try {
      await expect(event()).rejects.toThrow("fixture paid trigger failure");
      expect(await one("SELECT * FROM organizations")).toEqual(before);
      expect((await one("SELECT status FROM subscription_invoices")).status).toBe("pending");
      expect(Number((await one("SELECT count(*) n FROM balance_transactions")).n)).toBe(0);
      expect(Number((await one("SELECT count(*) n FROM tbank_payment_settlements")).n)).toBe(0);
    } finally { await db.exec("DROP TRIGGER fixture_paid_failure ON subscription_invoices; DROP FUNCTION fixture_fail_paid()"); }
    expect((await event()).applied).toBe(true);
  });
  it.each(["active", "completed"])("preserves history and flags expired %s enrollment for review", async status => {
    await db.query("INSERT INTO enrollments(user_id,course_id,status,progress,access_days,started_at) VALUES($1,$2,$3,70,1,'2020-01-01')", [id(2), id(3), status]);
    expect(await event(20, "course")).toMatchObject({ requires_review: true, outcome: "review_required" });
    expect((await one("SELECT progress FROM enrollments")).progress).toBe(70);
  });
  it("does not reactivate historical subscriptions whose ledger event already exists", async () => {
    await db.query("SELECT apply_tbank_balance_credit($1,4490,'subscription','Fixture',$2)", [id(1), `tbank:subscription:${id(10)}`]);
    await db.exec("UPDATE organizations SET subscription_plan='professional',paid_until='2045-01-01'");
    const before = await one("SELECT * FROM organizations");
    expect(await event()).toMatchObject({ applied: false, outcome: "legacy_replay" });
    expect(await one("SELECT * FROM organizations")).toEqual(before);
  });
  it.each(["paid", "failed"])("does not recredit historical %s payment with a paid marker but no keyed ledger", async status => {
    await db.query("UPDATE subscription_invoices SET status=$1,paid_at='2026-10-01'", [status]);
    const before = await one("SELECT * FROM organizations");
    expect(await event()).toMatchObject({ applied: false, outcome: "review_required", requires_review: true });
    expect(await one("SELECT * FROM organizations")).toEqual(before);
    expect(Number((await one("SELECT count(*) n FROM balance_transactions")).n)).toBe(0);
    expect((await one("SELECT review_reason FROM tbank_payment_settlements")).review_reason).toBe("historical_paid_without_ledger");
    await event();
    expect(Number((await one("SELECT count(*) n FROM admin_notifications")).n)).toBe(1);
  });
  it("rejects incorrect amount and bank payment identity before any credit", async () => {
    await expect(event(10, "subscription", "CONFIRMED", 1)).rejects.toThrow("identity or amount mismatch");
    await expect(event(10, "subscription", "CONFIRMED", 449000, "999")).rejects.toThrow("identity or amount mismatch");
    expect(Number((await one("SELECT count(*) n FROM balance_transactions")).n)).toBe(0);
  });
  it("does not regress a paid invoice on a late canceled notification", async () => {
    await event(); await event(10, "subscription", "CANCELED");
    expect((await one("SELECT status FROM subscription_invoices")).status).toBe("paid");
  });
  it("denies direct browser settlement and financial invoice tampering while retaining pending manual invoices", async () => {
    await db.exec("SELECT set_config('request.jwt.claim.role','authenticated',false); SET ROLE authenticated");
    await expect(event()).rejects.toThrow(/permission denied/);
    await expect(db.query("UPDATE subscription_invoices SET amount=1 WHERE id=$1", [id(10)])).rejects.toThrow("financial fields are immutable");
    await expect(db.query("INSERT INTO subscription_invoices(id,organization_id,plan,amount,status,payment_method) VALUES($1,$2,'maximum',1,'paid','invoice')", [id(30), id(1)])).rejects.toThrow("Trusted checkout required");
    await db.query("INSERT INTO subscription_invoices(id,organization_id,plan,amount,status,payment_method) VALUES($1,$2,'start',4490,'pending','invoice')", [id(31), id(1)]);
    expect((await one("SELECT status FROM subscription_invoices WHERE id=$1", [id(31)])).status).toBe("pending");
  });
});
