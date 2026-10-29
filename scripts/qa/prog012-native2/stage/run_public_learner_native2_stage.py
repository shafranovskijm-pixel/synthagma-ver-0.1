"""SOURCE ONLY: new two-case stage for an already reviewed official private PG17.11 service.
The caller supplies the unchanged bounded native command/Session transport.
No service launch, credentials, role creation, old suite execution or product deploy.
"""
from __future__ import annotations
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import threading

DATABASE = 'sintagma_pcc_public_native2_lab_20261029'
ORDER = [
    'copy24-modeled-bootstrap.sql', 'copy24-modeled-actors-and-retained-fixtures.sql',
    'copy-pcr-core.candidate.sql', 'copy-file-r4.candidate.sql', 'copy-file-delivery.candidate.sql',
    'current-capture6.modeled.candidate.sql', 'current-authority12.modeled-schema-extension.sql',
    'current-authority12.modeled.candidate.sql',
]
EXPECTED_INPUTS = sorted(['inputs/' + name for name in ORDER] + [
    'inputs/concurrency_cases.py', 'inputs/copy24_cases.py',
    'inputs/pcl2-conditional-capability.lab-only.sql', 'inputs/pcl2-exact-capability-restore.sql',
    'cases/public_learner_grant_prefix_native2.py', 'stage/run_public_learner_native2_stage.py',
])
ROLE_SNAPSHOT = """SELECT jsonb_build_object(
 'roles',(SELECT jsonb_agg(jsonb_build_object('oid',r.oid,'name',r.rolname,'super',r.rolsuper,'inherit',r.rolinherit,
 'createRole',r.rolcreaterole,'createDb',r.rolcreatedb,'login',r.rolcanlogin,'replication',r.rolreplication,
 'bypassRls',r.rolbypassrls,'validUntil',r.rolvaliduntil)ORDER BY r.rolname)FROM pg_roles r
 WHERE r.rolname IN('anon','authenticated','service_role')),
 'memberships',(SELECT coalesce(jsonb_agg(jsonb_build_object('role',m.roleid,'member',m.member,'grantor',m.grantor,
 'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)ORDER BY m.roleid,m.member,m.grantor),'[]'::jsonb)
 FROM pg_auth_members m WHERE m.roleid IN(SELECT oid FROM pg_roles WHERE rolname IN('anon','authenticated','service_role'))
 OR m.member IN(SELECT oid FROM pg_roles WHERE rolname IN('anon','authenticated','service_role'))));"""
SERVER_GUARD = """SELECT jsonb_build_object('database',current_database(),'address',host(inet_server_addr()),
 'port',inet_server_port(),'data',current_setting('data_directory'),'actor',current_user,'session',session_user,
 'version',current_setting('server_version_num'),'marker',current_setting('pcr.lab_authorized',true),
 'isolation',current_setting('transaction_isolation'),'origin',current_setting('session_replication_role'),
 'empty',to_regnamespace('auth')IS NULL AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public')AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'));"""


def load_definitions(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def json_command(command, label, argv, sql):
    raw = command(label, argv + ['-A', '-t', '-c', sql]).stdout.decode('utf-8').strip()
    return json.loads(raw)


def expected_guard(database):
    return {'database': database, 'address': '127.0.0.1', 'port': 5432, 'data': '/var/lib/postgresql/data',
            'actor': 'postgres', 'session': 'postgres', 'version': '170011',
            'marker': 'source-reviewed-root-run-only', 'isolation': 'read committed', 'origin': 'origin', 'empty': True}


def run_public_learner_native2_stage(here, command, base, interactive_base, env, output, expected_manifest_sha256):
    here, output = Path(here).resolve(strict=True), Path(output).resolve(strict=True)
    proof = {'status': 'RUNNING_TWO_NEW_PUBLIC_LEARNER_COMPONENTS', 'production': False,
             'realJWTStorageCloudUI': False, 'actualGroups': [], 'nativeSessionExits': [],
             'databaseCreateState': 'NOT_REQUESTED', 'capabilityOriginalRestored': False,
             'oldCaseBodiesExecuted': 0, 'globalThreeModelRolesUnchanged': False, 'fullPROG012Accepted': False}
    created, failed, before_roles, trace_count = False, False, None, 0
    try:
        if os.environ.get('GITHUB_ACTIONS') != 'true' or sys.platform != 'linux':
            raise RuntimeError('PCL2_OFFICIAL_PRIVATE_LINUX_CI_SERVICE_ONLY')
        if base[-1] != '--dbname=postgres' or interactive_base[-1] != '--dbname=postgres':
            raise RuntimeError('PCL2_REVIEWED_FRESH_SERVICE_CONTROL_ARGV_REQUIRED')
        if any('postgresql://' in str(arg) or 'postgres://' in str(arg) for arg in base + interactive_base):
            raise RuntimeError('PCL2_NO_DATABASE_URI_OR_CREDENTIAL_ARGUMENTS')
        manifest_bytes = (here / 'pcl2-inputs.json').read_bytes()
        if hashlib.sha256(manifest_bytes).hexdigest() != expected_manifest_sha256:
            raise RuntimeError('PCL2_REVIEWED_INPUT_MANIFEST_REQUIRED')
        manifest = json.loads(manifest_bytes)
        if sorted(p['path'] for p in manifest['files']) != EXPECTED_INPUTS or manifest['database'] != DATABASE:
            raise RuntimeError('PCL2_EXACT_FOURTEEN_SOURCE_INPUTS_REQUIRED')
        for pin in manifest['files']:
            target = (here / pin['path']).resolve(strict=True)
            if not target.is_relative_to(here) or not target.is_file():
                raise RuntimeError('PCL2_INPUT_OUTSIDE_FINITE_PACKET')
            raw = target.read_bytes()
            if len(raw) != pin['bytes'] or hashlib.sha256(raw).hexdigest() != pin['sha256']:
                raise RuntimeError('PCL2_SOURCE_DRIFT:' + pin['path'])
        observed = json_command(command, 'pcl2-00-official-empty-service', base, SERVER_GUARD)
        if observed != expected_guard('postgres'):
            raise RuntimeError('PCL2_EXACT_EMPTY_OFFICIAL_PG1711_SERVICE_REQUIRED')
        proof['servicePreflight'] = observed
        before_roles = json_command(command, 'pcl2-01-model-role-metadata-before', base, ROLE_SNAPSHOT)
        role_rows = before_roles.get('roles')
        if not isinstance(role_rows, list) or {r['name'] for r in role_rows} != {'anon', 'authenticated', 'service_role'}:
            raise RuntimeError('PCL2_EXISTING_ACCEPTED_THREE_MODEL_ROLES_REQUIRED')
        absent = command('pcl2-02-new-database-absent', base + ['-A', '-t', '-c',
                         "SELECT NOT EXISTS(SELECT 1 FROM pg_database WHERE datname='" + DATABASE + "');"])
        if absent.stdout.decode('utf-8').strip() != 't':
            raise RuntimeError('PCL2_DATABASE_MUST_NOT_EXIST_NO_REUSE')
        proof['databaseCreateState'] = 'REQUESTED_OUTCOME_UNKNOWN'
        command('pcl2-03-create-one-owned-database', base + ['-c', 'CREATE DATABASE ' + DATABASE + ' TEMPLATE template0 OWNER postgres;'])
        created = True
        proof['databaseCreateState'] = 'NATIVE_CREATE_EXIT0_ACK'
        model_base = base[:-1] + ['--dbname=' + DATABASE]
        model_interactive = interactive_base[:-1] + ['--dbname=' + DATABASE]
        observed = json_command(command, 'pcl2-04-new-model-empty', model_base, SERVER_GUARD)
        if observed != expected_guard(DATABASE):
            raise RuntimeError('PCL2_EXACT_EMPTY_PRIVATE_MODEL_REQUIRED')
        proof['modelPreflight'] = observed
        # Install only the exact reviewed eight foundations. No old stage/case runner is imported.
        for index, filename in enumerate(ORDER, 1):
            command('pcl2-05-' + str(index) + '-' + filename, model_base + ['-f', '-'],
                    (here / 'inputs' / filename).read_bytes())
        native = load_definitions('pcl2_unchanged_native_session', here / 'inputs' / 'concurrency_cases.py')
        fixture = load_definitions('pcl2_unchanged_copy_helper_definitions', here / 'inputs' / 'copy24_cases.py')
        cases = load_definitions('pcl2_only_two_new_public_cases', here / 'cases' / 'public_learner_grant_prefix_native2.py')
        with (output / 'PCL2-events.jsonl').open('x', encoding='utf-8') as log:
            lock = threading.Lock()
            def trace(value):
                nonlocal trace_count
                with lock:
                    trace_count += 1
                    if value.get('case'):
                        proof['actualGroups'].append(value['case'])
                    if value.get('pcl2NativeSessionExit'):
                        proof['nativeSessionExits'].append(value['pcl2NativeSessionExit'])
                    if value.get('pcl2CapabilityRestore'):
                        proof['capabilityRestoreReceipt'] = value['pcl2CapabilityRestore']
                    log.write(json.dumps(value, ensure_ascii=False) + '\n')
                    log.flush()
            result = cases.run_cases(native.Session, model_interactive, env, trace, fixture, here / 'inputs')
        if result.get('actualGroups') != ['PCL01', 'PCL02'] or proof['actualGroups'] != result['actualGroups']:
            raise RuntimeError('PCL2_EXACT_TWO_NEW_GROUPS_REQUIRED')
        exits = proof['nativeSessionExits']
        if len(exits) != 5 or any(x['exitCode'] != 0 or x.get('closeError') or x.get('forcedCleanupFallback') is not False for x in exits):
            raise RuntimeError('PCL2_ALL_FIVE_NATIVE_CLIENTS_MUST_EXIT_NATURALLY_ZERO')
        if result.get('capabilityOriginalRestored') is not True or proof.get('capabilityRestoreReceipt') != {
                'exactDefinitionOwnerACL': True, 'productionFlagsChanged': False}:
            raise RuntimeError('PCL2_EXACT_CAPABILITY_RESTORE_REQUIRED')
        proof.update(result)
        after_roles = json_command(command, 'pcl2-06-model-role-metadata-after', base, ROLE_SNAPSHOT)
        if after_roles != before_roles:
            raise RuntimeError('PCL2_GLOBAL_MODEL_ROLE_METADATA_DRIFT')
        proof['globalThreeModelRolesUnchanged'] = True
        proof['modelRolesBefore'], proof['modelRolesAfter'] = before_roles, after_roles
        return proof
    except Exception as error:
        failed = True
        proof['status'] = 'FAIL_TWO_NEW_PUBLIC_LEARNER_COMPONENTS_NO_RETRY'
        proof['errorType'], proof['errorCode'] = type(error).__name__, str(error)[:600]
        raise
    finally:
        primary = sys.exc_info()[0] is not None
        cleanup = []
        proof['traceEventCount'] = trace_count
        # Never DROP an old/unacknowledged database. This exact new database was absent,
        # created by this call, and belongs only to the inspected private CI service.
        if created:
            try:
                observed = json_command(command, 'pcl2-07-before-owned-drop', base,
                    "SELECT jsonb_build_object('database',current_database(),'address',host(inet_server_addr()),'port',inet_server_port(),"
                    "'data',current_setting('data_directory'),'actor',current_user,'version',current_setting('server_version_num'),"
                    "'marker',current_setting('pcr.lab_authorized',true),'owned',EXISTS(SELECT 1 FROM pg_database WHERE datname='"
                    + DATABASE + "'AND datdba='postgres'::regrole));")
                if observed != {'database': 'postgres', 'address': '127.0.0.1', 'port': 5432,
                                'data': '/var/lib/postgresql/data', 'actor': 'postgres', 'version': '170011',
                                'marker': 'source-reviewed-root-run-only', 'owned': True}:
                    raise RuntimeError('PCL2_OWNED_DATABASE_DROP_IDENTITY_DRIFT')
                command('pcl2-08-drop-only-owned-new-database', base + ['-c', 'DROP DATABASE ' + DATABASE + ';'])
                absent = command('pcl2-09-separate-post-database-absent', base + ['-A', '-t', '-c',
                                 "SELECT NOT EXISTS(SELECT 1 FROM pg_database WHERE datname='" + DATABASE + "');"])
                if absent.stdout.decode('utf-8').strip() != 't':
                    raise RuntimeError('PCL2_POST_DATABASE_NOT_ABSENT')
                proof['ownedDatabaseDropped'], proof['separatePostDatabaseAbsent'] = True, True
            except Exception as error:
                cleanup.append({'stage': 'ownedDatabaseDrop', 'error': repr(error)})
        if before_roles is not None:
            try:
                final_roles = json_command(command, 'pcl2-10-final-model-role-metadata', base, ROLE_SNAPSHOT)
                if final_roles != before_roles:
                    raise RuntimeError('PCL2_FINAL_GLOBAL_MODEL_ROLE_DRIFT')
                proof['finalModelRolesExact'] = True
            except Exception as error:
                cleanup.append({'stage': 'roleMetadata', 'error': repr(error)})
        if cleanup:
            proof['cleanupFailures'], proof['primaryFailurePreserved'] = cleanup, primary
            proof['status'] = 'FAIL_PCL2_CLEANUP_OR_ROLE_METADATA_NO_RETRY'
            failed = True
        proof['failed'] = failed
        (output / 'PCL2-stage-result.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        if cleanup and not primary:
            raise RuntimeError('PCL2_CLEANUP_OR_ROLE_PRESERVATION_FAILURE')
