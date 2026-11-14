"""Check reviewed source bytes without generating or rewriting product SQL."""
from pathlib import Path
import hashlib,json
from native_apply import HERE,ROOT,MIGRATION

EXPECTED_MIGRATION_SHA256='01e85d16bcc8d1c94be059274d23e27c20bc9b92913750cf457e490edcba31dc'

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def verify():
 manifest=json.loads((HERE/'SOURCE_PROVENANCE.json').read_text(encoding='utf-8'))
 if digest(MIGRATION)!=EXPECTED_MIGRATION_SHA256:
  raise RuntimeError('Frozen NPA250 migration bytes changed; reviewed update required')
 for item in manifest['fixture_sources']:
  path=HERE/'fixtures'/item['file']
  if digest(path)!=item['sha256']:raise RuntimeError('Frozen synthetic fixture changed: '+item['file'])
 for item in manifest['foundation_files']:
  # The captured fixture source is canonical LF. Git may expose CRLF in a
  # Windows checkout; this comparison preserves that declared normalization.
  path=ROOT/item['path']
  canonical=path.read_text(encoding='utf-8').encode('utf-8')
  if hashlib.sha256(canonical).hexdigest()!=item['canonical_lf_sha256']:
   raise RuntimeError('Foundation source differs from the reviewed fixture: '+item['path'])
 return {'migration':str(MIGRATION.relative_to(ROOT)),'migration_sha256':EXPECTED_MIGRATION_SHA256,
  'fixture_baseline':manifest['baseline_git'],'integration_base':manifest['integration_base_git'],
  'fixture_count':len(manifest['fixture_sources']),'foundation_count':len(manifest['foundation_files'])}

if __name__=='__main__':print(json.dumps(verify(),indent=2))
