"""SOURCE ONLY. Additive function-only model stage after byte-unchanged native113.
No bootstrap/model clone, capability fixture, Auth provider, Storage HTTP or Cloud.
"""
from __future__ import annotations
import hashlib
import importlib.util
import json
from pathlib import Path
import threading

DATABASE = 'sintagma_copy24_lab_20261028'
PROFILE_DATABASE = 'sintagma_self_profile_lab_20261028'
OLD_INTEGRATION = '44c4bb7fbedcf12daf4011b4056fd70075e14f52c4e88f16f54b2e76401bff9e'
FUNCTION_METADATA = "SELECT coalesce(jsonb_agg(jsonb_build_object('oid',p.oid,'sha',encode(sha256(convert_to(jsonb_build_object('catalog',to_jsonb(p),'definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner))::text,'UTF8')),'hex'))ORDER BY p.oid),'[]'::jsonb)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','auth')AND p.prokind='f'"


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def original38(report):
    groups = (report, report.get('fileStage', {}), report.get('selfProfileStage', {}), report.get('copy24Stage', {}))
    exits = [row for group in groups for row in group.get('nativeSessionExits', [])]
    if (not report.get('status', '').startswith('PASS_') or len(exits) != 38
            or any(not report.get(name, {}).get('status', '').startswith('PASS_') for name in ('readStage', 'fileStage', 'selfProfileStage', 'copy24Stage'))
            or any(row.get('exitCode') != 0 or row.get('closeError') or row.get('forcedCleanupFallback', False) for row in exits)
            or report.get('actualCases') != ['PCRV2S' + str(i).zfill(2) for i in range(1, 19)]
            or [x.split(' ', 1)[0] for x in report.get('actualConcurrencyCases', [])] != ['PCRV2C' + str(i).zfill(2) for i in range(1, 19)]
            or len(report.get('actualAuthSubgroups', [])) != 2 or len(report.get('actualCascadeSubgroups', [])) != 10
            or report.get('readStage', {}).get('actualCases') != ['PCRUIR' + str(i).zfill(2) for i in range(1, 14)]
            or report.get('fileStage', {}).get('actualGroups') != ['DB14-R4-' + str(i).zfill(2) for i in range(1, 17)]
            or report.get('selfProfileStage', {}).get('actualGroups') != ['PSELF' + str(i).zfill(2) for i in range(1, 13)]
            or report.get('copy24Stage', {}).get('actualGroups') != ['COPY24-' + str(i).zfill(2) for i in range(1, 25)]
            or not report.get('copy24Stage', {}).get('old89Preserved')
            or not report.get('copy24Stage', {}).get('capabilityOriginalRestored')):
        raise RuntimeError('UNCHANGED_ORIGINAL113_AND_ALL38_NATURAL0_REQUIRED')
    return exits


def run_current_capture_stage(here, command, base, interactive_base, env, output, original):
    here, output = Path(here).resolve(strict=True), Path(output).resolve(strict=True)
    original38(original)
    proof = {'status': 'RUNNING_ADDITIVE_CURRENT_CAPTURE_MODEL', 'actualGroups': [], 'nativeSessionExits': [],
             'production': False, 'CloudWrites': False, 'ordinaryCloudAuth': False, 'realStorageHTTP': False,
             'original113SourceChanged': False, 'capabilityOverrideUsed': False,
             'candidateCommitState': 'NOT_REQUESTED', 'old113DatabasesPreserved': False,
             'oldCopyFunctionCatalogPreserved': False, 'fullPROG012Accepted': False}
    source_pins, failed = [], False
    old_file, old_copy, before_core, before_profile, before_functions = None, None, None, None, None
    copy_base, profile_base = base[:-1] + ['--dbname=' + DATABASE], base[:-1] + ['--dbname=' + PROFILE_DATABASE]
    try:
        for name in ('ci-inputs.json', 'ci-read-inputs.json', 'ci-file-inputs.json', 'ci-self-profile-inputs.json', 'ci-copy24-inputs.json'):
            manifest = json.loads((here / name).read_bytes())
            for pin in manifest['files']:
                path = (here / pin['path']).resolve(strict=True)
                if path.parent != here or path.stat().st_size != pin['bytes'] or hashlib.sha256(path.read_bytes()).hexdigest() != pin['sha256']:
                    raise RuntimeError('CFC_EXISTING_PINNED_NATIVE_SOURCE_REQUIRED_BEFORE_IMPORT')
                source_pins.append(pin)
        old_file = load('cfc_existing_file_snapshot_only', here / 'run_self_profile_stage.py')
        old_copy = load('cfc_existing_profile_snapshot_only', here / 'run_copy24_stage.py')
        guard = "SELECT json_build_object('database',current_database(),'address',host(inet_server_addr()),'port',inet_server_port(),'data',current_setting('data_directory'),'actor',current_user,'version',current_setting('server_version_num'),'marker',current_setting('pcr.lab_authorized',true),'newFunctionAbsent',to_regprocedure('public.begin_platform_course_current_file_capture(uuid,text,text,uuid,uuid)')IS NULL,'capabilities',public.pcf_v1_delivery_capabilities());"
        observed = json.loads(command('11c-01-existing-copy-model-preflight', copy_base + ['-A', '-t', '-c', guard]).stdout.decode('utf-8').strip())
        if any(observed.get(key) != value for key, value in {'database': DATABASE, 'address': '127.0.0.1', 'port': 5432,
                'data': '/var/lib/postgresql/data', 'actor': 'postgres', 'version': '170011',
                'marker': 'source-reviewed-root-run-only', 'newFunctionAbsent': True}.items()):
            raise RuntimeError('CFC_EXACT_ALREADY_ACCEPTED_PRIVATE_COPY_DB_REQUIRED_NO_RETRY')
        if any(observed['capabilities'].get(key) is not False for key in ('frozen_reader_implemented', 'frontend_consumers_accepted', 'copied_centre_exact_binding_supported')):
            raise RuntimeError('CFC_FALSE_CAPABILITIES_REQUIRED_NO_OVERRIDE')
        before_core = json.loads(command('11c-02-original77-before', base + ['-A', '-t', '-c', old_file.CORE_SNAPSHOT_SQL]).stdout.decode('utf-8').strip())
        before_profile = json.loads(command('11c-03-profile12-before', profile_base + ['-A', '-t', '-c', old_copy.profile_snapshot_sql()]).stdout.decode('utf-8').strip())
        before_functions = json.loads(command('11c-04-old-copy-function-catalog-before', copy_base + ['-A', '-t', '-c', FUNCTION_METADATA + ';']).stdout.decode('utf-8').strip())
        proof['old77Before'], proof['profile12Before'], proof['oldCopyFunctionsBefore'] = before_core, before_profile, before_functions
        proof['candidateCommitState'] = 'REQUESTED_OUTCOME_UNKNOWN'
        command('11c-05-function-only-modeled-install', copy_base + ['-f', '-'], (here / 'current-capture6.modeled.candidate.sql').read_bytes())
        proof['candidateCommitState'] = 'COMMITTED_NATIVE_FUNCTION_ONLY_EXIT0_ACK_NOT_CLOUD_REGISTRAR'
        with (output / '11c-current-capture-native.jsonl').open('x', encoding='utf-8') as log:
            lock = threading.Lock()
            def trace(value):
                with lock:
                    if value.get('case'): proof['actualGroups'].append(value['case'])
                    if value.get('currentCaptureNativeSessionExit'): proof['nativeSessionExits'].append(value['currentCaptureNativeSessionExit'])
                    if value.get('currentCaptureRetainedRowsAfterCleanup'): proof['retainedRowsCleanupReadback'] = value['currentCaptureRetainedRowsAfterCleanup']
                    log.write(json.dumps(value, ensure_ascii=False) + '\n'); log.flush()
            # Fresh module avoids an old Session.close/trace closure. No old source or class is modified.
            native = load('cfc_fresh_original_native_session', here / 'concurrency_cases.py')
            fixtures = load('cfc_reused_copy24_fixture_helpers', here / 'copy24_cases.py')
            cases = load('cfc_fourteen_new_cases', here / 'current_capture_cases.py')
            answer = cases.run_stage(native.Session, interactive_base[:-1] + ['--dbname=' + DATABASE], env, trace, fixtures)
        if answer.get('actualGroups') != ['CFC' + str(i).zfill(2) for i in range(1, 15)] or proof['actualGroups'] != answer['actualGroups']:
            raise RuntimeError('CFC_EXACT_FOURTEEN_NATIVE_GROUPS_REQUIRED')
        if len(proof['nativeSessionExits']) != 4 or any(row['exitCode'] != 0 or row['closeError'] or row['forcedCleanupFallback'] for row in proof['nativeSessionExits']):
            raise RuntimeError('CFC_ALL_FOUR_ADDITIONAL_NATIVE_CLIENTS_MUST_EXIT_NATURALLY_ZERO')
        proof.update(answer)
        return proof
    except Exception as error:
        failed = True
        proof['status'], proof['errorType'], proof['errorCode'] = 'FAIL_ADDITIVE_CURRENT_CAPTURE_MODEL_NO_RETRY', type(error).__name__, str(error)[:600]
        raise
    finally:
        readback_error = None
        if old_file is not None and old_copy is not None and before_core is not None and before_profile is not None:
            try:
                after_core = json.loads(command('11c-06-original77-after', base + ['-A', '-t', '-c', old_file.CORE_SNAPSHOT_SQL]).stdout.decode('utf-8').strip())
                after_profile = json.loads(command('11c-07-profile12-after', profile_base + ['-A', '-t', '-c', old_copy.profile_snapshot_sql()]).stdout.decode('utf-8').strip())
                proof['old77After'], proof['profile12After'] = after_core, after_profile
                proof['old113DatabasesPreserved'] = after_core == before_core and after_profile == before_profile
                after_functions = json.loads(command('11c-08-old-copy-function-catalog-after', copy_base + ['-A', '-t', '-c', FUNCTION_METADATA + ';']).stdout.decode('utf-8').strip())
                by_oid = {row['oid']: row['sha'] for row in after_functions}
                proof['oldCopyFunctionCatalogPreserved'] = all(by_oid.get(row['oid']) == row['sha'] for row in before_functions)
                proof['onlyOneNewFunction'] = len(after_functions) == len(before_functions) + (1 if proof['candidateCommitState'].startswith('COMMITTED_') else 0)
            except Exception as error:
                readback_error = {'type': type(error).__name__, 'error': str(error)[:600]}
                proof['preservationReadbackFailure'] = readback_error
        proof['sourceUnchanged'] = bool(source_pins) and all((here / p['path']).is_file() and hashlib.sha256((here / p['path']).read_bytes()).hexdigest() == p['sha256'] for p in source_pins)
        proof['cleanupFailures'] = [row for row in proof['nativeSessionExits'] if row['exitCode'] != 0 or row['closeError'] or row['forcedCleanupFallback']]
        bad = (not proof['sourceUnchanged'] or not proof['old113DatabasesPreserved'] or not proof['oldCopyFunctionCatalogPreserved']
               or not proof.get('onlyOneNewFunction') or proof['cleanupFailures'] or readback_error is not None)
        if not failed and bad: proof['status'] = 'FAIL_CFC_FINAL_SOURCE_PRESERVATION_OR_NATIVE_EXIT'
        (output / '11c-current-capture-result.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        if not failed and bad: raise RuntimeError('CFC_FINAL_PRESERVATION_SOURCE_OR_NATIVE_EXIT_FAILURE')
