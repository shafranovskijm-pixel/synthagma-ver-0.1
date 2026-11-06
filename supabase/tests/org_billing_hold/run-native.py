"""Disposable PostgreSQL17 verification; no project credentials or live access.
Only synthetic sessions in this dedicated fixture use request.jwt.claim.*.
"""
import concurrent.futures,json,pathlib,re,uuid
import psycopg

ROOT=pathlib.Path(__file__).resolve().parents[3];HERE=pathlib.Path(__file__).resolve().parent
MIGRATION=ROOT/'supabase/migrations/20261106120000_organization_billing_hold.sql'
OUT=ROOT/'outputs/organization-billing-hold-native'
A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
CA='aaaaaaaa-0000-4000-8000-000000000001';CB='bbbbbbbb-0000-4000-8000-000000000001'
def ident(n):return str(uuid.UUID(int=(0x40008000000000000000|n)))
OWNER=ident(1);ADMIN=ident(10);OB=ident(11);SB=ident(12);STAFF=ident(13);REVOKED=ident(14)
LEARNERS=[ident(n)for n in range(101,118)];TARGET=[OWNER]+LEARNERS
SIGS=['account_deletion_access_allowed()','can_access_organization(uuid,text)','is_user_blocked(uuid)',
      'has_role(app_role,uuid)','has_role(uuid,app_role)','can_access_course_as_learner(uuid)','get_user_role(uuid)',
      'is_org_owner(uuid,uuid)','has_org_staff_permission(uuid,uuid,text)']
RESULTS=[]
def check(name,value):
    assert value,name
    RESULTS.append({'name':name,'passed':True})
def connect(actor=None,role=None):
    c=psycopg.connect(autocommit=True)
    db,addr,ver=c.execute("select current_database(),inet_server_addr()::text,current_setting('server_version_num')::int").fetchone()
    if db!='org_billing_hold_lab_ci'or addr not in('127.0.0.1','::1')or not 170000<=ver<180000:
        c.close();raise RuntimeError('REFUSE: dedicated loopback org_billing_hold_lab_ci on PostgreSQL17 required')
    if actor:c.execute("select set_config('request.jwt.claim.sub',%s,false)",(actor,))
    if role:
        assert role in('anon','authenticated','service_role')
        c.execute("select set_config('request.jwt.claim.role',%s,false)",(role,));c.execute('set role '+role)
    return c
def get(actor=ADMIN,org=A,role='authenticated'):
    with connect(actor,role)as c:return c.execute('select public.get_organization_billing_hold(%s)',(org,)).fetchone()[0]
def set_hold(action,request,expected=None,reason=None,actor=ADMIN,org=A,role='authenticated'):
    with connect(actor,role)as c:return c.execute('select public.set_organization_billing_hold(%s,%s,%s,%s,%s)',(org,request,action,expected,reason)).fetchone()[0]
def denied(name,operation,state='42501',message=None):
    try:operation()
    except psycopg.Error as e:
        check(name,e.sqlstate==state and(message is None or message in str(e)));return
    raise AssertionError(name+' unexpectedly succeeded')
def query(actor,sql,params=(),role='authenticated'):
    with connect(actor,role)as c:return c.execute(sql,params).fetchall()
def metadata(c):
    return c.execute("""select jsonb_object_agg(p.oid::regprocedure::text,to_jsonb(p)-array['prosrc','probin','prosqlbody'])
      from pg_proc p where p.oid=any(%s::regprocedure[])""",(['public.'+s for s in SIGS],)).fetchone()[0]
def old_data(c):
    tables=['organizations','profiles','user_roles','org_staff','account_deletion_revocations','courses','course_modules',
            'enrollments','lesson_progress','test_attempts','subscription_invoices','contracts']
    return {t:c.execute("select md5(coalesce(jsonb_agg(v order by v::text),'[]'::jsonb)::text)from(select to_jsonb(t)v from public."+t+' t)x').fetchone()[0]for t in tables}
def counts():
    with connect()as c:return c.execute('select(select count(*)from billing_access_private.holds),(select count(*)from billing_access_private.active_holds),(select count(*)from billing_access_private.events)').fetchone()
def service_access(org):return query(None,'select public.organization_billing_access_allowed(%s)',(org,),'service_role')[0][0]

with connect()as c:
    check('dedicated empty fixture',c.execute("select count(*)from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'and c.relkind='r'").fetchone()[0]==0)
    c.execute((HERE/'fixture.sql').read_text());c.execute((HERE/'released-sources.sql').read_text())
    for org,name in[(A,'Synthetic target'),(B,'Synthetic unaffected')]:
        c.execute("insert into organizations values(%s,%s,false,null,'start')",(org,name))
    for actor,org,role in[(OWNER,A,'organization'),(ADMIN,A,'admin'),(OB,B,'organization'),(SB,B,'student'),(STAFF,B,'student'),(REVOKED,B,'student')]+[(s,A,'student')for s in LEARNERS]:
        c.execute('insert into profiles values(%s,%s,null,%s)',(actor,org,'Synthetic'))
        c.execute('insert into user_roles(user_id,role)values(%s,%s)',(actor,role))
    for org in(A,B):c.execute("insert into org_staff(user_id,organization_id,role,sections_access)values(%s,%s,'teacher','[\"settings.read\",\"courses.read\",\"documents.read\"]')",(STAFF,org))
    c.execute('insert into account_deletion_revocations values(%s)',(REVOKED,))
    for course,org in[(CA,A),(CB,B)]:
        c.execute("insert into courses(id,organization_id,is_published,title)values(%s,%s,true,'Synthetic content')",(course,org))
        c.execute("insert into course_modules values(%s,%s,'Module',1)",(str(uuid.uuid4()),course))
    for actor,course in[(s,CA)for s in LEARNERS]+[(SB,CB)]:
        c.execute("insert into enrollments values(%s,%s,%s,'active',null)",(str(uuid.uuid4()),actor,course))
        c.execute('insert into lesson_progress values(%s,%s,%s,80)',(str(uuid.uuid4()),actor,A if course==CA else B))
        c.execute('insert into test_attempts values(%s,%s,91,\'{"historical":true}\')',(str(uuid.uuid4()),actor))
    c.execute("insert into subscription_invoices values(%s,%s,3000,'paid')",(str(uuid.uuid4()),A))
    c.execute('insert into contracts values(%s,%s,15000)',(str(uuid.uuid4()),A))
    c.execute((HERE/'policies.sql').read_text())
    BEFORE=old_data(c);ABI_BEFORE=metadata(c)
    check('actual owner model: non-superuser BYPASSRLS',c.execute("select not rolsuper and rolbypassrls from pg_roles where rolname='postgres'").fetchone()[0])
    source=(HERE/'released-sources.sql').read_text()
    old_block=re.search(r'CREATE OR REPLACE FUNCTION public\.is_user_blocked\b.*?\$function\$;',source,re.S).group(0)
    c.execute(old_block.replace('SELECT EXISTS','SELECT false AND EXISTS'))
    denied('exact source CAS refuses drift',lambda:c.execute(MIGRATION.read_text()),'P0001','billing_hold_source_changed')
    c.execute('rollback')
    check('failed CAS created zero private objects',c.execute("select to_regnamespace('billing_access_private')is null").fetchone()[0])
    c.execute(old_block)
    check('failed CAS preserved old data',old_data(c)==BEFORE)
    c.execute(MIGRATION.read_text())
    check('nine existing ABI/OID/owner/ACL configurations exact',metadata(c)==ABI_BEFORE)
    check('installation applies no hold',counts()==(0,0,0))
    check('installation preserves old data',old_data(c)==BEFORE)
    check('DDL grant wrapper ran',c.execute('select count(*)>0 from lab_ddl_events').fetchone()[0])
    check('new private function ACLs remove observer/PUBLIC default grants',c.execute("""select not exists(
      select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a
      where n.nspname='billing_access_private'and a.grantee<>p.proowner)""").fetchone()[0])
    check('new private table ACLs remove observer default grants',c.execute("""select not exists(
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a
      where n.nspname='billing_access_private'and c.relkind='r'and a.grantee<>c.relowner)""").fetchone()[0])

for role in('anon','authenticated','service_role'):
    actor=LEARNERS[0]if role=='authenticated'else None
    denied('private table denied '+role,lambda:query(actor,'select *from billing_access_private.active_holds',role=role))
    denied('private helper denied '+role,lambda:query(actor,'select billing_access_private.actor_allowed(%s)',(OWNER,),role))
for actor,role in[(None,'anon'),(LEARNERS[0],'authenticated'),(None,'service_role')]:
    denied('getter runtime/ACL denied '+role,lambda:get(actor,role=role))
    denied('setter runtime/ACL denied '+role,lambda:set_hold('hold',str(uuid.uuid4()),reason='Synthetic',actor=actor,role=role))
for role,actor in[('anon',None),('authenticated',ADMIN)]:
    denied('registration gate service-only '+role,lambda:query(actor,'select public.organization_billing_access_allowed(%s)',(A,),role))
check('service gate allows open existing target',service_access(A)is True)
check('service gate refuses missing target',service_access(str(uuid.uuid4()))is False)
check('getter starts inactive',get()['active']is False)
for action,expected,reason in[('unknown',None,'x'),('hold',None,' '),('hold',str(uuid.uuid4()),'x'),('release',None,None)]:
    denied('invalid input '+action+str(expected),lambda:set_hold(action,str(uuid.uuid4()),expected,reason),'22023')
check('SECdef learner content starts available',query(LEARNERS[0],'select public.lab_learner_content(%s)',(CA,))[0][0]=='Synthetic content')
check('owner predicate available before hold',query(OWNER,'select public.is_org_owner(%s,%s)',(OWNER,A))[0][0]is True)
request=str(uuid.uuid4());reason='Synthetic unpaid; no payment assertion'
held=set_hold('hold',request,reason=reason);hold_id=held['hold_id']
check('hold active with stable receipt/reason',held['active']is True and held['request_id']==request and held['reason']==reason)
check('one hold/event/projection',counts()==(1,1,1))
check('service registration fence closes held target only',service_access(A)is False and service_access(B)is True)
check('same request idempotent',set_hold('hold',request,reason=reason)['hold_id']==hold_id and counts()==(1,1,1))
denied('changed request payload refused',lambda:set_hold('hold',request,reason='Different'),'40001')
denied('second hold cannot replace active hold',lambda:set_hold('hold',str(uuid.uuid4()),reason='Different'),'40001')
for actor in TARGET:
    role='organization'if actor==OWNER else'student'
    state=query(actor,"select public.account_deletion_access_allowed(),public.is_user_blocked(%s),public.has_role(%s,%s::app_role),public.has_role(%s::app_role,%s),public.can_access_organization(%s)",(actor,actor,role,role,actor,A))[0]
    check('target common/role/tenant deny '+actor,state==(False,True,False,False,False))
    denied('restored role RPC denied '+actor,lambda:query(actor,'select public.get_user_role(%s)',(actor,)),message='organization_access_suspended')
    for table in('profiles','courses','course_modules','enrollments','lesson_progress','test_attempts'):
        check('target RLS zero '+actor+' '+table,query(actor,'select count(*)from public.'+table)[0][0]==0)
    denied('target RLS write denied '+actor,lambda:query(actor,'insert into public.lesson_progress values(%s,%s,%s,99)',(str(uuid.uuid4()),actor,A)))
    check('target learner helper deny '+actor,query(actor,'select public.can_access_course_as_learner(%s)',(CA,))[0][0]is False)
denied('SECdef learner content bypass closes',lambda:query(LEARNERS[0],'select public.lab_learner_content(%s)',(CA,)))
denied('actual released ownership-transfer RPC closes before DML',lambda:query(OWNER,'select public.transfer_org_ownership_atomic(%s,%s)',(A,STAFF)),message='Only the current owner can transfer ownership')
check('service direct owner helper closes held target',query(None,'select public.is_org_owner(%s,%s)',(OWNER,A),'service_role')[0][0]is False)
check('service direct staff helper closes held target only',query(None,"select public.has_org_staff_permission(%s,%s,'courses.read'),public.has_org_staff_permission(%s,%s,'courses.read')",(STAFF,A,STAFF,B),'service_role')[0]==(False,True))
check('service actor role checks cannot bypass hold',query(None,"select public.has_role(%s,'organization'::app_role),public.has_role('organization'::app_role,%s)",(OWNER,OWNER),'service_role')[0]==(False,False))
check('external-primary staff loses held target only',query(STAFF,"select public.account_deletion_access_allowed(),public.can_access_organization(%s,'courses.read'),public.can_access_organization(%s,'courses.read')",(A,B))[0]==(True,False,True))
check('unrelated student active',query(SB,'select public.account_deletion_access_allowed(),public.is_user_blocked(%s),public.can_access_course_as_learner(%s)',(SB,CB))[0]==(True,False,True))
check('admin bypasses billing only',query(ADMIN,"select public.account_deletion_access_allowed(),public.is_user_blocked(%s),public.can_access_organization(%s),public.get_user_role(%s)",(ADMIN,A,ADMIN))[0]==(True,False,True,'admin'))
check('old privacy revocation denied',query(REVOKED,"select public.account_deletion_access_allowed(),public.has_role(%s,'student'::app_role)",(REVOKED,))[0]==(False,False))
with connect()as c:c.execute('insert into account_deletion_revocations values(%s)',(ADMIN,))
check('privacy overrides admin billing bypass',query(ADMIN,"select public.account_deletion_access_allowed(),public.is_user_blocked(%s),public.has_role(%s,'admin'::app_role)",(ADMIN,ADMIN))[0]==(False,True,False))
denied('revoked admin cannot release',lambda:set_hold('release',str(uuid.uuid4()),hold_id),'42501')
with connect()as c:c.execute('delete from account_deletion_revocations where user_id=%s',(ADMIN,))
denied('release exact-hold CAS refuses stale ID',lambda:set_hold('release',str(uuid.uuid4()),str(uuid.uuid4())),'40001')
release_request=str(uuid.uuid4());released=set_hold('release',release_request,hold_id,'Synthetic administrative release')
check('release clears projection only',released['active']is False and released['hold_id']is None and counts()==(1,0,2))
check('release retry idempotent',set_hold('release',release_request,hold_id,'Synthetic administrative release')['replayed']is True and counts()==(1,0,2))
check('old hold replay does not reactivate/misreport',set_hold('hold',request,reason=reason)['active']is False and counts()==(1,0,2))
check('18 target accounts regain fence',all(query(actor,'select public.account_deletion_access_allowed()')[0][0]is True for actor in TARGET))
check('learner read restored without editing history',query(LEARNERS[0],'select public.lab_learner_content(%s)',(CA,))[0][0]=='Synthetic content')
# Genuine separate sessions, not a sequential model of concurrent operations.
concurrent_request=str(uuid.uuid4())
with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
    duplicate=list(pool.map(lambda _:set_hold('hold',concurrent_request,reason='Synthetic concurrent hold'),range(2)))
check('concurrent duplicate hold creates one event',duplicate[0]['hold_id']==duplicate[1]['hold_id']and counts()==(2,1,3))
current=duplicate[0]['hold_id']
denied('old release cannot release newer hold',lambda:set_hold('release',str(uuid.uuid4()),hold_id),'40001')
release_request=str(uuid.uuid4())
with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:
    rows=list(pool.map(lambda _:set_hold('release',release_request,current,None),range(2)))
check('concurrent duplicate release idempotent',all(not row['active']for row in rows)and counts()==(2,0,4))
def independent_hold(_):
    try:return set_hold('hold',str(uuid.uuid4()),reason='Synthetic race winner')
    except psycopg.Error as e:return e.sqlstate
with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:racing=list(pool.map(independent_hold,range(2)))
check('different concurrent holds have one winner',sum(isinstance(x,dict)for x in racing)==1 and racing.count('40001')==1 and counts()==(3,1,5))
winner=next(x for x in racing if isinstance(x,dict));set_hold('release',str(uuid.uuid4()),winner['hold_id'],'Synthetic cleanup')
for table in('holds','events'):
    with connect()as c:
        denied('history immutable update '+table,lambda:c.execute('update billing_access_private.'+table+" set reason='tampered'"))
        denied('history immutable delete '+table,lambda:c.execute('delete from billing_access_private.'+table))
        denied('history immutable truncate '+table,lambda:c.execute('truncate billing_access_private.'+table+' cascade'))
with connect()as c:
    AFTER=old_data(c);ABI_AFTER=metadata(c)
    check('all old data exact after hold/retry/release/concurrency',AFTER==BEFORE)
    check('nine existing ABIs remain exact after calls',ABI_AFTER==ABI_BEFORE)
    check('fixture ends with zero active holds',c.execute('select count(*)from billing_access_private.active_holds').fetchone()[0]==0)
    denied('migration replay refused',lambda:c.execute(MIGRATION.read_text()),'P0001')
    c.execute('rollback');check('replay refusal preserves old data',old_data(c)==BEFORE)
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'result.json').write_text(json.dumps({'scope':'synthetic isolated PostgreSQL17, not live JWT/Storage acceptance','checks':RESULTS,'passed':len(RESULTS),'failed':0},indent=2))
(OUT/'data-preservation.json').write_text(json.dumps({'before':BEFORE,'after':AFTER,'exact':BEFORE==AFTER},indent=2))
(OUT/'function-metadata.json').write_text(json.dumps({'before':ABI_BEFORE,'after':ABI_AFTER,'exact':ABI_BEFORE==ABI_AFTER},indent=2,default=str))
print(json.dumps({'passed':len(RESULTS),'failed':0,'old_data_exact':BEFORE==AFTER,'old_function_abi_exact':ABI_BEFORE==ABI_AFTER}))

