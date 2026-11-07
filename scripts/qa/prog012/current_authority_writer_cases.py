"""SOURCE DRAFT: 12 current-authority schedules in the existing private PG17.11 lab.

No bootstrap/server lifecycle, Cloud/Auth provider, capability override, byte fixture,
old fixture mutation or implicit full-delivery acceptance. The caller must first
verify the final immutable candidate/body pins and unchanged original113/new14.
Cases 01-04 use ordinary synthetic learner course-mode calls. Cases 05-12 call
the exact owner-only resource-fence component, followed by explicit old predicates;
they do not fabricate a sealed binding, a paid grant, a receipt or byte authority.
"""
from __future__ import annotations
from collections import Counter
import json
import os
import re
import sys

DATABASE = 'sintagma_copy24_lab_20261028'
CANONICAL_UNUSED = (
    '271f5a00-3c75-5bc4-95d3-0bfb571af830',
    'c54775d6-4fa6-5074-9fe4-0ee0e43e3d20',
    'eee04ed8-712a-516b-b424-f4d3f2914789',
    'da8f53b1-aeb3-554a-a6e3-c47cd38bb974',
)
PRIVATE = (
    'public.pcc_v2_current_rights_keys(text,uuid[],boolean)',
    'public.pcc_v2_asset_authority_before()',
    'public.pcc_v2_source_resource_fences(uuid,uuid,uuid,uuid)',
    'public.pcc_v2_enrollment_authority_before()',
    'public.pcc_v2_copy_course_fences(uuid,text)',
)
INTEGRATED = (
    'public.pcc_v1_authorized_reference(uuid,text,uuid,text,text)',
    'public.read_course_exact_file_delivery_mode(uuid,text)',
    'public.pcc_v1_copy_binding_payload(uuid,jsonb)',
)
TRIGGERS = (
    ('paid_umk_20260922_assets', 'pcc_current_asset_authority_fence', PRIVATE[1]),
    ('uc_enrollment_withdrawal_states', 'pcc_current_withdrawal_authority_fence', PRIVATE[3]),
    ('uc_course_assignment_removal_events', 'pcc_current_removal_authority_fence', PRIVATE[3]),
)


def run_stage(Session, argv, env, trace, base, authority_pins):
    if os.environ.get('GITHUB_ACTIONS') != 'true' or sys.platform != 'linux':
        raise RuntimeError('CAW_PRIVATE_LINUX_GITHUB_PG1711_ONLY')
    # Pin *actual final* SQL bodies, not this mutable author's draft. No default pin,
    # no latest inference and no silent acceptance of an unreviewed candidate.
    pins = authority_pins.get('functionBodyPins', {})
    if (authority_pins.get('sourceReviewedReady') is not True
            or set(pins) != set(PRIVATE + INTEGRATED)
            or any(not isinstance(v, str) or re.fullmatch('[0-9a-f]{64}', v) is None for v in pins.values())):
        raise RuntimeError('CAW_FINAL_EIGHT_REVIEWED_BODY_PINS_REQUIRED')
    q, uid, jrow = base.q, base.uid, base.jrow
    sessions, threads, actual = [], [], []
    control = reader = learner = writer = admin = manager = None
    result = None

    def session(name):
        value = Session.__new__(Session)
        sessions.append(value)
        Session.__init__(value, argv, env, 'CAW-' + name, trace)
        value.check("current_database()='" + DATABASE + "'AND host(inet_server_addr())='127.0.0.1'AND inet_server_port()=5432 "
                    "AND current_setting('server_version_num')='170011'AND current_setting('data_directory')='/var/lib/postgresql/data' "
                    "AND current_user='postgres'AND session_user='postgres' "
                    "AND current_setting('pcr.lab_authorized',true)='source-reviewed-root-run-only'")
        return value

    def mode_sql(course):
        return 'SELECT public.read_course_exact_file_delivery_mode(' + q(course) + ",'learner')::text;"

    def mode_allowed(course):
        value = jrow(learner, mode_sql(course))
        if (value.get('actor_id') != base.LEARNER or value.get('course_id') != course
                or value.get('mode') != 'frozen_required' or value.get('state') != 'held'
                or value.get('cohort', {}).get('reference_count') != 0):
            raise AssertionError('CAW_ORDINARY_ZERO_REF_CURRENT_LEARNER_SCOPE_REQUIRED')
        return value

    def fresh_copy():
        # Fresh course/listing, real accepted proposal/publication/acquisition path.
        # No refs means no receipt/file capability prerequisite is invented.
        value = base.source(control, files=False)
        base.publish(admin, value, [])
        bought = base.acquire(manager, value)
        value.update(buyer=bought['course_id'], order=bought['order_id'])
        value['enrollment'] = base.enroll(control, value['buyer'])
        mode_allowed(value['buyer'])
        return value

    def source_fence(library=None, version=None, order=None, buyer=None):
        args = [q(v) + '::uuid' if v else 'NULL::uuid' for v in (library, version, order, buyer)]
        return 'SELECT public.pcc_v2_source_resource_fences(' + ','.join(args) + ');'

    def library(label):
        value = uid()
        control.ok('INSERT INTO public.library_documents(id,organization_id,name,storage_path,file_size,source_name,usage_basis,last_checked_at,edition_label,library_status)VALUES('
                   + q(value) + ',' + q(base.OWN) + ',' + q('CAW ' + label) + ','
                   + q('library/' + base.OWN + '/caw-' + value + '.pdf')
                   + ",41,'SYNTHETIC PRIVATE MODEL','own_material',clock_timestamp()-interval'1 hour','caw-v1','active');")
        return value

    def asset_course(index):
        value = CANONICAL_UNUSED[index]
        control.check('NOT EXISTS(SELECT 1 FROM public.courses WHERE id=' + q(value) + ')')
        control.ok('INSERT INTO public.courses(id,organization_id,title,is_published)VALUES('
                   + q(value) + ',' + q(base.OWN) + ",'CAW NEW UNUSED CANONICAL MODEL ROW',true);")
        return value

    def asset_insert(asset, course, lib):
        return ('INSERT INTO public.paid_umk_20260922_assets(id,source_course_id,library_document_id,audience,sha256,size_bytes)VALUES('
             + q(asset) + ',' + q(course) + ',' + q(lib) + ",'learner'," + q('1' * 64) + ',41);')

    def is_asset(lib, expected):
        control.check('public.paid_umk_20260922_is_asset(' + q(lib) + ')IS ' + ('TRUE' if expected else 'FALSE'))

    def library_lifecycle(lib):
        # Literal lifecycle predicate from the unchanged binding-payload body.
        return ('EXISTS(SELECT 1 FROM public.library_documents ld WHERE ld.id=' + q(lib) + ' AND ld.organization_id='
             + q(base.OWN) + " AND ld.archived_at IS NULL AND ld.library_status='active')")

    def version_lifecycle(version):
        return ('EXISTS(SELECT 1 FROM public.org_document_versions v JOIN public.org_documents d ON d.id=v.document_id WHERE v.id='
             + q(version) + ' AND v.organization_id=' + q(base.OWN) + ' AND d.organization_id=' + q(base.OWN) + ' AND d.deleted_at IS NULL)')

    def row_bags():
        tables = jrow(control, "SELECT json_build_object('tables',coalesce(json_agg(n.nspname||'.'||c.relname ORDER BY n.nspname,c.relname),'[]'))FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','auth')AND c.relkind IN('r','p');")['tables']
        result = {}
        for table in tables:
            if re.fullmatch(r'(public|auth)\.[a-zA-Z_][a-zA-Z0-9_]*', table) is None:
                raise AssertionError('CAW_UNEXPECTED_RELATION_IDENTIFIER')
            qualified = '.'.join('"' + part + '"' for part in table.split('.'))
            result[table] = jrow(control, "SELECT json_build_object('counts',coalesce(json_object_agg(sha,n),'{}'))FROM(SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex')sha,count(*)n FROM " + qualified + ' t GROUP BY 1)x;')['counts']
        return result

    def retained(before):
        after = row_bags()
        if set(before) != set(after):
            raise AssertionError('CAW_EXISTING_TABLE_NAMESPACE_CHANGED')
        for table, bag in before.items():
            if Counter(bag) - Counter(after[table]):
                raise AssertionError('CAW_OLD_ROW_VALUE_OR_MULTIPLICITY_CHANGED:' + table)
        return {'tables': len(before), 'oldRowValuesAndMultiplicityPreserved': True}

    def catalog():
        return jrow(control, "SELECT json_build_object('sha',encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object('oid',p.oid,'catalog',to_jsonb(p),'definition',pg_get_functiondef(p.oid))ORDER BY p.oid),'[]')::text,'UTF8')),'hex'))FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','auth')AND p.prokind='f';")

    def passed(number, scope, details):
        name = 'CAW' + str(number).zfill(2)
        actual.append(name)
        trace({'case': name, 'status': 'PASS_NATIVE_MODEL_COMPONENT_ONLY', 'scope': scope, 'details': details})

    def wait_writer(sql, reader_session):
        writer_pid = int(writer.ok('SELECT pg_backend_pid();')[-1])
        reader_pid = int(reader_session.ok('SELECT pg_backend_pid();')[-1])
        thread, box = base.thread_call(writer, 'BEGIN;' + sql + 'COMMIT;')
        threads.append(thread)
        try:
            base.wait_blocked(control, writer_pid, reader_pid)
        finally:
            reader_session.rollback()
        base.join_ok(thread, box)

    try:
        control, reader, learner, writer, admin, manager = [session(name) for name in
            ('control', 'private-component-reader', 'ordinary-learner', 'writer', 'admin', 'manager')]
        base.ctx(learner, base.LEARNER); base.ctx(admin, base.ADMIN); base.ctx(manager, base.MANAGER)
        # Owner-only component calls are explicit native model fixtures, never ordinary RPC claims.
        reader.ok("SELECT set_config('request.jwt.claim.sub'," + q(base.LEARNER) + ",false); SELECT set_config('request.jwt.claim.role','authenticated',false);")
        for identity, sha in pins.items():
            control.check("EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure(" + q(identity) + ")AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')=" + q(sha) + ')')
        for identity in PRIVATE:
            control.check('NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault(\'f\',p.proowner)))a WHERE p.oid=to_regprocedure('
                          + q(identity) + ")AND a.grantee<>p.proowner AND a.privilege_type='EXECUTE')")
        for table, name, function in TRIGGERS:
            control.check('EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=' + q('public.' + table) + '::regclass AND tgname='
                          + q(name) + ' AND tgfoid=to_regprocedure(' + q(function) + ")AND NOT tgisinternal AND tgenabled='O'AND tgtype=31)")
        old_rows, old_catalog, old_protected = row_bags(), catalog(), base.protected(control)
        caps = jrow(control, 'SELECT public.pcf_v1_delivery_capabilities();')
        if any(caps.get(k) is not False for k in ('frozen_reader_implemented', 'frontend_consumers_accepted', 'copied_centre_exact_binding_supported')):
            raise AssertionError('CAW_ALL_CAPABILITIES_FALSE_NO_OVERRIDE')
        control.check('NOT EXISTS(SELECT 1 FROM public.courses WHERE id=ANY(ARRAY[' + ','.join(q(v) + '::uuid' for v in CANONICAL_UNUSED) + ']))')

        f = fresh_copy()
        control.ok("UPDATE public.enrollments SET expires_at=clock_timestamp()-interval'1 day' WHERE id=" + q(f['enrollment']) + ';')
        learner.error(mode_sql(f['buyer']), '42501', 'PCC_REFERENCE_UNAVAILABLE')
        control.ok("UPDATE public.enrollments SET status='completed' WHERE id=" + q(f['enrollment']) + ';')
        mode_allowed(f['buyer'])
        passed(1, 'ordinary_course_admission', {'committedActiveExpiryDenies': True, 'completedExpiredStillPermitted': True})

        f = fresh_copy()
        writer.ok("BEGIN; UPDATE public.enrollments SET expires_at=clock_timestamp()-interval'1 day' WHERE id=" + q(f['enrollment']) + ';')
        try: learner.error(mode_sql(f['buyer']), '40001')
        finally: writer.rollback()
        mode_allowed(f['buyer'])
        passed(2, 'ordinary_course_admission', {'writerHeldEnrollmentInputRetries': True, 'rollbackRestoresFreshAdmission': True})

        f = fresh_copy()
        learner.ok('BEGIN;'); mode_allowed(f['buyer'])
        wait_writer("UPDATE public.enrollments SET expires_at=clock_timestamp()-interval'1 day' WHERE id=" + q(f['enrollment']) + ';', learner)
        learner.error(mode_sql(f['buyer']), '42501', 'PCC_REFERENCE_UNAVAILABLE')
        passed(3, 'ordinary_course_admission', {'pgBlockingPidsWitness': True, 'readerFirstEnrollmentWriterWait': True, 'freshAfterCommitDenies': True})

        # Actual current00 metadata requires full event facts. These are explicit
        # native component fixtures, not acceptance of the full UC cancellation workflow.
        for event in ('withdrawal', 'removal'):
            f = fresh_copy()
            if event == 'withdrawal':
                insert = ('INSERT INTO public.uc_enrollment_withdrawal_states(enrollment_id,organization_id,user_id,course_id,revision,effective_date,basis,technical_snapshot,recorded_by,redacted) '
                          'SELECT e.id,c.organization_id,e.user_id,e.course_id,1,current_date,'
                          "jsonb_build_object('kind','synthetic_native_component','source','CAW04'),"
                          'to_jsonb(e),' + q(base.ADMIN) + '::uuid,false FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id '
                          'WHERE e.id=' + q(f['enrollment']) + ' AND e.course_id=' + q(f['buyer']) + ';')
            else:
                # Reuse one fresh request only after the first statement was rolled back.
                # before/after facts are actual unchanged enrollment snapshots; the new
                # event state is the sole authorization input being exercised here.
                insert = ('INSERT INTO public.uc_course_assignment_removal_events(enrollment_id,organization_id,user_id,course_id,revision,state,actor_id,request_id,preflight_sha256,before_enrollment,after_enrollment) '
                          'SELECT e.id,c.organization_id,e.user_id,e.course_id,1,\'cancelled\',' + q(base.ADMIN) + '::uuid,' + q(uid()) + '::uuid,'
                          "encode(sha256(convert_to(to_jsonb(e)::text,'UTF8')),'hex'),to_jsonb(e),to_jsonb(e) "
                          'FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id '
                          'WHERE e.id=' + q(f['enrollment']) + ' AND e.course_id=' + q(f['buyer']) + ';')
            learner.ok('BEGIN;'); mode_allowed(f['buyer'])
            try: writer.error(insert, '40001', 'PCC_CONTEXT_CHANGED_RETRY')
            finally: learner.rollback()
            control.ok(insert)
            learner.error(mode_sql(f['buyer']), '42501', 'PCC_REFERENCE_UNAVAILABLE')
            if event == 'removal':
                writer.error('UPDATE public.uc_course_assignment_removal_events SET reason=reason WHERE enrollment_id='
                             + q(f['enrollment']) + ';', '42501', 'assignment_removal_history_is_immutable')
                writer.error('DELETE FROM public.uc_course_assignment_removal_events WHERE enrollment_id='
                             + q(f['enrollment']) + ';', '42501', 'assignment_removal_history_is_immutable')
        passed(4, 'ordinary_course_admission', {'absentWithdrawalAndRemovalInsertsParticipate': True, 'sameReaderEnrollmentKey': True, 'freshCommittedHistoryDenies': True,
                                               'actualRequiredFactsAndConstraints': True, 'realImmutableRemovalRejectsUpdateAndDelete': True,
                                               'fullUCProducerWorkflowAccepted': False})

        lib, fixed, asset = library('absent asset'), asset_course(0), uid()
        reader.ok('BEGIN;'); reader.ok(source_fence(library=lib)); is_asset(lib, False)
        try: writer.error(asset_insert(asset, fixed, lib), '40001', 'PCC_CONTEXT_CHANGED_RETRY')
        finally: reader.rollback()
        control.ok(asset_insert(asset, fixed, lib)); is_asset(lib, True)
        passed(5, 'private_resource_component', {'absentAssetClassificationKeyFencesInsert': True, 'actualAssetTrigger': True, 'noGrantOrByteClaim': True})

        lib, fixed, asset = library('writer first insert'), asset_course(1), uid()
        writer.ok('BEGIN;' + asset_insert(asset, fixed, lib))
        try: reader.error(source_fence(library=lib), '40001', 'PCC_CONTEXT_CHANGED_RETRY')
        finally: writer.rollback()
        is_asset(lib, False)
        passed(6, 'private_resource_component', {'uncommittedInsertExclusiveKeyRejectsReader': True, 'noLeakedClassificationAfterRollback': True})

        lib, fixed, asset = library('writer first disable'), asset_course(2), uid()
        control.ok(asset_insert(asset, fixed, lib))
        writer.ok('BEGIN; UPDATE public.paid_umk_20260922_assets SET enabled=false WHERE id=' + q(asset) + ';')
        try: reader.error(source_fence(library=lib), '40001', 'PCC_CONTEXT_CHANGED_RETRY')
        finally: writer.rollback()
        control.check('EXISTS(SELECT 1 FROM public.paid_umk_20260922_assets WHERE id=' + q(asset) + ' AND enabled)')
        passed(7, 'private_resource_component', {'existingAssetWriterParticipatesBeforeReaderSnapshot': True, 'rollbackKeepsOriginalNewAsset': True})

        lib, fixed, asset = library('reader first delete'), asset_course(3), uid()
        control.ok(asset_insert(asset, fixed, lib))
        reader.ok('BEGIN;'); reader.ok(source_fence(library=lib)); is_asset(lib, True)
        wait_writer('DELETE FROM public.paid_umk_20260922_assets WHERE id=' + q(asset) + ';', reader)
        is_asset(lib, False)
        passed(8, 'private_resource_component', {'pgBlockingPidsWitness': True, 'readerFirstAssetDeleteWaits': True, 'freshClassificationAfterCommitChanges': True})

        lib = library('writer first archive')
        writer.ok("BEGIN; UPDATE public.library_documents SET library_status='archive' WHERE id=" + q(lib) + ';')
        try: reader.error(source_fence(library=lib), '40001', 'PCC_CONTEXT_CHANGED_RETRY')
        finally: writer.ok('COMMIT;')
        reader.ok(source_fence(library=lib)); control.check('NOT(' + library_lifecycle(lib) + ')')
        passed(9, 'private_resource_component', {'libraryArchiveWriterFirstRetries': True, 'freshUnchangedPayloadLifecyclePredicateFalse': True})

        lib = library('reader first archive')
        reader.ok('BEGIN;'); reader.ok(source_fence(library=lib)); reader.check(library_lifecycle(lib))
        wait_writer("UPDATE public.library_documents SET library_status='archive' WHERE id=" + q(lib) + ";", reader)
        control.check('NOT(' + library_lifecycle(lib) + ')')
        passed(10, 'private_resource_component', {'pgBlockingPidsWitness': True, 'sourceArchiveWriterWaits': True, 'freshExactOwnLifecyclePredicateFalse': True})

        doc, version, newer = uid(), uid(), uid()
        control.ok('INSERT INTO public.org_documents(id,organization_id,name,type)VALUES(' + q(doc) + ',' + q(base.OWN) + ",'CAW exact V1','other');"
                   'INSERT INTO public.org_document_versions(id,document_id,organization_id,version_number,file_path,file_size)VALUES('
                   + q(version) + ',' + q(doc) + ',' + q(base.OWN) + ',1,' + q(base.OWN + '/versions/' + version + '/caw-v1.pdf') + ',41),('
                   + q(newer) + ',' + q(doc) + ',' + q(base.OWN) + ',2,' + q(base.OWN + '/versions/' + newer + '/caw-v2.pdf') + ',42);'
                   'UPDATE public.org_documents SET current_version_id=' + q(newer) + ' WHERE id=' + q(doc) + ';')
        reader.ok(source_fence(version=version)); control.check(version_lifecycle(version))
        writer.ok('BEGIN; UPDATE public.org_documents SET deleted_at=clock_timestamp() WHERE id=' + q(doc) + ';')
        try: reader.error(source_fence(version=version), '40001', 'PCC_CONTEXT_CHANGED_RETRY')
        finally: writer.ok('COMMIT;')
        reader.ok(source_fence(version=version)); control.check('NOT(' + version_lifecycle(version) + ')')
        passed(11, 'private_resource_component', {'storedV1SelectedDespiteCurrentPointerV2': True, 'parentLifecycleWriterFirstRetries': True, 'freshExactVersionParentPredicateFalse': True, 'noStorageOrFrozenBytesRewritten': True})

        f = fresh_copy()
        reader.ok('BEGIN;'); reader.ok(source_fence(order=f['order'], buyer=f['buyer']))
        wait_writer("UPDATE public.marketplace_orders SET status='cancelled' WHERE id=" + q(f['order']) + ';', reader)
        answer = jrow(learner, mode_sql(f['buyer']))
        if answer.get('mode') != 'frozen_required' or answer.get('state') != 'held' or answer.get('cohort') is not None:
            raise AssertionError('CAW_REVOKED_ZERO_REF_ORDER_MUST_HOLD_WITHOUT_LEGACY_DOWNGRADE')
        passed(12, 'private_resource_component_plus_coarse_mode', {'plainSourceOrderAlwaysLocked': True, 'pgBlockingPidsWitness': True, 'freshInvalidOrderCohortNullHeld': True, 'noInvented42501ForLegacyNeutralPaidPredicate': True})

        if actual != ['CAW' + str(i).zfill(2) for i in range(1, 13)]:
            raise AssertionError('CAW_EXACT_TWELVE_COMPONENT_GROUPS_REQUIRED')
        if catalog() != old_catalog or base.protected(control) != old_protected:
            raise AssertionError('CAW_OLD_FUNCTION_ACTOR_CLIENT_RESULT_DRIFT')
        preservation = retained(old_rows)
        if jrow(control, 'SELECT public.pcf_v1_delivery_capabilities();') != caps:
            raise AssertionError('CAW_FALSE_CAPABILITY_BYTES_CHANGED')
        result = {'status': 'PASS_NATIVE_CURRENT_AUTHORITY12_COMPONENTS_ONLY', 'actualGroups': actual,
                  'ordinaryCourseAdmissionGroups': 4, 'privateResourceComponentGroups': 8,
                  'oldRows': preservation, 'oldCatalogAndProtectedExact': True, 'capabilitiesUnchangedFalse': True,
                  'sealedFileBindingOrBytesAccepted': False, 'ordinaryCloudAuthAccepted': False,
                  'realStorageHTTPAccepted': False, 'fullThreeGapsOrPROG012Accepted': False,
                  'productionRelease': False, 'open': ['full sealed-binding authorization path without cap fixture',
                    'existing grant/order lineage mutation positive rights fixture', 'lesson-prefix/organization-role writers outside this finite scope']}
        return result
    finally:
        primary, cleanup = sys.exc_info()[0] is not None, []
        # Release both possible readers before joining an async writer. No concurrent
        # Session.close/ROLLBACK/stdin while Session.run owns the writer protocol.
        for value in (learner, reader):
            if value is not None:
                try: value.rollback()
                except Exception as error: cleanup.append({'readerRollback': repr(error)})
        busy = False
        for thread in threads:
            thread.join(timeout=1)
            if thread.is_alive(): busy = True; cleanup.append({'thread': 'RUNNING_AFTER_READERS_RELEASED'})
        if writer is not None and not busy:
            try: writer.rollback()
            except Exception as error: cleanup.append({'writerRollback': repr(error)})
        if control is not None and 'old_rows' in locals():
            try: trace({'authorityWriterRetainedRowsAfterCleanup': retained(old_rows)})
            except Exception as error: cleanup.append({'retainedRowsReadback': repr(error)})
        for value in reversed(sessions):
            if not hasattr(value, 'proc'): continue
            error, forced = None, False
            if value is writer and busy:
                error, forced = 'ACTIVE_WRITER_KILLED_WITHOUT_PROTOCOL_INPUT', True
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
            trace({'authorityWriterNativeSessionExit': receipt})
            if receipt['exitCode'] != 0 or error: cleanup.append(receipt)
        for thread in threads:
            thread.join(timeout=1)
            if thread.is_alive(): cleanup.append({'thread': 'RUNNING_AFTER_OWNED_PROCESS_CLOSED'})
        if cleanup:
            trace({'authorityWriterCleanupFailures': cleanup, 'primaryFailurePreserved': primary})
            if not primary: raise AssertionError('CAW_NATIVE_CLEANUP_OR_EXIT_FAILURE')
