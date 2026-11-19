import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdmissionDocumentSettingsPanel, StudentAdmissionAutomationCard } from './AdmissionDocumentSettingsPanel';
import { draft, enrollmentScope, exported, ids, settings } from '@/lib/admissionDocuments/__tests__/fixtures';
const m=vi.hoisted(()=>({actor:'actor',read:vi.fn(),apply:vi.fn(),export:vi.fn(),convert:vi.fn(),download:vi.fn(),success:vi.fn(),current:vi.fn(),inputChanges:new Map<string,(event:any)=>void>()}));
// Retain the actual Input rendering. Expose its supplied callbacks only to model
// multiple control updates queued before React renders the next form snapshot.
vi.mock('@/components/ui/input',async original=>{
 const actual=await original<typeof import('@/components/ui/input')>();
 return{...actual,Input:(props:any)=>{m.inputChanges.set(props['aria-label'],props.onChange);return <actual.Input {...props}/>;}};
});
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:m.actor},loading:false})}));
vi.mock('@/utils/courseCache',()=>({captureOfflineActor:()=>1}));
vi.mock('sonner',()=>({toast:{success:(...a:unknown[])=>m.success(...a)}}));
vi.mock('@/lib/docx/htmlToDocx',()=>({htmlToDocxBlob:(...a:unknown[])=>m.convert(...a),downloadBlob:(...a:unknown[])=>m.download(...a),sanitizeFileName:(a:string)=>a+'.docx'}));
vi.mock('@/lib/admissionDocuments/client',async()=>{
 const actual=await vi.importActual<any>('@/lib/admissionDocuments/client');
 return{...actual,captureAdmissionDocumentScope:(organizationId:string,scope:unknown,current:()=>boolean)=>({organizationId,scope,current}),
 assertAdmissionDocumentScopeCurrent:(scope:any)=>{if(!scope.current())throw new actual.AdmissionDocumentError('ACCESS_DENIED');m.current();},
 readAdmissionDocumentSettings:(...a:unknown[])=>m.read(...a),applyAdmissionDocumentSettings:(...a:unknown[])=>m.apply(...a),readAutomaticAdmissionDraft:(...a:unknown[])=>m.export(...a)};
});
beforeEach(()=>{m.actor='actor';m.inputChanges.clear();for(const fn of [m.read,m.apply,m.export,m.convert,m.download,m.success,m.current])fn.mockReset();m.read.mockResolvedValue(settings());m.export.mockResolvedValue(exported());m.convert.mockResolvedValue(new Blob(['docx']));m.apply.mockImplementation(async(_scope:any,_rev:number,requestId:string)=>({schema_version:1,request_id:requestId,replayed:false,processed:0,next_after_enrollment_id:null,state:settings()}));});
afterEach(cleanup);
const mount=(scope:typeof enrollmentScope|{kind:'group';groupId:string}=enrollmentScope)=>render(<AdmissionDocumentSettingsPanel organizationId={ids.org} scope={scope}/>);
const loaded=()=>screen.findByRole('button',{name:'Сохранить настройки приказа'});
describe('admission settings usable, scoped controls',()=>{
 it('preserves both dates and enabled mode when controls change before the next render',async()=>{
  m.apply.mockImplementation(async(_scope:any,_revision:number,requestId:string,command:any)=>{
   const state=settings();state.revision=1;state.preferences={enabled:command.enabled,document_date:command.document_date,effective_admission_date:command.effective_admission_date,timezone:command.timezone};
   return{schema_version:1,request_id:requestId,replayed:false,processed:0,next_after_enrollment_id:null,state};
  });
  mount();await loaded();
  const changeDocumentDate=m.inputChanges.get('Дата проекта приказа')!;
  const changeAdmissionDate=m.inputChanges.get('Зачислить с даты')!;
  act(()=>{
   changeDocumentDate({target:{value:'2026-11-18'}});
   changeAdmissionDate({target:{value:'2026-11-17'}});
   fireEvent.change(screen.getByLabelText('Готовить проекты приказов автоматически'),{target:{value:'on'}});
  });
  expect(screen.getByLabelText('Дата проекта приказа')).toHaveValue('2026-11-18');
  expect(screen.getByLabelText('Зачислить с даты')).toHaveValue('2026-11-17');
  fireEvent.click(screen.getByRole('button',{name:'Сохранить настройки приказа'}));
  await waitFor(()=>expect(m.apply).toHaveBeenCalledOnce());
  expect(m.apply.mock.calls[0][3]).toMatchObject({action:'save',enabled:true,document_date:'2026-11-18',effective_admission_date:'2026-11-17'});
  await waitFor(()=>expect(screen.getByLabelText('Дата проекта приказа')).toHaveValue('2026-11-18'));
  expect(screen.getByLabelText('Зачислить с даты')).toHaveValue('2026-11-17');
 });
 it('lets an authorized operator edit and clear two independent dates; editing alone performs no write',async()=>{
  mount();await loaded();fireEvent.change(screen.getByLabelText('Дата проекта приказа'),{target:{value:'2026-11-15'}});fireEvent.change(screen.getByLabelText('Зачислить с даты'),{target:{value:'2026-11-14'}});expect(m.apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Сохранить настройки приказа'}));await waitFor(()=>expect(m.apply).toHaveBeenCalledOnce());
  expect(m.apply.mock.calls[0][3]).toMatchObject({action:'save',document_date:'2026-11-15',effective_admission_date:'2026-11-14',enabled:null});
 });
 it('keeps edits after a revision conflict and explains how to recover',async()=>{
  m.apply.mockRejectedValue({message:'ADMISSION_AUTOMATION_REVISION_CONFLICT'});mount();await loaded();fireEvent.change(screen.getByLabelText('Дата проекта приказа'),{target:{value:'2026-11-15'}});fireEvent.click(screen.getByRole('button',{name:'Сохранить настройки приказа'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Настройки изменились');expect(screen.getByLabelText('Дата проекта приказа')).toHaveValue('2026-11-15');expect(screen.getByRole('button',{name:'Обновить сведения'})).toBeEnabled();
 });
 it('retries an uncertain mutation with identical request/revision/command',async()=>{
  m.apply.mockRejectedValueOnce({message:'connection lost'});mount();await loaded();fireEvent.click(screen.getByRole('button',{name:'Вернуть настройки выше'}));
  fireEvent.click(await screen.findByRole('button',{name:'Повторить действие'}));await waitFor(()=>expect(m.apply).toHaveBeenCalledTimes(2));
  expect(m.apply.mock.calls[1].slice(1)).toEqual(m.apply.mock.calls[0].slice(1));
 });
 it('disables changes and export for a registered exact order',async()=>{
  const state=settings();state.draft={...draft(),registered_locked:true};m.read.mockResolvedValue(state);mount();await loaded();
  expect(screen.getByRole('button',{name:'Сохранить настройки приказа'})).toBeDisabled();expect(screen.getByRole('button',{name:'Скачать проект DOCX'})).toBeDisabled();expect(screen.getByText('Приказ уже зарегистрирован. Его даты и сохранённый файл здесь не изменяются.')).toBeInTheDocument();
 });
 it('keeps stale projects closed until an explicit refresh',async()=>{
  const state=settings();state.draft={...draft(),stale:true};m.read.mockResolvedValue(state);mount();await loaded();
  expect(screen.getByRole('button',{name:'Открыть проект приказа'})).toBeDisabled();expect(screen.getByRole('button',{name:'Обновить проект'})).toBeEnabled();expect(m.apply).not.toHaveBeenCalled();
 });
 it('does not open the old group draft when another group is selected',async()=>{
  const state=settings();state.draft={...draft(),group_id:ids.peer};m.read.mockResolvedValue(state);mount();await loaded();expect(screen.getByRole('button',{name:'Открыть проект приказа'})).toBeDisabled();expect(screen.getByText('Для выбранной группы проект нужно обновить.')).toBeInTheDocument();
 });
 it('keeps individual date variations visible in group configuration',async()=>{
  const scope={kind:'group' as const,groupId:ids.group};const state=settings(scope);state.individual_date_overrides=2;m.read.mockResolvedValue(state);mount(scope);await loaded();
  expect(screen.getByText(/В группе есть индивидуальные даты \(2\)/)).toBeInTheDocument();expect(screen.getByRole('button',{name:'Применить к текущим проектам'})).toBeEnabled();expect(m.apply).not.toHaveBeenCalled();
 });
 it('opens a one-subject escaped preview and retains the no-signature draft label',async()=>{
  const state=settings();state.draft=draft();m.read.mockResolvedValue(state);mount();await loaded();fireEvent.click(screen.getByRole('button',{name:'Открыть проект приказа'}));
  const frame=await screen.findByTitle('Проект приказа о зачислении');expect(frame).toHaveAttribute('sandbox','');expect(frame.getAttribute('srcdoc')).toContain('НЕ ПОДПИСАН, НОМЕР НЕ ПРИСВОЕН');expect(m.download).not.toHaveBeenCalled();
 });
 it('discards an old read after organization changes',async()=>{
  let resolve!:(value:any)=>void;m.read.mockReturnValueOnce(new Promise(value=>{resolve=value;}));const view=mount();
  m.read.mockResolvedValue({...settings(),organization_id:ids.peer,capabilities:{...settings().capabilities,can_write:false}});
  view.rerender(<AdmissionDocumentSettingsPanel organizationId={ids.peer} scope={enrollmentScope}/>);await loaded();resolve({...settings(),preferences:{...settings().preferences,document_date:'2000-01-01'}});
  await waitFor(()=>expect(screen.getByLabelText('Дата проекта приказа')).toHaveValue(''));expect(screen.getByRole('button',{name:'Сохранить настройки приказа'})).toBeDisabled();
 });
 it('prevents a DOCX handoff if the organization changes during conversion',async()=>{
  const state=settings();state.draft=draft();m.read.mockResolvedValue(state);let resolve!:(value:Blob)=>void;m.convert.mockReturnValueOnce(new Promise(value=>{resolve=value;}));
  const view=mount();await loaded();fireEvent.click(screen.getByRole('button',{name:'Скачать проект DOCX'}));await waitFor(()=>expect(m.convert).toHaveBeenCalledOnce());
  view.rerender(<AdmissionDocumentSettingsPanel organizationId={ids.peer} scope={enrollmentScope}/>);resolve(new Blob(['docx']));await loaded();await waitFor(()=>expect(m.download).not.toHaveBeenCalled());
 });
 it('exports the student wrapper with an exact enrollment rather than profile-wide dates',async()=>{
  render(<StudentAdmissionAutomationCard organizationId={ids.org} enrollmentId={ids.enrollment} groupId={ids.group}/>);await loaded();expect(m.read.mock.calls[0][0].scope).toEqual(enrollmentScope);
 });
});
