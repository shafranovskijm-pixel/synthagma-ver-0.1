"""CI-only: unchanged original127 child once, then current-authority12 components.
Original results/artifacts remain byte exact. No new database/server/Auth/capability fixture.
"""
from __future__ import annotations
import argparse
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

CORE_SHA = '1ec4daf15f4fa5e377d464222890d598c0c6578960868dc356a1feb0d40c07db'
OLD_INTEGRATION_SHA = '44c4bb7fbedcf12daf4011b4056fd70075e14f52c4e88f16f54b2e76401bff9e'
OLD_CAPTURE_SHA = '0ae3040df6a7480fd98695ffa3824115298bfb8dc24361a926812c2c44c30f04'
INPUT_NAMES = ['run_ci_postgres_original113_then_current_capture.py','ci-current-capture-inputs.json','run_current_capture_stage.py','concurrency_cases.py','copy24_cases.py','run_self_profile_stage.py','run_copy24_stage.py','run_ci_postgres_original127_then_current_authority.py','run_current_authority_stage.py','current_authority_writer_cases.py','current-authority12.modeled-schema-extension.sql','current-authority12.modeled.candidate.sql','current-authority12.body-pins.json']

def sha(data): return hashlib.sha256(data).hexdigest()

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value

def artifact_snapshot(root):
    answer = {}
    for path in sorted(root.rglob('*')):
        if path.is_symlink(): raise RuntimeError('CAW_OLD_ARTIFACT_SYMLINK_REFUSED')
        if path.is_file(): answer[str(path.relative_to(root))] = {'bytes': path.stat().st_size, 'sha256': sha(path.read_bytes())}
    return answer

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--container-id', required=True)
    parser.add_argument('--expected-manifest-sha256', required=True)
    parser.add_argument('--expected-integration-manifest-sha256', required=True)
    parser.add_argument('--expected-current-capture-manifest-sha256', required=True)
    parser.add_argument('--expected-current-authority-manifest-sha256', required=True)
    parser.add_argument('--ci-source-reviewed-only', action='store_true')
    args = parser.parse_args()
    if (not args.ci_source_reviewed_only or os.environ.get('GITHUB_ACTIONS') != 'true' or sys.platform != 'linux'
            or not re.fullmatch(r'[a-f0-9]{64}', args.container_id)
            or args.expected_manifest_sha256 != CORE_SHA or args.expected_integration_manifest_sha256 != OLD_INTEGRATION_SHA
            or args.expected_current_capture_manifest_sha256 != OLD_CAPTURE_SHA
            or not re.fullmatch(r'[a-f0-9]{64}', args.expected_current_authority_manifest_sha256)):
        raise RuntimeError('CAW_EXACT_GITHUB_PRIVATE_SERVICE_ORIGINAL127_REQUIRED')
    run_id, attempt = os.environ.get('GITHUB_RUN_ID', ''), os.environ.get('GITHUB_RUN_ATTEMPT', '')
    if not re.fullmatch(r'[0-9]+', run_id) or not re.fullmatch(r'[0-9]+', attempt): raise RuntimeError('CAW_GITHUB_RUN_IDENTITY_REQUIRED')
    here = Path(__file__).resolve().parent
    workspace = Path(os.environ['GITHUB_WORKSPACE']).resolve(strict=True)
    if here != workspace / 'scripts/qa/prog012': raise RuntimeError('CAW_FIXED_CI_SOURCE_DIRECTORY_REQUIRED')
    output = Path(os.environ['RUNNER_TEMP']).resolve(strict=True) / ('prog012-postgres-unit-' + run_id + '-' + attempt)
    if output.exists(): raise RuntimeError('CAW_FRESH_RUN_OUTPUT_REQUIRED_BEFORE_ORIGINAL127')
    manifest_bytes = (here / 'ci-current-authority-inputs.json').read_bytes()
    if sha(manifest_bytes) != args.expected_current_authority_manifest_sha256: raise RuntimeError('CAW_REVIEWED_MANIFEST_REQUIRED')
    manifest = json.loads(manifest_bytes)
    pins = manifest['files']
    names = manifest['exactInputNames']
    if names != INPUT_NAMES: raise RuntimeError('CAW_FIXED_THIRTEEN_INPUT_NAMES_REQUIRED')
    if len(pins) != len(names) or len(set(names)) != len(names) or {p['path'] for p in pins} != set(names):
        raise RuntimeError('CAW_EXACT_BOUNDARY_INPUT_SET_REQUIRED')
    for pin in pins:
        if not re.fullmatch(r'[a-zA-Z0-9_.-]+', pin['path']): raise RuntimeError('CAW_FLAT_FINITE_INPUT_REQUIRED')
        target = (here / pin['path']).resolve(strict=True)
        if target.parent != here or target.is_symlink() or target.stat().st_size != pin['bytes'] or sha(target.read_bytes()) != pin['sha256']:
            raise RuntimeError('CAW_SOURCE_DRIFT_BEFORE_CHILD_OR_IMPORT')
    allowed_env = ('PATH', 'HOME', 'LANG', 'LC_ALL', 'GITHUB_ACTIONS', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_SHA', 'GITHUB_WORKSPACE', 'RUNNER_TEMP')
    child_env = {key: os.environ[key] for key in allowed_env if key in os.environ}
    native_env = {key: os.environ[key] for key in ('PATH', 'HOME', 'LANG', 'LC_ALL') if key in os.environ}
    report = {'schemaVersion': 1, 'status': 'RUNNING_UNCHANGED127_THEN_AUTHORITY12_COMPONENTS',
              'createdAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'githubSha': os.environ.get('GITHUB_SHA'),
              'runId': run_id, 'runAttempt': attempt, 'original127': {}, 'stages': [],
              'production': False, 'ordinaryCloudAuth': False, 'realStorageHTTP': False, 'fullCloudSchemaParity': False,
              'capabilityOverrideByNewStage': False, 'containerLifecycleMutations': 0, 'retries': 0, 'fullPROG012Accepted': False}
    old_files, original_bytes, capture_bytes = {}, None, None
    def write_new(name, data):
        with (output / name).open('xb') as target: target.write(data)
    def command(label, argv, data=None, timeout=120):
        started = time.monotonic()
        try:
            result = subprocess.run(argv, input=data, env=native_env, cwd=str(here), capture_output=True, timeout=timeout, shell=False)
        except subprocess.TimeoutExpired as error:
            write_new(label + '.stdout.log', error.stdout or b''); write_new(label + '.stderr.log', error.stderr or b'')
            report['stages'].append({'label': label, 'timedOut': True, 'timeoutSeconds': timeout})
            raise
        write_new(label + '.stdout.log', result.stdout); write_new(label + '.stderr.log', result.stderr)
        report['stages'].append({'label': label, 'exitCode': result.returncode, 'durationMs': round((time.monotonic()-started)*1000),
                                 'stdoutSHA256': sha(result.stdout), 'stderrSHA256': sha(result.stderr)})
        if result.returncode != 0: raise RuntimeError('CAW_NATIVE_PROCESS_FAILED_' + label)
        return result
    try:
        old_argv = [sys.executable, str(here / 'run_ci_postgres_original113_then_current_capture.py'),
                    '--container-id', args.container_id, '--expected-manifest-sha256', CORE_SHA,
                    '--expected-integration-manifest-sha256', OLD_INTEGRATION_SHA,
                    '--expected-current-capture-manifest-sha256', OLD_CAPTURE_SHA, '--ci-source-reviewed-only']
        old = subprocess.run(old_argv, env=child_env, cwd=str(here), capture_output=True, timeout=780, shell=False)
        if not output.is_dir(): raise RuntimeError('CAW_ORIGINAL127_DID_NOT_CREATE_OWN_RUN_DIRECTORY')
        old_files = artifact_snapshot(output)
        write_new('12a-00-original127-subprocess.stdout.log', old.stdout); write_new('12a-00-original127-subprocess.stderr.log', old.stderr)
        report['original127']['processExitCode'] = old.returncode
        if old.returncode != 0: raise RuntimeError('CAW_ORIGINAL127_FAILED_NO_NEW_STAGE_OR_RETRY')
        original_bytes = (output / 'result.json').read_bytes()
        capture_bytes = (output / 'result-current-capture.json').read_bytes()
        original_report, capture_report = json.loads(original_bytes), json.loads(capture_bytes)
        previous = load('caw_unchanged_original38_validator', here / 'run_current_capture_stage.py')
        old38 = previous.original38(original_report)
        current = capture_report.get('currentCaptureStage', {})
        exits4 = current.get('nativeSessionExits', [])
        if (not capture_report.get('status', '').startswith('PASS_') or not current.get('status', '').startswith('PASS_')
                or current.get('actualGroups') != ['CFC' + str(i).zfill(2) for i in range(1, 15)]
                or len(exits4) != 4 or any(x.get('exitCode') != 0 or x.get('closeError') or x.get('forcedCleanupFallback') for x in exits4)
                or not all(capture_report.get(k) for k in ('sourceUnchanged', 'old113ArtifactsUnchanged', 'old113ResultUnchanged'))):
            raise RuntimeError('CAW_EXACT_ORIGINAL127_AND_ALL42_NATURAL_ZERO_REQUIRED')
        report['original127'].update({'status': capture_report['status'], 'coreResultSHA256': sha(original_bytes),
                                      'captureResultSHA256': sha(capture_bytes), 'artifactCount': len(old_files),
                                      'all42NaturalZero': len(old38) + len(exits4) == 42})
        stage = load('caw_additive_authority_stage_source_reviewed', here / 'run_current_authority_stage.py')
        docker = shutil.which('docker')
        if not docker: raise RuntimeError('CAW_EXISTING_DOCKER_EXEC_TRANSPORT_REQUIRED')
        exec_base = [docker, 'exec', '-i', '--env', 'PGCLIENTENCODING=UTF8', '--env',
                     'PGOPTIONS=-c pcr.lab_authorized=source-reviewed-root-run-only', args.container_id]
        psql_args = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '--no-password', '--host=127.0.0.1', '--port=5432',
                     '--username=postgres', '--dbname=sintagma_pcr_v4_r2_lab_20261028']
        base = exec_base + ['psql'] + psql_args
        interactive = exec_base + ['sh', '-c', 'exec psql "$@" 2>&1', 'pcr-ci'] + psql_args
        report['currentAuthorityStage'] = stage.run_current_authority_stage(here, command, base, interactive, native_env, output, original_report)
        if (report['currentAuthorityStage'].get('actualGroups') != ['CAW' + str(i).zfill(2) for i in range(1, 13)]
                or not report['currentAuthorityStage'].get('status', '').startswith('PASS_')):
            raise RuntimeError('CAW_EXACT_TWELVE_COMPONENT_GROUPS_REQUIRED')
        report['status'] = 'PASS_UNCHANGED_ORIGINAL127_AND_ADDITIVE_AUTHORITY12_COMPONENT_MODEL_ONLY'
    except Exception as error:
        report['status'], report['errorType'], report['errorCode'] = 'FAIL_ORIGINAL127_OR_AUTHORITY12_NO_RETRY', type(error).__name__, str(error)[:700]
    finally:
        report['sourceUnchanged'] = sha((here / 'ci-current-authority-inputs.json').read_bytes()) == args.expected_current_authority_manifest_sha256 and all(
            (here / p['path']).is_file() and sha((here / p['path']).read_bytes()) == p['sha256'] for p in pins)
        report['old127ArtifactsUnchanged'] = bool(old_files) and all((output / name).is_file()
            and (output / name).stat().st_size == pin['bytes'] and sha((output / name).read_bytes()) == pin['sha256'] for name, pin in old_files.items())
        report['oldCoreResultUnchanged'] = original_bytes is not None and (output / 'result.json').read_bytes() == original_bytes
        report['oldCaptureResultUnchanged'] = capture_bytes is not None and (output / 'result-current-capture.json').read_bytes() == capture_bytes
        if report['status'].startswith('PASS_') and not all(report[k] for k in ('sourceUnchanged', 'old127ArtifactsUnchanged', 'oldCoreResultUnchanged', 'oldCaptureResultUnchanged')):
            report['status'] = 'FAIL_CAW_FINAL_SOURCE_OR_ORIGINAL127_ARTIFACT_DRIFT'
        if output.is_dir(): write_new('result-current-authority.json', (json.dumps(report, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
    print(json.dumps({'status': report['status'], 'original127ArtifactsUnmodified': report.get('old127ArtifactsUnchanged'),
                      'report': str(output / 'result-current-authority.json')}))
    return 0 if report['status'].startswith('PASS_') else 1

if __name__ == '__main__':
    try: sys.exit(main())
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as error:
        print(json.dumps({'status': 'STOP_ORIGINAL127_OR_AUTHORITY_NO_RETRY', 'errorType': type(error).__name__, 'errorCode': str(error)[:700]}))
        sys.exit(2)
