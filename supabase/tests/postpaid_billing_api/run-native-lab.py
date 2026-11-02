"""Native PostgreSQL17 checked-billing tests. Requires psycopg[binary]3.2.9.

Only a fresh disposable postpaid_api_lab database and cluster are accepted.
All identifiers are synthetic. This is not Cloud, real OAuth/JWT, SMTP, or
genuine client billing acceptance. No credentials are printed or exported.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib,json,os,subprocess,sys,time
import psycopg

HERE=Path(__file__).resolve().parent
REPO=HERE.parents[2]
OUT=REPO/'outputs'/'postpaid-api-native'
OUT.mkdir(parents=True,exist_ok=True)
BASE=REPO/'supabase/migrations/20261016160000_postpaid_billing.sql'
NEW=REPO/'supabase/migrations/20261102010000_postpaid_billing_api_checked.sql'
SETUP=OUT/'setup.sql'
builder=subprocess.run([sys.executable,str(HERE/'build-native-setup.py'),str(BASE),str(SETUP)],
 capture_output=True,text=True,check=True)
(OUT/'builder-output.json').write_text(builder.stdout,encoding='utf-8')

def script(path):
    return '\n'.join(s for s in path.read_text(encoding='utf-8').splitlines() if not s.startswith('\\set '))

master=psycopg.connect('',autocommit=True,application_name='billing_api_native_coordinator')
database=master.execute('SELECT current_database()').fetchone()[0]
if not (database=='postpaid_api_lab' or database.startswith('postpaid_api_lab_')):
    raise RuntimeError('Refusing non-lab database')
version=master.info.server_version
if not 170000<=version<180000:
    raise RuntimeError('Expected isolated PostgreSQL17')
if master.execute("SELECT count(*) FROM pg_tables WHERE schemaname='public'").fetchone()[0]:
    raise RuntimeError('Refusing nonempty database')
if master.execute("SELECT count(*) FROM pg_roles WHERE rolname IN('anon','authenticated','service_role')").fetchone()[0]:
    raise RuntimeError('Refusing cluster with preexisting application roles')
master.execute(script(SETUP))
master.execute(script(NEW))
master.execute(script(HERE/'assertions.sql'))

def ok(condition,label):
    master.execute('SELECT public.api_test_ok(%s,%s)',(condition,label))

race=master.execute("SELECT org,statement,source_hash FROM public.api_test_fixture WHERE name='race'").fetchone()
org,statement,source_hash=race
master.execute("SET billing_test.actor='20000000-0000-4000-8000-000000000001'")
master.execute('SET ROLE authenticated')
approval=master.execute('SELECT public.approve_postpaid_statement_checked(%s,%s,%s,4490,%s,1,1,%s)',
 (org,statement,source_hash,'start','Synthetic race original review')).fetchone()[0]
old_review_hash=approval['statement']['review_hash']
# Show that the original ordinary administrator writer can change a review
# without changing source/amount/tier. The checked issuer must reject H1.
master.execute("SET billing_test.actor='20000000-0000-4000-8000-000000000002'")
master.execute('SELECT public.approve_postpaid_statement(%s,%s,1,1)',(statement,'Synthetic race refreshed review'))
try:
    master.execute('SELECT public.issue_postpaid_invoice_checked(%s,%s,%s,4490,%s,%s)',
      (org,statement,source_hash,'start',old_review_hash))
except psycopg.Error as exc:
    if exc.sqlstate!='40001': raise
else:
    raise AssertionError('Changed ordinary review was accepted')
fresh=master.execute('SELECT public.preview_postpaid_statement_checked(%s,%s)',(org,statement)).fetchone()[0]
review_hash=fresh['statement']['review_hash']
master.execute('RESET ROLE')
ok(review_hash!=old_review_hash,'ordinary native review change invalidates older API review capability')
ok(master.execute('SELECT count(*) FROM public.subscription_invoices WHERE organization_id=%s',(org,)).fetchone()[0]==0,
 'stale review capability created no invoice')

# A lab-only INSERT trigger creates a deterministic barrier inside the native
# writer, while it already holds the real organization transaction lock.
master.execute('''CREATE FUNCTION public.api_test_issue_gate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.organization_id='10000000-0000-4000-8000-000000000003'::uuid
 AND current_setting('billing_test.pauseissue',true)='on' THEN
  PERFORM pg_advisory_xact_lock(85002026);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER api_test_issue_gate BEFORE INSERT ON public.subscription_invoices
 FOR EACH ROW EXECUTE FUNCTION public.api_test_issue_gate();''')
master.execute('SELECT pg_advisory_lock(85002026)')

def issue_worker(label,pause):
    with psycopg.connect('',autocommit=True,application_name=label) as connection:
        connection.execute('SET ROLE authenticated')
        connection.execute("SET billing_test.actor='20000000-0000-4000-8000-000000000001'")
        if pause: connection.execute("SET billing_test.pauseissue='on'")
        return connection.execute('SELECT public.issue_postpaid_invoice_checked(%s,%s,%s,4490,%s,%s)',
          (org,statement,source_hash,'start',review_hash)).fetchone()[0]

def wait_blocked(label):
    deadline=time.monotonic()+15
    while time.monotonic()<deadline:
        row=master.execute("SELECT wait_event FROM pg_stat_activity WHERE application_name=%s AND state='active'",(label,)).fetchone()
        if row and row[0]=='advisory': return True
        time.sleep(.025)
    raise AssertionError('Writer did not reach expected barrier: '+label)

pool=ThreadPoolExecutor(max_workers=2)
try:
    first=pool.submit(issue_worker,'billing_api_native_writer_one',True)
    first_blocked=wait_blocked('billing_api_native_writer_one')
    second=pool.submit(issue_worker,'billing_api_native_writer_two',False)
    second_blocked=wait_blocked('billing_api_native_writer_two')
finally:
    # Release before joining workers, including on failed barrier assertions.
    master.execute('SELECT pg_advisory_unlock_all()')
    pool.shutdown(wait=True,cancel_futures=True)
one=first.result(timeout=15)
two=second.result(timeout=15)

ok(first_blocked and second_blocked,'two real PostgreSQL sessions overlapped at organization-lock barrier')
ok(one['already_issued'] is False and two['already_issued'] is True,
 'concurrent issue gives one new result and one replay')
ok(one['invoice_id']==two['invoice_id'] and one['invoice_number']==two['invoice_number'],
 'concurrent callers share exact original invoice identity')
ok(master.execute('SELECT count(*) FROM public.subscription_invoices WHERE organization_id=%s',(org,)).fetchone()[0]==1,
 'concurrent issue inserted exactly one financial obligation')
ok(one['payment_status']=='pending' and two['payment_status']=='pending' and one['paid_at'] is None,
 'concurrent issue does not record payment')

# Frozen issued preview and replay must not need a currently accessible source
# period. This controlled historical-agreement drift is rolled back in the lab.
master.execute('BEGIN')
master.execute("UPDATE public.organization_billing_agreements SET effective_from='2021-01-01' WHERE organization_id=%s",(org,))
master.execute('SET LOCAL ROLE authenticated')
master.execute("SET LOCAL billing_test.actor='20000000-0000-4000-8000-000000000001'")
history_preview=master.execute('SELECT public.preview_postpaid_statement_checked(%s,%s)',(org,statement)).fetchone()[0]
history_replay=master.execute('SELECT public.issue_postpaid_invoice_checked(%s,%s,%s,4490,%s,%s)',
 (org,statement,source_hash,'start',review_hash)).fetchone()[0]
master.execute('ROLLBACK')
ok(history_preview['already_issued'] is True and history_preview['current'] is None and history_preview['fresh'] is None,
 'issued preview survives later historical agreement drift without source recollection')
ok(history_replay['already_issued'] is True and history_replay['invoice_id']==one['invoice_id'],
 'issued replay survives historical agreement drift and preserves frozen invoice')

# A request waiting for the ordinary organization lock must not retain an
# administrator's earlier authority after account revocation commits.
def revoked_after_wait(label,scope,command,args,expected_invoices=0):
    waiting_org,waiting_statement,_=scope
    before=master.execute('SELECT md5(to_jsonb(s)::text) FROM public.postpaid_billing_statements s WHERE id=%s',
      (waiting_statement,)).fetchone()[0]
    invoices_before=master.execute('SELECT count(*) FROM public.subscription_invoices WHERE organization_id=%s',
      (waiting_org,)).fetchone()[0]
    master.execute("SELECT pg_advisory_lock(hashtextextended('postpaid:'||%s::text,0))",(str(waiting_org),))

    def waiting_worker():
        with psycopg.connect('',autocommit=True,application_name=label) as connection:
            connection.execute("SET statement_timeout='20s'")
            connection.execute('SET ROLE authenticated')
            connection.execute("SET billing_test.actor='20000000-0000-4000-8000-000000000002'")
            try:
                connection.execute(command,args).fetchone()
            except psycopg.Error as exc:
                return exc.sqlstate
            return 'UNEXPECTED_SUCCESS'

    executor=ThreadPoolExecutor(max_workers=1)
    observed_wait=False
    try:
        request=executor.submit(waiting_worker)
        observed_wait=wait_blocked(label)
        master.execute("INSERT INTO public.account_deletion_revocations VALUES('20000000-0000-4000-8000-000000000002')")
    finally:
        # Release before joining so failed observations cannot leave blocked
        # worker sessions hung behind this coordinator's advisory lock.
        master.execute('SELECT pg_advisory_unlock_all()')
        executor.shutdown(wait=True,cancel_futures=True)
    state=request.result(timeout=15)
    after=master.execute('SELECT md5(to_jsonb(s)::text) FROM public.postpaid_billing_statements s WHERE id=%s',
      (waiting_statement,)).fetchone()[0]
    invoices_after=master.execute('SELECT count(*) FROM public.subscription_invoices WHERE organization_id=%s',
      (waiting_org,)).fetchone()[0]
    master.execute("DELETE FROM public.account_deletion_revocations WHERE user_id='20000000-0000-4000-8000-000000000002'")
    ok(observed_wait and state=='42501',label+' revoked while actually waiting is denied after lock')
    ok(before==after,label+' revoked request preserves exact statement review')
    ok(invoices_before==invoices_after==expected_invoices,label+' revoked request creates no additional invoice')

approve_scope=master.execute("SELECT org,statement,source_hash FROM public.api_test_fixture WHERE name='other'").fetchone()
revoked_after_wait('billing_api_native_revoke_approve',approve_scope,
 'SELECT public.approve_postpaid_statement_checked(%s,%s,%s,4490,%s,2,5,%s)',
 (*approve_scope,'start','Synthetic review must not be saved'))
issue_scope=master.execute("SELECT org,statement,source_hash FROM public.api_test_fixture WHERE name='revocation-issue'").fetchone()
master.execute("SET billing_test.actor='20000000-0000-4000-8000-000000000001'")
master.execute('SET ROLE authenticated')
issue_approval=master.execute('SELECT public.approve_postpaid_statement_checked(%s,%s,%s,4490,%s,1,1,%s)',
 (*issue_scope,'start','Synthetic approved review before revocation')).fetchone()[0]
master.execute('RESET ROLE')
revoked_after_wait('billing_api_native_revoke_issue',issue_scope,
 'SELECT public.issue_postpaid_invoice_checked(%s,%s,%s,4490,%s,%s)',
 (*issue_scope,'start',issue_approval['statement']['review_hash']))

# These two replay cases are the regression anchors for the post-lock checks:
# the old replay paths return without calling the original guarded writer.
revoked_after_wait('billing_api_native_revoke_approval_replay',issue_scope,
 'SELECT public.approve_postpaid_statement_checked(%s,%s,%s,4490,%s,1,1,%s)',
 (*issue_scope,'start','Synthetic approved review before revocation'))
revoked_after_wait('billing_api_native_revoke_invoice_replay',race,
 'SELECT public.issue_postpaid_invoice_checked(%s,%s,%s,4490,%s,%s)',
 (*race,'start',review_hash),expected_invoices=1)

for table in ('organizations','organization_billing_agreements'):
    label='organizations' if table=='organizations' else 'agreements'
    current=master.execute('SELECT md5(jsonb_agg(to_jsonb(t) ORDER BY id)::text) FROM public.'+table+' t').fetchone()[0]
    expected=master.execute('SELECT value FROM public.api_test_preservation WHERE name=%s',(label,)).fetchone()[0]
    ok(current==expected,'final '+label+' exact after all concurrency and historical cases')
results=master.execute('SELECT name,passed FROM public.api_test_results ORDER BY name').fetchall()
report={'status':'PASS','serverVersion':master.info.server_version,'tests':len(results),'failed':sum(not r[1] for r in results),
 'assertions':[{'name':r[0],'passed':r[1]} for r in results],
 'barrier':{'firstReachedNativeWriter':first_blocked,'secondWaitedOnOrganizationLock':second_blocked,
            'oneInserted':True,'oneReplayed':True,'sameInvoice':True},
 'qualification':'Isolated native PostgreSQL17, synthetic authentication/schema model, actual original native collector and writers; not Cloud/JWT/SMTP.'}
sources=[BASE,NEW,HERE/'build-native-setup.py',HERE/'assertions.sql',Path(__file__).resolve()]
report['sourceHashes']={str(p.relative_to(REPO)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in sources}
(OUT/'native-results.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
master.close()
print(json.dumps({'status':report['status'],'tests':report['tests'],'failed':report['failed'],'barrier':report['barrier']}))
