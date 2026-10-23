vi.mock('../SignatureAssuranceActions',()=>({SignatureAssuranceActions:()=>null}));
vi.mock('../SignatureAssuranceFiles',()=>({SignatureAssuranceFiles:()=>null}));
vi.mock('../SignaturePolicyManager',()=>({SignaturePolicyManager:()=>null}));
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {webcrypto} from 'node:crypto';
import {twoPartyManifest,org,signature} from '@/lib/signatureAssurance/__tests__/fixtures';
import type {SignatureAssuranceWorkspace} from '@/hooks/useSignatureAssuranceWorkspace';
import type {PreparedEvidenceDownload} from '@/lib/signatureAssurance/download';
const state=vi.hoisted(()=>({model:null as SignatureAssuranceWorkspace|null,calls:[]as unknown[][]}));
vi.mock('@/hooks/useSignatureAssuranceWorkspace',()=>({useSignatureAssuranceWorkspace:(...args:unknown[])=>{state.calls.push(args);return state.model;}}));
vi.mock('@/lib/signatureAssurance/client',()=>({signatureEvidenceMessages:new Proxy({},{get:(_target,key)=>'Сообщение: '+String(key)}),normalizeSignatureEvidenceError:(error:{code?:string})=>({code:error.code??'DEPENDENCY_UNAVAILABLE'})}));
import {SignatureEvidencePanel} from '../SignatureEvidencePanel';
beforeEach(async()=>{vi.stubGlobal('crypto',webcrypto);const manifest=await twoPartyManifest();state.calls=[];state.model={key:'scope-1',current:()=>true,context:manifest.body.context,events:manifest.body.events,historyThrough:5,historyComplete:true,next:null,loading:false,saving:false,pending:false,error:null,actionError:null,download:null,reload:vi.fn(),loadMore:vi.fn(),prepareDownload:vi.fn(),retryDownload:vi.fn()};});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();});
describe('truthful separate party evidence presentation',()=>{
  it('shows independent sender/recipient facts, missing new confirmation after rebind and unsupported verification methods without aggregate signed claims',()=>{
    render(<SignatureEvidencePanel organizationId={org} signatureId={signature}/>);
    expect(screen.getByText('Новое подтверждение не зафиксировано')).toBeInTheDocument();expect(screen.getByText('Учётная запись подтвердила документ по выбранным правилам')).toBeInTheDocument();
    expect(screen.getByText('Подтверждение через код из письма и проверка УКЭП пока не поддерживаются.')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(signature);expect(document.body.textContent).not.toContain('юридически подписан');expect(document.body.textContent).not.toContain('source_manifest_sha256');expect(document.body.textContent).not.toContain('signature_token');
  });
  it('selects the sender explicitly and labels participant names as declarations rather than verified identities',()=>{
    render(<SignatureEvidencePanel organizationId={org} signatureId={signature}/>);fireEvent.click(screen.getByRole('button',{name:'Отправитель'}));
    expect(state.calls.at(-1)).toEqual([org,signature,'sender',true]);expect(screen.getByText('История стороны «Отправитель»')).toBeInTheDocument();
    expect(screen.getAllByText(/Имя, указанное участником:/).length).toBeGreaterThan(0);expect(document.body.textContent).not.toContain('Личность подтверждена');
  });
  it('disposes a late prepared result after a changed captured owner without any browser handoff or stale success notice',async()=>{
    let release!:(value:PreparedEvidenceDownload)=>void,current=true;const ready={filename:'test.json',format:'json' as const,available:()=>true,handoff:vi.fn(),dispose:vi.fn()};
    state.model={...state.model!,current:()=>current,prepareDownload:vi.fn(()=>new Promise<PreparedEvidenceDownload>(resolve=>{release=resolve;}))};
    const view=render(<SignatureEvidencePanel organizationId={org} signatureId={signature}/>);fireEvent.click(screen.getByRole('button',{name:'Подготовить JSON'}));
    current=false;state.model={...state.model,key:'scope-2',context:null,events:[],download:null};view.rerender(<SignatureEvidencePanel organizationId={org} signatureId={signature}/>);
    await act(async()=>{release(ready);});expect(ready.dispose).toHaveBeenCalledOnce();expect(ready.handoff).not.toHaveBeenCalled();expect(screen.queryByText('Файл передан на скачивание.')).not.toBeInTheDocument();
  });
  it('keeps a verified download fallback after an automatic handoff failure and uses accurate prepared wording',async()=>{
    let clicks=0;const ready={filename:'test.json',format:'json' as const,available:()=>true,handoff:vi.fn(()=>{if(++clicks===1)throw new Error('SYNTHETIC_DOWNLOAD_FAILURE');}),dispose:vi.fn()};
    state.model={...state.model!,prepareDownload:vi.fn(async()=>{state.model={...state.model!,download:ready};return ready;})};
    render(<SignatureEvidencePanel organizationId={org} signatureId={signature}/>);fireEvent.click(screen.getByRole('button',{name:'Подготовить JSON'}));
    await waitFor(()=>expect(screen.getByRole('button',{name:'Скачать'})).toBeInTheDocument());expect(screen.getByText(/Выгрузка готова: JSON/)).toBeInTheDocument();
    expect(screen.getByText('Не удалось начать автоматическое скачивание. Файл подготовлен; используйте кнопку ниже.')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Скачать'}));expect(ready.handoff).toHaveBeenCalledTimes(2);expect(screen.getByText('Файл передан на скачивание.')).toBeInTheDocument();expect(document.body.textContent).not.toContain('Файл сохранён');
  });
  it('does not call the prepared browser handoff when access changed before the click handler runs',()=>{
    let current=true;const ready={filename:'test.html',format:'html' as const,available:()=>true,handoff:vi.fn(),dispose:vi.fn()};state.model={...state.model!,current:()=>current,download:ready};
    render(<SignatureEvidencePanel organizationId={org} signatureId={signature}/>);current=false;fireEvent.click(screen.getByRole('button',{name:'Скачать'}));expect(ready.handoff).not.toHaveBeenCalled();
  });
});
