import * as c from './contract';
import type * as t from './types';

export class SignatureEvidenceError extends Error {
  constructor(readonly code:t.ErrorCode='DEPENDENCY_UNAVAILABLE'){super(code);this.name='SignatureEvidenceError';}
}
const refuse=():never=>{throw new SignatureEvidenceError();};
export function sameEvidenceValue(a:unknown,b:unknown):boolean {
  if(Object.is(a,b))return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((value,index)=>sameEvidenceValue(value,b[index]));
  const x=a as Record<string,unknown>,y=b as Record<string,unknown>,keys=Object.keys(x);
  return keys.length===Object.keys(y).length&&keys.every(key=>Object.prototype.hasOwnProperty.call(y,key)&&sameEvidenceValue(x[key],y[key]));
}
export async function evidenceSha256(value:string|Uint8Array):Promise<string>{
  const bytes=typeof value==='string'?new TextEncoder().encode(value):value;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.slice().buffer)),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export async function verifyLiteral(value:string,expected:string,maxBytes:number,current:()=>boolean):Promise<Uint8Array>{
  if(!current())throw new SignatureEvidenceError('ACCESS_DENIED');
  const bytes=new TextEncoder().encode(value);
  if(bytes.length>maxBytes)throw new SignatureEvidenceError('LIMIT_EXCEEDED');
  if(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes)!==value)refuse();
  const actual=await evidenceSha256(bytes);
  if(!current())throw new SignatureEvidenceError('ACCESS_DENIED');
  if(actual!==expected)refuse();
  return bytes;
}
function parsedLiteral<T>(literal:string,expected:T):void {
  let parsed:unknown;try{parsed=JSON.parse(literal);}catch{return refuse();}
  if(!sameEvidenceValue(parsed,expected))refuse();
}
async function terms(value:t.CanonicalTerms|null,current:()=>boolean){if(value)await verifyLiteral(value.text,value.sha256,65536,current);}
async function disclosed<T>(value:t.EvidenceDisclosure<T>,current:()=>boolean){
  if(value.visibility==='available'){
    await verifyLiteral(value.captured_reference_json,value.captured_reference_sha256,196608,current);
    parsedLiteral(value.captured_reference_json,value.value);
  }
}
function identity(value:{organization_id:string},organizationId:string){if(value.organization_id!==organizationId)refuse();}
/** Verify each hash domain against its own literal bytes; metadata hashes never become byte proof. */
export async function verifyPolicy(value:t.PolicyVersion,current:()=>boolean):Promise<void>{
  if(!c.policyVersion.safeParse(value).success)refuse();
  for(const reference of value.body.basis.document_references)await disclosed(reference,current);
  if(value.decision.authority.document_reference)await disclosed(value.decision.authority.document_reference,current);
  if(value.decision_history){
    let previous=0;const ids=new Set<string>();
    for(const decision of value.decision_history){
      if(decision.revision<=previous||ids.has(decision.id))refuse();previous=decision.revision;ids.add(decision.id);
      if(decision.authority.document_reference)await disclosed(decision.authority.document_reference,current);
    }
    if(!sameEvidenceValue(value.decision_history[value.decision_history.length-1],value.decision))refuse();
  }
  await terms(value.body.agreement,current);await terms(value.body.consent,current);
  const masked=value.body.basis.document_references.filter(reference=>reference.visibility==='redacted').length+(value.decision.authority.document_reference?.visibility==='redacted'?1:0)+(value.decision_history?.filter(decision=>decision.authority.document_reference?.visibility==='redacted').length??0);
  if(masked!==value.disclosure.redacted_reference_count||value.disclosure.redacted_content_count!==0)refuse();
  const projection={body:value.body,body_sha256:value.body_sha256,disclosure:value.disclosure,...(value.decision_history?{decision_history:value.decision_history}:{})};
  await verifyLiteral(value.projection_json,value.projection_sha256,196608,current);parsedLiteral(value.projection_json,projection);
  if(masked){if(value.body_json!==null)refuse();return;}
  if(value.body_json===null)refuse();
  const body={...value.body,basis:{...value.body.basis,document_references:value.body.basis.document_references.map(reference=>reference.visibility==='available'?reference.value:refuse())}};
  if(!c.policyBody.safeParse(body).success)refuse();
  await verifyLiteral(value.body_json,value.body_sha256,196608,current);parsedLiteral(value.body_json,body);
}
export async function verifyAgreement(value:t.AgreementSnapshot,current:()=>boolean):Promise<void>{
  if(!c.agreementSnapshot.safeParse(value).success)refuse();
  if(value.kind==='account_acceptance'){
    await terms(value.terms,current);await verifyLiteral(value.rendered_text,value.rendered_text_sha256,65536,current);
  }else{
    if(value.stored_terms.text!==null)await verifyLiteral(value.stored_terms.text,value.stored_terms.text_sha256!,65536,current);
    if(value.stored_rendered_text!==null)await verifyLiteral(value.stored_rendered_text,value.stored_rendered_text_sha256!,65536,current);
  }
}
export async function verifyConsent(value:t.ConsentSnapshot,current:()=>boolean):Promise<void>{
  if(!c.consentSnapshot.safeParse(value).success)refuse();
  await terms(value.consent_terms,current);
  if(value.rendered_text!==null)await verifyLiteral(value.rendered_text,value.rendered_text_sha256!,65536,current);
}
function unique<T>(rows:T[],get:(value:T)=>string){const ids=rows.map(get);if(new Set(ids).size!==ids.length)refuse();}
export function assertPage<T>(rows:T[],get:(value:T)=>string,after:string|null,next:string|null,limit:number){
  if(rows.length>limit)refuse();let previous=after;
  for(const row of rows){const id=get(row);if(previous!==null&&id<=previous)refuse();previous=id;}
  if(next!==null&&(!rows.length||next!==previous||next===after))refuse();
}
export function assertEventPage(page:t.EventPage,query:Extract<t.ReadQuery,{kind:'events'}>){
  if(page.stream_kind!==query.stream_kind||page.stream_id!==query.stream_id||page.after_revision!==query.after_revision||query.through_revision!==null&&page.through_revision!==query.through_revision||page.events.length>query.limit)refuse();
  let previous=query.after_revision;
  for(const event of page.events){if(event.stream_kind!==query.stream_kind||event.stream_id!==query.stream_id||event.revision!==previous+1||event.revision>page.through_revision)refuse();previous=event.revision;}
  if(page.next_after_revision!==null&&(!page.events.length||page.next_after_revision!==previous||previous>=page.through_revision))refuse();
  if(page.next_after_revision===null&&previous<page.through_revision)refuse();
}
function containsCredentialBearingSource(value:string):boolean {
  // A conservative client tripwire, not a universal secret detector. The server also
  // masks historical HTML by the actual private invitation token and parsed URL attributes.
  let decoded=value;
  for(let pass=0;pass<4;pass++){
    if(/(?:[?&](?:token|access_token|refresh_token|authorization|api[_-]?key|signature)=)[^\s"'<>]+/i.test(decoded)
      ||/\/sign\/[^\s"'<>/?#]+/i.test(decoded)
      ||/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(decoded)
      ||/\bBearer\s+[A-Za-z0-9._~-]+/i.test(decoded))return true;
    const entities=decoded.replace(/&#(?:x([0-9a-f]{1,6})|([0-9]{1,7}));?/gi,(literal,hex:string|undefined,decimal:string|undefined)=>{
      const code=parseInt(hex??decimal??'',hex?16:10);
      return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):literal;
    }).replace(/&(amp|equals|sol|colon|quest|percnt);/gi,(_,name:string)=>({amp:'&',equals:'=',sol:'/',colon:':',quest:'?',percnt:'%'}[name.toLowerCase()]!));
    let next=entities;try{next=decodeURIComponent(entities);}catch{/* Keep entity decoding for malformed unrelated URI text. */}
    if(next===decoded)break;decoded=next;
  }
  return false;
}
async function verifyDocument(value:t.DocumentSnapshot,current:()=>boolean){
  if(value.original_file)await disclosed(value.original_file,current);
  if(value.content_visibility==='available'){
    if(value.html_text===null||containsCredentialBearingSource(value.html_text))refuse();
    await verifyLiteral(value.html_text,value.html_sha256,1000000,current);
  }else if(value.html_text!==null)refuse();
}
export async function verifyEvent(value:t.Event,current:()=>boolean){
  if(!c.event.safeParse(value).success)refuse();
  if(value.original_file)await disclosed(value.original_file,current);
  if(value.scan_file)await disclosed(value.scan_file,current);
  if(value.authority.document_reference)await disclosed(value.authority.document_reference,current);
}
export async function verifySignatureContext(value:t.SignatureContext,current:()=>boolean):Promise<void>{
  if(!c.signatureContext.safeParse(value).success)refuse();
  for(const role of ['sender','recipient']as const){
    const party=value.parties[role],bound=party.binding,policy=party.policy;
    if(bound){identity(bound,value.organization_id);if(bound.signature_id!==value.signature_id||bound.party_role!==role)refuse();if(bound.original_file)await disclosed(bound.original_file,current);}
    if(policy){identity(policy,value.organization_id);await verifyPolicy(policy,current);}
    if(bound&&policy&&(bound.policy_version_id!==policy.id||bound.policy_sha256!==policy.body_sha256||!sameEvidenceValue(bound.classification,policy.body.classification)||bound.agreement_sha256!==(policy.body.agreement?.sha256??null)))refuse();
    if(party.conclusion==='policy_eligible_account_confirmation'&&(!bound||!policy||policy.body.method!=='authenticated_account_confirmation'||policy.body.purpose!=='account_pep'))refuse();
    // Requirements describe future eligibility; an old recorded fact remains immutable.
    if(party.requirements.eligible&&party.requirements.purpose==='account_pep'&&(!bound||!policy||bound.document_revision_id!==value.current_document_revision_id||bound.document_html_sha256!==value.current_document_html_sha256||policy.body.purpose!=='account_pep'||policy.decision.state!=='centre_accepted'))refuse();
  }
}
/** Literal derivative verification is distinct from verifying the undisclosed private source manifest. */
export async function verifyManifest(value:t.FrozenManifest,organizationId:string,signatureId:string,sourceManifestId:string,current:()=>boolean):Promise<void>{
  if(!c.frozenManifest.safeParse(value).success)refuse();
  const body=value.body;
  if(body.organization_id!==organizationId||body.signature_id!==signatureId||body.source_manifest_id!==sourceManifestId||body.id===sourceManifestId||body.event_count!==body.events.length||body.event_count!==body.through_revision)refuse();
  if(body.context.organization_id!==organizationId||body.context.signature_id!==signatureId||body.context.latest_event_revision!==body.through_revision)refuse();
  unique(body.events,row=>row.id);unique(body.referenced_bindings,row=>row.id);unique(body.referenced_policies,row=>row.id);unique(body.referenced_agreements,row=>row.id);unique(body.document_snapshots,row=>row.id);
  const bindings=new Map(body.referenced_bindings.map(value=>[value.id,value]));
  const policies=new Map(body.referenced_policies.map(value=>[value.id,value]));
  const agreements=new Map(body.referenced_agreements.map(value=>[value.id,value]));
  const documents=new Map(body.document_snapshots.map(value=>[value.id,value]));
  const referencedBindingIds=new Set<string>(),referencedPolicyIds=new Set<string>(),referencedAgreementIds=new Set<string>(),referencedDocumentIds=new Set<string>();
  const latestPartyRevision:Record<t.SigningParty,number>={sender:0,recipient:0};
  const latestPartyEvent:Record<t.SigningParty,t.Event|null>={sender:null,recipient:null};
  const latestBinding:Record<t.SigningParty,t.Binding|null>={sender:null,recipient:null};
  const sameFile=(a:t.FileDisclosure|null,b:t.FileDisclosure|null)=>a===null||b===null?a===b:a.captured_reference_sha256===b.captured_reference_sha256;
  for(const bound of bindings.values()){
    if(bound.organization_id!==organizationId||bound.signature_id!==signatureId||bound.revision>body.through_revision)refuse();
    const policy=policies.get(bound.policy_version_id),document=documents.get(bound.document_snapshot_id);
    if(!policy||policy.body_sha256!==bound.policy_sha256||!sameEvidenceValue(bound.classification,policy.body.classification)||bound.agreement_sha256!==(policy.body.agreement?.sha256??null))refuse();
    if(!document||document.organization_id!==organizationId||document.signature_id!==signatureId||document.party_role!==bound.party_role||document.document_revision_id!==bound.document_revision_id||document.html_sha256!==bound.document_html_sha256||!sameFile(bound.original_file,document.original_file))refuse();
    if(policy.decision_history&&!policy.decision_history.some(decision=>decision.revision===bound.policy_decision_revision&&decision.state==='centre_accepted'))refuse();
    referencedPolicyIds.add(policy.id);referencedDocumentIds.add(document.id);
    if(bound.original_file)await disclosed(bound.original_file,current);
  }
  for(let index=0;index<body.events.length;index++){
    const event=body.events[index];
    if(event.organization_id!==organizationId||event.signature_id!==signatureId||event.stream_kind!=='signature'||event.stream_id!==signatureId||event.revision!==index+1)refuse();
    if(event.policy_version_id){const policy=policies.get(event.policy_version_id);if(!policy||policy.body_sha256!==event.policy_sha256)refuse();referencedPolicyIds.add(policy.id);}
    else if(event.policy_sha256!==null)refuse();
    if(event.binding_id){
      const bound=bindings.get(event.binding_id);
      if(!bound||bound.party_role!==event.party_role||bound.policy_version_id!==event.policy_version_id||bound.policy_sha256!==event.policy_sha256||bound.document_revision_id!==event.document_revision_id||bound.document_html_sha256!==event.document_html_sha256||!sameFile(bound.original_file,event.original_file)||bound.revision>event.revision)refuse();
      if(event.kind==='signature_bound'){
        if(bound.revision!==event.revision||bound.document_snapshot_id!==event.document_snapshot_id||latestBinding[bound.party_role]?.revision===bound.revision)refuse();
        latestBinding[bound.party_role]=bound;
      }else if(latestBinding[bound.party_role]?.id!==bound.id)refuse();
      referencedBindingIds.add(bound.id);
    }
    if(event.agreement_event_id){const agreement=agreements.get(event.agreement_event_id);if(!agreement||agreement.terms.sha256!==event.agreement_sha256||agreement.policy_version_id!==event.policy_version_id||agreement.policy_sha256!==event.policy_sha256||agreement.subject_user_id!==event.actor.user_id)refuse();referencedAgreementIds.add(agreement.id);}
    else if(event.agreement_sha256!==null)refuse();
    if(event.document_snapshot_id){const document=documents.get(event.document_snapshot_id);if(!document||document.organization_id!==organizationId||document.signature_id!==signatureId||document.party_role!==event.party_role||document.document_revision_id!==event.document_revision_id||document.html_sha256!==event.document_html_sha256||!sameFile(document.original_file,event.original_file))refuse();referencedDocumentIds.add(document.id);}
    else if(event.document_revision_id!==null||event.document_html_sha256!==null)refuse();
    await verifyEvent(event,current);
    if(event.party_role===null)refuse();latestPartyRevision[event.party_role]=event.revision;latestPartyEvent[event.party_role]=event;
    if(['account_confirmed','sender_confirmed'].includes(event.kind)){
      const bound=bindings.get(event.binding_id!),policy=policies.get(event.policy_version_id!);
      if(!bound||!policy||event.actor.observed_mode!=='account'||event.actor.user_id===null||policy.body.method!=='authenticated_account_confirmation')refuse();
      if(event.kind==='account_confirmed'&&bound.recipient_user_id!==null&&event.actor.user_id!==bound.recipient_user_id)refuse();
      if(policy.body.purpose==='account_pep'&&(!event.agreement_event_id||!policy.body.agreement||event.agreement_sha256!==policy.body.agreement.sha256||bound.agreement_sha256!==event.agreement_sha256))refuse();
    }
  }
  if(referencedBindingIds.size!==bindings.size||referencedPolicyIds.size!==policies.size||referencedAgreementIds.size!==agreements.size||referencedDocumentIds.size!==documents.size)refuse();
  for(const role of ['sender','recipient']as const){
    const party=body.context.parties[role];
    if(party.latest_party_event_revision!==latestPartyRevision[role]||!sameEvidenceValue(party.binding,latestBinding[role]))refuse();
    const last=latestPartyEvent[role];
    if(last?party.conclusion!==last.conclusion:party.conclusion!=='not_confirmed'&&!(party.conclusion==='legacy_unknown'&&body.context.legacy_evidence_available))refuse();
    if(party.policy&&!sameEvidenceValue(party.policy,policies.get(party.policy.id)))refuse();
  }
  for(const policy of policies.values()){identity(policy,organizationId);await verifyPolicy(policy,current);}
  for(const agreement of agreements.values()){identity(agreement,organizationId);await verifyAgreement(agreement,current);}
  for(const document of documents.values())await verifyDocument(document,current);
  await verifySignatureContext(body.context,current);
  let maskedReferences=0,maskedContent=0;
  const count=(value:unknown):void=>{if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach(count);return;}const row=value as Record<string,unknown>;
    if(row.visibility==='redacted')maskedReferences++;
    if(row.content_visibility==='redacted_current_file_scope'||row.content_visibility==='redacted_credential_bearing_source')maskedContent++;
    for(const [key,child]of Object.entries(row))if(!['disclosure','body_json','projection_json','captured_reference_json'].includes(key))count(child);
  };
  count(body.context);count(body.events);count(body.referenced_bindings);count(body.referenced_policies);count(body.referenced_agreements);count(body.document_snapshots);
  if(body.disclosure.redacted_reference_count!==maskedReferences||body.disclosure.redacted_content_count!==maskedContent)refuse();
  // Signature/identity legality is never inferred. Missing source byte evidence cannot be called complete.
  const unverified=body.document_snapshots.some(document=>document.source_file_state==='unverified_reference');
  if((unverified||maskedReferences||maskedContent)&&body.disclosure.complete_private_evidence_verified)refuse();
  const json=await verifyLiteral(value.body_json,value.body_json_sha256,2000000,current);parsedLiteral(value.body_json,body);
  const html=await verifyLiteral(value.receipt_html,value.receipt_html_sha256,2000000,current);
  if(json.length+html.length>2000000)throw new SignatureEvidenceError('LIMIT_EXCEEDED');
  if(containsCredentialBearingSource(value.body_json)||containsCredentialBearingSource(value.receipt_html))refuse();
  if(!current())throw new SignatureEvidenceError('ACCESS_DENIED');
}
