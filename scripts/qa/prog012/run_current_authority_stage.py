"""SOURCE ONLY: additive authority12 in accepted copy DB after original127.
Uses fresh unchanged Session transport. No server/database/bootstrap/Auth/capability fixture.
"""
from __future__ import annotations
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import threading

DATABASE = 'sintagma_copy24_lab_20261028'
PROFILE_DATABASE = 'sintagma_self_profile_lab_20261028'
CHANGED = ('public.pcc_v1_authorized_reference(uuid,text,uuid,text,text)',
           'public.read_course_exact_file_delivery_mode(uuid,text)',
           'public.pcc_v1_copy_binding_payload(uuid,jsonb)')
NEW = ('public.pcc_v2_current_rights_keys(text,uuid[],boolean)', 'public.pcc_v2_asset_authority_before()',
       'public.pcc_v2_source_resource_fences(uuid,uuid,uuid,uuid)', 'public.pcc_v2_enrollment_authority_before()',
       'public.pcc_v2_copy_course_fences(uuid,text)', 'public.uc_assignment_removal_immutable()')
FUNCTION_METADATA = "SELECT coalesce(jsonb_agg(jsonb_build_object('oid',p.oid,'signature','public.'||p.oid::regprocedure::text,'regprocedure',p.oid::regprocedure::text,'body',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'withoutBody',encode(sha256(convert_to((to_jsonb(p)-'prosrc')::text,'UTF8')),'hex'),'whole',encode(sha256(convert_to(jsonb_build_object('catalog',to_jsonb(p),'definition',pg_get_functiondef(p.oid))::text,'UTF8')),'hex'))ORDER BY p.oid),'[]'::jsonb)FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','auth')AND p.prokind='f'"

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value

def run_current_authority_stage(here, command, base, interactive_base, env, output, original):
    here, output = Path(here).resolve(strict=True), Path(output).resolve(strict=True)
    proof = {'status': 'RUNNING_AUTHORITY12_COMPONENT_MODEL', 'actualGroups': [], 'nativeSessionExits': [],
             'production': False, 'CloudWrites': False, 'ordinaryCloudAuth': False, 'realStorageHTTP': False,
             'original127SourcesChanged': False, 'capabilityOverrideUsed': False, 'fullPROG012Accepted': False,
             'schemaExtensionState': 'NOT_REQUESTED', 'candidateCommitState': 'NOT_REQUESTED'}
    copy_base, profile_base = base[:-1] + ['--dbname=' + DATABASE], base[:-1] + ['--dbname=' + PROFILE_DATABASE]
    source_pins, failed = [], False
    previous = old_file = old_copy = None
    before_core = before_profile = before_functions = before_rows = None
    authority = json.loads((here / 'current-authority12.body-pins.json').read_bytes())
    def observed(label, argv, sql):
        return json.loads(command(label, argv + ['-A', '-t', '-c', sql]).stdout.decode('utf-8').strip())
    def row_bags(label):
        tables = observed(label + '-tables', copy_base, "SELECT json_build_object('tables',coalesce(json_agg(n.nspname||'.'||c.relname ORDER BY n.nspname,c.relname),'[]'))FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','auth')AND c.relkind IN('r','p');")['tables']
        parts = []
        for name in tables:
            if re.fullmatch(r'(public|auth)\.[a-zA-Z_][a-zA-Z0-9_]*', name) is None: raise RuntimeError('CAW_UNEXPECTED_SNAPSHOT_RELATION')
            qualified = '.'.join('"' + x + '"' for x in name.split('.'))
            parts.append("SELECT '" + name + "'::text name,coalesce((SELECT jsonb_object_agg(sha,n)FROM(SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')sha,count(*)n FROM " + qualified + " t GROUP BY 1)s),'{}'::jsonb)bag")
        return observed(label + '-bags', copy_base, 'SELECT jsonb_object_agg(name,bag)FROM(' + ' UNION ALL '.join(parts) + ')all_bags;')
    try:
        for name in ('ci-inputs.json', 'ci-read-inputs.json', 'ci-file-inputs.json', 'ci-self-profile-inputs.json', 'ci-copy24-inputs.json', 'ci-current-capture-inputs.json', 'ci-current-authority-inputs.json'):
            manifest = json.loads((here / name).read_bytes())
            for pin in manifest['files']:
                path = (here / pin['path']).resolve(strict=True)
                if path.parent != here or path.is_symlink() or path.stat().st_size != pin['bytes'] or hashlib.sha256(path.read_bytes()).hexdigest() != pin['sha256']:
                    raise RuntimeError('CAW_ALL_EXISTING_SOURCE_PINS_REQUIRED_BEFORE_IMPORT')
                source_pins.append(pin)
        previous = load('caw_original38_validator', here / 'run_current_capture_stage.py')
        previous.original38(original)
        old_file = load('caw_existing_core_snapshot_actual_export', here / 'run_self_profile_stage.py')
        old_copy = load('caw_existing_profile_snapshot_actual_export', here / 'run_copy24_stage.py')
        guard = "SELECT json_build_object('database',current_database(),'address',host(inet_server_addr()),'port',inet_server_port(),'data',current_setting('data_directory'),'actor',current_user,'version',current_setting('server_version_num'),'marker',current_setting('pcr.lab_authorized',true),'captureBody',encode(sha256(convert_to((SELECT prosrc FROM pg_proc WHERE oid=to_regprocedure('public.begin_platform_course_current_file_capture(uuid,text,text,uuid,uuid)')),'UTF8')),'hex'),'newNamesAbsent',NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname=ANY(ARRAY['pcc_v2_current_rights_keys','pcc_v2_asset_authority_before','pcc_v2_source_resource_fences','pcc_v2_enrollment_authority_before','pcc_v2_copy_course_fences','uc_assignment_removal_immutable'])),'capabilities',public.pcf_v1_delivery_capabilities());"
        answer = observed('12a-01-existing-model-preflight', copy_base, guard)
        expected = {'database': DATABASE, 'address': '127.0.0.1', 'port': 5432, 'data': '/var/lib/postgresql/data',
                    'actor': 'postgres', 'version': '170011', 'marker': 'source-reviewed-root-run-only', 'newNamesAbsent': True,
                    'captureBody': 'ca721e0338a15df1abf3be716c4cf7666c570b82e2029249a40ed13a8774eaab'}
        if any(answer.get(k) != v for k, v in expected.items()): raise RuntimeError('CAW_ALREADY_ACCEPTED_PRIVATE127_DATABASE_REQUIRED')
        if any(answer['capabilities'].get(k) is not False for k in ('frozen_reader_implemented', 'frontend_consumers_accepted', 'copied_centre_exact_binding_supported')):
            raise RuntimeError('CAW_ALL_CAPABILITIES_FALSE_NO_OVERRIDE')
        before_core = observed('12a-02-original77-before', base, old_file.CORE_SNAPSHOT_SQL)
        before_profile = observed('12a-03-profile12-before', profile_base, old_copy.profile_snapshot_sql())
        before_functions = observed('12a-04-copy-functions-before', copy_base, FUNCTION_METADATA + ';')
        before_rows = row_bags('12a-05-old-copy-rows-before')
        proof['old77Before'], proof['profile12Before'] = before_core, before_profile
        proof['schemaExtensionState'] = 'REQUESTED_OUTCOME_UNKNOWN'
        command('12a-06-real-bindings-empty-event-schema-only', copy_base + ['-f', '-'], (here / 'current-authority12.modeled-schema-extension.sql').read_bytes())
        proof['schemaExtensionState'] = 'COMMITTED_NATIVE_EMPTY_EVENT_SCHEMA_REAL42007_BINDINGS_ONLY_NOT_FULL_CLOUD'
        proof['candidateCommitState'] = 'REQUESTED_OUTCOME_UNKNOWN'
        command('12a-07-eight-exact-authority-bodies-only', copy_base + ['-f', '-'], (here / 'current-authority12.modeled.candidate.sql').read_bytes())
        proof['candidateCommitState'] = 'COMMITTED_NATIVE_EIGHT_BODIES_THREE_WRITER_TRIGGERS_ONLY_NOT_CLOUD_MIGRATION'
        with (output / '12a-current-authority-native.jsonl').open('x', encoding='utf-8') as log:
            lock = threading.Lock()
            def trace(value):
                with lock:
                    if value.get('case'): proof['actualGroups'].append(value['case'])
                    if value.get('authorityWriterNativeSessionExit'): proof['nativeSessionExits'].append(value['authorityWriterNativeSessionExit'])
                    if value.get('authorityWriterRetainedRowsAfterCleanup'): proof['retainedRowsCleanupReadback'] = value['authorityWriterRetainedRowsAfterCleanup']
                    log.write(json.dumps(value, ensure_ascii=False) + '\n'); log.flush()
            native = load('caw_fresh_unpatched_original_session', here / 'concurrency_cases.py')
            fixtures = load('caw_reused_exact_copy24_fixtures', here / 'copy24_cases.py')
            cases = load('caw_twelve_component_cases', here / 'current_authority_writer_cases.py')
            result = cases.run_stage(native.Session, interactive_base[:-1] + ['--dbname=' + DATABASE], env, trace, fixtures, authority)
        if result.get('actualGroups') != ['CAW' + str(i).zfill(2) for i in range(1, 13)] or proof['actualGroups'] != result['actualGroups']:
            raise RuntimeError('CAW_EXACT_TWELVE_NATIVE_GROUPS_REQUIRED')
        if len(proof['nativeSessionExits']) != 6 or any(r['exitCode'] != 0 or r['closeError'] or r['forcedCleanupFallback'] for r in proof['nativeSessionExits']):
            raise RuntimeError('CAW_ALL_SIX_ADDITIONAL_NATIVE_CLIENTS_MUST_EXIT_NATURALLY_ZERO')
        proof.update(result)
        return proof
    except Exception as error:
        failed = True
        proof['status'], proof['errorType'], proof['errorCode'] = 'FAIL_AUTHORITY12_COMPONENT_MODEL_NO_RETRY', type(error).__name__, str(error)[:700]
        raise
    finally:
        readback_error = None
        if old_file is not None and old_copy is not None and before_core is not None and before_profile is not None:
            try:
                after_core = observed('12a-08-original77-after', base, old_file.CORE_SNAPSHOT_SQL)
                after_profile = observed('12a-09-profile12-after', profile_base, old_copy.profile_snapshot_sql())
                proof['old77After'], proof['profile12After'] = after_core, after_profile
                proof['oldCoreProfileDatabasesPreserved'] = after_core == before_core and after_profile == before_profile
                after_functions = observed('12a-10-copy-functions-after', copy_base, FUNCTION_METADATA + ';')
                before_by = {r['oid']: r for r in before_functions}
                after_by = {r['oid']: r for r in after_functions}
                changed_oids = {r['oid'] for r in before_functions if 'public.' + r['regprocedure'] in CHANGED}
                proof['exactThreeOldBodyChangesOnly'] = len(changed_oids) == 3 and all(
                    after_by.get(oid, {}).get('withoutBody' if oid in changed_oids else 'whole') == row['withoutBody' if oid in changed_oids else 'whole']
                    for oid, row in before_by.items())
                newly_added = [r for r in after_functions if r['oid'] not in before_by]
                proof['exactSixNewFunctionsOnly'] = (proof['candidateCommitState'].startswith('COMMITTED_')
                    and {'public.' + r['regprocedure'] for r in newly_added} == set(NEW))
                expected_bodies = authority['functionBodyPins']
                proof['allEightFinalBodiesExact'] = all(any('public.' + row['regprocedure'] == name and row['body'] == digest for row in after_functions) for name, digest in expected_bodies.items())
                proof['immutableActualBodyExact'] = any('public.' + r['regprocedure'] == NEW[-1] and r['body'] == '1b9e39c3a0820be6cd297be17cfff8022e6bb46a6f4206462dc950094337e2a3' for r in after_functions)
                after_rows = row_bags('12a-11-old-copy-rows-after')
                proof['oldCopyRowValuesAndMultiplicityPreserved'] = (set(after_rows) == set(before_rows)
                    and all(not(Counter(bag) - Counter(after_rows[name])) for name, bag in before_rows.items()))
                proof['noNewApplicationTable'] = set(after_rows) == set(before_rows)
            except Exception as error:
                readback_error = {'type': type(error).__name__, 'error': str(error)[:700]}
                proof['preservationReadbackFailure'] = readback_error
        proof['sourceUnchanged'] = bool(source_pins) and all((here / p['path']).is_file() and hashlib.sha256((here / p['path']).read_bytes()).hexdigest() == p['sha256'] for p in source_pins)
        proof['cleanupFailures'] = [r for r in proof['nativeSessionExits'] if r['exitCode'] != 0 or r['closeError'] or r['forcedCleanupFallback']]
        required = ('sourceUnchanged', 'oldCoreProfileDatabasesPreserved', 'exactThreeOldBodyChangesOnly', 'exactSixNewFunctionsOnly',
                    'allEightFinalBodiesExact', 'immutableActualBodyExact', 'oldCopyRowValuesAndMultiplicityPreserved', 'noNewApplicationTable')
        bad = any(not proof.get(key) for key in required) or proof['cleanupFailures'] or readback_error is not None
        if not failed and bad: proof['status'] = 'FAIL_CAW_FINAL_SOURCE_PRESERVATION_OR_NATIVE_EXIT'
        (output / '12a-current-authority-result.json').write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        if not failed and bad: raise RuntimeError('CAW_FINAL_PRESERVATION_SOURCE_OR_NATIVE_EXIT_FAILURE')
