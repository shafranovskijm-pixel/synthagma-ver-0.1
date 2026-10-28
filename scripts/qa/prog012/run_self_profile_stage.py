"""CI-only self-profile12 successor after exact core48/read13/file16 completion.
Uses a distinct fresh synthetic database in the already inspected job service.
No production endpoint, provider Auth, new transport or original-fixture mutation.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import threading

CORE_DATABASE = 'sintagma_pcr_v4_r2_lab_20261028'
DATABASE = 'sintagma_self_profile_lab_20261028'
CORE_SNAPSHOT_SQL = "SELECT jsonb_build_object('auth.users',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM auth.users t),'public.account_deletion_revocations',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM public.account_deletion_revocations t),'public.admin_staff',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM public.admin_staff t),'public.course_documents',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM public.course_documents t),'public.course_modules',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM public.course_modules t),'public.courses',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM public.courses t),'public.lesson_attachments',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM public.lesson_attachments t),'public.lessons',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM public.lessons t),'public.library_documents',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM public.library_documents t),'public.marketplace_courses',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM public.marketplace_courses t),'public.org_document_versions',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM public.org_document_versions t),'public.org_documents',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM public.org_documents t),'public.platform_course_file_binding_events',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM public.platform_course_file_binding_events t),'public.platform_course_file_intents',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM public.platform_course_file_intents t),'public.platform_course_file_receipts',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM public.platform_course_file_receipts t),'public.platform_course_publication_deleted_parents',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM public.platform_course_publication_deleted_parents t),'public.platform_course_publication_invocations',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM public.platform_course_publication_invocations t),'public.platform_course_publication_library_revisions',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM public.platform_course_publication_library_revisions t),'public.platform_course_publication_review_events',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM public.platform_course_publication_review_events t),'public.platform_course_publication_scope_revisions',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM public.platform_course_publication_scope_revisions t),'public.profiles',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM public.profiles t),'public.qa_retained_results',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM public.qa_retained_results t),'public.test_questions',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM public.test_questions t),'public.user_roles',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM public.user_roles t),'storage.buckets',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM storage.buckets t),'storage.objects',(SELECT jsonb_build_object('rows',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')),''),'UTF8')),'hex')) FROM storage.objects t),'public_and_auth_functions',(SELECT encode(sha256(convert_to(coalesce(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,''),''ORDER BY p.oid::regprocedure::text),''),'UTF8')),'hex')FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','auth')AND p.prokind='f'),'role_catalog_nonsecret',(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,'inherit',rolinherit,'create_role',rolcreaterole,'create_db',rolcreatedb,'login',rolcanlogin)ORDER BY rolname),'[]')::text,'UTF8')),'hex')FROM pg_roles));"

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def run_self_profile_stage(here, command, base, interactive_base, env, output, core, expected_manifest_sha256):
    here, output = Path(here).resolve(strict=True), Path(output).resolve(strict=True)
    proof = {'status': 'RUNNING_NATIVE_SELF_PROFILE12', 'production': False, 'ordinaryCloudAuth': False,
             'full14ProfileTriggerParity': False, 'profileDatabaseCreated': 'NOT_REQUESTED',
             'candidateCommitState': 'NOT_REQUESTED', 'actualGroups': [], 'nativeSessionExits': [],
             'sourceUnchanged': False, 'old77FixturePreserved': False}
    pins, failed, trace_count = [], False, 0
    try:
        if os.environ.get('GITHUB_ACTIONS') != 'true' or sys.platform != 'linux':
            raise RuntimeError('SELF_PROFILE_GUARDED_LINUX_GITHUB_ONLY')
        if (core.get('actualCases') != ['PCRV2S' + str(i).zfill(2)for i in range(1,19)]
                or core.get('actualAuthSubgroups') != ['S02_NULL_ROLE_POSITIVE_ADMIN_DENIED','S02_SAME_ADMIN_AUTHENTICATED_ALLOWED']
                or [x.split(' ',1)[0]for x in core.get('actualConcurrencyCases',[])] != ['PCRV2C' + str(i).zfill(2)for i in range(1,19)]
                or len(core.get('actualCascadeSubgroups',[])) != 10
                or core.get('readStage',{}).get('actualCases') != ['PCRUIR' + str(i).zfill(2)for i in range(1,14)]
                or not core.get('readStage',{}).get('status','').startswith('PASS_')
                or core.get('fileStage',{}).get('actualGroups') != ['DB14-R4-' + str(i).zfill(2)for i in range(1,17)]
                or not core.get('fileStage',{}).get('status','').startswith('PASS_')
                or not core.get('nativeSessionExits') or any(x['exitCode'] != 0 or x['closeError']for x in core['nativeSessionExits'])
                or not core.get('fileStage',{}).get('nativeSessionExits')
                or any(x['exitCode'] != 0 for x in core['fileStage']['nativeSessionExits'])):
            raise RuntimeError('UNCHANGED_ORIGINAL77_NATURAL_ZERO_REQUIRED_FIRST')
        if base[-1] != '--dbname=' + CORE_DATABASE or interactive_base[-1] != '--dbname=' + CORE_DATABASE:
            raise RuntimeError('EXACT_EXISTING_REVIEWED_NATIVE_ARGV_REQUIRED')
        manifest_bytes = (here / 'ci-self-profile-inputs.json').read_bytes()
        if hashlib.sha256(manifest_bytes).hexdigest() != expected_manifest_sha256:
            raise RuntimeError('REVIEWED_SELF_PROFILE_INPUT_MANIFEST_REQUIRED')
        pins = json.loads(manifest_bytes)['files']
        if len(pins) != 5:
            raise RuntimeError('EXACT_FIVE_SELF_PROFILE_INPUTS_REQUIRED')
        for pin in pins:
            target = (here / pin['path']).resolve(strict=True)
            raw = target.read_bytes()
            if target.parent != here or len(raw) != pin['bytes'] or hashlib.sha256(raw).hexdigest() != pin['sha256']:
                raise RuntimeError('SELF_PROFILE_SOURCE_DRIFT')
        before = json.loads(command('09p-00-original77-before', base + ['-A','-t','-c',CORE_SNAPSHOT_SQL]).stdout.decode('utf-8').strip())
        proof['old77Before'] = before
        absent = command('09p-01-new-database-absent',base + ['-A','-t','-c',"SELECT NOT EXISTS(SELECT 1 FROM pg_database WHERE datname='" + DATABASE + "');"])
        if absent.stdout.decode('utf-8').strip() != 't':
            raise RuntimeError('SELF_PROFILE_DATABASE_MUST_NOT_EXIST_NO_REUSE')
        proof['profileDatabaseCreated'] = 'REQUESTED_OUTCOME_UNKNOWN'
        command('09p-02-create-new-dedicated-database',base + ['-c','CREATE DATABASE ' + DATABASE + ' TEMPLATE template0 OWNER postgres;'])
        proof['profileDatabaseCreated'] = 'CREATED_NATIVE_PSQL_EXIT0_ACK'
        profile_base = base[:-1] + ['--dbname=' + DATABASE]
        profile_interactive = interactive_base[:-1] + ['--dbname=' + DATABASE]
        check_sql = "SELECT json_build_object('database',current_database(),'address',host(inet_server_addr()),'port',inet_server_port()," + \
                    "'data',current_setting('data_directory'),'actor',current_user,'version',current_setting('server_version_num')," + \
                    "'marker',current_setting('pcr.lab_authorized',true),'empty',to_regnamespace('auth')IS NULL AND " + \
                    "NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')AND " + \
                    "NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'));"
        observed = json.loads(command('09p-03-fresh-profile-database-preflight',profile_base + ['-A','-t','-c',check_sql]).stdout.decode('utf-8').strip())
        if observed != {'database':DATABASE,'address':'127.0.0.1','port':5432,'data':'/var/lib/postgresql/data','actor':'postgres','version':'170011','marker':'source-reviewed-root-run-only','empty':True}:
            raise RuntimeError('EXACT_EMPTY_DEDICATED_PROFILE_DB_REQUIRED')
        proof['preflight'] = observed
        command('09p-04-profile-synthetic-bootstrap',profile_base + ['-f','-'],(here / 'self-profile-unit-bootstrap.sql').read_bytes())
        proof['candidateCommitState'] = 'REQUESTED_OUTCOME_UNKNOWN'
        command('09p-05-profile-exact-candidate',profile_base + ['-f','-'],(here / 'self-profile.candidate.sql').read_bytes())
        proof['candidateCommitState'] = 'COMMITTED_NATIVE_PSQL_EXIT0_ACK'
        with (output / '09p-self-profile-native12.jsonl').open('x',encoding='utf-8')as log:
            guard = threading.Lock()
            def trace(value):
                nonlocal trace_count
                with guard:
                    trace_count += 1
                    if value.get('case'):proof['actualGroups'].append(value['case'])
                    if value.get('selfProfileNativeSessionExit'):proof['nativeSessionExits'].append(value['selfProfileNativeSessionExit'])
                    log.write(json.dumps(value,ensure_ascii=False)+'\n');log.flush()
            native = load('pcr_self_profile_unchanged_native_session',here / 'concurrency_cases.py')
            cases = load('pcr_self_profile_twelve_cases',here / 'self_profile_cases.py')
            result = cases.run_stage(native.Session,profile_interactive,env,trace)
        if result.get('actualGroups') != ['PSELF'+str(i).zfill(2)for i in range(1,13)] or proof['actualGroups'] != result['actualGroups']:
            raise RuntimeError('EXACT_TWELVE_NATIVE_SELF_PROFILE_GROUPS_REQUIRED')
        if len(proof['nativeSessionExits']) != 3 or any(x['exitCode'] != 0 or x['closeError']or x.get('forcedCleanupFallback')for x in proof['nativeSessionExits']):
            raise RuntimeError('ALL_THREE_SELF_PROFILE_CLIENTS_MUST_EXIT_NATURALLY_ZERO')
        after = json.loads(command('09p-06-original77-after',base + ['-A','-t','-c',CORE_SNAPSHOT_SQL]).stdout.decode('utf-8').strip())
        proof['old77After'] = after
        if after != before:
            raise RuntimeError('ORIGINAL77_FIXTURE_OR_ROLE_METADATA_CHANGED')
        proof.update(result)
        proof['old77FixturePreserved'] = True
        return proof
    except Exception as error:
        failed = True
        proof['status'] = 'FAIL_NATIVE_SELF_PROFILE12_OR_GUARD_NO_RETRY'
        proof['errorType'],proof['errorCode'] = type(error).__name__,str(error)[:500]
        raise
    finally:
        proof['traceEventCount'] = trace_count
        proof['sourceUnchanged'] = bool(pins)and all((here/p['path']).is_file()and hashlib.sha256((here/p['path']).read_bytes()).hexdigest()==p['sha256']for p in pins)
        proof['cleanupFailures'] = [x for x in proof['nativeSessionExits']if x['exitCode']!=0 or x['closeError']or x.get('forcedCleanupFallback')]
        late_failure = proof['status'].startswith('PASS_')and(not proof['sourceUnchanged']or proof['cleanupFailures'])
        if late_failure:proof['status']='FAIL_SELF_PROFILE_SOURCE_OR_NATIVE_EXIT_AT_FINAL_READBACK'
        (output/'09p-self-profile-result.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        if late_failure and not failed:raise RuntimeError('SELF_PROFILE_FINAL_SOURCE_OR_NATIVE_EXIT_FAILED')
