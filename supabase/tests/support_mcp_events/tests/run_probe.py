"""Eight NEW disabled-probe cases, disposable PG17 MODEL only.

Uses the existing fake Vault/net/cron fixture and real pgcrypto. No network,
production claims, Vault bytes or old 48/19 test cases are invoked here.
"""
import base64,concurrent.futures,hashlib,hmac,json,os,pathlib,time,unittest,uuid
import psycopg
import run_native as m
ROOT=pathlib.Path(__file__).resolve().parents[1]
RUNTIME=pathlib.Path(os.environ.get('MCP_EVENTS_RUNTIME_SQL_PATH',str(ROOT/'20261103011000_support_mcp_events_runtime_disabled.sql'))).resolve()
PROBE=pathlib.Path(os.environ.get('MCP_EVENTS_PROBE_SQL_PATH',str(ROOT/'20261103012000_support_mcp_events_disabled_probe.sql'))).resolve()
CONSUME='public.sintagma_support_event_consume_probe_nonce(uuid,bigint)'
QUEUE='mcp_events_private.queue_runtime_probe()'
def backend(sql,params=()):
 with m.connection('service_role',{'role':'service_role'})as db:return db.execute(sql,params).fetchone()[0]
def consume(n,t):return backend('select public.sintagma_support_event_consume_probe_nonce(%s,%s)',(n,t))
def now():return m.scalar('select floor(extract(epoch from clock_timestamp()))::bigint')
def queue():return m.scalar('select mcp_events_private.queue_runtime_probe()')
class ProbeTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  assert hashlib.sha256(m.SQL_PATH.read_bytes()).hexdigest()=='07c94e7cc5a0dd5eaf550a9b914e89f33755de8ab7bb3a6653e8fdf4c1ca3348'
  assert hashlib.sha256(RUNTIME.read_bytes()).hexdigest()=='480a6535ec9c7173dcd26c8237d97b1395585314a507612568d3f65d9b6a2f8a'
  with m.connection()as db:
   db.execute((ROOT/'tests/fixture.sql').read_text())
   db.execute((ROOT/'tests/runtime_fixture.sql').read_text())
   db.execute(m.SQL_PATH.read_text());db.execute(RUNTIME.read_text())
   cls.old=db.execute("select p.oid,md5(pg_get_functiondef(p.oid)||'|'||p.proowner::text||'|'||coalesce(p.proacl::text,'')||'|'||coalesce(p.proconfig::text,'')) from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='mcp_events_private' or(ns.nspname='public' and p.proname like 'sintagma_support_event_%') order by p.oid").fetchall()
   cls.defaults=db.execute("select md5(coalesce(jsonb_agg(to_jsonb(d)order by d.oid)::text,''))from pg_default_acl d").fetchone()[0]
   cls.config=db.execute('select md5(to_jsonb(c)::text)from mcp_events_private.runtime_config c').fetchone()[0]
   cls.cron=db.execute('select md5(jsonb_agg(to_jsonb(c)order by c.jobid)::text)from cron.job c').fetchone()[0]
   cls.vault=db.execute('select md5(jsonb_agg(to_jsonb(v)order by v.id)::text)from vault.secrets v').fetchone()[0]
   db.execute(PROBE.read_text())
 def setUp(self):
  m.execute('update mcp_events_private.runtime_config set enabled=false,last_wake_at=null')
  m.execute('truncate mcp_events_private.wake_nonces,net.http_request_queue')
 def assertDbError(self,code,fn):
  with self.assertRaises(psycopg.Error)as caught:fn()
  self.assertEqual(caught.exception.sqlstate,code)
 def test01_only_two_new_routines_and_bounded_acl_old_catalog_exact(self):
  with m.connection()as db:
   old=db.execute("select p.oid,md5(pg_get_functiondef(p.oid)||'|'||p.proowner::text||'|'||coalesce(p.proacl::text,'')||'|'||coalesce(p.proconfig::text,''))from pg_proc p where p.oid=any(%s::oid[])order by p.oid",([x[0]for x in self.old],)).fetchall()
   self.assertEqual(old,self.old);self.assertEqual(len(old),19)
   total=db.execute("select count(*)from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='mcp_events_private' or(ns.nspname='public' and p.proname like 'sintagma_support_event_%')").fetchone()[0]
   self.assertEqual(total,21)
   for role in ['anon','authenticated','sandbox_exec_support_events_lab']:
    self.assertFalse(db.execute('select has_function_privilege(%s,%s,\'EXECUTE\')',(role,CONSUME)).fetchone()[0])
   self.assertTrue(db.execute('select has_function_privilege(\'service_role\',%s,\'EXECUTE\')',(CONSUME,)).fetchone()[0])
   for role in ['anon','authenticated','service_role','sandbox_exec_support_events_lab']:
    self.assertFalse(db.execute('select has_function_privilege(%s,%s,\'EXECUTE\')',(role,QUEUE)).fetchone()[0])
   self.assertEqual(self.defaults,db.execute("select md5(coalesce(jsonb_agg(to_jsonb(d)order by d.oid)::text,''))from pg_default_acl d").fetchone()[0])
   self.assertEqual(self.cron,db.execute('select md5(jsonb_agg(to_jsonb(c)order by c.jobid)::text)from cron.job c').fetchone()[0])
   self.assertEqual(self.vault,db.execute('select md5(jsonb_agg(to_jsonb(v)order by v.id)::text)from vault.secrets v').fetchone()[0])
   self.assertEqual(self.config,db.execute('select md5(to_jsonb(c)::text)from mcp_events_private.runtime_config c').fetchone()[0])
 def test02_public_grant_still_requires_real_service_role_claim(self):
  n=str(uuid.uuid4());t=now()
  for role in ['anon','authenticated']:
   self.assertDbError('42501',lambda:m.execute_as(role,'select public.sintagma_support_event_consume_probe_nonce(%s,%s)',(n,t),jwt=m.claims()))
  self.assertDbError('42501',lambda:m.service('select public.sintagma_support_event_consume_probe_nonce(%s,%s)',(n,t)))
  self.assertTrue(consume(n,t))
 def test03_only_disabled_runtime_queues_and_consumes(self):
  self.assertIsInstance(queue(),int);self.assertTrue(consume(str(uuid.uuid4()),now()))
  m.execute('update mcp_events_private.runtime_config set enabled=true')
  self.assertDbError('55000',queue);self.assertFalse(consume(str(uuid.uuid4()),now()))
  self.assertEqual(m.scalar('select count(*)from net.http_request_queue'),1)
 def test04_timestamp_window_and_nulls_fail_without_consumption(self):
  t=now()
  for ts in [t-62,t+10,None]:self.assertFalse(consume(str(uuid.uuid4()),ts))
  self.assertFalse(consume(None,t));self.assertEqual(m.scalar('select count(*)from mcp_events_private.wake_nonces'),0)
  self.assertTrue(consume(str(uuid.uuid4()),t))
 def test05_nonce_single_use_concurrent_and_cross_purpose_shared_fence(self):
  n=str(uuid.uuid4());t=now()
  with concurrent.futures.ThreadPoolExecutor(max_workers=2)as pool:results=list(pool.map(lambda _:consume(n,t),range(2)))
  self.assertEqual(sorted(results),[False,True]);self.assertFalse(consume(n,t))
  m.execute('update mcp_events_private.runtime_config set enabled=true')
  self.assertFalse(backend('select public.sintagma_support_event_consume_wake_nonce(%s,%s)',(n,t)))
 def test06_fixed_destination_exact_probe_hmac_and_no_reusable_secret_queue(self):
  request_id=queue()
  with m.connection()as db:
   c=backend('select public.sintagma_support_event_runtime_config()')
   row=db.execute('select id,url,body,params,headers,timeout_milliseconds from net.http_request_queue').fetchone()
  self.assertEqual(row[0],request_id);self.assertEqual(row[1],c['workerUrl']+'?probe=pinning');self.assertEqual(row[2],{});self.assertEqual(row[3],{})
  headers=row[4];self.assertEqual(set(headers),{'Content-Type','x-sintagma-events-timestamp','x-sintagma-events-nonce','x-sintagma-events-signature'})
  self.assertEqual(row[5],15000)
  suffix=headers['x-sintagma-events-timestamp']+'\n'+headers['x-sintagma-events-nonce']
  key=base64.b64decode(c['workerToken']);expected=hmac.new(key,('sintagma-support-events-probe-v1\n'+suffix).encode(),hashlib.sha256).hexdigest()
  wake=hmac.new(key,('sintagma-support-events-wake-v1\n'+suffix).encode(),hashlib.sha256).hexdigest()
  self.assertEqual(headers['x-sintagma-events-signature'],expected);self.assertNotEqual(expected,wake)
  encoded=json.dumps(row,default=str);self.assertNotIn(c['workerToken'],encoded);self.assertNotIn(c['encryptionKey']['key_base64'],encoded);self.assertNotIn('Bearer',encoded)
 def test07_probe_queue_and_consumption_follow_transaction_rollback(self):
  n=str(uuid.uuid4());t=now()
  with m.connection('service_role',{'role':'service_role'})as db:
   db.execute('begin');self.assertTrue(db.execute('select public.sintagma_support_event_consume_probe_nonce(%s,%s)',(n,t)).fetchone()[0]);db.execute('rollback')
  self.assertTrue(consume(n,t))
  with m.connection()as db:
   db.execute('begin');self.assertIsInstance(db.execute('select mcp_events_private.queue_runtime_probe()').fetchone()[0],int);db.execute('rollback')
  self.assertEqual(m.scalar('select count(*)from net.http_request_queue'),0)
 def test08_queue_failure_and_migration_replay_preserve_config_keys_old_definitions(self):
  with m.connection()as db:
   db.execute("select set_config('support_events_lab.fail_net','1',false)")
   self.assertDbError('P0001',lambda:db.execute('select mcp_events_private.queue_runtime_probe()'))
  self.assertEqual(m.scalar('select count(*)from net.http_request_queue'),0)
  # Full DDL contains %ROWTYPE and format('%s'): do not pass an empty parameter
  # tuple through the scalar helper, which makes psycopg parse client placeholders.
  def replay():
   with m.connection()as db:db.execute(PROBE.read_text())
  self.assertDbError('P0001',replay)
  self.assertEqual(self.vault,m.scalar('select md5(jsonb_agg(to_jsonb(v)order by v.id)::text)from vault.secrets v'))
  self.assertEqual(self.config,m.scalar('select md5(to_jsonb(c)::text)from mcp_events_private.runtime_config c'))
  with m.connection()as db:old=db.execute("select p.oid,md5(pg_get_functiondef(p.oid)||'|'||p.proowner::text||'|'||coalesce(p.proacl::text,'')||'|'||coalesce(p.proconfig::text,''))from pg_proc p where p.oid=any(%s::oid[])order by p.oid",([x[0]for x in self.old],)).fetchall()
  self.assertEqual(old,self.old)

if __name__=='__main__':
 result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(ProbeTests))
 out=ROOT/'probe-results';out.mkdir(exist_ok=True)
 report={'mode':'Eight new isolated PostgreSQL17 MODEL probe cases; fake Vault/net/cron, real pgcrypto','tests_run':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'successful':result.wasSuccessful(),'probe_sql_sha256':hashlib.sha256(PROBE.read_bytes()).hexdigest(),
  'limits':['No production SQL','No old48/19 cases rerun','Not actual pg_net/Vault/Edge HMAC/TLS proof','No active delivery or Cloud subscription']}
 (out/'results.json').write_text(json.dumps(report,indent=2));raise SystemExit(0 if result.wasSuccessful()else 1)
