"""Actual PostgreSQL17 regressions; refuses every non-dedicated database target."""
import argparse,hashlib,json,re
from pathlib import Path
from native_apply import HERE,MIGRATION,ARTIFACTS,query,close_query
from pgwire_lab import LabConnection
from verify_sources import verify

EXPECTED_ASSERTIONS=343

def control(sql):
 connection=LabConnection('postgres','npa250-control')
 try:return connection.query(sql,reset=False)
 finally:connection.close()

def apply_file(path,fixture=False):
 text=path.read_text(encoding='utf-8')
 if fixture:
  text=text.replace('GRANT CREATE ON DATABASE rtn_erasure_lab_ci TO postgres;',
   'GRANT CREATE ON DATABASE rtn_npa250_lab_ci TO postgres;')
  # This captured base already wraps each foundation migration once. Do not
  # surround that composite fixture with a second transaction wrapper.
  output=query(text)
 else:
  output='\n'.join(query('BEGIN;\nSET LOCAL ROLE postgres;\n'+chunk+'\nCOMMIT;')
   for chunk in text.split('-- NATIVE COMMIT BOUNDARY'))
 (ARTIFACTS/(path.name+'.native.log')).write_text(output,encoding='utf-8')
 return len(re.findall(r"lab\.(?:check|denied)\('",text))

def reset():
 close_query()
 expected=(HERE/'native-pgdata').resolve()
 actual=Path(control('SHOW data_directory;')).resolve()
 version=int(control('SHOW server_version_num;'))
 if actual!=expected or control('SHOW port;')!='54852' or not 170000<=version<180000:
  raise RuntimeError('Refusing to reset a different PostgreSQL cluster/version')
 if control('SELECT current_user;')!='lab_bootstrap':raise RuntimeError('Synthetic bootstrap role required')
 control('DROP DATABASE IF EXISTS rtn_npa250_lab_ci;')
 control('CREATE DATABASE rtn_npa250_lab_ci;')
 apply_file(HERE/'fixtures/base-setup.sql',True)
 apply_file(HERE/'fixtures/20261114123000_rtn_account_erasure.sql')
 apply_file(HERE/'fixtures/seed.sql')
 apply_file(HERE/'fixtures/20261114124000_rtn_normative_review_admission.sql')
 # Only the synthetic Storage adapter needs these fields. No product Storage
 # schema/ownership/policy is altered by the migration payload.
 query("SET ROLE postgres;ALTER TABLE storage.objects ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;ALTER TABLE storage.objects ADD COLUMN created_at timestamptz DEFAULT clock_timestamp();")
 apply_file(MIGRATION)
 apply_file(HERE/'fixtures/npa-seed.sql')

def run():
 sources=verify()
 ARTIFACTS.mkdir(exist_ok=True)
 (ARTIFACTS/'verified-sources.json').write_text(json.dumps(sources,indent=2),encoding='utf-8')
 reset();total=0
 total+=apply_file(HERE/'fixtures/npa-unsupported-federal-law.sql');print('Unknown FederalLaw ActualID cases passed; original baseline restored',flush=True)
 for name in ['npa-cases.sql','npa-advanced.sql']:
  total+=apply_file(HERE/'fixtures'/name);print(name+' passed',flush=True)
 apply_file(HERE/'fixtures/npa-contract-negatives.sql')
 total+=int(query("SELECT lab.ctx('negative_contract_checks');"))
 print('Typed mandatory field mutations passed',flush=True)
 from native_races import run_races,run_source_races,run_configure_intent_race
 total+=run_races();print('Native manifest races passed',flush=True)
 for name in ['npa-source-cases.sql','npa-exhaustion.sql']:
  total+=apply_file(HERE/'fixtures'/name);print(name+' passed',flush=True)
 total+=run_source_races();print('Native source admission races passed',flush=True)
 total+=run_configure_intent_race();print('Native configure release-intent race passed',flush=True)
 total+=apply_file(HERE/'fixtures/npa-privacy.sql');print('npa-privacy.sql passed',flush=True)
 if total!=EXPECTED_ASSERTIONS:raise AssertionError(f'Expected {EXPECTED_ASSERTIONS} assertions, observed {total}')
 result={'engine':query('SELECT version();'),'loopback':'127.0.0.1:54852','database':'rtn_npa250_lab_ci',
  'baseline':sources['fixture_baseline'],'integration_base':sources['integration_base'],
  'migration_sha256':hashlib.sha256(MIGRATION.read_bytes()).hexdigest(),'assertion_calls':total,'passed':True,
  'scope':'Synthetic isolated native only. No production calls. Includes assertions inside rolled-back negative fixtures.'}
 (ARTIFACTS/'NATIVE_RESULT.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
 print(json.dumps(result,indent=2))

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--verify-only',action='store_true')
 args=parser.parse_args()
 try:
  if args.verify_only:print(json.dumps(verify(),indent=2))
  else:run()
 finally:close_query()
