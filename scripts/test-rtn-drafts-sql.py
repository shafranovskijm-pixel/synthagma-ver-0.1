"""Isolated native PG17 draft/CAS checks; actual auth is synthetic.

The RTN source/attempt migration and captured released guards run unchanged.
Activity accounting is an explicit recording adapter here, independently tested
with the real implementation in the RTN quota lane. No production connection.
"""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'outputs/rtn-drafts-native'
OUT.mkdir(parents=True, exist_ok=True)
if os.environ.get('PGDATABASE') != 'rtn_lab_ci' or os.environ.get('PGHOST') not in ('127.0.0.1', '::1', 'localhost'):
    raise SystemExit('REFUSE: dedicated loopback rtn_lab_ci required')

def run(sql):
    return subprocess.run([os.environ.get('PSQL', 'psql'), '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, encoding='utf-8', capture_output=True)

probe = run("SELECT current_database(),current_setting('server_version_num');")
if probe.returncode or not probe.stdout.strip().startswith('rtn_lab_ci|17'):
    raise SystemExit('REFUSE: dedicated native PostgreSQL17 lab required')
read = lambda path: (ROOT / path).read_text(encoding='utf-8')
baseline = """SELECT lab.keep('old_data',(SELECT jsonb_build_array((SELECT jsonb_agg(c)FROM public.courses c),(SELECT jsonb_agg(t)FROM public.test_attempts t),(SELECT jsonb_agg(i)FROM public.subscription_invoices i))));
SELECT lab.keep('guard_metadata',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='billing_access_private' OR(n.nspname='public' AND p.proname IN('account_deletion_access_allowed','can_access_organization','has_role','is_student_profile','has_org_staff_permission','get_org_staff_permissions','normalize_org_staff_permission','org_role_default_permissions','has_active_postpaid_agreement','postpaid_is_admin'))));
SELECT lab.keep('storage_policy_metadata',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p WHERE polrelid='storage.objects'::regclass));"""
adapter = """SET ROLE postgres;
CREATE TABLE lab.draft_activity_calls(assignment_id uuid,attempt_id uuid,release_id uuid,kind text);
CREATE FUNCTION rtn_private.record_activity(uuid,uuid,uuid,text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$BEGIN INSERT INTO lab.draft_activity_calls VALUES($1,$2,$3,$4);RETURN true;END;$$;
REVOKE ALL ON FUNCTION rtn_private.record_activity(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;"""
sql = '\n'.join([read('supabase/tests/rtn-managed/fixture.sql'), read('supabase/tests/rtn-managed/released-guards.sql'), baseline,
                 read('supabase/migrations/20261114120000_rtn_managed_training.sql'), read('supabase/tests/rtn-managed/acceptance.sql'),
                 adapter, read('supabase/migrations/20261114122500_rtn_attempt_drafts.sql'), read('supabase/tests/rtn-drafts/acceptance.sql')])
result = run(sql)
(OUT / 'stdout.txt').write_text(result.stdout, encoding='utf-8')
(OUT / 'stderr.txt').write_text(result.stderr, encoding='utf-8')
if result.returncode:
    raise SystemExit(result.stderr[-5000:])
student = "SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false);SELECT set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000101',false);"

def save(name):
    return run(student + f"SELECT public.save_rtn_attempt_draft((lab.ctx('draft_attempt_id')#>>'{{}}')::uuid,lab.ctx('{name}'),2);")

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    responses = list(pool.map(save, ['draft_answers', 'draft_other_answers']))
if sum(r.returncode == 0 for r in responses) != 1 or not any('rtn_draft_revision_conflict' in r.stderr for r in responses):
    raise AssertionError('Competing draft devices did not produce one winner / one stale CAS refusal')
after = run(student + "SELECT lab.check('draft: two devices cannot silently overwrite one another',(public.get_rtn_attempt_draft((lab.ctx('draft_attempt_id')#>>'{}')::uuid)->>'revision')::integer=3);SELECT public.submit_rtn_attempt((lab.ctx('draft_attempt_id')#>>'{}')::uuid,'{\"q1\":[\"b\"],\"q2\":[\"yes\"]}');SELECT lab.check('draft: final submission overrides a different earlier draft',public.get_rtn_attempt_draft((lab.ctx('draft_attempt_id')#>>'{}')::uuid)->'answers'='{\"q1\":[\"b\"],\"q2\":[\"yes\"]}'::jsonb);SELECT lab.check('draft: late autosave returns frozen submitted answers',public.save_rtn_attempt_draft((lab.ctx('draft_attempt_id')#>>'{}')::uuid,lab.ctx('draft_answers'),3)->>'status'='submitted');")
if after.returncode:
    raise SystemExit(after.stderr)
race_evidence = []
for first_kind in ('save', 'submit'):
    created = run(student + "SELECT public.start_rtn_attempt((lab.ctx('assignment_id')#>>'{}')::uuid)->>'attempt_id';")
    if created.returncode:
        raise SystemExit(created.stderr)
    attempt_id = created.stdout.strip().splitlines()[-1]
    final = "'{\"q1\":[\"b\"],\"q2\":[\"yes\"]}'::jsonb"
    save_sql = f"SELECT public.save_rtn_attempt_draft('{attempt_id}',lab.ctx('draft_answers'),0);"
    submit_sql = f"SELECT public.submit_rtn_attempt('{attempt_id}',{final});"
    first_sql, second_sql = (save_sql, submit_sql) if first_kind == 'save' else (submit_sql, save_sql)
    first_name, second_name = f'rtn_draft_{first_kind}_first', f'rtn_draft_{first_kind}_second'
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(run, student + f"SET application_name='{first_name}';BEGIN;" + first_sql + "SELECT pg_sleep(3);COMMIT;")
        deadline = time.monotonic() + 2.5
        holding = False
        while time.monotonic() < deadline:
            observed = run(f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{first_name}' AND wait_event='PgSleep';")
            if observed.returncode == 0 and observed.stdout.strip() == '1':
                holding = True
                break
            time.sleep(.025)
        if not holding:
            raise AssertionError('First genuine transaction did not reach its row-lock holding point')
        second = pool.submit(run, student + f"SET application_name='{second_name}';" + second_sql)
        blocked = False
        while time.monotonic() < deadline:
            observed = run(f"SELECT count(*) FROM pg_stat_activity WHERE application_name='{second_name}' AND wait_event_type='Lock';")
            if observed.returncode == 0 and observed.stdout.strip() == '1':
                blocked = True
                break
            time.sleep(.025)
        outcomes = [first.result(), second.result()]
    race_evidence.append({'first': first_kind, 'attempt_id': attempt_id, 'observed_second_lock_wait': blocked,
                          'results': [{'returncode': item.returncode, 'stdout': item.stdout, 'stderr': item.stderr} for item in outcomes]})
    (OUT / 'finalization-races.json').write_text(json.dumps(race_evidence, indent=2), encoding='utf-8')
    if not blocked or any(item.returncode for item in outcomes):
        raise AssertionError('Real finalize/autosave race failed; see finalization-races.json')
    checked = run(student + f"SELECT lab.check('draft: {first_kind}-first concurrent finalization preserves exact final answers',public.get_rtn_attempt_draft('{attempt_id}')->'answers'={final} AND public.get_rtn_attempt_draft('{attempt_id}')->>'status'='submitted');")
    if checked.returncode:
        raise SystemExit(checked.stderr)
summary = run("SET ROLE postgres;SELECT json_build_object('scope','native PG17 synthetic auth; activity recording adapter; not production Auth acceptance','complete',true,'draft_checks',count(*) FILTER(WHERE name LIKE 'draft:%'),'all_including_overlapping_core_checks',count(*),'checks',json_agg(name ORDER BY name))FROM lab.results;")
if summary.returncode:
    raise SystemExit(summary.stderr)
receipt = json.loads(summary.stdout.strip().splitlines()[-1])
(OUT / 'result.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
print(f"RTN draft native PG17: {receipt['draft_checks']} draft checks PASS; two-device CAS PASS")
