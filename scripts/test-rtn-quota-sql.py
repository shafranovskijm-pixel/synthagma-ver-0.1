"""Isolated PG17 mixed normal/managed quota tests. Never production Auth/data.

The final erasure-counter test uses a deliberately synthetic erasure-context
adapter, not a claim of end-to-end account erasure; the separate privacy suite
tests the real consent/job adapter. Monetary collectors are never broadened.
"""
import ast
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import time
import uuid

ROOT=Path(__file__).resolve().parents[1]
HERE=ROOT/'supabase/tests/rtn-managed'
OUT=ROOT/'outputs/rtn-quota-native'
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'result.json').write_text(json.dumps({'complete':False,'passed':0,'failed':1}),encoding='utf-8')
if os.environ.get('PGDATABASE')!='rtn_quota_lab_ci' or os.environ.get('PGHOST') not in ('127.0.0.1','::1','localhost'):
    raise SystemExit('REFUSE: dedicated loopback rtn_quota_lab_ci required')
PSQL=os.environ.get('PSQL','psql')
def raw(sql):
    return subprocess.run([PSQL,'-X','-A','-t','-q','-v','ON_ERROR_STOP=1'],input=sql,text=True,encoding='utf-8',capture_output=True)
def run(sql):
    response=raw(sql)
    with (OUT/'native.stdout.txt').open('a',encoding='utf-8')as log:log.write(response.stdout)
    with (OUT/'native.stderr.txt').open('a',encoding='utf-8')as log:log.write(response.stderr)
    if response.returncode:raise RuntimeError(response.stderr[-4000:])
    return response.stdout.strip()
if not run("SELECT current_database(),current_setting('server_version_num');").startswith('rtn_quota_lab_ci|17'):
    raise SystemExit('REFUSE: native PG17 fixture required')
base_runner=ast.parse((ROOT/'scripts/test-rtn-sql.py').read_text())
baseline=next(ast.literal_eval(n.value)for n in base_runner.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='baseline'for t in n.targets))
fixture=(HERE/'fixture.sql').read_text().replace('GRANT CREATE ON DATABASE rtn_lab_ci','GRANT CREATE ON DATABASE rtn_quota_lab_ci')
setup=fixture+'\n'+(HERE/'released-guards.sql').read_text()+'\n'+(HERE/'quota-fixture.sql').read_text()+'\n'+(HERE/'released-quota-sources.sql').read_text()+"""
CREATE TRIGGER enforce_organization_monthly_course_quota AFTER INSERT OR UPDATE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.enforce_organization_monthly_course_quota();
REVOKE ALL ON FUNCTION public._organization_monthly_course_limits(uuid),public.enforce_organization_monthly_course_quota() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_organization_student_capacity(uuid,integer),public.get_organization_training_capacity(uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_organization_student_capacity(uuid,integer),public.get_organization_training_capacity(uuid,integer) TO authenticated,service_role;
"""+baseline+'\n'+(ROOT/'supabase/migrations/20261114120000_rtn_managed_training.sql').read_text()+'\n'+(HERE/'acceptance.sql').read_text()+"""
SELECT lab.keep('quota_abi',(SELECT jsonb_agg(to_jsonb(p)ORDER BY p.oid)FROM pg_proc p WHERE p.oid=ANY(ARRAY['public._organization_monthly_course_limits(uuid)'::regprocedure,'public.enforce_organization_monthly_course_quota()'::regprocedure,'public.get_organization_student_capacity(uuid,integer)'::regprocedure,'public.get_organization_training_capacity(uuid,integer)'::regprocedure])));
"""
run(setup)
run('SET ROLE postgres;\n'+(ROOT/'supabase/migrations/20261114122000_rtn_quota_activity_integration.sql').read_text())
run("SET ROLE postgres;SELECT lab.check('quota original trigger helpers ABI sources ACL unchanged',lab.ctx('quota_abi')=(SELECT jsonb_agg(to_jsonb(p)ORDER BY p.oid)FROM pg_proc p WHERE p.oid=ANY(ARRAY['public._organization_monthly_course_limits(uuid)'::regprocedure,'public.enforce_organization_monthly_course_quota()'::regprocedure,'public.get_organization_student_capacity(uuid,integer)'::regprocedure,'public.get_organization_training_capacity(uuid,integer)'::regprocedure])));")
A='11111111-1111-4111-8111-111111111111';POST='44444444-4444-4444-8444-444444444444'
OWNER='81000000-0000-4000-8000-000000000001';ADMIN='81000000-0000-4000-8000-000000000999';ALICE='81000000-0000-4000-8000-000000000101'
COURSE='93000000-0000-4000-8000-000000000001'
def learner(n):return f'82000000-0000-4000-8000-{n:012}'
def profile(n):return f'72000000-0000-4000-8000-{n:012}'
def session(actor,role='authenticated'):
    uuid.UUID(actor)
    return f"SET ROLE {role};SELECT set_config('request.jwt.claim.role','{role}',false);SELECT set_config('request.jwt.claim.sub','{actor}',false);"
def rpc(actor,sql):return json.loads(run(session(actor)+sql).splitlines()[-1])
def scalar(sql):return run('SET ROLE postgres;'+sql).splitlines()[-1]
def check(name,value):
    if not value:raise AssertionError(name)
    run("SELECT lab.check('"+name.replace("'","''")+"',true);")
def denied(name,actor,sql,detail):
    response=raw(session(actor)+sql)
    check(name,response.returncode!=0 and detail in response.stderr)
def assign(profile_ids,org=A,actor=OWNER):
    ids=','.join("'"+str(uuid.UUID(p))+"'"for p in profile_ids)
    return rpc(actor,f"SELECT public.assign_rtn_training('{org}',(lab.ctx('bank_id')#>>'{{}}')::uuid,ARRAY[{ids}]::uuid[]);")
def normal(user):
    return run(session(OWNER)+f"INSERT INTO public.enrollments(user_id,course_id)VALUES('{user}','{COURSE}')RETURNING id;").splitlines()[-1]
def usage(org=A):return json.loads(scalar(f"SELECT to_jsonb(u)FROM public.organization_monthly_course_usage u WHERE organization_id='{org}' AND month_start=date_trunc('month',statement_timestamp()AT TIME ZONE'Europe/Moscow')::date;"))
def totals(org=A):return json.loads(scalar(f"SELECT coalesce((SELECT to_jsonb(u)FROM rtn_private.monthly_activity_totals u WHERE organization_id='{org}' AND month_start=date_trunc('month',statement_timestamp()AT TIME ZONE'Europe/Moscow')::date),'{{}}'::jsonb);"))
check('installation does not fabricate retrospective monthly usage',scalar('SELECT count(*)FROM public.organization_monthly_course_usage;')=='0')
check('installation does not fabricate actual-study events',scalar('SELECT count(*)FROM rtn_private.activity_events;')=='0')
assign(['71000000-0000-4000-8000-000000000101'])
alice_normal=normal(ALICE)
check('normal plus RTN same learner consumes one monthly seat',usage()['assigned_students']==1)
normal(learner(3));c_assignment=assign([profile(3)])['assignments'][0]['id']
check('normal first and RTN later share same dedupe',usage()['assigned_students']==2)
check('mere staff assignment is not actual study',totals()=={})
run(f"SET ROLE postgres;UPDATE public.organizations SET custom_max_students=3 WHERE id='{A}';")
denied('bulk RTN quota failure rolls back all assignees',OWNER,f"SELECT public.assign_rtn_training('{A}',(lab.ctx('bank_id')#>>'{{}}')::uuid,ARRAY['{profile(4)}','{profile(5)}']::uuid[]);",'STUDENT_ASSIGNMENT_LIMIT_EXCEEDED')
check('bulk failure left no managed or canonical partial rows',usage()['assigned_students']==2 and scalar(f"SELECT count(*)FROM rtn_private.assignments WHERE student_user_id IN('{learner(4)}','{learner(5)}');")=='0')
with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
    outcomes=list(pool.map(lambda operation:operation(),[lambda:normal(learner(5)),lambda:assign([profile(5)])]))
e_normal=outcomes[0];e_assignment=outcomes[1]['assignments'][0]['id']
check('mixed simultaneous same learner reserves once',usage()['assigned_students']==3)
run(f"SET ROLE postgres;UPDATE public.organizations SET custom_max_students=4 WHERE id='{A}';")
def competing(sql):return raw(session(OWNER)+sql)
with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
    contenders=list(pool.map(competing,[f"INSERT INTO public.enrollments(user_id,course_id)VALUES('{learner(6)}','{COURSE}');",f"SELECT public.assign_rtn_training('{A}',(lab.ctx('bank_id')#>>'{{}}')::uuid,ARRAY['{profile(7)}']::uuid[]); "]))
check('mixed normal RTN last seat has exactly one winner',sum(r.returncode==0 for r in contenders)==1 and usage()['assigned_students']==4)
check('losing concurrent assignment reports canonical quota detail',all(r.returncode==0 or'STUDENT_ASSIGNMENT_LIMIT_EXCEEDED'in r.stderr for r in contenders))
check('capacity reader sees shared real counters',rpc(OWNER,f"SELECT to_jsonb(c)FROM public.get_organization_student_capacity('{A}',1)c;")['current_students']==4)
alice_assignment=scalar("SELECT lab.ctx('assignment_id')#>>'{}';")
active=rpc(ALICE,f"SELECT public.start_rtn_attempt('{alice_assignment}');")
rpc(ALICE,f"SELECT public.record_rtn_material_open('{alice_assignment}','{active['release_id']}');")
rpc(ALICE,f"SELECT public.record_rtn_material_open('{alice_assignment}','{active['release_id']}');")
check('genuine material open and start are deduped facts',totals()['active_learners']==1 and totals()['used_banks']==1 and totals()['activity_count']==2)
failed=rpc(ALICE,f"SELECT public.submit_rtn_attempt('{active['attempt_id']}','{{\"q1\":[\"a\"],\"q2\":[\"yes\"]}}');")
check('failed assessment does not consume completed training',not failed['passed'] and usage()['completed_trainings']==0)
run(session(OWNER)+f"UPDATE public.enrollments SET status='completed',completed_at=now()WHERE id='{alice_normal}';")
run(f"SET ROLE postgres;UPDATE public.organizations SET custom_max_trained_per_month=2 WHERE id='{A}';")
for _ in range(2):
    attempt=rpc(ALICE,f"SELECT public.start_rtn_attempt('{alice_assignment}');")
    rpc(ALICE,f"SELECT public.submit_rtn_attempt('{attempt['attempt_id']}','{{\"q1\":[\"b\"],\"q2\":[\"yes\"]}}');")
check('normal completion and successful RTN training share aggregate',usage()['completed_trainings']==2)
check('passed retake does not double charge completion',scalar(f"SELECT count(*)FROM rtn_private.monthly_completions WHERE assignment_id='{alice_assignment}';")=='1')
c_attempt=rpc(learner(3),f"SELECT public.start_rtn_attempt('{c_assignment}');")
before=totals()
denied('new RTN pass respects shared normal completion ceiling',learner(3),f"SELECT public.submit_rtn_attempt('{c_attempt['attempt_id']}','{{\"q1\":[\"b\"],\"q2\":[\"yes\"]}}');",'TRAINING_COMPLETION_LIMIT_EXCEEDED')
check('completion rejection rolls back grade and submit activity',rpc(learner(3),f"SELECT public.get_rtn_attempt('{c_attempt['attempt_id']}');")['status']=='active' and totals()==before)
run(f"SET ROLE postgres;UPDATE public.organizations SET custom_max_trained_per_month=3 WHERE id='{A}';")
rpc(learner(3),f"SELECT public.submit_rtn_attempt('{c_attempt['attempt_id']}','{{\"q1\":[\"b\"],\"q2\":[\"yes\"]}}');")
check('later available capacity completes same frozen attempt',usage()['completed_trainings']==3)
before_seats=usage()['assigned_students'];rpc(ALICE,f"SELECT public.start_rtn_attempt('{alice_assignment}');")
check('learner self resume never creates staff monthly assignment',usage()['assigned_students']==before_seats)
# Two distinct trainings for the same learner still consume two training
# slots; only the student-assignment quota deduplicates them by learner.
run(f"SET ROLE postgres;UPDATE public.organizations SET custom_max_trained_per_month=4 WHERE id='{A}';")
e_attempt=rpc(learner(5),f"SELECT public.start_rtn_attempt('{e_assignment}');")
with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
    completion_race=list(pool.map(lambda item:raw(session(item[0])+item[1]),[
        (OWNER,f"UPDATE public.enrollments SET status='completed',completed_at=now()WHERE id='{e_normal}';"),
        (learner(5),f"SELECT public.submit_rtn_attempt('{e_attempt['attempt_id']}','{{\"q1\":[\"b\"],\"q2\":[\"yes\"]}}');")]))
check('mixed normal managed last completion has one atomic winner',sum(r.returncode==0 for r in completion_race)==1 and usage()['completed_trainings']==4)
check('losing completion retains canonical quota detail',all(r.returncode==0 or'TRAINING_COMPLETION_LIMIT_EXCEEDED'in r.stderr for r in completion_race))
# Model a real stable assignment that already existed last Moscow month. A
# fresh staff action counts now, while a same-month network retry does not.
run(f"""SET ROLE postgres;UPDATE public.organizations SET custom_max_students=5 WHERE id='{A}';
INSERT INTO rtn_private.assignments(organization_id,bank_id,student_id,student_user_id,assigned_by,assigned_at)VALUES('{A}',(lab.ctx('bank_id')#>>'{{}}')::uuid,'{profile(9)}','{learner(9)}','{OWNER}',now()-interval'1 month');
INSERT INTO public.organization_monthly_course_usage VALUES('{A}',(date_trunc('month',statement_timestamp()AT TIME ZONE'Europe/Moscow')-interval'1 month')::date,1,0);
INSERT INTO public.organization_monthly_student_assignments VALUES('{A}',(date_trunc('month',statement_timestamp()AT TIME ZONE'Europe/Moscow')-interval'1 month')::date,'{learner(9)}',now()-interval'1 month','assignment');
""")
reassigned=assign([profile(9)]);assign([profile(9)])
check('new-month explicit staff assignment counts stable existing row once',reassigned['replayed'] and usage()['assigned_students']==5)
check('new month never rewrites prior month counters',scalar(f"SELECT assigned_students FROM public.organization_monthly_course_usage WHERE organization_id='{A}' AND month_start=(date_trunc('month',statement_timestamp()AT TIME ZONE'Europe/Moscow')-interval'1 month')::date;")=='1')
run(f"SET ROLE postgres;INSERT INTO public.organization_monthly_course_usage VALUES('{POST}',date_trunc('month',statement_timestamp()AT TIME ZONE'Europe/Moscow')::date,999,999);")
post_assignment=assign([profile(8)],POST,ADMIN)['assignments'][0]['id']
post_attempt=rpc(learner(8),f"SELECT public.start_rtn_attempt('{post_assignment}');")
rpc(learner(8),f"SELECT public.submit_rtn_attempt('{post_attempt['attempt_id']}','{{\"q1\":[\"b\"],\"q2\":[\"yes\"]}}');")
check('valid postpaid remains unlimited for seats and completions',usage(POST)['assigned_students']==1000 and usage(POST)['completed_trainings']==1000)
check('postpaid terms and invoice amounts unchanged',scalar("SELECT count(*)=1 AND sum(amount)=6990 AND min(status)='paid'FROM public.subscription_invoices;")=='t')
# A real erasure transaction holds the canonical subject lock before touching
# attempt rows. Prove submit waits there without taking an inverse row lock.
erase_attempt=rpc(learner(3),f"SELECT public.start_rtn_attempt('{c_assignment}');")
blocker=subprocess.Popen([PSQL,'-X','-A','-t','-q','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8')
def marker(expected):
    for line in blocker.stdout:
        if line.strip()==expected:return True
    return False
blocker.stdin.write(f"SET ROLE postgres;BEGIN;SELECT pg_advisory_xact_lock(hashtextextended('{learner(3)}',42007));INSERT INTO public.account_deletion_revocations VALUES('{learner(3)}');SELECT 'RTN_ERASURE_SUBJECT_HELD';\n");blocker.stdin.flush()
with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
    try:
        if not pool.submit(marker,'RTN_ERASURE_SUBJECT_HELD').result(timeout=10):raise AssertionError('erasure fixture subject lock unavailable')
        pending=pool.submit(raw,"SET application_name='rtn_submit_erasure_race';"+session(learner(3))+f"SELECT public.submit_rtn_attempt('{erase_attempt['attempt_id']}','{{\"q1\":[\"b\"],\"q2\":[\"yes\"]}}');")
        waiting=False;deadline=time.monotonic()+8;observed_wait=[]
        while time.monotonic()<deadline:
            # Observe through the fixture bootstrap login. SET ROLE postgres
            # intentionally has NOSUPERUSER and cannot inspect another login's
            # pg_stat_activity wait events, even though its BYPASSRLS is valid
            # for the application-table assertions elsewhere in this runner.
            observed_wait=json.loads(run("SELECT coalesce(jsonb_agg(jsonb_build_object('wait_event_type',wait_event_type,'wait_event',wait_event)),'[]'::jsonb)FROM pg_stat_activity WHERE application_name='rtn_submit_erasure_race';"))
            if any(row['wait_event_type']=='Lock' and row['wait_event']=='advisory'for row in observed_wait):waiting=True;break
            time.sleep(.02)
        blocker.stdin.write(f"SELECT id FROM rtn_private.attempts WHERE id='{erase_attempt['attempt_id']}'FOR UPDATE;SELECT 'RTN_ERASURE_ATTEMPT_HELD';\n");blocker.stdin.flush()
        acquired=pool.submit(marker,'RTN_ERASURE_ATTEMPT_HELD').result(timeout=10)
        blocker.stdin.write('COMMIT;\n\\q\n');blocker.stdin.flush();_,block_error=blocker.communicate(timeout=10)
        rejected=pending.result(timeout=10)
        (OUT/'submit-erasure-lock-observation.json').write_text(json.dumps({'observer':'fixture_bootstrap_login','observed_wait':observed_wait,'advisory_wait_observed':waiting,'erasure_attempt_row_lock_acquired':acquired,'erasure_exit_code':blocker.returncode,'submit_exit_code':rejected.returncode,'submit_rejected_after_revocation':'rtn_learner_assignment_required'in rejected.stderr},indent=2),encoding='utf-8')
        check('submit erasure lock order has no attempt subject inversion',waiting and acquired and not blocker.returncode and rejected.returncode!=0 and'rtn_learner_assignment_required'in rejected.stderr)
    finally:
        if blocker.poll()is None:blocker.kill();blocker.wait(timeout=5)
run(f"SET ROLE postgres;DELETE FROM public.account_deletion_revocations WHERE user_id='{learner(3)}';")
# Real privacy integration is tested separately. This narrow fixture adapter
# proves only the counters/dedupe boundary of the owner-only quota cleanup.
run("""SET ROLE postgres;CREATE FUNCTION rtn_private.erasure_allowed(p_user uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$SELECT auth.role()='service_role' AND current_setting('rtn.quota_fixture_erasure_user',true)=p_user::text AND EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=p_user)$$;
REVOKE ALL ON FUNCTION rtn_private.erasure_allowed(uuid)FROM PUBLIC,anon,authenticated,service_role;
""")
before_usage=usage();before_totals=totals()
denied('ordinary user cannot call personal quota erasure adapter',ALICE,f"SELECT rtn_private.erase_personal_usage('{ALICE}');",'permission denied')
run(f"SET ROLE postgres;BEGIN;INSERT INTO public.account_deletion_revocations VALUES('{ALICE}');SELECT set_config('request.jwt.claim.role','service_role',false);SELECT set_config('rtn.quota_fixture_erasure_user','{ALICE}',true);SELECT rtn_private.erase_personal_usage('{ALICE}');DELETE FROM public.organization_monthly_student_assignments WHERE user_id='{ALICE}';DELETE FROM public.organization_monthly_training_completions WHERE user_id='{ALICE}';COMMIT;")
check('erasing personal dedupe never refunds anonymous quotas',usage()==before_usage)
check('erasing personal events never rewrites anonymous activity totals',totals()==before_totals)
check('target personal usage rows erased only',scalar(f"SELECT (SELECT count(*)FROM rtn_private.activity_events WHERE learner_id='{ALICE}')+(SELECT count(*)FROM rtn_private.monthly_completions WHERE user_id='{ALICE}')+(SELECT count(*)FROM rtn_private.monthly_active_learners WHERE user_id='{ALICE}');")=='0' and scalar(f"SELECT count(*)FROM rtn_private.activity_events WHERE learner_id='{learner(3)}';")!='0')
receipt=json.loads(scalar("SELECT json_build_object('complete',true,'passed',count(*),'failed',0,'checks',json_agg(name ORDER BY name))FROM lab.results;"))
receipt['scope']='isolated PG17 exact old quota trigger + real RTN RPC integration; erasure context adapter synthetic, monetary collector unchanged'
receipt['mixed_concurrent_connections']=2
(OUT/'result.json').write_text(json.dumps(receipt,indent=2,ensure_ascii=False),encoding='utf-8')
print(f"RTN mixed monthly quota PostgreSQL17: {receipt['passed']} PASS / 0 FAIL")
