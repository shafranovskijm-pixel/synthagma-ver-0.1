import { useLayoutEffect } from 'react';
import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { actor,org,uid } from '@/lib/educationIssuance/__tests__/fixtures';
import { createDocumentUploadOperation } from '@/lib/orgDocumentLifecycle';
const mock=vi.hoisted(()=>({current:true,list:vi.fn(),readOne:vi.fn(),prepare:vi.fn(),run:vi.fn(),panel:vi.fn(),versions:vi.fn(),session:vi.fn(),identity:vi.fn(),rpc:vi.fn(),headers:vi.fn(),upload:vi.fn(),fetch:vi.fn(),returnTo:vi.fn(),change:vi.fn()}));
vi.mock('@/utils/courseCache',()=>({captureOfflineContext:()=>({actorId:'00000000-0000-4000-8000-000000000001',revision:1}),isOfflineActorCurrent:()=>mock.current}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:mock.session,getUser:mock.identity},rpc:mock.rpc,storage:{from:()=>({upload:mock.upload,getPublicUrl:(path:string)=>({data:{publicUrl:'https://safe.invalid/storage/v1/object/public/org-documents/'+path}})})}}}));
vi.mock('@/utils/proxyFetch',()=>({proxiedAssetUrl:(url:string)=>url}));
vi.mock('@/lib/educationIssuance/templateCreation',async original=>({...await original<typeof import('@/lib/educationIssuance/templateCreation')>(),listIssuanceTemplateDocuments:mock.list,readIssuanceTemplateDocument:mock.readOne,prepareIssuanceTemplateCreation:mock.prepare}));
vi.mock('@/components/organization/documents/OrgDocumentWorkflowPanel',()=>({OrgDocumentWorkflowPanel:(props:any)=>{mock.panel(props);return <div>Обычная проверка {props.documentId}/{props.currentVersionId} режим {props.sourceOpenMode}</div>;}}));
vi.mock('@/components/organization/OrgDocumentVersionsDialog',()=>({OrgDocumentVersionsDialog:(props:any)=>{mock.versions(props);return <div>История {props.documentId} режим {props.sourceOpenMode}<button onClick={props.onRestored}>Новая версия загружена</button><button onClick={()=>props.onOpenChange(false)}>Закрыть историю</button></div>;}}));
import { issuanceScopeCurrent } from '@/lib/educationIssuance/client';
import { IssuanceTemplateDialog } from '../TemplateCreateDialog';
const scope={actorId:actor,accessRevision:1,organizationId:org,issuanceScope:{kind:'organization' as const},current:()=>true};
const saved={id:uid(971),organization_id:org,type:'education_issuance_template' as const,name:'Новый макет',document_revision:1,current_version_id:uid(972),status:'active' as const,deleted_at:null};
const component=(open=true,canWrite=true,s=scope)=><IssuanceTemplateDialog open={open} onOpenChange={mock.change} scope={s} canWrite={canWrite} onReturnToTemplates={mock.returnTo}/>;
async function input(){await waitFor(()=>expect(screen.getByRole('button',{name:'Сохранить новый шаблон'})).toBeDisabled());fireEvent.change(screen.getByLabelText('Название нового шаблона'),{target:{value:'Новый макет'}});fireEvent.change(screen.getByLabelText('HTML-файл в UTF-8, до 1 МБ'),{target:{files:[new File(['<p>Пример</p>'],'новый.html',{type:'text/html'})]}});await waitFor(()=>expect(screen.getByRole('button',{name:'Сохранить новый шаблон'})).toBeEnabled());}
beforeEach(()=>{vi.clearAllMocks();mock.current=true;mock.session.mockResolvedValue({data:{session:{user:{id:actor},access_token:'original-A'}},error:null});mock.identity.mockResolvedValue({data:{user:{id:actor}},error:null});mock.upload.mockResolvedValue({error:null});mock.rpc.mockImplementation(()=>({setHeader:async(key:string,value:string)=>{mock.headers(key,value);return {data:{ok:true},error:null};}}));mock.list.mockResolvedValue({items:[],next:null});mock.readOne.mockResolvedValue(saved);mock.run.mockResolvedValue(saved);mock.prepare.mockResolvedValue({documentId:saved.id,requestId:uid(973),name:saved.name,fileName:'новый.html',run:mock.run});});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('new and saved issuance template dialog',()=>{
 it('creates a separate file, opens exact existing UC011 review, and never automatically approves or selects it for issuance',async()=>{
  render(component());await input();fireEvent.click(screen.getByRole('button',{name:'Сохранить новый шаблон'}));expect(await screen.findByText('Обычная проверка '+saved.id+'/'+saved.current_version_id+' режим download')).toBeInTheDocument();
  expect(mock.prepare).toHaveBeenCalledTimes(1);expect(mock.prepare.mock.calls[0][1]).toBe('Новый макет');expect(mock.prepare.mock.calls[0][2].name).toBe('новый.html');expect(mock.returnTo).not.toHaveBeenCalled();
  expect(screen.queryByRole('button',{name:/Утвердить автоматически/})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Вернуться к выбору утверждённой версии'}));expect(mock.change).toHaveBeenCalledWith(false);expect(mock.returnTo).toHaveBeenCalledTimes(1);
 });
 it('recovers a pending independent template from server after reload without another upload or approval',async()=>{
  mock.list.mockResolvedValue({items:[saved],next:null});const view=render(component());fireEvent.click(await screen.findByRole('button',{name:'Открыть проверку'}));expect(screen.getByText('Обычная проверка '+saved.id+'/'+saved.current_version_id+' режим download')).toBeInTheDocument();expect(mock.prepare).not.toHaveBeenCalled();expect(mock.run).not.toHaveBeenCalled();expect(mock.returnTo).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Файлы и версии шаблона'}));expect(await screen.findByText('История '+saved.id+' режим download')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Закрыть историю'}));expect(await screen.findByText('Обычная проверка '+saved.id+'/'+saved.current_version_id+' режим download')).toBeInTheDocument();view.unmount();render(component());expect(await screen.findByRole('button',{name:'Открыть проверку'})).toBeInTheDocument();expect(mock.prepare).not.toHaveBeenCalled();
 });
 it('keeps the same operation and frozen fields after an unknown response, and retries only on explicit click',async()=>{
  mock.run.mockRejectedValueOnce(Error('network'));render(component());await input();fireEvent.click(screen.getByRole('button',{name:'Сохранить новый шаблон'}));const retry=await screen.findByRole('button',{name:'Повторить то же сохранение'});await waitFor(()=>expect(retry).toBeEnabled());expect(screen.getByLabelText('Название нового шаблона')).toBeDisabled();expect(mock.prepare).toHaveBeenCalledTimes(1);fireEvent.click(retry);await screen.findByText('Обычная проверка '+saved.id+'/'+saved.current_version_id+' режим download');expect(mock.prepare).toHaveBeenCalledTimes(1);expect(mock.run).toHaveBeenCalledTimes(2);
 });
 it('permanently invalidates pending save across close→reopen of the same actor/group and discards its late callback',async()=>{
  let finish!:(value:typeof saved)=>void;const pending=new Promise<typeof saved>(done=>{finish=done;});mock.run.mockReturnValue(pending);const view=render(component());await input();fireEvent.click(screen.getByRole('button',{name:'Сохранить новый шаблон'}));await waitFor(()=>expect(mock.run).toHaveBeenCalledTimes(1));const oldScope=mock.run.mock.calls[0][0];view.rerender(component(false));view.rerender(component(true));expect(issuanceScopeCurrent(oldScope)).toBe(false);await act(async()=>{finish(saved);await pending;});expect(screen.queryByText('Обычная проверка '+saved.id+'/'+saved.current_version_id+' режим download')).toBeNull();expect(mock.returnTo).not.toHaveBeenCalled();expect(mock.run).toHaveBeenCalledTimes(1);
 });
 it('invalidates an old actor/org scope after A→B→A without reading or restoring stale template details',async()=>{
  let finish!:(value:any)=>void;mock.list.mockReturnValueOnce(new Promise(done=>{finish=done;}));const view=render(component());await waitFor(()=>expect(mock.list).toHaveBeenCalledTimes(1));const oldScope=mock.list.mock.calls[0][0];const other={...scope,organizationId:uid(980)};view.rerender(component(true,true,other));view.rerender(component());expect(issuanceScopeCurrent(oldScope)).toBe(false);await act(async()=>finish({items:[saved],next:null}));expect(screen.queryByText(saved.name)).toBeNull();expect(mock.prepare).not.toHaveBeenCalled();
 });

 it('does not assign a deferred PREPARE result after close→reopen, so the new form is not frozen by a stale operation',async()=>{
  let finish!:(value:any)=>void;mock.prepare.mockReturnValueOnce(new Promise(done=>{finish=done;}));const view=render(component());await input();fireEvent.click(screen.getByRole('button',{name:'Сохранить новый шаблон'}));await waitFor(()=>expect(mock.prepare).toHaveBeenCalledTimes(1));const oldScope=mock.prepare.mock.calls[0][0];view.rerender(component(false));view.rerender(component());await act(async()=>finish({documentId:saved.id,run:mock.run}));expect(issuanceScopeCurrent(oldScope)).toBe(false);await waitFor(()=>expect(screen.getByLabelText('Название нового шаблона')).toBeEnabled());expect(screen.getByRole('button',{name:'Сохранить новый шаблон'})).toBeInTheDocument();expect(mock.run).not.toHaveBeenCalled();
 });
 it('does not let an old-org deferred PREPARE overwrite a new-org successful operation',async()=>{
  let finish!:(value:any)=>void;mock.prepare.mockReturnValueOnce(new Promise(done=>{finish=done;}));const view=render(component());await input();fireEvent.click(screen.getByRole('button',{name:'Сохранить новый шаблон'}));await waitFor(()=>expect(mock.prepare).toHaveBeenCalledTimes(1));view.rerender(component(true,true,{...scope,organizationId:uid(980)}));await input();fireEvent.click(screen.getByRole('button',{name:'Сохранить новый шаблон'}));await screen.findByText('Обычная проверка '+saved.id+'/'+saved.current_version_id+' режим download');await act(async()=>finish({documentId:uid(981),run:vi.fn()}));expect(mock.run).toHaveBeenCalledTimes(1);expect(screen.getByText('Обычная проверка '+saved.id+'/'+saved.current_version_id+' режим download')).toBeInTheDocument();
 });
 it('refreshes a selected later-page template by its exact ID after a new version, instead of retaining the old page-omitted version',async()=>{
  const first={...saved,id:uid(970),name:'Первый шаблон'},updated={...saved,current_version_id:uid(979),document_revision:2};mock.list.mockResolvedValueOnce({items:[first],next:first.id}).mockResolvedValueOnce({items:[saved],next:null}).mockResolvedValue({items:[first],next:first.id});render(component());fireEvent.click(await screen.findByRole('button',{name:'Ещё шаблоны'}));await screen.findByText(saved.name);fireEvent.click(screen.getAllByRole('button',{name:'Открыть проверку'})[1]);expect(screen.getByText('Обычная проверка '+saved.id+'/'+saved.current_version_id+' режим download')).toBeInTheDocument();mock.readOne.mockResolvedValue(updated);fireEvent.click(screen.getByRole('button',{name:'Файлы и версии шаблона'}));fireEvent.click(screen.getByRole('button',{name:'Новая версия загружена'}));fireEvent.click(screen.getByRole('button',{name:'Закрыть историю'}));expect(await screen.findByText('Обычная проверка '+saved.id+'/'+updated.current_version_id+' режим download')).toBeInTheDocument();expect(mock.readOne).toHaveBeenCalledWith(expect.anything(),saved.id);expect(mock.prepare).not.toHaveBeenCalled();
 });
 it('masks a selected template when its exact reread becomes unavailable instead of retaining the cached version',async()=>{
  mock.list.mockResolvedValue({items:[saved],next:null});render(component());fireEvent.click(await screen.findByRole('button',{name:'Открыть проверку'}));expect(screen.getByText('Обычная проверка '+saved.id+'/'+saved.current_version_id+' режим download')).toBeInTheDocument();mock.readOne.mockResolvedValue(null);fireEvent.click(screen.getByRole('button',{name:'Обновить список'}));expect(await screen.findByRole('alert')).toHaveTextContent('недоступен');expect(screen.queryByText('Обычная проверка '+saved.id+'/'+saved.current_version_id+' режим download')).toBeNull();
 });
 it('passes a captured guard and AbortSignal which stay invalid after closing and reopening the same template',async()=>{
  mock.list.mockResolvedValue({items:[saved],next:null});const view=render(component());fireEvent.click(await screen.findByRole('button',{name:'Открыть проверку'}));const captured=mock.panel.mock.calls.at(-1)![0];expect(()=>captured.sourceDownloadAssertCurrent()).not.toThrow();expect(captured.sourceDownloadSignal.aborted).toBe(false);view.rerender(component(false));view.rerender(component());expect(captured.sourceDownloadSignal.aborted).toBe(true);expect(()=>captured.sourceDownloadAssertCurrent()).toThrow();
 });
 it('hides old-owner template names and review identifiers in the layout phase before passive reset effects, including observed A to B to A',async()=>{
  mock.list.mockResolvedValueOnce({items:[saved],next:null}).mockResolvedValue({items:[],next:null});const seen:string[]=[];
  function Observe({value}:{value:typeof scope}){useLayoutEffect(()=>{seen.push(document.body.textContent??'');},[value]);return component(true,true,value);}
  const view=render(<Observe value={scope}/>);fireEvent.click(await screen.findByRole('button',{name:'Открыть проверку'}));expect(screen.getByText('Обычная проверка '+saved.id+'/'+saved.current_version_id+' режим download')).toBeInTheDocument();view.rerender(<Observe value={{...scope,organizationId:uid(990)}}/>);expect(seen.at(-1)).not.toContain(saved.name);expect(seen.at(-1)).not.toContain(saved.id);view.rerender(<Observe value={scope}/>);expect(seen.at(-1)).not.toContain(saved.name);expect(seen.at(-1)).not.toContain(saved.id);expect(mock.readOne).not.toHaveBeenCalled();expect(mock.prepare).not.toHaveBeenCalled();
 });
 it('denies creation and recovery actions when current write authority is absent',()=>{render(component(true,false));expect(screen.getByRole('alert')).toHaveTextContent('доступ');expect(screen.queryByRole('button',{name:'Сохранить новый шаблон'})).toBeNull();expect(mock.list).not.toHaveBeenCalled();expect(mock.prepare).not.toHaveBeenCalled();});

 it('passes the actual verified original-actor transport into BOTH workflow and version widgets',async()=>{
  mock.list.mockResolvedValue({items:[saved],next:null});render(component());fireEvent.click(await screen.findByRole('button',{name:'Открыть проверку'}));
  const review=mock.panel.mock.calls.at(-1)![0].transport;expect(review).toBeDefined();
  await expect(review.rpc('save_org_document_review_draft',{p_document_id:saved.id})).resolves.toEqual({data:{ok:true},error:null});
  expect(mock.identity).toHaveBeenCalledWith('original-A');expect(mock.headers).toHaveBeenCalledWith('Authorization','Bearer original-A');
  fireEvent.click(screen.getByRole('button',{name:'Файлы и версии шаблона'}));const versions=mock.versions.mock.calls.at(-1)![0].transport;
  expect(versions).toBeDefined();expect(versions.key).not.toBe(review.key);expect(()=>review.assertCurrent()).toThrow();expect(()=>versions.assertCurrent()).not.toThrow();
 });
 it('refuses a deferred review mutation after close→reopen even if the session returns the original actor',async()=>{
  mock.list.mockResolvedValue({items:[saved],next:null});const view=render(component());fireEvent.click(await screen.findByRole('button',{name:'Открыть проверку'}));
  const transport=mock.panel.mock.calls.at(-1)![0].transport;let release!:(value:any)=>void;mock.session.mockReturnValueOnce(new Promise(done=>{release=done;}));
  const pending=transport.rpc('save_org_document_review_draft',{p_document_id:saved.id});const rejected=expect(pending).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await waitFor(()=>expect(mock.session).toHaveBeenCalledOnce());view.rerender(component(false));view.rerender(component());
  await act(async()=>release({data:{session:{user:{id:actor},access_token:'original-A'}},error:null}));await rejected;
  expect(mock.identity).not.toHaveBeenCalled();expect(mock.rpc).not.toHaveBeenCalled();
 });
 it('pins the outgoing review mutation to A after the global session swaps to B and refuses its late result',async()=>{
  mock.list.mockResolvedValue({items:[saved],next:null});const view=render(component());fireEvent.click(await screen.findByRole('button',{name:'Открыть проверку'}));
  const transport=mock.panel.mock.calls.at(-1)![0].transport;let identity!:(value:any)=>void,finish!:(value:any)=>void;
  mock.identity.mockReturnValueOnce(new Promise(done=>{identity=done;}));mock.rpc.mockImplementation(()=>({setHeader:(key:string,value:string)=>{mock.headers(key,value);return new Promise(done=>{finish=done;});}}));
  const pending=transport.rpc('save_org_document_review_draft',{p_document_id:saved.id});const rejected=expect(pending).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await waitFor(()=>expect(mock.identity).toHaveBeenCalledWith('original-A'));mock.session.mockResolvedValue({data:{session:{user:{id:uid(999)},access_token:'new-B'}},error:null});
  await act(async()=>identity({data:{user:{id:actor}},error:null}));await waitFor(()=>expect(mock.headers).toHaveBeenCalledWith('Authorization','Bearer original-A'));
  view.rerender(component(false));view.rerender(component());await act(async()=>finish({data:{ok:true},error:null}));await rejected;
  expect(mock.headers).not.toHaveBeenCalledWith('Authorization','Bearer new-B');expect(mock.rpc).toHaveBeenCalledOnce();
 });
 it('stops an HTML version upload before commit after the versions surface closes and reopens (ABA)',async()=>{
  mock.list.mockResolvedValue({items:[saved],next:null});render(component());fireEvent.click(await screen.findByRole('button',{name:'Открыть проверку'}));fireEvent.click(screen.getByRole('button',{name:'Файлы и версии шаблона'}));
  const transport=mock.versions.mock.calls.at(-1)![0].transport;let release!:(value:any)=>void;mock.upload.mockReturnValueOnce(new Promise(done=>{release=done;}));
  const operation=createDocumentUploadOperation({organizationId:org,documentId:saved.id,expectedRevision:1,file:new File(['<p>Exact HTML template</p>'],'template.html',{type:'text/html'})});
  const pending=transport.saveUpload(operation),rejected=expect(pending).rejects.toThrow('Выбранный шаблон изменился.');await waitFor(()=>expect(mock.upload).toHaveBeenCalledOnce());
  expect(mock.upload.mock.calls[0][2]).toEqual(expect.objectContaining({headers:{Authorization:'Bearer original-A'},upsert:false,contentType:'text/html'}));
  fireEvent.click(screen.getByRole('button',{name:'Закрыть историю'}));await screen.findByText('Обычная проверка '+saved.id+'/'+saved.current_version_id+' режим download');await waitFor(()=>expect(screen.getByRole('button',{name:'Файлы и версии шаблона'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Файлы и версии шаблона'}));
  expect(mock.versions.mock.calls.at(-1)![0].transport.key).not.toBe(transport.key);await act(async()=>release({error:null}));await rejected;expect(mock.rpc).not.toHaveBeenCalled();
 });
 it('refuses the old selected-document transport after selecting A→B→A before deferred auth returns',async()=>{
  const other={...saved,id:uid(981),current_version_id:uid(982),name:'Другой шаблон'};mock.list.mockResolvedValue({items:[saved,other],next:null});render(component());fireEvent.click((await screen.findAllByRole('button',{name:'Открыть проверку'}))[0]);
  const transport=mock.panel.mock.calls.at(-1)![0].transport;let release!:(value:any)=>void;mock.session.mockReturnValueOnce(new Promise(done=>{release=done;}));
  const pending=transport.rpc('save_org_document_review_draft',{p_document_id:saved.id}),rejected=expect(pending).rejects.toThrow('Выбранный шаблон изменился.');await waitFor(()=>expect(mock.session).toHaveBeenCalledOnce());
  fireEvent.click(screen.getAllByRole('button',{name:'Открыть проверку'})[1]);fireEvent.click(screen.getAllByRole('button',{name:'Открыть проверку'})[0]);
  await act(async()=>release({data:{session:{user:{id:actor},access_token:'original-A'}},error:null}));await rejected;expect(mock.rpc).not.toHaveBeenCalled();expect(()=>mock.panel.mock.calls.at(-1)![0].transport.assertCurrent()).not.toThrow();
 });
 it('refuses a captured mutation after organization scope A→B→A without reusing its authorization',async()=>{
  mock.list.mockResolvedValue({items:[saved],next:null});const view=render(component());fireEvent.click(await screen.findByRole('button',{name:'Открыть проверку'}));const transport=mock.panel.mock.calls.at(-1)![0].transport;
  let release!:(value:any)=>void;mock.session.mockReturnValueOnce(new Promise(done=>{release=done;}));const pending=transport.rpc('save_org_document_review_draft',{p_document_id:saved.id}),rejected=expect(pending).rejects.toMatchObject({code:'ACCESS_DENIED'});await waitFor(()=>expect(mock.session).toHaveBeenCalledOnce());
  view.rerender(component(true,true,{...scope,organizationId:uid(987)}));view.rerender(component());await act(async()=>release({data:{session:{user:{id:actor},access_token:'original-A'}},error:null}));await rejected;expect(mock.rpc).not.toHaveBeenCalled();
 });
 it('pins the HTML signer to A and refuses its deferred URL after access closes and returns',async()=>{
  vi.stubEnv('VITE_SUPABASE_URL','https://safe.invalid');vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY','synthetic-public-key');vi.stubGlobal('fetch',mock.fetch);
  mock.list.mockResolvedValue({items:[saved],next:null});const view=render(component());fireEvent.click(await screen.findByRole('button',{name:'Открыть проверку'}));const transport=mock.panel.mock.calls.at(-1)![0].transport;
  let release!:(value:Response)=>void;mock.fetch.mockReturnValueOnce(new Promise(done=>{release=done;}));const path=org+'/versions/'+saved.id+'/template.html';
  const pending=transport.signUrl({bucket:'org-documents',path,expiresIn:60,downloadName:'template.html',signal:new AbortController().signal,deadline:Date.now()+45000}),rejected=expect(pending).rejects.toMatchObject({code:'ACCESS_DENIED'});
  await waitFor(()=>expect(mock.fetch).toHaveBeenCalledOnce());expect(mock.fetch.mock.calls[0][1]).toEqual(expect.objectContaining({method:'POST',headers:expect.objectContaining({Authorization:'Bearer original-A'}),credentials:'omit',redirect:'error'}));
  view.rerender(component(true,false));view.rerender(component());await act(async()=>release(new Response(JSON.stringify({signedURL:'/object/sign/org-documents/'+path+'?token=synthetic-test-token'}),{headers:{'content-type':'application/json'}})));await rejected;expect(mock.rpc).not.toHaveBeenCalled();
 });

});
