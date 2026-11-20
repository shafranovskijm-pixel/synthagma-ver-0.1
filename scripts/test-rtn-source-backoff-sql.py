"""Single-function source retry candidate: fresh isolated PG17/PGlite only.

No production SQL, real OAuth/JWT, HTTP, source/Storage fetch or schedule call.
Reuse released prerequisite setup, never rerun old passing acceptance suites.
"""
import ast
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
HERE = ROOT / 'supabase/tests/rtn-source-failure-backoff'
OUT = ROOT / 'outputs/rtn-source-backoff-sql'
DB_NAME = 'rtn_source_backoff_lab_ci'


def prepared():
    source = (ROOT / 'scripts/test-rtn-updates-sql.py').read_text(encoding='utf-8')
    node = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == 'prepared')
    ns = {'ROOT': ROOT, 'HERE': ROOT / 'supabase/tests/rtn-global-updates', 'ast': ast, 're': re}
    exec(ast.get_source_segment(source, node), ns)
    files = [(name, sql.replace('DATABASE rtn_updates_lab_ci', 'DATABASE ' + DB_NAME))
             for name, sql in ns['prepared']() if name in ('setup.sql', 'privacy.sql', 'normative.sql')]
    candidate = 'BEGIN;\n' + (ROOT / 'supabase/migrations/20261120160000_rtn_source_failure_backoff.sql').read_text(encoding='utf-8') + '\nCOMMIT;\n'
    files += [
        ('before.sql', (HERE / 'before.sql').read_text(encoding='utf-8')),
        ('authority-drift.sql', 'ALTER FUNCTION public.enqueue_due_rtn_checks() SET search_path=public;'),
        ('authority-reject.sql', candidate),
        ('authority-restore.sql', "ALTER FUNCTION public.enqueue_due_rtn_checks() SET search_path=pg_catalog,public;SELECT lab.check('scheduler authority drift refuses1600 without source or queue mutation',lab.ctx('source_retry_old_queue')=(SELECT jsonb_agg(to_jsonb(r)ORDER BY id) FROM rtn_private.check_runs r));"),
        ('body-drift.sql', "DO $d$ DECLARE p pg_proc%ROWTYPE;BEGIN SELECT * INTO p FROM pg_proc WHERE oid='public.enqueue_due_rtn_checks()'::regprocedure;EXECUTE replace(pg_get_functiondef(p.oid),p.prosrc,p.prosrc||E'\\n-- synthetic drift');END;$d$;"),
        ('body-reject.sql', candidate),
        ('body-restore.sql', "DO $d$ DECLARE p pg_proc%ROWTYPE;BEGIN SELECT * INTO p FROM pg_proc WHERE oid='public.enqueue_due_rtn_checks()'::regprocedure;EXECUTE replace(pg_get_functiondef(p.oid),p.prosrc,replace(p.prosrc,E'\\n-- synthetic drift',''));END;$d$;SELECT lab.check('scheduler body drift refuses1600 before any replacement',(SELECT md5(prosrc)='9cdc279471df0cfce5023b20d00faf97' FROM pg_proc WHERE oid='public.enqueue_due_rtn_checks()'::regprocedure));"),
        ('candidate.sql', candidate),
        ('repeat-reject.sql', candidate),
        ('acceptance.sql', (HERE / 'acceptance.sql').read_text(encoding='utf-8')),
    ]
    return [(name, ('' if name == 'setup.sql' else 'SET ROLE postgres;\n') + sql) for name, sql in files]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    files = prepared()
    if sys.argv[1:] == ['--prepare-only']:
        for name, sql in files:
            (OUT / name).write_text(sql, encoding='utf-8', newline='\n')
        print(json.dumps({'status': 'prepared_synthetic_source_retry_sql', 'files': [name for name, _ in files]}))
        return
    if sys.argv[1:] or os.environ.get('PGDATABASE') != DB_NAME or os.environ.get('PGHOST') not in ('127.0.0.1', '::1', 'localhost'):
        raise SystemExit('REFUSE: dedicated fresh loopback ' + DB_NAME + ' required')
    psql = os.environ.get('PSQL', 'psql')
    def run(sql):
        return subprocess.run([psql, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, encoding='utf-8', capture_output=True)
    probe = run("SELECT current_database(),current_setting('server_version_num')::int,NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='rtn_private');")
    if probe.returncode or not probe.stdout.strip().startswith(DB_NAME + '|17') or not probe.stdout.strip().endswith('|t'):
        raise SystemExit('REFUSE: fresh dedicated PostgreSQL17 source retry lab could not be verified; no reset attempted')
    for stream in ('stdout', 'stderr'):
        (OUT / ('native.' + stream + '.txt')).write_text('', encoding='utf-8')
    for name, sql in files:
        result = run(sql)
        for stream in ('stdout', 'stderr'):
            with (OUT / ('native.' + stream + '.txt')).open('a', encoding='utf-8') as log:
                log.write('FILE ' + name + '\n' + getattr(result, stream))
        if name.endswith('-reject.sql'):
            if not result.returncode or 'RTN_SOURCE_RETRY_PREIMAGE_OR_AUTHORITY_CHANGED' not in result.stderr:
                raise SystemExit('FAIL: exact drift/replay refusal missing: ' + result.stderr[-6000:])
        elif result.returncode:
            raise SystemExit(name + ': ' + result.stderr[-6000:])
    result = run('SET ROLE postgres;SELECT name FROM lab.results ORDER BY name;')
    if result.returncode:
        raise SystemExit(result.stderr)
    cases = result.stdout.strip().splitlines()
    receipt = {'status': 'passed', 'engine': 'native PostgreSQL17 fresh synthetic fixture', 'passed': len(cases), 'cases': cases,
               'scope': 'single-connection scheduler backoff/authority/date boundaries only, no real source/cron or production acceptance'}
    (OUT / 'native-result.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
