// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {ArchiveCaseActions} from '../ArchiveCaseActions';

// Exercise the actual dialog's loading, selection, pagination and command path.
// Presentation, navigation and remote reads are explicit seams, not approval/Auth proof.
const f=vi.hoisted(()=>({ruleModel:null as any,governanceProps:[] as any[]}));
vi.mock('@/hooks/useArchiveCases',()=>({useArchiveCases:()=>f.ruleModel}));
vi.mock('@/lib/archiveCases/client',()=>({archiveMessages:{INVALID_INPUT:'invalid input',SOURCE_CHANGED:'source changed',SOURCE_UNAVAILABLE:'source unavailable'}}));
vi.mock('@/components/ui/button',()=>({Button:({variant,size,...props}:any)=><button {...props}/> }));
vi.mock('@/components/ui/input',()=>({Input:(props:any)=><input {...props}/> }));
vi.mock('@/components/ui/textarea',()=>({Textarea:(props:any)=><textarea {...props}/> }));
vi.mock('@/components/ui/label',()=>({Label:(props:any)=><label {...props}/> }));
vi.mock('@/components/ui/checkbox',()=>({Checkbox:()=>{throw new Error('wrong mode checkbox');}}));
vi.mock('@/components/ui/dialog',()=>({
 Dialog:({children}:any)=><div role="dialog">{children}</div>,DialogContent:({children}:any)=><div>{children}</div>,
 DialogHeader:({children}:any)=><div>{children}</div>,DialogTitle:({children}:any)=><h1>{children}</h1>
}));
vi.mock('../ArchiveFormFields',()=>({ArchiveSelect:({label,value,onChange,options,disabled}:any)=><label>{label}<select aria-label={label} value={value} onChange={event=>onChange(event.target.value)} disabled={disabled}><option value="">Выберите</option>{options.map((option:any)=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}));
vi.mock('../ArchiveGovernancePanel',()=>({ArchiveGovernancePanel:(props:any)=>{f.governanceProps.push(props);return <section aria-label="Полномочия и правила"><button onClick={props.onClose}>Вернуться к назначению</button></section>;}}));
vi.mock('../ArchiveEvidenceField',()=>({ArchiveEvidenceField:()=>{throw new Error('unexpected evidence in classify');}}));
vi.mock('../ArchiveSourcePicker',()=>({ArchiveSourcePicker:()=>{throw new Error('unexpected source in classify');}}));
vi.mock('../ArchivePeoplePicker',()=>({ArchivePeoplePicker:()=>{throw new Error('unexpected people in classify');}}));

const ORG='50000000-0000-4000-8000-000000000001',CASE='50000000-0000-4000-8000-000000000002',RULE='50000000-0000-4000-8000-000000000003';
const approved={id:RULE,status:'approved',case_index:'01-01',title:'Локальный тестовый перечень',revision:3};
const draft={id:'50000000-0000-4000-8000-000000000004',status:'draft',case_index:'01-02',title:'Неутверждённая редакция',revision:1};
const reply=(items:any[],next:string|null=null)=>({result:{kind:'rules',items,next_cursor:next}});
function fixture(){
 f.ruleModel={scope:{organizationId:ORG},contextKey:'org-A-epoch-1',read:vi.fn(),current:vi.fn()};
 const model={scope:{organizationId:ORG},saving:false,hasPending:false,execute:vi.fn(async()=>({})),current:vi.fn()} as any;
 const caseValue={id:CASE,organization_id:ORG,revision:7,hold_events:[]} as any;
 const onClose=vi.fn();
 return{model,caseValue,onClose,view:()=> <ArchiveCaseActions model={model} caseValue={caseValue} mode="classify" onClose={onClose}/>};
}
const save=()=>screen.getByRole('button',{name:'Сохранить'}) as HTMLButtonElement;
beforeEach(()=>{f.governanceProps=[];vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('network forbidden');}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();});

describe('actual archive approved-rule assignment empty state',()=>{
 it('AE01 waits for current rules, disables an empty command and opens existing governance with a reload on return',async()=>{
  const x=fixture();let complete!:(value:any)=>void;
  f.ruleModel.read.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
  render(x.view());
  expect(screen.queryByText('Утверждённых правил хранения пока нет.')).toBeNull();
  expect(screen.getByRole('button',{name:'Сохраняем…'}).getAttribute('disabled')).not.toBeNull();
  await act(async()=>complete(reply([])));
  expect(await screen.findByText('Утверждённых правил хранения пока нет.')).not.toBeNull();
  expect(save().disabled).toBe(true);fireEvent.click(save());
  expect(x.model.execute).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Полномочия и правила'}));
  expect(screen.getByRole('region',{name:'Полномочия и правила'})).not.toBeNull();
  expect(f.governanceProps.at(-1)).toMatchObject({organizationId:ORG,open:true});
  expect(screen.queryByRole('button',{name:'Сохранить'})).toBeNull();
  f.ruleModel.read.mockResolvedValueOnce(reply([approved]));
  fireEvent.click(screen.getByRole('button',{name:'Вернуться к назначению'}));
  await screen.findByRole('option',{name:'01-01 · Локальный тестовый перечень · редакция 3'});
  expect(f.ruleModel.read.mock.calls.map((call:any[])=>call[0])).toEqual([{kind:'rules',after_cursor:null,limit:50},{kind:'rules',after_cursor:null,limit:50}]);
  expect(save().disabled).toBe(true);expect(x.model.execute).not.toHaveBeenCalled();expect(x.onClose).not.toHaveBeenCalled();
  expect(globalThis.fetch).not.toHaveBeenCalled();
 });
 it('AE02 distinguishes a partial page, loads the approved revision and preserves the exact single assignment command',async()=>{
  const x=fixture();f.ruleModel.read.mockResolvedValueOnce(reply([draft],'next-page')).mockResolvedValueOnce(reply([approved]));
  render(x.view());
  expect(await screen.findByText('В загруженной части списка нет утверждённых правил.')).not.toBeNull();
  expect(screen.queryByText('Утверждённых правил хранения пока нет.')).toBeNull();
  expect(screen.queryByRole('option',{name:/Неутверждённая редакция/})).toBeNull();expect(save().disabled).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'Следующие правила'}));
  await screen.findByRole('option',{name:'01-01 · Локальный тестовый перечень · редакция 3'});
  fireEvent.change(screen.getByRole('combobox',{name:'Правило хранения'}),{target:{value:RULE}});
  fireEvent.change(screen.getByRole('textbox',{name:'Решение и основание'}),{target:{value:'Назначена отдельно утверждённая редакция'}});
  expect(save().disabled).toBe(false);fireEvent.click(save());
  await waitFor(()=>expect(x.onClose).toHaveBeenCalledTimes(1));
  expect(x.model.execute).toHaveBeenCalledExactlyOnceWith({case_id:CASE,expected_revision:7,action:{kind:'classify_case',rule_version_id:RULE,reason:'Назначена отдельно утверждённая редакция'}});
  expect(x.model.current).toHaveBeenCalledTimes(1);
  expect(f.ruleModel.read.mock.calls[1][0]).toEqual({kind:'rules',after_cursor:'next-page',limit:50});
  expect(f.governanceProps).toHaveLength(0);expect(globalThis.fetch).not.toHaveBeenCalled();
 });
 it('AE03 invalidates a previously selected revision when the current rules context no longer contains an approved choice',async()=>{
  const x=fixture();f.ruleModel.read.mockResolvedValueOnce(reply([approved])).mockResolvedValueOnce(reply([{...approved,status:'draft'}]));
  const rendered=render(x.view());await screen.findByRole('option',{name:'01-01 · Локальный тестовый перечень · редакция 3'});
  fireEvent.change(screen.getByRole('combobox',{name:'Правило хранения'}),{target:{value:RULE}});
  fireEvent.change(screen.getByRole('textbox',{name:'Решение и основание'}),{target:{value:'Сохранённое основание'}});expect(save().disabled).toBe(false);
  f.ruleModel.contextKey='org-A-epoch-2';rendered.rerender(x.view());
  await screen.findByText('Утверждённых правил хранения пока нет.');
  expect(save().disabled).toBe(true);expect(screen.queryByRole('option',{name:'01-01 · Локальный тестовый перечень · редакция 3'})).toBeNull();
  expect((screen.getByRole('textbox',{name:'Решение и основание'}) as HTMLTextAreaElement).value).toBe('Сохранённое основание');
  fireEvent.click(save());expect(x.model.execute).not.toHaveBeenCalled();expect(x.onClose).not.toHaveBeenCalled();expect(globalThis.fetch).not.toHaveBeenCalled();
 });
});
