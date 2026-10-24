import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
const mocks=vi.hoisted(()=>({template:'',course:{id:'10000000-0000-4000-8000-000000000002',title:'Курс',duration:'16',frdo_duration_hours:16 as number|null},profile:null as unknown,from:vi.fn(),rpc:vi.fn(),print:vi.fn(),download:vi.fn(),error:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:mocks.from,rpc:mocks.rpc}}));
vi.mock('@/lib/documents/downloadHtmlWord',()=>({downloadHtmlWord:mocks.download}));
vi.mock('@/utils/printHtmlToPdf',()=>({printHtmlContent:mocks.print}));
vi.mock('sonner',()=>({toast:{error:mocks.error,success:vi.fn()}}));
import { useContractGenerator } from '../useContractGenerator';
import { createEmptyEducationProfile } from '@/lib/uc-compliance/model';
const organizationId='10000000-0000-4000-8000-000000000001',courseId='10000000-0000-4000-8000-000000000002';
const company={id:'company',name:'Заказчик',inn:'123',kpp:'456',ogrn:'789',address:'Адрес',director:'Иванов Иван Иванович'};
const requisites={name:'Организация',inn:'123',kpp:'456',ogrn:'789',legal_address:'Юридический адрес',actual_address:'Фактический адрес',director_name:'Петров Иван Иванович',director_position:'Директор',bank_name:'Банк',bank_bik:'123',bank_account:'456',bank_corr_account:'789',signature_url:null as string|null,stamp_url:null as string|null};
function props(){return{organizationId,isOpen:true,orgRequisites:{...requisites},preselectedCompany:{...company},onSave:vi.fn(),onClose:vi.fn()};}
async function ready(input=props()){
 const hook=renderHook(()=>useContractGenerator(input));await waitFor(()=>expect(hook.result.current.isLoading).toBe(false));
 act(()=>hook.result.current.updateProgram(0,{courseId,price:'3500',studentsCount:'2'}));return{...hook,input};
}
function parsed(html:string){return new DOMParser().parseFromString(html,'text/html');}
function noInjectedNodes(document:Document){expect(document.querySelector('img,script,iframe,object,embed,link,meta[http-equiv="refresh"],style[data-injected]')).toBeNull();}
function printedOrSaved(method:string,result:ReturnType<typeof renderHook<any,any>>['result'],input:ReturnType<typeof props>):string{
 if(method==='handlePreview')return result.current.previewHtml;
 if(method==='handleGenerate'){expect(mocks.print).toHaveBeenCalledOnce();return mocks.print.mock.calls[0][0];}
 if(method==='handleDownloadDOC'){expect(mocks.download).toHaveBeenCalledOnce();return mocks.download.mock.calls[0][0];}
 expect(input.onSave).toHaveBeenCalledOnce();return input.onSave.mock.calls[0][0];
}
beforeEach(()=>{
 vi.clearAllMocks();mocks.template='{{company_name}}';mocks.course={id:courseId,title:'Курс',duration:'16',frdo_duration_hours:16};mocks.profile=createEmptyEducationProfile();mocks.print.mockResolvedValue(undefined);mocks.download.mockResolvedValue(true);
 mocks.rpc.mockImplementation(async()=>({data:{organization_id:organizationId,revision:1,profile:mocks.profile},error:null}));
 mocks.from.mockImplementation((table:string)=>{const answer={data:table==='courses'?[mocks.course]:table==='companies'?[company]:{branding:{contractTemplates:[{id:'preserved-rich',text:mocks.template,isBuiltIn:false}],activeContractTemplateId:'preserved-rich'}},error:null};const q={select:()=>q,eq:()=>q,order:async()=>answer,single:async()=>answer};return q;});
});
afterEach(cleanup);
describe('Legacy contract text stays text before preview print DOCX or save (new cases)',()=>{
 it.each(['handlePreview','handleGenerate','handleDownloadDOC','handleSaveContract']as const)('%s encodes company/org/extra terms without creating markup or external images',async method=>{
  mocks.template='<h2 class="saved-title">Сохранённый договор</h2>\n\n{{org_name}}\n{{org_address}}\n{{org_bank_name}}\n{{company_name}}\n{{company_director}}\n{{company_inn}}\n{{company_address}}\n{{additional_terms}}';
  const input=props(),payloads=['Орг <img src="https://example.invalid/org"> & "ООО"','Адрес <b data-injected="address">новый</b>','Банк <iframe src="https://example.invalid/frame"></iframe>','Компания <img src="https://example.invalid/company" onerror="alert(1)">','Директор <em data-injected="director">имя</em>','ИНН <table data-injected="inn"><tr><td>подмена</td></tr></table>','Адрес <object data="https://example.invalid/object"></object>','Условия <style data-injected>body{background:url(https://example.invalid/css)}</style> $&'];
  input.orgRequisites={...input.orgRequisites,name:payloads[0],legal_address:payloads[1],bank_name:payloads[2]};input.preselectedCompany={...input.preselectedCompany,name:payloads[3],director:payloads[4],inn:payloads[5],address:payloads[6]};
  const {result}=await ready(input);act(()=>result.current.setAdditionalTerms(payloads[7]));await act(async()=>{await result.current[method]();});
  const html=printedOrSaved(method,result,input),document=parsed(html);noInjectedNodes(document);expect(document.querySelector('.saved-title')?.textContent).toBe('Сохранённый договор');for(const payload of payloads)expect(document.body.textContent).toContain(payload);expect(document.querySelector('[data-injected]')).toBeNull();expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.template).toContain('<h2');
 });
 it('keeps individual name passport address phone and email literal including the appended signature',async()=>{
  mocks.template='{{individual_name}}\n{{individual_passport}}\n{{individual_address}}\n{{individual_phone}}\n{{individual_email}}';const {result}=await ready();
  const values={fullName:'Фамилия <img src="https://example.invalid/person">',passport:'Паспорт <b>данные</b>',address:'Адрес <iframe src="https://example.invalid/addr"></iframe>',phone:'Телефон <i>номер</i>',email:'почта@example.invalid <object></object>'};
  act(()=>{result.current.setCounterpartyType('individual');result.current.setIndividualData(values);});await act(async()=>{await result.current.handlePreview();});const document=parsed(result.current.previewHtml);noInjectedNodes(document);for(const value of Object.values(values))expect(document.body.textContent).toContain(value);expect(document.querySelectorAll('.signature-line')[1]?.textContent).toContain(values.fullName);
 });
 it('preserves the real programme table and rich template while escaping its course cells and plain programme list',async()=>{
  const title='Курс <img src="https://example.invalid/course"> & "А"',duration='16 <b data-injected="duration">часов</b>';mocks.course={id:courseId,title,duration,frdo_duration_hours:null};mocks.template='<section class="kept"><h3>Программы</h3><em>Курсив автора</em></section>\n\n{{programs_table}}\n\n{{programs_list}}';
  const {result}=await ready();await act(async()=>{await result.current.handlePreview();});const document=parsed(result.current.previewHtml);noInjectedNodes(document);expect(document.querySelector('.kept h3')?.textContent).toBe('Программы');expect(document.querySelector('.kept em')?.textContent).toBe('Курсив автора');
  const table=document.querySelector('table:not(.requisites)')!;expect(table).not.toBeNull();expect(table.querySelectorAll('thead th')).toHaveLength(6);expect(table.querySelectorAll('tbody tr')).toHaveLength(2);expect(table.querySelectorAll('tbody tr')[0].children[1].textContent).toBe(title);expect(table.querySelectorAll('tbody tr')[0].children[2].textContent).toBe(duration);expect(document.body.textContent).toContain('1. '+title+' — '+duration+' — 2 чел.');expect(table.querySelector('tbody tr:last-child td')?.getAttribute('colspan')).toBe('5');
 });
 it('encodes a title-closing contract number independently of body replacements',async()=>{
  const number='QA </title><img src="https://example.invalid/title"><b> & "номер"';mocks.template='Номер {{contract_number}}';const {result,input}=await ready();act(()=>result.current.setContractNumber(number));await act(async()=>{await result.current.handleSaveContract();});const document=parsed(input.onSave.mock.calls[0][0]);noInjectedNodes(document);expect(document.title).toBe('Договор №'+number);expect(document.body.textContent).toContain(number);expect(input.onSave.mock.calls[0][1]).toBe(number);
 });
 it('encodes director text in the appended signature even when the saved template never references the director',async()=>{
  mocks.template='Авторский текст без переменных';const input=props(),director='Директор <img src="https://example.invalid/signature-name"> & "П"';input.orgRequisites.director_name=director;const {result}=await ready(input);await act(async()=>{await result.current.handleGenerate();});const document=parsed(mocks.print.mock.calls[0][0]);noInjectedNodes(document);expect(document.querySelector('.signature-line')?.textContent).toContain(director);
 });
 it('prevents quote break-out in a configured image attribute without inventing additional asset elements',async()=>{
  const input=props(),asset='https://assets.example.invalid/stamp.png"><img src="https://example.invalid/injected-asset';input.orgRequisites.stamp_url=asset;const {result}=await ready(input);await act(async()=>{await result.current.handlePreview();});const document=parsed(result.current.previewHtml),images=document.querySelectorAll('img');expect(images).toHaveLength(1);expect(images[0].getAttribute('src')).toBe(asset);expect(images[0].alt).toBe('Печать');expect(document.querySelector('img[src="https://example.invalid/injected-asset"]')).toBeNull();
 });
 it('retains configured signature and stamp sources, geometry and requisites as intentional rich HTML',async()=>{
  const input=props(),signature='https://assets.example.invalid/signature.png?x=1&token=A',stamp='data:image/png;base64,iVBORw0KGgo=';input.orgRequisites.signature_url=signature;input.orgRequisites.stamp_url=stamp;mocks.template='<h2 class="retained">Особые условия</h2>\n\n{{programs_table}}';const original=mocks.template,{result}=await ready(input);await act(async()=>{await result.current.handleDownloadDOC();});const document=parsed(mocks.download.mock.calls[0][0]);expect(document.querySelector('.retained')?.textContent).toBe('Особые условия');const images=document.querySelectorAll('.signature-images img');expect(images).toHaveLength(2);expect(images[0].getAttribute('src')).toBe(signature);expect(images[0].getAttribute('style')).toContain('max-height:60px');expect(images[1].getAttribute('src')).toBe(stamp);expect(images[1].getAttribute('style')).toContain('opacity:.9');expect(document.querySelector('table.requisites')).not.toBeNull();expect(mocks.template).toBe(original);
 });
 it('round-trips entity-looking text, quotes, Cyrillic and replacement dollar syntax without interpreting it',async()=>{
  mocks.template='{{company_name}}';const input=props(),text='ООО &lt;img src="https://example.invalid/entity"&gt; & "кавычки" <не тег> $& $1';input.preselectedCompany.name=text;const {result}=await ready(input);await act(async()=>{await result.current.handlePreview();});const document=parsed(result.current.previewHtml);noInjectedNodes(document);expect(document.body.textContent).toContain(text);expect(document.querySelector('не')).toBeNull();
 });
 it('keeps PR121 confirmed facts encoded exactly once together with legacy text',async()=>{
  mocks.template='{{org_name}} / {{org_license_number}} / {{org_license_issuer}}';const input=props(),name='Центр & <имя>',number='№ <19> & QA',authority='<img src="https://example.invalid/license">';input.orgRequisites.name=name;const profile=createEmptyEducationProfile();profile.license={...profile.license,status:'declared_active',registryNumber:number,authority};mocks.profile=profile;const {result}=await ready(input);await act(async()=>{await result.current.handlePreview();});const html=result.current.previewHtml,document=parsed(html);noInjectedNodes(document);expect(document.body.textContent).toContain(name+' / '+number+' / '+authority);expect(html).not.toContain('&amp;amp;');expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('get_organization_education_profile',{p_organization_id:organizationId});
 });
 it('still rejects an unbound marker inside escaped legacy text before persisting output',async()=>{
  const input=props();input.preselectedCompany.name='{{org_name}}';const {result}=await ready(input);await act(async()=>{await result.current.handleSaveContract();});expect(input.onSave).not.toHaveBeenCalled();expect(result.current.previewHtml).toBe('');expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('неизвестная или неподставленная'));
 });
 it('does not synthesize the missing license date to make an otherwise escaped contract ready',async()=>{
  mocks.template='{{org_name}} / {{org_license_date}}';const input=props();input.orgRequisites.name='<img src="https://example.invalid/name">';const profile=createEmptyEducationProfile();profile.license={...profile.license,status:'declared_active',registryNumber:'QA-123',authority:'Synthetic unit authority'};mocks.profile=profile;const {result}=await ready(input);await act(async()=>{await result.current.handleSaveContract();});expect(input.onSave).not.toHaveBeenCalled();expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('Дата лицензии'));
 });
});
