"""CI-only file16 stage after unchanged native core48. No deployment entrypoint."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import threading


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_file_stage(here, command, base, interactive_base, env, output, core_receipt, expected_manifest_sha256):
    here, output = Path(here).resolve(strict=True), Path(output).resolve(strict=True)
    proof = {'status': 'RUNNING_FILE16', 'candidateCommitState': 'NOT_REQUESTED',
             'actualGroups': [], 'nativeSessionExits': [], 'sourceUnchanged': False,
             'ordinaryCloudAuth': False, 'fullSchemaParity': False,
             'learnerCopyAccepted': False, 'originalNative24Complete': False,
             'fullPROG012Accepted': False, 'production': False}
    pins = []
    failed = False
    trace_count = 0
    try:
        if os.environ.get('GITHUB_ACTIONS') != 'true':
            raise RuntimeError('FILE_STAGE_GUARDED_GITHUB_JOB_ONLY')
        if (len(core_receipt.get('actualCases', [])) != 18
                or len(core_receipt.get('actualAuthSubgroups', [])) != 2
                or len(core_receipt.get('actualConcurrencyCases', [])) != 18
                or len(core_receipt.get('actualCascadeSubgroups', [])) != 10
                or core_receipt.get('candidateCommitState') != 'COMMITTED_NATIVE_PSQL_EXIT0_ACK'
                or not core_receipt.get('nativeSessionExits')
                or any(r['exitCode'] != 0 or r['closeError'] for r in core_receipt['nativeSessionExits'])):
            raise RuntimeError('UNCHANGED_CORE48_NATURAL_ZERO_COMPLETION_REQUIRED_FIRST')
        manifest_bytes = (here / 'ci-file-inputs.json').read_bytes()
        if hashlib.sha256(manifest_bytes).hexdigest() != expected_manifest_sha256:
            raise RuntimeError('REVIEWED_SEPARATE_FILE_STAGE_MANIFEST_REQUIRED')
        manifest = json.loads(manifest_bytes)
        pins = manifest['files']
        if len(pins) != 6:
            raise RuntimeError('EXACT_SIX_SEPARATE_FILE_STAGE_INPUTS_REQUIRED')
        for pin in pins:
            target = (here / pin['path']).resolve(strict=True)
            if target.parent != here:
                raise RuntimeError('FILE_STAGE_INPUT_MUST_BE_LOCAL_REVIEWED_SOURCE')
            data = target.read_bytes()
            if len(data) != pin['bytes'] or hashlib.sha256(data).hexdigest() != pin['sha256']:
                raise RuntimeError('FILE_STAGE_FROZEN_SOURCE_DRIFT')
        with (output / '08-file-native-sixteen.jsonl').open('x', encoding='utf-8') as log:
            lock = threading.Lock()
            def trace(value):
                nonlocal trace_count
                with lock:
                    trace_count += 1
                    if value.get('case'):
                        proof['actualGroups'].append(value['case'])
                    if value.get('fileNativeSessionExit'):
                        proof['nativeSessionExits'].append(value['fileNativeSessionExit'])
                    log.write(json.dumps(value, ensure_ascii=False) + '\n')
                    log.flush()
            trace({'fileStage': 'STARTED_AFTER_CORE48', 'sourceManifest': expected_manifest_sha256})
            command('06-file-dependency-extension', base + ['-f', '-'], (here / 'file-authority-unit-extension.sql').read_bytes())
            proof['candidateCommitState'] = 'REQUESTED_OUTCOME_UNKNOWN'
            command('07-file-r4-candidate', base + ['-f', '-'], (here / 'file-authority-r4.candidate.sql').read_bytes())
            proof['candidateCommitState'] = 'COMMITTED_NATIVE_PSQL_EXIT0_ACK'
            # Do not reuse cases.Session.close from core04: that method was
            # monkeypatched to a closure whose trace file is now closed.
            # A new module instance gets the exact original Session class and
            # closes all its clients while THIS independent trace is still open.
            native = _load('pcr_file_stage_native_sessions', here / 'concurrency_cases.py')
            file_cases = _load('pcr_file_stage_native_cases', here / 'file_authority_cases.py')
            native_result = file_cases.run_stage(native.Session, interactive_base, env, trace)
            expected = ['DB14-R4-' + str(i).zfill(2) for i in range(1, 17)]
            if native_result.get('actualGroups') != expected or proof['actualGroups'] != expected:
                raise RuntimeError('EXACT_SIXTEEN_FILE_GROUPS_REQUIRED')
            if not proof['nativeSessionExits'] or any(r['exitCode'] != 0 for r in proof['nativeSessionExits']):
                raise RuntimeError('ALL_FILE_NATIVE_CLIENTS_MUST_EXIT_NATURALLY_ZERO')
            proof.update(native_result)
            trace({'fileStage': 'COMPLETED_NATIVE16', 'nativeClients': len(proof['nativeSessionExits'])})
        proof['sourceUnchanged'] = all(hashlib.sha256((here / p['path']).read_bytes()).hexdigest() == p['sha256'] for p in pins)
        if not proof['sourceUnchanged']:
            raise RuntimeError('FILE_STAGE_SOURCE_CHANGED_AFTER_EXECUTION')
        return proof
    except Exception as error:
        failed = True
        proof['status'] = 'FAIL_FILE16_OR_GUARD_NO_RETRY'
        proof['errorType'] = type(error).__name__
        proof['errorCode'] = str(error)[:500]
        raise
    finally:
        proof['traceEventCount'] = trace_count
        proof['sourceUnchanged'] = bool(pins) and all(
            (here / p['path']).is_file()
            and hashlib.sha256((here / p['path']).read_bytes()).hexdigest() == p['sha256'] for p in pins)
        late_source_failure = proof['status'].startswith('PASS_') and not proof['sourceUnchanged']
        if late_source_failure:
            proof['status'] = 'FAIL_FILE_SOURCE_CHANGED_NO_RETRY'
        (output / '08-file-native-result.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        if late_source_failure and not failed:
            raise RuntimeError('FILE_SOURCE_CHANGED_AT_FINAL_READBACK')
