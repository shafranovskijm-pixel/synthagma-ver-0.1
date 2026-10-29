"""Four bounded PRIVATE-component PG17 model groups; SOURCE ONLY, not run.

The caller owns guarded fresh database and three accepted Session transports.
No public RPC, real JWT/Auth provider, private-function grant, policy row,
capability override, storage download or file-byte acceptance is exercised.
Only fresh explicitly synthetic fixture rows are created in the isolated model.
"""
from __future__ import annotations

from copy import deepcopy
import json
import re

DATABASE = 'sintagma_pfd_foundation_lab_20261029'
OWN = '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'
GROUPS = ['PFD01', 'PFD02', 'PFD03', 'PFD04']
SIGNATURES = [
    'public.pfd_v2_material_shape(jsonb,uuid,uuid)',
    'public.pfd_v2_history_immutable()',
    'public.pfd_v2_rollout_lock(uuid,boolean)',
    'public.pfd_v2_own_source_fence(uuid,text,boolean)',
]
STORES = ['platform_private_file_delivery_v2_current',
          'platform_private_file_delivery_v2_events']


def _state(control, base):
    return base.jrow(control, "SELECT jsonb_build_object("
        "'capabilities',public.pcf_v1_delivery_capabilities(),"
        "'stamp',public.pcf_v1_enforcement_stamp(),"
        "'currentRows',(SELECT count(*) FROM public.platform_private_file_delivery_v2_current),"
        "'eventRows',(SELECT count(*) FROM public.platform_private_file_delivery_v2_events));")


def _no_auth_owner(session):
    # MODEL context only. These claims are empty, not a real JWT or provider login.
    # Foundation install/inverse use separate fresh owner sessions with auth.role NULL.
    session.ok("RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false); "
               "SELECT set_config('request.jwt.claim.role','',false);")
    session.check("current_user='postgres' AND session_user='postgres'")


def _shape(control, base, material, course):
    payload = base.q(json.dumps(material, separators=(',', ':')))
    result = control.ok('SELECT public.pfd_v2_material_shape(' + payload
                        + '::jsonb,' + base.q(course) + '::uuid,'
                        + base.q(OWN) + '::uuid);')
    if result not in (['t'], ['f']):
        raise AssertionError('PFD_ONE_SHAPE_BOOLEAN_REQUIRED: ' + repr(result))
    return result == ['t']


def _expect_mode(mode, actor, course):
    expected = {'schema_version': 1, 'actor_id': actor, 'organization_id': OWN,
                'course_id': course, 'access_mode': 'learner',
                'mode': 'legacy', 'state': 'legacy', 'cohort': None}
    if mode != expected:
        raise AssertionError('PFD_EXACT_EXISTING_COARSE_MODE_REQUIRED: ' + repr(mode))


def _pid(session):
    output = session.ok('SELECT pg_backend_pid();')
    if len(output) != 1 or not output[0].isdigit():
        raise AssertionError('PFD_ONE_BACKEND_PID_REQUIRED: ' + repr(output))
    return int(output[0])


def _finish_owned_thread(reader, writer, thread, trace):
    """Never close Session/stdin while its accepted run() is still active."""
    if thread is None:
        return
    try:
        if thread.is_alive():
            try:
                reader.rollback()
            finally:
                thread.join(timeout=12)
        if thread.is_alive():
            trace({'ownedWriterForcedStop': True,
                   'reason': 'PFD_WRITER_DID_NOT_DRAIN_AFTER_READER_ROLLBACK'})
            if writer.proc.poll() is None:
                writer.proc.kill()
                writer.proc.wait(timeout=5)
            thread.join(timeout=5)
            raise AssertionError('PFD_ORPHAN_WRITER_REQUIRED_FORCED_STOP')
    finally:
        # A still-running worker remains visible to the stage's owned-process
        # cleanup. It must never call Session.close() concurrently with run().
        if not thread.is_alive() and getattr(writer, '_pfd_background_thread', None) is thread:
            writer._pfd_background_thread = None


def run_cases(control, reader, writer, base, fixture, trace, expected_model_stamp):
    """Return four actual group IDs only after each real SQL oracle succeeds.

    base is the unchanged accepted copy24 DEFINITION-only helper module.
    fixture is the separate new model-only seed/subject/SQL helper module.
    The stage, not this module, creates/closes the three Session processes.
    """
    if not isinstance(expected_model_stamp, str) or re.fullmatch(r'[0-9a-f]{64}', expected_model_stamp) is None:
        raise AssertionError('PFD_EXPLICIT_REAL_MODEL_STAMP_REQUIRED')
    control.check("current_database()='" + DATABASE + "' AND current_user='postgres' "
        "AND session_user='postgres' AND inet_server_addr()='127.0.0.1'::inet "
        "AND inet_server_port()=5432 AND current_setting('server_version_num')='170011' "
        "AND current_setting('data_directory')='/var/lib/postgresql/data' "
        "AND current_setting('pcr.lab_authorized',true)='source-reviewed-root-run-only' "
        "AND current_setting('transaction_isolation')='read committed' "
        "AND current_setting('session_replication_role')='origin'")
    # Preserve genuine absence of model claim GUCs for the fresh fixture guard.
    seeded = fixture.seed(control, base)
    learner, foreign, staff = (seeded['learner'], seeded['foreign'], seeded['staff'])
    course = seeded['course']
    if len({learner, foreign, staff}) != 3 or any(actor in base.ACTORS.values()
                                               for actor in (learner, foreign, staff)):
        raise AssertionError('PFD_NEW_DISTINCT_MODEL_ACTORS_REQUIRED')
    control.check('(SELECT organization_id=' + base.q(OWN) + '::uuid FROM public.profiles '
                  'WHERE user_id=' + base.q(learner) + ') AND '
                  '(SELECT organization_id<>' + base.q(OWN) + '::uuid FROM public.profiles '
                  'WHERE user_id=' + base.q(foreign) + ')')
    identities_before = base.protected(control)
    before = _state(control, base)
    if before['stamp'] != expected_model_stamp or before['currentRows'] != 0 or before['eventRows'] != 0:
        raise AssertionError('PFD_EMPTY_DEFAULT_DENY_FOUNDATION_REQUIRED')
    for key in ('frozen_reader_implemented', 'frontend_consumers_accepted',
                'copied_centre_exact_binding_supported'):
        if before['capabilities'].get(key) is not False:
            raise AssertionError('PFD_UNCHANGED_FALSE_CAPABILITY_REQUIRED: ' + key)
    passed, details = [], {}

    def done(group, detail):
        passed.append(group)
        details[group] = detail
        trace({'pass': group, 'componentOnly': True, 'detail': detail})

    # PFD01: private default-deny and pure structural validation, not real receipts.
    sigs = ','.join(base.q(sig) + '::regprocedure' for sig in SIGNATURES)
    control.check("(SELECT count(*)=4 AND bool_and(p.proowner='postgres'::regrole) "
        "FROM pg_proc p WHERE p.oid IN(" + sigs + ')) AND NOT EXISTS('
        'SELECT 1 FROM pg_proc p CROSS JOIN LATERAL '
        "aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a "
        'WHERE p.oid IN(' + sigs + ') AND a.grantee<>p.proowner)')
    for role in ('anon', 'authenticated', 'service_role'):
        for sig in SIGNATURES:
            control.check('NOT has_function_privilege(' + base.q(role) + ','
                          + base.q(sig) + ",'EXECUTE')")
    rels = ','.join(base.q('public.' + name) + '::regclass' for name in STORES)
    control.check('(SELECT count(*)=2 AND bool_and(c.relrowsecurity) '
        'FROM pg_class c WHERE c.oid IN(' + rels + ')) AND NOT EXISTS('
        'SELECT 1 FROM pg_class c CROSS JOIN LATERAL '
        "aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a "
        'WHERE c.oid IN(' + rels + ') AND a.grantee<>c.relowner)')
    material = {
        'course_id': course['course'], 'marketplace_id': course['listing'],
        'proposal_id': base.uid(), 'material_edition_sha256': '1' * 64,
        'organization_id': OWN, 'source_scope_generation': base.uid(),
        'reference_vector_sha256': '2' * 64, 'capture_enforcement_sha256': expected_model_stamp,
        'references': [{'reference_kind': 'course_document',
                        'reference_id': base.uid(),
                        'receipt': {'receipt_id': base.uid(),
                                    'captured_edition_id': base.uid(),
                                    'source_org_version_id': None,
                                    'file_bytes_sha256': '3' * 64,
                                    'byte_length': 8388608}}],
    }
    vectors = [('exact-8MiB-structural-boundary', material, True),
               ('null-root', None, False)]
    changed = deepcopy(material); changed['extra'] = True
    vectors.append(('extra-root-key', changed, False))
    changed = deepcopy(material); del changed['proposal_id']
    vectors.append(('missing-root-key', changed, False))
    changed = deepcopy(material); changed['references'] = []
    vectors.append(('empty-reference-vector', changed, False))
    changed = deepcopy(material); changed['references'].append(deepcopy(changed['references'][0]))
    vectors.append(('duplicate-reference-pair', changed, False))
    changed = deepcopy(material); changed['organization_id'] = base.BUYER
    vectors.append(('foreign-owner', changed, False))
    changed = deepcopy(material); changed['course_id'] = base.uid()
    vectors.append(('different-course', changed, False))
    changed = deepcopy(material); changed['references'][0]['receipt']['source_org_version_id'] = base.uid()
    vectors.append(('unsupported-org-version', changed, False))
    changed = deepcopy(material); del changed['references'][0]['receipt']['source_org_version_id']
    vectors.append(('missing-explicit-null', changed, False))
    changed = deepcopy(material); changed['references'][0]['receipt']['byte_length'] = 8388609
    vectors.append(('over-8MiB', changed, False))
    changed = deepcopy(material); changed['references'][0]['receipt']['byte_length'] = 1
    vectors.append(('one-byte-structural-boundary', changed, True))
    changed = deepcopy(material); changed['references'][0]['receipt']['byte_length'] = '1'
    vectors.append(('string-length', changed, False))
    changed = deepcopy(material); changed['references'][0]['receipt']['byte_length'] = 1.5
    vectors.append(('fractional-length', changed, False))
    shape_results = []
    for name, value, expected in vectors:
        actual = _shape(control, base, value, course['course'])
        if actual is not expected:
            raise AssertionError('PFD_SHAPE_VECTOR_FAILED: ' + name)
        shape_results.append({'case': name, 'actual': actual, 'expected': expected})
    done('PFD01', {'privateHelpers': 4, 'emptyPrivateStores': 2,
                   'shapeVectors': shape_results,
                   'receiptRowsOrBytesCreated': False})

    # PFD02: owner execution of the private helper with explicitly MODELED subject.
    # Real modeled same-org/enrollment predicates still apply; no admin/preview bypass.
    fixture.subject(reader, learner, base)
    reader.error(fixture.fence_sql(course['course'], base), '42501')
    enrollment = fixture.enroll(control, learner, course['course'], base)
    mode = base.jrow(reader, fixture.fence_sql(course['course'], base))
    _expect_mode(mode, learner, course['course'])
    foreign_enrollment = fixture.enroll(control, foreign, course['course'], base)
    fixture.subject(reader, foreign, base)
    reader.error(fixture.fence_sql(course['course'], base), '42501')
    fixture.subject(reader, learner, base)
    _expect_mode(base.jrow(reader, fixture.fence_sql(course['course'], base)),
                 learner, course['course'])
    done('PFD02', {'noEnrollmentDenied42501': True,
                   'ownModeledEnrollmentId': enrollment,
                   'foreignModeledEnrollmentId': foreign_enrollment,
                   'foreignOrganizationDenied42501': True,
                   'exactExistingCoarseMode': mode,
                   'genuineAuthOrPublicPrivateHelperPermission': False})

    # PFD03: an absent withdrawal row is protected by matching advisory keys.
    # The existing writer uses TRY, so this oracle is immediate40001, NOT a wait.
    withdraw_sql = fixture.withdraw_sql(enrollment, course['course'], staff, base)
    control.check('NOT EXISTS(SELECT 1 FROM public.uc_enrollment_withdrawal_states '
                  'WHERE enrollment_id=' + base.q(enrollment) + ')')
    reader_open = False
    try:
        reader.ok('BEGIN;'); reader_open = True
        fixture.subject(reader, learner, base)
        _expect_mode(base.jrow(reader, fixture.fence_sql(course['course'], base)),
                     learner, course['course'])
        writer.error(withdraw_sql, '40001', 'PCC_CONTEXT_CHANGED_RETRY')
        control.check('NOT EXISTS(SELECT 1 FROM public.uc_enrollment_withdrawal_states '
                      'WHERE enrollment_id=' + base.q(enrollment) + ')')
        reader.rollback(); reader_open = False
        writer.ok(withdraw_sql)
        control.check('(SELECT count(*)=1 FROM public.uc_enrollment_withdrawal_states '
                      'WHERE enrollment_id=' + base.q(enrollment) + ')')
        reader.error(fixture.fence_sql(course['course'], base), '42501')
    finally:
        if reader_open:
            reader.rollback()
    done('PFD03', {'absentWithdrawalInsertConflicted40001': True,
                   'noRowOnConflict': True, 'oneFreshInsertAfterReaderRelease': True,
                   'newFenceAfterCommittedWithdrawalDenied42501': True,
                   'writerWaitClaimed': False})

    # PFD04: absent progress INSERT must take the real42007 writer fence.
    # PCR own-edition writer uses TRY40001; it must not be mislabeled a wait.
    writer_course = fixture.source(control, base)
    fixture.enroll(control, learner, writer_course['course'], base)
    lesson = writer_course['lesson']
    progress_id = base.uid()
    insert_progress = ('INSERT INTO public.lesson_progress(id,lesson_id,user_id,completed)'
                       'VALUES(' + base.q(progress_id) + ',' + base.q(lesson) + ','
                       + base.q(learner) + ',true);')
    control.check('NOT EXISTS(SELECT 1 FROM public.lesson_progress WHERE user_id='
                  + base.q(learner) + ' AND lesson_id=' + base.q(lesson) + ')')
    lesson_before = control.ok('SELECT to_jsonb(l)::text FROM public.lessons l '
                               'WHERE id=' + base.q(lesson) + ';')[-1]
    pcr_update = ('UPDATE public.lessons SET content=content||'
                  + base.q(' PFD_SYNTHETIC_ROLLBACK_ONLY') + ' WHERE id='
                  + base.q(lesson) + ';')
    reader_open, thread, box = False, None, None
    reader_pid, writer_pid = _pid(reader), _pid(writer)
    try:
        reader.ok('BEGIN;'); reader_open = True
        fixture.subject(reader, learner, base)
        _expect_mode(base.jrow(reader, fixture.fence_sql(writer_course['course'], base)),
                     learner, writer_course['course'])
        _no_auth_owner(writer)
        thread, box = base.thread_call(writer, 'BEGIN; ' + insert_progress + ' ROLLBACK;')
        writer._pfd_background_thread = thread
        base.wait_blocked(control, writer_pid, reader_pid)
        trace({'group': 'PFD04', 'actualBlockingWitness': {
            'readerBackendPid': reader_pid, 'writerBackendPid': writer_pid,
            'writerTable': 'lesson_progress', 'missingRowBeforeInsert': True,
            'expectedFence': 'existing blocking subject42007'}})
        control.error(pcr_update, '40001')
        reader.rollback(); reader_open = False
        base.join_ok(thread, box)
        writer._pfd_background_thread = None
        thread = None
        control.check('NOT EXISTS(SELECT 1 FROM public.lesson_progress WHERE id='
                      + base.q(progress_id) + ')')
        control.check('(SELECT to_jsonb(l)=' + base.q(lesson_before)
                      + '::jsonb FROM public.lessons l WHERE id=' + base.q(lesson) + ')')
        # Calibrate both writer paths after the reader leaves; everything rolls back.
        writer.ok('BEGIN; ' + insert_progress + ' ROLLBACK;')
        control.ok('BEGIN; ' + pcr_update + ' ROLLBACK;')
        control.check('NOT EXISTS(SELECT 1 FROM public.lesson_progress WHERE id='
                      + base.q(progress_id) + ')')
        control.check('(SELECT to_jsonb(l)=' + base.q(lesson_before)
                      + '::jsonb FROM public.lessons l WHERE id=' + base.q(lesson) + ')')
    finally:
        try:
            if reader_open:
                reader.rollback()
        finally:
            _finish_owned_thread(reader, writer, thread, trace)
    done('PFD04', {'actualProgressInsertWriterBlockedByReader': True,
                   'readerBackendPid': reader_pid, 'writerBackendPid': writer_pid,
                   'pcrWriterTryConflict40001': True,
                   'bothWritersSucceedAfterReleaseAndRollback': True,
                   'progressRowAbsentAndLessonFullRowExact': True,
                   'broaderRoleDeleteOrRrMatrixClaimed': False})

    if passed != GROUPS:
        raise AssertionError('PFD_EXACT_FOUR_GROUPS_REQUIRED: ' + repr(passed))
    if _state(control, base) != before:
        raise AssertionError('PFD_CAP_STAMP_OR_EMPTY_STORES_CHANGED')
    if base.protected(control) != identities_before:
        raise AssertionError('PFD_RETAINED_FIXTURE_OR_AUTH_ROLE_PROFILE_CHANGED')
    return {'actualGroups': passed, 'details': details,
            'capabilitiesAndCaptureStampExact': True,
            'realModelCaptureStamp': before['stamp'],
            'bothNewPrivateStoresRemainEmpty': True,
            'oldRetainedAndSeededIdentityRowsExact': True,
            'privateOwnerModeledComponentsOnly': True,
            'genuineAuthCloudFileDeliveryAccepted': False}
