"""Only two NEW current-file metadata components in a fresh private PG17.11 model.
No original139/native2 cases, capability override, provider Auth, HTTP or Cloud SQL.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import threading

DATABASE='sintagma_pcf_current_context_lab_20261029'
ORDER=["copy24-modeled-bootstrap.sql","copy24-modeled-actors-and-retained-fixtures.sql","copy-pcr-core.candidate.sql","copy-file-r4.candidate.sql","copy-file-delivery.candidate.sql","current-capture6.modeled.candidate.sql","current-authority12.modeled-schema-extension.sql","current-authority12.modeled.candidate.sql","persisted-review-read.candidate.sql","selected-proposal-metadata.candidate.sql","local-only-synthetic653-ledger.fixture.sql","current-file-review-context.full-product-migration.sql"]
EXPECTED_INPUTS=sorted(['inputs/'+name for name in ORDER]+['inputs/concurrency_cases.py','inputs/copy24_cases.py',
 'cases/current_file_review_context_cases.py','stage/run_current_file_review_context_stage.py'])
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
FUNCTIONS_SQL="""SELECT jsonb_build_object('target_oid',to_regprocedure('public.read_platform_course_publication_review_context(uuid,uuid,text,text,uuid)')::oid::text,
 'functions',(SELECT jsonb_agg(jsonb_build_object('oid',p.oid::text,'name',p.proname,
 'body_sha256',encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),'attributes',jsonb_build_object(
 'identity',pg_get_function_identity_arguments(p.oid),'arguments',pg_get_function_arguments(p.oid),'returns',pg_get_function_result(p.oid),
 'kind',p.prokind,'lang',p.prolang,'owner',p.proowner,'definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,
 'leakproof',p.proleakproof,'parallel',p.proparallel,'config',p.proconfig,'acl',p.proacl,'argnames',p.proargnames,
 'argmodes',p.proargmodes,'allargtypes',p.proallargtypes))ORDER BY p.oid)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','auth')),
 'stamp',public.pcf_v1_enforcement_stamp(),'capabilities',public.pcf_v1_delivery_capabilities());"""


def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


def observed(command,label,argv,sql):
    return json.loads(command(label,argv+['-A','-t','-c',sql]).stdout.decode('utf8').strip())


def expected_guard(database):
    return {'database':database,'address':'127.0.0.1','port':5432,'data':'/var/lib/postgresql/data',
 'actor':'postgres','session':'postgres','version':'170011','marker':'source-reviewed-root-run-only',
 'isolation':'read committed','origin':'origin','empty':True}


def run_current_file_review_context_stage(here,command,base,interactive_base,env,output,expected_manifest_sha256):
    here,output=Path(here).resolve(strict=True),Path(output).resolve(strict=True)
    proof={'status':'RUNNING_TWO_NEW_CURRENT_FILE_METADATA_COMPONENTS','actualGroups':[],'nativeSessionExits':[],
 'databaseCreateState':'NOT_REQUESTED','capabilityOverride':False,'oldCaseBodiesExecuted':0,'production':False,
 'genuineAuthOrStorageHTTP':False,'full17Accepted':False,'realFilePublicationAccepted':False}
    created=False;before_roles=None;failure=False
    try:
        if os.environ.get('GITHUB_ACTIONS')!='true'or sys.platform!='linux'or base[-1]!='--dbname=postgres'or interactive_base[-1]!='--dbname=postgres':
            raise RuntimeError('CFM_FIXED_FRESH_PRIVATE_CI_CONTROL_REQUIRED')
        raw=(here/'current-file-context-inputs.json').read_bytes()
        if hashlib.sha256(raw).hexdigest()!=expected_manifest_sha256:
            raise RuntimeError('CFM_REVIEWED_MANIFEST_REQUIRED_BEFORE_IMPORT_OR_SQL')
        manifest=json.loads(raw)
        if sorted(p['path']for p in manifest['files'])!=EXPECTED_INPUTS or manifest['database']!=DATABASE:
            raise RuntimeError('CFM_EXACT_SIXTEEN_INPUTS_REQUIRED')
        for p in manifest['files']:
            target=(here/p['path']).resolve(strict=True)
            raw=target.read_bytes()
            if not target.is_relative_to(here)or len(raw)!=p['bytes']or hashlib.sha256(raw).hexdigest()!=p['sha256']:
                raise RuntimeError('CFM_SOURCE_DRIFT:'+p['path'])
        if observed(command,'cfm-00-control-preflight',base,SERVER_GUARD)!=expected_guard('postgres'):
            raise RuntimeError('CFM_EMPTY_PRIVATE_CONTROL_REQUIRED')
        before_roles=observed(command,'cfm-01-model-roles-before',base,ROLE_SNAPSHOT)
        if {r['name']for r in before_roles['roles']}!={'anon','authenticated','service_role'}:
            raise RuntimeError('CFM_ORIGINAL_THREE_SYNTHETIC_MODEL_ROLES_REQUIRED')
        absent=command('cfm-02-new-db-absent',base+['-A','-t','-c',"SELECT NOT EXISTS(SELECT 1 FROM pg_database WHERE datname='"+DATABASE+"');"])
        if absent.stdout.decode().strip()!='t':raise RuntimeError('CFM_FRESH_DB_MUST_NOT_EXIST')
        proof['databaseCreateState']='REQUESTED_OUTCOME_UNKNOWN'
        command('cfm-03-create-one-owned-db',base+['-c','CREATE DATABASE '+DATABASE+' TEMPLATE template0 OWNER postgres;'])
        created=True;proof['databaseCreateState']='NATIVE_CREATE_EXIT0_ACK'
        model=base[:-1]+['--dbname='+DATABASE]
        interactive=interactive_base[:-1]+['--dbname='+DATABASE]
        if observed(command,'cfm-04-model-preflight',model,SERVER_GUARD)!=expected_guard(DATABASE):
            raise RuntimeError('CFM_EMPTY_MODEL_REQUIRED')
        for index,filename in enumerate(ORDER,1):
            if filename=='current-file-review-context.full-product-migration.sql':
                before_functions=observed(command,'cfm-05-reader-function-catalog-before',model,FUNCTIONS_SQL)
            command('cfm-06-'+str(index)+'-'+filename,model+['-f','-'],(here/'inputs'/filename).read_bytes())
        after_functions=observed(command,'cfm-07-reader-function-catalog-after',model,FUNCTIONS_SQL)
        before={r['oid']:r for r in before_functions['functions']};after={r['oid']:r for r in after_functions['functions']}
        target=before_functions['target_oid']
        if set(before)!=set(after)or target!=after_functions['target_oid']or before_functions['stamp']!=after_functions['stamp']or before_functions['capabilities']!=after_functions['capabilities']:
            raise RuntimeError('CFM_FUNCTION_SET_OR_STAMP_OR_CAPABILITY_DRIFT')
        for oid,row in before.items():
            if oid==target:
                if (row['body_sha256']!='543e9fb05d8303eea9df527215d789aad44100ab7f83a5d2d66e69021cd64c75'
                    or after[oid]['body_sha256']!='b1387be7f8362f6d1d1e31611109ce0af0c15d1e70aff0886c9b974efce007a2'or row['attributes']!=after[oid]['attributes']):
                    raise RuntimeError('CFM_ONLY_EXACT_READER_BODY_MAY_CHANGE')
            elif row!=after[oid]:raise RuntimeError('CFM_UNRELATED_FUNCTION_CHANGED')
        proof['onlyIntendedReaderBodyChanged']=True
        proof['enforcementStampBefore'],proof['enforcementStampAfter']=before_functions['stamp'],after_functions['stamp']
        proof['capabilitiesBefore'],proof['capabilitiesAfter']=before_functions['capabilities'],after_functions['capabilities']
        native=load('cfm_unchanged_session_definitions',here/'inputs/concurrency_cases.py')
        fixture=load('cfm_unchanged_fixture_definitions',here/'inputs/copy24_cases.py')
        cases=load('cfm_only_two_new_metadata_cases',here/'cases/current_file_review_context_cases.py')
        with(output/'CFM-events.jsonl').open('x',encoding='utf8')as log:
            lock=threading.Lock()
            def trace(value):
                with lock:
                    if value.get('case'):proof['actualGroups'].append(value['case'])
                    if value.get('currentFileMetadataNativeSessionExit'):proof['nativeSessionExits'].append(value['currentFileMetadataNativeSessionExit'])
                    log.write(json.dumps(value,ensure_ascii=False)+'\n');log.flush()
            result=cases.run_cases(native.Session,interactive,env,trace,fixture,here/'inputs')
        exits=proof['nativeSessionExits']
        if (result.get('actualGroups')!=['CFM01','CFM02']or proof['actualGroups']!=result['actualGroups']
            or len(exits)!=3 or any(r['exitCode']!=0 or r.get('closeError')or r.get('forcedCleanupFallback')is not False for r in exits)
            or result.get('allThreeCapabilitiesFalse')is not True or result.get('capabilityOverride')is not False
            or result['capabilityDescriptorBefore']!=result['capabilityDescriptorAfter']):
            raise RuntimeError('CFM_TWO_GROUPS_THREE_NATURAL0_UNCHANGED_FALSE_CAPS_REQUIRED')
        proof.update(result)
        final_functions=observed(command,'cfm-07b-function-catalog-after-cases-and-replay',model,FUNCTIONS_SQL)
        if final_functions!=after_functions:raise RuntimeError('CFM_REPLAY_OR_CASE_CHANGED_FUNCTIONS_STAMP_OR_CAPS')
        proof['completeProductMigrationCommitted']=True
        proof['fullMigrationReplayRefused']=True
        proof['functionStampAndCapsAfterReplayExact']=True
        after_roles=observed(command,'cfm-08-model-roles-after',base,ROLE_SNAPSHOT)
        if after_roles!=before_roles:raise RuntimeError('CFM_GLOBAL_MODEL_ROLE_DRIFT')
        proof['modelRolesBefore'],proof['modelRolesAfter']=before_roles,after_roles
        return proof
    except Exception as error:
        failure=True;proof['status']='FAIL_CURRENT_FILE_METADATA_NO_RETRY'
        proof['errorType'],proof['errorCode']=type(error).__name__,str(error)[:700]
        raise
    finally:
        primary=sys.exc_info()[0]is not None;cleanup=[]
        if created:
            try:
                owned=observed(command,'cfm-09-owned-db-drop-guard',base,
 "SELECT jsonb_build_object('database',current_database(),'actor',current_user,'address',host(inet_server_addr()),'port',inet_server_port(),"
 "'data',current_setting('data_directory'),'version',current_setting('server_version_num'),'marker',current_setting('pcr.lab_authorized',true),"
 "'owned',EXISTS(SELECT 1 FROM pg_database WHERE datname='"+DATABASE+"'AND datdba='postgres'::regrole));")
                if owned!={'database':'postgres','actor':'postgres','address':'127.0.0.1','port':5432,'data':'/var/lib/postgresql/data',
 'version':'170011','marker':'source-reviewed-root-run-only','owned':True}:raise RuntimeError('CFM_OWNED_DB_DROP_IDENTITY_DRIFT')
                command('cfm-10-drop-only-new-owned-db',base+['-c','DROP DATABASE '+DATABASE+';'])
                absent=command('cfm-11-separate-post-db-absent',base+['-A','-t','-c',"SELECT NOT EXISTS(SELECT 1 FROM pg_database WHERE datname='"+DATABASE+"');"])
                if absent.stdout.decode().strip()!='t':raise RuntimeError('CFM_OWNED_DB_NOT_ABSENT')
                proof['ownedDatabaseDropped'],proof['separatePostDatabaseAbsent']=True,True
            except Exception as error:cleanup.append({'stage':'ownedDBDrop','error':repr(error)})
        if before_roles is not None:
            try:
                if observed(command,'cfm-12-final-model-roles',base,ROLE_SNAPSHOT)!=before_roles:raise RuntimeError('CFM_FINAL_GLOBAL_ROLE_DRIFT')
                proof['finalModelRolesExact']=True
            except Exception as error:cleanup.append({'stage':'roles','error':repr(error)})
        if cleanup:
            failure=True;proof['status']='FAIL_CURRENT_FILE_METADATA_CLEANUP_NO_RETRY';proof['cleanupFailures']=cleanup;proof['primaryFailurePreserved']=primary
        proof['failed']=failure
        (output/'CFM-stage-result.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        if cleanup and not primary:raise RuntimeError('CFM_CLEANUP_FAILURE')
