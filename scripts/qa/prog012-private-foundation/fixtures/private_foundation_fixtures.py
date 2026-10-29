"""Private DB synthetic fixtures; never provider Auth or production objects.

The helper calls use OWNER SQL with explicitly MODELED claim values only because
PFD helpers remain owner-only. This is not public-RPC or genuine Auth acceptance.
No accepted run_stage/run_cases function is invoked.
"""
DATABASE = 'sintagma_pfd_foundation_lab_20261029'
OWN = '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'
BUYER = '20000000-0000-0000-0000-000000000001'
ACTORS = {
    'learner': '12000000-0000-0000-0000-000000000101',
    'foreign': '12000000-0000-0000-0000-000000000102',
    'staff': '12000000-0000-0000-0000-000000000103',
}


def source(control, base):
    value = base.source(control, files=False)
    control.ok('UPDATE public.marketplace_courses SET is_active=false WHERE id=' + base.q(value['listing']) + ';')
    modeled = base.jrow(control, "SELECT jsonb_build_object('present',EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.courses'::regclass AND attname='hidden_from_catalog'AND NOT attisdropped));")['present']
    if modeled:
        control.ok('UPDATE public.courses SET hidden_from_catalog=true WHERE id=' + base.q(value['course']) + ';')
    value['hidden_from_catalog_modeled'] = modeled
    control.check('NOT EXISTS(SELECT 1 FROM public.platform_course_publication_review_events WHERE course_id=' + base.q(value['course']) + " AND event_kind='publication_recorded')")
    control.check('NOT EXISTS(SELECT 1 FROM public.platform_course_copy_file_cohorts WHERE course_id=' + base.q(value['course']) + ')')
    control.check('EXISTS(SELECT 1 FROM public.courses c JOIN public.marketplace_courses m ON m.course_id=c.id WHERE c.id=' + base.q(value['course']) + " AND c.organization_id='4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid AND c.is_published IS TRUE AND m.id=" + base.q(value['listing']) + ' AND m.is_active IS FALSE)')
    value['publication_events_absent'] = True
    return value


def seed(control, base):
    control.check("current_database()='" + DATABASE + "'AND current_user='postgres'AND auth.uid()IS NULL AND auth.role()IS NULL")
    for key, organization, role in [('learner', OWN, 'student'), ('foreign', BUYER, 'student'), ('staff', OWN, 'admin')]:
        actor = ACTORS[key]
        control.check('NOT EXISTS(SELECT 1 FROM auth.users WHERE id=' + base.q(actor) + ')')
        control.ok('INSERT INTO auth.users(id)VALUES(' + base.q(actor) + ');'
                   'INSERT INTO public.profiles(user_id,organization_id)VALUES(' + base.q(actor) + ',' + base.q(organization) + ');'
                   'INSERT INTO public.user_roles(user_id,role)VALUES(' + base.q(actor) + ',' + base.q(role) + ');')
    return {**ACTORS, 'course': source(control, base)}


def subject(session, actor, base, claim='authenticated'):
    # SQL owner calling a private component. No authenticated EXECUTE is granted.
    base.ctx(session, actor, role='postgres', claim=claim)
    session.check("current_user='postgres'AND auth.role()=" + base.q(claim)
                  + 'AND auth.uid()IS NOT DISTINCT FROM ' + (base.q(actor) + '::uuid' if actor else 'NULL::uuid'))


def fence_sql(course, base, mode='learner', exclusive=False):
    return ('SELECT public.pfd_v2_own_source_fence(' + base.q(course) + ',' + base.q(mode) + ','
            + ('true' if exclusive else 'false') + ');')


def enroll(control, actor, course, base):
    return base.jrow(control, 'INSERT INTO public.enrollments(user_id,course_id,status,expires_at)VALUES('
                     + base.q(actor) + ',' + base.q(course)
                     + ",'active',clock_timestamp()+interval'1 day')RETURNING jsonb_build_object('id',id);")['id']


def progress(control, actor, lesson, base, completed=True):
    return base.jrow(control, 'INSERT INTO public.lesson_progress(user_id,lesson_id,completed,completed_at)VALUES('
                     + base.q(actor) + ',' + base.q(lesson) + ',' + ('true' if completed else 'false') + ','
                     + ('clock_timestamp()' if completed else 'NULL')
                     + ')RETURNING jsonb_build_object(\'id\',id);')['id']


def withdraw_sql(enrollment, course, recorded_by, base):
    return ('INSERT INTO public.uc_enrollment_withdrawal_states(enrollment_id,organization_id,user_id,course_id,revision,effective_date,basis,technical_snapshot,recorded_by,redacted) '
            'SELECT e.id,c.organization_id,e.user_id,e.course_id,1,current_date,'
            "jsonb_build_object('kind','synthetic_native_component','source','PFD03'),"
            'to_jsonb(e),' + base.q(recorded_by) + '::uuid,false FROM public.enrollments e JOIN public.courses c ON c.id=e.course_id '
            'WHERE e.id=' + base.q(enrollment) + ' AND e.course_id=' + base.q(course) + ';')
