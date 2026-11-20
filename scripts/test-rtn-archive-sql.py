"""Fresh synthetic PG17/PGlite archive qualification. Never production/network.

Reuse only released prerequisite builders, never their acceptance suites.
--prepare-only writes labelled local SQL; the native runner requires a fresh
loopback database and never resets, kills or installs any server.
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
HERE = ROOT / 'supabase/tests/rtn-archive-discovery'
OUT = ROOT / 'outputs/rtn-archive-sql'
DB_NAME = 'rtn_archive_lab_ci'
REQUIRED_SINGLE_CASES = {
    'migration changes only four allowed old bodies and preserves all old metadata',
    'unchanged new capture uses older immutable per-item evidence without inventing rows',
    'mixed changed and unchanged capture records the complete anchor set',
    'future anchor input cannot skip its predecessor or poison the probe cursor',
    'archive-first URL stays historical on its later genuine fresh-timestamp RSS appearance',
    'expired publisher block exposes manual10minute cooldown despite future scheduled due',
    'inclusive calendar cap accepts difference6 as seven DATEs',
    'inclusive calendar cap stops difference7 as eight DATEs without clamping uncertainty',
    'twenty repeated observations exhaust one campaign without a budget-reset crawl',
    'foreign and blocked actors cannot use archive readonly readers',
    'cross-SCAN repeated URL cannot close a boundary and keeps all page observations',
    'head and boundary revalidation repeats remain valid without unique-budget duplication',
}


def prepared():
    source = (ROOT / 'scripts/test-rtn-news-sql.py').read_text(encoding='utf-8')
    node = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == 'prepared')
    namespace = {'ROOT': ROOT, 'HERE': ROOT / 'supabase/tests/rtn-news-ingestion', 'ast': ast, 're': re}
    exec(ast.get_source_segment(source, node), namespace)
    wanted = ('setup.sql', 'privacy.sql', 'normative.sql', 'global.sql', 'auth-fixture.sql', 'personal.sql', 'before.sql', 'news.sql')
    files = [(('old-news-before.sql' if name == 'before.sql' else name), sql.replace('DATABASE rtn_news_lab_ci', 'DATABASE ' + DB_NAME))
             for name, sql in namespace['prepared']() if name in wanted]
    files += [('backoff.sql', 'SET ROLE postgres;BEGIN;\n' + (ROOT / 'supabase/migrations/20261120160000_rtn_source_failure_backoff.sql').read_text(encoding='utf-8') + '\nCOMMIT;'),
              ('before.sql', (HERE / 'before.sql').read_text(encoding='utf-8'))]
    for name, path in [('candidate.sql', ROOT / 'supabase/migrations/20261121090000_rtn_archive_discovery.sql'),
                       ('acceptance.sql', HERE / 'acceptance.sql'), ('review-delta.sql', HERE / 'review-delta.sql')]:
        # Missing candidate/acceptance is a refusal, never an empty green lab.
        files.append((name, 'SET ROLE postgres;\n' + ('BEGIN;\n' if name == 'candidate.sql' else '') + path.read_text(encoding='utf-8') + ('\nCOMMIT;' if name == 'candidate.sql' else '')))
    return files


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    files = prepared()
    if sys.argv[1:] == ['--prepare-only']:
        for name, sql in files:
            (OUT / name).write_text(sql, encoding='utf-8', newline='\n')
        print(json.dumps({'status': 'prepared_synthetic_archive_sql', 'files': [name for name, _ in files]}))
        return
    if sys.argv[1:] or os.environ.get('PGDATABASE') != DB_NAME or os.environ.get('PGHOST') not in ('127.0.0.1', '::1', 'localhost'):
        raise SystemExit('REFUSE: dedicated fresh loopback ' + DB_NAME + ' required')
    psql = os.environ.get('PSQL', 'psql')
    def run(sql):
        return subprocess.run([psql, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, encoding='utf-8', capture_output=True)
    probe = run("SELECT current_database(),current_setting('server_version_num')::int,NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='rtn_private');")
    if probe.returncode or not probe.stdout.strip().startswith(DB_NAME + '|17') or not probe.stdout.strip().endswith('|t'):
        raise SystemExit('REFUSE: fresh dedicated PG17 archive lab not verified; no reset attempted')
    for stream in ('stdout', 'stderr'):
        (OUT / ('native.' + stream + '.txt')).write_text('', encoding='utf-8')
    for name, sql in files:
        result = run(sql)
        for stream in ('stdout', 'stderr'):
            with (OUT / ('native.' + stream + '.txt')).open('a', encoding='utf-8') as log:
                log.write('FILE ' + name + '\n' + getattr(result, stream))
        if result.returncode:
            raise SystemExit(name + ': ' + result.stderr[-6000:])
    single = run('SET ROLE postgres;SELECT name FROM lab.results ORDER BY name;')
    single_cases = single.stdout.strip().splitlines()
    if single.returncode or len(single_cases) < 60 or not REQUIRED_SINGLE_CASES.issubset(single_cases):
        raise SystemExit('REFUSE: required meaningful single-connection archive cases missing')
    races = concurrency_checks(psql, run)
    result = run('SET ROLE postgres;SELECT name FROM lab.results ORDER BY name;')
    if result.returncode:
        raise SystemExit(result.stderr)
    cases = result.stdout.strip().splitlines()
    if len(cases) < 65 or len(set(cases)) != len(cases) or len(races) != 5 or not all(r['wait_observed'] for r in races):
        raise SystemExit('FAIL: native case count/uniqueness/five real lock witnesses missing')
    receipt = {'status': 'passed', 'engine': 'native PostgreSQL17 fresh synthetic fixture', 'passed': len(cases), 'cases': cases, 'actual_two_session_witnesses': races,
               'migration_sha256': hashlib.sha256((ROOT / 'supabase/migrations/20261121090000_rtn_archive_discovery.sql').read_bytes()).hexdigest(),
               'single_connection_cases': len(single_cases), 'native_race_cases': len(races),
               'scope': 'offline synthetic archive contract only; not production HTTP/Storage/activation/customer acceptance'}
    (OUT / 'native-result.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print(json.dumps(receipt))


def concurrency_checks(psql, monitor):
    """Fresh CI PG17 only. Actual independent sessions, not a WASM claim.

    All control-time seeding/cleanup is explicit disposable-lab ownership work;
    it neither asserts a real source observation nor touches a shared server.
    """
    capability = monitor("SELECT current_user=session_user AND((SELECT rolsuper FROM pg_roles WHERE rolname=current_user)OR pg_has_role(current_user,'pg_read_all_stats','MEMBER'));")
    if capability.returncode or capability.stdout.strip() != 't':
        raise AssertionError('Existing lab bootstrap statistics visibility required, no permission repair attempted')
    def owner(sql):
        return monitor("SET ROLE postgres;DO $$BEGIN PERFORM set_config('request.jwt.claim.role','service_role',false);END;$$;" + sql)
    def checked(sql):
        result = owner(sql)
        if result.returncode:
            raise AssertionError(result.stderr[-6000:])
        return result
    observations = []

    def blocked(name, preparation, winner, operation, expected, proof, started_before_deadline=False, post_check_setup=''):
        checked(preparation)
        pool = concurrent.futures.ThreadPoolExecutor(max_workers=2)
        blocker = subprocess.Popen([psql, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'], stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8')
        try:
            blocker.stdin.write("SET ROLE postgres;DO $$BEGIN PERFORM set_config('request.jwt.claim.role','service_role',false);END;$$;BEGIN;SET LOCAL statement_timeout='15s';SELECT1 FROM rtn_private.news_runtime WHERE source_id=1 FOR UPDATE;SELECT 'ARCHIVE_LOCK_READY:'||pg_backend_pid();\n".replace('SELECT1','SELECT 1'))
            blocker.stdin.flush()
            def marker():
                for line in blocker.stdout:
                    if line.strip().startswith('ARCHIVE_LOCK_READY:'):
                        return int(line.strip().split(':', 1)[1])
                return 0
            blocker_pid = pool.submit(marker).result(timeout=10)
            if blocker_pid <= 0:
                raise AssertionError('No independent blocker marker: ' + name)
            prefix = "\\set VERBOSITY verbose\nSET statement_timeout='15s';SET application_name='rtn_archive_synthetic_race';"
            if started_before_deadline:
                prefix += "SET ROLE service_role;SELECT lab.keep('native_deadline_started',to_jsonb(clock_timestamp()));"
            pending = pool.submit(monitor, prefix + operation)
            until = time.monotonic() + 8
            waited = False
            while time.monotonic() < until:
                probe = monitor("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name='rtn_archive_synthetic_race' AND wait_event_type='Lock' AND " + str(blocker_pid) + "=ANY(pg_blocking_pids(pid));")
                if not probe.returncode and probe.stdout.strip() == '1':
                    waited = True
                    break
                if pending.done():
                    break
                time.sleep(.02)
            if not waited:
                raise AssertionError('No actual target lock wait: ' + name)
            blocker.stdin.write(winner + ';COMMIT;\n\\q\n')
            blocker.stdin.flush()
            blocker.wait(timeout=15)
            if blocker.returncode:
                raise AssertionError('Winner failed: ' + blocker.stderr.read()[-6000:])
            result = pending.result(timeout=20)
            if expected:
                if result.returncode == 0 or expected not in result.stderr:
                    raise AssertionError(name + ': expected actual rejection ' + expected + ': ' + result.stderr[-6000:])
            elif result.returncode:
                raise AssertionError(name + ': ' + result.stderr[-6000:])
            verified = checked(post_check_setup + "SELECT lab.check('" + name.replace("'", "''") + "'," + proof + ');')
            observations.append({'case': name, 'blocker_pid': blocker_pid, 'wait_observed': waited,
                                 'expected_error': expected, 'operator_sql_exit': result.returncode, 'verification_exit': verified.returncode})
        finally:
            if blocker.poll() is None:
                try:
                    blocker.stdin.write('ROLLBACK;\n\\q\n');blocker.stdin.flush();blocker.wait(timeout=5)
                except (OSError, subprocess.TimeoutExpired):
                    blocker.terminate();blocker.wait(timeout=5)  # Only this owned psql child.
            pool.shutdown(wait=True)

    svc = "SET ROLE service_role;DO $$BEGIN PERFORM set_config('request.jwt.claim.role','service_role',false);END;$$;"
    # A legacy claim wins the shared lock before activation; activation must
    # inspect that committed live lease after its real wait.
    blocked('native activation rechecks live legacy after waiting',
            "SELECT lab.keep('native_proof',lab.archive_rss(lab.ctx('archive_prior_feed')->'items','c'));SELECT lab.archive_anchor(lab.ctx('native_proof'));UPDATE rtn_private.news_runtime SET next_due_at=clock_timestamp()-interval '1 second',last_enqueued_at=clock_timestamp()-interval '11 minutes';SELECT public.enqueue_due_rtn_news_check();",
            "SELECT lab.keep('native_legacy',public.claim_rtn_news_check(NULL))",
            "SET ROLE postgres;SELECT rtn_private.activate_news_archive((lab.ctx('native_proof')#>>'{claim,run_id}')::uuid,repeat('f',64));",
            '40001', "(SELECT activation_state='off' FROM rtn_private.news_archive_runtime) AND EXISTS(SELECT1 FROM rtn_private.news_check_runs WHERE status='running')".replace('SELECT1','SELECT 1'))
    checked("SELECT public.complete_rtn_news_check((lab.ctx('native_legacy')->>'run_id')::uuid,(lab.ctx('native_legacy')->>'lease_token')::uuid,lab.ctx('archive_prior_feed'));SELECT lab.archive_anchor(jsonb_build_object('claim',lab.ctx('native_legacy'),'payload',lab.ctx('archive_prior_feed')));")
    # Both readers got the same input; the loser error may not poison the
    # classification/cursor that the winner just committed.
    blocked('native stale anchor error cannot poison committed cursor',
            "SELECT lab.keep('native_anchor',lab.archive_rss(lab.ctx('archive_prior_feed')->'items','d'));",
            "SELECT lab.archive_anchor(lab.ctx('native_anchor'))",
            svc + "SELECT public.record_rtn_news_archive_anchor((lab.ctx('native_anchor')#>>'{claim,run_id}')::uuid,'{\"status\":\"error\",\"error_code\":\"RTN_ARCHIVE_ORIGINAL_READ_FAILED\"}');",
            '40001', "(SELECT anchor_probe_failures=0 AND last_processed_rss_run_id=(lab.ctx('native_anchor')#>>'{claim,run_id}')::uuid FROM rtn_private.news_archive_runtime)")
    checked("SELECT rtn_private.activate_news_archive((lab.ctx('native_anchor')#>>'{claim,run_id}')::uuid,repeat('f',64));")

    cleanup = """UPDATE rtn_private.news_archive_requests SET status='unknown_spend',completed_at=clock_timestamp(),error_code='RTN_ARCHIVE_TIMEOUT' WHERE status='authorized';
UPDATE rtn_private.news_archive_gaps SET status='observed_end',stop_reason='listing_end',lease_expires_at=NULL,completed_at=clock_timestamp() WHERE status IN('queued','running','needs_review');
UPDATE rtn_private.news_archive_runtime SET last_usable_anchor_run_id=(SELECT rss_run_id FROM rtn_private.news_rss_anchor_observations WHERE items@>'[{"canonical_url":"https://www.gosnadzor.ru/news/67/100/"}]' ORDER BY rss_completed_at DESC,rss_run_id DESC LIMIT1);""".replace('LIMIT1','LIMIT 1')
    blocked('native completion samples absolute deadline after shared lock wait',
            "SELECT lab.keep('native_gap',lab.archive_gap());SELECT lab.keep('native_page',lab.archive_page(lab.ctx('native_gap'),910));UPDATE rtn_private.news_archive_gaps SET network_deadline_at=clock_timestamp()+interval '2 seconds';",
            "SELECT pg_sleep(2.1)",
            svc + "SELECT lab.archive_complete(lab.ctx('native_gap'),lab.ctx('native_page'));",
            '40001', "(SELECT unique_pages=0 AND campaign_get_reserved=1 AND (lab.ctx('native_deadline_started')#>>'{}')::timestamptz<network_deadline_at FROM rtn_private.news_archive_gaps WHERE id=(lab.ctx('native_gap')->>'gap_id')::uuid)",
            started_before_deadline=True)
    checked(cleanup)
    prepare_shared = """SELECT lab.keep('native_gap',lab.archive_gap());
ALTER TABLE rtn_private.news_archive_requests DISABLE TRIGGER archive_columns;
UPDATE rtn_private.news_archive_requests SET deadline_at=clock_timestamp()-interval '1 second' WHERE status='authorized';
ALTER TABLE rtn_private.news_archive_requests ENABLE TRIGGER archive_columns;
UPDATE rtn_private.news_runtime SET next_due_at=clock_timestamp()-interval '1 second',last_enqueued_at=clock_timestamp()-interval '11 minutes';
SELECT public.enqueue_due_rtn_news_check();SELECT lab.keep('native_rss_claim',public.claim_rtn_news_check_v2(NULL));
SELECT public.authorize_rtn_news_rss_get((lab.ctx('native_rss_claim')->>'run_id')::uuid,(lab.ctx('native_rss_claim')->>'lease_token')::uuid,(lab.ctx('native_rss_claim')->>'generation')::bigint,0);"""
    blocked('native archive origin wins later RSS first-appearance race',
            prepare_shared + "SELECT lab.keep('native_rss_payload',jsonb_set(lab.ctx('archive_prior_feed'),'{items}',jsonb_build_array(jsonb_set(lab.archive_item(920,'f'),'{published_at}',to_jsonb(to_char(clock_timestamp()AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'))))));SELECT lab.keep('native_rss_payload',jsonb_set(jsonb_set(lab.ctx('native_rss_payload'),'{response_sha256}',to_jsonb(repeat('f',64))),'{original_path}',to_jsonb('news/rss/'||repeat('f',64)||'.xml')));",
            "SELECT lab.archive_complete(lab.ctx('native_gap'),jsonb_set(lab.archive_page(lab.ctx('native_gap'),920),'{yield_after}','true'))",
            svc + "SELECT public.complete_rtn_news_check((lab.ctx('native_rss_claim')->>'run_id')::uuid,(lab.ctx('native_rss_claim')->>'lease_token')::uuid,lab.ctx('native_rss_payload'));",
            None, "(SELECT historical AND NOT notifiable FROM rtn_private.update_events WHERE canonical_url='https://www.gosnadzor.ru/news/67/920/') AND (SELECT archive_first FROM rtn_private.news_archive_candidates WHERE canonical_url='https://www.gosnadzor.ru/news/67/920/')")
    checked("SELECT lab.archive_anchor(jsonb_build_object('claim',lab.ctx('native_rss_claim'),'payload',lab.ctx('native_rss_payload')));" + cleanup)
    blocked('native archive403 cannot be cleared by an older RSS success after wait',
            prepare_shared,
            "SELECT lab.archive_complete(lab.ctx('native_gap'),'{\"status\":\"error\",\"error_code\":\"RTN_ARCHIVE_HTTP_403\",\"body_bytes_seen\":0,\"byte_limit_exceeded\":false}')",
            svc + "SELECT public.complete_rtn_news_check((lab.ctx('native_rss_claim')->>'run_id')::uuid,(lab.ctx('native_rss_claim')->>'lease_token')::uuid,lab.ctx('archive_prior_feed'));",
            '40001', "public.claim_rtn_news_check_v2(NULL)IS NULL AND (SELECT publisher_blocked_until>clock_timestamp()+interval '23 hours' AND next_due_at>=publisher_blocked_until FROM rtn_private.news_runtime) AND (SELECT last_status='blocked' FROM rtn_private.news_sources)",
            post_check_setup="UPDATE rtn_private.news_check_runs SET attempt_count=3,lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=(lab.ctx('native_rss_claim')->>'run_id')::uuid;")
    (OUT / 'native-concurrency-witnesses.json').write_text(json.dumps(observations, indent=2), encoding='utf-8')
    return observations


if __name__ == '__main__':
    main()
