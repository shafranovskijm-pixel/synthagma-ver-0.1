"""Source-authored conditional native24 SQL model; not provider/JWT/Storage acceptance.

Uses the unchanged accepted psql Session. No URLs, passwords, server lifecycle,
production mutation or direct insert of publication approvals. All actors/data
are synthetic rows in the dedicated guarded database, not Auth-provider users.
"""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import sys
import threading
import time
import uuid

DATABASE = 'sintagma_copy24_lab_20261028'
OWN = '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'
BUYER = '20000000-0000-0000-0000-000000000001'
OTHER = '20000000-0000-0000-0000-000000000002'
ACTORS = {i: '11000000-0000-0000-0000-' + str(i).zfill(12) for i in range(1, 7)}
ADMIN, MANAGER, WRITER, LEARNER, OUTSIDER, MISSING = [ACTORS[i] for i in range(1, 7)]
NONRFC = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
OLD = '30000000-0000-0000-0000-00000000000e'
PAYLOAD = b'%PDF-1.7\nCOPY24 SYNTHETIC CONTROL 28\n%%EOF\n'
DIGEST = hashlib.sha256(PAYLOAD).hexdigest()

def q(value):
    return "'" + str(value).replace("'", "''") + "'"

def uid():
    return str(uuid.uuid4())

def jrow(s, sql):
    output = s.ok(sql)
    rows = [line for line in output if line.startswith('{')]
    if len(rows) != 1:
        raise AssertionError('COPY24_ONE_JSON_RESULT_REQUIRED: ' + repr(output))
    return json.loads(rows[0])

def ctx(s, actor, role='authenticated', claim=None):
    s.ok('RESET ROLE; SET ROLE ' + role + "; SELECT set_config('request.jwt.claim.sub'," + q(actor or '') + ",false); "
         "SELECT set_config('request.jwt.claim.role'," + q(claim if claim is not None else role) + ',false);')

def protected(s):
    # Exact known old rows, not all client-owned rows: new acquisitions are deliberately separate.
    tables = {
        'oldCourse': "SELECT to_jsonb(x) v FROM public.courses x WHERE id=" + q(OLD),
        'oldModules': 'SELECT to_jsonb(x) v FROM public.course_modules x WHERE course_id=' + q(OLD),
        'oldLessons': 'SELECT to_jsonb(x) v FROM public.lessons x WHERE course_id=' + q(OLD),
        'oldQuestions': 'SELECT to_jsonb(x) v FROM public.test_questions x WHERE lesson_id IN(SELECT id FROM public.lessons WHERE course_id=' + q(OLD) + ')',
        'oldDocuments': 'SELECT to_jsonb(x) v FROM public.course_documents x WHERE course_id=' + q(OLD),
        'oldListings': 'SELECT to_jsonb(x) v FROM public.marketplace_courses x WHERE course_id=' + q(OLD),
        'retained': 'SELECT to_jsonb(x) v FROM public.qa_retained_results x',
        'authSynthetic': 'SELECT to_jsonb(x) v FROM auth.users x',
        'roles': 'SELECT to_jsonb(x) v FROM public.user_roles x',
        'profiles': 'SELECT to_jsonb(x) v FROM public.profiles x',
        'staff': 'SELECT to_jsonb(x) v FROM public.org_staff x',
    }
    values = [q(k) + ",(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(v ORDER BY v::text),'[]')::text,'UTF8')),'hex')FROM(" + sql + ')z)' for k, sql in tables.items()]
    return jrow(s, 'SELECT jsonb_build_object(' + ','.join(values) + ');')

def source(s, files=True, canonical=None, unassigned=False):
    f = {key: uid() for key in ('course', 'module', 'module2', 'lesson', 'lesson2', 'lesson3', 'listing', 'question',
                                'doc', 'hidden', 'libraryDoc', 'attachment', 'library', 'orgdoc', 'version')}
    if canonical:
        f['course'] = canonical
    s.ok('INSERT INTO public.courses(id,organization_id,title,is_published,sequential_lessons,allow_materials_download,landing_content,price)VALUES('
         + q(f['course']) + ',' + q(OWN) + ",'COPY24 OWN SYNTHETIC',true,false,true,'{\"electronic_library\":{\"enabled\":true}}',0);"
         'INSERT INTO public.course_modules(id,course_id,title,order_index)VALUES(' + q(f['module']) + ',' + q(f['course']) + ",'First',0),("
         + q(f['module2']) + ',' + q(f['course']) + ",'Second',1);"
         'INSERT INTO public.lessons(id,course_id,module_id,title,type,content,order_index)VALUES('
         + q(f['lesson']) + ',' + q(f['course']) + ',' + q(f['module']) + ",'First','text','Synthetic inline material',0),("
         + q(f['lesson2']) + ',' + q(f['course']) + ',' + q(f['module']) + ",'Test','test','Synthetic only',1),("
         + q(f['lesson3']) + ',' + q(f['course']) + ',' + q(f['module2']) + ",'Next','text','Synthetic next material',0);"
         'INSERT INTO public.test_questions(lesson_id,question,options,correct_answer,order_index)VALUES('
         + q(f['lesson2']) + ",'Synthetic control?','[\"28\",\"17\"]',0,0);")
    f['refs'] = []
    if canonical:
        for index, audience in enumerate(('learner', 'staff')):
            library, asset, doc = uid(), uid(), uid()
            key = 'library/' + OWN + '/copy24-' + library + '.pdf'
            s.ok('INSERT INTO storage.objects(bucket_id,name,version,metadata)VALUES(\'library-files\',' + q(key) + ",'v1','{}');"
                 'INSERT INTO public.library_documents(id,organization_id,name,storage_path,file_size,source_name,usage_basis,last_checked_at,edition_label,library_status)VALUES('
                 + q(library) + ',' + q(OWN) + ",'COPY24 canonical'," + q(key) + ',' + str(len(PAYLOAD)) + ",'SYNTHETIC','own_material',clock_timestamp()-interval '1 hour','copy24-v1','active');"
                 'INSERT INTO public.paid_umk_20260922_assets(id,source_course_id,library_document_id,audience,sha256,size_bytes)VALUES('
                 + q(asset) + ',' + q(f['course']) + ',' + q(library) + ',' + q(audience) + ',' + q(DIGEST) + ',' + str(len(PAYLOAD)) + ');')
            if not unassigned:
                s.ok('INSERT INTO public.course_documents(id,course_id,name,type,library_document_id,library_category,sort_order,visible_to_students,allow_download)VALUES('
                     + q(doc) + ',' + q(f['course']) + ",'COPY24 canonical','library_resource'," + q(library)
                     + ",'educational_materials'," + str(index) + ',' + ('true' if audience == 'learner' else 'false') + ',true);')
                f['refs'].append(('course_document', doc, None))
            f[audience] = {'library': library, 'asset': asset, 'sourceDoc': doc}
    elif files:
        org_key = OWN + '/versions/' + f['version'] + '/copy24.pdf'
        library_key = 'library/' + OWN + '/copy24-' + f['library'] + '.pdf'
        course_key = f['course'] + '/copy24.pdf'
        object_id = uid()
        s.ok('INSERT INTO storage.objects(id,bucket_id,name,version,metadata)VALUES(' + q(object_id) + ",'org-documents'," + q(org_key)
             + ",'v1','{}'),(gen_random_uuid(),'library-files'," + q(library_key) + ",'v1','{}'),(gen_random_uuid(),'course-files'," + q(course_key) + ",'v1','{}');"
             'INSERT INTO public.org_documents(id,organization_id,name,type)VALUES(' + q(f['orgdoc']) + ',' + q(OWN) + ",'COPY24 org file','other');"
             'INSERT INTO public.org_document_versions(id,document_id,organization_id,version_number,file_path,file_size,storage_object_id)VALUES('
             + q(f['version']) + ',' + q(f['orgdoc']) + ',' + q(OWN) + ',1,' + q(org_key) + ',' + str(len(PAYLOAD)) + ',' + q(object_id) + ');'
             'UPDATE public.org_documents SET current_version_id=' + q(f['version']) + 'WHERE id=' + q(f['orgdoc']) + ';'
             'INSERT INTO public.library_documents(id,organization_id,name,storage_path,file_size,source_name,usage_basis,last_checked_at,edition_label,library_status)VALUES('
             + q(f['library']) + ',' + q(OWN) + ",'COPY24 library'," + q(library_key) + ',' + str(len(PAYLOAD))
             + ",'SYNTHETIC','own_material',clock_timestamp()-interval '1 hour','copy24-v1','active');"
             'INSERT INTO public.course_documents(id,course_id,name,type,file_url,visible_to_students,allow_download)VALUES('
             + q(f['doc']) + ',' + q(f['course']) + ",'COPY24 org PDF','material'," + q('org-documents/' + org_key) + ',true,true),('
             + q(f['hidden']) + ',' + q(f['course']) + ",'COPY24 staff PDF','material'," + q('course-files/' + course_key) + ',false,false);'
             'INSERT INTO public.course_documents(id,course_id,name,type,library_document_id,library_category,module_id,visible_to_students,allow_download)VALUES('
             + q(f['libraryDoc']) + ',' + q(f['course']) + ",'COPY24 linked PDF','library_resource'," + q(f['library'])
             + ",'educational_materials'," + q(f['module']) + ',true,true);'
             'INSERT INTO public.lesson_attachments(id,lesson_id,name,file_url,file_type,file_size,category,order_index)VALUES('
             + q(f['attachment']) + ',' + q(f['lesson']) + ",'COPY24 attachment'," + q('course-files/' + course_key)
             + ",'application/pdf'," + str(len(PAYLOAD)) + ",'materials',0);")
        f['refs'] = [('course_document', f['doc'], f['version']), ('course_document', f['hidden'], None),
                     ('course_document', f['libraryDoc'], None), ('lesson_attachment', f['attachment'], None)]
    s.ok('INSERT INTO public.marketplace_courses(id,course_id,organization_id,is_active,is_validated,price_organization)VALUES('
         + q(f['listing']) + ',' + q(f['course']) + ',' + q(OWN) + ',true,false,0);')
    return f

def library_only_fixture(control):
    f = {key: uid() for key in ('course', 'module', 'lesson', 'library', 'doc', 'hidden', 'plain', 'attachment')}
    control.ok('INSERT INTO public.courses(id,organization_id,title,is_published,sequential_lessons,allow_materials_download,landing_content)VALUES('
               + q(f['course']) + ',' + q(BUYER) + ",'COPY24 CLIENT LIBRARY ONLY',false,true,true," + q(json.dumps({'electronic_library': {'enabled': True}})) + ');'
               'INSERT INTO public.course_modules(id,course_id,title,order_index)VALUES(' + q(f['module']) + ',' + q(f['course']) + ",'Library module',0);"
               'INSERT INTO public.lessons(id,course_id,module_id,title,type,is_locked,order_index)VALUES('
               + q(f['lesson']) + ',' + q(f['course']) + ',' + q(f['module']) + ",'Draft locked lesson','text',true,0);"
               'INSERT INTO public.library_documents(id,organization_id,name,external_url,source_name,usage_basis,last_checked_at,edition_label,library_status)VALUES('
               + q(f['library']) + ',' + q(BUYER) + ",'COPY24 draft linked library','https://example.invalid/copy24-library.pdf','SYNTHETIC','own_material',clock_timestamp()-interval'1 hour','v1','active');"
               'INSERT INTO public.course_documents(id,course_id,name,type,library_document_id,library_category,module_id,visible_to_students,allow_download)VALUES('
               + q(f['doc']) + ',' + q(f['course']) + ",'Visible linked','library_resource'," + q(f['library']) + ",'educational_materials'," + q(f['module']) + ',true,true),('
               + q(f['hidden']) + ',' + q(f['course']) + ",'Hidden linked','library_resource'," + q(f['library']) + ",'educational_materials'," + q(f['module']) + ',false,true);'
               'INSERT INTO public.course_documents(id,course_id,name,file_url,visible_to_students,allow_download)VALUES('
               + q(f['plain']) + ',' + q(f['course']) + ",'Draft plain','https://example.invalid/draft-plain.pdf',true,true);"
               'INSERT INTO public.lesson_attachments(id,lesson_id,name,file_url)VALUES(' + q(f['attachment']) + ',' + q(f['lesson']) + ",'Draft attachment','https://example.invalid/draft-attachment.pdf');"
               'INSERT INTO public.module_access_schedules(module_id,course_id,unlock_at)VALUES(' + q(f['module']) + ',' + q(f['course']) + ",clock_timestamp()+interval'1 day');")
    enroll(control, f['course'])
    return f

def capture(admin, worker, f):
    receipts = []
    for kind, reference, version in f['refs']:
        begun = jrow(admin, 'SELECT public.begin_platform_course_file_capture(' + q(f['listing']) + ',' + q(kind) + ',' + q(reference) + ','
                     + (q(version) if version else 'NULL') + ',' + q(uid()) + ')::text;')
        loaded = jrow(worker, 'SELECT public.load_platform_course_file_capture_worker(' + q(begun['intent_id']) + ',' + q(ADMIN) + ')::text;')
        sealed = jrow(worker, 'SELECT public.finish_platform_course_file_capture_worker(' + ','.join(map(q, [begun['intent_id'], ADMIN, uid(), PAYLOAD.hex(), DIGEST, loaded['enforcement_sha256']])) + ')::text;')
        receipts.append(sealed)
    return receipts

def dossier(admin, receipts):
    checked = jrow(admin, "SELECT jsonb_build_object('at',(clock_timestamp()-interval'1 hour')::text);")['at']
    evidence = [{'reference': 'COPY24 SYNTHETIC ONLY', 'edition': 'copy24-v1', 'checked_at': checked}]
    value = {'schema_version': 1, 'passport': {k: 'Explicit synthetic native fixture' for k in
             ('purpose', 'audience', 'entry_requirements', 'outcomes', 'teaching_plan', 'workload', 'assessment_criteria', 'applicability')}}
    for key in ('source_review', 'subject_keys', 'rights'):
        value[key] = {'state': 'confirmed', 'rationale': 'SYNTHETIC conditional unit prerequisite, no real approval', 'evidence': evidence}
    value['practices'] = {'state': 'not_applicable', 'rationale': 'No practice lesson in this synthetic fixture'}
    value['document_links'] = {'state': 'confirmed', 'rationale': 'Exact synthetic byte receipts', 'evidence': [dict(evidence[0],
        reference_kind=r['reference_kind'], reference_id=r['reference_id'], file_receipt_id=r['receipt_id'],
        captured_edition_id=r['captured_edition_id'], file_bytes_sha256=r['file_bytes_sha256'], source_org_version_id=r['source_org_version_id']) for r in receipts]}
    if not receipts:
        value['document_links'] = {'state': 'not_applicable', 'rationale': 'No assigned file references in this synthetic course'}
    return value

def propose(admin, f, receipts):
    ready = jrow(admin, 'SELECT public.read_platform_course_publication_readiness(' + q(f['listing']) + ')::text;')
    sha = ready['edition_sha256']
    data = jrow(admin, 'SELECT public.submit_platform_course_publication_proposal(' + q(f['listing']) + ',' + q(sha) + ',' + q(json.dumps(dossier(admin, receipts))) + '::jsonb,' + q(uid()) + ')::text;')
    return data['proposal_id'], sha

def publish(admin, f, receipts):
    proposal, sha = propose(admin, f, receipts)
    admin.ok('SELECT public.record_platform_course_publication_review(' + q(f['listing']) + ',' + q(proposal) + ',' + q(sha)
             + ",'accepted_for_template_publication','Explicit SYNTHETIC conditional native model',clock_timestamp()+interval'1 day'," + q(uid()) + ');')
    admin.ok('SELECT public.publish_platform_course_proposal(' + ','.join(map(q, [f['listing'], proposal, sha, uid()])) + ');')

def acquire(manager, f):
    return jrow(manager, 'SELECT public.purchase_marketplace_course(' + q(f['listing']) + ',' + q(BUYER) + ",'organization',1,'COPY24 SYNTHETIC')::text;")

def binding(control, course, source_ref, kind='course_document'):
    return jrow(control, "SELECT jsonb_build_object('reference',reference_id,'binding',id,'generation',copy_generation_id)FROM public.platform_course_copy_file_bindings WHERE course_id="
                + q(course) + 'AND source_reference_id=' + q(source_ref) + 'AND reference_kind=' + q(kind) + ';')

def context(s, course, ref, kind='course_document', mode='learner', purpose='preview'):
    return jrow(s, 'SELECT public.read_course_exact_file_delivery_context(' + ','.join(map(q, [course, kind, ref, mode, purpose])) + ')::text;')

def read_sql(course, b, kind='course_document', mode='learner', purpose='preview'):
    return 'SELECT public.read_copied_course_exact_file(' + ','.join(map(q, [course, kind, b['reference'], mode, purpose, b['binding'], b['generation']])) + ')::text;'

def assert_bytes(s, course, b, kind='course_document', mode='learner', purpose='preview'):
    result = jrow(s, read_sql(course, b, kind, mode, purpose))
    if result.get('mode') != 'frozen_required' or result.get('state') != 'bytes_sealed' or result.get('bytes_hex') != PAYLOAD.hex() or result['binding']['file_bytes_sha256'] != DIGEST:
        raise AssertionError('COPY24_EXACT_BYTE_OR_BINDING_MISMATCH')
    return result

def enroll(control, course):
    return jrow(control, 'INSERT INTO public.enrollments(user_id,course_id,status,expires_at)VALUES(' + q(LEARNER) + ',' + q(course)
                + ",'active',clock_timestamp()+interval'1 day')RETURNING jsonb_build_object('id',id);")['id']

def thread_call(s, sql):
    box = {}
    def run():
        try:
            box['out'] = s.run(sql)
        except Exception as error:
            box['error'] = repr(error)
    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    return thread, box

def wait_blocked(control, writer_pid, reader_pid):
    deadline = time.monotonic() + 4
    while True:
        if control.ok('SELECT ' + str(reader_pid) + '=ANY(pg_blocking_pids(' + str(writer_pid) + '));') == ['t']:
            return
        if time.monotonic() > deadline:
            raise AssertionError('COPY24_EXPECTED_REAL_NATIVE_BLOCKING_NOT_OBSERVED')
        time.sleep(0.02)

def join_ok(thread, box):
    thread.join(timeout=12)
    if thread.is_alive() or 'error' in box or 'out' not in box or box['out'][1]:
        raise AssertionError('COPY24_ASYNC_NATIVE_WRITE_FAILED: ' + repr(box))
    return box['out'][0]

def run_stage(Session, argv, env, trace):
    if os.environ.get('GITHUB_ACTIONS') != 'true' or sys.platform != 'linux':
        raise RuntimeError('COPY24_PRIVATE_LINUX_GITHUB_PG1711_MODEL_ONLY')
    here = Path(__file__).resolve().parent
    sessions, actual, threads = [], [], []
    cap_installed, cap_before, result, control = False, None, None, None
    def session(name):
        obj = Session.__new__(Session)
        sessions.append(obj)
        Session.__init__(obj, argv, env, 'COPY24-' + name, trace)
        obj.check("current_database()='" + DATABASE + "'AND host(inet_server_addr())='127.0.0.1'AND inet_server_port()=5432 "
                  "AND current_setting('server_version_num')='170011'AND current_setting('data_directory')='/var/lib/postgresql/data' "
                  "AND current_setting('pcr.lab_authorized',true)='source-reviewed-root-run-only'")
        return obj
    def passed(number, details):
        name = 'COPY24-' + str(number).zfill(2)
        actual.append(name)
        trace({'case': name, 'status': 'PASS_CONDITIONAL_NATIVE_SQL_MODEL_ONLY', 'details': details})
    def start(s, sql):
        thread, box = thread_call(s, sql)
        threads.append(thread)
        return thread, box
    try:
        control = session('control')
        admin, worker, manager, learner, writer, outsider, missing, nonrfc = [session(n) for n in
            ('admin', 'worker', 'manager', 'learner', 'writer', 'outsider', 'missing-profile', 'non-rfc')]
        ctx(admin, ADMIN); ctx(worker, None, 'service_role'); ctx(manager, MANAGER); ctx(learner, LEARNER)
        ctx(writer, WRITER); ctx(outsider, OUTSIDER); ctx(missing, MISSING); ctx(nonrfc, NONRFC)
        baseline = protected(control)
        control.check('NOT EXISTS(SELECT 1 FROM public.platform_course_copy_file_cohorts)AND NOT EXISTS(SELECT 1 FROM public.platform_course_copy_file_bindings)')
        cap_before = jrow(control, "SELECT jsonb_build_object('definition',pg_get_functiondef(p.oid),'body',p.prosrc,'acl',p.proacl::text,'owner',pg_get_userbyid(p.proowner))FROM pg_proc p WHERE p.oid='public.pcf_v1_delivery_capabilities()'::regprocedure;")
        control.check("public.pcf_v1_delivery_capabilities()->>'frozen_reader_implemented'='false'")
        # Full empty inverse DDL is actually executed but its final COMMIT is replaced by ROLLBACK in this LAB file.
        control.ok((here / 'copy24-empty-inverse-rollback.lab-only.sql').read_text())
        control.check("to_regprocedure('public.read_copied_course_exact_file(uuid,text,uuid,text,text,uuid,uuid)')IS NOT NULL")
        f = source(control)
        first_receipts = capture(admin, worker, f)
        proposal, sha = propose(admin, f, first_receipts)
        admin.error('SELECT public.record_platform_course_publication_review(' + q(f['listing']) + ',' + q(proposal) + ',' + q(sha)
                    + ",'accepted_for_template_publication','SYNTHETIC flag-HOLD test',clock_timestamp()+interval'1 day'," + q(uid()) + ');', '23514', 'PCR_REVIEW_INCOMPLETE')
        control.check('NOT EXISTS(SELECT 1 FROM public.platform_course_publication_review_events WHERE course_id=' + q(f['course']) + "AND event_kind='publication_recorded')")
        original_flag_hold = True
        cap_installed = True  # Request-outcome unknown must still enter exact restoration on every failure.
        trace({'copyCapabilityFixture': 'REQUESTED_OUTCOME_UNKNOWN_PRIVATE_MODEL_ONLY'})
        control.ok((here / 'copy24-conditional-capability.lab-only.sql').read_text())
        trace({'copyCapabilityFixture': 'INSTALLED_NATIVE_SQL_ACK_CONDITIONAL_ONLY'})
        control.check("public.pcf_v1_delivery_capabilities()->>'frozen_reader_implemented'='true'AND public.pcf_v1_delivery_capabilities()->>'frontend_consumers_accepted'='false'AND public.pcf_v1_delivery_capabilities()->>'copied_centre_exact_binding_supported'='false'")
        receipts = capture(admin, worker, f)
        stale_own_mode = jrow(admin, 'SELECT public.read_course_exact_file_delivery_mode(' + q(f['course']) + ",'staff_preview')::text;")
        if stale_own_mode['mode'] != 'legacy' or context(admin, f['course'], f['doc'], mode='staff_preview')['mode'] != 'legacy':
            raise AssertionError('COPY24_PRE_PUBLICATION_OWN_LEGACY_REQUIRED')
        publish(admin, f, receipts)
        # Deliberately retain the old mode result, then make new per-reference requests after publication committed.
        for transition_purpose in ('preview', 'download'):
            own_after_publication = context(admin, f['course'], f['doc'], mode='staff_preview', purpose=transition_purpose)
            if own_after_publication['mode'] != 'frozen_required' or own_after_publication['state'] != 'hold' or own_after_publication['binding'] is not None:
                raise AssertionError('COPY24_CACHED_LEGACY_DOWNGRADE_AFTER_FIRST_PUBLICATION')
        own_after_mode = jrow(admin, 'SELECT public.read_course_exact_file_delivery_mode(' + q(f['course']) + ",'staff_preview')::text;")
        if own_after_mode['mode'] != 'frozen_required' or own_after_mode['state'] != 'held' or own_after_mode['cohort'] is not None:
            raise AssertionError('COPY24_PUBLISHED_OWN_MODE_HOLD_REQUIRED')
        # Prepare the inverse-wins race while stores are still empty. Its pass is reported as group22 later.
        inverse_guard = (here / 'copy24-inverse-guard.exact.sql').read_text()
        control.ok('BEGIN;'); control.ok(inverse_guard)
        writer_pid = int(manager.ok('SELECT pg_backend_pid();')[-1]); inverse_pid = int(control.ok('SELECT pg_backend_pid();')[-1])
        race22, race22_box = start(manager, 'SELECT public.purchase_marketplace_course(' + q(f['listing']) + ',' + q(BUYER) + ",'organization',1,'COPY24 inverse race')::text;")
        try:
            wait_blocked(control, writer_pid, inverse_pid)
            control.check('NOT EXISTS(SELECT 1 FROM public.platform_course_copy_file_cohorts)')
        finally:
            control.rollback()
        acquired_rows = join_ok(race22, race22_box)
        acquired = json.loads([line for line in acquired_rows if line.startswith('{')][0]); course = acquired['course_id']
        enrollment = enroll(control, course)
        b = binding(control, course, f['doc']); a = binding(control, course, f['attachment'], 'lesson_attachment')
        own = assert_bytes(learner, course, b)
        control.check('4=(SELECT count(*)FROM public.platform_course_copy_file_bindings WHERE course_id=' + q(course) + ')AND '
                      '(SELECT reference_count=4 FROM public.platform_course_copy_file_cohorts WHERE course_id=' + q(course) + ')'
                      'AND NOT EXISTS(SELECT 1 FROM public.balance_transactions WHERE related_order_id=' + q(acquired['order_id']) + ')')
        if acquired['price'] != 0 or own['binding']['source_course_id'] != f['course']:
            raise AssertionError('COPY24_FREE_PRICE_OR_SOURCE_BINDING')
        passed(1, {'normalPurchaseAndSettledTrigger': True, 'exactFourReferenceVector': True, 'priceZeroNoCharge': True})

        for suffix in ('e', 'f'):
            legacy = acquire(manager, {'listing': '70000000-0000-0000-0000-00000000000' + suffix})
            doc = jrow(control, 'SELECT jsonb_build_object(\'id\',id)FROM public.course_documents WHERE course_id=' + q(legacy['course_id']) + ';')['id']
            c = context(manager, legacy['course_id'], doc, mode='staff_preview')
            if c['mode'] != 'legacy': raise AssertionError('COPY24_LEGACY_RELABELED')
            control.check('NOT EXISTS(SELECT 1 FROM public.platform_course_copy_file_cohorts WHERE course_id=' + q(legacy['course_id']) + ')')
        draftlib = library_only_fixture(control)
        learner.check('NOT EXISTS(SELECT 1 FROM public.courses WHERE id=' + q(draftlib['course']) + ')')
        learner.check('EXISTS(SELECT 1 FROM public.course_documents WHERE id=' + q(draftlib['doc']) + ')AND NOT EXISTS(SELECT 1 FROM public.course_documents WHERE id=' + q(draftlib['plain']) + ')')
        library_shell = jrow(learner, 'SELECT public.get_course_electronic_library_shell(' + q(draftlib['course']) + ')::text;')
        library_mode = jrow(learner, 'SELECT public.read_course_exact_file_delivery_mode(' + q(draftlib['course']) + ",'learner')::text;")
        if library_shell['library_only'] is not True or library_mode['mode'] != 'legacy' or library_mode['organization_id'] != BUYER or library_mode['actor_id'] != LEARNER:
            raise AssertionError('COPY24_EXISTING_DRAFT_LIBRARY_SHELL_MODE_OR_DERIVED_ORG_DENIED')
        for purpose in ('preview', 'download'):
            if context(learner, draftlib['course'], draftlib['doc'], purpose=purpose)['mode'] != 'legacy':
                raise AssertionError('COPY24_EXISTING_DRAFT_LIBRARY_RESOURCE_DENIED')
        learner.error('SELECT public.read_course_exact_file_delivery_context(' + ','.join(map(q, [draftlib['course'], 'course_document', draftlib['plain'], 'learner', 'preview'])) + ');', '42501')
        learner.error('SELECT public.read_course_exact_file_delivery_context(' + ','.join(map(q, [draftlib['course'], 'course_document', draftlib['hidden'], 'learner', 'preview'])) + ');', '42501')
        learner.error('SELECT public.read_course_exact_file_delivery_context(' + ','.join(map(q, [draftlib['course'], 'lesson_attachment', draftlib['attachment'], 'learner', 'preview'])) + ');', '42501')
        outsider.error('SELECT public.read_course_exact_file_delivery_mode(' + q(draftlib['course']) + ",'learner');", '42501')
        control.ok("UPDATE public.library_documents SET library_status='archive'WHERE id=" + q(draftlib['library']) + ';')
        try: learner.error('SELECT public.read_course_exact_file_delivery_context(' + ','.join(map(q, [draftlib['course'], 'course_document', draftlib['doc'], 'learner', 'preview'])) + ');', '42501')
        finally: control.ok("UPDATE public.library_documents SET library_status='active'WHERE id=" + q(draftlib['library']) + ';')
        control.ok("UPDATE public.courses SET landing_content='{}'WHERE id=" + q(draftlib['course']) + ';')
        try: learner.error('SELECT public.read_course_exact_file_delivery_mode(' + q(draftlib['course']) + ",'learner');", '42501')
        finally: control.ok('UPDATE public.courses SET landing_content=' + q(json.dumps({'electronic_library': {'enabled': True}})) + '::jsonb WHERE id=' + q(draftlib['course']) + ';')
        passed(2, {'oldClientAndPrePCRBranches': True, 'noCohortBackfill': True, 'existingUnpublishedLibraryOnlyRights': True,
                   'ordinaryCoursesRLSHidesDraftButLibraryDocumentRLSAllowsLinked': True, 'serverDerivedOrganizationWithoutProfileGuess': True,
                   'draftPlainHiddenAttachmentArchivedDisabledOtherTenantDenied': True})

        added = uid()
        manager.ok('INSERT INTO public.course_documents(id,course_id,name,file_url)VALUES(' + q(added) + ',' + q(course) + ",'New unbound','https://example.invalid/new.pdf');")
        if context(learner, course, added)['state'] != 'hold': raise AssertionError('COPY24_MISSING_BINDING_DOWNGRADE')
        manager.ok('DELETE FROM public.course_documents WHERE id=' + q(added) + ';')
        zero = source(control, files=False); publish(admin, zero, []); zcopy = acquire(manager, zero)
        mode = jrow(manager, 'SELECT public.read_course_exact_file_delivery_mode(' + q(zcopy['course_id']) + ",'staff_preview')::text;")
        if mode['mode'] != 'frozen_required' or mode['state'] != 'held' or mode['cohort']['reference_count'] != 0:
            raise AssertionError('COPY24_ZERO_REFERENCE_COURSE_NOT_FROZEN')
        passed(3, {'missingBindingHeld': True, 'zeroReferenceAuthoritativeCourseMode': True})

        orders_before = control.ok('SELECT count(*)FROM public.marketplace_orders;')
        control.ok('BEGIN; SELECT public.pcr_v2_lock(ARRAY[' + q(f['course']) + "::uuid],'exclusive','own-edition');")
        manager.error('SELECT public.purchase_marketplace_course(' + q(f['listing']) + ',' + q(BUYER) + ');', '40001')
        control.rollback()
        if control.ok('SELECT count(*)FROM public.marketplace_orders;') != orders_before: raise AssertionError('COPY24_FAILED_SOURCE_CONTENTION_LEFT_ORDER')
        passed(4, {'sourceTryFence': True, 'newOrderRollback': True})

        manager.ok('BEGIN ISOLATION LEVEL REPEATABLE READ;')
        manager.error('SELECT public.purchase_marketplace_course(' + q(f['listing']) + ',' + q(BUYER) + ');', '25000', 'PCC_READ_COMMITTED_REQUIRED'); manager.rollback()
        manager.ok('BEGIN ISOLATION LEVEL REPEATABLE READ;')
        acquire(manager, {'listing': '70000000-0000-0000-0000-00000000000e'}); manager.rollback()
        passed(5, {'newFrozenRejectsRR': True, 'clientLegacyNotGloballyForcedToRC': True})

        outsider.error(read_sql(course, b), '42501', 'PCC_REFERENCE_UNAVAILABLE')
        passed(6, {'otherTenantDeniedBeforeBytes': True})
        assert_bytes(nonrfc, course, b, mode='staff_preview')
        passed(7, {'canonicalNonRFCPostgresActorAccepted': True})

        missing.error(read_sql(course, b, mode='staff_preview'), '42501', 'PCC_CURRENT_ACCOUNT_REQUIRED')
        for relation, mutation, restore in (
            ('profiles', 'blocked_at=clock_timestamp()', 'blocked_at=NULL'), ('profiles', 'archived_at=clock_timestamp()', 'archived_at=NULL'),
            ('auth.users', "banned_until=clock_timestamp()+interval'1 day'", 'banned_until=NULL'), ('auth.users', 'deleted_at=clock_timestamp()', 'deleted_at=NULL')):
            table = relation if '.' in relation else 'public.' + relation
            key = 'id' if relation == 'auth.users' else 'user_id'
            control.ok('UPDATE ' + table + ' SET ' + mutation + ' WHERE ' + key + '=' + q(LEARNER) + ';')
            try: learner.error(read_sql(course, b), '42501', 'PCC_CURRENT_ACCOUNT_REQUIRED')
            finally: control.ok('UPDATE ' + table + ' SET ' + restore + ' WHERE ' + key + '=' + q(LEARNER) + ';')
        control.ok('INSERT INTO public.account_deletion_revocations VALUES(' + q(LEARNER) + ');')
        try: learner.error(read_sql(course, b), '42501', 'PCC_CURRENT_ACCOUNT_REQUIRED')
        finally: control.ok('DELETE FROM public.account_deletion_revocations WHERE user_id=' + q(LEARNER) + ';')
        control.ok('UPDATE public.profiles SET blocked_at=clock_timestamp()WHERE user_id=' + q(ADMIN) + ';')
        try: admin.error(read_sql(course, b, mode='staff_preview'), '42501', 'PCC_CURRENT_ACCOUNT_REQUIRED')
        finally: control.ok('UPDATE public.profiles SET blocked_at=NULL WHERE user_id=' + q(ADMIN) + ';')
        passed(8, {'missingBlockedArchivedBannedDeletedRevokedDenied': True, 'positiveAdminRoleDoesNotBypassBlockedProfile': True})

        control.ok('UPDATE public.enrollments SET expires_at=clock_timestamp()-interval\'1 day\'WHERE id=' + q(enrollment) + ';')
        learner.error(read_sql(course, b), '42501', 'PCC_REFERENCE_UNAVAILABLE')
        control.ok("UPDATE public.enrollments SET status='completed'WHERE id=" + q(enrollment) + ';'); assert_bytes(learner, course, b)
        control.ok('INSERT INTO public.uc_enrollment_withdrawal_states(enrollment_id)VALUES(' + q(enrollment) + ');')
        try: learner.error(read_sql(course, b), '42501', 'PCC_REFERENCE_UNAVAILABLE')
        finally:
            control.ok('DELETE FROM public.uc_enrollment_withdrawal_states WHERE enrollment_id=' + q(enrollment) + ';'
                       "UPDATE public.enrollments SET status='active',expires_at=clock_timestamp()+interval'1 day'WHERE id=" + q(enrollment) + ';')
        passed(9, {'activeExpiredDenied': True, 'completedExpiredPreserved': True, 'withdrawalDenied': True, 'billingOrSGTNotClaimed': True})

        lesson = jrow(control, 'SELECT jsonb_build_object(\'id\',lesson_id)FROM public.lesson_attachments WHERE id=' + q(a['reference']) + ';')['id']
        module = jrow(control, 'SELECT jsonb_build_object(\'id\',module_id)FROM public.lessons WHERE id=' + q(lesson) + ';')['id']
        control.ok('UPDATE public.lessons SET is_locked=true WHERE id=' + q(lesson) + ';')
        try: learner.error(read_sql(course, a, 'lesson_attachment'), '42501')
        finally: control.ok('UPDATE public.lessons SET is_locked=false WHERE id=' + q(lesson) + ';')
        schedule = uid(); control.ok('INSERT INTO public.module_access_schedules(id,module_id,course_id,unlock_at)VALUES(' + q(schedule) + ',' + q(module) + ',' + q(course) + ",clock_timestamp()+interval'1 day');")
        learner.error(read_sql(course, a, 'lesson_attachment'), '42501')
        control.ok('INSERT INTO public.module_access_overrides(module_id,user_id,unlock_at)VALUES(' + q(module) + ',' + q(LEARNER) + ',NULL);')
        assert_bytes(learner, course, a, 'lesson_attachment')
        control.ok('DELETE FROM public.module_access_overrides WHERE module_id=' + q(module) + 'AND user_id=' + q(LEARNER) + ';DELETE FROM public.module_access_schedules WHERE id=' + q(schedule) + ';')
        control.ok('UPDATE public.courses SET sequential_lessons=true WHERE id=' + q(course) + ';')
        next_lesson = jrow(control, 'SELECT jsonb_build_object(\'id\',id)FROM public.lessons WHERE course_id=' + q(course) + 'AND module_id=' + q(module) + 'AND id<>' + q(lesson) + ';')['id']
        # This additional private SQL component checks the same rule without claiming an ordinary helper grant.
        control.check('NOT public.pcc_v1_learner_lesson_ready(' + q(course) + ',' + q(next_lesson) + ',' + q(LEARNER) + ')')
        control.ok('INSERT INTO public.lesson_progress(user_id,lesson_id,completed)VALUES(' + q(LEARNER) + ',' + q(lesson) + ',true);')
        control.check('public.pcc_v1_learner_lesson_ready(' + q(course) + ',' + q(next_lesson) + ',' + q(LEARNER) + ')')
        control.ok('UPDATE public.lessons SET order_index=0 WHERE id=' + q(next_lesson) + ';')
        control.check('NOT public.pcc_v1_learner_lesson_ready(' + q(course) + ',' + q(next_lesson) + ',' + q(LEARNER) + ')')
        control.ok('UPDATE public.lessons SET order_index=1 WHERE id=' + q(next_lesson) + ';UPDATE public.courses SET sequential_lessons=false WHERE id=' + q(course) + ';')
        passed(10, {'lockedScheduledNullOverrideAndSequentialRules': True, 'tiedOrderHeld': True, 'broaderProgressConcurrencyOpen': True})

        paid = source(control, canonical='8ae9739f-e87b-5397-94a5-86bfe99b0d77'); paid_receipts = capture(admin, worker, paid); publish(admin, paid, paid_receipts)
        pc = acquire(manager, paid); enroll(control, pc['course_id'])
        pb = binding(control, pc['course_id'], paid['learner']['sourceDoc']); staff = binding(control, pc['course_id'], paid['staff']['sourceDoc'])
        assert_bytes(learner, pc['course_id'], pb); learner.error(read_sql(pc['course_id'], staff), '42501')
        control.ok('UPDATE public.paid_umk_20260922_grants SET revoked_at=clock_timestamp()WHERE buyer_course_id=' + q(pc['course_id']) + 'AND asset_id=' + q(paid['learner']['asset']) + ';')
        learner.error(read_sql(pc['course_id'], pb), '42501')
        control.ok('UPDATE public.paid_umk_20260922_grants SET revoked_at=NULL WHERE buyer_course_id=' + q(pc['course_id']) + 'AND asset_id=' + q(paid['learner']['asset']) + ';')
        control.ok('UPDATE public.paid_umk_20260922_assets SET enabled=false WHERE id=' + q(paid['learner']['asset']) + ';')
        learner.error(read_sql(pc['course_id'], pb), '42501')
        control.ok('UPDATE public.paid_umk_20260922_assets SET enabled=true WHERE id=' + q(paid['learner']['asset']) + ';')
        control.ok('UPDATE public.courses SET is_published=false WHERE id=' + q(pc['course_id']) + ';')
        try:
            learner.error(read_sql(pc['course_id'], pb), '42501')
            learner.error('SELECT public.read_course_exact_file_delivery_mode(' + q(pc['course_id']) + ",'learner');", '42501')
        finally: control.ok('UPDATE public.courses SET is_published=true WHERE id=' + q(pc['course_id']) + ';')
        passed(11, {'zeroPriceCanonicalGrantFlow': True, 'staffAudienceAndRevocationAndDisabledAssetDenied': True, 'grantInsertConcurrencyOpen': True,
                    'draftLibraryExceptionDoesNotBypassRestrictiveCanonicalUMK': True})

        hidden = binding(control, course, f['hidden']); learner.error(read_sql(course, hidden), '42501')
        preview = assert_bytes(manager, course, hidden, mode='staff_preview')
        if preview['binding']['allow_download'] is not False: raise AssertionError('COPY24_SOURCE_FALSE_DOWNLOAD_LOST')
        manager.error(read_sql(course, hidden, mode='staff_preview', purpose='download'), '42501', 'PCC_DOWNLOAD_UNAVAILABLE')
        control.ok('UPDATE public.courses SET allow_materials_download=false WHERE id=' + q(course) + ';')
        assert_bytes(learner, course, b); learner.error(read_sql(course, b, purpose='download'), '42501', 'PCC_DOWNLOAD_UNAVAILABLE')
        control.ok('UPDATE public.courses SET allow_materials_download=true WHERE id=' + q(course) + ';')
        passed(12, {'sourceFalseFlagsPreserved': True, 'previewSeparateFromDownload': True})

        unassigned = source(control, canonical='26e65ccb-609f-5b3d-b59a-f280c9feae5b', unassigned=True); publish(admin, unassigned, [])
        count_before = control.ok('SELECT count(*)FROM public.marketplace_orders;')
        manager.error('SELECT public.purchase_marketplace_course(' + q(unassigned['listing']) + ',' + q(BUYER) + ');', '23514', 'PCC_UNCOVERED_OR_AMBIGUOUS_UMK_SOURCE_HOLD')
        if control.ok('SELECT count(*)FROM public.marketplace_orders;') != count_before: raise AssertionError('COPY24_UNASSIGNED_ASSET_LEFT_PARTIAL_ORDER')
        passed(13, {'triggerRunsBeforeSeal': True, 'unassignedSourceHoldAtomicRollback': True})

        manager.ok('UPDATE public.lesson_attachments SET name=\'Changed target\'WHERE id=' + q(a['reference']) + ';')
        if context(learner, course, a['reference'], 'lesson_attachment')['state'] != 'hold': raise AssertionError('COPY24_TARGET_EDIT_NOT_HELD')
        manager.ok('UPDATE public.lesson_attachments SET name=\'COPY24 attachment\'WHERE id=' + q(a['reference']) + ';')
        assert_bytes(learner, course, a, 'lesson_attachment')
        passed(14, {'targetMetadataEditHoldsInsteadOfLiveFallback': True})

        control.ok("UPDATE storage.objects SET version='overwritten',metadata='{\"synthetic\":\"other\"}'WHERE bucket_id='org-documents'AND name LIKE " + q(OWN + '/versions/' + f['version'] + '/%') + ';')
        assert_bytes(learner, course, b)
        control.ok('UPDATE public.org_documents SET deleted_at=clock_timestamp()WHERE id=' + q(f['orgdoc']) + ';')
        learner.error(read_sql(course, b), '42501')
        control.ok('UPDATE public.org_documents SET deleted_at=NULL WHERE id=' + q(f['orgdoc']) + ';')
        assert_bytes(learner, course, b)
        passed(15, {'storageOverwriteCannotSubstituteBytea': True, 'declaredOrgVersionDeletionHolds': True, 'sourceRightsConcurrencyOpen': True})

        for field in ('binding', 'generation'):
            wrong = dict(b); wrong[field] = uid(); learner.error(read_sql(course, wrong), '42501', 'PCC_FROZEN_FILE_HOLD')
        outsider.error(read_sql(course, b), '42501')
        passed(16, {'wrongBindingGenerationAndActorCannotSelectBytes': True})

        for role, actor in (('authenticated', LEARNER), ('service_role', None)):
            ctx(outsider, actor, role)
            outsider.error('SELECT * FROM public.platform_course_copy_file_cohorts;', '42501')
            outsider.error('SELECT public.pcc_v1_actor();', '42501')
        ctx(outsider, OUTSIDER)
        control.error('UPDATE public.platform_course_copy_file_bindings SET target_row_sha256=repeat(\'f\',64)WHERE id=' + q(b['binding']) + ';', '55000', 'PCC_APPEND_ONLY_COPY_HISTORY')
        control.error('DELETE FROM public.platform_course_copy_file_bindings WHERE id=' + q(b['binding']) + ';', '55000', 'PCC_APPEND_ONLY_COPY_HISTORY')
        control.error('TRUNCATE public.platform_course_copy_file_bindings,public.platform_course_copy_file_cohorts;', '55000', 'PCC_APPEND_ONLY_COPY_HISTORY')
        passed(17, {'privateACLAndAppendOnlyHistory': True})

        control.ok('BEGIN;')
        # Change only the first preflight helper inside a rollback-only test transaction; no permanent replacement.
        control.ok('CREATE OR REPLACE FUNCTION public.account_deletion_access_allowed()RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $x$SELECT false$x$;')
        control.error((here / 'copy24-current23-preimage-component.exact.lab-only.sql').read_text(), 'P0001', 'PCC_CURRENT_COPY_OR_ACCESS_PREIMAGE_DRIFT')
        control.rollback()
        control.ok('BEGIN;'); control.error(inverse_guard, 'P0001', 'PCC_RECORDED_COPY_HISTORY_FORWARD_REPAIR_REQUIRED'); control.rollback()
        assert_bytes(learner, course, b)
        passed(18, {'currentHelperPreimageComponentRejectsDrift': True, 'nonemptyInverseRefusesErasure': True, 'emptyInverseRollbackDDLExercised': True})

        if protected(control) != baseline: raise AssertionError('COPY24_OLD_DATA_AUTH_ROLE_OR_PROFILE_CHANGED')
        passed(19, {'oldSyntheticClientCourseBankAndResultsExact': True, 'authRolesProfilesExact': True, 'fullProductionHistoryNotClaimed': True})
        if not original_flag_hold: raise AssertionError('COPY24_ORIGINAL_FLAG_HOLD_NOT_EXERCISED')
        passed(20, {'originalCapabilityDeniedPublication': True, 'conditionalSingleFlagOnly': True, 'frontendAndCopiedCentreAcceptanceRemainFalse': True, 'modeBeforeFirstPublicationThenFreshReferenceHeld': True})

        ctx(writer, WRITER); writer.ok('BEGIN;'); extra = acquire(writer, zero)
        control.ok('BEGIN;'); control.error(inverse_guard, '40001', 'PCC_COPY_HISTORY_BUSY_FORWARD_REPAIR_REQUIRED'); control.rollback()
        writer.ok('COMMIT;')
        control.check('EXISTS(SELECT 1 FROM public.platform_course_copy_file_cohorts WHERE course_id=' + q(extra['course_id']) + ')')
        passed(21, {'inverseWriterWinsNowaitBeforeEmpty': True, 'committedNewHistoryRetained': True})
        passed(22, {'exactEmptyInverseDDLWithTerminalRollback': True, 'inversePrefixBlocksConcurrentFirstInsert': True, 'rollbackLetsWriterCommit': True})

        target_lesson = lesson
        for mutation, restore in (
            ('UPDATE public.course_documents SET visible_to_students=false WHERE id=' + q(b['reference']) + ';', 'UPDATE public.course_documents SET visible_to_students=true WHERE id=' + q(b['reference']) + ';'),
            ('UPDATE public.lesson_attachments SET name=\'writer pending\'WHERE id=' + q(a['reference']) + ';', 'UPDATE public.lesson_attachments SET name=\'COPY24 attachment\'WHERE id=' + q(a['reference']) + ';'),
            ('UPDATE public.lessons SET is_locked=true WHERE id=' + q(target_lesson) + ';', 'UPDATE public.lessons SET is_locked=false WHERE id=' + q(target_lesson) + ';')):
            writer.ok('BEGIN;'); writer.ok(mutation)
            learner.error(read_sql(course, b if 'course_documents' in mutation else a, 'course_document' if 'course_documents' in mutation else 'lesson_attachment'), '40001', 'PCC_CONTEXT_CHANGED_RETRY')
            writer.rollback()
            # The rollback itself restores all original target metadata; no historical binding is rewritten.
        passed(23, {'documentAttachmentAndCurrentLessonWriterWinsNowait': True})

        reader_pid = int(learner.ok('SELECT pg_backend_pid();')[-1]); writer_pid = int(writer.ok('SELECT pg_backend_pid();')[-1])
        learner.ok('BEGIN;'); context(learner, course, b['reference'])
        thread, box = start(writer, 'BEGIN;UPDATE public.course_documents SET visible_to_students=false WHERE id=' + q(b['reference']) + ';COMMIT;')
        try:
            wait_blocked(control, writer_pid, reader_pid); assert_bytes(learner, course, b)
        finally: learner.ok('COMMIT;')
        join_ok(thread, box); learner.error(read_sql(course, b), '42501')
        writer.ok('UPDATE public.course_documents SET visible_to_students=true WHERE id=' + q(b['reference']) + ';')
        # Missing schedule INSERT participates through the selected module's actual immediate FK KEY SHARE.
        learner.ok('BEGIN;'); context(learner, course, a['reference'], 'lesson_attachment')
        schedule = uid()
        thread, box = start(writer, 'BEGIN;INSERT INTO public.module_access_schedules(id,module_id,course_id,unlock_at)VALUES('
                                  + q(schedule) + ',' + q(module) + ',' + q(course) + ",clock_timestamp()+interval'1 day');COMMIT;")
        try:
            wait_blocked(control, writer_pid, reader_pid); assert_bytes(learner, course, a, 'lesson_attachment')
        finally: learner.ok('COMMIT;')
        join_ok(thread, box); learner.error(read_sql(course, a, 'lesson_attachment'), '42501')
        writer.ok('DELETE FROM public.module_access_schedules WHERE id=' + q(schedule) + ';')
        passed(24, {'readerWinsTargetUpdate': True, 'selectedModuleImmediateFKBlocksMissingScheduleInsert': True, 'freshReadSeesRevocation': True})
        if actual != ['COPY24-' + str(i).zfill(2) for i in range(1, 25)]: raise AssertionError('COPY24_EXACT_TWENTY_FOUR_GROUP_IDENTITIES_REQUIRED')
        if protected(control) != baseline: raise AssertionError('COPY24_FINAL_PROTECTED_DATA_DRIFT')
        result = {'status': 'PASS_CONDITIONAL_NATIVE_COPY24_MODELED_NOT_AUTH_STORAGE', 'actualGroups': actual,
                  'protectedOldSyntheticRowsExact': True, 'capabilityOriginalRestored': False, 'fullProductionSchema': False,
                  'normalJWTVerified': False, 'realStorageHTTPBytes': False, 'capabilityFixtureConditionalOnly': True,
                  'openConcurrencyGaps': ['enrollment/withdrawal/progress', 'canonical UMK asset/grant', 'source library/org-version rights'],
                  'fullPROG012Accepted': False, 'productionRelease': False}
        return result
    finally:
        primary = sys.exc_info()[0] is not None
        cleanup_errors = []
        for thread in threads:
            thread.join(timeout=1)
            if thread.is_alive(): cleanup_errors.append({'stage': 'nativeThreadJoin', 'error': 'Still running at cleanup; native close/exit must fail closed'})
        if cap_installed and control is not None:
            try:
                control.rollback(); control.ok((here / 'copy24-exact-capability-restore.sql').read_text())
                restored = jrow(control, "SELECT jsonb_build_object('definition',pg_get_functiondef(p.oid),'body',p.prosrc,'acl',p.proacl::text,'owner',pg_get_userbyid(p.proowner))FROM pg_proc p WHERE p.oid='public.pcf_v1_delivery_capabilities()'::regprocedure;")
                if restored != cap_before: raise AssertionError('COPY24_CAPABILITY_EXACT_RESTORE_DRIFT')
                if result is not None: result['capabilityOriginalRestored'] = True
                trace({'copyCapabilityRestore': {'exactDefinitionOwnerACL': True, 'productionFlagsChanged': False}})
            except Exception as error:
                cleanup_errors.append({'stage': 'capabilityRestore', 'error': repr(error)})
                trace({'copyCapabilityRestoreFailure': repr(error)})
        for value in reversed(sessions):
            if not hasattr(value, 'proc'): continue
            close_error = None
            try: value.close()
            except Exception as error: close_error = repr(error)
            forced = value.proc.poll() is None
            if forced:
                try: value.proc.kill(); value.proc.wait(timeout=5)
                except Exception as error: close_error = close_error or repr(error)
                close_error = close_error or 'FORCED_CLEANUP'
            receipt = {'session': value.name, 'pid': value.proc.pid, 'exitCode': value.proc.poll(), 'closeError': close_error,
                       'forcedCleanupFallback': forced}
            trace({'copyNativeSessionExit': receipt})
            if receipt['exitCode'] != 0 or close_error: cleanup_errors.append(receipt)
        if cleanup_errors:
            trace({'copyCleanupFailures': cleanup_errors, 'primaryFailurePreserved': primary})
            if not primary: raise AssertionError('COPY24_CLEANUP_OR_NATURAL_EXIT_FAILURE')
