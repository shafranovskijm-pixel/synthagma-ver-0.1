"""Exact candidate SQL, disposable PG17 model. No requests or production credentials.

Invocation requires PGDATABASE=support_events_lab or support_events_lab_<suffix>.
The model checks DB authorization/outbox invariants, not OAuth JWT verification,
real AES-GCM encryption, remote callback verification or Cloud subscription.
"""
import base64,concurrent.futures,copy,hashlib,json,os,pathlib,unittest,uuid
import psycopg
from psycopg.types.json import Jsonb
ROOT=pathlib.Path(__file__).resolve().parents[1]
SQL_PATH=pathlib.Path(os.environ.get('MCP_EVENTS_SQL_PATH',str(ROOT/'20261103010000_support_mcp_events_outbox.sql'))).resolve()
U='11111111-1111-4111-8111-111111111111';OTHER='22222222-2222-4222-8222-222222222222'
C='33333333-3333-4333-8333-333333333333';SESSION='44444444-4444-4444-8444-444444444444'
ORG='55555555-5555-4555-8555-555555555555';SOURCEUSER='66666666-6666-4666-8666-666666666666'
CONV='77777777-7777-4777-8777-777777777777';CLIENT2='88888888-8888-4888-8888-888888888888'
CHAT='support.platform_chat.message.created';REPORT='support.problem_report.created'
URL='https://receiver.example.org/mcp-events/callback'
ENVELOPE={'v':1,'kid':'fixture-v1','iv':base64.b64encode(bytes(12)).decode(),'ciphertext':base64.b64encode(bytes(64)).decode()}
KEYHASH='a'*64
def connection(role=None,claims=None):
 host=os.environ.get('PGHOST','127.0.0.1');dbname=os.environ.get('PGDATABASE','')
 if host not in ('127.0.0.1','localhost') or not(dbname=='support_events_lab' or dbname.startswith('support_events_lab_')):raise RuntimeError('Explicit loopback lab connection required')
 c=psycopg.connect(host=host,port=os.environ.get('PGPORT','5432'),dbname=dbname,user=os.environ.get('PGUSER','postgres'),password=os.environ.get('PGPASSWORD',''),connect_timeout=5,autocommit=True)
 if not (c.info.dbname=='support_events_lab' or c.info.dbname.startswith('support_events_lab_')):
  c.close();raise RuntimeError('Refusing non-lab database')
 if claims is not None:c.execute("select set_config('request.jwt.claims',%s,false)",(json.dumps(claims),))
 if role is not None:
  if role not in ('authenticated','anon','service_role'):raise ValueError('test role')
  c.execute('set role '+role)
 return c
def claims(**kw):return dict({'sub':U,'role':'authenticated','aud':'authenticated','client_id':C,'session_id':SESSION},**kw)
def service(sql,params=()):
 with connection('service_role') as c:return c.execute(sql,params).fetchone()[0]
def subscribe(name=CHAT,args=None,url=URL,session=SESSION,user=U,client=C,keyhash=KEYHASH,envelope=None,ttl=86400):
 return service('select public.sintagma_support_event_subscribe_verified(%s,%s,%s,%s,%s,%s,%s,%s,%s)',
   (user,client,session,name,Jsonb(args or {}),url,Jsonb(envelope or ENVELOPE),keyhash,ttl))
def unsubscribe(name=CHAT,args=None,url=URL,user=U,client=C,session=SESSION):
 return service('select public.sintagma_support_event_unsubscribe(%s,%s,%s,%s,%s,%s)',(user,client,session,name,Jsonb(args or {}),url))
def identity(name=CHAT,args=None,url=URL,user=U,client=C,session=SESSION):
 return service('select public.sintagma_support_event_identity(%s,%s,%s,%s,%s,%s)',(user,client,session,name,Jsonb(args or {}),url))
def message(role='user',cid=CONV,mid=None,commit=True):
 mid=mid or str(uuid.uuid4())
 with connection() as c:
  c.execute('begin');c.execute("insert into support_messages(id,conversation_id,role,content,sender_user_id,created_at) values(%s,%s,%s,'Synthetic private content; never in payload',%s,'2000-01-01')",(mid,cid,role,SOURCEUSER))
  c.execute('commit' if commit else 'rollback')
 return mid
def problem():
 rid=str(uuid.uuid4())
 with connection() as c:c.execute("insert into support_requests(id,user_id,organization_id,description,screenshot_url,contact_phone,created_at) values(%s,%s,%s,'Synthetic private description','https://private.invalid/screenshot','not-a-real-phone','2000-01-01')",(rid,SOURCEUSER,ORG))
 return rid
def claim(limit=10,worker=None):return service('select public.sintagma_support_event_claim(%s,%s,60)',(worker or str(uuid.uuid4()),limit))
def prepare(j):return service('select public.sintagma_support_event_prepare_delivery(%s,%s,%s)',(j['job_id'],j['lease_token'],j['fence']))
def finish(j,outcome='accepted',status=204):return service('select public.sintagma_support_event_finish_delivery(%s,%s,%s,%s,%s)',(j['job_id'],j['lease_token'],j['fence'],outcome,status))
def scalar(sql,params=()):
 with connection() as c:return c.execute(sql,params).fetchone()[0]
def execute(sql,params=()):
 with connection() as c:c.execute(sql,params)
def execute_as(role,sql,params=(),jwt=None):
 with connection(role,jwt) as c:c.execute(sql,params)

class EventsTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  with connection() as c:
   c.execute((ROOT/'tests/fixture.sql').read_text())
   # Sentinel predates trigger installation: the migration must not backfill it.
   c.execute('insert into support_conversations(id,user_id,organization_id) values(%s,%s,%s)',(CONV,SOURCEUSER,ORG))
   c.execute("insert into support_messages(id,conversation_id,role,content) values('99999999-9999-4999-8999-999999999999',%s,'user','Historical sentinel')",(CONV,))
   c.execute(SQL_PATH.read_text())
   cls.no_backfill=c.execute('select count(*) from mcp_events_private.outbox').fetchone()[0]==0
 @classmethod
 def tearDownClass(cls):pass
 def setUp(self):
  execute('truncate mcp_events_private.delivery_jobs,mcp_events_private.outbox,mcp_events_private.subscriptions')
  execute('truncate auth.oauth_consents,auth.sessions,auth.oauth_clients,auth.users cascade')
  execute('truncate user_roles,profiles,account_deletion_revocations')
  execute('insert into auth.users(id) values(%s),(%s)',(U,OTHER));execute('insert into auth.oauth_clients(id) values(%s),(%s)',(C,CLIENT2))
  execute("insert into auth.sessions(id,user_id,oauth_client_id,scopes) values(%s,%s,%s,'email')",(SESSION,U,C))
  execute('insert into auth.oauth_consents(user_id,client_id) values(%s,%s)',(U,C))
  execute("insert into user_roles values(%s,'admin')",(U,));execute('insert into profiles(user_id) values(%s)',(U,))
 def assertDbError(self,code,fn):
  with self.assertRaises(psycopg.Error) as caught:fn()
  self.assertEqual(caught.exception.sqlstate,code)
 def test01_original_oauth_identity(self):
  with connection('authenticated',claims()) as c:self.assertEqual(c.execute('select sintagma_support_event_authorize()').fetchone()[0],{'user_id':U,'client_id':C,'session_id':SESSION})
 def test02_bad_or_non_oauth_claims(self):
  for bad in [dict(claims(),client_id='bad'),dict(claims(),client_id=CLIENT2),dict(claims(),session_id=str(uuid.uuid4())),dict(claims(),sub=OTHER),dict(claims(),role='service_role')]:
   self.assertDbError('42501',lambda:execute_as('authenticated','select sintagma_support_event_authorize()',jwt=bad))
 def test03_anonymous_cannot_authorize(self):
  self.assertDbError('42501',lambda:execute_as('anon','select sintagma_support_event_authorize()'))
 def test04_mutants_and_private_tables_deny_clients(self):
  for role in ['anon','authenticated']:
   self.assertDbError('42501',lambda:execute_as(role,'select sintagma_support_event_claim(%s,1,60)',(str(uuid.uuid4()),),claims()))
   self.assertDbError('42501',lambda:execute_as(role,'select * from mcp_events_private.subscriptions',jwt=claims()))
 def test05_no_history_backfill(self):self.assertTrue(self.no_backfill)
 def test06_idempotence_canonical_filters(self):
  a=subscribe(args={'organization_id':ORG,'user_id':SOURCEUSER});b=subscribe(args={'user_id':SOURCEUSER,'organization_id':ORG.upper()})
  self.assertEqual(a['id'],b['id']);self.assertEqual(scalar('select count(*) from mcp_events_private.subscriptions'),1)
  self.assertIsNone(a['cursor']);self.assertFalse(a['truncated']);self.assertIn('refreshBefore',a)
 def test07_names_separate_identity(self):self.assertNotEqual(subscribe()['id'],subscribe(REPORT)['id'])
 def test08_extra_or_null_arguments_denied(self):
  for args in [{'source_kind':'all'},{'user_id':None},{'user_id':'bad'}]:self.assertDbError('22023',lambda:subscribe(args=args))
 def test09_bad_names_or_envelope_denied(self):
  self.assertDbError('22023',lambda:subscribe(name='support.created'))
  e=dict(ENVELOPE,plaintext='never accepted');self.assertDbError('22023',lambda:subscribe(envelope=e))
  e=dict(ENVELOPE,iv='short');self.assertDbError('22023',lambda:subscribe(envelope=e))
 def test10_ttl_finite_clamped(self):
  subscribe(ttl=999999)
  self.assertLessEqual(scalar("select extract(epoch from expires_at-clock_timestamp()) from mcp_events_private.subscriptions"),86400)
  subscribe(ttl=-1)
  self.assertGreater(scalar("select extract(epoch from expires_at-clock_timestamp()) from mcp_events_private.subscriptions"),55)
  self.assertLessEqual(scalar("select extract(epoch from expires_at-clock_timestamp()) from mcp_events_private.subscriptions"),60)
 def test11_only_user_messages(self):
  subscribe();message('assistant');message('admin');message('system');self.assertEqual(claim(),[])
  message();self.assertEqual(len(claim()),1)
 def test12_report_source_and_minimal_payload(self):
  subscribe(REPORT);rid=problem();jobs=claim();self.assertEqual(len(jobs),1);p=prepare(jobs[0]);d=p['event']['data']
  self.assertEqual(d,{'source_kind':'problem_report','source_id':rid,'message_id':None,'organization_id':ORG})
  self.assertEqual(set(p['event']),{'eventId','name','timestamp','data','cursor'})
  self.assertNotIn('Synthetic private',json.dumps(p['event']));self.assertNotIn('screenshot',json.dumps(p['event']))
 def test13_chat_payload_occurrence_is_server_insert(self):
  subscribe();mid=message();p=prepare(claim()[0]);d=p['event']['data']
  self.assertEqual(d['source_id'],CONV);self.assertEqual(d['message_id'],mid);self.assertEqual(d['source_kind'],'platform_chat')
  self.assertNotIn('2000-01-01',p['event']['timestamp']);self.assertTrue(p['event']['eventId'].startswith('evt_'))
 def test14_filters_before_fanout(self):
  subscribe(args={'organization_id':str(uuid.uuid4())});subscribe(args={'user_id':str(uuid.uuid4())});subscribe(REPORT)
  message();self.assertEqual(claim(),[])
 def test15_source_rollback_rolls_outbox_back(self):
  subscribe();mid=message(commit=False);self.assertEqual(scalar('select count(*) from support_messages where id=%s',(mid,)),0)
  self.assertEqual(scalar('select count(*) from mcp_events_private.outbox'),0);self.assertEqual(claim(),[])
 def test16_source_dedup(self):
  subscribe();mid=message();execute("insert into support_messages(id,conversation_id,role,content) values(%s,%s,'user','ignored') on conflict(id) do nothing",(mid,CONV))
  self.assertEqual(scalar('select count(*) from mcp_events_private.outbox'),1);self.assertEqual(scalar('select count(*) from mcp_events_private.delivery_jobs'),1)
 def test17_concurrent_same_subscription(self):
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:r=list(pool.map(lambda _:subscribe(),range(2)))
  self.assertEqual(r[0]['id'],r[1]['id']);self.assertEqual(scalar('select count(*) from mcp_events_private.subscriptions'),1)
 def test18_concurrent_claims_no_overlap(self):
  subscribe();[message() for _ in range(6)]
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:r=list(pool.map(lambda _:claim(3),range(2)))
  a={j['job_id'] for j in r[0]};b={j['job_id'] for j in r[1]};self.assertFalse(a&b);self.assertEqual(len(a|b),6)
 def test19_stale_fence_after_lease_reclaim(self):
  subscribe();message();old=claim()[0]
  execute("update mcp_events_private.delivery_jobs set lease_expires_at=clock_timestamp()-interval '1 second'")
  new=claim()[0];self.assertGreater(new['fence'],old['fence']);self.assertIsNone(prepare(old));self.assertFalse(finish(old));self.assertIsNotNone(prepare(new))
 def test20_accepted_receipt_not_resent(self):
  subscribe();message();j=claim()[0];self.assertTrue(finish(j));self.assertEqual(claim(),[]);self.assertFalse(finish(j))
 def test21_retry_keeps_event_id(self):
  subscribe();message();j=claim()[0];old=prepare(j)['event']['eventId'];self.assertTrue(finish(j,'retry',503));self.assertEqual(claim(),[])
  execute("update mcp_events_private.delivery_jobs set available_at=clock_timestamp()-interval '1 second'")
  k=claim()[0];self.assertEqual(prepare(k)['event']['eventId'],old);self.assertEqual(k['attempt_no'],2)
 def test22_bounded_attempts(self):
  subscribe();message()
  for _ in range(8):
   j=claim()[0];self.assertTrue(finish(j,'retry',429));execute("update mcp_events_private.delivery_jobs set available_at=clock_timestamp()-interval '1 second'")
  self.assertEqual(claim(),[]);self.assertEqual(scalar('select status from mcp_events_private.delivery_jobs'),'dead')
 def test23_410_stops_subscription(self):
  subscribe();message();message();j=claim(1)[0];self.assertTrue(finish(j,'gone',410));self.assertEqual(claim(),[])
  self.assertEqual(scalar('select status from mcp_events_private.subscriptions'),'unsubscribed')
  self.assertIsNone(scalar('select secret_envelope from mcp_events_private.subscriptions'))
 def test24_413_stops_job_only(self):
  subscribe();message();j=claim()[0];self.assertTrue(finish(j,'too_large',413));message();self.assertEqual(len(claim()),1)
  self.assertEqual(scalar('select status from mcp_events_private.subscriptions'),'active')
 def test25_bad_outcome_not_accepted(self):
  subscribe();message();j=claim()[0]
  self.assertDbError('22023',lambda:finish(j,'accepted',503));self.assertDbError('22023',lambda:finish(j,'retry',410))
 def test26_unsubscribe_owner_scope(self):
  s=subscribe();message();j=claim()[0]
  self.assertDbError('42501',lambda:unsubscribe(user=OTHER));unsubscribe();self.assertIsNone(prepare(j));self.assertFalse(finish(j));self.assertEqual(claim(),[])
  self.assertEqual(unsubscribe()['id'],s['id'])
 def test27_expiry_revokes_pending_and_clears_cipher(self):
  subscribe();message();execute("update mcp_events_private.subscriptions set expires_at=clock_timestamp()-interval '1 second'")
  self.assertEqual(claim(),[]);self.assertEqual(scalar('select status from mcp_events_private.subscriptions'),'expired');self.assertIsNone(scalar('select secret_envelope from mcp_events_private.subscriptions'))
 def test28_role_revocation_before_fetch(self):
  subscribe();message();j=claim()[0];execute('delete from user_roles where user_id=%s',(U,));self.assertIsNone(prepare(j));self.assertFalse(finish(j))
 def test29_consent_revocation_before_fetch(self):
  subscribe();message();j=claim()[0];execute('update auth.oauth_consents set revoked_at=clock_timestamp()');self.assertIsNone(prepare(j))
 def test30_deleted_session_before_fetch(self):
  subscribe();message();j=claim()[0];execute('delete from auth.sessions');self.assertIsNone(prepare(j))
 def test31_blocked_owner_before_fetch(self):
  subscribe();message();j=claim()[0];execute('update profiles set blocked_at=clock_timestamp()');self.assertIsNone(prepare(j))
 def test32_account_deletion_before_fetch(self):
  subscribe();message();j=claim()[0];execute('insert into account_deletion_revocations(user_id) values(%s)',(U,));self.assertIsNone(prepare(j))
 def test33_deleted_client_before_fetch(self):
  subscribe();message();j=claim()[0];execute('update auth.oauth_clients set deleted_at=clock_timestamp() where id=%s',(C,));self.assertIsNone(prepare(j))
 def test34_banned_owner_before_fetch(self):
  subscribe();message();j=claim()[0];execute("update auth.users set banned_until=clock_timestamp()+interval '1 day' where id=%s",(U,));self.assertIsNone(prepare(j))
 def test35_rotation_keeps_previous_120s_and_fences_old(self):
  s=subscribe();message();j=claim()[0];subscribe(keyhash='b'*64,envelope=dict(ENVELOPE,kid='fixture-v2'))
  self.assertIsNone(prepare(j));self.assertFalse(finish(j));k=claim()[0];p=prepare(k)
  self.assertEqual(p['secret_envelope']['kid'],'fixture-v2');self.assertEqual(p['previous_secret_envelope']['kid'],'fixture-v1')
  self.assertEqual(p['owner_user_id'],U);self.assertEqual(p['oauth_client_id'],C);self.assertEqual(p['event_name'],CHAT)
  execute("update mcp_events_private.subscriptions set previous_valid_until=clock_timestamp()-interval '1 second'");self.assertIsNone(prepare(k)['previous_secret_envelope'])
 def test36_new_session_renewal_same_identity(self):
  s=subscribe();new=str(uuid.uuid4());execute("insert into auth.sessions(id,user_id,oauth_client_id,scopes) values(%s,%s,%s,'email')",(new,U,C))
  self.assertEqual(subscribe(session=new)['id'],s['id']);self.assertEqual(scalar('select oauth_session_id::text from mcp_events_private.subscriptions'),new)
 def test37_service_has_no_direct_secret_access(self):
  self.assertDbError('42501',lambda:execute_as('service_role','select secret_envelope from mcp_events_private.subscriptions'))
 def test38_source_unread_and_old_rows_unchanged(self):
  before=scalar('select md5(to_jsonb(c)::text) from support_conversations c where id=%s',(CONV,));subscribe();message();j=claim()[0];prepare(j);finish(j)
  self.assertEqual(before,scalar('select md5(to_jsonb(c)::text) from support_conversations c where id=%s',(CONV,)))
  self.assertEqual(scalar("select content from support_messages where id='99999999-9999-4999-8999-999999999999'"),'Historical sentinel')
 def test39_no_replay_on_new_subscription(self):
  message();subscribe();self.assertEqual(claim(),[])
 def test40_session_not_after_bounds_lifetime(self):
  execute("update auth.sessions set not_after=clock_timestamp()+interval '30 seconds'");subscribe()
  self.assertLessEqual(scalar('select extract(epoch from expires_at-clock_timestamp()) from mcp_events_private.subscriptions'),30)
 def test41_auth_revocation_prevents_subscribe(self):
  execute('update auth.oauth_consents set revoked_at=clock_timestamp()');self.assertDbError('42501',subscribe)
 def test42_expired_session_prevents_authorize(self):
  execute("update auth.sessions set not_after=clock_timestamp()-interval '1 second'")
  self.assertDbError('42501',lambda:execute_as('authenticated','select sintagma_support_event_authorize()',jwt=claims()))
 def test43_payload_column_allowlist(self):
  cols=scalar("select array_agg(attname::text order by attnum) from pg_attribute where attrelid='mcp_events_private.outbox'::regclass and attnum>0 and not attisdropped")
  self.assertEqual(cols,['id','source_kind','source_event_id','source_id','message_id','organization_id','user_id','event_name','occurred_at','expires_at'])
 def test44_preflight_permanent_failure_has_no_fabricated_http(self):
  subscribe();message();j=claim()[0];self.assertTrue(finish(j,'permanent',None));self.assertEqual(claim(),[])
  self.assertEqual(scalar('select status from mcp_events_private.delivery_jobs'),'dead');self.assertIsNone(scalar('select http_status from mcp_events_private.delivery_jobs'))
 def test45_preverification_identity_readonly_canonical(self):
  a=identity(args={'organization_id':ORG,'user_id':SOURCEUSER});b=identity(args={'user_id':SOURCEUSER,'organization_id':ORG.upper()})
  self.assertEqual(a,b);self.assertTrue(a.startswith('sub_'));self.assertEqual(scalar('select count(*) from mcp_events_private.subscriptions'),0)
  self.assertEqual(a,subscribe(args={'organization_id':ORG,'user_id':SOURCEUSER})['id'])
 def test46_preverification_identity_rejects_wrong_owner_session(self):
  for kw in [dict(user=OTHER),dict(client=CLIENT2),dict(session=str(uuid.uuid4()))]:self.assertDbError('42501',lambda:identity(**kw))
  self.assertEqual(scalar('select count(*) from mcp_events_private.subscriptions'),0)
 def test47_preverification_identity_service_only(self):
  for role in ['anon','authenticated']:
   self.assertDbError('42501',lambda:execute_as(role,'select sintagma_support_event_identity(%s,%s,%s,%s,%s,%s)',(U,C,SESSION,CHAT,Jsonb({}),URL),claims()))
 def test48_preverification_identity_validates_name_filters_url(self):
  for kw in [dict(name='support.created'),dict(args={'extra':True}),dict(url='https://'),dict(url='http://receiver.example.org'),dict(url='https://user:pass@receiver.example.org'),dict(url=URL+'#fragment')]:self.assertDbError('22023',lambda:identity(**kw))

if __name__=='__main__':
 suite=unittest.defaultTestLoader.loadTestsFromTestCase(EventsTests)
 result=unittest.TextTestRunner(verbosity=2).run(suite)
 out=ROOT/'native-results';out.mkdir(exist_ok=True)
 report={'mode':'isolated PostgreSQL17 model; exact candidate SQL; synthetic Auth bindings only','tests_run':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'successful':result.wasSuccessful(),
   'sql_sha256':hashlib.sha256(SQL_PATH.read_bytes()).hexdigest(),
   'limits':['Not real JWT signature verification','Not AES-GCM or remote callback verification','Not deployed or a Cloud subscription','No production auth claims, user data or messages modified']}
 (out/'results.json').write_text(json.dumps(report,indent=2))
 raise SystemExit(0 if result.wasSuccessful() else 1)
