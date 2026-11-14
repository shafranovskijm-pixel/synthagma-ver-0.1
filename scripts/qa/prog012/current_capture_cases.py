"""SOURCE ONLY. Additive current-reference intent cases after unchanged native113.
Synthetic guarded PostgreSQL model only; no Auth provider, HTTP bytes or Cloud.
Reuses pinned copy24 fixture helpers, without editing them or enabling capabilities.
"""
from __future__ import annotations
from collections import Counter
import json
import os
import sys
import uuid

DATABASE = 'sintagma_copy24_lab_20261028'
RPC = 'public.begin_platform_course_current_file_capture'
EXPECTED_KEYS = {'intent_id', 'expires_at', 'replayed', 'state', 'schema_version', 'actor_id',
                 'organization_id', 'marketplace_id', 'course_id', 'current_edition_sha256',
                 'reference_kind', 'reference_id', 'selection_proof'}


def run_stage(Session, argv, env, trace, base):
    if os.environ.get('GITHUB_ACTIONS') != 'true' or sys.platform != 'linux':
        raise RuntimeError('CFC_PRIVATE_GITHUB_LINUX_ONLY')
    sessions, threads, actual, control, result = [], [], [], None, None
    q, uid, jrow, ctx = base.q, base.uid, base.jrow, base.ctx
    def session(name):
        value = Session.__new__(Session)
        sessions.append(value)
        Session.__init__(value, argv, env, 'CFC-' + name, trace)
        value.check("current_database()='" + DATABASE + "' AND host(inet_server_addr())='127.0.0.1' AND inet_server_port()=5432 "
                    "AND current_setting('server_version_num')='170011' AND current_setting('data_directory')='/var/lib/postgresql/data' "
                    "AND current_setting('pcr.lab_authorized',true)='source-reviewed-root-run-only'")
        return value
    def passed(number, details):
        name = 'CFC' + str(number).zfill(2)
        actual.append(name)
        trace({'case': name, 'status': 'PASS_NATIVE_CURRENT_INTENT_MODEL_NOT_AUTH_STORAGE', 'details': details})
    def current(f):
        return jrow(control, 'SELECT jsonb_build_object(\'sha\',public.pcr_v2_sha(public.pcr_v2_manifest('
                    + q(f['course']) + ',' + q(f['listing']) + ')));')['sha']
    def sql(f, ref, kind, request, edition):
        return 'SELECT ' + RPC + '(' + ','.join(q(x) for x in (f['listing'], edition, kind, ref, request)) + ');'
    def no_intent(request):
        control.check('NOT EXISTS(SELECT 1 FROM public.platform_course_file_intents WHERE request_id=' + q(request) + ')')
    def capture(f, ref=None, kind='course_document', request=None, edition=None, actor_id=None):
        request, ref, edition = request or uid(), ref or f['hidden'], edition or current(f)
        reply = jrow(actor, sql(f, ref, kind, request, edition))
        expected_actor = actor_id or base.ADMIN
        if (set(reply) != EXPECTED_KEYS or reply['schema_version'] != 1 or reply['actor_id'] != expected_actor
                or reply['organization_id'] != base.OWN or reply['marketplace_id'] != f['listing']
                or reply['course_id'] != f['course'] or reply['current_edition_sha256'] != edition
                or reply['reference_kind'] != kind or reply['reference_id'] != ref
                or reply['replayed'] is not False or reply['state'] != 'capture_intent_only_not_verified_or_approved'
                or reply['selection_proof'] != 'same_transaction_current_course_files_only_no_library_or_org_version'):
            raise AssertionError('CFC_EXACT_THIRTEEN_FIELD_CURRENT_INTENT_REQUIRED')
        uuid.UUID(reply['intent_id'])
        proof = jrow(control, "SELECT jsonb_build_object('actor',actor_id=" + q(expected_actor)
            + ",'course',course_id=" + q(f['course']) + ",'listing',marketplace_id=" + q(f['listing'])
            + ",'reference',reference_id=" + q(ref) + ",'kind',reference_kind=" + q(kind)
            + ",'request',request_id=" + q(request) + ",'versionNull',source_org_version_id IS NULL"
            + ",'courseFiles',reference_snapshot->>'source_bucket'='course-files'"
            + ",'noLibrary',reference_snapshot->'library_document_id'='null'::jsonb"
            + ",'expires',expires_at=" + q(reply['expires_at']) + "::timestamptz AND expires_at>created_at AND expires_at<=created_at+interval'120 seconds'"
            + ",'noReceipt',NOT EXISTS(SELECT 1 FROM public.platform_course_file_receipts r WHERE r.intent_id=i.id))"
            + ' FROM public.platform_course_file_intents i WHERE id=' + q(reply['intent_id']) + ';')
        if not proof or not all(value is True for value in proof.values()):
            raise AssertionError('CFC_STORED_FRESH_INTENT_BINDING_REQUIRED: ' + repr(proof))
        return reply, request
    def seed():
        return base.source(control)
    def hashes():
        # Only this already-guarded synthetic database. Preserve all prior rows as a multiset;
        # new unique QA rows are intentional additions, not old113 fixture changes.
        relations = jrow(control, "SELECT jsonb_build_object('relations',jsonb_agg(format('%I.%I',n.nspname,c.relname)ORDER BY n.nspname,c.relname))"
                        " FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','auth','storage')AND c.relkind='r';")['relations']
        if not relations or len(relations) > 80:
            raise AssertionError('CFC_BOUNDED_SYNTHETIC_MODEL_TABLE_SET_REQUIRED')
        answer = {}
        for relation in relations:
            row = jrow(control, "SELECT jsonb_build_object('hashes',coalesce(jsonb_agg(h ORDER BY h),'[]')) FROM(SELECT "
                       "encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')h FROM " + relation + ' t)x;')
            answer[relation] = Counter(row['hashes'])
        return answer
    def retained(before):
        after = hashes()
        missing = {name: sum((values - after.get(name, Counter())).values()) for name, values in before.items()
                   if values - after.get(name, Counter())}
        if missing:
            raise AssertionError('CFC_OLD_SYNTHETIC_ROWS_CHANGED_OR_REMOVED: ' + repr(missing))
        return {'oldTables': len(before), 'oldRows': sum(sum(v.values()) for v in before.values()), 'oldRowsExact': True}
    def busy(f, lock_sql, ref=None, kind='course_document'):
        request, ref, edition = uid(), ref or f['hidden'], current(f)
        writer.ok('BEGIN;' + lock_sql)
        try:
            actor.error(sql(f, ref, kind, request, edition), '40001', 'PCF_CURRENT_CAPTURE_CHANGED_RETRY')
            no_intent(request)
        finally:
            writer.rollback()
    try:
        control, actor, worker, writer = [session(name) for name in ('control', 'actor', 'worker', 'writer')]
        ctx(actor, base.ADMIN); ctx(worker, None, 'service_role')
        old_rows = hashes()
        old_protected = base.protected(control)
        capabilities_before = jrow(control, 'SELECT public.pcf_v1_delivery_capabilities();')
        if any(capabilities_before[k] is not False for k in ('frozen_reader_implemented', 'frontend_consumers_accepted', 'copied_centre_exact_binding_supported')):
            raise AssertionError('CFC_ALL_ACCEPTANCE_FLAGS_MUST_REMAIN_FALSE')
        f = seed(); first, first_request = capture(f)
        passed(1, {'currentCourseDocumentExact13': True, 'newIntentOnlyNoBytesSealedOrApproval': True})
        f = seed(); capture(f, f['attachment'], 'lesson_attachment')
        passed(2, {'currentAttachmentExact13': True})
        f = seed(); stale = current(f); request = uid()
        new_key = f['course'] + '/cfc-pointer-b.pdf'
        control.ok("INSERT INTO storage.objects(bucket_id,name,version,metadata)VALUES('course-files'," + q(new_key) + ",'v1','{}');"
                   'UPDATE public.course_documents SET file_url=' + q('course-files/' + new_key) + ' WHERE id=' + q(f['hidden']) + ';')
        if current(f) == stale:
            raise AssertionError('CFC_POINTER_SWAP_MUST_CHANGE_SELECTION')
        actor.error(sql(f, f['hidden'], 'course_document', request, stale), '40001', 'PCF_CURRENT_CAPTURE_CHANGED_RETRY')
        no_intent(request); passed(3, {'pointerAToBRejectsOldEditionBeforeIntent': True})
        f = seed(); old, request_a = capture(f); old_manifest = current(f)
        key_b = f['course'] + '/cfc-aba-b.pdf'
        control.ok("INSERT INTO storage.objects(bucket_id,name,version,metadata)VALUES('course-files'," + q(key_b) + ",'v1','{}');"
                   'UPDATE public.course_documents SET file_url=' + q('course-files/' + key_b) + ' WHERE id=' + q(f['hidden']) + ';'
                   'UPDATE public.course_documents SET file_url=' + q('course-files/' + f['course'] + '/copy24.pdf') + ' WHERE id=' + q(f['hidden']) + ';')
        final_manifest = current(f); fresh, _ = capture(f, edition=final_manifest)
        if fresh['intent_id'] == old['intent_id']:
            raise AssertionError('CFC_ABA_CANNOT_BORROW_OLD_INTENT')
        actor.error(sql(f, f['hidden'], 'course_document', request_a, final_manifest), '22023', 'PCF_CURRENT_CAPTURE_FRESH_INTENT_REQUIRED_NO_REPLAY')
        control.check('EXISTS(SELECT 1 FROM public.platform_course_file_intents WHERE id=' + q(old['intent_id']) + ' AND request_id=' + q(request_a) + ')')
        passed(4, {'ABAFinalCurrentAUsesFreshRequest': True, 'oldRequestNeverReplayed': True,
                   'finalManifestEqualsBefore': final_manifest == old_manifest, 'noBlanketABAMustChangeSHAClaim': True})
        f = seed(); busy(f, 'SELECT id FROM public.course_documents WHERE id=' + q(f['hidden']) + ' FOR UPDATE;')
        passed(5, {'targetRowNowaitDenial': True})
        f = seed(); busy(f, 'SELECT id FROM public.lessons WHERE id=' + q(f['lesson']) + ' FOR UPDATE;', f['attachment'], 'lesson_attachment')
        passed(6, {'attachmentLessonNowaitDenial': True})
        f = seed(); busy(f, "SELECT id FROM storage.buckets WHERE id='course-files' FOR UPDATE;")
        passed(7, {'bucketNowaitDenial': True})
        f = seed(); busy(f, "SELECT id FROM storage.objects WHERE bucket_id='course-files'AND name=" + q(f['course'] + '/copy24.pdf') + ' FOR UPDATE;')
        passed(8, {'existingPinnedSnapshotObjectNowaitDenial': True})
        f = seed(); request = uid()
        actor.error(sql(f, f['libraryDoc'], 'course_document', request, current(f)), '23514', 'PCF_CURRENT_COURSE_FILES_ONLY')
        no_intent(request); passed(9, {'linkedLibraryUnsupportedBeforeIntent': True})
        f = seed(); request = uid()
        actor.error(sql(f, f['doc'], 'course_document', request, current(f)), '23514', 'PCF_CURRENT_COURSE_FILES_ONLY')
        no_intent(request); passed(10, {'orgDocumentVersionNotGuessed': True})
        f, other = seed(), seed(); request = uid()
        actor.error(sql(f, other['hidden'], 'course_document', request, current(f)), '40001', 'PCF_CURRENT_CAPTURE_CHANGED_RETRY')
        no_intent(request)
        foreign = {'listing': '70000000-0000-0000-0000-00000000000e'}; request = uid()
        actor.error(sql(foreign, f['hidden'], 'course_document', request, '0' * 64), '42501'); no_intent(request)
        passed(11, {'crossCourseReferenceDenied': True, 'oldClientListingExcluded': True})
        f = seed(); edition = current(f)
        for who, claim in ((None, 'authenticated'), (base.MISSING, 'authenticated'), (base.OUTSIDER, 'authenticated'), (base.ADMIN, '')):
            ctx(actor, who, claim=claim); request = uid()
            actor.error(sql(f, f['hidden'], 'course_document', request, edition), '42501'); no_intent(request)
        ctx(actor, base.ADMIN)
        actor.ok('BEGIN ISOLATION LEVEL REPEATABLE READ;')
        try: actor.error(sql(f, f['hidden'], 'course_document', uid(), edition), '25000')
        finally: actor.rollback()
        passed(12, {'nullMissingProfileStudentAndNullRoleDenied': True, 'repeatableReadDenied': True})
        f = seed(); shared_request = uid(); own, _ = capture(f, request=shared_request)
        worker.error('SELECT public.load_platform_course_file_capture_worker(' + q(own['intent_id']) + ',' + q(base.NONRFC) + ');',
                     '42501', 'PCF_INTENT_ACTOR_MISMATCH')
        ctx(actor, base.NONRFC)
        independent, _ = capture(f, request=shared_request, actor_id=base.NONRFC)
        if independent['intent_id'] == own['intent_id']:
            raise AssertionError('CFC_FOREIGN_ACTOR_REQUEST_UUID_MUST_NOT_BORROW_INTENT')
        actor.error(sql(f, f['hidden'], 'course_document', shared_request, current(f)), '22023', 'PCF_CURRENT_CAPTURE_FRESH_INTENT_REQUIRED_NO_REPLAY')
        ctx(actor, base.ADMIN)
        passed(13, {'foreignVerifiedActorCannotLoadOtherIntent': True, 'sameRequestUuidBoundToDistinctActor': True, 'replayDenied': True})
        actor_pid = jrow(actor, "SELECT jsonb_build_object('pid',pg_backend_pid());")['pid']
        writer_pid = jrow(writer, "SELECT jsonb_build_object('pid',pg_backend_pid());")['pid']
        waits = []
        for category in ('target', 'lesson', 'bucket', 'object'):
            f = seed()
            actor.ok('BEGIN;')
            thread = None
            try:
                # Actor owns its uncommitted intent; the control cannot inspect it beforeCOMMIT.
                edition = current(f)
                reply = jrow(actor, sql(f, f['attachment'] if category == 'lesson' else f['hidden'],
                                       'lesson_attachment' if category == 'lesson' else 'course_document', uid(), edition))
                if set(reply) != EXPECTED_KEYS or reply['replayed'] is not False:
                    raise AssertionError('CFC_RACE_FRESH_REPLY_REQUIRED')
                if category == 'target':
                    update = 'UPDATE public.course_documents SET name=name WHERE id=' + q(f['hidden']) + ';'
                elif category == 'lesson':
                    update = 'UPDATE public.lessons SET title=title WHERE id=' + q(f['lesson']) + ';'
                elif category == 'bucket':
                    update = "UPDATE storage.buckets SET public=public WHERE id='course-files';"
                else:
                    update = "UPDATE storage.objects SET version='cfc-writer-v2' WHERE bucket_id='course-files'AND name=" + q(f['course'] + '/copy24.pdf') + ';'
                thread, box = base.thread_call(writer, 'BEGIN;' + update + 'COMMIT;'); threads.append(thread)
                base.wait_blocked(control, writer_pid, actor_pid)
                waits.append(category)
            finally:
                actor.rollback()
            base.join_ok(thread, box)
        passed(14, {'actualWriterWaitsUntilCurrentTransactionEnds': waits, 'pinnedSnapshotObjectLockReused': True})
        if actual != ['CFC' + str(i).zfill(2) for i in range(1, 15)]:
            raise AssertionError('CFC_EXACT_FOURTEEN_GROUPS_REQUIRED')
        if base.protected(control) != old_protected:
            raise AssertionError('CFC_OLD113_RETAINED_ACTOR_CLIENT_RESULT_DRIFT')
        retained_proof = retained(old_rows)
        capabilities_after = jrow(control, 'SELECT public.pcf_v1_delivery_capabilities();')
        if capabilities_after != capabilities_before:
            raise AssertionError('CFC_CAPABILITIES_CHANGED_NO_FIXTURE_ALLOWED')
        result = {'status': 'PASS_ADDITIVE_CURRENT_CAPTURE14_MODEL_ONLY', 'actualGroups': actual,
                  'old113RetainedRows': retained_proof, 'oldActorClientResultsExact': True,
                  'capabilitiesUnchangedFalse': True, 'capabilityOverrideUsed': False,
                  'ordinaryCloudAuthVerified': False, 'realStorageHTTPBytes': False,
                  'productMigration650PreflightTestedByThisPartialModel': False,
                  'fullPROG012Accepted': False, 'productionRelease': False}
        return result
    finally:
        primary, cleanup = sys.exc_info()[0] is not None, []
        # Release the reader first; never send concurrent protocol input to a live writer thread.
        reader_value = locals().get('actor')
        if reader_value is not None:
            try: reader_value.rollback()
            except Exception as error: cleanup.append({'readerRollback': repr(error)})
        writer_still_running = False
        for thread in threads:
            thread.join(timeout=1)
            if thread.is_alive():
                writer_still_running = True
                cleanup.append({'thread': 'STILL_RUNNING_AFTER_READER_ROLLBACK'})
        writer_value = locals().get('writer')
        if writer_value is not None and not writer_still_running:
            try: writer_value.rollback()
            except Exception as error: cleanup.append({'writerRollback': repr(error)})
        if control is not None and 'old_rows' in locals():
            try: trace({'currentCaptureRetainedRowsAfterCleanup': retained(old_rows)})
            except Exception as failure: cleanup.append({'retainedRowsReadback': repr(failure)})
        for value in reversed(sessions):
            if not hasattr(value, 'proc'): continue
            error, forced = None, False
            if value is writer_value and writer_still_running:
                # Never write ROLLBACK or \q concurrently with the still-running Session.run.
                forced, error = True, 'ACTIVE_WRITER_THREAD_FORCED_CLOSE_NO_PROTOCOL_INPUT'
                try: value.proc.kill(); value.proc.wait(timeout=5)
                except Exception as failure: error += ': ' + repr(failure)
            else:
                try: value.close()
                except Exception as failure: error = repr(failure)
            if value.proc.poll() is None:
                forced = True
                try: value.proc.kill(); value.proc.wait(timeout=5)
                except Exception as failure: error = error or repr(failure)
                error = error or 'FORCED_CLEANUP'
            receipt = {'session': value.name, 'pid': value.proc.pid, 'exitCode': value.proc.poll(),
                       'closeError': error, 'forcedCleanupFallback': forced}
            trace({'currentCaptureNativeSessionExit': receipt})
            if receipt['exitCode'] != 0 or error: cleanup.append(receipt)
        for thread in threads:
            thread.join(timeout=1)
            if thread.is_alive(): cleanup.append({'thread': 'STILL_RUNNING_AFTER_OWNED_PROCESS_CLOSE'})
        if cleanup:
            trace({'currentCaptureCleanupFailures': cleanup, 'primaryFailurePreserved': primary})
            if not primary: raise AssertionError('CFC_NATIVE_CLEANUP_OR_EXIT_FAILURE')
