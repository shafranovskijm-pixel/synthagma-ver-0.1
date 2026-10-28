"""CI-only additive wrapper. Runs the unchanged accepted native113 once, then CFC14.
Keeps the original result.json and every original artifact byte unchanged.
No server/container lifecycle, Cloud/Auth/HTTP, deployment or application entrypoint.
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
INPUT_NAMES = {'run_ci_postgres_core48_read13_file16_profile12_copy24.py', 'ci-core-read-file-profile-copy-inputs.json',
               'ci-copy24-inputs.json', 'run_ci_postgres_original113_then_current_capture.py',
               'run_current_capture_stage.py', 'current_capture_cases.py', 'current-capture6.modeled.candidate.sql',
               'current-capture6.authority-function.sql'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def artifact_snapshot(root):
    answer = {}
    for path in sorted(root.rglob('*')):
        if path.is_symlink(): raise RuntimeError('CFC_OLD_ARTIFACT_SYMLINK_REFUSED')
        if path.is_file(): answer[str(path.relative_to(root))] = {'bytes': path.stat().st_size, 'sha256': sha(path.read_bytes())}
    return answer


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--container-id', required=True)
    parser.add_argument('--expected-manifest-sha256', required=True)
    parser.add_argument('--expected-integration-manifest-sha256', required=True)
    parser.add_argument('--expected-current-capture-manifest-sha256', required=True)
    parser.add_argument('--ci-source-reviewed-only', action='store_true')
    args = parser.parse_args()
    if (not args.ci_source_reviewed_only or os.environ.get('GITHUB_ACTIONS') != 'true' or sys.platform != 'linux'
            or not re.fullmatch(r'[a-f0-9]{64}', args.container_id)
            or args.expected_manifest_sha256 != CORE_SHA or args.expected_integration_manifest_sha256 != OLD_INTEGRATION_SHA
            or not re.fullmatch(r'[a-f0-9]{64}', args.expected_current_capture_manifest_sha256)):
        raise RuntimeError('CFC_EXACT_GITHUB_PRIVATE_SERVICE_OLD113_AND_REVIEWED_SOURCE_REQUIRED')
    run_id, attempt = os.environ.get('GITHUB_RUN_ID', ''), os.environ.get('GITHUB_RUN_ATTEMPT', '')
    if not re.fullmatch(r'[0-9]+', run_id) or not re.fullmatch(r'[0-9]+', attempt): raise RuntimeError('CFC_GITHUB_RUN_IDENTITY_REQUIRED')
    here = Path(__file__).resolve().parent
    workspace = Path(os.environ['GITHUB_WORKSPACE']).resolve(strict=True)
    if here != workspace / 'scripts/qa/prog012': raise RuntimeError('CFC_FIXED_CI_SOURCE_DIRECTORY_REQUIRED')
    output = Path(os.environ['RUNNER_TEMP']).resolve(strict=True) / ('prog012-postgres-unit-' + run_id + '-' + attempt)
    if output.exists(): raise RuntimeError('CFC_FRESH_RUN_OUTPUT_MUST_NOT_EXIST_BEFORE_ORIGINAL113')
    manifest_bytes = (here / 'ci-current-capture-inputs.json').read_bytes()
    if sha(manifest_bytes) != args.expected_current_capture_manifest_sha256: raise RuntimeError('CFC_REVIEWED_MANIFEST_REQUIRED')
    pins = json.loads(manifest_bytes)['files']
    if len(pins) != len(INPUT_NAMES) or {p['path'] for p in pins} != INPUT_NAMES:
        raise RuntimeError('CFC_EXACT_EIGHT_BOUNDARY_INPUTS_REQUIRED')
    for pin in pins:
        target = (here / pin['path']).resolve(strict=True)
        if target.parent != here or target.is_symlink() or target.stat().st_size != pin['bytes'] or sha(target.read_bytes()) != pin['sha256']:
            raise RuntimeError('CFC_SOURCE_DRIFT_BEFORE_ORIGINAL_RUN_OR_IMPORT')
    allowed_env = ('PATH', 'HOME', 'LANG', 'LC_ALL', 'GITHUB_ACTIONS', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'GITHUB_SHA', 'GITHUB_WORKSPACE', 'RUNNER_TEMP')
    child_env = {key: os.environ[key] for key in allowed_env if key in os.environ}
    native_env = {key: os.environ[key] for key in ('PATH', 'HOME', 'LANG', 'LC_ALL') if key in os.environ}
    report = {'schemaVersion': 1, 'status': 'RUNNING_UNCHANGED113_THEN_ADDITIVE_CFC14',
              'createdAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'githubSha': os.environ.get('GITHUB_SHA'),
              'runId': run_id, 'runAttempt': attempt, 'original113': {}, 'stages': [],
              'production': False, 'ordinaryCloudAuth': False, 'realStorageHTTP': False, 'fullSchemaParity': False,
              'capabilityOverrideByNewStage': False, 'containerLifecycleMutations': 0, 'retries': 0, 'fullPROG012Accepted': False}
    old_files, original_bytes, original_report = {}, None, None
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
        if result.returncode != 0: raise RuntimeError('CFC_NATIVE_PROCESS_FAILED_' + label)
        return result
    try:
        old_argv = [sys.executable, str(here / 'run_ci_postgres_core48_read13_file16_profile12_copy24.py'),
                    '--container-id', args.container_id, '--expected-manifest-sha256', CORE_SHA,
                    '--expected-integration-manifest-sha256', OLD_INTEGRATION_SHA, '--ci-source-reviewed-only']
        old = subprocess.run(old_argv, env=child_env, cwd=str(here), capture_output=True, timeout=720, shell=False)
        if not output.is_dir(): raise RuntimeError('CFC_ORIGINAL113_DID_NOT_CREATE_OWN_RUN_DIRECTORY')
        # Snapshot BEFORE adding wrapper logs. All original files, including result.json, are immutable from now on.
        old_files = artifact_snapshot(output)
        write_new('11c-00-original113-subprocess.stdout.log', old.stdout); write_new('11c-00-original113-subprocess.stderr.log', old.stderr)
        report['original113']['processExitCode'] = old.returncode
        if old.returncode != 0: raise RuntimeError('CFC_ORIGINAL113_FAILED_NO_NEW_STAGE_OR_RETRY')
        original_bytes = (output / 'result.json').read_bytes()
        original_report = json.loads(original_bytes)
        stage = load('cfc_additive_stage_source_reviewed', here / 'run_current_capture_stage.py')
        exits = stage.original38(original_report)
        if not original_report.get('sourceUnchanged') or not original_report.get('integrationSourceUnchanged'):
            raise RuntimeError('CFC_ORIGINAL113_SOURCE_INTEGRITY_REQUIRED')
        report['original113'].update({'status': original_report['status'], 'resultSHA256': sha(original_bytes),
                                     'artifactCount': len(old_files), 'all38NaturalZero': len(exits) == 38,
                                     'conditionalCopy24OriginalFlagsRestored': True})
        docker = shutil.which('docker')
        if not docker: raise RuntimeError('CFC_EXISTING_DOCKER_EXEC_TRANSPORT_REQUIRED')
        exec_base = [docker, 'exec', '-i', '--env', 'PGCLIENTENCODING=UTF8', '--env',
                     'PGOPTIONS=-c pcr.lab_authorized=source-reviewed-root-run-only', args.container_id]
        psql_args = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '--no-password', '--host=127.0.0.1', '--port=5432',
                     '--username=postgres', '--dbname=sintagma_pcr_v4_r2_lab_20261028']
        base = exec_base + ['psql'] + psql_args
        # Exactly the accepted constant stderr-ordering program; each option remains a distinct argv item.
        interactive = exec_base + ['sh', '-c', 'exec psql "$@" 2>&1', 'pcr-ci'] + psql_args
        report['currentCaptureStage'] = stage.run_current_capture_stage(here, command, base, interactive, native_env, output, original_report)
        if (report['currentCaptureStage'].get('actualGroups') != ['CFC' + str(i).zfill(2) for i in range(1, 15)]
                or not report['currentCaptureStage'].get('status', '').startswith('PASS_')):
            raise RuntimeError('CFC_EXACT_NEW_FOURTEEN_PASSED_GROUPS_REQUIRED')
        report['status'] = 'PASS_UNCHANGED_ORIGINAL113_AND_ADDITIVE_CURRENT_CAPTURE14_MODEL_NOT_CLOUD_AUTH_STORAGE'
    except Exception as error:
        report['status'], report['errorType'], report['errorCode'] = 'FAIL_ORIGINAL113_OR_ADDITIVE_CURRENT_CAPTURE_NO_RETRY', type(error).__name__, str(error)[:700]
    finally:
        report['sourceUnchanged'] = sha((here / 'ci-current-capture-inputs.json').read_bytes()) == args.expected_current_capture_manifest_sha256 and all(
            (here / p['path']).is_file() and sha((here / p['path']).read_bytes()) == p['sha256'] for p in pins)
        report['old113ArtifactsUnchanged'] = bool(old_files) and all((output / name).is_file()
            and (output / name).stat().st_size == pin['bytes'] and sha((output / name).read_bytes()) == pin['sha256'] for name, pin in old_files.items())
        report['old113ResultUnchanged'] = original_bytes is not None and (output / 'result.json').read_bytes() == original_bytes
        if report['status'].startswith('PASS_') and (not report['sourceUnchanged'] or not report['old113ArtifactsUnchanged'] or not report['old113ResultUnchanged']):
            report['status'] = 'FAIL_CFC_FINAL_SOURCE_OR_ORIGINAL113_ARTIFACT_DRIFT'
        if output.is_dir():
            write_new('result-current-capture.json', (json.dumps(report, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
    print(json.dumps({'status': report['status'], 'originalResultUnmodified': report['old113ResultUnchanged'],
                      'report': str(output / 'result-current-capture.json')}))
    return 0 if report['status'].startswith('PASS_') else 1


if __name__ == '__main__':
    try: sys.exit(main())
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as error:
        print(json.dumps({'status': 'STOP_ORIGINAL_OR_NEW_STAGE_NO_RETRY', 'errorType': type(error).__name__, 'errorCode': str(error)[:700]}))
        sys.exit(2)
