"""Author source-pinned rollback/manifest only. Never connects to any database.

This is not a deployer or an acceptance runner. Native catalog/ACL/concurrency,
rollback and UC013 integration checks are still required before release.
"""
from pathlib import Path
import hashlib
import json
import re

root = Path(__file__).resolve().parents[4]
folder = Path(__file__).resolve().parent
source_path = root / 'supabase/migrations/20261020140000_uc_learning_outcome_foundation.sql'
source = source_path.read_text(encoding='utf-8').replace('\r\n', '\n')
source_sha = hashlib.sha256(source.encode()).hexdigest()
source_md5 = hashlib.md5(source.encode()).hexdigest()
predecessors = json.loads((root / 'supabase/tests/fixtures/uc-learning-outcomes-erasure-predecessors.json').read_text(encoding='utf-8'))
tables = ['uc_learning_criteria_versions', 'uc_learning_outcome_states', 'uc_learning_attempt_contexts', 'uc_learning_machine_results', 'uc_learning_attestation_decisions', 'uc_learning_outcome_requests']
functions = []
for match in re.finditer(r'CREATE FUNCTION public\.(\w+)\(([^\n]*?)\) RETURNS (\w+(?:\.\w+)?) LANGUAGE (\w+)([^$]*?)AS \$fn\$([\s\S]*?)\$fn\$;', source):
    name, params, result, language, options, body = match.groups()
    types = [re.sub(r'\s+DEFAULT\s+.*$', '', arg.strip(), flags=re.I).split(None, 1)[1] for arg in params.split(',') if arg.strip()]
    path = re.search(r'SET search_path=([a-z_,]+)', options).group(1)
    functions.append({'signature': 'public.' + name + '(' + ','.join(types) + ')', 'name': name,
                      'return_type': result, 'language': language, 'security_definer': 'SECURITY DEFINER' in options,
                      'volatility': 'i' if 'IMMUTABLE' in options else 's' if 'STABLE' in options else 'v',
                      'search_path': 'search_path=' + path.replace(',', ', '), 'body_md5': hashlib.md5(body.encode()).hexdigest()})
if len(functions) != 26 or len({f['signature'] for f in functions}) != 26:
    raise ValueError('Expected exactly the reviewed 26 new functions')
old_pins = [{'signature': sig, 'source_md5': digest} for sig, digest in re.findall(r"\('(public\.[^']+)','([a-f0-9]{32})'\)", source[:source.index('CREATE TABLE')])]
if len(old_pins) != 16:
    raise ValueError('Expected exactly sixteen original access/test source pins')
payload = json.dumps({'new_functions': functions, 'erasure': predecessors['functions'], 'old_pins': old_pins}, ensure_ascii=False, separators=(',', ':'))
if '$uc014_payload$' in payload or '$uc014_source$' in source:
    raise ValueError('Dollar quote delimiter collision')

header = f"""-- PREPARED / NOT EXECUTED. Fail-closed empty-foundation rollback only.
-- Canonical LF migration SHA256 {source_sha}; MD5 {source_md5}.
-- Production UC014 is held behind UC013 and native acceptance. Never run this
-- against populated outcome tables. Use a separately reviewed forward repair
-- for real records. No CASCADE, business-row cleanup, legacy issuer or old ledger
-- mutation is part of this rollback. Execute the whole transaction unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';
LOCK TABLE public.test_attempt_sessions IN ACCESS EXCLUSIVE MODE;
LOCK TABLE {', '.join('public.' + t for t in tables)} IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE uc014_rollback_guard(ledger_hash text NOT NULL)ON COMMIT DROP;
INSERT INTO uc014_rollback_guard SELECT md5(coalesce(jsonb_agg(to_jsonb(m)ORDER BY m.version),'[]')::text) FROM supabase_migrations.schema_migrations m WHERE version<>'20261020140000';
DO $rollback$
DECLARE proof jsonb:=$uc014_payload${payload}$uc014_payload$::jsonb;
 migration text:=$uc014_source${source}$uc014_source$;
 f jsonb;variant jsonb;sig text;t text;proc_meta record;nonempty boolean;old_owner oid;old_acl aclitem[];restored text;
BEGIN
 IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261020140000'AND(name IS DISTINCT FROM 'uc_learning_outcome_foundation'OR statements IS DISTINCT FROM ARRAY[migration])) THEN RAISE EXCEPTION 'UC014_ROLLBACK_LEDGER_MISMATCH';END IF;
 IF(SELECT count(*)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND(p.proname LIKE 'uc_learning_%'OR p.proname IN('read_learning_outcome','apply_learning_outcome_action')))<>26 THEN RAISE EXCEPTION 'UC014_ROLLBACK_FUNCTION_INVENTORY_CHANGED';END IF;
 IF(SELECT count(*)FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relkind IN('r','p')AND c.relname LIKE 'uc_learning_%')<>6 THEN RAISE EXCEPTION 'UC014_ROLLBACK_TABLE_INVENTORY_CHANGED';END IF;
 FOREACH t IN ARRAY ARRAY[{','.join(repr(t) for t in tables)}] LOOP
  IF EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=format('public.%I',t)::regclass AND(c.relowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user)OR NOT c.relrowsecurity))OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE c.oid=format('public.%I',t)::regclass AND a.grantee<>c.relowner) THEN RAISE EXCEPTION 'UC014_ROLLBACK_TABLE_METADATA_CHANGED';END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I)',t) INTO nonempty;
  IF nonempty THEN RAISE EXCEPTION 'UC014_ROLLBACK_POPULATED_REFUSED';END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=format('public.%I',t)::regclass AND tgname='uc_learning_private_history'AND tgfoid=to_regprocedure('public.uc_learning_guard()')AND tgtype=31 AND tgenabled='O'AND NOT tgisinternal AND tgqual IS NULL AND octet_length(tgargs)=0) THEN RAISE EXCEPTION 'UC014_ROLLBACK_GUARD_CHANGED';END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.test_attempt_sessions'::regclass AND tgname='uc_learning_new_session_context'AND tgfoid=to_regprocedure('public.uc_learning_observe_session()')AND tgtype=5 AND tgenabled='O'AND NOT tgisinternal AND tgqual IS NULL AND octet_length(tgargs)=0) THEN RAISE EXCEPTION 'UC014_ROLLBACK_OBSERVER_CHANGED';END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(proof->'old_pins') LOOP
  IF md5(pg_get_functiondef(to_regprocedure(f->>'signature')))IS DISTINCT FROM f->>'source_md5' THEN RAISE EXCEPTION 'UC014_ROLLBACK_OLD_SOURCE_CHANGED';END IF;
 END LOOP;
 FOR f IN SELECT value FROM jsonb_array_elements(proof->'new_functions') LOOP
  SELECT p.*,l.lanname INTO proc_meta FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure(f->>'signature');
  IF proc_meta.oid IS NULL OR proc_meta.proowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user)OR md5(proc_meta.prosrc)<>f->>'body_md5'OR proc_meta.lanname<>f->>'language'OR proc_meta.prosecdef<>(f->>'security_definer')::boolean OR proc_meta.provolatile::text<>f->>'volatility'OR proc_meta.prorettype<>to_regtype(f->>'return_type')OR proc_meta.proretset OR proc_meta.prokind<>'f'OR proc_meta.proleakproof OR proc_meta.proparallel<>'u'OR proc_meta.proconfig IS DISTINCT FROM ARRAY[f->>'search_path'] THEN RAISE EXCEPTION 'UC014_ROLLBACK_FUNCTION_METADATA_CHANGED';END IF;
  IF EXISTS(SELECT 1 FROM aclexplode(coalesce(proc_meta.proacl,acldefault('f',proc_meta.proowner)))a WHERE a.grantee<>proc_meta.proowner AND NOT(f->>'name'IN('read_learning_outcome','apply_learning_outcome_action')AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='authenticated')AND a.privilege_type='EXECUTE'AND NOT a.is_grantable)) THEN RAISE EXCEPTION 'UC014_ROLLBACK_FUNCTION_ACL_CHANGED';END IF;
  IF f->>'name'IN('read_learning_outcome','apply_learning_outcome_action')AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(proc_meta.proacl,acldefault('f',proc_meta.proowner)))a WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname='authenticated')AND a.privilege_type='EXECUTE'AND NOT a.is_grantable) THEN RAISE EXCEPTION 'UC014_ROLLBACK_API_ACL_CHANGED';END IF;
 END LOOP;
 FOR sig IN SELECT key FROM jsonb_each(proof->'erasure') LOOP
  SELECT proowner,proacl,pg_get_functiondef(oid) INTO old_owner,old_acl,restored FROM pg_proc WHERE oid=to_regprocedure('public.'||sig);
  SELECT value INTO variant FROM jsonb_array_elements(proof->'erasure'->sig)WHERE value->>'patchedMd5'=md5(restored);
  IF variant IS NULL THEN RAISE EXCEPTION 'UC014_ROLLBACK_ERASURE_SOURCE_CHANGED';END IF;
  EXECUTE variant->>'definition';
  IF pg_get_functiondef(to_regprocedure('public.'||sig))IS DISTINCT FROM variant->>'definition'OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.'||sig)AND proowner=old_owner AND proacl IS NOT DISTINCT FROM old_acl) THEN RAISE EXCEPTION 'UC014_ROLLBACK_ERASURE_RESTORE_FAILED';END IF;
 END LOOP;
END;$rollback$;
DROP TRIGGER uc_learning_new_session_context ON public.test_attempt_sessions;
"""
drop_triggers = '\n'.join(f'DROP TRIGGER uc_learning_private_history ON public.{t};' for t in tables)
drop_functions = '\n'.join(f'DROP FUNCTION {f["signature"]};' for f in reversed(functions))
drop_tables = '\n'.join(f'DROP TABLE public.{t};' for t in reversed(tables))
tail = """
DELETE FROM supabase_migrations.schema_migrations WHERE version='20261020140000';
DO $post$ BEGIN
 IF(SELECT ledger_hash FROM uc014_rollback_guard)IS DISTINCT FROM(SELECT md5(coalesce(jsonb_agg(to_jsonb(m)ORDER BY m.version),'[]')::text)FROM supabase_migrations.schema_migrations m WHERE version<>'20261020140000')THEN RAISE EXCEPTION 'UC014_ROLLBACK_OLD_LEDGER_CHANGED';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND(p.proname LIKE 'uc_learning_%'OR p.proname IN('read_learning_outcome','apply_learning_outcome_action')))OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relkind IN('r','p')AND c.relname LIKE 'uc_learning_%')THEN RAISE EXCEPTION 'UC014_ROLLBACK_POSTCHECK_FAILED';END IF;
END;$post$;
COMMIT;
"""
rollback = header + drop_triggers + '\n' + drop_functions + '\n' + drop_tables + tail
(folder / 'rollback-empty-foundation.sql').write_text(rollback, encoding='utf-8', newline='\n')
manifest = {'status': 'SOURCE_AUTHORED_NOT_EXECUTED_RELEASE_HELD', 'base': '04febc6e424e922ed37d1f57f7a5afb0b39361db',
            'version': '20261020140000', 'name': 'uc_learning_outcome_foundation', 'migration': str(source_path.relative_to(root)).replace('\\', '/'),
            'migration_canonical_lf_sha256': source_sha, 'migration_canonical_lf_md5': source_md5,
            'raw_migration_sha256': hashlib.sha256(source_path.read_bytes()).hexdigest(), 'new_tables': tables,
            'new_functions': functions, 'original_16_source_pins': old_pins,
            'rollback': 'rollback-empty-foundation.sql', 'rollback_sha256': hashlib.sha256(rollback.encode()).hexdigest(),
            'execution_count': 0, 'release_gates': ['UC013 integration/release first', 'independent frozen implementation review', 'coordinated actual focused SQL/UI tests', 'native PostgreSQL Auth/ACL/default-grant and legacy start/resume/photo/quota/erasure regressions', 'both finite erasure predecessors and empty-only rollback restore', 'fresh live metadata/ledger baseline and forward version review', 'strict closure build and production browser acceptance'],
            'not_claimed': ['UC014 complete roadmap acceptance', 'production deployed', 'test pass', 'native concurrency', 'original N07 or native26', 'legal attestation protocol/commission/signatures', 'legacy issuance replaced']}
(folder / 'source-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps({'source_sha256': source_sha, 'new_function_count': len(functions), 'rollback_sha256': manifest['rollback_sha256'], 'execution': 'source artifact writing only; no database or tests'}, ensure_ascii=False))
