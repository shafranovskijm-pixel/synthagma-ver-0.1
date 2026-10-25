import {describe,expect,it} from 'vitest';
import * as c from '../contract.ts';
import {authority,caps,id,legacy,manifest,org,policyBody,selection,signature,twoPartyManifest,zero} from './fixtures.ts';
describe('strict signature method and provenance inputs',()=>{
  it('accepts only canonical UC018 metadata references and rejects caller-invented byte or authority verification',()=>{
    expect(c.exactDocumentSelection.parse(selection).source.content_hash).toBe('a'.repeat(64));
    expect(c.exactDocumentSelection.safeParse({...selection,byte_proof:{byte_sha256:zero}}).success).toBe(false);
    expect(c.authorityInput.safeParse({kind:'exact_document_reference',declaration:null,document_reference:{...selection,byte_proof:null}}).success).toBe(false);
    expect(c.authorityInput.safeParse({...authority,verification:'exact_reference_checked'}).success).toBe(false);
  });
  it('binds registry selections to actual record and positive revision, never an invented document-only kind',()=>{
    const selected={kind:'document_registry_file',organization_id:org,registry_record_id:id(15),registry_record_revision:1,source:selection.source};
    expect(c.exactDocumentSelection.safeParse(selected).success).toBe(true);
    expect(c.exactDocumentSelection.safeParse({...selected,registry_record_revision:0}).success).toBe(false);
    const {registry_record_id,...missing}=selected;expect(c.exactDocumentSelection.safeParse(missing).success).toBe(false);
  });
  it('does not allow a factual bearer policy to claim account PEP, OTP or qualified signature verification',async()=>{
    const body=await policyBody();
    expect(c.policyBody.safeParse({...body,method:'bearer_invitation_confirmation'}).success).toBe(false);
    for(const method of ['verified_email_challenge_confirmation','external_qualified_signature','legacy_unknown'])expect(c.policyBody.safeParse({...body,method}).success).toBe(false);
    expect(c.capabilities.safeParse({...caps,unsupported_methods:caps.unsupported_methods.map(value=>({...value,verified:true}))}).success).toBe(false);
  });
  it('requires an actual account agreement for account PEP and real consent terms for consent classification',async()=>{
    const body=await policyBody();expect(c.policyBody.safeParse(body).success).toBe(true);
    expect(c.policyBody.safeParse({...body,agreement:null}).success).toBe(false);
    expect(c.policyBody.safeParse({...body,identity_requirement:'declared'}).success).toBe(false);
    expect(c.policyBody.safeParse({...body,classification:{...body.classification,document_type:'consent'}}).success).toBe(false);
  });
  it('keeps legacy client date and missing organization unknown instead of upgrading to new account evidence',()=>{
    const value=legacy();expect(c.agreementSnapshot.parse(value)).toEqual(value);
    expect(c.agreementSnapshot.safeParse({...value,organization_id:org}).success).toBe(false);
    expect(c.agreementSnapshot.safeParse({...value,accepted_at:'2026-10-23T00:00:00Z'}).success).toBe(false);
    expect(c.accountAgreement.safeParse(value).success).toBe(false);
  });
  it('does not accept trusted observed actor or storage proof inside public bearer JSON',()=>{
    const input={action:'confirm',token:'synthetic-invitation',party_role:'recipient',request_id:id(16),expected_revision:0,expected_document_revision_id:null,document_html_sha256:zero,declared_full_name:'Пример',authority:{kind:'self',declaration:null,document_reference:null},confirmed:true,method:'bearer_invitation_confirmation',binding_id:null,policy_sha256:null,policy_decision_revision:null};
    expect(c.publicEdgeRequest.safeParse(input).success).toBe(true);
    expect(c.publicEdgeRequest.safeParse({...input,p_observed_actor_user_id:id(99)}).success).toBe(false);
    expect(c.publicEdgeRequest.safeParse({...input,p_original_proof:{sha256:zero}}).success).toBe(false);
  });
  it('rejects hidden wildcard classifications, unsafe source URLs and fake calendar dates',async()=>{
    const body=await policyBody();expect(c.classification.safeParse({...body.classification,subtype:'*'}).success).toBe(false);
    for(const primary_url of ['http://example.invalid/law','https://user:secret@example.invalid/law','https://example.invalid/law#token'])expect(c.legalSourceReference.safeParse({...body.basis.sources[0],primary_url}).success).toBe(false);
    expect(c.legalSourceReference.safeParse({...body.basis.sources[0],checked_on:'2026-02-30'}).success).toBe(false);
  });
  it('never accepts crypto verification as a side field or an arbitrary signed-row mutation',()=>{
    const action={action:'record_graphic_preparation',signature_id:signature,party_role:'recipient',binding_id:null,document_html_sha256:zero,reason:'Макет подготовлен'};
    expect(c.applyAction.safeParse(action).success).toBe(true);
    expect(c.applyAction.safeParse({...action,status:'signed',cryptographic_verification:'verified'}).success).toBe(false);
  });
  it('preserves actual legacy email and original file MIME without inventing verification or an unsupported-type claim',()=>{
    const value=legacy();value.actor.observed_email='старое непроверенное значение';expect(c.agreementSnapshot.safeParse(value).success).toBe(true);
    expect(c.actorFact.safeParse({...value.actor,observed_mode:'account',email_control_confirmed:true}).success).toBe(false);
    expect(c.exactFile.safeParse({bucket:'external-contracts',path:org+'/existing.docx',sha256:zero,bytes:100,mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}).success).toBe(true);
  });
  it('keeps multiline reasons but rejects control injection and applies UTF8 byte limits before accepting literal terms',()=>{
    expect(c.applyAction.safeParse({action:'revoke_invitation',signature_id:signature,party_role:'recipient',reason:'Строка 1\nСтрока 2'}).success).toBe(true);
    expect(c.applyAction.safeParse({action:'revoke_invitation',signature_id:signature,party_role:'recipient',reason:'Текст\u0001'}).success).toBe(false);
    expect(c.canonicalTerms.safeParse({kind:'pep_agreement',version:'v',text:'Я'.repeat(32769),sha256:zero}).success).toBe(false);
  });
  it('represents an unversioned legacy consent as revision0 instead of fabricating a first canonical confirmation',()=>{
    const old=legacy(),value={id:id(40),legacy_consent_id:id(40),organization_id:org,subject_user_id:old.subject_user_id,revision:0,state:'legacy_unknown',consent_terms:null,rendered_text:null,rendered_text_sha256:null,
      organization_name:null,organization_inn:null,actor:old.actor,policy_version_id:null,policy_sha256:null,agreement_event_id:null,confirmed_at:null,withdrawn_at:null,legacy_recorded_at:null,limitations:['Точный текст исторического согласия не сохранён.']};
    expect(c.consentSnapshot.safeParse(value).success).toBe(true);
    expect(c.consentSnapshot.safeParse({...value,revision:1}).success).toBe(false);
    expect(c.consentSnapshot.safeParse({...value,state:'confirmed'}).success).toBe(false);
    expect(c.consentSnapshot.safeParse({...value,actor:{...value.actor,observed_mode:'account'}}).success).toBe(false);
  });
  it('does not attach observed current account or email-control claims to an unknown legacy acceptance',()=>{
    const value=legacy();expect(c.legacyAgreement.safeParse({...value,actor:{...value.actor,observed_mode:'account',name_assurance:'declared'}}).success).toBe(false);
    expect(c.legacyAgreement.safeParse({...value,actor:{...value.actor,observed_mode:'account',observed_email:'synthetic@example.invalid',email_control_confirmed:true}}).success).toBe(false);
  });
  it('requires an explicit signature party and refuses party scope on account agreement/consent choices',()=>{
    const choice={kind:'policy_choices',signature_id:signature,party_role:'sender',purpose:'signature',after_id:null,limit:10};
    expect(c.readQuery.safeParse(choice).success).toBe(true);
    for(const patch of [{party_role:null},{signature_id:null},{purpose:'agreement'},{purpose:'consent'}])expect(c.readQuery.safeParse({...choice,...patch}).success).toBe(false);
    expect(c.readQuery.safeParse({...choice,signature_id:null,party_role:null,purpose:'agreement'}).success).toBe(true);
    expect(c.readQuery.safeParse({kind:'signature',signature_id:signature}).success).toBe(false);
  });
  it('does not bind a sender policy to the recipient or accept a half-pinned sender agreement',async()=>{
    const body=await policyBody(),action={action:'bind_signature',signature_id:signature,party_role:'sender',document_revision_id:null,document_html_sha256:zero,classification:body.classification,policy_version_id:id(12)};
    expect(c.applyAction.safeParse(action).success).toBe(false);
    expect(c.applyAction.safeParse({...action,classification:{...body.classification,party_role:'sender'}}).success).toBe(true);
    const sender={action:'confirm_sender',signature_id:signature,party_role:'sender',binding_id:id(60),policy_sha256:zero,document_html_sha256:zero,declared_full_name:'Отправитель',authority:{kind:'self',declaration:null,document_reference:null},agreement_event_id:id(81),agreement_sha256:null};
    expect(c.applyAction.safeParse(sender).success).toBe(false);
    expect(c.applyAction.safeParse({...sender,agreement_sha256:zero}).success).toBe(true);
  });
  it('requires exact known party/binding for signature events while non-signature events never acquire one',async()=>{
    const value=await twoPartyManifest(),sender=value.body.events[3];expect(c.event.safeParse(sender).success).toBe(true);
    for(const patch of [{party_role:'recipient'},{binding_id:null},{stream_kind:'agreement'},{policy_sha256:null}])expect(c.event.safeParse({...sender,...patch}).success).toBe(false);
    const graphic=(await manifest()).body.events[0];expect(c.event.safeParse({...graphic,party_role:null}).success).toBe(false);
  });
  it('keeps public invitation operations strictly recipient-only and excludes private sender context keys',()=>{
    expect(c.publicEdgeRequest.safeParse({action:'context',token:'synthetic',party_role:'recipient'}).success).toBe(true);
    for(const party_role of ['sender',null])expect(c.publicEdgeRequest.safeParse({action:'context',token:'synthetic',party_role}).success).toBe(false);
    expect(c.publicEdgeRequest.safeParse({action:'context',token:'synthetic',party_role:'recipient',sender_policy:{}}).success).toBe(false);
  });
});
