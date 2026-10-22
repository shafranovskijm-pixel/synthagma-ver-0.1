// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { calculatePostpaid } from '../../functions/_shared/postpaid-billing';
import { installCanonicalQuotaFunctions } from '../../functions/_shared/postpaid-access.fixture';
const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const migration=(name:string)=>readFile(new URL(`../../migrations/${name}`,import.meta.url),'utf8');
let db:PGlite; let month:string; let previous:string;
const scalar=async(sql:string,args:unknown[]=[])=> (await db.query<{value:any}>(sql,args)).rows[0]?.value;
const call=(name:string,args:unknown[]=[])=>scalar(`SELECT public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) AS value`,args);
async function actor(n:number|null,role='authenticated') {
 await db.exec(`RESET ROLE; SET LOCAL ROLE ${role}; SELECT set_config('request.jwt.claim.role','${role}',true); SELECT set_config('request.jwt.claim.sub','${n===null?'':id(n)}',true);`);
}
async function denied(sql:string,args:unknown[]=[],pattern=/administrator|permission denied|row-level|Guarded|immutable|access|required|disabled|open|changed|Invalid|cannot|outside|match|confirmation|period|bank-transfer/i) {
 await db.exec('SAVEPOINT denial'); await expect(db.query(sql,args)).rejects.toThrow(pattern); await db.exec('ROLLBACK TO SAVEPOINT denial; RELEASE SAVEPOINT denial');
}
const agreement=(start=previous,end:string|null=null)=>call('save_postpaid_agreement',[id(100),start,'59-09/26 от 08.09.2026','Подписанный договор, письмо 23 сентября 2026',end]);
const prepare=(start=previous)=>call('prepare_postpaid_statement',[id(100),start]);
const approve=(statement:string,courses:number|null=0,learners:number|null=0)=>call('approve_postpaid_statement',[statement,'История, офлайн и подтверждения функций проверены администратором.',courses,learners]);
async function tokenCount() { await db.exec('RESET ROLE'); const count=await scalar('SELECT count(*)::int value FROM postpaid_invoice_write_tokens'); await actor(1); return count; }

beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`
 CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE TYPE public.app_role AS ENUM('admin','organization','student');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.role',true),'') $$;
 CREATE TABLE public.organizations(id uuid PRIMARY KEY,name text,subscription_plan text DEFAULT 'free',paid_until timestamptz);
 CREATE TABLE public.user_roles(user_id uuid,role public.app_role);
 CREATE TABLE public.account_deletion_revocations(user_id uuid PRIMARY KEY);
 CREATE TABLE public.profiles(user_id uuid PRIMARY KEY,organization_id uuid,archived_at timestamptz,blocked_at timestamptz);
 CREATE TABLE public.courses(id uuid PRIMARY KEY,organization_id uuid);
 CREATE TABLE public.lessons(id uuid PRIMARY KEY,course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE);
 CREATE TABLE public.enrollments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  progress integer DEFAULT 0,status text DEFAULT 'active',time_spent integer DEFAULT 0,completed_at timestamptz);
 CREATE TABLE public.lesson_progress(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lesson_id uuid REFERENCES public.lessons(id) ON DELETE CASCADE,user_id uuid,
  completed boolean DEFAULT false,completed_at timestamptz,time_spent integer DEFAULT 0,video_position numeric DEFAULT 0);
 CREATE TABLE public.test_attempt_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,lesson_id uuid REFERENCES public.lessons(id) ON DELETE CASCADE,started_at timestamptz DEFAULT now());
 CREATE TABLE public.test_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,lesson_id uuid REFERENCES public.lessons(id) ON DELETE CASCADE,completed_at timestamptz DEFAULT now());
 CREATE TABLE public.homework_submissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),student_id uuid,course_id uuid,organization_id uuid,lesson_id uuid,
  content text,attachments jsonb DEFAULT '[]',status text DEFAULT 'pending',submitted_at timestamptz DEFAULT now());
 CREATE TABLE public.org_crm_clients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,title text,updated_at timestamptz DEFAULT now());
 CREATE TABLE public.org_crm_deals(LIKE public.org_crm_clients INCLUDING ALL);
 CREATE TABLE public.org_crm_tasks(LIKE public.org_crm_clients INCLUDING ALL);
 CREATE TABLE public.org_crm_activities(LIKE public.org_crm_clients INCLUDING ALL);
 CREATE TABLE public.webinars(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid,status text DEFAULT 'scheduled');
 CREATE TABLE public.subscription_invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL,invoice_number text NOT NULL,invoice_date date DEFAULT current_date,
  plan text NOT NULL,amount numeric(12,2) NOT NULL,period_months integer DEFAULT 1,status text DEFAULT 'pending',payment_method text DEFAULT 'invoice',paid_at timestamptz,
  payment_id text,tbank_order_id text,tbank_terminal_key text,created_at timestamptz DEFAULT now());
 CREATE TABLE public.admin_notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type text,title text,message text,related_entity_id text,metadata jsonb);
 CREATE FUNCTION public.has_role(_role public.app_role,_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=_user_id AND role=_role) $$;
 CREATE FUNCTION public.account_deletion_access_allowed() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT NOT EXISTS(SELECT 1 FROM account_deletion_revocations WHERE user_id=auth.uid()) $$;
 CREATE FUNCTION public.can_access_organization(org uuid,permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT public.account_deletion_access_allowed() AND EXISTS(SELECT 1 FROM profiles p JOIN user_roles r ON r.user_id=p.user_id
   WHERE p.user_id=auth.uid() AND p.organization_id=org AND r.role='organization' AND p.archived_at IS NULL AND p.blocked_at IS NULL) $$;
 CREATE FUNCTION public.can_access_course_as_learner(course uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT public.account_deletion_access_allowed() AND EXISTS(SELECT 1 FROM enrollments e JOIN courses c ON c.id=e.course_id JOIN profiles p ON p.user_id=e.user_id
   WHERE e.user_id=auth.uid() AND c.id=course AND c.organization_id=p.organization_id AND p.archived_at IS NULL AND p.blocked_at IS NULL) $$;
 CREATE FUNCTION public.tbank_add_calendar_months(start_time timestamptz,months integer) RETURNS timestamptz LANGUAGE sql AS $$ SELECT start_time+make_interval(months=>months) $$;
 GRANT USAGE ON SCHEMA auth,public TO authenticated,anon,service_role;
 GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated,anon,service_role;
 INSERT INTO organizations(id,name) VALUES('${id(100)}','Synthetic postpaid'),('${id(200)}','Other tenant');
 INSERT INTO user_roles VALUES('${id(1)}','admin'),('${id(2)}','organization'),('${id(3)}','student'),('${id(4)}','student'),('${id(5)}','admin');
 INSERT INTO profiles(user_id,organization_id) VALUES('${id(1)}','${id(100)}'),('${id(2)}','${id(100)}'),('${id(3)}','${id(100)}'),('${id(4)}','${id(200)}'),('${id(5)}','${id(100)}');
 INSERT INTO account_deletion_revocations VALUES('${id(5)}');
 INSERT INTO courses VALUES('${id(300)}','${id(100)}'),('${id(301)}','${id(100)}'),('${id(400)}','${id(200)}');
 INSERT INTO lessons VALUES('${id(500)}','${id(300)}'),('${id(501)}','${id(301)}'),('${id(600)}','${id(400)}');
 INSERT INTO enrollments(user_id,course_id) VALUES('${id(3)}','${id(300)}'),('${id(3)}','${id(301)}'),('${id(4)}','${id(400)}');
 ALTER TABLE organizations ADD COLUMN custom_max_students integer, ADD COLUMN custom_max_courses integer;
 ALTER TABLE profiles ADD COLUMN full_name text, ADD COLUMN email text, ADD COLUMN login text, ADD COLUMN generated_password text,
  ADD COLUMN company_id uuid, ADD COLUMN student_group_id uuid, ADD COLUMN region text;
 ALTER TABLE user_roles ADD UNIQUE(user_id);
 ALTER TABLE courses ADD COLUMN system_key text, ADD COLUMN title text;
 CREATE TYPE public.company_staff_role AS ENUM('viewer');
 CREATE TABLE org_staff(user_id uuid,organization_id uuid,expires_at timestamptz,permissions text[]);
 CREATE TABLE companies(id uuid PRIMARY KEY,user_id uuid,organization_id uuid);
 CREATE TABLE company_staff(user_id uuid,company_id uuid);
 CREATE TABLE organization_usage(organization_id uuid,month_start date,students_added_count integer NOT NULL DEFAULT 0,PRIMARY KEY(organization_id,month_start));
 CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT public.has_role($2,$1) $$;
 CREATE FUNCTION public.has_org_staff_permission(uuid,uuid,text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM org_staff WHERE user_id=$1 AND organization_id=$2 AND $3=ANY(permissions)) $$;
 CREATE FUNCTION public.has_company_access(uuid,uuid,public.company_staff_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM company_staff WHERE user_id=$1 AND company_id=$2) $$;
 `);
 const payment=await migration('20261016110000_atomic_payment_settlement.sql');
 const guard=payment.slice(payment.indexOf('CREATE FUNCTION public.guard_subscription_invoice_payment_fields()'),payment.indexOf('-- PostgreSQL clamps'));
 await db.exec(guard);
 await db.exec(await migration('20261016160000_postpaid_billing.sql'));
 await db.exec(await migration('20261016161000_manual_invoice_settlement.sql'));
 await installCanonicalQuotaFunctions(db);
 await db.exec(`REVOKE ALL ON FUNCTION public.create_student_profile_with_capacity(uuid,uuid,text,text,text,text,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
  GRANT EXECUTE ON FUNCTION public.create_student_profile_with_capacity(uuid,uuid,text,text,text,text,uuid,uuid,text) TO service_role;
  CREATE TRIGGER fixture_course_limit BEFORE INSERT OR UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION enforce_course_insert_limit();`);
 await db.exec(await migration('20261016162000_postpaid_access.sql'));
 month=String(await scalar("SELECT date_trunc('month',clock_timestamp() AT TIME ZONE 'Europe/Moscow')::date::text AS value"));
 previous=String(await scalar("SELECT (date_trunc('month',clock_timestamp() AT TIME ZONE 'Europe/Moscow')-interval '1 month')::date::text AS value"));
},30000);
beforeEach(async()=>{await db.exec('BEGIN'); await actor(1);});
afterEach(async()=>{await db.exec('ROLLBACK');});
afterAll(async()=>{await db?.close();});

describe('postpaid actual migration and manual-settlement integration',()=>{
 it.each([2,3,4,5])('denies agreement configuration to unauthorized/revoked actor %i',async user=>{
  await actor(user); await denied('SELECT public.save_postpaid_agreement($1,$2,$3,$4)',[id(100),previous,'contract','Written signed confirmation']);
  await denied('SELECT public.prepare_postpaid_statement($1,$2)',[id(100),previous]);
 });
 it('does not enroll organizations or change access at migration time; agreement is explicit and first-day only',async()=>{
  expect(await scalar('SELECT count(*)::int value FROM organization_billing_agreements')).toBe(0);
  await denied('SELECT public.save_postpaid_agreement($1,$2,$3,$4)',[id(100),previous.slice(0,8)+'02','contract','Written signed confirmation']);
  const a=await agreement(); expect(a).toMatchObject({terms_version:'59-09-26-v1',annual_renewal:true,contract_through:'2026-12-31'});
  expect(await scalar('SELECT subscription_plan AS value FROM organizations WHERE id=$1',[id(100)])).toBe('free');
  await actor(2); expect(await call('has_active_postpaid_agreement',[id(100)])).toBe(true);
  await actor(4); await denied('SELECT public.has_active_postpaid_agreement($1)',[id(100)]);
 });
 it('blocks direct event/statement/agreement writes and private helpers, including service role',async()=>{
  await agreement();
  for(const role of ['authenticated','service_role']) {
   await actor(role==='authenticated'?1:null,role);
   await denied("UPDATE organization_billing_agreements SET effective_from='2026-01-01'");
   await denied("INSERT INTO postpaid_usage_events(organization_id,feature,occurred_at,source_table,source_key,month_start) VALUES($1,'crm',now(),'forged','1',current_date)",[id(100)]);
   await denied("SELECT public.postpaid_authorize_invoice_write($1,'UPDATE')",[id(900)]);
   await denied('SELECT public.postpaid_collect_snapshot($1,$2)',[id(100),previous]);
  }
 });
 it('records real lesson interaction once, validates tenant/enrollment and keeps use through resets, archive and deletion',async()=>{
  await agreement(); await actor(3);
  expect(await call('record_postpaid_lesson_activity',[id(500)])).toBe(true);
  expect(await call('record_postpaid_lesson_activity',[id(500)])).toBe(false);
  await denied('SELECT public.record_postpaid_lesson_activity($1)',[id(600)]);
  await actor(4); await denied('SELECT public.record_postpaid_lesson_activity($1)',[id(500)]);
  await actor(1); expect(await scalar('SELECT count(*)::int value FROM postpaid_usage_events')).toBe(1);
  await db.query('UPDATE profiles SET archived_at=now() WHERE user_id=$1',[id(3)]);
  await db.query('DELETE FROM courses WHERE id=$1',[id(300)]);
  const draft=await prepare(month); expect(draft.snapshot).toMatchObject({courses_count:1,learners_count:1,ledger_courses_count:1,ledger_learners_count:1});
  await db.exec('RESET ROLE'); await denied('DELETE FROM postpaid_usage_events');
 });
 it('ignores assignments, zero progress, teacher review/import, and records real progression, test starts and homework',async()=>{
  await agreement(); await actor(2);
  await db.query('INSERT INTO enrollments(user_id,course_id) VALUES($1,$2)',[id(3),id(301)]);
  await db.query('INSERT INTO lesson_progress(user_id,lesson_id,completed,completed_at) VALUES($1,$2,true,now())',[id(3),id(501)]);
  await actor(3);
  await db.query('INSERT INTO lesson_progress(user_id,lesson_id) VALUES($1,$2)',[id(3),id(500)]);
  await actor(1); expect(await scalar('SELECT count(*)::int value FROM postpaid_usage_events')).toBe(0);
  await actor(3); await db.query('UPDATE lesson_progress SET time_spent=20 WHERE user_id=$1 AND lesson_id=$2',[id(3),id(500)]);
  await db.query('INSERT INTO test_attempt_sessions(user_id,lesson_id) VALUES($1,$2)',[id(3),id(501)]);
  await db.query('INSERT INTO homework_submissions(student_id,course_id,lesson_id,organization_id,content) VALUES($1,$2,$3,$4,$5)',[id(3),id(300),id(500),id(100),'Actual answer']);
  await actor(1); expect((await prepare(month)).snapshot).toMatchObject({ledger_courses_count:2,ledger_learners_count:1});
 });
 it('requires retrospective manual counts, does not convert a draft to invoice until approved, and freezes its snapshot',async()=>{
  await agreement(); const draft=await prepare(); expect(draft.status).toBe('needs_review'); expect(draft.snapshot.completeness.status).toBe('requires_manual_review');
  expect(await scalar('SELECT count(*)::int value FROM subscription_invoices')).toBe(0);
  await denied('SELECT public.issue_postpaid_invoice($1)',[draft.id]);
  await denied('SELECT public.approve_postpaid_statement($1,$2)',[draft.id,'History manually reviewed']);
  const reviewed=await approve(draft.id,16,101); expect(reviewed).toMatchObject({status:'approved',plan:'standard',amount:6990});
  expect(reviewed.snapshot).toEqual(draft.snapshot);
  await db.exec('RESET ROLE'); await denied("UPDATE postpaid_billing_statements SET snapshot='{}' WHERE id=$1",[draft.id]);
 });
 it('refuses open-period approval and future issue without changing billing state',async()=>{
  await agreement(); const draft=await prepare(month);
  await denied('SELECT public.approve_postpaid_statement($1,$2,$3,$4)',[draft.id,'All usage was reviewed',0,0],/open/);
  expect(await scalar('SELECT count(*)::int value FROM subscription_invoices')).toBe(0);
 });
 it('revalidates changed evidence, supersedes unissued revisions and leaves old snapshot immutable',async()=>{
  await agreement(); const draft=await prepare(); await approve(draft.id);
  await call('record_postpaid_feature_confirmation',[id(100),'crm',previous+'T00:00:00+03:00',previous+'T00:00:00+03:00','Customer confirmed CRM in signed correspondence']);
  await call('record_postpaid_feature_usage',[id(100),'crm',previous.slice(0,8)+'03T12:00:00+03:00','CRM actions verified in service history']);
  await denied('SELECT public.issue_postpaid_invoice($1)',[draft.id],/changed/);
  const next=await prepare(); expect(next.revision).toBe(2); expect(next.plan).toBe('standard'); expect(next.id).not.toBe(draft.id);
  expect(await scalar('SELECT status value FROM postpaid_billing_statements WHERE id=$1',[draft.id])).toBe('superseded');
  expect(await scalar('SELECT snapshot value FROM postpaid_billing_statements WHERE id=$1',[draft.id])).toEqual(draft.snapshot);
 });
 it('requires prior notice/customer confirmation; access alone and unconfirmed use do not raise price',async()=>{
  await agreement();
  await call('record_postpaid_feature_confirmation',[id(100),'webinar',previous+'T00:00:00+03:00',previous+'T00:00:00+03:00','Prior written agreement to webinar service']);
  expect((await prepare()).plan).toBe('start');
  await call('record_postpaid_feature_usage',[id(100),'frdoplus',previous.slice(0,8)+'04T00:00:00+03:00','FRDO real use without prior confirmation']);
  let draft=await prepare(); expect(draft.plan).toBe('start'); expect(draft.snapshot.unconfirmed_feature_events).toBe(1);
  await call('record_postpaid_feature_usage',[id(100),'webinar',previous.slice(0,8)+'04T00:00:00+03:00','Actually conducted webinar record reference']);
  draft=await prepare(); expect(draft.plan).toBe('professional');
  await denied('SELECT public.record_postpaid_feature_usage($1,$2,$3,$4,$5)',[id(100),'videoserviceplus',previous+'T00:00:00Z','An upload under contract threshold',2147483648]);
 });
 it('captures actual CRM writes and live webinar, not opening menus or scheduling',async()=>{
  await agreement(); await actor(2);
  await db.query('INSERT INTO webinars(organization_id,status) VALUES($1,$2)',[id(100),'scheduled']);
  await actor(1); expect(await scalar('SELECT count(*)::int value FROM postpaid_usage_events')).toBe(0);
  await actor(2); await db.query('INSERT INTO org_crm_clients(organization_id,title) VALUES($1,$2)',[id(100),'Customer']);
  await db.query("UPDATE webinars SET status='live' WHERE organization_id=$1",[id(100)]);
  await actor(1); expect(await scalar('SELECT count(*)::int value FROM postpaid_usage_events')).toBe(2);
  expect((await prepare(month)).plan).toBe('start');
 });
 it('issues only one invoice; actual manual RPC closes debt exactly once without future access grant',async()=>{
  await agreement(); const draft=await prepare(); await approve(draft.id); const issued=await call('issue_postpaid_invoice',[draft.id]);
  expect(issued.already_issued).toBe(false);
  expect(await call('issue_postpaid_invoice',[draft.id])).toEqual({...issued,already_issued:true});
  expect(await scalar('SELECT count(*)::int value FROM subscription_invoices')).toBe(1);
  expect(await tokenCount()).toBe(0);
  const paid=await call('confirm_manual_subscription_invoice',[issued.invoice_id]); expect(paid).toMatchObject({applied:true,billing_kind:'postpaid',paid_until:null});
  expect(await call('confirm_manual_subscription_invoice',[issued.invoice_id])).toMatchObject({applied:false,outcome:'already_confirmed'});
  expect(await scalar('SELECT paid_until value FROM organizations WHERE id=$1',[id(100)])).toBeNull();
  expect(await scalar('SELECT subscription_plan value FROM organizations WHERE id=$1',[id(100)])).toBe('free');
  expect(await tokenCount()).toBe(0);
  await denied("UPDATE subscription_invoices SET status='pending',paid_at=NULL WHERE id=$1",[issued.invoice_id]);
  await denied("UPDATE subscription_invoices SET amount=1 WHERE id=$1",[issued.invoice_id]);
  await denied("UPDATE subscription_invoices SET payment_method='tbank' WHERE id=$1",[issued.invoice_id]);
  await denied('DELETE FROM subscription_invoices WHERE id=$1',[issued.invoice_id]);
 });
 it('rolls back issuance/token when insert fails and retries cleanly',async()=>{
  await agreement(); const draft=await prepare(); await approve(draft.id);
  await db.exec('RESET ROLE; ALTER TABLE subscription_invoices ADD CONSTRAINT fixture_invoice_failure CHECK(amount<4000)'); await actor(1);
  await denied('SELECT public.issue_postpaid_invoice($1)',[draft.id],/fixture_invoice_failure/);
  expect(await scalar('SELECT status value FROM postpaid_billing_statements WHERE id=$1',[draft.id])).toBe('approved');
  expect(await tokenCount()).toBe(0);
  await db.exec('RESET ROLE; ALTER TABLE subscription_invoices DROP CONSTRAINT fixture_invoice_failure'); await actor(1);
  expect((await call('issue_postpaid_invoice',[draft.id])).already_issued).toBe(false);
 });
 it('prevents legacy cron/admin/service prepaid invoices for active postpaid; leaves other tenants alone',async()=>{
  await agreement();
  for(const role of ['authenticated','service_role']) {
   await actor(role==='authenticated'?1:null,role);
   await denied("INSERT INTO subscription_invoices(organization_id,invoice_number,plan,amount) VALUES($1,'legacy','start',4490)",[id(100)],/prepaid invoice/);
  }
  await actor(1); await db.query("INSERT INTO subscription_invoices(organization_id,invoice_number,plan,amount) VALUES($1,'legacy','start',4490)",[id(200)]);
 });
 it('draft scheduler is service-only, closed months only, idempotent and never issues invoices',async()=>{
  await agreement(); await denied('SELECT public.prepare_due_postpaid_statements()'); await actor(null,'service_role');
  const first=await call('prepare_due_postpaid_statements'); expect(first).toMatchObject({prepared:1,failed:0,invoices_issued:0});
  expect(await call('prepare_due_postpaid_statements')).toMatchObject({prepared:0,failed:0,invoices_issued:0});
  expect(await scalar('SELECT count(*)::int value FROM subscription_invoices')).toBe(0);
  expect(await scalar('SELECT count(*)::int value FROM admin_notifications')).toBe(1);
  expect(await scalar('SELECT status value FROM postpaid_billing_statements')).toBe('needs_review');
 });
 it('serves only a safe issued calculation to org billing readers and learner-safe access profile',async()=>{
  await agreement(); const draft=await prepare(); await approve(draft.id); const issued=await call('issue_postpaid_invoice',[draft.id]);
  await actor(2); const detail=await call('get_postpaid_invoice_calculation',[issued.invoice_id]);
  expect(detail).toMatchObject({courses_count:0,learners_count:0,monthly_amount:4490,amount:4490}); expect(JSON.stringify(detail)).not.toContain('customer_confirmation');
  await actor(3); const access=await call('get_postpaid_access_profile',[id(100)]); expect(access).toMatchObject({active:true,organization_id:id(100),limits:{maxStudents:-1,maxStorageBytes:-1}});
  await denied('SELECT public.get_postpaid_invoice_calculation($1)',[issued.invoice_id]);
  await actor(4); await denied('SELECT public.get_postpaid_access_profile($1)',[id(100)]); await denied('SELECT public.get_postpaid_invoice_calculation($1)',[issued.invoice_id]);
 });
 it('uses exact calendar proration only for an early termination, with a full-month zero-use minimum',async()=>{
  const end=previous.slice(0,8)+'16'; await agreement(previous,end); const draft=await prepare();
  const expected=calculatePostpaid({courses:0,learners:0,accessDays:15,monthDays:draft.snapshot.month_days});
  expect(Number(draft.amount)).toBe(expected.amount); expect(draft.snapshot.access_days).toBe(15);
 });
 it('matches the pure calculator at threshold edges and feature floors',async()=>{
  await db.exec('RESET ROLE');
  for(const [courses,learners,features] of [[15,100,[]],[16,1,[]],[30,200,[]],[30,201,[]],[0,0,['crm']],[0,0,['webinar']]] as const) {
   const q=await call('postpaid_calculate',[courses,learners,Object.fromEntries(features.map(f=>[f,true])),31,31]);
   expect(q).toMatchObject({plan:calculatePostpaid({courses,learners,confirmedUsedFeatures:features,accessDays:31,monthDays:31}).plan,
    amount:calculatePostpaid({courses,learners,confirmedUsedFeatures:features,accessDays:31,monthDays:31}).amount});
  }
 });
 it('integrates actual access migration: free plan can admit student 201 and course 31 while actual use remains separate',async()=>{
  await agreement(); await db.exec('RESET ROLE');
  await db.query('INSERT INTO organization_usage(organization_id,month_start,students_added_count) VALUES($1,$2,200)',[id(100),month]);
  await actor(2);
  const capacity=(await db.query('SELECT * FROM public.get_organization_student_capacity($1,1)',[id(100)])).rows[0];
  expect(capacity).toMatchObject({max_students:-1,current_students:200,is_unlimited:true,can_add:true,subscription_plan:'free',limit_source:'postpaid'});
  await actor(null,'service_role');
  expect(await call('create_student_profile_with_capacity',[id(100),id(700),'Synthetic student','synthetic@example.invalid','synthetic',null,null,null,null])).toMatchObject({success:true,current_students:201,is_unlimited:true,limit_source:'postpaid'});
  await actor(2);
  await db.query("INSERT INTO courses(id,organization_id) SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,$1 FROM generate_series(800,831)n",[id(100)]);
  await actor(1); expect((await prepare(month)).snapshot).toMatchObject({courses_count:0,learners_count:0});
  expect(await scalar('SELECT subscription_plan value FROM organizations WHERE id=$1',[id(100)])).toBe('free');
 });
 it('ended agreement restores existing admission quotas and disables postpaid access features',async()=>{
  await agreement(previous,month); await actor(2);
  expect(await call('get_postpaid_access_profile',[id(100)])).toMatchObject({active:false,billing_mode:'prepaid',limits:null,features:{crm:false,webinar:false}});
  const capacity=(await db.query('SELECT * FROM public.get_organization_student_capacity($1,1)',[id(100)])).rows[0];
  expect(capacity).toMatchObject({max_students:10,limit_source:'plan',is_unlimited:false});
 });
 it('revoked admin cannot approve/issue; learner cannot alter invoice or read private evidence',async()=>{
  await agreement(); const draft=await prepare(); await approve(draft.id);
  for(const user of [3,4,5]) {
   await actor(user); await denied('SELECT public.issue_postpaid_invoice($1)',[draft.id]);
   await denied('SELECT public.approve_postpaid_statement($1,$2,0,0)',[draft.id,'Attempted forged approval']);
   expect(await scalar('SELECT count(*)::int value FROM postpaid_billing_statements')).toBe(0);
  }
  await actor(null,'anon'); await denied('SELECT public.record_postpaid_lesson_activity($1)',[id(500)]);
 });
 it('refuses a confirmation after real use and does not let that raise a historical tariff',async()=>{
  await agreement();
  await call('record_postpaid_feature_confirmation',[id(100),'crm',previous.slice(0,8)+'10T00:00:00+03:00',previous.slice(0,8)+'11T00:00:00+03:00','Customer confirmation occurred after earlier use']);
  await call('record_postpaid_feature_usage',[id(100),'crm',previous.slice(0,8)+'02T12:00:00+03:00','Verified actual CRM use before confirmation']);
  expect((await prepare()).plan).toBe('start');
 });
 it('excludes platform welcome instructions from live events and retrospective usage; real customer training still counts',async()=>{
  await agreement();
  await db.query("INSERT INTO courses(id,organization_id,system_key) VALUES($1,$2,'welcome')",[id(302),id(100)]);
  await db.query('INSERT INTO lessons(id,course_id) VALUES($1,$2)',[id(502),id(302)]);
  await db.query("INSERT INTO enrollments(user_id,course_id,status,completed_at) VALUES($1,$2,'completed',$3)",[id(3),id(302),previous.slice(0,8)+'05T00:00:00Z']);
  await actor(3);
  expect(await call('record_postpaid_lesson_activity',[id(502)])).toBe(false);
  await db.query('INSERT INTO lesson_progress(user_id,lesson_id,completed,completed_at,time_spent) VALUES($1,$2,true,now(),30)',[id(3),id(502)]);
  await actor(1);
  expect((await prepare()).snapshot).toMatchObject({courses_count:0,learners_count:0});
  expect((await prepare(month)).snapshot).toMatchObject({courses_count:0,learners_count:0});
  await actor(3); expect(await call('record_postpaid_lesson_activity',[id(500)])).toBe(true);
  await actor(1); expect((await prepare(month)).snapshot).toMatchObject({courses_count:1,learners_count:1});
 });
});
