"""Global RTN feed metadata: dedicated loopback PG17 synthetic qualification.

The released erasure fixture builder is reused without executing its runner or
changing old tests. No live JWT, production account or network fetch is used.
--prepare-only writes the same SQL for the explicitly labelled PGlite adapter.
"""
import ast
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
HERE = ROOT / 'supabase/tests/rtn-global-updates'
OUT = ROOT / 'outputs/rtn-updates-sql'
OUT.mkdir(parents=True, exist_ok=True)


def prepared():
    source = (ROOT / 'supabase/tests/rtn-account-erasure/run.py').read_text(encoding='utf-8')
    function = next(node for node in ast.parse(source).body if isinstance(node, ast.FunctionDef) and node.name == 'build_setup')
    namespace = {'ROOT': ROOT, 'HERE': ROOT / 'supabase/tests/rtn-account-erasure', 're': re}
    exec(ast.get_source_segment(source, function), namespace)
    setup = namespace['build_setup']().replace('DATABASE rtn_erasure_lab_ci', 'DATABASE rtn_updates_lab_ci')
    candidate = 'BEGIN;\n' + (ROOT / 'supabase/migrations/20261120130000_rtn_global_updates.sql').read_text(encoding='utf-8') + '\nCOMMIT;\n'
    return [
        ('setup.sql', setup),
        ('privacy.sql', 'BEGIN;\n' + (ROOT / 'supabase/migrations/20261114123000_rtn_account_erasure.sql').read_text(encoding='utf-8') + '\nCOMMIT;\n'),
        ('normative.sql', 'BEGIN;\n' + (ROOT / 'supabase/migrations/20261114124000_rtn_normative_review_admission.sql').read_text(encoding='utf-8') + '\nCOMMIT;\n'),
        ('guard-drift-setup.sql', 'ALTER FUNCTION rtn_private.assert_staff(uuid,text) SET search_path=public;'),
        ('guard-drift-reject.sql', candidate),
        ('guard-drift-restore.sql', "SELECT lab.check('guard authority drift rejects installation atomically',to_regclass('rtn_private.news_sources') IS NULL AND to_regclass('rtn_private.update_events') IS NULL AND to_regprocedure('public.get_rtn_update(uuid,uuid)') IS NULL);ALTER FUNCTION rtn_private.assert_staff(uuid,text) SET search_path=pg_catalog,public;"),
        ('candidate.sql', candidate),
        ('acceptance.sql', (HERE / 'acceptance.sql').read_text(encoding='utf-8')),
    ]


def main():
    sql_files = prepared()
    if sys.argv[1:] == ['--prepare-only']:
        for name, sql in sql_files:
            (OUT / name).write_text(sql, encoding='utf-8')
        print(json.dumps({'status': 'prepared_local_synthetic_sql_only', 'files': [name for name, _ in sql_files]}))
        return
    if sys.argv[1:]:
        raise SystemExit('REFUSE: unknown options')
    if os.environ.get('PGDATABASE') != 'rtn_updates_lab_ci' or os.environ.get('PGHOST') not in ('127.0.0.1', '::1', 'localhost'):
        raise SystemExit('REFUSE: dedicated loopback rtn_updates_lab_ci required')
    psql = os.environ.get('PSQL', 'psql')
    def run(sql):
        return subprocess.run([psql, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, encoding='utf-8', capture_output=True)
    probe = run("SELECT current_database(),current_setting('server_version_num')::int;")
    if probe.returncode or not probe.stdout.strip().startswith('rtn_updates_lab_ci|17'):
        raise SystemExit('REFUSE: dedicated PG17 database could not be verified')
    (OUT / 'native.stdout.txt').write_text('', encoding='utf-8')
    (OUT / 'native.stderr.txt').write_text('', encoding='utf-8')
    for name, sql in sql_files:
        result = run(sql)
        for stream in ('stdout', 'stderr'):
            with (OUT / f'native.{stream}.txt').open('a', encoding='utf-8') as log:
                log.write(f'FILE {name}\n' + getattr(result, stream))
        if name == 'guard-drift-reject.sql':
            if not result.returncode or 'RTN_UPDATES_AUTHORITY_PREIMAGE_CHANGED:rtn_private.assert_staff(uuid,text)' not in result.stderr:
                raise SystemExit('FAIL: known authority drift did not reject candidate atomically: ' + result.stderr[-6000:])
        elif result.returncode:
            raise SystemExit(name + ': ' + result.stderr[-6000:])
    count = run('SELECT count(*) FROM lab.results;')
    if count.returncode:
        raise SystemExit(count.stderr)
    receipt = {'status': 'passed', 'engine': 'native PostgreSQL17', 'passed': int(count.stdout.strip()),
               'scope': 'isolated synthetic single-connection ACL/schema/read qualification; no production or concurrency acceptance'}
    (OUT / 'native-result.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
