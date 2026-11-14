"""Native RTN migration/authorization tests in a dedicated loopback PG17 lab.

Use PGDATABASE=rtn_lab_ci, PGHOST=127.0.0.1 and PSQL=/path/to/psql.
This runner never connects to Supabase or uses a production JWT. Fixture guard
definitions are a read-only release capture; only synthetic claim settings are
used to exercise real database ACLs and SECURITY DEFINER boundaries locally.
"""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[1]
HERE = ROOT / 'supabase/tests/rtn-managed'
OUT = ROOT / 'outputs/rtn-managed-native'
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'result.json').write_text(json.dumps({'scope': 'isolated PostgreSQL17 synthetic fixture; not production Auth/Storage acceptance', 'complete': False, 'passed': 0, 'failed': 1, 'phase': 'starting'}), encoding='utf-8')
if os.environ.get('PGDATABASE') != 'rtn_lab_ci' or os.environ.get('PGHOST') not in ('127.0.0.1', '::1', 'localhost'):
    raise SystemExit('REFUSE: dedicated loopback rtn_lab_ci required')
PSQL = os.environ.get('PSQL', 'psql')

def run(sql):
    result = subprocess.run([PSQL, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, encoding='utf-8', capture_output=True)
    return result

probe = run("SELECT current_database(),current_setting('server_version_num')::int;")
if probe.returncode or not probe.stdout.strip().startswith('rtn_lab_ci|17'):
    raise SystemExit('REFUSE: dedicated PostgreSQL17 lab could not be verified')
fixture = (HERE / 'fixture.sql').read_text(encoding='utf-8')
guards = (HERE / 'released-guards.sql').read_text(encoding='utf-8')
migration = (ROOT / 'supabase/migrations/20261114120000_rtn_managed_training.sql').read_text(encoding='utf-8')
acceptance = (HERE / 'acceptance.sql').read_text(encoding='utf-8')
baseline = """
SELECT lab.keep('old_data',(SELECT jsonb_build_array((SELECT jsonb_agg(c)FROM public.courses c),(SELECT jsonb_agg(t)FROM public.test_attempts t),(SELECT jsonb_agg(i)FROM public.subscription_invoices i))));
SELECT lab.keep('guard_metadata',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='billing_access_private' OR(n.nspname='public' AND p.proname IN('account_deletion_access_allowed','can_access_organization','has_role','is_student_profile','has_org_staff_permission','get_org_staff_permissions','normalize_org_staff_permission','org_role_default_permissions','has_active_postpaid_agreement','postpaid_is_admin'))));
SELECT lab.keep('storage_policy_metadata',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p WHERE polrelid='storage.objects'::regclass));
"""
sql = fixture + '\n' + guards + '\n' + baseline + '\n' + migration + '\n' + acceptance
result = run(sql)
(OUT / 'native.stdout.txt').write_text(result.stdout, encoding='utf-8')
(OUT / 'native.stderr.txt').write_text(result.stderr, encoding='utf-8')
if result.returncode:
    print(result.stderr[-5000:])
    raise SystemExit(result.returncode)
# Independent connections contend through the real assignment advisory lock
# and attempt FOR UPDATE lock. No in-process mocked RPC or transaction API.
student_session = """SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',false);
SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000101',false);
"""
def concurrent_rpc(sql):
    response = run(student_session + sql)
    if response.returncode:
        raise RuntimeError(response.stderr)
    return json.loads(response.stdout.strip().splitlines()[-1])
concurrent_rpc("SELECT public.submit_rtn_attempt((lab.ctx('attempt2')->>'attempt_id')::uuid,'{\"q1\":[\"b\"],\"q2\":[\"yes\"]}');")
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    starts = list(pool.map(lambda _: concurrent_rpc("SELECT public.start_rtn_attempt((lab.ctx('assignment_id')#>>'{}')::uuid);"), range(8)))
if len({item['attempt_id'] for item in starts}) != 1:
    raise AssertionError('concurrent starts duplicated the active attempt')
concurrent_attempt = str(uuid.UUID(starts[0]['attempt_id']))
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    submits = list(pool.map(lambda _: concurrent_rpc("SELECT public.submit_rtn_attempt('" + concurrent_attempt + "','{\"q1\":[\"b\"],\"q2\":[\"yes\"]}');"), range(6)))
if not all(item == submits[0] for item in submits) or submits[0]['score'] != 100:
    raise AssertionError('concurrent idempotent submissions diverged')
race_receipt = run("SET ROLE postgres;SELECT lab.check('eight concurrent resumes create one active attempt',true);SELECT lab.check('six concurrent submissions grade exactly once',true);")
if race_receipt.returncode:
    raise RuntimeError(race_receipt.stderr)
summary = run("SELECT json_build_object('scope','isolated PostgreSQL17 synthetic fixture; not production Auth/Storage acceptance','checks',json_agg(name ORDER BY name),'passed',count(*),'failed',0) FROM lab.results;")
if summary.returncode:
    raise SystemExit(summary.stderr)
receipt = json.loads(summary.stdout)
receipt['complete'] = True
receipt['server_version'] = probe.stdout.strip().split('|')[-1]
receipt['concurrency'] = {'independent_start_connections': 8, 'independent_submit_connections': 6}
(OUT / 'result.json').write_text(json.dumps(receipt, indent=2, ensure_ascii=False), encoding='utf-8')
print(f"RTN native PostgreSQL17: {receipt['passed']} PASS / 0 FAIL")
