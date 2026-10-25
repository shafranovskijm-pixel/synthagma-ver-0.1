import {describe,it,expect} from 'vitest';
import {buildSignatureEvidencePack,type EvidencePackScope} from '../evidencePack.ts';
import {evidenceSha256,verifyManifest} from '../validation.ts';
import {manifest,twoPartyManifest,org,signature,actor,id} from './fixtures.ts';
const scopeOf=(body:Awaited<ReturnType<typeof manifest>>['body']):EvidencePackScope=>({organization_id:org,signature_id:signature,actor_user_id:actor,party_role:body.context.chosen_party,source_manifest_id:body.source_manifest_id,source_manifest_sha256:body.source_manifest_sha256,through_revision:body.through_revision});
describe('scoped signature evidence pack',()=>{
 it('builds and independently verifies the complete two-party event/reference chain',async()=>{
  const {body}=await twoPartyManifest();const result=await buildSignatureEvidencePack(body,scopeOf(body),()=>true);
  await expect(verifyManifest(result,org,signature,body.source_manifest_id,()=>true)).resolves.toBeUndefined();
  expect(JSON.parse(result.body_json)).toEqual(result.body);expect(result.body_json_sha256).toBe(await evidenceSha256(result.body_json));expect(result.receipt_html_sha256).toBe(await evidenceSha256(result.receipt_html));
  expect(result.body.events).toHaveLength(5);expect(result.body.referenced_agreements).toHaveLength(2);
 });
 it('does not upgrade the hidden source commitment or source metadata to private byte verification',async()=>{
  const {body}=await manifest();expect(body.disclosure.complete_private_evidence_verified).toBe(true);
  const value=await buildSignatureEvidencePack(body,scopeOf(body),()=>true);expect(value.body.disclosure.complete_private_evidence_verified).toBe(false);expect(body.disclosure.complete_private_evidence_verified).toBe(true);
  expect(value.receipt_html).toContain('его содержимое этим экспортом не подтверждается');
 });
 it('renders exact method and observed-account facts with the cryptographic limitation',async()=>{
  const {body}=await twoPartyManifest();const value=await buildSignatureEvidencePack(body,scopeOf(body),()=>true);
  expect(value.receipt_html).toContain('Действие учётной записи');expect(value.receipt_html).toContain('Криптографическая проверка подписи');
  expect(value.receipt_html).toContain(body.referenced_policies[0].body.agreement!.version);expect(value.receipt_html).toContain(body.referenced_policies[0].body_sha256);
 });
 it('escapes all event/declaration text and never renders original document HTML as active markup',async()=>{
  const {body}=await manifest();body.events[0].explanation='<img src=x onerror=alert(1)> & "quoted"';
  body.document_snapshots[0].html_text='<script>globalThis.bad=true</script>';body.document_snapshots[0].html_sha256=await evidenceSha256(body.document_snapshots[0].html_text);
  body.events[0].document_html_sha256=body.document_snapshots[0].html_sha256;body.context.current_document_html_sha256=body.document_snapshots[0].html_sha256;
  const value=await buildSignatureEvidencePack(body,scopeOf(body),()=>true);expect(value.receipt_html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quoted&quot;');expect(value.receipt_html).not.toContain('<img');expect(value.receipt_html).not.toContain('<script>');expect(value.receipt_html).toContain('Content-Security-Policy');
 });
 it('refuses any mismatch in the original scope, party, source commitment or captured revision',async()=>{
  const {body}=await manifest();const scope=scopeOf(body);
  for(const mutation of [{organization_id:id(1000)},{signature_id:id(1000)},{actor_user_id:id(1000)},{party_role:'sender'},{source_manifest_id:id(1000)},{source_manifest_sha256:'f'.repeat(64)},{through_revision:2}]){
   await expect(buildSignatureEvidencePack(body,{...scope,...mutation}as EvidencePackScope,()=>true)).rejects.toMatchObject({code:'SOURCE_CHANGED'});
  }
 });
 it('rejects extra fields in the body or expected scope',async()=>{
  const {body}=await manifest();await expect(buildSignatureEvidencePack({...body,approved:true},scopeOf(body),()=>true)).rejects.toMatchObject({code:'INVALID_INPUT'});
  await expect(buildSignatureEvidencePack(body,{...scopeOf(body),verified:true}as EvidencePackScope,()=>true)).rejects.toMatchObject({code:'INVALID_INPUT'});
 });
 it('refuses a missing event in a server-declared contiguous history',async()=>{
  const {body}=await twoPartyManifest();body.events.splice(1,1);body.event_count--;
  await expect(buildSignatureEvidencePack(body,scopeOf(body),()=>true)).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});
 });
 it('refuses a confirmation against the earlier recipient binding after a later rebind',async()=>{
  const {body}=await twoPartyManifest();const last=structuredClone(body.events[2]);last.id=id(190);last.request_id=id(191);last.revision=6;body.events.push(last);body.event_count=body.through_revision=body.context.latest_event_revision=6;
  body.context.parties.recipient.latest_party_event_revision=6;body.context.parties.recipient.conclusion=last.conclusion;
  await expect(buildSignatureEvidencePack(body,scopeOf(body),()=>true)).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});
 });
 it('refuses omitted policy or agreement dependencies in a seemingly valid two-party summary',async()=>{
  const first=await twoPartyManifest();first.body.referenced_policies.pop();await expect(buildSignatureEvidencePack(first.body,scopeOf(first.body),()=>true)).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});
  const second=await twoPartyManifest();second.body.referenced_agreements.pop();await expect(buildSignatureEvidencePack(second.body,scopeOf(second.body),()=>true)).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});
 });
 it('refuses credential-bearing event text even if hashes could be freshly generated',async()=>{
  const {body}=await manifest();body.events[0].explanation='https://example.invalid/anything?token=secret-invitation';
  await expect(buildSignatureEvidencePack(body,scopeOf(body),()=>true)).rejects.toMatchObject({code:'DEPENDENCY_UNAVAILABLE'});
 });
 it('refuses export before or after an asynchronous current-scope revocation',async()=>{
  const {body}=await manifest();await expect(buildSignatureEvidencePack(body,scopeOf(body),()=>false)).rejects.toMatchObject({code:'ACCESS_DENIED'});
  let checks=0;await expect(buildSignatureEvidencePack(body,scopeOf(body),()=>++checks===1)).rejects.toMatchObject({code:'ACCESS_DENIED'});
 });
 it('captures the input before hashing so caller mutation cannot replace the chosen source',async()=>{
  const {body}=await manifest();const original=body.events[0].explanation;const pending=buildSignatureEvidencePack(body,scopeOf(body),()=>true);body.events[0].explanation='changed after call';
  const result=await pending;expect(result.body.events[0].explanation).toBe(original);expect(result.receipt_html).not.toContain('changed after call');
 });
});
