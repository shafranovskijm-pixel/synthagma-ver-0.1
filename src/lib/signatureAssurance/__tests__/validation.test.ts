import {beforeEach,describe,expect,it,vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {assertEventPage,assertPage,evidenceSha256,verifyAgreement,verifyLiteral,verifyManifest,verifyPolicy} from '../validation';
import {id,legacy,manifest,org,policy,rehash,signature,twoPartyManifest} from './fixtures';
beforeEach(()=>{vi.stubGlobal('crypto',webcrypto);});
describe('immutable evidence domains and complete scoped history',()=>{
  it('checks original body and scoped projection against different literal SHA domains',async()=>{
    const value=await policy();await expect(verifyPolicy(value,()=>true)).resolves.toBeUndefined();
    value.body.basis.document_references[0].captured_reference_sha256='b'.repeat(64);
    value.projection_json=JSON.stringify({body:value.body,body_sha256:value.body_sha256,disclosure:value.disclosure});value.projection_sha256=await evidenceSha256(value.projection_json);
    await expect(verifyPolicy(value,()=>true)).rejects.toThrow();
  });
  it('allows a truthful masked policy commitment without leaking its old private body JSON',async()=>{
    const value=await policy(),old=value.body.basis.document_references[0];value.body.basis.document_references=[{visibility:'redacted',captured_reference_sha256:old.captured_reference_sha256,value:null,reason:'current_file_scope'}];
    value.disclosure={kind:'current_scope_projection',redacted_reference_count:1,redacted_content_count:0,complete_private_evidence_verified:false};
    value.projection_json=JSON.stringify({body:value.body,body_sha256:value.body_sha256,disclosure:value.disclosure});value.projection_sha256=await evidenceSha256(value.projection_json);
    await expect(verifyPolicy(value,()=>true)).rejects.toThrow();value.body_json=null;
    await expect(verifyPolicy(value,()=>true)).resolves.toBeUndefined();
  });
  it('hashes only genuine known legacy stored text, never a current policy reconstruction',async()=>{
    const value=legacy();value.stored_terms={version:'stored-1',text:'Старое сохранённое соглашение',text_sha256:await evidenceSha256('Старое сохранённое соглашение'),hash_assurance:'computed_from_known_stored_text'};
    await expect(verifyAgreement(value,()=>true)).resolves.toBeUndefined();value.stored_terms.text='Современная подставленная редакция';
    await expect(verifyAgreement(value,()=>true)).rejects.toThrow();
  });
  it('verifies exact Cyrillic manifest bytes and whole event/snapshot graph without asserting a legal signature',async()=>{
    const value=await manifest();await expect(verifyManifest(value,org,signature,id(35),()=>true)).resolves.toBeUndefined();
    expect(value.body.events[0].cryptographic_verification).toBe('not_performed');expect(value.body.context.parties.recipient.conclusion).toBe('graphic_prepared');expect(value.body.context.parties.sender.conclusion).toBe('not_confirmed');
  });
  it('refuses a gap or omitted event even when attacker recomputes the visible JSON hash',async()=>{
    const value=await manifest();value.body.events=[];await rehash(value);
    await expect(verifyManifest(value,org,signature,id(35),()=>true)).rejects.toThrow();
  });
  it('rejects a foreign subject document, substituted snapshot and wrong private capture ID',async()=>{
    const value=await manifest();await expect(verifyManifest(value,org,signature,id(99),()=>true)).rejects.toThrow();
    value.body.document_snapshots[0].organization_id=id(99);await rehash(value);
    await expect(verifyManifest(value,org,signature,id(35),()=>true)).rejects.toThrow();
  });
  it('never accepts extra unreferenced policy/history objects as part of a frozen complete package',async()=>{
    const value=await manifest();value.body.referenced_policies=[await policy()];await rehash(value);
    await expect(verifyManifest(value,org,signature,id(35),()=>true)).rejects.toThrow();
  });
  it('keeps a redacted snapshot as a commitment with honest mask counts and false complete-byte assertion',async()=>{
    const value=await manifest();value.body.document_snapshots[0].html_text=null;value.body.document_snapshots[0].content_visibility='redacted_current_file_scope';
    value.body.disclosure={kind:'current_scope_projection',redacted_reference_count:0,redacted_content_count:1,complete_private_evidence_verified:false};await rehash(value);
    await expect(verifyManifest(value,org,signature,id(35),()=>true)).resolves.toBeUndefined();
    value.body.disclosure.complete_private_evidence_verified=true;await rehash(value);
    await expect(verifyManifest(value,org,signature,id(35),()=>true)).rejects.toThrow();
  });
  it('does not return credential-bearing historical source HTML even with correct byte hashes',async()=>{
    const value=await manifest(),source='<p><a href="https://example.invalid/sign?token=synthetic-secret">Ссылка</a></p>';
    value.body.document_snapshots[0].html_text=source;value.body.document_snapshots[0].html_sha256=await evidenceSha256(source);value.body.events[0].document_html_sha256=value.body.document_snapshots[0].html_sha256;await rehash(value);
    await expect(verifyManifest(value,org,signature,id(35),()=>true)).rejects.toThrow();
  });
  it.each([
    '<a href="https://example.invalid/sign?token&#61;synthetic-secret">Ссылка</a>',
    '<a href="https://example.invalid/sign?access%5ftoken%3dsynthetic-secret">Ссылка</a>',
    '<a href="https:&#47;&#47;example.invalid&#47;sign&#47;synthetic-invitation">Ссылка</a>',
    '<a href="https://example.invalid%2Fsign%2Fsynthetic-invitation">Ссылка</a>',
  ])('refuses encoded credential URLs and the actual legacy invitation route: %s',async(source)=>{
    const value=await manifest();value.body.document_snapshots[0].html_text=source;
    value.body.document_snapshots[0].html_sha256=await evidenceSha256(source);
    value.body.events[0].document_html_sha256=value.body.document_snapshots[0].html_sha256;await rehash(value);
    await expect(verifyManifest(value,org,signature,id(35),()=>true)).rejects.toThrow();
  });
  it('checks current context again after an asynchronous byte hash, including a previously invalidated scope',async()=>{
    const value=await manifest();let current=true;
    const pending=verifyManifest(value,org,signature,id(35),()=>current);current=false;
    await expect(pending).rejects.toMatchObject({code:'ACCESS_DENIED'});
  });
  it('rejects invalid UTF8 roundtrips and byte overflow instead of silently replacing or truncating text',async()=>{
    await expect(verifyLiteral('\ud800',await evidenceSha256('\ud800'),10,()=>true)).rejects.toThrow();
    await expect(verifyLiteral('ЯЯ',await evidenceSha256('ЯЯ'),3,()=>true)).rejects.toMatchObject({code:'LIMIT_EXCEEDED'});
  });
  it('requires strict cursor progress and complete contiguous event pages',async()=>{
    expect(()=>assertPage([{id:id(2)},{id:id(2)}],row=>row.id,null,id(2),100)).toThrow();
    const value=await manifest(),event=value.body.events[0],query={kind:'events' as const,stream_kind:'signature' as const,stream_id:signature,after_revision:0,through_revision:2,limit:100};
    expect(()=>assertEventPage({stream_kind:'signature',stream_id:signature,through_revision:2,events:[event],after_revision:0,next_after_revision:null},query)).toThrow();
    expect(()=>assertEventPage({stream_kind:'signature',stream_id:signature,through_revision:2,events:[event],after_revision:0,next_after_revision:1},query)).not.toThrow();
  });
  it('verifies both parties own policies/agreements and retains an old binding after recipient rebinding',async()=>{
    const value=await twoPartyManifest();await expect(verifyManifest(value,org,signature,id(35),()=>true)).resolves.toBeUndefined();
    expect(value.body.referenced_bindings).toHaveLength(3);expect(value.body.context.parties.sender.binding?.id).toBe(id(60));expect(value.body.context.parties.recipient.binding?.id).toBe(id(70));
    expect(value.body.events[2].binding_id).toBe(id(50));expect(value.body.events[3].agreement_event_id).not.toBe(value.body.events[2].agreement_event_id);
  });
  it('rejects opposite-party binding substitution even though the exact HTML hashes are identical',async()=>{
    const value=await twoPartyManifest();expect(value.body.referenced_bindings[0].document_html_sha256).toBe(value.body.referenced_bindings[1].document_html_sha256);
    value.body.events[3].binding_id=id(50);await rehash(value);await expect(verifyManifest(value,org,signature,id(35),()=>true)).rejects.toThrow();
  });
  it('never drops a replaced binding or adds an unrelated binding to complete whole history',async()=>{
    const missing=await twoPartyManifest();missing.body.referenced_bindings.shift();await rehash(missing);await expect(verifyManifest(missing,org,signature,id(35),()=>true)).rejects.toThrow();
    const extra=await twoPartyManifest();extra.body.referenced_bindings.push({...extra.body.referenced_bindings[0],id:id(999)});await rehash(extra);await expect(verifyManifest(extra,org,signature,id(35),()=>true)).rejects.toThrow();
  });
  it('matches original binding snapshots exactly and never reuses the peer confirmation snapshot',async()=>{
    const wrongRole=await twoPartyManifest();wrongRole.body.document_snapshots[3].party_role='recipient';await rehash(wrongRole);await expect(verifyManifest(wrongRole,org,signature,id(35),()=>true)).rejects.toThrow();
    const wrongOriginal=await twoPartyManifest();wrongOriginal.body.events[0].document_snapshot_id=id(52);await rehash(wrongOriginal);await expect(verifyManifest(wrongOriginal,org,signature,id(35),()=>true)).rejects.toThrow();
  });
  it('does not inherit a recipient agreement or identity for a sender account confirmation',async()=>{
    const value=await twoPartyManifest();value.body.events[3].agreement_event_id=value.body.events[2].agreement_event_id;value.body.events[3].agreement_sha256=value.body.events[2].agreement_sha256;
    await rehash(value);await expect(verifyManifest(value,org,signature,id(35),()=>true)).rejects.toThrow();
    const other=await twoPartyManifest();other.body.referenced_agreements[1].subject_user_id=id(999);other.body.referenced_agreements[1].actor.user_id=id(999);await rehash(other);await expect(verifyManifest(other,org,signature,id(35),()=>true)).rejects.toThrow();
  });
  it('does not swap independent current party contexts or revive an old current recipient binding',async()=>{
    const value=await twoPartyManifest();value.body.context.parties.recipient.binding=value.body.referenced_bindings[0];await rehash(value);await expect(verifyManifest(value,org,signature,id(35),()=>true)).rejects.toThrow();
    const swapped=await twoPartyManifest();swapped.body.context.parties.sender={...swapped.body.context.parties.recipient,party_role:'sender'};await rehash(swapped);await expect(verifyManifest(swapped,org,signature,id(35),()=>true)).rejects.toThrow();
  });
  it('preserves recorded evidence after a current source change but requires explicit ineligibility for both parties',async()=>{
    const value=await twoPartyManifest();value.body.context.current_document_html_sha256='c'.repeat(64);await rehash(value);
    await expect(verifyManifest(value,org,signature,id(35),()=>true)).rejects.toThrow();
    for(const party of Object.values(value.body.context.parties))party.requirements={...party.requirements,eligible:false,missing:['SOURCE_CHANGED']};await rehash(value);
    await expect(verifyManifest(value,org,signature,id(35),()=>true)).resolves.toBeUndefined();expect(value.body.events[3].conclusion).toBe('policy_eligible_account_confirmation');
  });
  it('uses the actual last global event revision per party rather than a party-local event count',async()=>{
    const value=await twoPartyManifest();expect(value.body.context.parties.sender.latest_party_event_revision).toBe(4);value.body.context.parties.sender.latest_party_event_revision=2;await rehash(value);
    await expect(verifyManifest(value,org,signature,id(35),()=>true)).rejects.toThrow();
  });
  it('refuses a different account with its own internally consistent agreement when the recipient binding names a real account',async()=>{
    const value=await twoPartyManifest(),other=id(999);value.body.events[2].actor.user_id=other;
    value.body.referenced_agreements[0].subject_user_id=other;value.body.referenced_agreements[0].actor.user_id=other;await rehash(value);
    expect(value.body.referenced_bindings[0].recipient_user_id).not.toBe(other);
    await expect(verifyManifest(value,org,signature,id(35),()=>true)).rejects.toThrow();
  });
  it('derives current factual conclusion from the last role event and never invents confirmation after rebind or with zero role events',async()=>{
    const rebound=await twoPartyManifest();rebound.body.context.parties.recipient.conclusion='policy_eligible_account_confirmation';await rehash(rebound);
    expect(rebound.body.events[4].conclusion).toBe('not_confirmed');await expect(verifyManifest(rebound,org,signature,id(35),()=>true)).rejects.toThrow();
    const empty=await manifest();empty.body.context.parties.sender.conclusion='factual_confirmation';await rehash(empty);await expect(verifyManifest(empty,org,signature,id(35),()=>true)).rejects.toThrow();
    empty.body.context.parties.sender.conclusion='legacy_unknown';await rehash(empty);await expect(verifyManifest(empty,org,signature,id(35),()=>true)).rejects.toThrow();
    empty.body.context.legacy_evidence_available=true;await rehash(empty);await expect(verifyManifest(empty,org,signature,id(35),()=>true)).resolves.toBeUndefined();
  });
});
