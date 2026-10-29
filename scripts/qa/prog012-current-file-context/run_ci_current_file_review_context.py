"""CI-only new current-file review metadata; no original24/14/12/139 run.
One new database in the job's fresh official private PostgreSQL service only.
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

PARENT = '27fcf0af8aad312f0882008cd03311b26465b2f9'
BRANCH = 'codex/prog012-current-file-review-context-ci-r1-20261029'
REPO_PREFIX = 'scripts/qa/prog012-current-file-context/'
WORKFLOW = '.github/workflows/prog012-current-file-review-context.yml'
EXPECTED_MANIFEST = '8d56c1e9bef8607b51959a9061b72dea73fb3158c0531da060101d0cec5c2f74'
EXPECTED_CI_INPUTS = '7a282893ba52f9d88203a0c966bc2020501f3f5d16a344fb53683a31ceb4a4a4'
IMAGE = 'postgres:17.11@sha256:0b81cec82228160abfa753aeaad0609b709eb26eeb950f2e404ad2326e1cc370'
IMAGE_ID = 'sha256:81edcaa5ff2923f7be9c1f43d3e5076f29c6c9c216c86964b5fd038959404429'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--container-id', required=True)
    parser.add_argument('--expected-manifest-sha256', required=True)
    parser.add_argument('--expected-ci-inputs-sha256', required=True)
    parser.add_argument('--ci-source-reviewed-only', action='store_true')
    args = parser.parse_args()
    if (not args.ci_source_reviewed_only or os.environ.get('GITHUB_ACTIONS') != 'true'
            or sys.platform != 'linux' or sys.version_info.major != 3
            or not re.fullmatch(r'[a-f0-9]{64}', args.container_id)
            or not re.fullmatch(r'[a-f0-9]{64}', EXPECTED_MANIFEST)
            or args.expected_manifest_sha256 != EXPECTED_MANIFEST or args.expected_ci_inputs_sha256 != EXPECTED_CI_INPUTS
            or os.environ.get('GITHUB_EVENT_NAME') not in ('push', 'workflow_dispatch')
            or os.environ.get('GITHUB_REF') != 'refs/heads/' + BRANCH):
        raise RuntimeError('CFM_REVIEWED_GITHUB_FIXED_BRANCH_PRIVATE_SERVICE_ONLY')
    run_id = os.environ.get('GITHUB_RUN_ID', '')
    attempt = os.environ.get('GITHUB_RUN_ATTEMPT', '')
    head = os.environ.get('GITHUB_SHA', '')
    if (not re.fullmatch(r'[0-9]+', run_id) or not re.fullmatch(r'[0-9]+', attempt)
            or not re.fullmatch(r'[a-f0-9]{40}', head)):
        raise RuntimeError('CFM_FIXED_GITHUB_RUN_IDENTITY_REQUIRED')
    workspace = Path(os.environ['GITHUB_WORKSPACE']).resolve(strict=True)
    here = Path(__file__).resolve().parent
    if here != workspace / REPO_PREFIX.rstrip('/'):
        raise RuntimeError('CFM_FIXED_REPO_SOURCE_DIRECTORY_REQUIRED')
    output = Path(os.environ['RUNNER_TEMP']).resolve(strict=True) / ('prog012-current-file-context-' + run_id + '-' + attempt)
    if output.exists():
        raise RuntimeError('CFM_FRESH_OUTPUT_REQUIRED_NO_RECOVERY')
    output.mkdir()
    native_env = {k: os.environ[k] for k in ('PATH', 'HOME', 'LANG', 'LC_ALL') if k in os.environ}
    native_env['PYTHONDONTWRITEBYTECODE'] = '1'
    sys.dont_write_bytecode = True
    report = {'schemaVersion': 1, 'status': 'RUNNING_ONLY_TWO_NEW_PUBLIC_READER_COMPONENTS',
              'createdAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'githubSha': head, 'runId': run_id, 'runAttempt': attempt, 'pythonVersion': sys.version, 'platform': sys.platform, 'stages': [],
              'production': False, 'ordinaryCloudAuth': False, 'realStorageHTTP': False,
              'fullSchemaParity': False, 'full17Accepted': False, 'fullPROG012Accepted': False,
              'original24Or14Or12Or139Executed': False, 'containerLifecycleMutations': 0, 'retries': 0}
    source_before = {}

    def write_new(name, data):
        if not re.fullmatch(r'[A-Za-z0-9_.-]+', name):
            raise RuntimeError('CFM_FLAT_ARTIFACT_NAME_REQUIRED')
        with (output / name).open('xb') as target:
            target.write(data)

    def command(label, argv, data=None, timeout=120):
        if not re.fullmatch(r'[A-Za-z0-9_.-]+', label):
            raise RuntimeError('CFM_FINITE_COMMAND_LABEL_REQUIRED')
        started = time.monotonic()
        try:
            result = subprocess.run(argv, input=data, env=native_env, cwd=str(here),
                                    capture_output=True, timeout=timeout, shell=False)
        except subprocess.TimeoutExpired as error:
            write_new(label + '.stdout.log', error.stdout or b'')
            write_new(label + '.stderr.log', error.stderr or b'')
            report['stages'].append({'label': label, 'timedOut': True, 'timeoutSeconds': timeout})
            raise
        write_new(label + '.stdout.log', result.stdout)
        write_new(label + '.stderr.log', result.stderr)
        report['stages'].append({'label': label, 'exitCode': result.returncode,
                                 'durationMs': round((time.monotonic() - started) * 1000),
                                 'stdoutSHA256': sha(result.stdout), 'stderrSHA256': sha(result.stderr)})
        if result.returncode != 0:
            raise RuntimeError('CFM_NATIVE_COMMAND_FAILED_' + label)
        return result

    try:
        manifest_bytes = (here / 'current-file-context-inputs.json').read_bytes()
        if sha(manifest_bytes) != EXPECTED_MANIFEST:
            raise RuntimeError('CFM_INPUT_MANIFEST_DRIFT_BEFORE_IMPORT_OR_SQL')
        manifest = json.loads(manifest_bytes)
        ci_bytes=(here/'harness/inputs.json').read_bytes()
        if sha(ci_bytes)!=EXPECTED_CI_INPUTS: raise RuntimeError('CFM_EXACT_CI_SOURCE_MANIFEST_REQUIRED')
        ci_inputs=json.loads(ci_bytes)
        pins = ci_inputs['files']
        if len(pins) != 26 or len({p['path'] for p in pins}) != 26:
            raise RuntimeError('CFM_EXACT_TWENTYSIX_CI_SOURCE_PINS_REQUIRED')
        required = {'stage/run_current_file_review_context_stage.py', 'cases/current_file_review_context_cases.py',
                    'inputs/concurrency_cases.py', 'inputs/copy24_cases.py'}
        names = {p['path'] for p in manifest['files']}
        if not required <= names or any(not re.fullmatch(r'(?:inputs|stage|cases)/[A-Za-z0-9_.-]+', n) for n in names):
            raise RuntimeError('CFM_FIXED_INPUT_SUBDIRECTORIES_REQUIRED')
        for pin in pins:
            lexical = workspace / pin['path']
            target = lexical.resolve(strict=True)
            if (lexical.is_symlink() or lexical.parent.is_symlink() or not target.is_relative_to(workspace)
                    or target.stat().st_size != pin['bytes'] or sha(target.read_bytes()) != pin['sha256']):
                raise RuntimeError('CFM_REVIEWED_SOURCE_PIN_REQUIRED')
        expected_paths = sorted(p['path'] for p in pins) + [REPO_PREFIX+'harness/inputs.json',REPO_PREFIX+'run_ci_current_file_review_context.py',WORKFLOW]
        expected_paths = sorted(expected_paths)
        git = shutil.which('git', path=native_env.get('PATH'))
        if not git:
            raise RuntimeError('CFM_READONLY_GIT_REQUIRED')
        parents = command('00-git-exact-parent', [git, '--no-optional-locks', 'rev-list', '--parents', '-n', '1', 'HEAD']).stdout.decode().strip().split()
        if parents != [head, PARENT]:
            raise RuntimeError('CFM_SINGLE_REVIEWED_PARENT_MAIN196_REQUIRED')
        changed = command('00-git-finite-paths', [git, '--no-optional-locks', 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD']).stdout.decode().splitlines()
        if sorted(changed) != expected_paths:
            raise RuntimeError('CFM_EXACT_TWENTYNINE_REVIEWED_PATHS_REQUIRED')
        existing = command('00-parent-inputs-absent', [git, '--no-optional-locks', 'ls-tree', '-r', '--name-only', PARENT, '--', REPO_PREFIX, WORKFLOW]).stdout
        if existing.strip():
            raise RuntimeError('CFM_PARENT_NEW_PATH_ABSENCE_REQUIRED_NO_OVERWRITE')
        present=command('00-all-reviewed-parent-presence',[git,'ls-tree','-r','--name-only',PARENT,'--']+[p['path']for p in pins]+[REPO_PREFIX+'harness/inputs.json',REPO_PREFIX+'run_ci_current_file_review_context.py',WORKFLOW]).stdout.decode().splitlines()
        if sorted(present)!=sorted(p['path']for p in pins if p.get('before')):raise RuntimeError('CFM_EXACT_CURRENT_PREIMAGES_AND_NEW_PATH_ABSENCES_REQUIRED')
        for pin in pins:
            if pin.get('before'):
                old=command('00-old-lib-preimage', [git,'show',PARENT+':'+pin['path']]).stdout
                if len(old)!=pin['before']['bytes'] or sha(old)!=pin['before']['sha256']:raise RuntimeError('CFM_CURRENT_MAIN196_PREIMAGE_DRIFT')
        source_paths = [(workspace / p['path']) for p in pins] + [here/'harness/inputs.json',here/'run_ci_current_file_review_context.py',workspace/WORKFLOW]
        source_before = {str(p.relative_to(workspace)): {'bytes': p.stat().st_size, 'sha256': sha(p.read_bytes())} for p in source_paths}
        write_new('source-before.json', (json.dumps(source_before, sort_keys=True, indent=2) + '\n').encode())
        docker = shutil.which('docker', path=native_env.get('PATH'))
        if not docker:
            raise RuntimeError('CFM_EXISTING_DOCKER_CLI_REQUIRED')
        containers = json.loads(command('00-container-inspect', [docker, 'container', 'inspect', args.container_id], timeout=20).stdout)
        if len(containers) != 1:
            raise RuntimeError('CFM_ONE_JOB_SERVICE_REQUIRED')
        value = containers[0]
        state = value.get('State', {})
        host = value.get('HostConfig', {})
        ports = value.get('NetworkSettings', {}).get('Ports', {}) or {}
        if (value.get('Id') != args.container_id or state.get('Running') is not True
                or state.get('Health', {}).get('Status') != 'healthy'
                or value.get('Config', {}).get('Image') != IMAGE or value.get('Image') != IMAGE_ID
                or host.get('NetworkMode') in (None, '', 'host', 'bridge', 'none')
                or not value.get('NetworkSettings', {}).get('Networks')
                or host.get('PortBindings') or any(ports.values())
                or any(mount.get('Type') == 'bind' for mount in value.get('Mounts', []))):
            raise RuntimeError('CFM_PINNED_JOB_PRIVATE_NO_PUBLISHED_PORTS_OR_BINDS_REQUIRED')
        report['service'] = {'id': args.container_id, 'image': IMAGE, 'imageId': value['Image'],
                             'startedAt': state.get('StartedAt'), 'pid': state.get('Pid'),
                             'networkMode': host.get('NetworkMode'), 'publishedPorts': False}
        exec_base = [docker, 'exec', '-i', '--env', 'PGCLIENTENCODING=UTF8', '--env',
                     'PGOPTIONS=-c pcr.lab_authorized=source-reviewed-root-run-only', args.container_id]
        psql_args = ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '--no-password', '--host=127.0.0.1',
                     '--port=5432', '--username=postgres', '--dbname=postgres']
        base = exec_base + ['psql'] + psql_args
        interactive = exec_base + ['sh', '-c', 'exec psql "$@" 2>&1', 'cfm-ci'] + psql_args
        version = command('00-native-psql-version', [docker, 'exec', args.container_id, 'psql', '--version'], timeout=20).stdout.decode()
        if not re.fullmatch(r'psql \(PostgreSQL\) 17\.11(?:[^\r\n]*)\r?\n?', version):
            raise RuntimeError('CFM_EXACT_NATIVE_PSQL1711_REQUIRED')
        roles = b"""\\set ON_ERROR_STOP on
BEGIN;
DO $guard$ BEGIN
 IF current_database()<>'postgres'OR current_user<>'postgres'OR session_user<>'postgres'
 OR inet_server_addr()IS DISTINCT FROM'127.0.0.1'::inet OR inet_server_port()<>5432
 OR current_setting('server_version_num')<>'170011'OR current_setting('data_directory')<>'/var/lib/postgresql/data'
 OR current_setting('pcr.lab_authorized',true)IS DISTINCT FROM'source-reviewed-root-run-only'
 OR to_regnamespace('auth')IS NOT NULL OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('anon','authenticated','service_role'))
 OR EXISTS(SELECT 1 FROM pg_database WHERE datname='sintagma_pcf_current_context_lab_20261029')
 THEN RAISE EXCEPTION 'CFM_FRESH_PRIVATE_CONTROL_DATABASE_AND_ROLES_REQUIRED';END IF;
END;$guard$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
COMMIT;
"""
        command('00-three-existing-model-role-contracts-only', base + ['-f', '-'], roles, timeout=20)
        spec = importlib.util.spec_from_file_location('cfm_reviewed_stage_only', here / 'stage/run_current_file_review_context_stage.py')
        stage = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(stage)
        report['currentFileReviewStage'] = stage.run_current_file_review_context_stage(here, command, base, interactive, native_env, output, EXPECTED_MANIFEST)
        result = report['currentFileReviewStage']
        exits = result.get('nativeSessionExits', [])
        if (not result.get('status', '').startswith('PASS_') or result.get('actualGroups') != ['CFM01', 'CFM02']
                or len(exits) != 3 or any(x.get('exitCode') != 0 or x.get('closeError') or x.get('forcedCleanupFallback') for x in exits)
                or result.get('allThreeCapabilitiesFalse') is not True or result.get('capabilityOverride') is not False):
            raise RuntimeError('CFM_TWO_GROUPS_THREE_NATURAL_ZERO_UNCHANGED_FALSE_CAPS_REQUIRED')
        report['status'] = 'PASS_ONLY_TWO_CURRENT_FILE_METADATA_FULL_PRODUCT_MIGRATION_NOT_CLOUD_AUTH'
    except Exception as error:
        report['status'], report['errorType'], report['errorCode'] = 'FAIL_PUBLIC_NATIVE2_NO_RETRY', type(error).__name__, str(error)[:700]
    finally:
        source_after = {}
        for name in source_before:
            path = workspace / name
            if path.is_file() and not path.is_symlink():
                source_after[name] = {'bytes': path.stat().st_size, 'sha256': sha(path.read_bytes())}
        report['sourceUnchanged'] = bool(source_before) and source_after == source_before
        if source_before:
            write_new('source-after.json', (json.dumps(source_after, sort_keys=True, indent=2) + '\n').encode())
        if report['status'].startswith('PASS_') and not report['sourceUnchanged']:
            report['status'] = 'FAIL_NATIVE2_FINAL_REVIEWED_SOURCE_DRIFT'
        write_new('result-current-file-review.json', (json.dumps(report, ensure_ascii=False, indent=2) + '\n').encode())
    print(json.dumps({'status': report['status'], 'report': str(output / 'result-current-file-review.json')}))
    return 0 if report['status'].startswith('PASS_') else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as error:
        print(json.dumps({'status': 'STOP_PUBLIC_NATIVE2_NO_RETRY', 'errorType': type(error).__name__, 'errorCode': str(error)[:700]}))
        sys.exit(2)
