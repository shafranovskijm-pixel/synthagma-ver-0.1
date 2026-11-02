"""Separate disabled-runtime model. Uses fake Vault/net/cron, real PG17 pgcrypto.

No remote network is invoked and no production key, nonce or secret is read.
The fake Vault stores only fresh disposable lab bytes. It does not prove real
Vault encryption or native pg_net/cron operation. Do not print getter results.
"""
import base64,concurrent.futures,hashlib,hmac,json,pathlib,time,unittest,uuid
import psycopg
import run_native as m
ROOT=pathlib.Path(__file__).resolve().parents[1]
RUNTIME=ROOT/'20261103011000_support_mcp_events_runtime_disabled.sql'
def backend(sql,params=()):
 with m.connection('service_role',{'role':'service_role'}) as c:return c.execute(sql,params).fetchone()[0]
def config():return backend('select sintagma_support_event_runtime_config()')
def wake():return m.scalar('select mcp_events_private.wake_worker()')
def enable():m.execute('update mcp_events_private.runtime_config set enabled=true,last_wake_at=null')
class RuntimeTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  m.EventsTests.setUpClass()
  with m.connection() as c:
   c.execute((ROOT/'tests/runtime_fixture.sql').read_text())
   c.execute(RUNTIME.read_text())
 def setUp(self):
  m.EventsTests.setUp(self)
  m.execute('update mcp_events_private.runtime_config set enabled=false,last_wake_at=null')
  m.execute('truncate mcp_events_private.wake_nonces,net.http_request_queue')
 def assertDbError(self,code,fn):
  with self.assertRaises(psycopg.Error) as caught:fn()
  self.assertEqual(caught.exception.sqlstate,code)
 def test01_install_disabled_and_new_distinct_keys(self):
  c=config();self.assertFalse(c['enabled']);self.assertEqual(len(base64.b64decode(c['encryptionKey']['key_base64'])),32)
  self.assertEqual(len(base64.b64decode(c['workerToken'])),32);self.assertTrue(c['workerToken']!=c['encryptionKey']['key_base64'])
  self.assertEqual(m.scalar('select count(*) from vault.secrets'),2)
 def test02_only_service_getter_and_no_direct_private_access(self):
  for role in ['anon','authenticated']:
   self.assertDbError('42501',lambda:m.execute_as(role,'select sintagma_support_event_runtime_config()',jwt=m.claims()))
   self.assertDbError('42501',lambda:m.execute_as(role,'select * from mcp_events_private.runtime_config',jwt=m.claims()))
  self.assertDbError('42501',lambda:m.execute_as('service_role','select * from mcp_events_private.runtime_config',jwt={'role':'service_role'}))
 def test03_service_jwt_required_beyond_grant(self):
  self.assertDbError('42501',lambda:m.service('select sintagma_support_event_runtime_config()'))
 def test04_readiness_has_no_secret_fields(self):
  r=backend('select sintagma_support_event_runtime_readiness()')
  self.assertEqual(set(r),{'enabled','configured','workerUrl'});self.assertFalse(r['enabled']);self.assertTrue(r['configured'])
 def test05_disabled_never_queues_or_consumes_nonce(self):
  self.assertFalse(wake());self.assertEqual(m.scalar('select count(*) from net.http_request_queue'),0)
  self.assertFalse(backend('select sintagma_support_event_consume_wake_nonce(%s,%s)',(str(uuid.uuid4()),int(time.time()))))
 def test06_hmac_exact_contract_no_reusable_token_in_queue(self):
  enable();c=config();self.assertTrue(wake())
  with m.connection() as db:r=db.execute('select url,body,params,headers from net.http_request_queue').fetchone()
  self.assertEqual(r[0],c['workerUrl']);self.assertEqual(r[1],{});self.assertEqual(r[2],{})
  header=r[3];self.assertEqual(set(header),{'Content-Type','x-sintagma-events-timestamp','x-sintagma-events-nonce','x-sintagma-events-signature'})
  signed='sintagma-support-events-wake-v1\n'+header['x-sintagma-events-timestamp']+'\n'+header['x-sintagma-events-nonce']
  expected=hmac.new(base64.b64decode(c['workerToken']),signed.encode(),hashlib.sha256).hexdigest()
  self.assertEqual(header['x-sintagma-events-signature'],expected)
  self.assertFalse(c['workerToken'] in json.dumps(header));self.assertFalse(c['encryptionKey']['key_base64'] in json.dumps(header))
 def test07_throttle_one_wake_per_second(self):
  enable();self.assertTrue(wake());self.assertFalse(wake());self.assertEqual(m.scalar('select count(*) from net.http_request_queue'),1)
  m.execute("update mcp_events_private.runtime_config set last_wake_at=clock_timestamp()-interval '2 seconds'");self.assertTrue(wake())
 def test08_jobs_wake_only_when_enabled_and_nonempty(self):
  m.subscribe();m.message();self.assertEqual(m.scalar('select count(*) from net.http_request_queue'),0)
  enable();m.message();self.assertEqual(m.scalar('select count(*) from net.http_request_queue'),1)
  m.execute('update mcp_events_private.runtime_config set last_wake_at=null')
  m.execute('insert into mcp_events_private.delivery_jobs(subscription_id,event_id,generation) select subscription_id,event_id,generation from mcp_events_private.delivery_jobs where false')
  self.assertEqual(m.scalar('select count(*) from net.http_request_queue'),1)
 def test09_net_failure_does_not_rollback_support_or_outbox(self):
  enable();m.subscribe()
  with m.connection() as db:
   db.execute("select set_config('support_events_lab.fail_net','1',false)")
   mid=str(uuid.uuid4());db.execute("insert into support_messages(id,conversation_id,role,content) values(%s,%s,'user','Synthetic runtime queue failure')",(mid,m.CONV))
  self.assertEqual(m.scalar('select count(*) from support_messages where id=%s',(mid,)),1)
  self.assertEqual(m.scalar('select count(*) from mcp_events_private.outbox'),1)
  self.assertEqual(m.scalar('select count(*) from mcp_events_private.delivery_jobs'),1)
  self.assertEqual(m.scalar('select count(*) from net.http_request_queue'),0)
 def test10_nonce_atomic_single_use(self):
  enable();n=str(uuid.uuid4());t=int(time.time())
  self.assertTrue(backend('select sintagma_support_event_consume_wake_nonce(%s,%s)',(n,t)))
  self.assertFalse(backend('select sintagma_support_event_consume_wake_nonce(%s,%s)',(n,t)))
 def test11_nonce_timestamp_window(self):
  enable();t=m.scalar('select floor(extract(epoch from clock_timestamp()))::bigint')
  # The calls use separate real connections. Leave margin for a second-boundary
  # rollover; t+6 can become the valid now+5 while the connection is opening.
  for ts in [t-61,t+10,None]:self.assertFalse(backend('select sintagma_support_event_consume_wake_nonce(%s,%s)',(str(uuid.uuid4()),ts)))
  self.assertTrue(backend('select sintagma_support_event_consume_wake_nonce(%s,%s)',(str(uuid.uuid4()),t)))
 def test12_cleanup_only_private_retention_and_old_nonce(self):
  enable();n=str(uuid.uuid4());backend('select sintagma_support_event_consume_wake_nonce(%s,%s)',(n,int(time.time())))
  m.execute("update mcp_events_private.wake_nonces set consumed_at=clock_timestamp()-interval '121 seconds'")
  m.subscribe();mid=m.message();j=m.claim()[0];m.finish(j)
  m.execute("update mcp_events_private.delivery_jobs set updated_at=clock_timestamp()-interval '8 days'")
  m.execute("update mcp_events_private.outbox set expires_at=clock_timestamp()-interval '1 second'")
  before=m.scalar('select md5(to_jsonb(c)::text) from support_conversations c where id=%s',(m.CONV,))
  m.execute('select mcp_events_private.cleanup_runtime()')
  self.assertEqual(m.scalar('select count(*) from mcp_events_private.wake_nonces'),0)
  self.assertEqual(m.scalar('select count(*) from mcp_events_private.delivery_jobs'),0);self.assertEqual(m.scalar('select count(*) from mcp_events_private.outbox'),0)
  self.assertEqual(m.scalar('select count(*) from support_messages where id=%s',(mid,)),1)
  self.assertEqual(before,m.scalar('select md5(to_jsonb(c)::text) from support_conversations c where id=%s',(m.CONV,)))
 def test13_cron_metadata_contains_no_secrets_and_no_global_acl_change(self):
  with m.connection() as db:rows=db.execute('select jobname,schedule,command from cron.job order by jobname').fetchall()
  self.assertEqual(rows,[('sintagma-support-events-cleanup-v1','37 3 * * *','SELECT mcp_events_private.cleanup_runtime();'),('sintagma-support-events-wake-v1','* * * * *','SELECT mcp_events_private.wake_worker();')])
  self.assertTrue(m.scalar("select has_table_privilege('anon','net.http_request_queue','SELECT')"))
 def test14_worker_url_pinned_by_constraint(self):
  self.assertDbError('23514',lambda:m.execute("update mcp_events_private.runtime_config set worker_url='https://evil.example.org/'"))
 def test15_expired_lease_cancelled_and_secret_cleared_by_cleanup(self):
  m.subscribe();m.message();j=m.claim()[0]
  m.execute("update mcp_events_private.outbox set expires_at=clock_timestamp()-interval '1 second'")
  m.execute("update mcp_events_private.subscriptions set expires_at=clock_timestamp()-interval '1 second'")
  m.execute('select mcp_events_private.cleanup_runtime()')
  self.assertIsNone(m.prepare(j));self.assertFalse(m.scalar('select secret_envelope is not null from mcp_events_private.subscriptions'))
  self.assertEqual(m.scalar('select status from mcp_events_private.delivery_jobs'),'cancelled')
 def test16_nonce_replay_race_between_backend_instances(self):
  enable();n=str(uuid.uuid4());t=int(time.time())
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
   results=list(pool.map(lambda _:backend('select sintagma_support_event_consume_wake_nonce(%s,%s)',(n,t)),range(2)))
  self.assertEqual(sorted(results),[False,True])
 def test17_replay_fails_before_rotating_any_generated_key(self):
  before=m.scalar('select md5(to_jsonb(c)::text) from mcp_events_private.runtime_config c')
  def replay():
   with m.connection() as db:db.execute(RUNTIME.read_text())
  self.assertDbError('42P07',replay)
  self.assertEqual(before,m.scalar('select md5(to_jsonb(c)::text) from mcp_events_private.runtime_config c'))
  self.assertEqual(m.scalar('select count(*) from vault.secrets'),2)

if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(RuntimeTests))
 out=ROOT/'runtime-results';out.mkdir(exist_ok=True)
 report={'mode':'isolated PG17 runtime MODEL; fake Vault/net/cron; real pgcrypto; no remote requests','tests_run':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'successful':result.wasSuccessful(),'runtime_sql_sha256':hashlib.sha256(RUNTIME.read_bytes()).hexdigest(),
  'limits':['Not real Vault at-rest encryption','Not actual pg_net or cron scheduling','Not Edge HMAC/TLS verification','Not production applied or enabled','No actual Cloud subscription']}
 (out/'results.json').write_text(json.dumps(report,indent=2));raise SystemExit(0 if result.wasSuccessful() else 1)
