"""Real PG17 regression for the narrowly observed provider core whitespace.

Only a dedicated loopback synthetic database is accepted. No production URL,
JWT, account erasure, catalog UPDATE, or existing migration replay is used.
The supported provider transaction is emulated once around every payload.
"""
import ast
import json
import os
from pathlib import Path
import subprocess
from rtn_provider_payload import guarded_payload_sql

ROOT = Path(__file__).resolve().parents[1]
HERE = ROOT / 'supabase/tests/rtn-core-reconciliation'
BASE = ROOT / 'supabase/tests/rtn-managed'
OUT = ROOT / 'outputs/rtn-reconciliation-native'
OUT.mkdir(parents=True, exist_ok=True)
SCOPE = 'isolated native PostgreSQL17 synthetic provider-delta fixture; no production writes'
(OUT / 'result.json').write_text(json.dumps({'scope': SCOPE, 'complete': False}), encoding='utf-8')
if os.environ.get('PGDATABASE') != 'rtn_reconciliation_lab_ci' or os.environ.get('PGHOST') not in ('127.0.0.1', '::1', 'localhost'):
    raise SystemExit('REFUSE: dedicated loopback rtn_reconciliation_lab_ci required')
PSQL = os.environ.get('PSQL', 'psql')


def raw(sql):
    result = subprocess.run([PSQL, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, encoding='utf-8', capture_output=True)
    with (OUT / 'stdout.txt').open('a', encoding='utf-8') as log:
        log.write(result.stdout)
    with (OUT / 'stderr.txt').open('a', encoding='utf-8') as log:
        log.write(result.stderr)
    return result


def run(sql):
    result = raw(sql)
    if result.returncode:
        raise RuntimeError(result.stderr[-5000:])
    return result.stdout.strip()


probe = run("SELECT current_database(),current_setting('server_version_num');")
if not probe.startswith('rtn_reconciliation_lab_ci|17'):
    raise SystemExit('REFUSE: dedicated native PostgreSQL17 lab could not be verified')
read = lambda path: path.read_text(encoding='utf-8')
atomic = lambda sql: 'SET ROLE postgres;BEGIN;\n' + guarded_payload_sql(sql) + '\nCOMMIT;\n'
migration = atomic(read(ROOT / 'supabase/migrations/20261114121500_rtn_provider_core_whitespace_reconciliation.sql'))
base_runner = ast.parse(read(ROOT / 'scripts/test-rtn-sql.py'))
baseline = next(ast.literal_eval(node.value) for node in base_runner.body if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == 'baseline' for target in node.targets))
fixture = read(BASE / 'fixture.sql').replace('DATABASE rtn_lab_ci', 'DATABASE rtn_reconciliation_lab_ci')
run(fixture + '\n' + read(BASE / 'released-guards.sql') + '\n' + baseline + '\n' + atomic(read(ROOT / 'supabase/migrations/20261114120000_rtn_managed_training.sql')))

# This is the same checksum guard used in provider delivery. A formatting or
# content change must fail before even the first source statement can run.
delivery_probe = "CREATE TABLE rtn_private.delivery_guard_probe(id integer);\nINSERT INTO rtn_private.delivery_guard_probe VALUES(1);\n"
corrupted = atomic(delivery_probe).replace('VALUES(1);', 'VALUES(2);', 1)
refused = raw(corrupted)
if not refused.returncode or 'RTN_PROVIDER_PAYLOAD_BYTES_CHANGED' not in refused.stderr:
    raise AssertionError('Changed provider source was not rejected before execution: ' + refused.stderr)
run("SELECT lab.check('delivery checksum rejects changed source before any source DDL',to_regclass('rtn_private.delivery_guard_probe') IS NULL);")
corrupted = atomic(delivery_probe).replace('CREATE TABLE rtn_private.delivery_guard_probe', 'CREATE  TABLE rtn_private.delivery_guard_probe', 1)
refused = raw(corrupted)
if not refused.returncode or 'RTN_PROVIDER_PAYLOAD_BYTES_CHANGED' not in refused.stderr:
    raise AssertionError('Provider whitespace change was not rejected: ' + refused.stderr)
run("SELECT lab.check('delivery checksum rejects source whitespace before any source DDL',to_regclass('rtn_private.delivery_guard_probe') IS NULL);")
run("""SET ROLE postgres;
SELECT lab.keep('reconciliation_canonical_catalog',(SELECT jsonb_agg(to_jsonb(p)ORDER BY p.oid)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','rtn_private')));
SELECT lab.keep('reconciliation_canonical_definitions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid)))FROM pg_proc p WHERE p.oid=ANY(ARRAY['public.save_rtn_settings(uuid,boolean,boolean)'::regprocedure,'public.get_rtn_workspace(uuid)'::regprocedure])));
""")
restore = """SET ROLE postgres;DO $$DECLARE item jsonb;BEGIN FOR item IN SELECT * FROM jsonb_array_elements(lab.ctx('reconciliation_canonical_definitions'))LOOP EXECUTE item->>'definition';END LOOP;END;$$;"""
acceptance = read(HERE / 'acceptance.sql')


def accept(phase):
    run(acceptance.replace("lab.check('", "lab.check('" + phase + ': '))

# Canonical inputs must be a true catalog no-op, including function OIDs/ACLs.
run(migration)
accept('canonical')
run("SELECT lab.check('canonical core is accepted without body or authority changes',true);")

# Reproduce the exact provider bytes, not a fabricated semantic substitute.
run(read(HERE / 'prepare-provider.sql').replace("lab.check('", "lab.check('repair fixture: "))
run(migration)
accept('repaired')
run("SELECT lab.check('both observed provider body differences are reconciled exactly',true);")
run(migration)
run("SELECT lab.check('already reconciled payload is idempotent',lab.ctx('reconciliation_canonical_catalog')=(SELECT jsonb_agg(to_jsonb(p)ORDER BY p.oid)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','rtn_private')));")

# Unknown second body must roll back the first repair in the same real TX.
run(read(HERE / 'prepare-provider.sql').replace("lab.check('", "lab.check('rollback fixture: ") + '\n' + read(HERE / 'unknown.sql'))
run("SELECT lab.keep('reconciliation_before_refusal',(SELECT jsonb_agg(to_jsonb(p)ORDER BY p.oid)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','rtn_private')));")
refused = raw(migration)
if not refused.returncode or 'RTN_CORE_RECONCILIATION_UNKNOWN_BODY:public.get_rtn_workspace(uuid)' not in refused.stderr:
    raise AssertionError('Unknown workspace body was not rejected: ' + refused.stderr)
run("SELECT lab.check('unknown second body atomically rolls back the first known repair',lab.ctx('reconciliation_before_refusal')=(SELECT jsonb_agg(to_jsonb(p)ORDER BY p.oid)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','rtn_private')) AND(SELECT md5(prosrc)='785506ee20900baaf24388ad8831e91f'FROM pg_proc WHERE oid='public.save_rtn_settings(uuid,boolean,boolean)'::regprocedure));")
run(restore)

for label, prepare, cleanup in [
    ('extra ACL grantee', 'GRANT EXECUTE ON FUNCTION public.save_rtn_settings(uuid,boolean,boolean) TO sandbox_exec_atxwvjxbqjgkbjlhsdch;', 'REVOKE EXECUTE ON FUNCTION public.save_rtn_settings(uuid,boolean,boolean) FROM sandbox_exec_atxwvjxbqjgkbjlhsdch;'),
    ('changed search path', 'ALTER FUNCTION public.save_rtn_settings(uuid,boolean,boolean) SET search_path=public;', 'ALTER FUNCTION public.save_rtn_settings(uuid,boolean,boolean) SET search_path=pg_catalog,public;'),
]:
    run('SET ROLE postgres;' + prepare)
    run("SELECT lab.keep('reconciliation_before_refusal',(SELECT jsonb_agg(to_jsonb(p)ORDER BY p.oid)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','rtn_private')));")
    refused = raw(migration)
    if not refused.returncode or 'RTN_CORE_RECONCILIATION_AUTHORITY_CHANGED' not in refused.stderr:
        raise AssertionError(label + ' was not refused: ' + refused.stderr)
    run("SELECT lab.check('reconciliation refuses " + label + " without repairing or widening authority',lab.ctx('reconciliation_before_refusal')=(SELECT jsonb_agg(to_jsonb(p)ORDER BY p.oid)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','rtn_private')));")
    run('SET ROLE postgres;' + cleanup)

refused = raw(migration.replace('SET ROLE postgres;', 'SET ROLE authenticated;', 1))
if not refused.returncode or 'RTN_CORE_RECONCILIATION_REQUIRES_POSTGRES' not in refused.stderr:
    raise AssertionError('Ordinary caller was not refused: ' + refused.stderr)
run("SELECT lab.check('ordinary caller cannot run reconciliation',true);")
accept('final')
receipt = json.loads(run("SELECT json_build_object('checks',json_agg(name ORDER BY name),'passed',count(*),'failed',0)FROM lab.results;"))
receipt.update(scope=SCOPE, complete=True, server_version=probe.split('|')[-1])
(OUT / 'result.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')
print(f"RTN core reconciliation native PostgreSQL17: {receipt['passed']} PASS / 0 FAIL")
