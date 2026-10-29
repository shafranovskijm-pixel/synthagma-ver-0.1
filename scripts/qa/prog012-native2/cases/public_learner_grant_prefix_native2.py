"""Two NEW conditional native components only; never import/run the old24/139 stages.

The fixture port is the exact accepted copy24 helper module, verified before import.
All rows/claims are models in a fresh dedicated database, never provider Auth/JWT.
"""
from pathlib import Path
import sys

DATABASE = 'sintagma_pcc_public_native2_lab_20261029'
EXPECTED_GROUPS = ['PCL01', 'PCL02']
CANONICAL_NATIVE_COURSE = '8ae9739f-e87b-5397-94a5-86bfe99b0d77'


def run_cases(Session, argv, env, trace, fixture, input_dir):
    here = Path(input_dir).resolve(strict=True)
    sessions, groups, result = [], [], None
    control, cap_before, cap_requested = None, None, False

    def session(name):
        value = Session.__new__(Session)
        sessions.append(value)
        Session.__init__(value, argv, env, 'PCL2-' + name, trace)
        value.check("current_database()='" + DATABASE + "'AND host(inet_server_addr())='127.0.0.1'AND inet_server_port()=5432 "
                    "AND current_setting('server_version_num')='170011'AND current_setting('data_directory')='/var/lib/postgresql/data' "
                    "AND current_setting('pcr.lab_authorized',true)='source-reviewed-root-run-only' "
                    "AND current_setting('transaction_isolation')='read committed'AND current_setting('session_replication_role')='origin'")
        return value

    def capabilities():
        return fixture.jrow(control, "SELECT jsonb_build_object('definition',pg_get_functiondef(p.oid),'body',p.prosrc,"
                            "'acl',p.proacl::text,'owner',pg_get_userbyid(p.proowner))FROM pg_proc p "
                            "WHERE p.oid='public.pcf_v1_delivery_capabilities()'::regprocedure;")

    def selected_context(learner, course, expected, kind):
        context = fixture.context(learner, course, expected['reference'], kind=kind)
        required = {'schema_version': 1, 'actor_id': fixture.LEARNER, 'organization_id': fixture.BUYER,
                    'course_id': course, 'reference_kind': kind, 'reference_id': expected['reference'],
                    'access_mode': 'learner', 'purpose': 'preview', 'mode': 'frozen_required', 'state': 'bytes_sealed'}
        if any(context.get(k) != v for k, v in required.items()):
            raise AssertionError('PCL2_PUBLIC_CONTEXT_TUPLE_DRIFT')
        binding = context.get('binding')
        if not isinstance(binding, dict):
            raise AssertionError('PCL2_PUBLIC_BINDING_REQUIRED')
        selected = {'reference': context['reference_id'], 'binding': binding.get('binding_id'),
                    'generation': binding.get('copy_generation_id')}
        if selected != expected or binding.get('file_bytes_sha256') != fixture.DIGEST:
            raise AssertionError('PCL2_PUBLIC_SELECTION_NOT_EXACT_EXPECTED_BINDING')
        # Only IDs returned by this public context are supplied to the byte RPC.
        fixture.assert_bytes(learner, course, selected, kind=kind)
        return selected

    def passed(name, detail):
        groups.append(name)
        trace({'case': name, 'status': 'PASS_CONDITIONAL_NATIVE_PUBLIC_RPC_MODEL_ONLY', 'details': detail})

    try:
        control = session('control')
        admin, worker, manager, learner = [session(n) for n in ('admin', 'worker', 'manager', 'learner')]
        fixture.ctx(admin, fixture.ADMIN)
        fixture.ctx(worker, None, 'service_role')
        fixture.ctx(manager, fixture.MANAGER)
        fixture.ctx(learner, fixture.LEARNER)
        baseline = fixture.protected(control)
        control.check("to_regprocedure('public.pcc_v2_current_rights_keys(text,uuid[],boolean)')IS NOT NULL "
                      "AND NOT EXISTS(SELECT 1 FROM public.platform_course_copy_file_cohorts) "
                      "AND NOT EXISTS(SELECT 1 FROM public.platform_course_copy_file_bindings)")
        cap_before = capabilities()
        control.check("public.pcf_v1_delivery_capabilities()->>'frozen_reader_implemented'='false'AND "
                      "public.pcf_v1_delivery_capabilities()->>'frontend_consumers_accepted'='false'AND "
                      "public.pcf_v1_delivery_capabilities()->>'copied_centre_exact_binding_supported'='false'")
        cap_requested = True  # Unknown acknowledgement still requires exact restoration.
        control.ok((here / 'pcl2-conditional-capability.lab-only.sql').read_text())
        control.check("public.pcf_v1_delivery_capabilities()->>'frozen_reader_implemented'='true'AND "
                      "public.pcf_v1_delivery_capabilities()->>'frontend_consumers_accepted'='false'AND "
                      "public.pcf_v1_delivery_capabilities()->>'copied_centre_exact_binding_supported'='false'")

        # PCL01 differs from oldCOPY24-11: latest67262 is installed BEFORE construction.
        paid = fixture.source(control, canonical=CANONICAL_NATIVE_COURSE)
        receipts = fixture.capture(admin, worker, paid)
        fixture.publish(admin, paid, receipts)
        copied = fixture.acquire(manager, paid)
        course = copied['course_id']
        fixture.enroll(control, course)
        expected = fixture.binding(control, course, paid['learner']['sourceDoc'])
        control.check('public.paid_umk_20260922_valid_grant(' + fixture.q(course) + ','
                      + fixture.q(paid['learner']['library']) + ')')
        selected = selected_context(learner, course, expected, 'course_document')
        control.check('NOT EXISTS(SELECT 1 FROM public.balance_transactions WHERE related_order_id='
                      + fixture.q(copied['order_id']) + ')')
        # Only a NEW synthetic normal-delivery grant is changed, after context committed.
        control.ok('UPDATE public.paid_umk_20260922_grants SET revoked_at=clock_timestamp()WHERE buyer_course_id='
                   + fixture.q(course) + 'AND asset_id=' + fixture.q(paid['learner']['asset']) + ';')
        control.check('NOT public.paid_umk_20260922_valid_grant(' + fixture.q(course) + ','
                      + fixture.q(paid['learner']['library']) + ')')
        learner.error(fixture.read_sql(course, selected), '42501', 'PCC_REFERENCE_UNAVAILABLE')
        passed('PCL01', {'latestAuthorityBeforeFixture': True, 'normalPurchaseAndCanonicalGrant': True,
                        'publicContextToExactBytes': True, 'committedRevokeDeniesCachedSelection': True,
                        'sourceCourse': paid['course'], 'copiedCourse': course, 'sourceReference': paid['learner']['sourceDoc'],
                        'targetReference': selected['reference'], 'fileSHA256': fixture.DIGEST,
                        'ordinaryJWTOrStorageHTTP': False, 'concurrencyClaim': False})

        # PCL02 selects exact mapped IDs from the immutable cohort lesson_order.
        fresh = fixture.source(control)
        control.ok('UPDATE public.courses SET sequential_lessons=true WHERE id=' + fixture.q(fresh['course']) + ';'
                   'UPDATE public.lesson_attachments SET lesson_id=' + fixture.q(fresh['lesson3'])
                   + 'WHERE id=' + fixture.q(fresh['attachment']) + ';')
        receipts = fixture.capture(admin, worker, fresh)
        fixture.publish(admin, fresh, receipts)
        acquired = fixture.acquire(manager, fresh)
        course = acquired['course_id']
        fixture.enroll(control, course)
        expected = fixture.binding(control, course, fresh['attachment'], 'lesson_attachment')
        mapped = fixture.jrow(control, "SELECT jsonb_build_object('order',h.lesson_order,'targetLesson',b.target_lesson_id)"
                              'FROM public.platform_course_copy_file_cohorts h JOIN public.platform_course_copy_file_bindings b'
                              ' ON b.course_id=h.course_id AND b.copy_generation_id=h.copy_generation_id WHERE h.course_id='
                              + fixture.q(course) + "AND b.reference_kind='lesson_attachment'AND b.source_reference_id="
                              + fixture.q(fresh['attachment']) + ';')
        order = mapped['order']
        if not isinstance(order, list) or len(order) != 3 or len(set(order)) != 3 or mapped['targetLesson'] != order[2]:
            raise AssertionError('PCL2_EXACT_THREE_LESSON_MAPPING_REQUIRED')
        # These are neither guessed titles nor first/latest references.
        first, second, target = order
        learner.error('SELECT public.read_course_exact_file_delivery_context('
                      + ','.join(map(fixture.q, [course, 'lesson_attachment', expected['reference'], 'learner', 'preview']))
                      + ');', '42501', 'PCC_REFERENCE_UNAVAILABLE')
        control.ok('INSERT INTO public.lesson_progress(user_id,lesson_id,completed)VALUES('
                   + fixture.q(fixture.LEARNER) + ',' + fixture.q(second) + ',true);')
        learner.error('SELECT public.read_course_exact_file_delivery_context('
                      + ','.join(map(fixture.q, [course, 'lesson_attachment', expected['reference'], 'learner', 'preview']))
                      + ');', '42501', 'PCC_REFERENCE_UNAVAILABLE')
        control.ok('INSERT INTO public.lesson_progress(user_id,lesson_id,completed)VALUES('
                   + fixture.q(fixture.LEARNER) + ',' + fixture.q(first) + ',true);')
        selected = selected_context(learner, course, expected, 'lesson_attachment')
        control.ok('DELETE FROM public.lesson_progress WHERE user_id=' + fixture.q(fixture.LEARNER)
                   + 'AND lesson_id=' + fixture.q(first) + ';')
        learner.error(fixture.read_sql(course, selected, 'lesson_attachment'), '42501', 'PCC_REFERENCE_UNAVAILABLE')
        passed('PCL02', {'publicPrefixDeniedBeforeProgress': True, 'onlyLaterPredecessorStillDenied': True,
                        'completeTwoPredecessorPrefixPublicContextBytes': True, 'prefixRemovalDeniesCachedSelection': True,
                        'copiedCourse': course, 'sourceReference': fresh['attachment'], 'targetReference': selected['reference'],
                        'exactPrefixLessonIDs': [first, second], 'targetLesson': target, 'fileSHA256': fixture.DIGEST,
                        'privateHelperShortcutUsed': False, 'concurrencyClaim': False})
        if groups != EXPECTED_GROUPS or fixture.protected(control) != baseline:
            raise AssertionError('PCL2_EXACT_GROUPS_OR_RETAINED_MODEL_ROWS_DRIFT')
        result = {'status': 'PASS_TWO_NEW_CONDITIONAL_NATIVE_PUBLIC_LEARNER_COMPONENTS_ONLY', 'actualGroups': groups,
                  'oldCaseBodiesExecuted': 0, 'protectedOldSentinelAndAuthModelRowsExact': True,
                  'capabilityOriginalRestored': False, 'realJWTStorageCloudUI': False, 'fullPROG012Accepted': False}
        return result
    finally:
        primary = sys.exc_info()[0] is not None
        cleanup_errors = []
        if cap_requested and control is not None:
            try:
                control.rollback()
                control.ok((here / 'pcl2-exact-capability-restore.sql').read_text())
                if capabilities() != cap_before:
                    raise AssertionError('PCL2_CAPABILITY_DEFINITION_OWNER_ACL_RESTORE_DRIFT')
                if result is not None:
                    result['capabilityOriginalRestored'] = True
                trace({'pcl2CapabilityRestore': {'exactDefinitionOwnerACL': True, 'productionFlagsChanged': False}})
            except Exception as error:
                cleanup_errors.append({'stage': 'capabilityRestore', 'error': repr(error)})
                trace({'pcl2CapabilityRestoreFailure': repr(error)})
        for value in reversed(sessions):
            if not hasattr(value, 'proc'):
                continue
            close_error = None
            try:
                value.close()
            except Exception as error:
                close_error = repr(error)
            forced = value.proc.poll() is None
            if forced:
                try:
                    value.proc.kill()
                    value.proc.wait(timeout=5)
                except Exception as error:
                    close_error = close_error or repr(error)
                close_error = close_error or 'FORCED_CLEANUP'
            receipt = {'session': value.name, 'pid': value.proc.pid, 'exitCode': value.proc.poll(),
                       'closeError': close_error, 'forcedCleanupFallback': forced}
            trace({'pcl2NativeSessionExit': receipt})
            if receipt['exitCode'] != 0 or close_error:
                cleanup_errors.append(receipt)
        if cleanup_errors:
            trace({'pcl2CleanupFailures': cleanup_errors, 'primaryFailurePreserved': primary})
            if not primary:
                raise AssertionError('PCL2_CLEANUP_OR_NATURAL_EXIT_FAILURE')
