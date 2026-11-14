"""Native PG17 normative admission after the exact 220/225/230 migrations.

Synthetic users/source bytes, captured existing guards/erasure code, empty
adapters for unrelated legacy domains. No production database/Auth operation.
"""
import ast
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time

ROOT=Path(__file__).resolve().parents[1]
HERE=ROOT/'supabase/tests/rtn-freshness'
OUT=ROOT/'outputs/rtn-freshness-native'
OUT.mkdir(parents=True,exist_ok=True)
SCOPE='native PostgreSQL17 synthetic fixture; exact RTN quota/draft/privacy code and captured legacy guards; not production Auth acceptance'
(OUT/'result.json').write_text(json.dumps({'complete':False,'scope':SCOPE}),encoding='utf-8')
if os.environ.get('PGDATABASE')!='rtn_freshness_lab_ci' or os.environ.get('PGHOST') not in('127.0.0.1','::1','localhost'):
    raise SystemExit('REFUSE: dedicated loopback rtn_freshness_lab_ci required')
PSQL=os.environ.get('PSQL','psql')
def raw(sql):
    return subprocess.run([PSQL,'-X','-A','-t','-q','-v','ON_ERROR_STOP=1'],input=sql,text=True,encoding='utf-8',capture_output=True)
def run(sql):
    response=raw(sql)
    with(OUT/'native.stdout.txt').open('a',encoding='utf-8')as log:log.write(response.stdout)
    with(OUT/'native.stderr.txt').open('a',encoding='utf-8')as log:log.write(response.stderr)
    if response.returncode:raise RuntimeError(response.stderr[-6000:])
    return response.stdout.strip()
def read(path):return(ROOT/path).read_text(encoding='utf-8')
if not run("SELECT current_database(),current_setting('server_version_num');").startswith('rtn_freshness_lab_ci|17'):
    raise SystemExit('REFUSE: native PG17 fixture required')

# Reuse only the privacy lane's setup builder (core -> provider1215 -> quota ->
# drafts), without executing its module,
# creating an erasure request or resetting/touching the separate privacy lab.
tree=ast.parse(read('supabase/tests/rtn-account-erasure/run.py'))
builder=next(node for node in tree.body if isinstance(node,ast.FunctionDef)and node.name=='build_setup')
context={'ROOT':ROOT,'HERE':ROOT/'supabase/tests/rtn-account-erasure','re':re}
exec(compile(ast.fix_missing_locations(ast.Module(body=[builder],type_ignores=[])),'<reviewed-privacy-fixture-builder>','exec'),context)
setup=context['build_setup']().replace('DATABASE rtn_erasure_lab_ci','DATABASE rtn_freshness_lab_ci')
run(setup)
run('SET ROLE postgres;BEGIN;\n'+read('supabase/migrations/20261114123000_rtn_account_erasure.sql')+'\nCOMMIT;\n')
run((HERE/'seed.sql').read_text(encoding='utf-8'))
# The provider wraps each source payload atomically; native psql emulates it.
migration='BEGIN;\n'+read('supabase/migrations/20261114124000_rtn_normative_review_admission.sql')+'\nCOMMIT;\n'
run('SET ROLE postgres;ALTER FUNCTION public.get_rtn_workspace(uuid) SET search_path=public;')
refused=raw('SET ROLE postgres;'+migration)
if not refused.returncode or'RTN_NORMATIVE_PREIMAGE_OR_AUTHORITY_CHANGED'not in refused.stderr:
    raise AssertionError('Drifted 240 preimage was not refused: '+refused.stderr)
run("SET ROLE postgres;SELECT lab.check('freshness: preimage drift rolls back entire migration',NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='rtn_private' AND table_name='key_sets' AND column_name='normative_cutoff_at') AND to_regprocedure('rtn_private.normative_bounds(jsonb,jsonb)')IS NULL);ALTER FUNCTION public.get_rtn_workspace(uuid) SET search_path=pg_catalog,public;")
run('SET ROLE postgres;'+migration)
# Readiness-only121 runs AFTER the complete reviewed schema. This fixture has
# neither Vault nor cron: the payload must not need or create either service.
run('SET ROLE postgres;BEGIN;\n'+read('supabase/migrations/20261114121000_rtn_source_scheduler.sql')+'\nCOMMIT;\n')
run((HERE/'acceptance.sql').read_text(encoding='utf-8'))

ADMIN='81000000-0000-4000-8000-000000000999'
OWNER='81000000-0000-4000-8000-000000000001'
ALICE='81000000-0000-4000-8000-000000000101'
ORG='11111111-1111-4111-8111-111111111111'
def auth(actor):
    return f"SET ROLE authenticated;SELECT set_config('request.jwt.claim.role','authenticated',false);SELECT set_config('request.jwt.claim.sub','{actor}',false);"
evidence=[]
for kind in('assignment','attempt'):
    # A normal reviewed fresh release is the visible latest edition before
    # each admission starts; no private mutation renews its deadline.
    run(auth(ADMIN)+f"SELECT lab.keep('race_recovery_{kind}',public.review_rtn_keys((lab.ctx('bank_id')#>>'{{}}')::uuid,(lab.ctx('bank_revision_id')#>>'{{}}')::uuid,lab.ctx('keys'),'Synthetic fresh recovery before {kind} race',lab.ctx('module_fresh')));SELECT public.publish_rtn_release((lab.ctx('race_recovery_{kind}')->>'key_set_id')::uuid,(now()AT TIME ZONE'Europe/Moscow')::date,'Synthetic fresh recovery release {kind}');")
    before=run("SET ROLE postgres;SELECT jsonb_build_object('attempts',(SELECT jsonb_agg(x ORDER BY id)FROM rtn_private.attempts x),'assignments',(SELECT jsonb_agg(x ORDER BY id)FROM rtn_private.assignments x),'usage',(SELECT jsonb_agg(x ORDER BY organization_id,month_start)FROM public.organization_monthly_course_usage x));")
    blocker=subprocess.Popen([PSQL,'-X','-A','-t','-q','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8')
    pool=concurrent.futures.ThreadPoolExecutor(max_workers=2)
    def marker():
        for line in blocker.stdout:
            if line.strip()=='RTN_NORMATIVE_ORGANIZATION_HELD':return True
        return False
    try:
        blocker.stdin.write(f"SET ROLE postgres;BEGIN;SET LOCAL statement_timeout='15s';SELECT pg_advisory_xact_lock(hashtextextended('{ORG}',42));SELECT 'RTN_NORMATIVE_ORGANIZATION_HELD';\n");blocker.stdin.flush()
        if not pool.submit(marker).result(timeout=10):raise AssertionError('Fixture organization lock unavailable')
        operation=(f"SELECT public.assign_rtn_training('{ORG}',(lab.ctx('bank_id')#>>'{{}}')::uuid,ARRAY['71000000-0000-4000-8000-000000000101']::uuid[]);"if kind=='assignment'else"SELECT public.start_rtn_attempt((lab.ctx('assignment_id')#>>'{}')::uuid);")
        pending=pool.submit(raw,f"SET application_name='rtn_normative_{kind}_race';SET statement_timeout='15s';"+auth(OWNER if kind=='assignment'else ALICE)+operation)
        waited=False;deadline=time.monotonic()+8;observed=[]
        while time.monotonic()<deadline:
            # Bootstrap-only observer can see the other login's wait events.
            observed=json.loads(run(f"SELECT coalesce(jsonb_agg(jsonb_build_object('wait_event_type',wait_event_type,'wait_event',wait_event)),'[]')FROM pg_stat_activity WHERE application_name='rtn_normative_{kind}_race';"))
            if any(row['wait_event_type']=='Lock'and row['wait_event']=='advisory'for row in observed):waited=True;break
            if pending.done():break
            time.sleep(.02)
        # Real key review is allowed to record historical facts. Only this
        # isolated fixture inserts a historical publication which has since
        # expired, simulating time's passage while admission waits. The actual
        # publishing API independently rejects that expired package above.
        commit_sql=auth(ADMIN)+f"SELECT lab.keep('race_expired_{kind}',public.review_rtn_keys((lab.ctx('bank_id')#>>'{{}}')::uuid,(lab.ctx('bank_revision_id')#>>'{{}}')::uuid,lab.ctx('keys'),'Synthetic historical expired race {kind}',jsonb_set(lab.ctx('module'),'{{review_before}}',to_jsonb(((now()AT TIME ZONE'Europe/Moscow')::date-1)::text))));SET ROLE postgres;INSERT INTO rtn_private.releases(bank_id,key_set_id,effective_from,release_note,published_by,published_at)VALUES((lab.ctx('bank_id')#>>'{{}}')::uuid,(lab.ctx('race_expired_{kind}')->>'key_set_id')::uuid,(now()AT TIME ZONE'Europe/Moscow')::date,'Synthetic historical latest expiry {kind}','{ADMIN}',clock_timestamp());COMMIT;\n\\q\n"
        blocker.stdin.write(commit_sql);blocker.stdin.flush();_,block_error=blocker.communicate(timeout=12)
        rejected=pending.result(timeout=12)
        entry={'kind':kind,'observed_advisory_wait':waited,'observed':observed,'blocker_exit_code':blocker.returncode,'operation_exit_code':rejected.returncode,'operation_stderr':rejected.stderr}
        evidence.append(entry);(OUT/'admission-edition-races.json').write_text(json.dumps(evidence,indent=2),encoding='utf-8')
        if not waited or blocker.returncode or not rejected.returncode or'rtn_normative_review_required'not in rejected.stderr:
            raise AssertionError('Admission did not recheck the newest edition after canonical lock: '+block_error+rejected.stderr)
        after=run("SET ROLE postgres;SELECT jsonb_build_object('attempts',(SELECT jsonb_agg(x ORDER BY id)FROM rtn_private.attempts x),'assignments',(SELECT jsonb_agg(x ORDER BY id)FROM rtn_private.assignments x),'usage',(SELECT jsonb_agg(x ORDER BY organization_id,month_start)FROM public.organization_monthly_course_usage x));")
        if before!=after:raise AssertionError('Refused admission changed attempts/assignments/quota')
        run(f"SELECT lab.check('freshness: {kind} rechecks newest expired edition after real canonical lock wait',true);")
    finally:
        if blocker.poll()is None:blocker.kill();blocker.wait(timeout=5)
        pool.shutdown(wait=True,cancel_futures=True)

run((HERE/'reviewer-erasure.sql').read_text(encoding='utf-8'))
receipt=json.loads(run("SELECT jsonb_build_object('passed',count(*),'failed',0,'checks',jsonb_agg(name ORDER BY name))FROM lab.results;"))
receipt.update({'complete':True,'scope':SCOPE})
(OUT/'result.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
manifest={str(p.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest()for p in[ROOT/'supabase/migrations/20261114124000_rtn_normative_review_admission.sql',ROOT/'supabase/migrations/20261114121000_rtn_source_scheduler.sql',Path(__file__).resolve(),HERE/'seed.sql',HERE/'acceptance.sql',HERE/'reviewer-erasure.sql']}
(OUT/'source-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(f"{receipt['passed']} PASS: {SCOPE}; actual post-lock edition races PASS")
