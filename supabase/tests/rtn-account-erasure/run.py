"""Native PostgreSQL17 RTN erasure integration in a dedicated loopback lab.

Uses actual SELECT-captured core erase/snapshot/count bodies and ACLs. Only
unrelated legacy table shapes/domain helpers use explicit empty adapters.
Never production Auth, requests, erasure, roles or user data.
"""
import concurrent.futures
import json
import os
from pathlib import Path
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / 'outputs/rtn-erasure-native'
OUT.mkdir(parents=True, exist_ok=True)
SCOPE = 'isolated PostgreSQL17 synthetic fixture; actual core erasure source, empty unrelated legacy domains; no production erasure'
(OUT / 'result.json').write_text(json.dumps({'scope': SCOPE, 'complete': False}), encoding='utf-8')
PSQL = os.environ.get('PSQL', 'psql')

def run(sql):
    return subprocess.run([PSQL, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, encoding='utf-8', capture_output=True)

def blocked_operation(name, lock_sql, commit_sql, operation_sql, error=None, code=None):
    """Two actual PG connections; the operation must wait on the tested lock."""
    blocker = subprocess.Popen([PSQL,'-X','-A','-t','-q','-v','ON_ERROR_STOP=1'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8')
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=2)
    try:
        blocker.stdin.write("SET ROLE postgres;BEGIN;SET LOCAL statement_timeout='15s';" + lock_sql + "SELECT 'RTN_ERASURE_LOCK_HELD';\n")
        blocker.stdin.flush()
        def marker():
            for line in blocker.stdout:
                if line.strip() == 'RTN_ERASURE_LOCK_HELD':
                    return True
            return False
        if not pool.submit(marker).result(timeout=10):
            raise AssertionError(name + ': blocker failed to lock')
        operation = pool.submit(run, "SET statement_timeout='15s';SET application_name='rtn_erasure_race';" + operation_sql)
        waited = False
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            probe = run("SELECT count(*) FROM pg_stat_activity WHERE application_name='rtn_erasure_race' AND wait_event_type='Lock';")
            if not probe.returncode and probe.stdout.strip() == '1':
                waited = True
                break
            if operation.done():
                break
            time.sleep(.02)
        blocker.stdin.write(commit_sql + 'COMMIT;\n\\q\n')
        blocker.stdin.flush()
        _, blocker_error = blocker.communicate(timeout=10)
        response = operation.result(timeout=12)
        if not waited or blocker.returncode:
            raise AssertionError(name + ': operation did not wait correctly: ' + blocker_error + response.stderr)
        if error is not None and (not response.returncode or error not in response.stderr):
            raise AssertionError(name + ': expected rejection missing: ' + response.stderr)
        if code is not None:
            if response.returncode or json.loads(response.stdout.strip().splitlines()[-1]).get('code') != code:
                raise AssertionError(name + ': expected safe response missing: ' + response.stderr + response.stdout)
        verified = run("SELECT lab.check('" + name.replace("'","''") + "',true);")
        if verified.returncode:
            raise AssertionError(verified.stderr)
    finally:
        if blocker.poll() is None:
            blocker.kill()
            blocker.wait(timeout=5)
        pool.shutdown(wait=True, cancel_futures=True)

def concurrency_checks():
    prepared = run("UPDATE rtn_private.rollout_state SET stage='paid' WHERE id=1;")
    if prepared.returncode:
        raise AssertionError(prepared.stderr)
    owner = '81000000-0000-4000-8000-000000000001'
    admin = '81000000-0000-4000-8000-000000000999'
    for name, actor, sql in [
        ('settings writer waits for subject lock and rejects revoked actor', owner, "SELECT public.save_rtn_settings('11111111-1111-4111-8111-111111111111',false,false);"),
        ('manual check waits for subject lock and rejects revoked actor', owner, "SELECT public.request_rtn_source_check('11111111-1111-4111-8111-111111111111','99000000-0000-4000-8000-000000000501');"),
        ('assignment includes assigner in sorted subject locks and rejects revocation', owner, "SELECT public.assign_rtn_training('11111111-1111-4111-8111-111111111111','99000000-0000-4000-8000-000000000502',ARRAY['72000000-0000-4000-8000-000000000003']::uuid[],NULL);"),
        ('key review waits for subject lock and rejects revoked editor', admin, "SELECT public.review_rtn_keys('99000000-0000-4000-8000-000000000502','99000000-0000-4000-8000-000000000504','[]','Synthetic rejected revoked review');"),
        ('publication waits for subject lock and rejects revoked publisher', admin, "SELECT public.publish_rtn_release('99000000-0000-4000-8000-000000000505',current_date,'Synthetic rejected revoked publication');"),
        ('rollout waits for subject lock and rejects revoked administrator', admin, "SELECT public.set_rtn_rollout_stage('pilot',0,gen_random_uuid(),'Synthetic rejected revoked rollout','{\"fixture\":true}');"),
    ]:
        blocked_operation(name,
            "SELECT pg_advisory_xact_lock(hashtextextended('" + actor + "',42007));",
            "INSERT INTO public.account_deletion_revocations VALUES('" + actor + "');",
            "SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false);SELECT set_config('request.jwt.claim.sub','" + actor + "',false);" + sql,
            error='rtn_active_actor_required')
        cleanup = run("DELETE FROM public.account_deletion_revocations WHERE user_id='" + actor + "';")
        if cleanup.returncode:
            raise AssertionError(cleanup.stderr)
    blocked_operation('ownership erasure waits before snapshot and preserves concurrent shared RTN history',
        "SELECT pg_advisory_xact_lock(hashtextextended('88888888-8888-4888-8888-888888888888',42));SELECT 1 FROM public.organizations WHERE id='88888888-8888-4888-8888-888888888888' FOR UPDATE;",
        "INSERT INTO rtn_private.monthly_activity_totals VALUES('88888888-8888-4888-8888-888888888888','2026-11-01',1,0,1);",
        "SET ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',false);SELECT public.account_deletion_erase_data('99000000-0000-4000-8000-000000000902','synthetic-owner-receipt');",
        code='PLAN_CHANGED')
    confirmed = run("SELECT lab.check('ownership race preserves profile job and shared anonymous totals',EXISTS(SELECT 1 FROM public.profiles WHERE user_id='88880000-0000-4000-8000-000000000001') AND EXISTS(SELECT 1 FROM rtn_private.monthly_activity_totals WHERE organization_id='88888888-8888-4888-8888-888888888888') AND NOT(SELECT data_erased FROM public.account_deletion_jobs WHERE id='99000000-0000-4000-8000-000000000902') AND NOT EXISTS(SELECT 1 FROM rtn_private.erasure_contexts));")
    if confirmed.returncode:
        raise AssertionError(confirmed.stderr)

def build_setup():
    base = ROOT / 'supabase/tests/rtn-managed'
    capture = (HERE / 'live-erasure-sources.sql').read_text(encoding='utf-8')
    # Shape adapters cover only tables/UUID columns referenced by the actual
    # captured legacy source. No unsupported production hook is fabricated.
    columns = {}
    for table, column in re.findall(r"\('([a-z_]+)','([a-z_]+)'\)", capture):
        columns.setdefault(table, set()).add(column)
    for table in re.findall(r'(?:FROM|JOIN|UPDATE|TABLE) public\.([a-z_]+)', capture):
        columns.setdefault(table, set())
    extras = {
        'audit_logs': ['user_id'], 'role_audit_log': ['performed_by', 'target_user_id'],
        'student_deletion_log': ['deleted_by','student_id'],
        'uc_scoped_journal_contexts': ['created_by'],
        'uc_scoped_journal_records': ['subject_user_id','recorded_by','created_by'],
        'uc_scoped_journal_history': ['subject_user_id','recorded_by'],
        'uc_scoped_journal_requests': ['actor_id'], 'uc_scoped_journal_exports': ['recorded_by'],
        'uc_identification_write_contexts': ['user_id'], 'uc_course_assignment_removal_events': ['user_id','actor_id'],
        'group_documents': ['student_user_id'], 'document_issuance_log': ['user_id'],
        'education_document_records': ['user_id'], 'lessons': [], 'student_documents': [],
    }
    for table, names in extras.items():
        columns.setdefault(table, set()).update(names)
    tables = []
    for table, names in sorted(columns.items()):
        if table == 'account_deletion_jobs':
            continue
        tables.append(f'CREATE TABLE IF NOT EXISTS public.{table}(id uuid PRIMARY KEY DEFAULT gen_random_uuid());')
        for column in sorted(names):
            if column != 'id':
                tables.append(f'ALTER TABLE public.{table} ADD COLUMN IF NOT EXISTS {column} uuid;')
    captured = set(re.findall(r'CREATE OR REPLACE FUNCTION public\.([a-z_]+)\(', capture))
    skip = captured | {'is_org_owner','uc_self_examination_retained','uc_self_examination_personal_counts','uc_education_saved_output_counts'}
    funcs = []
    for name in sorted(set(re.findall(r'public\.([a-z_]+)\(', capture)) - skip):
        # Every uncaptured helper in this source takes the one target UUID.
        if name.startswith('uc_') and ('erase' in name):
            funcs.append(f'CREATE FUNCTION public.{name}(uuid) RETURNS void LANGUAGE plpgsql AS $$BEGIN RETURN;END$$;')
        elif name.startswith('uc_') or name == 'account_deletion_files':
            funcs.append(f"CREATE FUNCTION public.{name}(uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT '[]'::jsonb$$;")
    return '\n'.join([
        # Create the captured provider-role name using the disposable cluster's
        # actual bootstrap role BEFORE the shared fixture SET ROLE postgres
        # switches to its intentionally non-superuser function owner.
        "DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec_atxwvjxbqjgkbjlhsdch')THEN CREATE ROLE sandbox_exec_atxwvjxbqjgkbjlhsdch NOLOGIN;END IF;END;$$;",
        (base / 'fixture.sql').read_text(encoding='utf-8').replace('DATABASE rtn_lab_ci', 'DATABASE rtn_erasure_lab_ci'),
        (base / 'released-guards.sql').read_text(encoding='utf-8'),
        (base / 'quota-fixture.sql').read_text(encoding='utf-8'),
        (base / 'released-quota-sources.sql').read_text(encoding='utf-8'),
        # Native psql emulates the provider-owned transaction once per payload.
        'BEGIN;\n' + (ROOT / 'supabase/migrations/20261114120000_rtn_managed_training.sql').read_text(encoding='utf-8') + '\nCOMMIT;\n',
        'BEGIN;\n' + (ROOT / 'supabase/migrations/20261114122000_rtn_quota_activity_integration.sql').read_text(encoding='utf-8') + '\nCOMMIT;\n',
        'BEGIN;\n' + (ROOT / 'supabase/migrations/20261114122500_rtn_attempt_drafts.sql').read_text(encoding='utf-8') + '\nCOMMIT;\n',
        '\n'.join(tables), (HERE / 'fixture.sql').read_text(encoding='utf-8'), '\n'.join(funcs),
        # The new-RPC fixture deliberately models provider-default sandbox
        # grants. This old production source capture has its own exact ACLs;
        # do not inject a default sandbox ACL before reconstructing those pins.
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM sandbox_exec_atxwvjxbqjgkbjlhsdch;',
        capture,
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO sandbox_exec_atxwvjxbqjgkbjlhsdch;',
    ])

if __name__ == '__main__':
    if os.environ.get('PGDATABASE') != 'rtn_erasure_lab_ci' or os.environ.get('PGHOST') not in ('127.0.0.1','::1','localhost'):
        raise SystemExit('REFUSE: dedicated loopback rtn_erasure_lab_ci required')
    probe = run("SELECT current_database(),current_setting('server_version_num')::int;")
    if probe.returncode or not probe.stdout.strip().startswith('rtn_erasure_lab_ci|17'):
        raise SystemExit('REFUSE: dedicated PostgreSQL17 erasure lab could not be verified')
    setup = run(build_setup())
    (OUT / 'native.stdout.txt').write_text(setup.stdout, encoding='utf-8')
    (OUT / 'native.stderr.txt').write_text(setup.stderr, encoding='utf-8')
    if setup.returncode:
        raise SystemExit(setup.stderr[-6000:])
    migration = 'BEGIN;\n' + (ROOT / 'supabase/migrations/20261114123000_rtn_account_erasure.sql').read_text(encoding='utf-8') + '\nCOMMIT;\n'
    # A drifted actual entrypoint must reject the whole migration and leave the
    # paid rollout closed. Restore from the same captured source afterwards.
    drift = run("ALTER FUNCTION public.account_deletion_erase_data(uuid,text) SET search_path=public;")
    refused = run('SET ROLE postgres;\n' + migration)
    if drift.returncode or not refused.returncode or 'RTN_ERASURE_LIVE_PREIMAGE_OR_AUTHORITY_CHANGED' not in refused.stderr:
        raise SystemExit('FAIL: erasure live preimage drift was not rejected: ' + refused.stderr)
    verify = run("SELECT lab.check('drift rollback leaves privacy readiness closed',to_regclass('rtn_private.erasure_contexts') IS NULL AND NOT(SELECT privacy_integration_ready FROM rtn_private.rollout_state));ALTER FUNCTION public.account_deletion_erase_data(uuid,text) SET search_path='pg_catalog','public','storage';")
    if verify.returncode:
        raise SystemExit(verify.stderr)
    result = run('SET ROLE postgres;\n' + migration + '\n' + (HERE / 'acceptance.sql').read_text(encoding='utf-8'))
    with (OUT / 'native.stdout.txt').open('a',encoding='utf-8') as log:
        log.write(result.stdout)
    with (OUT / 'native.stderr.txt').open('a',encoding='utf-8') as log:
        log.write(result.stderr)
    if result.returncode:
        raise SystemExit(result.stderr[-8000:])
    concurrency_checks()
    count = run('SELECT count(*) FROM lab.results;')
    passed = int(count.stdout.strip())
    (OUT / 'result.json').write_text(json.dumps({'scope': SCOPE,'complete': True,'passed': passed,'failed': 0},indent=2),encoding='utf-8')
    print(f'{passed} PASS: {SCOPE}')
