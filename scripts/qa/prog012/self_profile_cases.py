"""CI-only concrete native self-profile12 cases. No provider/JWT or production access.
Imports the accepted native Session; no new transport or full14-trigger claim.
"""
from __future__ import annotations
import json
import os
import sys
import time

DATABASE = 'sintagma_self_profile_lab_20261028'
U = {i: str(i) * 8 + '-' + str(i) * 4 + '-4' + str(i) * 3 + '-8' + str(i) * 3 + '-' + str(i) * 12 for i in range(1, 10)}

def q(value):
    return "'" + str(value).replace("'", "''") + "'"

def ctx(s, uid=U[1], role='authenticated', claim='authenticated'):
    s.ok('RESET ROLE; SET ROLE ' + role + "; SELECT set_config('request.jwt.claim.sub'," + q(uid or '') + ",false); SELECT set_config('request.jwt.claim.role'," + q(claim) + ',false);')

def row(s, sql):
    out = s.ok(sql)
    values = [x for x in out if x.startswith('{')]
    if len(values) != 1:
        raise AssertionError('ONE_JSON_RESULT_REQUIRED: ' + repr(out))
    return json.loads(values[0])

def digest_sql(relation, where='true'):
    return "(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(x)ORDER BY to_jsonb(x)::text),'[]')::text,'UTF8')),'hex')FROM " + relation + ' x WHERE ' + where + ')'

def protected(s):
    fields = {
        'authSynthetic': digest_sql('auth.users'), 'roles': digest_sql('public.user_roles'),
        'orgStaff': digest_sql('public.org_staff'), 'adminStaff': digest_sql('public.admin_staff'),
        'oldProfiles': digest_sql('public.profiles', 'user_id NOT IN(' + q(U[1]) + ',' + q(U[8]) + ')'),
        'oldAwards': digest_sql('public.user_achievements', 'user_id<>' + q(U[1])),
        'retained': digest_sql('public.qa_retained_results'),
        'deletionRevocations': digest_sql('public.account_deletion_revocations'),
        'achievementCatalog': digest_sql('public.achievements'),
    }
    return row(s, 'SELECT jsonb_build_object(' + ','.join(q(k) + ',' + v for k, v in fields.items()) + ')::text;')

def run_stage(Session, argv, env, trace):
    if os.environ.get('GITHUB_ACTIONS') != 'true' or sys.platform != 'linux':
        raise RuntimeError('SELF_PROFILE_GUARDED_LINUX_CI_ONLY')
    sessions, actual = [], []
    def session(name):
        value = Session.__new__(Session)
        sessions.append(value)  # Retain a partly constructed process for finally.
        try:
            Session.__init__(value, argv, env, 'SELF-' + name, trace)
            value.check("current_database()='" + DATABASE + "'AND host(inet_server_addr())='127.0.0.1'AND inet_server_port()=5432 "
                        "AND current_setting('server_version_num')='170011'AND current_setting('data_directory')='/var/lib/postgresql/data' "
                        "AND current_setting('pcr.lab_authorized',true)='source-reviewed-root-run-only'")
        except Exception as error:
            trace({'selfProfileStartupFailure': {'session': name, 'processPresent': hasattr(value, 'proc'), 'errorType': type(error).__name__}})
            raise
        return value
    def passed(number, details=None):
        case = 'PSELF' + str(number).zfill(2)
        actual.append(case)
        trace({'case': case, 'status': 'PASS_NATIVE_SYNTHETIC_SQL_ONLY', 'details': details})
    try:
        control, actor, locker = session('control'), session('actor'), session('locker')
        control.check("to_regprocedure('public.ensure_my_profile()')IS NOT NULL AND (SELECT count(*)FROM auth.users)=8 "
                      "AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id IN(" + q(U[1]) + ',' + q(U[8]) + '))')
        baseline = protected(control)
        ctx(actor)
        created = row(actor, 'SELECT public.ensure_my_profile()::text;')
        if created.get('user_id') != U[1] or created.get('created') is not True or created.get('schema_version') != 1:
            raise AssertionError('MISSING_SELF_NOT_CREATED')
        actor.check("EXISTS(SELECT 1 FROM public.profiles WHERE user_id=" + q(U[1]) + 'AND id=' + q(created['id']) + "AND email='native-self-1@example.invalid'AND full_name=''AND organization_id IS NULL AND company_id IS NULL "
                    'AND student_group_id IS NULL AND login IS NULL AND generated_password IS NULL AND blocked_at IS NULL AND archived_at IS NULL)')
        control.check('(SELECT count(*)FROM public.user_achievements WHERE user_id=' + q(U[1]) + ')=1')
        passed(1, {'createdOwnNeutral': True, 'independentOwnRLSRead': True})

        old = row(control, 'SELECT to_jsonb(p)FROM public.profiles p WHERE user_id=' + q(U[2]) + ';')
        ctx(actor, U[2]); existing = row(actor, 'SELECT public.ensure_my_profile()::text;')
        if existing.get('created') is not False or row(control, 'SELECT to_jsonb(p)FROM public.profiles p WHERE user_id=' + q(U[2]) + ';') != old:
            raise AssertionError('EXISTING_PROFILE_CHANGED')
        passed(2, {'allExistingFieldsAndTenantAssociationsPreserved': True})

        awards_before = protected(control)['oldAwards']
        ctx(actor, U[8]); old_award_profile = row(actor, 'SELECT public.ensure_my_profile()::text;')
        again = row(actor, 'SELECT public.ensure_my_profile()::text;')
        if old_award_profile.get('created') is not True or again.get('created') is not False or again.get('id') != old_award_profile.get('id') or protected(control)['oldAwards'] != awards_before:
            raise AssertionError('IDEMPOTENCE_OR_OLD_AWARD_CHANGED')
        passed(3, {'sameIdOnRepeat': True, 'existingFirstStepExact': True})

        ctx(actor, None); actor.error('SELECT public.ensure_my_profile();', '42501', 'SELF_PROFILE_AUTH_REQUIRED')
        ctx(actor, U[1], claim=''); actor.error('SELECT public.ensure_my_profile();', '42501', 'SELF_PROFILE_AUTH_REQUIRED')
        passed(4, {'nullUidAndMissingOrdinaryClaimDenied': True})

        for role in ('anon', 'service_role'):
            ctx(actor, U[1], role=role, claim=role)
            actor.error('SELECT public.ensure_my_profile();', '42501')
        ctx(actor, U[1], claim='service_role'); actor.error('SELECT public.ensure_my_profile();', '42501', 'SELF_PROFILE_AUTH_REQUIRED')
        ctx(actor, U[1]); actor.error('SELECT public.ensure_my_profile(' + q(U[2]) + '::uuid);', '42883')
        actor.error('INSERT INTO public.profiles(user_id)VALUES(' + q(U[1]) + ');', '42501')
        passed(5, {'anonServiceDenied': True, 'zeroArgumentOnly': True, 'directInsertStillDenied': True})

        for number, uid, label in ((6, U[6], 'blocked'), (7, U[7], 'archived')):
            before = row(control, 'SELECT to_jsonb(p)FROM public.profiles p WHERE user_id=' + q(uid) + ';')
            ctx(actor, uid); actor.error('SELECT public.ensure_my_profile();', '42501', 'SELF_PROFILE_ACCOUNT_UNAVAILABLE')
            if row(control, 'SELECT to_jsonb(p)FROM public.profiles p WHERE user_id=' + q(uid) + ';') != before:
                raise AssertionError('DENIED_' + label + '_PROFILE_CHANGED')
            passed(number, {label + 'Preserved': True})

        for uid in (U[3], U[4], U[9]):
            ctx(actor, uid); actor.error('SELECT public.ensure_my_profile();', '42501', 'SELF_PROFILE_AUTH_REQUIRED')
        control.check('NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id IN(' + ','.join(q(U[i]) for i in (3, 4, 9)) + '))')
        passed(8, {'bannedDeletedAndMissingAuthDenied': True})
        ctx(actor, U[5]); actor.error('SELECT public.ensure_my_profile();', '42501', 'SELF_PROFILE_AUTH_REQUIRED')
        control.check('NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=' + q(U[5]) + ')')
        passed(9, {'actualDeletionHelperRevocationDenied': True})

        ctx(actor, U[1])
        for isolation in ('REPEATABLE READ', 'SERIALIZABLE'):
            actor.ok('BEGIN ISOLATION LEVEL ' + isolation + '; SELECT 1;')
            actor.error('SELECT public.ensure_my_profile();', '25000', 'SELF_PROFILE_READ_COMMITTED_REQUIRED')
            actor.rollback()
        passed(10, {'repeatableReadAndSerializableBothRejected': True})

        locker.ok('BEGIN; SELECT id FROM auth.users WHERE id=' + q(U[1]) + 'FOR UPDATE;')
        actor.error('SELECT public.ensure_my_profile();', '40001', 'SELF_PROFILE_CONTEXT_CHANGED_RETRY')
        locker.rollback()
        locker.ok('BEGIN; SELECT id FROM public.profiles WHERE user_id=' + q(U[1]) + 'FOR UPDATE;')
        actor.error('SELECT public.ensure_my_profile();', '40001', 'SELF_PROFILE_CONTEXT_CHANGED_RETRY')
        locker.rollback()
        passed(11, {'AuthAndProfileNowaitContentionDenied': True})

        locker.ok('BEGIN; SELECT pg_advisory_xact_lock(hashtextextended(' + q(U[1]) + '::text,42007));')
        started = time.monotonic()
        actor.error('SELECT public.ensure_my_profile();', '40001', 'SELF_PROFILE_CONTEXT_CHANGED_RETRY')
        elapsed = time.monotonic() - started
        locker.rollback()
        if elapsed >= 8:
            raise AssertionError('ACCOUNT_TRY_FENCE_DID_NOT_RETURN_WITHIN_BOUND')
        if protected(control) != baseline:
            raise AssertionError('AUTH_ROLES_STAFF_OLD_PROFILES_AWARDS_OR_HISTORY_CHANGED')
        control.check('(SELECT count(*)FROM public.profiles)=5 AND (SELECT count(*)FROM public.user_achievements WHERE user_id=' + q(U[1]) + ')=1')
        passed(12, {'externalAccount42007Fence40001': True, 'elapsedMs': round(elapsed * 1000), 'oldProtectedDigestsExact': True})
        if actual != ['PSELF' + str(i).zfill(2) for i in range(1, 13)]:
            raise AssertionError('EXACT_TWELVE_SELF_PROFILE_IDENTITIES_REQUIRED')
        return {'status': 'PASS_NATIVE_SELF_PROFILE12_MINIMAL_NOT_CLOUD_AUTH', 'actualGroups': actual,
                'oldProtectedDigestsExact': True, 'normalJWTVerified': False, 'full14ProfileTriggers': False}
    finally:
        primary_failed = sys.exc_info()[0] is not None
        cleanup_errors = []
        for value in reversed(sessions):
            if not hasattr(value, 'proc'):
                continue
            close_error = None
            forced_cleanup_fallback = False
            try:
                value.close()
            except Exception as error:
                close_error = type(error).__name__
                cleanup_errors.append(str(getattr(value, 'name', 'partial')) + ': ' + repr(error))
            if value.proc.poll() is None:
                forced_cleanup_fallback = True
                try:
                    value.proc.kill()
                    value.proc.wait(timeout=5)
                except Exception as error:
                    close_error = close_error or type(error).__name__
                    cleanup_errors.append(str(getattr(value, 'name', 'partial')) + ': forced cleanup ' + repr(error))
            receipt = {'session': getattr(value, 'name', 'partial'), 'pid': value.proc.pid,
                       'exitCode': value.proc.poll(), 'closeError': close_error, 'forcedCleanupFallback': forced_cleanup_fallback}
            trace({'selfProfileNativeSessionExit': receipt})
            if value.proc.poll() != 0:
                cleanup_errors.append(str(getattr(value, 'name', 'partial')) + ': native exit not zero')
        if cleanup_errors:
            trace({'selfProfileCleanupErrors': cleanup_errors})
            if not primary_failed:
                raise AssertionError('SELF_PROFILE_NATIVE_CLEANUP_FAILED: ' + repr(cleanup_errors))
