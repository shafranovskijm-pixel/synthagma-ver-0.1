"""Fresh isolated RTN question-policy lab. No production SQL/source/network.

Reuse released prerequisite builders and synthetic seed, never old acceptances.
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
HERE = ROOT / 'supabase/tests/rtn-question-review-policy'
OUT = ROOT / 'outputs/rtn-question-policy-sql'
DB_NAME = 'rtn_question_policy_lab_ci'
ADMIN = '81000000-0000-4000-8000-000000000999'
OWNER = '81000000-0000-4000-8000-000000000001'
LEARNER = '82000000-0000-4000-8000-000000000003'
PROFILE = '72000000-0000-4000-8000-000000000003'
ORG = '11111111-1111-4111-8111-111111111111'


def auth(actor):
    return "SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false);SELECT set_config('request.jwt.claim.sub','" + actor + "',false);"


def prepared():
    source = (ROOT / 'scripts/test-rtn-updates-sql.py').read_text(encoding='utf-8')
    node = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == 'prepared')
    ns = {'ROOT': ROOT, 'HERE': ROOT / 'supabase/tests/rtn-global-updates', 'ast': ast, 're': re}
    exec(ast.get_source_segment(source, node), ns)
    prior = dict(ns['prepared']())
    sql = [('setup.sql', prior['setup.sql'].replace('DATABASE rtn_updates_lab_ci', 'DATABASE ' + DB_NAME)),
           ('privacy.sql', prior['privacy.sql']),
           ('old-seed.sql', (ROOT / 'supabase/tests/rtn-freshness/seed.sql').read_text(encoding='utf-8')),
           ('normative.sql', prior['normative.sql']), ('global.sql', prior['candidate.sql']),
           ('backoff.sql', 'BEGIN;\n' + (ROOT / 'supabase/migrations/20261120160000_rtn_source_failure_backoff.sql').read_text(encoding='utf-8') + '\nCOMMIT;'),
           ('before.sql', (HERE / 'before.sql').read_text(encoding='utf-8')),
           ('candidate.sql', 'BEGIN;\n' + (ROOT / 'supabase/migrations/20261122100000_rtn_question_review_policy_v2.sql').read_text(encoding='utf-8') + '\nCOMMIT;')]
    if (HERE / 'acceptance.sql').exists():
        sql.append(('acceptance.sql', (HERE / 'acceptance.sql').read_text(encoding='utf-8')))
    if (HERE / 'release-transition-delta.sql').exists():
        sql.append(('release-transition-delta.sql', (HERE / 'release-transition-delta.sql').read_text(encoding='utf-8')))
    return [(name, ('' if name == 'setup.sql' else 'SET ROLE postgres;\n') + text) for name, text in sql]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    files = prepared()
    if sys.argv[1:] == ['--prepare-only']:
        for name, sql in files:
            (OUT / name).write_text(sql, encoding='utf-8', newline='\n')
        print(json.dumps({'status': 'prepared_synthetic_question_policy_only', 'files': [n for n, _ in files]}))
        return
    if sys.argv[1:] or os.environ.get('PGDATABASE') != DB_NAME or os.environ.get('PGHOST') not in ('127.0.0.1', '::1', 'localhost'):
        raise SystemExit('REFUSE: dedicated fresh loopback ' + DB_NAME + ' required')
    if not all(any(name == wanted for name, _ in files) for wanted in ('acceptance.sql', 'release-transition-delta.sql')):
        raise SystemExit('REFUSE: missing meaningful acceptance cases')
    psql = os.environ.get('PSQL', 'psql')
    def raw(sql):
        return subprocess.run([psql, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, encoding='utf-8', capture_output=True)
    probe = raw("SELECT current_database(),current_setting('server_version_num')::int,NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='rtn_private');")
    if probe.returncode or not probe.stdout.strip().startswith(DB_NAME + '|17') or not probe.stdout.strip().endswith('|t'):
        raise SystemExit('REFUSE: fresh PG17 lab required; no reset attempted')
    for stream in ('stdout', 'stderr'):
        (OUT / ('native.' + stream + '.txt')).write_text('', encoding='utf-8')
    for name, sql in files:
        result = raw(sql)
        for stream in ('stdout', 'stderr'):
            with (OUT / ('native.' + stream + '.txt')).open('a', encoding='utf-8') as log:
                log.write('FILE ' + name + '\n' + getattr(result, stream))
        if result.returncode:
            raise SystemExit(name + ': ' + result.stderr[-6000:])
    # Two real sessions, not a sleep or a hypothetical lock. The contender must
    # be observed waiting on THIS blocker's PID before source state is changed.
    witnesses = []
    for kind in ('assignment_source', 'attempt_normalization'):
        title = 'native post-wait ' + kind
        setup = auth(ADMIN) + "SELECT lab.keep('native_review',lab.policy_review('Synthetic " + title + "'));SELECT public.publish_rtn_release((lab.ctx('native_review')->>'key_set_id')::uuid,(now()AT TIME ZONE'Europe/Moscow')::date,'Synthetic " + title + " release');"
        if kind == 'attempt_normalization':
            setup += auth(OWNER) + "SELECT lab.keep('native_assignment',public.assign_rtn_training('" + ORG + "',(lab.ctx('bank_id')#>>'{}')::uuid,ARRAY['" + PROFILE + "']::uuid[]));"
        setup += "SET ROLE postgres;SELECT lab.keep('native_business_before',jsonb_build_array((SELECT jsonb_agg(to_jsonb(a)ORDER BY id)FROM rtn_private.assignments a),(SELECT jsonb_agg(to_jsonb(t)ORDER BY id)FROM rtn_private.attempts t),(SELECT jsonb_agg(to_jsonb(u)ORDER BY organization_id,month_start)FROM public.organization_monthly_course_usage u)));"
        seeded = raw(setup)
        if seeded.returncode:
            raise SystemExit('Native witness setup: ' + seeded.stderr[-6000:])
        operation = (
            "SELECT public.assign_rtn_training('" + ORG + "',(lab.ctx('bank_id')#>>'{}')::uuid,ARRAY['" + PROFILE + "']::uuid[])"
            if kind == 'assignment_source' else
            "SELECT public.start_rtn_attempt((lab.ctx('native_assignment')->'assignments'->0->>'id')::uuid)"
        )
        app_name = 'rtn_policy_' + kind
        contender_sql = "SET statement_timeout='15s';SET application_name='" + app_name + "';" + auth(OWNER if kind == 'assignment_source' else LEARNER)
        contender_sql += "SELECT lab.denied('" + title + " sees the committed source state'," + "'" + operation.replace("'", "''") + "','22023');"
        blocker = subprocess.Popen([psql, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8')
        pool = concurrent.futures.ThreadPoolExecutor(max_workers=2)
        try:
            blocker.stdin.write("SET ROLE postgres;BEGIN;SET LOCAL statement_timeout='15s';SELECT pg_advisory_xact_lock(hashtextextended('" + ORG + "',42));SELECT 'POLICY_HELD:'||pg_backend_pid();\n")
            blocker.stdin.flush()
            def read_marker():
                for line in blocker.stdout:
                    if line.strip().startswith('POLICY_HELD:'):
                        return int(line.strip().split(':')[1])
                raise AssertionError('Missing actual blocker marker')
            held_pid = pool.submit(read_marker).result(timeout=10)
            pending = pool.submit(raw, contender_sql)
            operation_pid = None
            observed_blockers = []
            expires = time.monotonic() + 8
            while time.monotonic() < expires:
                observed = raw("SELECT pid,pg_blocking_pids(pid)::text FROM pg_stat_activity WHERE datname=current_database() AND application_name='" + app_name + "' AND wait_event_type='Lock';")
                if observed.returncode:
                    raise AssertionError(observed.stderr)
                rows = observed.stdout.strip().splitlines()
                if len(rows) == 1 and '|' in rows[0]:
                    pid_text, blockers_text = rows[0].split('|', 1)
                    blocker_ids = [int(value) for value in blockers_text.strip('{}').split(',') if value]
                    if held_pid in blocker_ids:
                        operation_pid = int(pid_text)
                        observed_blockers = blocker_ids
                        break
                if pending.done():
                    break
                time.sleep(.02)
            if operation_pid is None:
                raise AssertionError('Contender never waited on the actual organization blocker')
            if kind == 'assignment_source':
                change = "UPDATE rtn_private.sources SET last_sha256=repeat('f',64),source_generation=source_generation+1 WHERE id=(lab.ctx('source')->>'source_id')::uuid;"
            else:
                change = "INSERT INTO rtn_private.bank_revisions(bank_id,source_revision_id,questions,question_count,normalization_version,normalized_sha256,normalization_note)SELECT bank_id,source_revision_id,questions,question_count,normalization_version+1,repeat('e',64),'Synthetic committed correction during actual wait' FROM rtn_private.bank_revisions WHERE id=(lab.ctx('bank_revision_id')#>>'{}')::uuid;"
            blocker.stdin.write(change + 'COMMIT;\n\\q\n')
            blocker.stdin.flush()
            _, block_error = blocker.communicate(timeout=10)
            result = pending.result(timeout=12)
            if blocker.returncode or result.returncode:
                raise AssertionError(block_error + result.stderr)
            preserved = raw("SET ROLE postgres;SELECT lab.check('" + title + " preserves assignments attempts and usage',lab.ctx('native_business_before')=jsonb_build_array((SELECT jsonb_agg(to_jsonb(a)ORDER BY id)FROM rtn_private.assignments a),(SELECT jsonb_agg(to_jsonb(t)ORDER BY id)FROM rtn_private.attempts t),(SELECT jsonb_agg(to_jsonb(u)ORDER BY organization_id,month_start)FROM public.organization_monthly_course_usage u)));")
            if preserved.returncode:
                raise AssertionError(preserved.stderr)
            witnesses.append({'kind': kind, 'blocker_pid': held_pid, 'operation_pid': operation_pid,
                              'observed_blockers': observed_blockers, 'expected_sqlstate_asserted': '22023',
                              'old_business_rows_preserved': True})
        finally:
            if blocker.poll() is None:
                blocker.terminate()
                blocker.communicate(timeout=5)
            pool.shutdown(wait=True, cancel_futures=True)
        if kind == 'assignment_source':
            restored = raw("SET ROLE postgres;UPDATE rtn_private.sources s SET last_sha256=old->>'last_sha256',source_generation=(old->>'source_generation')::integer FROM jsonb_array_elements(lab.ctx('policy_old_sources'))old WHERE s.id=(old->>'id')::uuid AND s.id=(lab.ctx('source')->>'source_id')::uuid;")
            if restored.returncode:
                raise SystemExit(restored.stderr)
    cases_reply = raw('SET ROLE postgres;SELECT name FROM lab.results ORDER BY name;')
    if cases_reply.returncode:
        raise SystemExit(cases_reply.stderr)
    cases = cases_reply.stdout.strip().splitlines()
    if len(cases) < 31 or len(witnesses) != 2 or 'new attempts adopt R2 automatically while resumed and submitted R1 preserve their own keys and result bytes' not in cases:
        raise SystemExit('Missing required policy coverage')
    receipt = {'status': 'passed', 'engine': 'native PostgreSQL17 fresh synthetic fixture', 'passed': len(cases), 'cases': cases,
               'migration_sha256': hashlib.sha256((ROOT / 'supabase/migrations/20261122100000_rtn_question_review_policy_v2.sql').read_bytes()).hexdigest(),
               'two_session_witnesses': witnesses,
               'scope': 'synthetic policy/metadata/authority and actual post-wait source/normalization guards; not production source or Techservice acceptance'}
    (OUT / 'native-result.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
