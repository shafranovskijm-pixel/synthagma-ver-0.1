"""SOURCE ONLY. Concrete native SQL tests after unchanged core48 CI stage.
Only run_stage(accepted Session factory, same guarded psql argv/env, trace) runs tests.
No HTTP, Auth provider/JWT, real storage bytes, service startup or container lifecycle.
"""
from __future__ import annotations
import hashlib
import json
import os
import sys
from pathlib import Path
import threading
import time
import uuid

OWN = '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'
CLIENT = '20000000-0000-0000-0000-000000000001'
ACTOR = '11000000-0000-0000-0000-000000000001'
OTHER = '11000000-0000-0000-0000-000000000002'
PAYLOAD = b'%PDF-1.7\nSYNTHETIC PCF R4 CONTROL 28\n%%EOF\n'
DIGEST = hashlib.sha256(PAYLOAD).hexdigest()

def q(value):
    return "'" + str(value).replace("'", "''") + "'"

def uid():
    return str(uuid.uuid4())

def ctx(s, role='authenticated', actor=ACTOR, claim=None):
    s.ok("RESET ROLE; SET ROLE " + role + "; SELECT set_config('request.jwt.claim.sub'," + q(actor or '') + ",false); "
         "SELECT set_config('request.jwt.claim.role'," + q(claim if claim is not None else role) + ",false);")

def jsonrow(s, sql):
    rows = s.ok(sql)
    candidates = [line for line in rows if line.startswith('{')]
    if len(candidates) != 1:
        raise AssertionError('EXACT_ONE_JSON_NATIVE_RESULT_REQUIRED: ' + repr(rows))
    return json.loads(candidates[0])

def run_stage(Session, argv, env, trace):
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        raise RuntimeError('GUARDED_GITHUB_SERVICE_ONLY')
    here = Path(__file__).resolve().parent
    sessions = []
    actual = []
    def session(name):
        value = Session.__new__(Session)
        sessions.append(value)
        Session.__init__(value, argv, env, 'PCF-' + name, trace)
        value.check("current_database()='sintagma_pcr_v4_r2_lab_20261028' AND host(inet_server_addr())='127.0.0.1' "
                    "AND inet_server_port()=5432 AND current_setting('server_version_num')='170011' "
                    "AND current_setting('data_directory')='/var/lib/postgresql/data' "
                    "AND current_setting('pcr.lab_authorized',true)='source-reviewed-root-run-only'")
        return value
    def passed(number, details=None):
        name = 'DB14-R4-' + str(number).zfill(2)
        actual.append(name)
        trace({'case': name, 'status': 'PASS_NATIVE_SYNTHETIC_SQL_ONLY', 'details': details})
    admin = session('control')
    fixture = {name: uid() for name in ('course', 'module', 'lesson', 'listing', 'document', 'object', 'request', 'capture')}
    pointer = fixture['course'] + '/synthetic-r4.pdf'
    receipt = None
    baseline = None
    role_before = None
    body_before = None
    gap_installed = False
    try:
        admin.check("to_regclass('public.platform_course_file_receipts') IS NOT NULL AND "
                    "NOT EXISTS(SELECT 1 FROM public.platform_course_file_receipts) AND "
                    "NOT EXISTS(SELECT 1 FROM auth.users WHERE id IN(" + q(ACTOR) + ',' + q(OTHER) + '))')
        baseline = jsonrow(admin, "SELECT jsonb_build_object('retained',encode(sha256(convert_to((SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]')::text FROM public.qa_retained_results r),'UTF8')),'hex'),"
                           "'events',encode(sha256(convert_to((SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY sequence),'[]')::text FROM public.platform_course_publication_review_events e),'UTF8')),'hex'),"
                           "'scope',encode(sha256(convert_to((SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY course_id),'[]')::text FROM public.platform_course_publication_scope_revisions x),'UTF8')),'hex'));")
        admin.ok('INSERT INTO auth.users(id)VALUES(' + q(ACTOR) + '),(' + q(OTHER) + ');'
                 'INSERT INTO public.profiles(user_id,organization_id)VALUES(' + q(ACTOR) + ',' + q(OWN) + '),(' + q(OTHER) + ',' + q(CLIENT) + ');'
                 'INSERT INTO public.user_roles(user_id,role)VALUES(' + q(ACTOR) + ",'admin'),(" + q(OTHER) + ",'admin');")
        role_before = jsonrow(admin, "SELECT jsonb_build_object('profile',(SELECT to_jsonb(p)FROM public.profiles p WHERE user_id=" + q(ACTOR) + "),'auth',(SELECT to_jsonb(u)FROM auth.users u WHERE id=" + q(ACTOR) + "),'roles',(SELECT jsonb_agg(to_jsonb(r)ORDER BY role)FROM public.user_roles r WHERE user_id=" + q(ACTOR) + '));')
        admin.ok("INSERT INTO storage.buckets(id,name,public)VALUES('course-files','course-files',true);"
                 'INSERT INTO public.courses(id,organization_id,title)VALUES(' + q(fixture['course']) + ',' + q(OWN) + ",'PCF R4 SYNTHETIC');"
                 'INSERT INTO public.course_modules(id,course_id,title,order_index)VALUES(' + q(fixture['module']) + ',' + q(fixture['course']) + ",'PCF SYNTHETIC',0);"
                 'INSERT INTO public.lessons(id,course_id,module_id,title,type,content,order_index)VALUES(' + q(fixture['lesson']) + ',' + q(fixture['course']) + ',' + q(fixture['module']) + ",'Synthetic file context','text','Synthetic inline body',0);"
                 'INSERT INTO public.marketplace_courses(id,course_id,organization_id,is_validated)VALUES(' + q(fixture['listing']) + ',' + q(fixture['course']) + ',' + q(OWN) + ',false);'
                 'INSERT INTO storage.objects(id,bucket_id,name,version,metadata)VALUES(' + q(fixture['object']) + ",'course-files'," + q(pointer) + ",'fixture-version-1'," + q(json.dumps({'synthetic': True})) + '::jsonb);'
                 'INSERT INTO public.course_documents(id,course_id,name,file_url)VALUES(' + q(fixture['document']) + ',' + q(fixture['course']) + ",'Synthetic PDF'," + q('course-files/' + pointer) + ');')
        actor = session('actor')
        ctx(actor)
        begin_sql = 'SELECT public.begin_platform_course_file_capture(' + ','.join([q(fixture['listing']), q('course_document'), q(fixture['document']), 'NULL', q(fixture['request'])]) + ')::text;'
        intent = jsonrow(actor, begin_sql)['intent_id']
        replay = jsonrow(actor, begin_sql)
        if replay['intent_id'] != intent or replay.get('replayed') is not True:
            raise AssertionError('BEGIN_IDEMPOTENCE')
        actor.error('SELECT public.begin_platform_course_file_capture(' + q(fixture['listing']) + ",'lesson_attachment'," + q(fixture['document']) + ',NULL,' + q(fixture['request']) + ');', '22023', 'PCF_REQUEST_CONFLICT')
        actor.error('SELECT public.begin_platform_course_file_capture(' + q(fixture['listing']) + ",'course_document'," + q(uid()) + ',NULL,' + q(uid()) + ');', '40001', 'PCF_REFERENCE_NOT_CURRENT')
        worker = session('worker')
        ctx(worker, 'service_role', None)
        worker.error('SELECT public.load_platform_course_file_capture_worker(' + q(intent) + ',' + q(OTHER) + ');', '42501', 'PCF_INTENT_ACTOR_MISMATCH')
        loaded = jsonrow(worker, 'SELECT public.load_platform_course_file_capture_worker(' + q(intent) + ',' + q(ACTOR) + ')::text;')
        if loaded['actor_id'] != ACTOR or loaded['marketplace_id'] != fixture['listing'] or loaded['reference']['reference_id'] != fixture['document']:
            raise AssertionError('EXACT_WORKER_INTENT_TARGET')
        def finish(digest=DIGEST, stamp=None, data=PAYLOAD):
            return 'SELECT public.finish_platform_course_file_capture_worker(' + ','.join([q(intent), q(ACTOR), q(fixture['capture']), q(data.hex()), q(digest), q(stamp or loaded['enforcement_sha256'])]) + ')::text;'
        worker.error(finish('f' * 64), '22023', 'PCF_ACTUAL_BYTE_DIGEST_MISMATCH')
        worker.error(finish(stamp='f' * 64), '40001', 'PCF_ENFORCEMENT_CHANGED')
        sealed = jsonrow(worker, finish())
        receipt = sealed['receipt_id']
        again = jsonrow(worker, finish())
        if again['receipt_id'] != receipt or again.get('replayed') is not True:
            raise AssertionError('FINISH_IDEMPOTENCE')
        worker.error(finish(digest=hashlib.sha256(b'other').hexdigest(), data=b'other'), '22023', 'PCF_INTENT_ALREADY_SEALED_DIFFERENT_BYTES')
        done = jsonrow(worker, 'SELECT public.load_platform_course_file_capture_worker(' + q(intent) + ',' + q(ACTOR) + ')::text;')
        if done.get('completed') is not True or done['receipt']['receipt_id'] != receipt or done['intent_id'] != intent:
            raise AssertionError('COMPLETED_RECEIPT_EXACT_CONTEXT')
        def read(s=actor):
            return jsonrow(s, 'SELECT public.read_platform_course_file_receipt(' + q(receipt) + ')::text;')
        value = read()
        if value['bytes_hex'] != PAYLOAD.hex() or value['file_bytes_sha256'] != DIGEST or value['byte_length'] != len(PAYLOAD):
            raise AssertionError('ACTUAL_FROZEN_BYTEA_AND_DIGEST')
        admin.check('1=(SELECT count(*)FROM public.platform_course_file_receipts WHERE intent_id=' + q(intent) + ') AND 1=(SELECT count(*)FROM public.platform_course_file_binding_events WHERE receipt_id=' + q(receipt) + ')')
        private_before = jsonrow(admin, "SELECT jsonb_build_object('receipt',to_jsonb(r),'binding',(SELECT to_jsonb(b)FROM public.platform_course_file_binding_events b WHERE b.receipt_id=r.id))FROM public.platform_course_file_receipts r WHERE id=" + q(receipt) + ';')
        for table in ('platform_course_file_intents', 'platform_course_file_receipts', 'platform_course_file_binding_events'):
            actor.error('SELECT * FROM public.' + table + ';', '42501')
        admin.error("UPDATE public.platform_course_file_receipts SET file_bytes=decode('00','hex')WHERE id=" + q(receipt) + ';', '55000', 'PCF_APPEND_ONLY_HISTORY')
        admin.error('TRUNCATE public.platform_course_file_receipts;', '55000', 'PCF_APPEND_ONLY_HISTORY')
        # CHECK constraint is tested without disabling triggers or forging a valid seal.
        admin.error("INSERT INTO public.platform_course_file_receipts SELECT (jsonb_populate_record(NULL::public.platform_course_file_receipts,to_jsonb(r)||jsonb_build_object('id',gen_random_uuid(),'file_sha256',repeat('f',64)))).* FROM public.platform_course_file_receipts r WHERE id=" + q(receipt) + ';', '23514')
        passed(1, {'literalDigest': DIGEST, 'beginAndFinishIdempotence': True, 'actorTargetAndActualDigestChecks': True, 'immutableAndIntegrityAndPrivateACL': True})
        def deny_after(mutate, restore, number, prefix='PCF_READ_AUTH_REQUIRED'):
            admin.ok(mutate)
            try:
                actor.error('SELECT public.read_platform_course_file_receipt(' + q(receipt) + ');', '42501', prefix)
            finally:
                admin.ok(restore)
            passed(number)
        deny_after('UPDATE public.profiles SET blocked_at=clock_timestamp()WHERE user_id=' + q(ACTOR) + ';', 'UPDATE public.profiles SET blocked_at=NULL WHERE user_id=' + q(ACTOR) + ';', 2)
        deny_after('UPDATE public.profiles SET archived_at=clock_timestamp()WHERE user_id=' + q(ACTOR) + ';', 'UPDATE public.profiles SET archived_at=NULL WHERE user_id=' + q(ACTOR) + ';', 3)
        deny_after("UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 day'WHERE id=" + q(ACTOR) + ';', 'UPDATE auth.users SET banned_until=NULL WHERE id=' + q(ACTOR) + ';', 4)
        deny_after('UPDATE auth.users SET deleted_at=clock_timestamp()WHERE id=' + q(ACTOR) + ';', 'UPDATE auth.users SET deleted_at=NULL WHERE id=' + q(ACTOR) + ';', 5)
        deny_after('INSERT INTO public.account_deletion_revocations VALUES(' + q(ACTOR) + ');', 'DELETE FROM public.account_deletion_revocations WHERE user_id=' + q(ACTOR) + ';', 6)
        deny_after('DELETE FROM public.user_roles WHERE user_id=' + q(ACTOR) + " AND role='admin';", 'INSERT INTO public.user_roles VALUES(' + q(ACTOR) + ",'admin');", 7, 'PCF_LEARNER_CONSUMER_NOT_ACCEPTED')
        deny_after('INSERT INTO public.admin_staff VALUES(' + q(ACTOR) + ",'viewer',clock_timestamp()-interval '1 day');", 'DELETE FROM public.admin_staff WHERE user_id=' + q(ACTOR) + ';', 8, 'PCF_LEARNER_CONSUMER_NOT_ACCEPTED')
        body_before = jsonrow(admin, "SELECT jsonb_build_object('body',p.prosrc,'config',p.proconfig,'acl',p.proacl::text)FROM pg_proc p WHERE p.oid='public.read_platform_course_file_receipt(uuid)'::regprocedure;")
        admin.ok((here / 'reader-gap-instrumentation.lab-only.sql').read_text())
        gap_installed = True
        races = [
            (9, 'UPDATE public.profiles SET blocked_at=clock_timestamp()WHERE user_id=' + q(ACTOR) + ';', 'UPDATE public.profiles SET blocked_at=NULL WHERE user_id=' + q(ACTOR) + ';', 'PCF_READ_AUTH_REQUIRED'),
            (10, "UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 day'WHERE id=" + q(ACTOR) + ';', 'UPDATE auth.users SET banned_until=NULL WHERE id=' + q(ACTOR) + ';', 'PCF_READ_AUTH_REQUIRED'),
            (11, 'INSERT INTO public.account_deletion_revocations VALUES(' + q(ACTOR) + ');', 'DELETE FROM public.account_deletion_revocations WHERE user_id=' + q(ACTOR) + ';', 'PCF_READ_AUTH_REQUIRED'),
            (12, 'DELETE FROM public.user_roles WHERE user_id=' + q(ACTOR) + " AND role='admin';", 'INSERT INTO public.user_roles VALUES(' + q(ACTOR) + ",'admin');", 'PCF_LEARNER_CONSUMER_NOT_ACCEPTED'),
        ]
        for number, mutation, restore, expected in races:
            reader = session('race-reader-' + str(number)); ctx(reader)
            writer = session('race-writer-' + str(number))
            backend = int(reader.ok('SELECT pg_backend_pid();')[-1])
            admin.ok('SELECT pg_advisory_lock(28,1401);')
            outcome = {}
            def task():
                try:
                    outcome['result'] = reader.run('SELECT public.read_platform_course_file_receipt(' + q(receipt) + ');')
                except Exception as error:
                    outcome['error'] = repr(error)
            thread = threading.Thread(target=task, daemon=True); thread.start()
            try:
                deadline = time.monotonic() + 4
                while True:
                    wait = admin.ok('SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=' + str(backend) + " AND locktype='advisory' AND classid=28 AND objid=1401 AND objsubid=2 AND NOT granted);")
                    if wait == ['t']:
                        break
                    if time.monotonic() > deadline:
                        raise AssertionError('READER_NOT_AT_VERIFIED_GATE')
                    time.sleep(0.02)
                writer.ok('BEGIN;SELECT pg_advisory_xact_lock(hashtextextended(' + q(ACTOR) + '::text,42007));' + mutation + 'COMMIT;')
            finally:
                admin.ok('SELECT pg_advisory_unlock(28,1401);')
                thread.join(timeout=18)
            try:
                if thread.is_alive() or 'error' in outcome or 'result' not in outcome:
                    raise AssertionError('CONTROLLED_READER_DID_NOT_COMPLETE: ' + repr(outcome))
                rows, states = outcome['result']
                if states != ['42501'] or not any(expected in line for line in rows) or any('bytes_hex' in line for line in rows):
                    raise AssertionError('FRESH_POST_FENCE_DENIAL_REQUIRED: ' + repr(outcome))
                passed(number, {'waitVerifiedByPgLocks': True, 'writerCommitBeforeGateRelease': True, 'noBytesReturned': True})
            finally:
                writer.ok('BEGIN;SELECT pg_advisory_xact_lock(hashtextextended(' + q(ACTOR) + '::text,42007));' + restore + 'COMMIT;')
        admin.ok((here / 'reader-r4-exact-restore.sql').read_text())
        gap_installed = False
        after_body = jsonrow(admin, "SELECT jsonb_build_object('body',p.prosrc,'config',p.proconfig,'acl',p.proacl::text)FROM pg_proc p WHERE p.oid='public.read_platform_course_file_receipt(uuid)'::regprocedure;")
        if after_body != body_before:
            raise AssertionError('INSTRUMENTED_READER_NOT_EXACTLY_RESTORED')
        admin.ok('DROP SCHEMA pcf_reader_r4_lab CASCADE;')
        rr = session('repeatable-read'); ctx(rr); rr.ok('BEGIN ISOLATION LEVEL REPEATABLE READ;SELECT txid_current_snapshot();')
        admin.ok('BEGIN;SELECT pg_advisory_xact_lock(hashtextextended(' + q(ACTOR) + "::text,42007));UPDATE public.profiles SET blocked_at=clock_timestamp()WHERE user_id=" + q(ACTOR) + ';COMMIT;')
        try:
            rr.error('SELECT public.read_platform_course_file_receipt(' + q(receipt) + ');', '25000', 'PCF_READ_RPC_READ_COMMITTED_REQUIRED')
            rr.rollback(); passed(13)
        finally:
            admin.ok('UPDATE public.profiles SET blocked_at=NULL WHERE user_id=' + q(ACTOR) + ';')
        serial = session('serializable'); ctx(serial); serial.ok('BEGIN ISOLATION LEVEL SERIALIZABLE;')
        serial.error('SELECT public.read_platform_course_file_receipt(' + q(receipt) + ');', '25000', 'PCF_READ_RPC_READ_COMMITTED_REQUIRED')
        serial.rollback(); passed(14)
        nullrole = session('fresh-null-role')
        nullrole.ok("SET ROLE authenticated;SELECT set_config('request.jwt.claim.sub'," + q(ACTOR) + ',false);')
        nullrole.check('auth.role() IS NULL')
        nullrole.error('SELECT public.read_platform_course_file_receipt(' + q(receipt) + ');', '42501')
        for role in ('anon', 'service_role'):
            denied = session('acl-' + role); ctx(denied, role, ACTOR)
            denied.error('SELECT public.read_platform_course_file_receipt(' + q(receipt) + ');', '42501')
        passed(15)
        admin.ok('UPDATE public.courses SET organization_id=' + q(CLIENT) + 'WHERE id=' + q(fixture['course']) + ';')
        try:
            actor.error('SELECT public.read_platform_course_file_receipt(' + q(receipt) + ');', '42501', 'PCF_OWN_PLATFORM_SOURCE_REQUIRED')
            passed(16)
        finally:
            admin.ok('UPDATE public.courses SET organization_id=' + q(OWN) + 'WHERE id=' + q(fixture['course']) + ';')
        private_after = jsonrow(admin, "SELECT jsonb_build_object('receipt',to_jsonb(r),'binding',(SELECT to_jsonb(b)FROM public.platform_course_file_binding_events b WHERE b.receipt_id=r.id))FROM public.platform_course_file_receipts r WHERE id=" + q(receipt) + ';')
        if private_after != private_before:
            raise AssertionError('FROZEN_RECEIPT_BINDING_MUTATED')
        account_after = jsonrow(admin, "SELECT jsonb_build_object('profile',(SELECT to_jsonb(p)FROM public.profiles p WHERE user_id=" + q(ACTOR) + "),'auth',(SELECT to_jsonb(u)FROM auth.users u WHERE id=" + q(ACTOR) + "),'roles',(SELECT jsonb_agg(to_jsonb(r)ORDER BY role)FROM public.user_roles r WHERE user_id=" + q(ACTOR) + '));')
        if account_after != role_before:
            raise AssertionError('SYNTHETIC_ACCOUNT_NOT_EXACTLY_RESTORED')
        admin.check('NOT EXISTS(SELECT 1 FROM public.account_deletion_revocations WHERE user_id=' + q(ACTOR) + ') AND NOT EXISTS(SELECT 1 FROM public.admin_staff WHERE user_id=' + q(ACTOR) + ')')
        final = jsonrow(admin, "SELECT jsonb_build_object('retained',encode(sha256(convert_to((SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]')::text FROM public.qa_retained_results r),'UTF8')),'hex'),"
                        "'events',encode(sha256(convert_to((SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY sequence),'[]')::text FROM public.platform_course_publication_review_events e),'UTF8')),'hex'),"
                        "'scope',encode(sha256(convert_to((SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY course_id),'[]')::text FROM public.platform_course_publication_scope_revisions x WHERE course_id<>" + q(fixture['course']) + "),'UTF8')),'hex'));")
        if final != baseline:
            raise AssertionError('CORE48_RETAINED_HISTORY_OR_OLD_SCOPE_CHANGED')
        if actual != ['DB14-R4-' + str(i).zfill(2) for i in range(1, 17)]:
            raise AssertionError('EXACT_SIXTEEN_NATIVE_GROUPS_REQUIRED')
        return {'status': 'PASS_NATIVE_SQL_R4_SIXTEEN_MINIMAL_UNIT_ONLY', 'actualGroups': actual,
                'protectedCoreHistoryExact': True, 'realJWTStorageAndFullSchemaParity': False,
                'learnerCopyAccepted': False, 'originalNative24Complete': False, 'fullPROG012Accepted': False}
    finally:
        already_failing = sys.exc_info()[0] is not None
        cleanup_errors = []
        if gap_installed:
            try:
                admin.ok((here / 'reader-r4-exact-restore.sql').read_text())
            except Exception as error:
                cleanup_errors.append('reader-restore: ' + repr(error))
        for value in reversed(sessions):
            try:
                if not hasattr(value, 'proc'):
                    continue
                value.close()
                trace({'fileNativeSessionExit': {'session': value.name, 'pid': value.proc.pid, 'exitCode': value.proc.poll()}})
                if value.proc.poll() != 0:
                    cleanup_errors.append(value.name + ': nonzero native process exit')
            except Exception as error:
                cleanup_errors.append(getattr(value, 'name', 'partially-created-session') + ': ' + repr(error))
        if cleanup_errors:
            trace({'fileStageCleanupErrors': cleanup_errors})
            if not already_failing:
                raise AssertionError('FILE_STAGE_CLEANUP_FAILED: ' + repr(cleanup_errors))
