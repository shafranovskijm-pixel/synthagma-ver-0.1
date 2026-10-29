"""Exactly TWO new current-file review metadata components; no old suite or cap override.
Synthetic SQL model only. No review acceptance/publication, JWT provider or HTTP Storage.
"""
import json
from pathlib import Path
import re
import sys

DATABASE = 'sintagma_pcf_current_context_lab_20261029'
EXPECTED = ['CFM01', 'CFM02']
PROOF_KEYS = {'schema_version','actor_id','organization_id','marketplace_id','course_id','proposal_id',
              'proposal_edition_sha256','current_edition_sha256','scope_generation','state','reference_count','references'}
REF_KEYS = {'reference_kind','reference_id','state','receipt'}
RECEIPT_KEYS = {'receipt_id','captured_edition_id','source_org_version_id','file_bytes_sha256','byte_length'}
CAP_KEYS = ('frozen_reader_implemented','frontend_consumers_accepted','copied_centre_exact_binding_supported')
UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)


def run_cases(Session, argv, env, trace, fixture, input_dir):
    sessions, groups = [], []
    control = None

    def session(name):
        value = Session.__new__(Session)
        sessions.append(value)
        Session.__init__(value, argv, env, 'CFM-' + name, trace)
        value.check("current_database()='" + DATABASE + "'AND host(inet_server_addr())='127.0.0.1'AND inet_server_port()=5432 "
                    "AND current_setting('server_version_num')='170011'AND current_setting('data_directory')='/var/lib/postgresql/data' "
                    "AND current_setting('pcr.lab_authorized',true)='source-reviewed-root-run-only' "
                    "AND current_setting('transaction_isolation')='read committed'AND current_setting('session_replication_role')='origin'")
        return value

    def cap_descriptor():
        return fixture.jrow(control,"SELECT jsonb_build_object('values',public.pcf_v1_delivery_capabilities(),"
            "'definition',pg_get_functiondef(p.oid),'body',p.prosrc,'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text)"
            "FROM pg_proc p WHERE p.oid='public.pcf_v1_delivery_capabilities()'::regprocedure;")

    def sql_context(f, proposal=None, edition=None):
        return 'SELECT public.read_platform_course_publication_review_context(' + fixture.q(f['listing']) + ',' \
            + (fixture.q(proposal) if proposal else 'NULL') + ',' + (fixture.q(edition) if edition else 'NULL') + ',NULL,NULL)::text;'

    def context(admin, f, proposal=None, edition=None):
        return fixture.jrow(admin, sql_context(f, proposal, edition))

    def metadata(admin, f, proposal, edition, kind, reference):
        return fixture.jrow(admin,'SELECT public.read_platform_course_proposal_file_context('
            + ','.join(map(fixture.q,[f['listing'],proposal,edition,kind,reference])) + ')::text;')

    def exact_context(row, f, proposal, edition):
        required = {'schema_version':1,'actor_id':fixture.ADMIN,'organization_id':fixture.OWN,
                    'marketplace_id':f['listing'],'course_id':f['course'],'current_edition_sha256':edition}
        if any(row.get(k)!=v for k,v in required.items()) or row['proposal']['id']!=proposal:
            raise AssertionError('CFM_EXACT_OUTER_CONTEXT_REQUIRED')

    def assert_current(admin, f, proposal, edition, receipts):
        row = context(admin,f,proposal,edition)
        exact_context(row,f,proposal,edition)
        proof = row.get('current_file_context')
        required = {'schema_version':1,'actor_id':fixture.ADMIN,'organization_id':fixture.OWN,
                    'marketplace_id':f['listing'],'course_id':f['course'],'proposal_id':proposal,
                    'proposal_edition_sha256':edition,'current_edition_sha256':edition,'state':'sealed_current'}
        if (not isinstance(proof,dict) or set(proof)!=PROOF_KEYS or any(proof.get(k)!=v for k,v in required.items())
                or row.get('current_file_state')!='sealed_current' or not UUID.fullmatch(proof.get('scope_generation',''))):
            raise AssertionError('CFM_EXPLICIT_CURRENT_PROOF_REQUIRED')
        refs = proof['references']
        expected = {(r['reference_kind'],r['reference_id']):{k:r[k] for k in RECEIPT_KEYS} for r in receipts}
        if proof['reference_count']!=len(expected) or len(refs)!=len(expected) or not refs:
            raise AssertionError('CFM_COMPLETE_NONEMPTY_REFERENCE_VECTOR_REQUIRED')
        seen = set()
        for ref in refs:
            if set(ref)!=REF_KEYS or ref['state']!='bytes_sealed' or not isinstance(ref['receipt'],dict) or set(ref['receipt'])!=RECEIPT_KEYS:
                raise AssertionError('CFM_EXACT_REF_AND_RECEIPT_SHAPE_REQUIRED')
            pair = (ref['reference_kind'],ref['reference_id'])
            if pair in seen or pair not in expected or ref['receipt']!=expected[pair]:
                raise AssertionError('CFM_EXACT_CAPTURE_RECEIPT_VECTOR_REQUIRED')
            selected = metadata(admin,f,proposal,edition,*pair)
            if selected.get('state')!='bytes_sealed' or selected.get('receipt')!=ref['receipt']:
                raise AssertionError('CFM_SELECTED_METADATA_NOT_EXACT_PROOF_RECEIPT')
            seen.add(pair)
        if seen!=set(expected):
            raise AssertionError('CFM_REFERENCE_COVERAGE_DRIFT')
        if ('file_delivery_consumers_not_accepted' not in row['readiness']['blockers']
                or row['readiness']['state']=='eligible' or row['readiness']['is_validated'] is not False):
            raise AssertionError('CFM_SEALED_METADATA_MUST_NOT_CLEAR_CAPFALSE_READINESS')
        # Existing immutable V3 source projection stays intentionally unconfirmed.
        for source in (row['current_source_context'],row['proposal']['source_context']):
            if source.get('file_authority_state')!='v3_unconfirmed_until_separate_trusted_file_receipt_adapter':
                raise AssertionError('CFM_UNCHANGED_V3_SOURCE_PROJECTION_REQUIRED')
            if any(r.get('state')!='unconfirmed' or r.get('receipt_id') is not None for r in source['file_bindings']):
                raise AssertionError('CFM_NO_REWRITTEN_HISTORICAL_SOURCE_RECEIPTS')
        # Exact keys above exclude bytes, URLs, bucket/object keys, tokens and raw locators.
        control.check('NOT EXISTS(SELECT 1 FROM public.platform_course_publication_review_events WHERE course_id='
                      +fixture.q(f['course'])+"AND event_kind IN('review_decided','publication_recorded'))")
        return row

    def held(row):
        if row.get('current_file_context') is not None or row.get('current_file_state')=='sealed_current':
            raise AssertionError('CFM_UNSELECTED_OR_HISTORICAL_CONTEXT_MUST_NOT_SEAL_CURRENT')

    def passed(name, detail):
        groups.append(name)
        trace({'case':name,'status':'PASS_CONDITIONAL_NATIVE_CURRENT_FILE_METADATA_ONLY','details':detail})

    try:
        control = session('control')
        admin, worker = session('admin'), session('worker')
        fixture.ctx(admin,fixture.ADMIN)
        fixture.ctx(worker,None,'service_role')
        baseline = fixture.protected(control)
        caps = cap_descriptor()
        if any(caps['values'].get(k) is not False for k in CAP_KEYS):
            raise AssertionError('CFM_ALL_THREE_CAPABILITIES_FALSE_NO_OVERRIDE')
        # Re-run the byte-exact complete product SQL; the old-reader preimage must refuse replay.
        # Its COMMIT rolls back the failed DO transaction, not the earlier installed new reader.
        control.error((Path(input_dir)/'current-file-review-context.full-product-migration.sql').read_text(),
                      'P0001','CURRENT_FILE_REVIEW_EXACT_READ_AND_SELECTED_METADATA_PREIMAGE_REQUIRED')
        control.check("(SELECT count(*)=653 AND bool_and(name='LOCAL_ONLY_SYNTHETIC_NOT_CLOUD_HISTORY')"
                      "FROM supabase_migrations.schema_migrations)AND "
                      "encode(sha256(convert_to((SELECT prosrc FROM pg_proc WHERE oid='public.read_platform_course_publication_review_context(uuid,uuid,text,text,uuid)'::regprocedure),'UTF8')),'hex')='b1387be7f8362f6d1d1e31611109ce0af0c15d1e70aff0886c9b974efce007a2'")
        f = fixture.source(control)
        receipts_a = fixture.capture(admin,worker,f)
        proposal_a, edition_a = fixture.propose(admin,f,receipts_a)
        assert_current(admin,f,proposal_a,edition_a,receipts_a)
        held(context(admin,f))
        held(context(admin,f,None,edition_a))
        held(context(admin,f,proposal_a,None))
        # A real reference-row edit changes its immutable row hash/PCR edition.
        # Object-version-only changes intentionally do not imply a new declared edition.
        control.ok("UPDATE public.lesson_attachments SET name='Synthetic current B'WHERE id="+fixture.q(f['attachment'])+';')
        admin.error(sql_context(f,proposal_a,edition_a),'40001','PCR_SOURCE_CHANGED_RETRY')
        current_b = fixture.jrow(admin,'SELECT public.read_platform_course_publication_readiness('+fixture.q(f['listing'])+')::text;')['edition_sha256']
        held(context(admin,f,proposal_a,current_b))
        historical = metadata(admin,f,proposal_a,edition_a,'lesson_attachment',f['attachment'])
        expected_a = next(r for r in receipts_a if r['reference_kind']=='lesson_attachment'and r['reference_id']==f['attachment'])
        if historical.get('state')!='bytes_sealed' or historical.get('receipt')!={k:expected_a[k] for k in RECEIPT_KEYS}:
            raise AssertionError('CFM_EXPLICIT_HISTORICAL_RECEIPT_MUST_REMAIN_INSPECTABLE')
        receipts_b = fixture.capture(admin,worker,f)
        proposal_b, edition_b = fixture.propose(admin,f,receipts_b)
        if proposal_b==proposal_a or edition_b==edition_a:
            raise AssertionError('CFM_NEW_CAPTURE_AND_PROPOSAL_MUST_BE_DISTINCT')
        assert_current(admin,f,proposal_b,edition_b,receipts_b)
        held(context(admin,f,proposal_a,edition_b))
        if metadata(admin,f,proposal_a,edition_a,'lesson_attachment',f['attachment'])!=historical:
            raise AssertionError('CFM_HISTORICAL_SELECTED_METADATA_CHANGED_AFTER_B')
        passed('CFM01',{'completeProductMigrationReplayRefused':True,'positiveCurrentExactReceiptMetadata':True,'capFalseStillReadinessBlocked':True,
                       'noImplicitLatestProof':True,'committedReferenceRowEditOldExpected40001':True,
                       'historicalAIsNotCurrentB':True,'historicalAReceiptPreserved':True,
                       'course':f['course'],'proposalA':proposal_a,'proposalB':proposal_b,
                       'editionA':edition_a,'editionB':edition_b,'refCount':len(receipts_b),
                       'reviewOrPublishPerformed':False,'realAuthOrStorageHTTP':False,'concurrencyClaim':False})
        no_ref = fixture.source(control,files=False)
        control.ok('UPDATE public.lessons SET content='+fixture.q('Synthetic embedded media must remain unconfirmed. <iframe src="https://example.invalid/synthetic"></iframe>')
                   +'WHERE id='+fixture.q(no_ref['lesson'])+';')
        no_ref_proposal,no_ref_edition = fixture.propose(admin,no_ref,[])
        embedded = context(admin,no_ref,no_ref_proposal,no_ref_edition)
        proof = embedded.get('current_file_context')
        if (embedded.get('current_file_state')!='unconfirmed' or not isinstance(proof,dict) or set(proof)!=PROOF_KEYS
                or proof.get('state')!='unconfirmed' or proof.get('reference_count')!=0 or proof.get('references')!=[]
                or 'file_or_external_material_edition_unconfirmed'not in embedded['readiness']['blockers']
                or embedded['readiness']['state']=='eligible'):
            raise AssertionError('CFM_ZERO_REFS_MUST_NOT_HIDE_EMBEDDED_MEDIA_HOLD')
        admin.error(sql_context(f,no_ref_proposal,edition_b),'P0002','PCR_PROPOSAL_UNAVAILABLE')
        admin.error('SELECT public.read_platform_course_proposal_file_context('
                    +','.join(map(fixture.q,[f['listing'],no_ref_proposal,no_ref_edition,'lesson_attachment',f['attachment']]))+');',
                    '42501','PCF_PROPOSAL_SELECTION_UNAVAILABLE')
        plain = fixture.source(control,files=False)
        plain_proposal,plain_edition = fixture.propose(admin,plain,[])
        plain_context = context(admin,plain,plain_proposal,plain_edition)
        if (plain_context.get('current_file_state')!='no_file_reference_detected'
                or plain_context['current_file_context']['state']!='no_file_reference_detected'
                or plain_context['current_file_context']['reference_count']!=0
                or plain_context['current_file_context']['references']!=[]):
            raise AssertionError('CFM_LEGITIMATE_NO_FILE_METADATA_CONTRACT_CHANGED')
        if fixture.protected(control)!=baseline or cap_descriptor()!=caps:
            raise AssertionError('CFM_PROTECTED_MODEL_ROWS_OR_CAPABILITY_DESCRIPTOR_DRIFT')
        passed('CFM02',{'zeroRefEmbeddedMediaStillBlocked':True,'foreignProposalTupleDenied':True,
                       'legitimateNoFileStatePreserved':True,'noReviewOrPublish':True,'noCapabilityOverride':True,
                       'protectedOldSentinelAndAuthModelRowsExact':True,'capabilityDefinitionOwnerACLExact':True})
        if groups!=EXPECTED:
            raise AssertionError('CFM_EXACT_TWO_GROUPS_REQUIRED')
        return {'status':'PASS_TWO_NEW_CURRENT_FILE_METADATA_COMPONENTS_ONLY','actualGroups':groups,
                'capabilityDescriptorBefore':caps,'capabilityDescriptorAfter':cap_descriptor(),
                'allThreeCapabilitiesFalse':True,'capabilityOverride':False,'oldCaseBodiesExecuted':0,
                'protectedOldSentinelAndAuthModelRowsExact':True,'realAuthStorageCloudUI':False,'full17Accepted':False}
    finally:
        primary = sys.exc_info()[0]is not None
        cleanup=[]
        for value in reversed(sessions):
            if not hasattr(value,'proc'):
                continue
            error_text=None
            try:
                value.close()
            except Exception as error:
                error_text=repr(error)
            forced=value.proc.poll()is None
            if forced:
                try:
                    value.proc.kill();value.proc.wait(timeout=5)
                except Exception as error:
                    error_text=error_text or repr(error)
                error_text=error_text or'FORCED_CLEANUP'
            receipt={'session':value.name,'pid':value.proc.pid,'exitCode':value.proc.poll(),
                     'closeError':error_text,'forcedCleanupFallback':forced}
            trace({'currentFileMetadataNativeSessionExit':receipt})
            if receipt['exitCode']!=0 or error_text:
                cleanup.append(receipt)
        if cleanup:
            trace({'currentFileMetadataCleanupFailures':cleanup,'primaryFailurePreserved':primary})
            if not primary:
                raise AssertionError('CFM_CLEANUP_OR_NATURAL_EXIT_FAILURE')
