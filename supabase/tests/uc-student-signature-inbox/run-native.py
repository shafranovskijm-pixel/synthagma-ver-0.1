import json, os, pathlib, hashlib, datetime
import psycopg
from psycopg.rows import dict_row
root=pathlib.Path(__file__).resolve().parents[3]
suite=os.environ['UC_CHAIN_SUITE']
allowed={'inbox':('uc-student-signature-inbox','20261123130000_uc_student_signature_inbox.sql'),'chain':('uc-document-chain','20261123140000_uc_document_chain_readmodel.sql')}
if suite not in allowed:raise RuntimeError('Unknown finite UC suite')
folder,migration=allowed[suite]
files=[root/'supabase/tests'/folder/'fixture.sql',root/'supabase/migrations'/migration,root/'supabase/tests'/folder/'acceptance.sql']
output=root/'outputs/uc-document-chain-native'/suite
output.mkdir(parents=True,exist_ok=True)
receipt={'suite':suite,'at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source_files':[{ 'path':str(p.relative_to(root)), 'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files], 'authority':'Fresh isolated native PostgreSQL17 with explicit synthetic existing-helper adapters; no production database or real clients.'}
try:
 with psycopg.connect(autocommit=True,row_factory=dict_row)as conn:
  receipt['native']=conn.execute('select version() as server_version,current_user as actor,pg_backend_pid() as backend_pid').fetchone()
  if not receipt['native']['server_version'].startswith('PostgreSQL 17.'):raise RuntimeError('Expected actual PostgreSQL17')
  conn.execute("DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon')THEN CREATE ROLE anon;END IF;IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated')THEN CREATE ROLE authenticated;END IF;IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role')THEN CREATE ROLE service_role;END IF;END$$;")
  for p in files:
   with conn.cursor()as cur:
    cur.execute(p.read_text(encoding='utf8'),prepare=False)
    result_sets=[]
    while True:
     if cur.description:
      rows=cur.fetchall()
      if p.name=='acceptance.sql':result_sets.append(rows)
     if not cur.nextset():break
    if p.name=='acceptance.sql':receipt['acceptance_result_sets']=result_sets
  receipt['status']='PASS_NATIVE_POSTGRES17_ACTUAL_NEW_READ_RPC'
except Exception as exc:
 receipt['status']='FAIL'
 receipt['error']=str(exc)
 (output/'result.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2,default=str),encoding='utf8')
 raise
(output/'result.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2,default=str),encoding='utf8')
print(json.dumps(receipt,ensure_ascii=False,default=str))
