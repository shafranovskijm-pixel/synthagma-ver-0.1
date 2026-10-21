import {describe,it,expect} from 'vitest';
import {renderSessionDraft} from '../draft';
import {draft} from './fixtures';
describe('source-pinned draft artifact',()=>{
 it('renders explicit attendance and provenance with draft-only status',()=>{
  const d=draft(),html=renderSessionDraft(d);expect(html).toContain('Присутствовал');expect(html).toContain(d.draft.id);expect(html).toContain(d.draft.content_hash);expect(html).toContain('Документ не выдан, не подписан');expect(html).toContain(d.draft.source_proof!.session_version_id);
 });
 it('escapes observed names, topics and embedded source JSON',()=>{
  const d=draft();d.draft.source_proof!.attendance[0].subject_label='<img src=x onerror=alert(1)>';d.draft.source_proof!.session_source.lesson.topic='</pre><script>alert(1)</script>';const html=renderSessionDraft(d);expect(html).not.toContain('<script>');expect(html).not.toContain('<img');expect(html).toContain('&lt;img');expect(html).toContain('&lt;/pre&gt;');
 });
 it('refuses export after corrections, erasure or source invalidation',()=>{
  for(const change of [{source_current:false},{redacted:true},{source_proof:null}]){const d=draft();Object.assign(d.draft,change);expect(()=>renderSessionDraft(d)).toThrow('UC_SESSION_SOURCE_UNAVAILABLE');}
 });
});
