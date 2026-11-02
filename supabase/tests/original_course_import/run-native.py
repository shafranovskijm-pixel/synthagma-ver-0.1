"""Disposable PG17 model: real importer + reviewed quota trigger; no live credentials."""
import concurrent.futures,copy,json,os,pathlib,uuid
import psycopg
from psycopg.types.json import Jsonb

ROOT=pathlib.Path(__file__).resolve().parents[3]
HERE=pathlib.Path(__file__).resolve().parent
A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
OWNER='11111111-1111-4111-8111-111111111111';OTHER='22222222-2222-4222-8222-222222222222'
results=[]
def record(name,condition):
    assert condition,name
    results.append({'name':name,'passed':True})
def connect(actor=None,role=None):
    c=psycopg.connect(autocommit=True)
    if actor:c.execute("select set_config('lab.actor',%s,false)",(actor,))
    if role:c.execute('set role '+role)
    return c
def payload():
    return {'schema_version':1,'source_kind':'original-private-course','package_id':str(uuid.uuid4()),'title':'Synthetic original','description':'Synthetic only','code':'QA','version':'1','hours':3,'approval_status':'unconfirmed',
      'sources':[{'id':'law','title':'Synthetic source','locator':'section1','url':'https://example.org/law'}],
      'modules':[{'key':'m','title':'Module','hours':3}],
      'lessons':[{'key':'l','module_key':'m','title':'Lecture','type':'text','hours':1,'content':'<h2>Topic</h2><p>Passive text</p>','final_assessment':False,'questions':[]},
        {'key':'p','module_key':'m','title':'Practice','type':'homework','hours':1,'content':'Inputs and task; submit reasoning for teacher review','final_assessment':False,'questions':[]},
        {'key':'t','module_key':'m','title':'Test','type':'test','hours':1,'content':'','final_assessment':True,'questions':[{'key':'q','question':'Synthetic choice?','options':[{'text':'One'},{'text':'Two'}],'correct_answer':1,'explanation':'Synthetic explanation','source_ref':'law :: section1'}]}]}
def call(p,actor=OWNER,org=A):
    with connect(actor,'authenticated') as c:return c.execute('select public.import_original_course_draft_v1(%s,%s)',(org,Jsonb(p))).fetchone()[0]
def expect_error(name,p,code,actor=OWNER,org=A):
    try:call(p,actor,org)
    except psycopg.Error as e:record(name,e.sqlstate==code);return
    raise AssertionError(name+' unexpectedly succeeded')
with connect() as c:
    c.execute((HERE/'fixture.sql').read_text())
    c.execute((HERE/'quota-trigger.sql').read_text())
    c.execute('CREATE TRIGGER quota BEFORE INSERT ON courses FOR EACH ROW EXECUTE FUNCTION enforce_course_insert_limit()')
    c.execute((ROOT/'supabase/migrations/20261102130000_original_course_draft_import.sql').read_text())
    old=c.execute('select md5(jsonb_agg(to_jsonb(a))::text) from attempts a').fetchone()[0]
expect_error('unauthenticated denied',payload(),'42501',None)
expect_error('other tenant denied',payload(),'42501',OTHER,A)
for name,mutate,code in [
  ('missing key',lambda p:p['lessons'][2]['questions'][0].pop('correct_answer'),'22023'),
  ('key outside options',lambda p:p['lessons'][2]['questions'][0].update(correct_answer=8),'22023'),
  ('fractional key',lambda p:p['lessons'][2]['questions'][0].update(correct_answer=.5),'22023'),
  ('orphan lesson',lambda p:p['lessons'][0].update(module_key='missing'),'22023'),
  ('hours mismatch',lambda p:p.update(hours=24),'23514'),
  ('module hours mismatch',lambda p:p['lessons'][0].update(hours=2),'23514'),
  ('script denied',lambda p:p['lessons'][0].update(content='<script>alert(1)</script>'),'22023'),
  ('event attribute denied',lambda p:p['lessons'][0].update(content='<p onclick="alert(1)">text</p>'),'22023'),
  ('private model field denied',lambda p:p['lessons'][1].update(modelReasoning='private model'),'22023'),
  ('source absent',lambda p:p['lessons'][2]['questions'][0].update(source_ref='unknown :: section'),'22023'),
  ('duplicate options',lambda p:p['lessons'][2]['questions'][0]['options'][1].update(text='One'),'22023'),
  ('approval claim denied',lambda p:p.update(approval_status='approved'),'22023'),
]:
    p=payload();mutate(p);expect_error(name,p,code)
with connect() as c:record('malformed payloads wrote zero courses',c.execute('select count(*) from courses').fetchone()[0]==0)
p=payload();r=call(p);same=call(p)
record('idempotent replay returns same course',r['course_id']==same['course_id'] and not r['replayed'] and same['replayed'])
altered=copy.deepcopy(p);altered['title']='Changed';expect_error('changed package denied',altered,'23514')
with connect() as c:
    rows=c.execute('select l.type,l.content,l.metadata from lessons l where course_id=%s order by order_index',(r['course_id'],)).fetchall()
    record('module graph and lesson order', [x[0] for x in rows]==['text','homework','test'] and c.execute('select count(*) from course_modules where course_id=%s',(r['course_id'],)).fetchone()[0]==1)
    record('practice requires teacher review',rows[1][2]['teacher_review_required'] is True)
    record('no closed bank in lesson content',all('correct_answer' not in (x[1] or '') and 'Synthetic explanation' not in (x[1] or '') for x in rows))
    q=c.execute('select correct_answer,explanation from test_questions').fetchone();record('explicit key and source preserved',q[0]==1 and 'law :: section1' in q[1])
    record('course remains unpublished',c.execute('select is_published from courses where id=%s',(r['course_id'],)).fetchone()[0] is False)
    c.execute('delete from lab_editors where actor=%s',(OWNER,))
expect_error('revoked editor cannot replay',p,'42501')
with connect() as c:c.execute('insert into lab_editors values(%s,%s)',(OWNER,A))
parallel=payload()
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:out=list(ex.map(lambda _:call(parallel),range(2)))
record('concurrent same-package imports create once',len({x['course_id'] for x in out})==1 and sum(not x['replayed'] for x in out)==1)
def quota_call(p):
    try:return ('ok',call(p))
    except psycopg.Error as e:return ('error',e.sqlstate)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:out=list(ex.map(quota_call,[payload(),payload()]))
record('concurrent quota boundary admits one',sum(x[0]=='ok' for x in out)==1 and ('error','P0001') in out)
with connect() as c:
    record('quota rollback keeps graph and receipts consistent',c.execute('select count(*) from courses where organization_id=%s',(A,)).fetchone()[0]==3 and c.execute('select count(*) from original_course_import_receipts').fetchone()[0]==3 and c.execute('select count(*) from lessons').fetchone()[0]==9)
    record('old attempts exact',old==c.execute('select md5(jsonb_agg(to_jsonb(a))::text) from attempts a').fetchone()[0])
with connect(OTHER,'authenticated') as c:record('other tenant cannot read receipts',c.execute('select count(*) from original_course_import_receipts').fetchone()[0]==0)
with connect(OWNER,'authenticated') as c:
    try:c.execute('delete from original_course_import_receipts')
    except psycopg.Error as e:record('editor cannot mutate receipts',e.sqlstate=='42501')
    else:raise AssertionError('receipt mutation allowed')
out=ROOT/'outputs/original-course-native';out.mkdir(parents=True,exist_ok=True)
(out/'results.json').write_text(json.dumps({'mode':'isolated PostgreSQL17 model; synthetic auth bindings; exact importer and quota source','checks':results},indent=2))
print(json.dumps({'passed':len(results),'failed':0}))
