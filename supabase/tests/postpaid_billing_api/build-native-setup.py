"""Build a synthetic native-PG fixture around the unchanged product SQL.

Run only in a new disposable database as its owner. Auth is a synthetic model,
not Cloud/JWT acceptance. Native collector, calculator, review/issue writers and
financial guards come verbatim from the repository's installed base migration.
"""
from pathlib import Path
import re,sys,json,hashlib
base=Path(sys.argv[1])
out=Path(sys.argv[2])
source=base.read_text(encoding='utf-8')
names=['postpaid_is_admin','postpaid_require_admin','postpaid_collect_snapshot','postpaid_calculate',
       'approve_postpaid_statement','postpaid_authorize_invoice_write','guard_postpaid_invoice',
       'issue_postpaid_invoice','postpaid_statement_immutable_snapshot']
parts=[]
for name in names:
    pat=rf'CREATE FUNCTION public\.{name}\([\s\S]*?AS \$fn\$[\s\S]*?\$fn\$;'
    match=re.search(pat,source)
    if not match: raise RuntimeError('Missing original native function '+name)
    parts.append(match.group(0))
ddl=r'''
\set ON_ERROR_STOP on
SET TIME ZONE 'UTC';
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
CREATE TYPE public.app_role AS ENUM('admin','organization','student');
CREATE TABLE public.api_test_roles(user_id uuid,role public.app_role);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('billing_test.actor',true),'')::uuid;
$$;
CREATE FUNCTION public.has_role(wanted public.app_role,actor uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
 SELECT EXISTS(SELECT 1 FROM public.api_test_roles WHERE user_id=actor AND role=wanted);
$$;
CREATE TABLE public.account_deletion_revocations(user_id uuid PRIMARY KEY);
CREATE TABLE public.organizations(id uuid PRIMARY KEY,name text,paid_until timestamptz,is_paid boolean,
 subscription_plan text,branding jsonb,enabled_features jsonb);
CREATE TABLE public.organization_billing_agreements(
 id uuid PRIMARY KEY,organization_id uuid UNIQUE REFERENCES public.organizations(id),
 billing_mode text,effective_from date,effective_to date,contract_reference text,customer_confirmation text,
 terms_version text,contract_through date,annual_renewal boolean,billing_timezone text,
 recording_started_at timestamptz,created_by uuid,created_at timestamptz,updated_at timestamptz);
CREATE TABLE public.courses(id uuid PRIMARY KEY,organization_id uuid,system_key text);
CREATE TABLE public.lessons(id uuid PRIMARY KEY,course_id uuid);
CREATE TABLE public.enrollments(id uuid PRIMARY KEY,course_id uuid,user_id uuid,status text,completed_at timestamptz);
CREATE TABLE public.test_attempt_sessions(id uuid PRIMARY KEY,lesson_id uuid,user_id uuid,started_at timestamptz);
CREATE TABLE public.test_attempts(id uuid PRIMARY KEY,lesson_id uuid,user_id uuid,completed_at timestamptz);
CREATE TABLE public.homework_submissions(id uuid PRIMARY KEY,course_id uuid,student_id uuid,submitted_at timestamptz);
CREATE TABLE public.lesson_progress(id uuid PRIMARY KEY,lesson_id uuid,user_id uuid,completed boolean,completed_at timestamptz);
CREATE TABLE public.postpaid_usage_events(id uuid PRIMARY KEY,organization_id uuid,feature text,
 learner_id uuid,course_id uuid,occurred_at timestamptz,source_table text,source_key text,bytes bigint);
CREATE TABLE public.postpaid_feature_confirmations(id uuid PRIMARY KEY,organization_id uuid,feature text,
 notified_at timestamptz,confirmed_at timestamptz,effective_to timestamptz);
CREATE TABLE public.postpaid_billing_statements(
 id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id),
 agreement_id uuid NOT NULL REFERENCES public.organization_billing_agreements(id),
 period_start date NOT NULL,period_end date NOT NULL,revision integer NOT NULL,status text NOT NULL,
 snapshot jsonb NOT NULL,source_hash text NOT NULL,plan text NOT NULL,amount numeric(12,2) NOT NULL,
 reviewed_courses integer,reviewed_learners integer,review_note text,reviewed_by uuid,reviewed_at timestamptz,
 invoice_id uuid UNIQUE,created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,period_start,revision));
CREATE UNIQUE INDEX postpaid_statement_one_current ON public.postpaid_billing_statements(organization_id,period_start)
 WHERE status<>'superseded';
CREATE TABLE public.subscription_invoices(id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES public.organizations(id),
 invoice_number text,invoice_date date,plan text,amount numeric(12,2),period_months integer,status text,
 created_at timestamptz DEFAULT clock_timestamp(),buyer_name text,buyer_inn text,buyer_kpp text,
 payment_id text,payment_method text,paid_at timestamptz,tbank_order_id text,tbank_terminal_key text,
 billing_kind text NOT NULL DEFAULT 'prepaid',service_period_start date,service_period_end date,
 postpaid_statement_id uuid UNIQUE REFERENCES public.postpaid_billing_statements(id));
ALTER TABLE public.postpaid_billing_statements ADD CONSTRAINT postpaid_statement_invoice_fk
 FOREIGN KEY(invoice_id) REFERENCES public.subscription_invoices(id) DEFERRABLE INITIALLY IMMEDIATE;
CREATE TABLE public.postpaid_invoice_write_tokens(transaction_id bigint,invoice_id uuid,operation text,
 PRIMARY KEY(transaction_id,invoice_id,operation));
CREATE TABLE public.api_test_results(name text PRIMARY KEY,passed boolean NOT NULL);
CREATE TABLE public.api_test_receipts(name text PRIMARY KEY,value jsonb);
CREATE TABLE public.api_test_fixture(name text PRIMARY KEY,org uuid,statement uuid,source_hash text);
CREATE TABLE public.api_test_preservation(name text PRIMARY KEY,value text);
CREATE FUNCTION public.api_test_ok(value boolean,name text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',name; END IF;
 INSERT INTO public.api_test_results VALUES(name,true);
END $$;
CREATE FUNCTION public.api_test_error(command text,wanted_state text,name text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE got text;
BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS got=RETURNED_SQLSTATE; END;
 PERFORM public.api_test_ok(got IS NOT DISTINCT FROM wanted_state,name);
END $$;
'''
permissions=r'''
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.postpaid_require_admin(),public.postpaid_collect_snapshot(uuid,date),
 public.postpaid_calculate(integer,integer,jsonb,integer,integer),
 public.postpaid_authorize_invoice_write(uuid,text),public.guard_postpaid_invoice(),
 public.postpaid_statement_immutable_snapshot() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.approve_postpaid_statement(uuid,text,integer,integer),
 public.issue_postpaid_invoice(uuid),public.postpaid_is_admin() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.approve_postpaid_statement(uuid,text,integer,integer),
 public.issue_postpaid_invoice(uuid),public.postpaid_is_admin() TO authenticated;
GRANT SELECT ON public.api_test_fixture,public.api_test_preservation,public.postpaid_billing_statements,
 public.subscription_invoices,public.organizations TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.api_test_receipts TO authenticated;
GRANT SELECT,INSERT ON public.api_test_results TO authenticated,anon,service_role;
ALTER TABLE public.postpaid_billing_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY test_admin_statement_read ON public.postpaid_billing_statements FOR SELECT TO authenticated
 USING(public.postpaid_is_admin());
CREATE POLICY test_admin_invoice_read ON public.subscription_invoices FOR SELECT TO authenticated
 USING(public.postpaid_is_admin());
CREATE TRIGGER guard_postpaid_invoice BEFORE INSERT OR UPDATE OR DELETE ON public.subscription_invoices
 FOR EACH ROW EXECUTE FUNCTION public.guard_postpaid_invoice();
CREATE TRIGGER postpaid_statement_snapshot_guard BEFORE UPDATE OR DELETE ON public.postpaid_billing_statements
 FOR EACH ROW EXECUTE FUNCTION public.postpaid_statement_immutable_snapshot();
INSERT INTO public.api_test_roles VALUES
 ('20000000-0000-4000-8000-000000000001','admin'),
 ('20000000-0000-4000-8000-000000000002','admin'),
 ('20000000-0000-4000-8000-000000000003','organization'),
 ('20000000-0000-4000-8000-000000000004','admin'),
 ('20000000-0000-4000-8000-000000000005','student');
INSERT INTO public.account_deletion_revocations VALUES('20000000-0000-4000-8000-000000000004');
INSERT INTO public.organizations
 SELECT ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Synthetic billing organization'||i,
 '2019-01-01T00:00:00Z',true,'maximum','{"brand":"preserve"}','{"postpaidAccess":true}' FROM generate_series(1,4)i;
INSERT INTO public.organization_billing_agreements
 SELECT ('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'postpaid','2020-01-01',NULL,
 'Synthetic contract','PRIVATE CUSTOMER CONFIRMATION NOT API','59-09-26-v1','2099-12-31',true,
 'Europe/Moscow','2020-01-16T15:40:12Z','20000000-0000-4000-8000-000000000001','2020-01-16T00:00:00Z','2020-01-16T00:00:00Z'
 FROM generate_series(1,4)i;
INSERT INTO public.courses SELECT md5('course-a'||i)::uuid,'10000000-0000-4000-8000-000000000001',NULL FROM generate_series(1,22)i;
INSERT INTO public.courses SELECT md5('course-b'||i)::uuid,'10000000-0000-4000-8000-000000000002',NULL FROM generate_series(1,2)i;
INSERT INTO public.courses VALUES(md5('course-race')::uuid,'10000000-0000-4000-8000-000000000003',NULL),
 (md5('course-revoke')::uuid,'10000000-0000-4000-8000-000000000004',NULL);
INSERT INTO public.postpaid_usage_events
 SELECT md5('event-a'||i)::uuid,'10000000-0000-4000-8000-000000000001','study',
 md5('learner-a'||i)::uuid,md5('course-a'||(1+(i-1)%22))::uuid,'2020-01-20T00:00:00Z','lab',i::text,NULL
 FROM generate_series(1,119)i;
INSERT INTO public.postpaid_usage_events
 SELECT md5('event-b'||i)::uuid,'10000000-0000-4000-8000-000000000002','study',
 md5('learner-b'||i)::uuid,md5('course-b'||(1+(i-1)%2))::uuid,'2020-01-20T00:00:00Z','lab',i::text,NULL
 FROM generate_series(1,5)i;
INSERT INTO public.postpaid_usage_events VALUES(md5('event-race')::uuid,'10000000-0000-4000-8000-000000000003',
 'study',md5('learner-race')::uuid,md5('course-race')::uuid,'2020-01-20T00:00:00Z','lab','race',NULL);
INSERT INTO public.postpaid_usage_events VALUES(md5('event-revoke')::uuid,'10000000-0000-4000-8000-000000000004',
 'study',md5('learner-revoke')::uuid,md5('course-revoke')::uuid,'2020-01-20T00:00:00Z','lab','revoke',NULL);
-- Same learner/course in historical tables tests union deduplication and the
-- collector's late-recorder branch. No historical scores/answers are required.
INSERT INTO public.enrollments VALUES(md5('enrollment-a1')::uuid,md5('course-a1')::uuid,
 md5('learner-a1')::uuid,'completed','2020-01-10T00:00:00Z');
DO $$ DECLARE j integer; org uuid; stmt uuid; period date; s jsonb; q jsonb;
BEGIN
 FOR j IN 1..5 LOOP
  org:=('10000000-0000-4000-8000-'||lpad((CASE WHEN j=5 THEN 4 ELSE least(j,3) END)::text,12,'0'))::uuid;
  stmt:=('40000000-0000-4000-8000-'||lpad(j::text,12,'0'))::uuid;
  period:=CASE WHEN j=4 THEN date_trunc('month',clock_timestamp() AT TIME ZONE 'Europe/Moscow')::date ELSE '2020-01-01'::date END;
  s:=public.postpaid_collect_snapshot(org,period);
  q:=public.postpaid_calculate((s->>'courses_count')::integer,(s->>'learners_count')::integer,
    s->'features',(s->>'access_days')::integer,(s->>'month_days')::integer);
  INSERT INTO public.postpaid_billing_statements(id,organization_id,agreement_id,period_start,period_end,
    revision,status,snapshot,source_hash,plan,amount,created_by)
  SELECT stmt,org,id,period,(period+interval '1 month')::date,1,'needs_review',s,md5(s::text),
    q->>'plan',(q->>'amount')::numeric,'20000000-0000-4000-8000-000000000001'
  FROM public.organization_billing_agreements WHERE organization_id=org;
  INSERT INTO public.api_test_fixture VALUES(CASE j WHEN 1 THEN 'main' WHEN 2 THEN 'other' WHEN 3 THEN 'race' WHEN 4 THEN 'open' ELSE 'revocation-issue' END,org,stmt,md5(s::text));
 END LOOP;
END $$;
INSERT INTO public.api_test_preservation VALUES('organizations',(SELECT md5(jsonb_agg(to_jsonb(o) ORDER BY id)::text) FROM public.organizations o)),
 ('agreements',(SELECT md5(jsonb_agg(to_jsonb(a) ORDER BY id)::text) FROM public.organization_billing_agreements a));
INSERT INTO public.api_test_preservation
 SELECT 'function:'||p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)||p.proacl::text)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN(
 'postpaid_is_admin','postpaid_require_admin','postpaid_collect_snapshot','postpaid_calculate',
 'approve_postpaid_statement','postpaid_authorize_invoice_write','guard_postpaid_invoice',
 'issue_postpaid_invoice','postpaid_statement_immutable_snapshot');
'''
out.write_text(ddl+'\n\n'.join(parts)+permissions,encoding='utf-8')
manifest={'base':str(base),'base_sha256':hashlib.sha256(base.read_bytes()).hexdigest(),
          'nativeFunctionsExtracted':names,'count':len(names),'setup':str(out),'setup_sha256':hashlib.sha256(out.read_bytes()).hexdigest(),
          'qualification':'Synthetic auth/schema model; actual native collector/calculator/writers/guards extracted verbatim; not Cloud/JWT acceptance.'}
out.with_suffix('.manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps(manifest,indent=2))
