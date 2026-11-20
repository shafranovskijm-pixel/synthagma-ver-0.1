"""New central RSS authority: isolated synthetic PG17, never production.

--prepare-only writes SQL for the labelled PGlite adapter. No source fetch,
Storage call, real auth claim, customer record or managed database is involved.
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
HERE = ROOT / 'supabase/tests/rtn-news-ingestion'
OUT = ROOT / 'outputs/rtn-news-ingestion-sql'


def prepared():
    source = (ROOT / 'scripts/test-rtn-updates-sql.py').read_text(encoding='utf-8')
    function = next(node for node in ast.parse(source).body if isinstance(node, ast.FunctionDef) and node.name == 'prepared')
    namespace = {'ROOT': ROOT, 'HERE': ROOT / 'supabase/tests/rtn-global-updates', 'ast': ast, 're': re}
    exec(ast.get_source_segment(source, function), namespace)
    # Reuse only prerequisite setup, never the already-passing41-case suite.
    files = [(name, sql.replace('DATABASE rtn_updates_lab_ci', 'DATABASE rtn_news_lab_ci'))
             for name, sql in namespace['prepared']() if name in ('setup.sql', 'privacy.sql', 'normative.sql', 'candidate.sql')]
    files = [(('global.sql' if name == 'candidate.sql' else name), sql) for name, sql in files]
    files += [
        ('auth-fixture.sql', "CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users(id) SELECT user_id FROM public.profiles ON CONFLICT(id) DO NOTHING;"),
        ('personal.sql', 'BEGIN;\n' + (ROOT / 'supabase/migrations/20261120140000_rtn_personal_notifications.sql').read_text(encoding='utf-8') + '\nCOMMIT;\n'),
        ('before.sql', (HERE / 'before.sql').read_text(encoding='utf-8')),
        ('reader-drift-setup.sql', "ALTER FUNCTION public.get_rtn_update_summary(uuid) SET search_path=public;"),
        ('reader-drift-reject.sql', 'BEGIN;\n' + (ROOT / 'supabase/migrations/20261120150000_rtn_news_ingestion.sql').read_text(encoding='utf-8') + '\nCOMMIT;\n'),
        ('reader-drift-restore.sql', "SELECT lab.check('summary authority drift rejects1500 atomically',to_regclass('rtn_private.news_runtime') IS NULL AND to_regprocedure('public.request_rtn_news_check(uuid)') IS NULL); ALTER FUNCTION public.get_rtn_update_summary(uuid) SET search_path=pg_catalog,public;"),
        ('notification-drift-setup.sql', "DO $d$ DECLARE p pg_proc%ROWTYPE; BEGIN SELECT * INTO p FROM pg_proc WHERE oid='public.get_my_rtn_notifications(uuid,bigint,integer)'::regprocedure; EXECUTE replace(pg_get_functiondef(p.oid),p.prosrc,p.prosrc||E'\\n-- synthetic drift');END;$d$;"),
        ('notification-drift-reject.sql', 'BEGIN;\n' + (ROOT / 'supabase/migrations/20261120150000_rtn_news_ingestion.sql').read_text(encoding='utf-8') + '\nCOMMIT;\n'),
        ('notification-drift-restore.sql', "SELECT lab.check('notification body drift rejects1500 atomically',to_regclass('rtn_private.news_runtime') IS NULL AND to_regprocedure('public.request_rtn_news_check(uuid)') IS NULL); DO $d$ DECLARE p pg_proc%ROWTYPE; BEGIN SELECT * INTO p FROM pg_proc WHERE oid='public.get_my_rtn_notifications(uuid,bigint,integer)'::regprocedure; EXECUTE replace(pg_get_functiondef(p.oid),p.prosrc,replace(p.prosrc,E'\\n-- synthetic drift',''));END;$d$;"),
        ('bucket-setup.sql', "UPDATE storage.buckets SET public=true WHERE id='rtn-sources';"),
        ('bucket-reject.sql', 'BEGIN;\n' + (ROOT / 'supabase/migrations/20261120150000_rtn_news_ingestion.sql').read_text(encoding='utf-8') + '\nCOMMIT;\n'),
        ('bucket-restore.sql', "SELECT lab.check('public original bucket rejects migration without automatic repair',to_regclass('rtn_private.news_runtime') IS NULL AND to_regclass('rtn_private.news_check_runs') IS NULL AND(SELECT public IS TRUE FROM storage.buckets WHERE id='rtn-sources'));UPDATE storage.buckets SET public=false WHERE id='rtn-sources';"),
        ('news.sql', 'BEGIN;\n' + (ROOT / 'supabase/migrations/20261120150000_rtn_news_ingestion.sql').read_text(encoding='utf-8') + '\nCOMMIT;\n'),
        ('acceptance.sql', (HERE / 'acceptance.sql').read_text(encoding='utf-8')),
        ('review-delta.sql', (HERE / 'review-delta.sql').read_text(encoding='utf-8')),
    ]
    return [(name, ('SET ROLE postgres;\n' if name != 'setup.sql' else '') + sql) for name, sql in files]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    files = prepared()
    if sys.argv[1:] == ['--prepare-only']:
        for name, sql in files:
            (OUT / name).write_text(sql, encoding='utf-8', newline='\n')
        print(json.dumps({'status': 'prepared_synthetic_sql_only', 'files': [name for name, _ in files]}))
        return
    if sys.argv[1:] or os.environ.get('PGDATABASE') != 'rtn_news_lab_ci' or os.environ.get('PGHOST') not in ('127.0.0.1', '::1', 'localhost'):
        raise SystemExit('REFUSE: dedicated loopback rtn_news_lab_ci required')
    psql = os.environ.get('PSQL', 'psql')
    def run(sql):
        return subprocess.run([psql, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, encoding='utf-8', capture_output=True)
    probe = run("SELECT current_database(),current_setting('server_version_num')::int,NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='rtn_private');")
    if probe.returncode or not probe.stdout.strip().startswith('rtn_news_lab_ci|17') or not probe.stdout.strip().endswith('|t'):
        raise SystemExit('REFUSE: dedicated fresh PostgreSQL17 lab could not be verified')
    for stream in ('stdout', 'stderr'):
        (OUT / f'native.{stream}.txt').write_text('', encoding='utf-8')
    for name, sql in files:
        result = run(sql)
        for stream in ('stdout', 'stderr'):
            with (OUT / f'native.{stream}.txt').open('a', encoding='utf-8') as log:
                log.write(f'FILE {name}\n' + getattr(result, stream))
        expected_refusals = {'bucket-reject.sql': 'RTN_NEWS_PRIVATE_ORIGINAL_BUCKET_REQUIRED',
                             'reader-drift-reject.sql': 'RTN_NEWS_READER_PREIMAGE_CHANGED:public.get_rtn_update_summary',
                             'notification-drift-reject.sql': 'RTN_NEWS_READER_PREIMAGE_CHANGED:public.get_my_rtn_notifications'}
        if name in expected_refusals:
            if not result.returncode or expected_refusals[name] not in result.stderr:
                raise SystemExit('FAIL: precondition did not reject atomically: ' + result.stderr[-6000:])
        elif result.returncode:
            raise SystemExit(name + ': ' + result.stderr[-6000:])
    concurrency_checks(psql, lambda sql: run('SET ROLE postgres;\n' + sql))
    result = run('SET ROLE postgres;SELECT name FROM lab.results ORDER BY name;')
    if result.returncode:
        raise SystemExit(result.stderr)
    receipt = {'status': 'passed', 'engine': 'native PostgreSQL17 isolated synthetic fixture',
               'passed': len(result.stdout.strip().splitlines()), 'cases': result.stdout.strip().splitlines(),
               'scope': 'post1400 synthetic composition and real two-session authorization races; not production/transport/Storage/cron acceptance'}
    (OUT / 'native-result.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print(json.dumps(receipt))


def concurrency_checks(psql, run):
    """Fresh isolated PG17 only: real concurrent wait/revoke, no server reset."""
    actor = '81000000-0000-4000-8000-000000000001'
    org = '11111111-1111-4111-8111-111111111111'
    auth = "SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false);SELECT set_config('request.jwt.claim.sub','" + actor + "',false);"
    def blocked(name, lock_sql, commit_sql, operation_sql, expected_error):
        blocker = subprocess.Popen([psql,'-X','-A','-t','-q','-v','ON_ERROR_STOP=1'], stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8')
        pool = concurrent.futures.ThreadPoolExecutor(max_workers=2)
        try:
            blocker.stdin.write("SET ROLE postgres;BEGIN;SET LOCAL statement_timeout='15s';"+lock_sql+"SELECT 'RTN_NEWS_LOCK_READY';\n");blocker.stdin.flush()
            def marker():
                for line in blocker.stdout:
                    if line.strip() == 'RTN_NEWS_LOCK_READY':return True
                return False
            if not pool.submit(marker).result(timeout=10):raise AssertionError(name+': blocker did not lock')
            operation = pool.submit(run,"\\set VERBOSITY verbose\nSET statement_timeout='15s';SET application_name='rtn_news_synthetic_race';"+operation_sql)
            deadline=time.monotonic()+8;waited=False
            while time.monotonic()<deadline:
                probe=run("SELECT count(*) FROM pg_stat_activity WHERE application_name='rtn_news_synthetic_race' AND wait_event_type='Lock';")
                if not probe.returncode and probe.stdout.strip()=='1':waited=True;break
                if operation.done():break
                time.sleep(.02)
            blocker.stdin.write(commit_sql+'COMMIT;\n\\q\n');blocker.stdin.flush()
            _,err=blocker.communicate(timeout=10);response=operation.result(timeout=12)
            if not waited or blocker.returncode:raise AssertionError(name+': no real lock wait: '+err+response.stderr)
            if not response.returncode or expected_error not in response.stderr:raise AssertionError(name+': expected after-wait denial missing: '+response.stderr)
            check=run("SELECT lab.check('"+name+"',true);")
            if check.returncode:raise AssertionError(check.stderr)
        finally:
            if blocker.poll() is None:
                blocker.stdin.close();blocker.wait(timeout=15)
            pool.shutdown(wait=True,cancel_futures=True)
    # The request has already acquired subject and organization fences when it
    # waits on this shared runtime row. Fixture-owner mutations intentionally
    # model authority changing before the wait ends; no fabricated user claims
    # or direct business operations are performed outside this synthetic lab.
    runtime="SELECT 1 FROM rtn_private.news_runtime WHERE source_id=1 FOR UPDATE;"
    snapshot=run("SELECT lab.keep('news_race_runs',(SELECT coalesce(jsonb_agg(to_jsonb(r)ORDER BY id),'[]'::jsonb) FROM rtn_private.news_check_runs r));")
    if snapshot.returncode:raise AssertionError(snapshot.stderr)
    blocked('news waiting manual rejects committed permission revocation', runtime,
            "DELETE FROM public.user_roles WHERE user_id='"+actor+"' AND role='organization';",
            auth+"SELECT public.request_rtn_news_check('"+org+"');", 'rtn_organization_permission_required')
    restore=run("INSERT INTO public.user_roles(user_id,role) VALUES('"+actor+"','organization');")
    if restore.returncode:raise AssertionError(restore.stderr)
    blocked('news waiting manual rejects committed billing hold', runtime,
            "INSERT INTO billing_access_private.active_holds VALUES('"+org+"');",
            auth+"SELECT public.request_rtn_news_check('"+org+"');", 'rtn_organization_permission_required')
    restore=run("DELETE FROM billing_access_private.active_holds WHERE organization_id='"+org+"';")
    if restore.returncode:raise AssertionError(restore.stderr)
    blocked('news waiting manual rejects committed actor revocation', runtime,
            "INSERT INTO public.account_deletion_revocations VALUES('"+actor+"');",
            auth+"SELECT public.request_rtn_news_check('"+org+"');", 'rtn_active_actor_required')
    restore=run("DELETE FROM public.account_deletion_revocations WHERE user_id='"+actor+"'; SELECT lab.check('news rejected runtime wait neither enqueues nor changes cached runs',lab.ctx('news_race_runs')=(SELECT coalesce(jsonb_agg(to_jsonb(r)ORDER BY id),'[]'::jsonb) FROM rtn_private.news_check_runs r));")
    if restore.returncode:raise AssertionError(restore.stderr)
    # A real organization-fence wait must also recheck before runtime access.
    blocked('news organization fence waiter rejects committed revocation',
            "SELECT pg_advisory_xact_lock(hashtextextended('"+org+"',42));",
            "INSERT INTO public.account_deletion_revocations VALUES('"+actor+"');",
            auth+"SELECT public.request_rtn_news_check('"+org+"');", 'rtn_active_actor_required')
    restore=run("DELETE FROM public.account_deletion_revocations WHERE user_id='"+actor+"';")
    if restore.returncode:raise AssertionError(restore.stderr)


if __name__ == '__main__':
    main()
