"""SOURCE ONLY: four new private foundation components for an already reviewed official private PG17.11 service.
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

DATABASE = 'sintagma_pfd_foundation_lab_20261029'
ORDER = [
    'copy24-modeled-bootstrap.sql', 'copy24-modeled-actors-and-retained-fixtures.sql',
    'copy-pcr-core.candidate.sql', 'copy-file-r4.candidate.sql', 'copy-file-delivery.candidate.sql',
    'current-capture6.modeled.candidate.sql', 'current-authority12.modeled-schema-extension.sql',
    'current-authority12.modeled.candidate.sql',
]
EXPECTED_INPUTS = sorted(['inputs/' + name for name in ORDER] + [
 'inputs/concurrency_cases.py', 'inputs/copy24_cases.py',
 'inputs/foundation.product-source.sql', 'inputs/foundation.empty-inverse.product-source.sql',
 'fixtures/private_foundation_fixtures.py','cases/private_foundation_cases.py','stage/run_private_foundation_stage.py',
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



CLOUD_STAMP = '5d8e867d99288c8e1372c1f7e49c4ca07341ce2fb197b5aa2ff593529095aee6'
EXPECTED_GROUPS = ['PFD01','PFD02','PFD03','PFD04']


def projected_guard(source, model_stamp, occurrences):
    # ONLY the guarded expected-stamp literal differs in the isolated projection.
    # The actual stamp function is unchanged; it is read before and after install.
    if len(model_stamp) != 64 or any(c not in '0123456789abcdef' for c in model_stamp):
        raise RuntimeError('PFD_REAL_MODEL_STAMP_REQUIRED')
    old, new = "'" + CLOUD_STAMP + "'", "'" + model_stamp + "'"
    if source.count(old) != occurrences:
        raise RuntimeError('PFD_EXACT_PRODUCT_STAMP_GUARD_OCCURRENCES_REQUIRED')
    result = source.replace(old, new)
    if result.count(new) != occurrences or result.replace(new, old) != source:
        raise RuntimeError('PFD_MODEL_GUARD_WHOLE_INVERSE_NOT_EXACT')
    return result


def descriptor(control, base, material):
    return base.jrow(control, "SELECT jsonb_build_object('stamp',public.pcf_v1_enforcement_stamp(),"
        "'caps',public.pcf_v1_delivery_capabilities(),'edition',public.pcr_v2_sha(public.pcr_v2_manifest("
        + base.q(material['course']) + ',' + base.q(material['listing']) + ")),"
        "'capabilityDefinition',(SELECT jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',p.proacl::text)"
        "FROM pg_proc p WHERE p.oid='public.pcf_v1_delivery_capabilities()'::regprocedure));")


def retained(control, base, fixture):
    result = base.protected(control)
    for key in ('authSynthetic','roles','profiles'):
        result.pop(key)
    excluded = ','.join(base.q(actor) + '::uuid' for actor in fixture.ACTORS.values())
    for label, relation, column in [('originalAuth','auth.users','id'),('originalProfiles','public.profiles','user_id'),('originalRoles','public.user_roles','user_id')]:
        value = base.jrow(control, "SELECT jsonb_build_object('sha',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(x)ORDER BY to_jsonb(x)::text),'[]')::text,'UTF8')),'hex'))FROM "
            + relation + ' x WHERE x.' + column + ' NOT IN(' + excluded + ');')
        result[label] = value['sha']
    return result


def run_private_foundation_stage(here, command, base, interactive_base, env, output, expected_manifest_sha256):
    here, output = Path(here).resolve(strict=True), Path(output).resolve(strict=True)
    proof = {'status':'RUNNING_FOUR_NEW_PRIVATE_FOUNDATION_COMPONENTS','production':False,
        'publicRPCsImplemented':0,'genuineAuthCloudUI':False,'activePolicyAcceptance':False,
        'actualGroups':[],'nativeSessionExits':[],'databaseCreateState':'NOT_REQUESTED',
        'oldCaseBodiesExecuted':0,'cloudCaptureStampAccepted':False,'globalThreeModelRolesUnchanged':False}
    created, failed, before_roles = False, False, None
    sessions, trace_count = [], 0
    log = None
    try:
        if os.environ.get('GITHUB_ACTIONS')!='true' or sys.platform!='linux':
            raise RuntimeError('PFD_OFFICIAL_PRIVATE_LINUX_CI_ONLY')
        if base[-1]!='--dbname=postgres' or interactive_base[-1]!='--dbname=postgres':
            raise RuntimeError('PFD_FRESH_SERVICE_CONTROL_ARGV_REQUIRED')
        if any('postgresql://'in str(arg)or'postgres://'in str(arg)for arg in base+interactive_base):
            raise RuntimeError('PFD_NO_DATABASE_URI_OR_CREDENTIAL_ARGUMENTS')
        manifest_bytes=(here/'pfd-inputs.json').read_bytes()
        if hashlib.sha256(manifest_bytes).hexdigest()!=expected_manifest_sha256:
            raise RuntimeError('PFD_REVIEWED_INPUT_MANIFEST_REQUIRED')
        manifest=json.loads(manifest_bytes)
        if sorted(p['path']for p in manifest['files'])!=EXPECTED_INPUTS or manifest['database']!=DATABASE:
            raise RuntimeError('PFD_EXACT_FIFTEEN_INPUTS_REQUIRED')
        for pin in manifest['files']:
            target=(here/pin['path']).resolve(strict=True)
            if not target.is_relative_to(here)or not target.is_file():raise RuntimeError('PFD_INPUT_OUTSIDE_FINITE_PACKET')
            raw=target.read_bytes()
            if len(raw)!=pin['bytes']or hashlib.sha256(raw).hexdigest()!=pin['sha256']:
                raise RuntimeError('PFD_SOURCE_DRIFT:'+pin['path'])
        observed=json_command(command,'pfd-00-official-empty-service',base,SERVER_GUARD)
        if observed!=expected_guard('postgres'):raise RuntimeError('PFD_EXACT_EMPTY_OFFICIAL_SERVICE_REQUIRED')
        proof['servicePreflight']=observed
        before_roles=json_command(command,'pfd-01-model-roles-before',base,ROLE_SNAPSHOT)
        if {r['name']for r in before_roles.get('roles',[])}!={'anon','authenticated','service_role'}:
            raise RuntimeError('PFD_EXISTING_THREE_MODEL_ROLES_REQUIRED')
        absent=command('pfd-02-database-absent',base+['-A','-t','-c',"SELECT NOT EXISTS(SELECT 1 FROM pg_database WHERE datname='"+DATABASE+"');"])
        if absent.stdout.decode().strip()!='t':raise RuntimeError('PFD_DATABASE_MUST_NOT_EXIST_NO_REUSE')
        proof['databaseCreateState']='REQUESTED_OUTCOME_UNKNOWN'
        command('pfd-03-create-owned-database',base+['-c','CREATE DATABASE '+DATABASE+' TEMPLATE template0 OWNER postgres;'])
        created=True;proof['databaseCreateState']='NATIVE_CREATE_EXIT0_ACK'
        model_base=base[:-1]+['--dbname='+DATABASE]
        model_interactive=interactive_base[:-1]+['--dbname='+DATABASE]
        observed=json_command(command,'pfd-04-new-model-empty',model_base,SERVER_GUARD)
        if observed!=expected_guard(DATABASE):raise RuntimeError('PFD_EXACT_EMPTY_PRIVATE_MODEL_REQUIRED')
        proof['modelPreflight']=observed
        for index,filename in enumerate(ORDER,1):
            command('pfd-05-'+str(index)+'-'+filename,model_base+['-f','-'],(here/'inputs'/filename).read_bytes())
        native=load_definitions('pfd_unchanged_native_session',here/'inputs/concurrency_cases.py')
        helpers=load_definitions('pfd_unchanged_fixture_helpers_only',here/'inputs/copy24_cases.py')
        fixture=load_definitions('pfd_new_model_fixture_definitions',here/'fixtures/private_foundation_fixtures.py')
        cases=load_definitions('pfd_only_four_new_private_cases',here/'cases/private_foundation_cases.py')
        log=(output/'PFD-events.jsonl').open('x',encoding='utf-8');lock=threading.Lock()
        def trace(value):
            nonlocal trace_count
            with lock:
                trace_count+=1
                if value.get('pass'):proof['actualGroups'].append(value['pass'])
                log.write(json.dumps(value,ensure_ascii=False)+'\n');log.flush()
        def session(name):
            value=native.Session.__new__(native.Session);sessions.append(value)
            native.Session.__init__(value,model_interactive,env,'PFD-'+name,trace)
            value.check("current_database()='"+DATABASE+"'AND host(inet_server_addr())='127.0.0.1'AND inet_server_port()=5432 "
                "AND current_setting('server_version_num')='170011'AND current_setting('data_directory')='/var/lib/postgresql/data' "
                "AND current_setting('pcr.lab_authorized',true)='source-reviewed-root-run-only'AND current_user='postgres' "
                "AND current_setting('transaction_isolation')='read committed'AND current_setting('session_replication_role')='origin'")
            return value
        control,reader,writer=[session(name)for name in('control','reader','writer')]
        control.check("encode(sha256(convert_to((SELECT prosrc FROM pg_proc WHERE oid='public.can_access_course_as_learner(uuid)'::regprocedure),'UTF8')),'hex')='ad3733450126783de3c50eb7988a6e49fd311c795eb961028508d3018b650f86' AND "
            "encode(sha256(convert_to((SELECT prosrc FROM pg_proc WHERE oid='public.uc_enrollment_is_withdrawn(uuid)'::regprocedure),'UTF8')),'hex')='51d86c8fe394fff258b78347eea25d75cf460c2f9e0e38a4f2f0a60c5891fba1'")
        proof['actualWithdrawalPredicateBodiesExact']=True
        material=fixture.source(control,helpers)
        before=descriptor(control,helpers,material)
        original_rows=retained(control,helpers,fixture)
        model_stamp=before['stamp']
        if not isinstance(model_stamp,str):raise RuntimeError('PFD_REAL_MODEL_STAMP_MISSING')
        product=(here/'inputs/foundation.product-source.sql').read_text(encoding='utf-8')
        inverse=(here/'inputs/foundation.empty-inverse.product-source.sql').read_text(encoding='utf-8')
        projected=projected_guard(product,model_stamp,1)
        projected_inverse=projected_guard(inverse,model_stamp,2)
        (output/'PFD-local-model-guard-only-forward.sql').write_text(projected,encoding='utf-8')
        (output/'PFD-local-model-guard-only-inverse.sql').write_text(projected_inverse,encoding='utf-8')
        projection={'scope':'LOCAL_MODEL_GUARD_ONLY_NOT_CLOUD_CAPTURE_ACCEPTANCE','realModelStamp':model_stamp,
            'cloudLiteral':CLOUD_STAMP,'cloudCaptureStampAccepted':False,'forwardReplacements':1,'inverseReplacements':2,
            'forwardWholeInverseExact':projected.replace("'"+model_stamp+"'","'"+CLOUD_STAMP+"'")==product,
            'inverseWholeInverseExact':projected_inverse.replace("'"+model_stamp+"'","'"+CLOUD_STAMP+"'")==inverse,
            'originalForwardSHA256':hashlib.sha256(product.encode()).hexdigest(),'projectedForwardSHA256':hashlib.sha256(projected.encode()).hexdigest(),
            'originalInverseSHA256':hashlib.sha256(inverse.encode()).hexdigest(),'projectedInverseSHA256':hashlib.sha256(projected_inverse.encode()).hexdigest()}
        (output/'PFD-model-guard-projection.json').write_text(json.dumps(projection,indent=2)+'\n',encoding='utf-8')
        proof['modelProjection']=projection
        command('pfd-06-reviewed-foundation-local-guard-projection',model_base+['-f','-'],projected.encode())
        after=descriptor(control,helpers,material)
        if after!=before:raise RuntimeError('PFD_INSTALL_CHANGED_REAL_MODEL_STAMP_CAPS_OR_EXISTING_MATERIAL')
        proof['installCaptureCapsAndMaterialExact']=True
        proof['materialSource']={'course':material['course'],'listing':material['listing'],'editionBefore':before['edition'],'editionAfter':after['edition']}
        result=cases.run_cases(control,reader,writer,helpers,fixture,trace,model_stamp)
        if result.get('actualGroups')!=EXPECTED_GROUPS or proof['actualGroups']!=EXPECTED_GROUPS:
            raise RuntimeError('PFD_EXACT_FOUR_NEW_GROUPS_REQUIRED')
        proof['caseResult']=result
        if descriptor(control,helpers,material)!=before or retained(control,helpers,fixture)!=original_rows:
            raise RuntimeError('PFD_EXISTING_MODEL_MATERIAL_OR_RETAINED_ROWS_CHANGED')
        proof['retainedOriginalModelRowsExact']=True
        proof['captureCapsAndMaterialExactAfterCases']=True
        # Inverse is exercised ONLY at empty standalone scaffold stage, before future RPCs.
        command('pfd-07-empty-only-inverse-local-guard-projection',model_base+['-f','-'],projected_inverse.encode())
        absent_after=json_command(command,'pfd-08-separate-empty-inverse-post',model_base,
            "SELECT jsonb_build_object('tablesAbsent',to_regclass('public.platform_private_file_delivery_v2_current')IS NULL AND to_regclass('public.platform_private_file_delivery_v2_events')IS NULL,"
            "'functionsAbsent',NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND left(p.proname,7)='pfd_v2_'),"
            "'stamp',public.pcf_v1_enforcement_stamp(),'caps',public.pcf_v1_delivery_capabilities());")
        if absent_after!={'tablesAbsent':True,'functionsAbsent':True,'stamp':model_stamp,'caps':before['caps']}:
            raise RuntimeError('PFD_EMPTY_INVERSE_POST_NOT_EXACT')
        if descriptor(control,helpers,material)!=before or retained(control,helpers,fixture)!=original_rows:
            raise RuntimeError('PFD_INVERSE_CHANGED_EXISTING_MODEL_MATERIAL_OR_RETAINED_ROWS')
        proof['emptyStandaloneInverseAccepted']=True;proof['inverseSeparatePost']=absent_after
        after_roles=json_command(command,'pfd-09-model-roles-after',base,ROLE_SNAPSHOT)
        if after_roles!=before_roles:raise RuntimeError('PFD_GLOBAL_MODEL_ROLE_DRIFT')
        proof['globalThreeModelRolesUnchanged']=True
        proof['modelRolesBefore'],proof['modelRolesAfter']=before_roles,after_roles
        proof['status']='PASS_FOUR_PRIVATE_FOUNDATION_MODEL_COMPONENTS_NOT_CLOUD_OR_PUBLIC_DELIVERY'
        return proof
    except Exception as error:
        failed=True;proof['status']='FAIL_PRIVATE_FOUNDATION_MODEL_NO_RETRY'
        proof['errorType'],proof['errorCode']=type(error).__name__,str(error)[:1000]
        raise
    finally:
        primary=sys.exc_info()[0]is not None;cleanup=[]
        for value in reversed(sessions):
            receipt={'session':getattr(value,'name','constructor-not-completed'),'pid':getattr(getattr(value,'proc',None),'pid',None),
                     'exitCode':None,'closeError':None,'forcedCleanupFallback':False}
            try:
                process=getattr(value,'proc',None);worker=getattr(value,'_pfd_background_thread',None)
                if process is not None:
                    if worker is not None and worker.is_alive():
                        receipt['forcedCleanupFallback']=True
                        if process.poll()is None:process.kill();process.wait(timeout=5)
                        worker.join(5)
                        if worker.is_alive():raise RuntimeError('PFD_BACKGROUND_READER_STILL_ALIVE')
                    else:
                        native.Session.close(value)
                    receipt['exitCode']=process.poll()
                    if receipt['exitCode']!=0:raise RuntimeError('PFD_NATIVE_CLIENT_NOT_NATURAL_ZERO')
                    if receipt['forcedCleanupFallback']:raise RuntimeError('PFD_FORCED_CLEANUP_IS_NOT_A_PASS')
            except Exception as error:
                receipt['closeError']=repr(error)
                process=getattr(value,'proc',None)
                if process is not None and process.poll()is None:
                    receipt['forcedCleanupFallback']=True
                    try:process.kill();process.wait(timeout=5)
                    except Exception as kill_error:receipt['killError']=repr(kill_error)
                receipt['exitCode']=None if process is None else process.poll()
                cleanup.append({'stage':'nativeClientClose','receipt':receipt})
            proof['nativeSessionExits'].append(receipt)
            if log is not None:log.write(json.dumps({'pfdNativeSessionExit':receipt})+'\n');log.flush()
        if not primary and(len(proof['nativeSessionExits'])!=3 or any(r['exitCode']!=0 or r['closeError']or r['forcedCleanupFallback']for r in proof['nativeSessionExits'])):
            cleanup.append({'stage':'nativeClientCloseCount','error':'three natural zero clients required'})
        proof['traceEventCount']=trace_count
        if log is not None:log.close()
        if created:
            try:
                observed=json_command(command,'pfd-10-before-owned-drop',base,
                    "SELECT jsonb_build_object('database',current_database(),'address',host(inet_server_addr()),'port',inet_server_port(),"
                    "'data',current_setting('data_directory'),'actor',current_user,'version',current_setting('server_version_num'),"
                    "'marker',current_setting('pcr.lab_authorized',true),'owned',EXISTS(SELECT 1 FROM pg_database WHERE datname='"
                    +DATABASE+"'AND datdba='postgres'::regrole));")
                if observed!={'database':'postgres','address':'127.0.0.1','port':5432,'data':'/var/lib/postgresql/data','actor':'postgres',
                              'version':'170011','marker':'source-reviewed-root-run-only','owned':True}:
                    raise RuntimeError('PFD_OWNED_DATABASE_DROP_IDENTITY_DRIFT')
                command('pfd-11-drop-only-owned-new-database',base+['-c','DROP DATABASE '+DATABASE+';'])
                absent=command('pfd-12-separate-database-absent',base+['-A','-t','-c',"SELECT NOT EXISTS(SELECT 1 FROM pg_database WHERE datname='"+DATABASE+"');"])
                if absent.stdout.decode().strip()!='t':raise RuntimeError('PFD_POST_DATABASE_NOT_ABSENT')
                proof['ownedDatabaseDropped'],proof['separatePostDatabaseAbsent']=True,True
            except Exception as error:cleanup.append({'stage':'ownedDatabaseDrop','error':repr(error)})
        if before_roles is not None:
            try:
                final_roles=json_command(command,'pfd-13-final-model-role-metadata',base,ROLE_SNAPSHOT)
                if final_roles!=before_roles:raise RuntimeError('PFD_FINAL_MODEL_ROLE_DRIFT')
                proof['finalModelRolesExact']=True
            except Exception as error:cleanup.append({'stage':'modelRoles','error':repr(error)})
        if cleanup:
            proof['cleanupFailures'],proof['primaryFailurePreserved']=cleanup,primary
            proof['status']='FAIL_PRIVATE_FOUNDATION_CLEANUP_OR_PRESERVATION';failed=True
        proof['failed']=failed
        (output/'PFD-stage-result.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        if cleanup and not primary:raise RuntimeError('PFD_CLEANUP_OR_PRESERVATION_FAILURE')
