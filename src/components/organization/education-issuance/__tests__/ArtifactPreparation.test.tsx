import {useLayoutEffect,useState} from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {actor,org,preparation,uid} from '@/lib/educationIssuance/__tests__/fixtures';
import type {IssuancePreparation} from '@/lib/educationIssuance/types';
const mock=vi.hoisted(()=>({current:true,read:vi.fn(),create:vi.fn(),render:vi.fn(),renderRun:vi.fn(),recover:vi.fn(),open:vi.fn(),panel:vi.fn(),session:vi.fn(),identity:vi.fn(),rpc:vi.fn(),headers:vi.fn()}));
vi.mock('@/hooks/useDocumentActionPermissions',()=>({useDocumentActionPermissions:()=>({canWrite:true})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:mock.session,getUser:mock.identity},rpc:mock.rpc}}));
vi.mock('@/lib/educationIssuance/client',async original=>({...await original<typeof import('@/lib/educationIssuance/client')>(),readEducationIssuance:mock.read,prepareEducationIssuanceArtifacts:mock.create}));
vi.mock('@/utils/courseCache',()=>({captureOfflineContext:()=>({actorId:'00000000-0000-4000-8000-000000000001',revision:1}),isOfflineActorCurrent:()=>mock.current}));
vi.mock('@/lib/educationIssuance/artifactWorker',()=>({prepareArtifactRender:mock.render}));
vi.mock('@/components/organization/documents/OrgDocumentWorkflowPanel',()=>({OrgDocumentWorkflowPanel:(props:any)=>{mock.panel(props);return <div>Проверка точной версии: {props.documentId}/{props.currentVersionId}</div>;}}));
import {issuanceScopeCurrent} from '@/lib/educationIssuance/client';
import {IssuanceArtifactPreparation,IssuancePreparationRecovery} from '../ArtifactPreparation';
const scope={actorId:actor,accessRevision:1,organizationId:org,issuanceScope:{kind:'organization' as const},current:()=>true};
function Harness({mismatch=false}:{mismatch?:boolean}){const [prep,setPrep]=useState<IssuancePreparation|null>(preparation());const {template,...draft}=preparation().plan;return <IssuanceArtifactPreparation scope={scope} draft={{...draft,...(mismatch?{reason:'Другое решение'}:{})} as any} preparation={prep} onChange={setPrep} onLockChange={()=>undefined}/>;}
beforeEach(()=>{vi.clearAllMocks();mock.current=true;mock.renderRun.mockResolvedValue(preparation('rendered_unissued'));mock.render.mockReturnValue({requestId:'same-render',run:mock.renderRun});mock.session.mockResolvedValue({data:{session:{user:{id:actor},access_token:'original-A'}},error:null});mock.identity.mockResolvedValue({data:{user:{id:actor}},error:null});mock.rpc.mockImplementation(()=>({setHeader:async(key:string,value:string)=>{mock.headers(key,value);return {data:{ok:true},error:null};}}));});
afterEach(cleanup);
describe('private unissued artifact workflow UI',()=>{
 it('renders a saved but unissued PDF and opens exact existing internal review without approving or finalizing',async()=>{render(<Harness/>);fireEvent.click(screen.getByRole('button',{name:'Сформировать ожидающие PDF'}));await screen.findByText('PDF сохранён, выдачи нет');expect(mock.create).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Открыть файл и внутреннее утверждение'}));const artifact=preparation('rendered_unissued').items[0].artifact!;expect(await screen.findByText('Проверка точной версии: '+artifact.source.document_id+'/'+artifact.source.version_id)).toBeInTheDocument();expect(screen.queryByText('Выдача зарегистрирована')).toBeNull();});
 it('does not render an artifact prepared for a different operator decision',()=>{render(<Harness mismatch/>);expect(screen.queryByRole('button',{name:'Сформировать ожидающие PDF'})).toBeNull();expect(screen.getByRole('alert')).toBeInTheDocument();expect(mock.render).not.toHaveBeenCalled();});
 it('invalidates the old draft scope permanently after draft A to B to A',async()=>{let resolve!:(value:IssuancePreparation)=>void;const pending=new Promise<IssuancePreparation>(done=>{resolve=done;});mock.renderRun.mockReturnValue(pending);const prep=preparation();if(prep.plan.kind!=='original')throw Error('fixture');prep.plan.reason='A';const {template,...draft}=prep.plan,onChange=vi.fn();const component=(reason:string)=><IssuanceArtifactPreparation scope={scope} draft={{...draft,reason} as any} preparation={prep} onChange={onChange} onLockChange={()=>undefined}/>;const view=render(component('A'));fireEvent.click(screen.getByRole('button',{name:'Сформировать ожидающие PDF'}));const oldScope=mock.render.mock.calls[0][0];view.rerender(component('B'));view.rerender(component('A'));expect(issuanceScopeCurrent(oldScope)).toBe(false);await act(async()=>{resolve(preparation('rendered_unissued'));await pending;});expect(onChange).not.toHaveBeenCalled();});
 it('keeps new or pending templates outside issue selection until the normal approved query confirms a version',async()=>{mock.read.mockResolvedValue({kind:'templates',items:[],next_after_version_id:null});const {template,...draft}=preparation().plan;render(<IssuanceArtifactPreparation scope={scope} draft={draft} preparation={null} onChange={()=>undefined} onLockChange={()=>undefined}/>);expect(screen.getByRole('button',{name:'Новый шаблон'})).toBeEnabled();fireEvent.click(screen.getByRole('button',{name:'Выбрать утверждённый HTML-шаблон'}));await waitFor(()=>expect(mock.read).toHaveBeenCalledWith(expect.anything(),{kind:'templates',after_version_id:null,limit:100}));expect(screen.getByRole('button',{name:'Создать подготовку файлов'})).toBeDisabled();expect(mock.create).not.toHaveBeenCalled();});
 it('recovers consumed preparation as existing records without attempting a new eligibility preview or issuance',async()=>{const consumed=preparation('consumed');mock.read.mockImplementation(async(_scope,query)=>query.kind==='preparations'?{kind:'preparations',items:[{id:consumed.id,kind:'original',created_at:consumed.created_at,item_count:1,prepared_count:0,rendered_unissued_count:0,approved_unissued_count:0,consumed_count:1,stale_count:0}],next_after_id:null}:{kind:'preparation',preparation:consumed});render(<IssuancePreparationRecovery scope={scope} kind="original" onRecover={mock.recover} onOpenRecord={mock.open}/>);fireEvent.click(screen.getByText('Продолжить сохранённую подготовку'));fireEvent.click(screen.getByRole('button',{name:'Показать подготовки'}));fireEvent.click(await screen.findByRole('button',{name:'Продолжить'}));fireEvent.click(await screen.findByRole('button',{name:/Открыть зарегистрированный документ/}));expect(mock.open).toHaveBeenCalledWith(consumed.items[0].final_record_id);expect(mock.recover).not.toHaveBeenCalled();expect(mock.create).not.toHaveBeenCalled();expect(mock.render).not.toHaveBeenCalled();});
});

const outputComponent=(value=preparation('rendered_unissued'),s=scope)=><IssuanceArtifactPreparation scope={s} draft={(({template,...draft})=>draft)(value.plan)} preparation={value} onChange={()=>undefined} onLockChange={()=>undefined}/>;
const openOutput=()=>fireEvent.click(screen.getAllByRole('button',{name:'Открыть файл и внутреннее утверждение'})[0]);
describe('exact output review original-actor transport and lifetime',()=>{
 it('passes the verified original-actor transport and guarded private source into output approval without approving automatically',async()=>{
  render(outputComponent());openOutput();const captured=mock.panel.mock.calls.at(-1)![0];
  expect(captured.sourceOpenMode).toBe('download');expect(captured.sourceDownloadSignal.aborted).toBe(false);expect(()=>captured.sourceDownloadAssertCurrent()).not.toThrow();
  await expect(captured.transport.rpc('save_org_document_review_draft',{p_document_id:captured.documentId})).resolves.toEqual({data:{ok:true},error:null});
  expect(mock.identity).toHaveBeenCalledWith('original-A');expect(mock.headers).toHaveBeenCalledWith('Authorization','Bearer original-A');expect(mock.rpc).toHaveBeenCalledTimes(1);expect(mock.create).not.toHaveBeenCalled();expect(mock.render).not.toHaveBeenCalled();
 });
 it('pins the outgoing mutation to A despite a global session swap, and rejects its late response after observed actor/org ABA',async()=>{
  const value=preparation('rendered_unissued'),view=render(outputComponent(value));openOutput();const old=mock.panel.mock.calls.at(-1)![0];
  let identity!:(value:any)=>void,finish!:(value:any)=>void;mock.identity.mockReturnValueOnce(new Promise(done=>{identity=done;}));mock.rpc.mockImplementation(()=>({setHeader:(key:string,bearer:string)=>{mock.headers(key,bearer);return new Promise(done=>{finish=done;});}}));
  const pending=old.transport.rpc('save_org_document_review_draft',{p_document_id:old.documentId}),rejected=expect(pending).rejects.toThrow();
  await waitFor(()=>expect(mock.identity).toHaveBeenCalledWith('original-A'));mock.session.mockResolvedValue({data:{session:{user:{id:uid(999)},access_token:'new-B'}},error:null});
  await act(async()=>identity({data:{user:{id:actor}},error:null}));await waitFor(()=>expect(mock.headers).toHaveBeenCalledWith('Authorization','Bearer original-A'));
  view.rerender(outputComponent(value,{...scope,actorId:uid(999),organizationId:uid(998)}));view.rerender(outputComponent(value));
  await act(async()=>finish({data:{ok:true},error:null}));await rejected;expect(mock.headers).not.toHaveBeenCalledWith('Authorization','Bearer new-B');expect(()=>old.transport.assertCurrent()).toThrow();expect(old.sourceDownloadSignal.aborted).toBe(true);
 });
 it('stops before identity verification or RPC when an auth read finishes after the review closes and reopens',async()=>{
  render(outputComponent());openOutput();const old=mock.panel.mock.calls.at(-1)![0];let finish!:(value:any)=>void;mock.session.mockReturnValueOnce(new Promise(done=>{finish=done;}));
  const pending=old.transport.rpc('transition_org_document_review',{p_action:'submit'}),rejected=expect(pending).rejects.toThrow();await waitFor(()=>expect(mock.session).toHaveBeenCalledOnce());
  openOutput();openOutput();await act(async()=>finish({data:{session:{user:{id:actor},access_token:'original-A'}},error:null}));await rejected;
  expect(mock.identity).not.toHaveBeenCalled();expect(mock.rpc).not.toHaveBeenCalled();expect(()=>old.sourceDownloadAssertCurrent()).toThrow();expect(()=>mock.panel.mock.calls.at(-1)![0].sourceDownloadAssertCurrent()).not.toThrow();
 });
 it('invalidates the previous item even when both items refer to the same PDF version',()=>{
  const value=preparation('rendered_unissued');value.items.push({...structuredClone(value.items[0]),id:uid(951),enrollment_id:uid(952)});render(outputComponent(value));openOutput();const old=mock.panel.mock.calls.at(-1)![0];
  fireEvent.click(screen.getAllByRole('button',{name:'Открыть файл и внутреннее утверждение'})[1]);const next=mock.panel.mock.calls.at(-1)![0];
  expect(next.documentId).toBe(old.documentId);expect(next.currentVersionId).toBe(old.currentVersionId);expect(next.transport.key).not.toBe(old.transport.key);expect(()=>old.transport.assertCurrent()).toThrow();expect(()=>next.transport.assertCurrent()).not.toThrow();
 });
 it('does not revive a captured exact-version transport after version A to B to A',()=>{
  const value=preparation('rendered_unissued'),view=render(outputComponent(value));openOutput();const old=mock.panel.mock.calls.at(-1)![0];
  const changed=structuredClone(value);changed.items[0].artifact!.source.version_id=uid(953);view.rerender(outputComponent(changed));expect(mock.panel.mock.calls.at(-1)![0].currentVersionId).toBe(uid(953));view.rerender(outputComponent(value));
  expect(()=>old.transport.assertCurrent()).toThrow();expect(old.sourceDownloadSignal.aborted).toBe(true);expect(()=>mock.panel.mock.calls.at(-1)![0].transport.assertCurrent()).not.toThrow();
 });
 it('rejects the old preparation guard before parent layout on preparation replacement and whole-component removal',()=>{
  const value=preparation('rendered_unissued'),changed=structuredClone(value);changed.id=uid(954);let captured:any;const observations:boolean[]=[];
  function Observe({selected,show=true}:{selected:IssuancePreparation;show?:boolean}){useLayoutEffect(()=>{if(captured){try{captured.sourceDownloadAssertCurrent();observations.push(true);}catch{observations.push(false);}}},[selected,show]);return show?outputComponent(selected):null;}
  const view=render(<Observe selected={value}/>);openOutput();captured=mock.panel.mock.calls.at(-1)![0];view.rerender(<Observe selected={changed}/>);expect(observations.at(-1)).toBe(false);
  captured=mock.panel.mock.calls.at(-1)![0];expect(()=>captured.sourceDownloadAssertCurrent()).not.toThrow();view.rerender(<Observe selected={changed} show={false}/>);expect(observations.at(-1)).toBe(false);expect(captured.sourceDownloadSignal.aborted).toBe(true);
 });
});
