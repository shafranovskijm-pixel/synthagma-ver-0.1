import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { workflowEnvelope, workflowCandidates, ids } from '@/lib/__tests__/orgDocumentWorkflow.fixture';
import { programFixture, programCandidatesFixture, pfOrg } from '@/lib/__tests__/programFacts.fixture';
const legacy=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:legacy}));
import { useOrgDocumentWorkflow } from '../useOrgDocumentWorkflow';
import { useOrgDocumentVersions } from '../useOrgDocumentVersions';
import { useProgramFacts } from '../useProgramFacts';
import type { ScopedOrgDocumentTransport } from '@/lib/programFiles';
const deferred=<T,>()=>{let resolve!:(v:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};};
const ok=(data:unknown)=>({data,error:null});
function transport(key='A') {
  let current=true;
  const rpc=vi.fn(async(name:string)=>name==='get_org_document_workflow'?ok(workflowEnvelope()):name==='list_org_document_review_candidates'?ok(workflowCandidates()):name==='list_program_facts'?ok([programFixture()]):ok(programCandidatesFixture()));
  const value:ScopedOrgDocumentTransport={key,assertCurrent(){if(!current)throw Error('old scope');},signUrl:vi.fn(),rpc,
    readDocument:vi.fn(async()=>ok({id:ids.doc,organization_id:ids.org,document_revision:2,current_version_id:ids.version,deleted_at:null})),
    readVersions:vi.fn(async()=>ok([{id:ids.version,organization_id:ids.org,document_id:ids.doc,file_name:'Программа.pdf',file_url:'private',version_number:1}])),
    saveUpload:vi.fn(),restore:vi.fn()};
  return {value,rpc,close:()=>{current=false;}};
}
beforeEach(()=>{legacy.rpc.mockReset();legacy.from.mockReset();});
describe('opt-in existing history/review/facts transport',()=>{
  it('keeps standard UC011 actions on the supplied current scope and does not use the global SDK',async()=>{
    const t=transport(),h=renderHook(()=>useOrgDocumentWorkflow(ids.org,ids.doc,ids.version,t.value));await waitFor(()=>expect(h.result.current.data).not.toBeNull());
    expect(t.rpc.mock.calls.map(c=>c[0])).toEqual(['get_org_document_workflow','list_org_document_review_candidates']);
    t.close();await act(async()=>expect(await h.result.current.transition('submit')).toBe(false));expect(legacy.rpc).not.toHaveBeenCalled();expect(t.rpc).toHaveBeenCalledTimes(2);
  });
  it('suppresses a scoped workflow read that finishes after a close without requesting a new selector',async()=>{
    const t=transport(),slow=deferred<ReturnType<typeof ok>>();t.rpc.mockImplementationOnce(()=>slow.promise);
    const h=renderHook(()=>useOrgDocumentWorkflow(ids.org,ids.doc,ids.version,t.value));t.close();
    await act(async()=>slow.resolve(ok(workflowEnvelope())));expect(h.result.current.data).toBeNull();
    // The actual transport rejects after awaits; this stub intentionally permits its result, testing the hook gate too.
    expect(legacy.rpc).not.toHaveBeenCalled();expect(t.rpc).toHaveBeenCalledOnce();
  });
  it('routes programme facts/candidates through the supplied transport and refuses a stale mutation',async()=>{
    const t=transport(),h=renderHook(()=>useProgramFacts(pfOrg,true,t.value));await waitFor(()=>expect(h.result.current.programs).toHaveLength(1));
    t.close();await act(async()=>expect(await h.result.current.transition(programFixture().program.id,programFixture().current_version!.id,'submit')).toBe(false));
    expect(legacy.rpc).not.toHaveBeenCalled();expect(t.rpc.mock.calls.map(c=>c[0])).toEqual(['list_program_facts','list_program_facts_candidates']);
  });
  it('masks old history immediately when a new transport owner replaces the same document id',async()=>{
    const a=transport('A'),b=transport('B'),slow=deferred<ReturnType<typeof ok>>();b.value.readVersions=vi.fn(()=>slow.promise);
    const h=renderHook(({t})=>useOrgDocumentVersions(ids.doc,false,t),{initialProps:{t:a.value}});await waitFor(()=>expect(h.result.current.versions).toHaveLength(1));
    a.close();h.rerender({t:b.value});expect(h.result.current.versions).toEqual([]);expect(h.result.current.hasLoaded).toBe(false);
    await act(async()=>slow.resolve(ok([])));expect(h.result.current.versions).toEqual([]);expect(legacy.from).not.toHaveBeenCalled();
  });
  it('shows a retryable scoped initial history error while keeping unconfirmed history empty',async()=>{
    const t=transport();t.value.readVersions=vi.fn(async()=>({data:null,error:{message:'read unavailable'}}));
    const h=renderHook(()=>useOrgDocumentVersions(ids.doc,false,t.value));
    await waitFor(()=>expect(h.result.current.loadError).toMatch(/Не удалось загрузить историю/));
    expect(h.result.current.versions).toEqual([]);expect(h.result.current.hasLoaded).toBe(false);expect(h.result.current.canChange).toBe(false);expect(legacy.from).not.toHaveBeenCalled();
  });
});
