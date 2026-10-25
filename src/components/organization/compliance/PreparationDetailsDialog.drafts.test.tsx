import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {REQUIREMENTS} from '@/lib/uc-compliance/catalog';import {preparationExample} from '@/lib/uc-compliance/preparationCatalog';
import {PreparationDetailsDialog} from '@/components/organization/compliance/PreparationDetailsDialog';
const req=(id:string)=>REQUIREMENTS.find(x=>x.id===id)!;const close=vi.fn();
afterEach(()=>{cleanup();vi.restoreAllMocks();});beforeEach(()=>vi.clearAllMocks());
it('DD01 full draft and per-card reading limitation render as inert text with unchanged quick preparation steps',()=>{
 const view=render(<PreparationDetailsDialog requirement={{...req('admission_rules'),label:'<img src=x onerror=alert(1)>'}} workflow={null} onClose={close}/>);
 const dialog=screen.getByRole('dialog');expect(within(dialog).getByRole('heading',{name:'Проект для адаптации'})).toBeVisible();
 expect(screen.getByLabelText('Текст примера для адаптации').textContent).toBe(preparationExample('admission_rules'));
 expect(screen.getByText(/Прочитанная редакция \/ объём: Копия МЧС/,{selector:'p'})).toBeVisible();expect(view.baseElement.querySelector('img')).toBeNull();
 expect(within(dialog).queryByRole('button',{name:/Утвердить|Подписать|Сохранить автоматически/})).toBeNull();
});
it('DD02 download carries exact full preview UTF8 bytes and releases URL without any upload',async()=>{
 const create=vi.fn(()=> 'blob:uc029-full-draft'),revoke=vi.fn(),upload=vi.fn();Object.defineProperty(URL,'createObjectURL',{configurable:true,value:create});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revoke});
 let file='';vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){file=this.download;});
 render(<PreparationDetailsDialog requirement={req('attestation_rules')} workflow={null} onUploadDraft={upload} onClose={close}/>);
 fireEvent.click(screen.getByRole('button',{name:'Скачать проект для адаптации'}));const blob=(create.mock.calls[0] as any)[0] as Blob;
 expect(blob.type).toBe('text/plain;charset=utf-8');expect(blob.size).toBe(new TextEncoder().encode(preparationExample('attestation_rules')!).length);
 const text=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsText(blob,'UTF-8');});
 expect(text).toBe(preparationExample('attestation_rules'));expect(file).toBe('sintagma-example-attestation_rules.txt');expect(revoke).toHaveBeenCalledWith('blob:uc029-full-draft');expect(upload).not.toHaveBeenCalled();
});
it('DD03 failed download keeps substantive body and a closed fixed error',()=>{
 Object.defineProperty(URL,'createObjectURL',{configurable:true,value:vi.fn(()=>{throw Error('PRIVATE_SENTINEL');})});
 render(<PreparationDetailsDialog requirement={req('salary_rules')} workflow={null} onClose={close}/>);fireEvent.click(screen.getByRole('button',{name:'Скачать проект для адаптации'}));
 expect(screen.getByRole('alert')).toHaveTextContent('Не удалось скачать пример');expect(screen.getByLabelText('Текст примера для адаптации')).toHaveTextContent('Изменение условий');expect(document.body).not.toHaveTextContent('PRIVATE_SENTINEL');
});
it('DD04 draft actions exist only when parent supplies authorized handlers and only fire on user click',()=>{
 const upload=vi.fn(),history=vi.fn();const view=render(<PreparationDetailsDialog requirement={req('admission_rules')} workflow={null} onClose={close}/>);
 expect(screen.queryByRole('button',{name:'Загрузить подготовленный проект'})).toBeNull();expect(screen.queryByRole('button',{name:'Открыть файл и версии проекта'})).toBeNull();
 view.rerender(<PreparationDetailsDialog requirement={req('admission_rules')} workflow={null} onUploadDraft={upload} onOpenVersions={history} onClose={close}/>);expect(upload).not.toHaveBeenCalled();expect(history).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Загрузить подготовленный проект'}));expect(upload).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledOnce();
 fireEvent.click(screen.getByRole('button',{name:'Открыть файл и версии проекта'}));expect(history).toHaveBeenCalledOnce();expect(close).toHaveBeenCalledTimes(2);
});
it('DD05 official-record guidance does not acquire LNA creation or history actions from optional callbacks',()=>{
 render(<PreparationDetailsDialog requirement={req('license')} workflow={null} onUploadDraft={vi.fn()} onOpenVersions={vi.fn()} onClose={close}/>);
 expect(screen.getByRole('heading',{name:'Чек-лист подлинного документа'})).toBeVisible();expect(screen.queryByRole('button',{name:'Загрузить подготовленный проект'})).toBeNull();expect(screen.queryByRole('button',{name:'Открыть файл и версии проекта'})).toBeNull();
});
