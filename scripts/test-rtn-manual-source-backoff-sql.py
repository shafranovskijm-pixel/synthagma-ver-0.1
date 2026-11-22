"""Fresh isolated manual RTN bank-backoff lab; never production/source HTTP.

Reuse prerequisite builders only. No old acceptance suite is executed.
Native mode also proves two actual source-row lock waits with exact blocker PID.
"""
import ast
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
HERE = ROOT / 'supabase/tests/rtn-manual-source-backoff'
OUT = ROOT / 'outputs/rtn-manual-source-backoff-sql'
DB_NAME = 'rtn_manual_source_backoff_lab_ci'
MIGRATION = ROOT / 'supabase/migrations/20261122133000_rtn_manual_source_backoff.sql'


def prepared():
    source = (ROOT / 'scripts/test-rtn-question-policy-sql.py').read_text(encoding='utf-8')
    node = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == 'prepared')
    ns = {'ROOT': ROOT, 'HERE': ROOT / 'supabase/tests/rtn-question-review-policy',
          'DB_NAME': DB_NAME, 'ast': ast, 're': re}
    exec(ast.get_source_segment(source, node), ns)
    prior = dict(ns['prepared']())
    names = ['setup.sql', 'privacy.sql', 'old-seed.sql', 'normative.sql', 'global.sql', 'backoff.sql']
    files = [(name, prior[name]) for name in names]
    files += [('policy.sql', prior['candidate.sql']),
              ('before.sql', 'SET ROLE postgres;\n' + (HERE / 'before.sql').read_text(encoding='utf-8')),
              ('candidate.sql', 'SET ROLE postgres;BEGIN;\n' + MIGRATION.read_text(encoding='utf-8') + '\nCOMMIT;\n'),
              ('acceptance.sql', (HERE / 'acceptance.sql').read_text(encoding='utf-8'))]
    return files


def native_lock_cases(raw):
    """Two new isolated fixtures; no real source, JWT, scheduler or egress."""
    owner = '81000000-0000-4000-8000-000000000001'
    witnesses = []
    for number, mode in [(91, 'deadline_elapsed'), (92, 'new_denial_commits')]:
        source_id = '68000000-0000-4000-8000-' + str(number).zfill(12)
        run_id = '69000000-0000-4000-8000-' + str(number).zfill(12)
        setup = raw("SET ROLE postgres;INSERT INTO rtn_private.sources(id,code,title,page_url,document_url,trusted_anchor_rule,parser) VALUES('" + source_id + "','native-manual-" + str(number) + "','Synthetic native manual wait','https://www.gosnadzor.ru/service/list/manual-retry/','https://www.gosnadzor.ru/upload/manual-retry.pdf','a1','industrial-pdf');"
                    "INSERT INTO rtn_private.banks(id,source_id,code,title,domain) VALUES(gen_random_uuid(),'" + source_id + "','NATIVE-MANUAL-" + str(number) + "','Synthetic native wait','industrial-safety');"
                    "INSERT INTO rtn_private.check_runs(id,source_id,kind,status,queued_at,completed_at,error) VALUES('" + run_id + "','" + source_id + "','weekly','error',clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour'+interval '2 seconds','OFFICIAL_TIMEOUT');")
        if setup.returncode:
            raise AssertionError(setup.stderr)
        command = [os.environ.get('PSQL', 'psql'), '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1']
        blocker = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE, text=True, encoding='utf-8')
        pool = concurrent.futures.ThreadPoolExecutor(max_workers=2)
        try:
            blocker.stdin.write("SET ROLE postgres;BEGIN;SET LOCAL statement_timeout='15s';SELECT 1 FROM rtn_private.sources WHERE id='" + source_id + "' FOR UPDATE;SELECT 'RTN_MANUAL_LOCK_HELD:'||pg_backend_pid();\n")
            blocker.stdin.flush()
            def held_pid():
                for line in blocker.stdout:
                    if line.strip().startswith('RTN_MANUAL_LOCK_HELD:'):
                        return int(line.strip().split(':')[1])
                raise AssertionError('Own blocker did not report a PID')
            blocker_pid = pool.submit(held_pid).result(timeout=8)
            operation = pool.submit(raw, "SET application_name='rtn_manual_retry_" + str(number) + "';SET statement_timeout='15s';BEGIN;SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false);SELECT set_config('request.jwt.claim.sub','" + owner + "',false);SELECT public.request_rtn_source_check('11111111-1111-4111-8111-111111111111','" + source_id + "');COMMIT;")
            witnessed = None
            until = time.monotonic() + 8
            while time.monotonic() < until:
                probe = raw("SELECT json_build_object('pid',pid,'blockers',pg_blocking_pids(pid),'started_before_deadline',xact_start<(SELECT completed_at+interval '1 hour' FROM rtn_private.check_runs WHERE id='" + run_id + "')) FROM pg_stat_activity WHERE datname=current_database() AND application_name='rtn_manual_retry_" + str(number) + "' AND wait_event_type='Lock' AND " + str(blocker_pid) + "=ANY(pg_blocking_pids(pid));")
                if not probe.returncode and probe.stdout.strip():
                    witnessed = json.loads(probe.stdout.strip())
                    break
                if operation.done():
                    break
                time.sleep(.025)
            if not witnessed:
                raise AssertionError('Own manual call did not demonstrably wait on the exact source-row blocker')
            if witnessed.get('started_before_deadline') is not True:
                raise AssertionError('Fixture setup missed its boundary; not valid post-wait clock evidence')
            # Ensure the request's transaction/entry clock precedes the deadline.
            # The production decision must use a new wall clock after the wait.
            time.sleep(2.1)
            commit = ""
            if mode == 'new_denial_commits':
                commit = "UPDATE rtn_private.check_runs SET completed_at=clock_timestamp(),error='OFFICIAL_HTTP_403' WHERE id='" + run_id + "';"
            blocker.stdin.write(commit + 'COMMIT;\n\\q\n')
            blocker.stdin.flush()
            _, stderr = blocker.communicate(timeout=8)
            response = operation.result(timeout=10)
            if blocker.returncode or response.returncode:
                raise AssertionError(stderr + response.stderr)
            reply = json.loads(response.stdout.strip().splitlines()[-1])
            expected = reply.get('status') == 'queued' and reply.get('replayed') is False if mode == 'deadline_elapsed' else reply.get('status') == 'error' and reply.get('run_id') == run_id and reply.get('can_manual_check') is False
            if not expected:
                raise AssertionError('Wrong post-wait manual response: ' + json.dumps(reply))
            rows = raw("SET ROLE postgres;SELECT count(*) FROM rtn_private.check_runs WHERE source_id='" + source_id + "';")
            if rows.returncode or rows.stdout.strip() != ('2' if mode == 'deadline_elapsed' else '1'):
                raise AssertionError('Unexpected duplicate or forbidden queue after native lock wait')
            name = ('native source-row wait uses fresh wall clock after deadline elapsed' if mode == 'deadline_elapsed'
                    else 'native source-row wait reads newly committed403 and refuses a newqueue')
            checked = raw("SET ROLE postgres;SELECT lab.check('" + name + "',true);")
            if checked.returncode:
                raise AssertionError(checked.stderr)
            witnesses.append({'case': name, 'blocker_pid': blocker_pid, 'actual_waiter': witnessed,
                              'response_status': reply['status'], 'new_queue': mode == 'deadline_elapsed'})
        finally:
            if blocker.poll() is None:
                blocker.kill()
                blocker.wait(timeout=5)
            pool.shutdown(wait=True, cancel_futures=True)
    return witnesses


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    files = prepared()
    if sys.argv[1:] == ['--prepare-only']:
        for name, sql in files:
            (OUT / name).write_text(sql, encoding='utf-8', newline='\n')
        print(json.dumps({'status': 'prepared_synthetic_manual_bank_backoff_only', 'files': [name for name, _ in files]}))
        return
    if sys.argv[1:] or os.environ.get('PGDATABASE') != DB_NAME or os.environ.get('PGHOST') not in ('127.0.0.1', '::1', 'localhost'):
        raise SystemExit('REFUSE: dedicated fresh loopback ' + DB_NAME + ' required')
    psql = os.environ.get('PSQL', 'psql')
    def raw(sql):
        return subprocess.run([psql, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'], input=sql,
                              text=True, encoding='utf-8', capture_output=True)
    probe = raw("SELECT current_database(),current_setting('server_version_num')::int,NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='rtn_private');")
    if probe.returncode or not probe.stdout.strip().startswith(DB_NAME + '|17') or not probe.stdout.strip().endswith('|t'):
        raise SystemExit('REFUSE: fresh dedicated PG17 lab required; no reset attempted')
    for stream in ('stdout', 'stderr'):
        (OUT / ('native.' + stream + '.txt')).write_text('', encoding='utf-8')
    for name, sql in files:
        result = raw(sql)
        for stream in ('stdout', 'stderr'):
            with (OUT / ('native.' + stream + '.txt')).open('a', encoding='utf-8') as log:
                log.write('FILE ' + name + '\n' + getattr(result, stream))
        if result.returncode:
            raise SystemExit(name + ': ' + result.stderr[-6000:])
    witnesses = native_lock_cases(raw)
    result = raw('SET ROLE postgres;SELECT name FROM lab.results ORDER BY name;')
    if result.returncode:
        raise SystemExit(result.stderr)
    cases = result.stdout.strip().splitlines()
    if len(cases) < 30 or len(witnesses) != 2:
        raise SystemExit('Missing required manual denial/authority/date coverage')
    receipt = {'status': 'passed', 'engine': 'native PostgreSQL17 fresh synthetic fixture',
               'passed': len(cases), 'cases': cases, 'native_lock_witnesses': witnesses,
               'migration_sha256': hashlib.sha256(MIGRATION.read_bytes()).hexdigest(),
               'scope': 'new manual backoff/authorization/projection/actual lock-wait tests only; no real publisher/source/pilot acceptance'}
    (OUT / 'native-result.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
