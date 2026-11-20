"""Source-only dedicated conditional copy24 native stage, called after accepted89.
No standalone execution, production endpoint, credential, server lifecycle or Git.
"""
from __future__ import annotations
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import threading

DATABASE = 'sintagma_copy24_lab_20261028'
CORE_DATABASE = 'sintagma_pcr_v4_r2_lab_20261028'
PROFILE_DATABASE = 'sintagma_self_profile_lab_20261028'
INPUT_NAMES = [
    'concurrency_cases.py', 'run_self_profile_stage.py', 'copy-pcr-core.candidate.sql',
    'copy-file-r4.candidate.sql', 'copy-file-delivery.candidate.sql', 'copy-file-delivery.inverse.sql',
    'copy24-modeled-bootstrap.sql', 'copy24-modeled-actors-and-retained-fixtures.sql',
    'copy24-conditional-capability.lab-only.sql', 'copy24-exact-capability-restore.sql',
    'copy24-inverse-guard.exact.sql', 'copy24-empty-inverse-rollback.lab-only.sql',
    'copy24-current23-preimage-component.exact.lab-only.sql', 'copy24_cases.py', 'run_copy24_stage.py',
]

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def profile_snapshot_sql():
    # Hash only the accepted synthetic profile12 database; no plaintext personal fields.
    relations = ['auth.users', 'public.profiles', 'public.user_roles', 'public.org_staff', 'public.admin_staff',
                 'public.organizations', 'public.companies', 'public.student_groups', 'public.pep_agreements',
                 'public.account_deletion_revocations', 'public.achievements', 'public.user_achievements',
                 'public.qa_retained_results']
    fields = ["'" + relation + "',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(x)ORDER BY to_jsonb(x)::text),'[]')::text,'UTF8')),'hex')FROM " + relation + ' x)' for relation in relations]
    fields.append("'functions',(SELECT encode(sha256(convert_to(coalesce(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,''),''ORDER BY p.oid::regprocedure::text),''),'UTF8')),'hex')FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','auth')AND p.prokind='f')")
    return 'SELECT jsonb_build_object(' + ','.join(fields) + ');'

def run_copy24_stage(here, command, base, interactive_base, env, output, core, expected_manifest_sha256):
    here, output = Path(here).resolve(strict=True), Path(output).resolve(strict=True)
    proof = {'status': 'RUNNING_CONDITIONAL_NATIVE_COPY24_MODEL', 'production': False, 'CloudWrites': False,
             'ordinaryCloudAuth': False, 'realStorageHTTP': False, 'databaseCreated': 'NOT_REQUESTED',
             'candidateCommitState': 'NOT_REQUESTED', 'actualGroups': [], 'nativeSessionExits': [],
             'old89Preserved': False, 'capabilityOriginalRestored': False, 'fullPROG012Accepted': False}
    pins, failed, trace_count = [], False, 0
    parent, before_core, before_profile = None, None, None
    try:
        if os.environ.get('GITHUB_ACTIONS') != 'true' or sys.platform != 'linux':
            raise RuntimeError('COPY24_PRIVATE_LINUX_GITHUB_ONLY')
        if (core.get('actualCases') != ['PCRV2S' + str(i).zfill(2) for i in range(1, 19)]
                or core.get('actualAuthSubgroups') != ['S02_NULL_ROLE_POSITIVE_ADMIN_DENIED', 'S02_SAME_ADMIN_AUTHENTICATED_ALLOWED']
                or [x.split(' ', 1)[0] for x in core.get('actualConcurrencyCases', [])] != ['PCRV2C' + str(i).zfill(2) for i in range(1, 19)]
                or len(core.get('actualCascadeSubgroups', [])) != 10
                or core.get('readStage', {}).get('actualCases') != ['PCRUIR' + str(i).zfill(2) for i in range(1, 14)]
                or not core.get('readStage', {}).get('status', '').startswith('PASS_')
                or core.get('fileStage', {}).get('actualGroups') != ['DB14-R4-' + str(i).zfill(2) for i in range(1, 17)]
                or not core.get('fileStage', {}).get('status', '').startswith('PASS_')
                or core.get('selfProfileStage', {}).get('actualGroups') != ['PSELF' + str(i).zfill(2) for i in range(1, 13)]
                or not core.get('selfProfileStage', {}).get('status', '').startswith('PASS_')):
            raise RuntimeError('UNCHANGED_ACCEPTED89_REQUIRED_BEFORE_COPY_MODEL')
        for group in (core, core.get('fileStage', {}), core.get('selfProfileStage', {})):
            exits = group.get('nativeSessionExits')
            if not exits or any(x['exitCode'] != 0 or x.get('closeError') or x.get('forcedCleanupFallback') for x in exits):
                raise RuntimeError('PARENT89_NATIVE_EXITS_MUST_BE_NATURAL_ZERO')
        if base[-1] != '--dbname=' + CORE_DATABASE or interactive_base[-1] != '--dbname=' + CORE_DATABASE:
            raise RuntimeError('EXACT_EXISTING_REVIEWED_PSQL_ARGV_REQUIRED')
        manifest_bytes = (here / 'ci-copy24-inputs.json').read_bytes()
        if hashlib.sha256(manifest_bytes).hexdigest() != expected_manifest_sha256:
            raise RuntimeError('REVIEWED_COPY24_INPUT_MANIFEST_REQUIRED')
        pins = json.loads(manifest_bytes)['files']
        if sorted(p['path'] for p in pins) != sorted(INPUT_NAMES):
            raise RuntimeError('EXACT_FIFTEEN_COPY24_INPUT_FILES_REQUIRED')
        for pin in pins:
            target = (here / pin['path']).resolve(strict=True)
            if target.parent != here:
                raise RuntimeError('COPY24_INPUT_PATH_OUTSIDE_FINITE_SOURCE_DIRECTORY')
            raw = target.read_bytes()
            if len(raw) != pin['bytes'] or hashlib.sha256(raw).hexdigest() != pin['sha256']:
                raise RuntimeError('COPY24_SOURCE_DRIFT')
        # Imports define only already reviewed helpers/constants; neither import runs SQL or old test cases.
        parent = load('copy24_unchanged_parent_snapshot', here / 'run_self_profile_stage.py')
        profile_base = base[:-1] + ['--dbname=' + PROFILE_DATABASE]
        before_core = json.loads(command('10c-00-original77-before', base + ['-A', '-t', '-c', parent.CORE_SNAPSHOT_SQL]).stdout.decode('utf-8').strip())
        before_profile = json.loads(command('10c-01-original-profile12-before', profile_base + ['-A', '-t', '-c', profile_snapshot_sql()]).stdout.decode('utf-8').strip())
        proof['old77Before'], proof['profile12Before'] = before_core, before_profile
        absent = command('10c-02-copy-model-database-absent', base + ['-A', '-t', '-c', "SELECT NOT EXISTS(SELECT 1 FROM pg_database WHERE datname='" + DATABASE + "');"])
        if absent.stdout.decode('utf-8').strip() != 't':
            raise RuntimeError('COPY24_DATABASE_MUST_NOT_EXIST_NO_REUSE')
        proof['databaseCreated'] = 'REQUESTED_OUTCOME_UNKNOWN'
        command('10c-03-create-fresh-copy-model', base + ['-c', 'CREATE DATABASE ' + DATABASE + ' TEMPLATE template0 OWNER postgres;'])
        proof['databaseCreated'] = 'CREATED_NATIVE_PSQL_EXIT0_ACK'
        copy_base = base[:-1] + ['--dbname=' + DATABASE]
        copy_interactive = interactive_base[:-1] + ['--dbname=' + DATABASE]
        guard = "SELECT json_build_object('database',current_database(),'address',host(inet_server_addr()),'port',inet_server_port(),'data',current_setting('data_directory'),'actor',current_user,'version',current_setting('server_version_num'),'marker',current_setting('pcr.lab_authorized',true),'empty',to_regnamespace('auth')IS NULL AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'));"
        observed = json.loads(command('10c-04-copy-model-preflight', copy_base + ['-A', '-t', '-c', guard]).stdout.decode('utf-8').strip())
        if observed != {'database': DATABASE, 'address': '127.0.0.1', 'port': 5432, 'data': '/var/lib/postgresql/data',
                        'actor': 'postgres', 'version': '170011', 'marker': 'source-reviewed-root-run-only', 'empty': True}:
            raise RuntimeError('COPY24_EXACT_EMPTY_PRIVATE_PG1711_REQUIRED')
        proof['preflight'] = observed
        for label, filename in (
            ('10c-05-modeled-typed-bootstrap', 'copy24-modeled-bootstrap.sql'),
            ('10c-06-synthetic-actors-old-fixtures', 'copy24-modeled-actors-and-retained-fixtures.sql'),
            ('10c-07-exact-PCR-core', 'copy-pcr-core.candidate.sql'),
            ('10c-08-exact-file-R4', 'copy-file-r4.candidate.sql'),
            ('10c-09-exact-copy-candidate', 'copy-file-delivery.candidate.sql')):
            if filename == 'copy-file-delivery.candidate.sql': proof['candidateCommitState'] = 'REQUESTED_OUTCOME_UNKNOWN'
            command(label, copy_base + ['-f', '-'], (here / filename).read_bytes())
            if filename == 'copy-file-delivery.candidate.sql': proof['candidateCommitState'] = 'COMMITTED_NATIVE_PSQL_EXIT0_ACK'
        with (output / '10c-copy-native24.jsonl').open('x', encoding='utf-8') as log:
            lock = threading.Lock()
            def trace(value):
                nonlocal trace_count
                with lock:
                    trace_count += 1
                    if value.get('case'): proof['actualGroups'].append(value['case'])
                    if value.get('copyNativeSessionExit'): proof['nativeSessionExits'].append(value['copyNativeSessionExit'])
                    if value.get('copyCapabilityRestore'):
                        receipt = value['copyCapabilityRestore']
                        proof['capabilityRestoreReceipt'] = receipt
                        proof['capabilityOriginalRestored'] = isinstance(receipt, dict) and receipt.get('exactDefinitionOwnerACL') is True
                    log.write(json.dumps(value, ensure_ascii=False) + '\n'); log.flush()
            native = load('copy24_unchanged_native_session', here / 'concurrency_cases.py')
            cases = load('copy24_conditional_modeled_cases', here / 'copy24_cases.py')
            result = cases.run_stage(native.Session, copy_interactive, env, trace)
        if result.get('actualGroups') != ['COPY24-' + str(i).zfill(2) for i in range(1, 25)] or proof['actualGroups'] != result['actualGroups']:
            raise RuntimeError('COPY24_EXACT_TWENTY_FOUR_NATIVE_GROUPS_REQUIRED')
        if len(proof['nativeSessionExits']) != 9 or any(x['exitCode'] != 0 or x['closeError'] for x in proof['nativeSessionExits']):
            raise RuntimeError('COPY24_ALL_NINE_NATIVE_CLIENTS_MUST_EXIT_NATURALLY_ZERO')
        if result.get('capabilityOriginalRestored') is not True or not proof.get('capabilityRestoreReceipt', {}).get('exactDefinitionOwnerACL'):
            raise RuntimeError('COPY24_LAB_CAPABILITY_EXACT_RESTORE_REQUIRED')
        proof.update(result)
        after_core = json.loads(command('10c-10-original77-after', base + ['-A', '-t', '-c', parent.CORE_SNAPSHOT_SQL]).stdout.decode('utf-8').strip())
        after_profile = json.loads(command('10c-11-original-profile12-after', profile_base + ['-A', '-t', '-c', profile_snapshot_sql()]).stdout.decode('utf-8').strip())
        proof['old77After'], proof['profile12After'] = after_core, after_profile
        if after_core != before_core or after_profile != before_profile:
            raise RuntimeError('COPY24_ORIGINAL89_DATA_FUNCTION_OR_SHARED_ROLE_DRIFT')
        proof['old89Preserved'] = True
        return proof
    except Exception as error:
        failed = True
        proof['status'] = 'FAIL_CONDITIONAL_COPY24_MODEL_OR_GUARD_NO_RETRY'
        proof['errorType'], proof['errorCode'] = type(error).__name__, str(error)[:600]
        raise
    finally:
        proof['traceEventCount'] = trace_count
        # A failing new stage must retain a bounded readback of the previously accepted89 too; never mask its primary failure.
        if failed and parent is not None and before_core is not None and before_profile is not None:
            try:
                fail_core = json.loads(command('10c-failure-original77-after', base + ['-A', '-t', '-c', parent.CORE_SNAPSHOT_SQL]).stdout.decode('utf-8').strip())
                fail_profile = json.loads(command('10c-failure-profile12-after', base[:-1] + ['--dbname=' + PROFILE_DATABASE, '-A', '-t', '-c', profile_snapshot_sql()]).stdout.decode('utf-8').strip())
                proof['old77After'], proof['profile12After'] = fail_core, fail_profile
                proof['old89Preserved'] = fail_core == before_core and fail_profile == before_profile
            except Exception as error:
                proof['old89FailureReadbackError'] = {'type': type(error).__name__, 'message': str(error)[:600]}
        try:
            proof['sourceUnchanged'] = bool(pins) and all((here / p['path']).is_file() and hashlib.sha256((here / p['path']).read_bytes()).hexdigest() == p['sha256'] for p in pins)
        except Exception as error:
            proof['sourceUnchanged'] = False
            proof['sourceReadbackError'] = {'type': type(error).__name__, 'message': str(error)[:600]}
        proof['cleanupFailures'] = [x for x in proof['nativeSessionExits'] if x['exitCode'] != 0 or x['closeError']]
        late = proof['status'].startswith('PASS_') and (not proof['sourceUnchanged'] or not proof['old89Preserved'] or proof['cleanupFailures'] or not proof['capabilityOriginalRestored'])
        if late: proof['status'] = 'FAIL_COPY24_FINAL_SOURCE_OLD89_OR_NATIVE_EXIT_READBACK'
        (output / '10c-copy24-result.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        if late and not failed: raise RuntimeError('COPY24_FINAL_SOURCE_OLD89_NATIVE_EXIT_OR_RESTORE_FAILURE')
