"""Personal RTN subscriptions: isolated PG17 fixture only, never shared DB.
--prepare-only emits the same SQL for the labelled in-memory PGlite adapter.
The released privacy build_setup is reused without running its passing tests.
"""
import ast
import concurrent.futures
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
HERE = ROOT / 'supabase/tests/rtn-personal-notifications'
OUT = ROOT / 'outputs/rtn-personal-sql'
DB_NAME = 'rtn_personal_lab_ci'


def prepared():
    source = (ROOT / 'supabase/tests/rtn-account-erasure/run.py').read_text(encoding='utf-8')
    function = next(node for node in ast.parse(source).body if isinstance(node, ast.FunctionDef) and node.name == 'build_setup')
    ns = {'ROOT': ROOT, 'HERE': ROOT / 'supabase/tests/rtn-account-erasure', 're': re}
    exec(ast.get_source_segment(source, function), ns)
    def migration(name):
        return 'BEGIN;\n' + (ROOT / 'supabase/migrations' / name).read_text(encoding='utf-8') + '\nCOMMIT;\n'
    candidate = migration('20261120140000_rtn_personal_notifications.sql')
    return [
        ('setup.sql', ns['build_setup']().replace('DATABASE rtn_erasure_lab_ci', 'DATABASE ' + DB_NAME)),
        ('privacy.sql', migration('20261114123000_rtn_account_erasure.sql')),
        ('normative.sql', migration('20261114124000_rtn_normative_review_admission.sql')),
        ('global.sql', migration('20261120130000_rtn_global_updates.sql')),
        ('auth-fixture.sql', "CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users(id) SELECT user_id FROM public.profiles ON CONFLICT(id) DO NOTHING;"),
        ('guard-drift-setup.sql', 'ALTER FUNCTION rtn_private.personal_counts(uuid) SET search_path=public;'),
        ('guard-drift-reject.sql', candidate),
        ('guard-drift-restore.sql', "SELECT lab.check('personal drift refusal is atomic',to_regclass('rtn_private.personal_subscriptions') IS NULL AND to_regclass('rtn_private.personal_deliveries') IS NULL AND to_regprocedure('public.get_my_rtn_subscription(uuid)') IS NULL); ALTER FUNCTION rtn_private.personal_counts(uuid) SET search_path=pg_catalog,public;"),
        ('before-candidate.sql', "DO $fixture$ BEGIN PERFORM lab.keep('personal_old_authority',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p)); PERFORM lab.keep('personal_old_data',(SELECT jsonb_build_array((SELECT jsonb_agg(c) FROM public.courses c),(SELECT jsonb_agg(t) FROM public.test_attempts t),(SELECT jsonb_agg(i) FROM public.subscription_invoices i)))); END; $fixture$;"),
        ('candidate.sql', candidate),
        ('acceptance.sql', (HERE / 'acceptance.sql').read_text(encoding='utf-8')),
        ('scope-acceptance.sql', (HERE / 'scope-acceptance.sql').read_text(encoding='utf-8')),
        ('preauthorization-delta.sql', (HERE / 'preauthorization-delta.sql').read_text(encoding='utf-8')),
    ]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sql_files = prepared()
    if sys.argv[1:] == ['--prepare-only']:
        for name, sql in sql_files:
            (OUT / name).write_text(sql, encoding='utf-8')
        print(json.dumps({'status':'prepared_synthetic_sql_only','files':[name for name, _ in sql_files]}))
        return
    if sys.argv[1:]:
        raise SystemExit('REFUSE: unknown options')
    if os.environ.get('PGDATABASE') != DB_NAME or os.environ.get('PGHOST') not in ('127.0.0.1','::1','localhost'):
        raise SystemExit('REFUSE: dedicated loopback rtn_personal_lab_ci required')
    psql = os.environ.get('PSQL','psql')
    def run(sql):
        return subprocess.run([psql,'-X','-A','-t','-v','ON_ERROR_STOP=1'],input=sql,text=True,encoding='utf-8',capture_output=True)
    probe = run("SELECT current_database(),current_setting('server_version_num')::int,NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='rtn_private');")
    if probe.returncode or not probe.stdout.strip().startswith(DB_NAME + '|17') or not probe.stdout.strip().endswith('|t'):
        raise SystemExit('REFUSE: fresh dedicated PG17 personal lab required; no DROP/kill/reset attempted')
    for stream in ('stdout','stderr'):
        (OUT / ('native.'+stream+'.txt')).write_text('',encoding='utf-8')
    for name, sql in sql_files:
        # Each psql invocation is a NEW session; fixture SET ROLE cannot leak
        # into the next connection. Product migrations retain strict owner checks.
        result=run(sql if name=='setup.sql' else 'SET ROLE postgres;\n'+sql)
        for stream in ('stdout','stderr'):
            with (OUT / ('native.'+stream+'.txt')).open('a',encoding='utf-8') as log:
                log.write('FILE '+name+'\n'+getattr(result,stream))
        if name=='guard-drift-reject.sql':
            if not result.returncode or 'RTN_PERSONAL_AUTHORITY_PREIMAGE_CHANGED:rtn_private.personal_counts(uuid)' not in result.stderr:
                raise SystemExit('FAIL: guard drift must reject atomically: '+result.stderr[-6000:])
        elif result.returncode:
            raise SystemExit(name+': '+result.stderr[-6000:])
    concurrency_checks(psql,run)
    result=run('SELECT name FROM lab.results ORDER BY name;')
    if result.returncode:
        raise SystemExit(result.stderr)
    cases=result.stdout.strip().splitlines()
    receipt={'status':'passed','engine':'native PostgreSQL17','passed':len(cases),'cases':cases,
             'scope':'fresh loopback synthetic personal SQL and real two-session races; no production acceptance'}
    (OUT / 'native-result.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
    print(json.dumps({k:receipt[k] for k in ('status','engine','passed')}))


def concurrency_checks(psql,run):
    """Real PG connections only. Never stop a server, kill backend or reset DB."""
    actor='81000000-0000-4000-8000-000000000001'
    org='11111111-1111-4111-8111-111111111111'
    auth="SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false);SELECT set_config('request.jwt.claim.sub','"+actor+"',false);"
    # Keep the victim org locked until the foreign call has already failed.
    # A lock_timeout would expose the old pre-check ordering as 55P03, not 42501.
    victim='22222222-2222-4222-8222-222222222222'
    blocker=subprocess.Popen([psql,'-X','-A','-t','-q','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8')
    try:
        blocker.stdin.write("SET ROLE postgres;BEGIN;SET LOCAL statement_timeout='15s';SELECT pg_advisory_xact_lock(hashtextextended('"+victim+"',42));SELECT 'PERSONAL_FOREIGN_ORG_LOCK_READY';\n");blocker.stdin.flush()
        def foreign_marker():
            for line in blocker.stdout:
                if line.strip()=='PERSONAL_FOREIGN_ORG_LOCK_READY':return True
            return False
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            ready=pool.submit(foreign_marker).result(timeout=10)
        if not ready:raise AssertionError('foreign victim org lock setup')
        result=run("\\set VERBOSITY verbose\nSET statement_timeout='2s';SET lock_timeout='250ms';"+auth+"SELECT public.get_my_rtn_notifications('"+victim+"');")
        if not result.returncode or '42501' not in result.stderr or 'rtn_organization_permission_required' not in result.stderr:
            raise AssertionError('foreign caller must fail authorization before victim lock: '+result.stderr)
        # Only now release the unrelated organization's advisory lock.
        blocker.stdin.write('COMMIT;\n\\q\n');blocker.stdin.flush()
        _,err=blocker.communicate(timeout=10)
        if blocker.returncode:raise AssertionError(err)
        check=run("SELECT lab.check('personal foreign caller does not wait on victim organization lock',true);")
        if check.returncode:raise AssertionError(check.stderr)
    finally:
        if blocker.poll() is None:
            blocker.stdin.close();blocker.wait(timeout=15)
    def blocked(name, lock_sql, commit_sql, operation_sql, expected_error=None):
        blocker=subprocess.Popen([psql,'-X','-A','-t','-q','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8')
        pool=concurrent.futures.ThreadPoolExecutor(max_workers=2)
        try:
            blocker.stdin.write("SET ROLE postgres;BEGIN;SET LOCAL statement_timeout='15s';"+lock_sql+"SELECT 'PERSONAL_LOCK_READY';\n");blocker.stdin.flush()
            def marker():
                for line in blocker.stdout:
                    if line.strip()=='PERSONAL_LOCK_READY':return True
                return False
            if not pool.submit(marker).result(timeout=10):raise AssertionError(name+': blocker did not lock')
            operation=pool.submit(run,"SET statement_timeout='15s';SET application_name='rtn_personal_synthetic_race';"+operation_sql)
            deadline=time.monotonic()+8;waited=False
            while time.monotonic()<deadline:
                probe=run("SELECT count(*) FROM pg_stat_activity WHERE application_name='rtn_personal_synthetic_race' AND wait_event_type='Lock';")
                if not probe.returncode and probe.stdout.strip()=='1':waited=True;break
                if operation.done():break
                time.sleep(.02)
            blocker.stdin.write(commit_sql+'COMMIT;\n\\q\n');blocker.stdin.flush()
            _,err=blocker.communicate(timeout=10);result=operation.result(timeout=12)
            if not waited or blocker.returncode:raise AssertionError(name+': no real lock wait: '+err+result.stderr)
            if expected_error:
                if not result.returncode or expected_error not in result.stderr:raise AssertionError(name+': rejection missing: '+result.stderr)
            elif result.returncode:raise AssertionError(name+': '+result.stderr)
            check=run("SELECT lab.check('"+name+"',true);")
            if check.returncode:raise AssertionError(check.stderr)
        finally:
            # Close only the spawned client, never any server/backend process.
            if blocker.poll() is None:
                blocker.stdin.close()
                blocker.wait(timeout=15)
            pool.shutdown(wait=True,cancel_futures=True)
    # Fixtures already leave ownerA subscribed, with no pending older event.
    generation=run("SELECT generation FROM rtn_private.personal_subscriptions WHERE organization_id='"+org+"' AND user_id='"+actor+"';")
    gen=int(generation.stdout.strip())
    blocked('personal unsubscribe orders before waiting pull',
        "SELECT pg_advisory_xact_lock(hashtextextended('"+actor+"',42007));",
        auth+"SELECT public.save_my_rtn_subscription('"+org+"',false,'{}','{}',"+str(gen)+");",
        auth+"SELECT public.get_my_rtn_notifications('"+org+"');")
    check=run("SELECT lab.check('personal successful unsubscribe leaves future events undelivered',NOT(SELECT enabled FROM rtn_private.personal_subscriptions WHERE organization_id='"+org+"' AND user_id='"+actor+"') AND NOT EXISTS(SELECT 1 FROM rtn_private.personal_deliveries d JOIN rtn_private.update_events e ON e.id=d.event_id WHERE d.recipient_user_id='"+actor+"' AND e.event_key IN('https://www.gosnadzor.ru/news/9/200/','https://www.gosnadzor.ru/news/9/500/')));")
    if check.returncode:raise AssertionError(check.stderr)
    # Re-enable, then race the existing real revocation fence against preference save.
    reset=run(auth+"SELECT public.save_my_rtn_subscription('"+org+"',true,ARRAY['general'],ARRAY['news'],"+str(gen+1)+");")
    if reset.returncode:raise AssertionError(reset.stderr)
    blocked('personal waiting writer rejects committed revocation',
        "SELECT pg_advisory_xact_lock(hashtextextended('"+actor+"',42007));",
        "INSERT INTO public.account_deletion_revocations VALUES('"+actor+"');",
        auth+"SELECT public.save_my_rtn_subscription('"+org+"',false,'{}','{}',"+str(gen+2)+");",
        'rtn_active_actor_required')
    restored=run("DELETE FROM public.account_deletion_revocations WHERE user_id='"+actor+"';")
    if restored.returncode:raise AssertionError(restored.stderr)
    blocked('personal concurrent CAS rejects stale preference generation',
        "SELECT pg_advisory_xact_lock(hashtextextended('"+actor+"',42007));",
        auth+"SELECT public.save_my_rtn_subscription('"+org+"',false,'{}','{}',"+str(gen+2)+");",
        auth+"SELECT public.save_my_rtn_subscription('"+org+"',false,'{}','{}',"+str(gen+2)+");",
        'rtn_personal_subscription_conflict')
    enabled=run(auth+"SELECT public.save_my_rtn_subscription('"+org+"',true,ARRAY['general'],ARRAY['news'],"+str(gen+3)+");")
    if enabled.returncode:raise AssertionError(enabled.stderr)
    event=run("SELECT lab.personal_news(8000);")
    if event.returncode:raise AssertionError(event.stderr)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        responses=list(pool.map(run,[auth+"SELECT public.get_my_rtn_notifications('"+org+"');"]*2))
    if any(response.returncode for response in responses):raise AssertionError('concurrent personal pull failed')
    inserted=sum(json.loads(response.stdout.strip().splitlines()[-1])['materialized_count'] for response in responses)
    check=run("SELECT lab.check('personal concurrent own pulls insert one event recipient',"+('true' if inserted==1 else 'false')+" AND(SELECT count(*)=1 FROM rtn_private.personal_deliveries d JOIN rtn_private.update_events e ON e.id=d.event_id WHERE d.recipient_user_id='"+actor+"' AND e.event_key='https://www.gosnadzor.ru/news/9/8000/'));")
    if check.returncode:raise AssertionError(check.stderr)
    # A sequence is allocated in an uncommitted transaction; a later event commits
    # first. Own-pull must find the smaller sequence after its commit, without HWM.
    blocker=subprocess.Popen([psql,'-X','-A','-t','-q','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8')
    try:
        blocker.stdin.write("SET ROLE postgres;BEGIN;SET LOCAL statement_timeout='15s';SELECT lab.personal_news(8001);SELECT 'PERSONAL_LATE_READY';\n");blocker.stdin.flush()
        def late_marker():
            for line in blocker.stdout:
                if line.strip()=='PERSONAL_LATE_READY':return True
            return False
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            ready=pool.submit(late_marker).result(timeout=10)
        if not ready:raise AssertionError('late commit setup')
        first=run("SELECT lab.personal_news(8002);"+auth+"SELECT public.get_my_rtn_notifications('"+org+"');")
        if first.returncode:raise AssertionError(first.stderr)
        blocker.stdin.write('COMMIT;\n\\q\n');blocker.stdin.flush()
        _,err=blocker.communicate(timeout=10)
        if blocker.returncode:raise AssertionError(err)
        final=run(auth+"SELECT public.get_my_rtn_notifications('"+org+"');SET ROLE postgres;SELECT lab.check('personal late lower sequence is not lost',(SELECT count(*)=2 FROM rtn_private.personal_deliveries d JOIN rtn_private.update_events e ON e.id=d.event_id WHERE d.recipient_user_id='"+actor+"' AND e.event_key IN('https://www.gosnadzor.ru/news/9/8001/','https://www.gosnadzor.ru/news/9/8002/')));")
        if final.returncode:raise AssertionError(final.stderr)
    finally:
        if blocker.poll() is None:
            blocker.stdin.close();blocker.wait(timeout=15)
    # New synthetic nonowner, erased through the real captured confirmed flow.
    erased='81000000-0000-4000-8000-000000001403'
    erased_auth="SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false);SELECT set_config('request.jwt.claim.sub','"+erased+"',false);"
    seed=run("SET ROLE postgres;INSERT INTO auth.users(id)VALUES('"+erased+"');INSERT INTO public.profiles(id,user_id,organization_id,full_name)VALUES('71000000-0000-4000-8000-000000001403','"+erased+"','"+org+"','Synthetic erasure race editor');INSERT INTO public.org_staff(user_id,organization_id,role,sections_access)VALUES('"+erased+"','"+org+"','course_editor','[]');"+erased_auth+"SELECT public.save_my_rtn_subscription('"+org+"',true,ARRAY['general'],ARRAY['news'],0);")
    if seed.returncode:raise AssertionError(seed.stderr)
    blocked('personal pending own pull cannot recreate after confirmed erasure',
        "SELECT pg_advisory_xact_lock(hashtextextended('"+erased+"',42007));",
        "INSERT INTO public.account_deletion_revocations VALUES('"+erased+"');INSERT INTO public.account_deletion_jobs(id,user_id,receipt_hash,state,consent_version,snapshot)VALUES('99000000-0000-4000-8000-000000001403','"+erased+"','personal-race-receipt','cleanup_pending','full-personal-data-v1','{\"emptyOrganization\":false,\"organizationId\":\""+org+"\"}');SET ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',false);SELECT public.account_deletion_erase_data('99000000-0000-4000-8000-000000001403','personal-race-receipt');",
        erased_auth+"SELECT public.get_my_rtn_notifications('"+org+"');",
        'rtn_active_actor_required')
    final=run("SELECT lab.check('personal confirmed erasure race removes preferences without reinsertion',NOT EXISTS(SELECT 1 FROM rtn_private.personal_subscriptions WHERE user_id='"+erased+"') AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id='"+erased+"') AND EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id='"+erased+"'));")
    if final.returncode:raise AssertionError(final.stderr)


if __name__=='__main__':
    main()
