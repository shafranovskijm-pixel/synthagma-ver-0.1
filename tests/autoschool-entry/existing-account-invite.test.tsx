import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { DrivingAdapter, Row, State } from '@/lib/driving-school/types';
import { deferred, schoolState } from './fixtures';
const ports=vi.hoisted(()=>({rpc:vi.fn(),invoke:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:ports.rpc,functions:{invoke:ports.invoke}}}));
import { createCloudAdapter, drivingError } from '@/lib/driving-school/cloud-adapter';
import DrivingApp from '@/components/driving-school/DrivingApp';
const syntheticId='22222222-2222-4222-8222-222222222222';
const token='a'.repeat(64);
const syntheticUrl='https://example.invalid/driving-school?invite='+token;
const existingPayload={kind:'student',accountMode:'existing',name:'Existing QA account',email:'existing@example.invalid',phone:'',programId:'program',groupId:'',instructorId:''};
const ui=(value:DrivingAdapter)=><MemoryRouter initialEntries={['/driving-school?view=students']}><DrivingApp adapter={value} onExit={()=>{}}/></MemoryRouter>;
function adapter(state=schoolState(),canCreateStudents=true){return {load:vi.fn().mockResolvedValue(state),mutate:vi.fn().mockResolvedValue({}),canCreateStudents} satisfies DrivingAdapter;}
const student=(state:State)=>state.resources.find((r):r is Row<'student'>=>r.kind==='student')!;
const row=(name:string)=>within(screen.getByText(name).closest('tr')!);
beforeEach(()=>{
 ports.rpc.mockReset().mockImplementation(()=>{throw new Error('Unexpected live RPC');});
 ports.invoke.mockReset().mockImplementation(()=>{throw new Error('Unexpected account write');});
});
describe('existing organization account student invitations',()=>{
 it('ASI01 the explicit existing-account form saves a driving-only record, then creates a separate invite in the existing modal',async()=>{
  const initial=schoolState(),created=schoolState();created.resources.push({...student(initial),id:syntheticId,name:'Existing QA account',data:{...student(initial).data,email:'existing@example.invalid'}});created.balances.push({id:syntheticId,completed:0,reserved:0,planned:600});
  const value=adapter(initial,false);value.load.mockResolvedValueOnce(initial).mockResolvedValue(created);value.mutate.mockResolvedValueOnce({id:syntheticId}).mockResolvedValueOnce({url:syntheticUrl});
  render(ui(value));await screen.findByText('QA School A');
  expect((screen.getByRole('button',{name:'Добавить ученика'})as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'Пригласить существующий аккаунт'}));const form=await screen.findByRole('dialog',{name:'Пригласить существующий аккаунт'});
  expect(within(form).queryByLabelText(/Начальный пароль/)).toBeNull();expect(form.textContent).toContain('существующего аккаунта вашей организации');expect(form.textContent).toContain('личные данные не меняются');
  fireEvent.change(within(form).getByLabelText('ФИО'),{target:{value:'Existing QA account'}});fireEvent.change(within(form).getByLabelText(/^Email для входа существующего аккаунта/),{target:{value:'existing@example.invalid'}});fireEvent.change(within(form).getByLabelText('Программа'),{target:{value:'program'}});
  fireEvent.submit(form.querySelector('form')!);
  await screen.findByText(/Запись ученика создана. В списке учеников/);expect(screen.queryByRole('dialog')).toBeNull();expect(value.mutate).toHaveBeenCalledTimes(1);
  expect(value.mutate).toHaveBeenNthCalledWith(1,'resources',existingPayload,initial);expect(ports.invoke).not.toHaveBeenCalled();expect(screen.queryByText('Доступ ученика подтверждён')).toBeNull();
  fireEvent.click(row('Existing QA account').getByRole('button',{name:'Создать приглашение'}));const invite=await screen.findByRole('dialog',{name:'Приглашение готово'});
  expect(value.mutate).toHaveBeenNthCalledWith(2,'invites',{resourceId:syntheticId,resourceKind:'student'},created);expect((within(invite).getByLabelText('Ссылка приглашения')as HTMLInputElement).value).toBe(syntheticUrl);expect(invite.textContent).toContain('72 часа');expect(invite.textContent).toContain('Письмо не отправлено');expect(value.mutate).toHaveBeenCalledTimes(2);
 });
 it('ASI02 the real adapter uses save_student with null user id, even when creating new accounts is unavailable, and never invokes registration',async()=>{
  ports.rpc.mockResolvedValueOnce({data:syntheticId,error:null});const value=createCloudAdapter('qa-school',false);
  await expect(value.mutate('resources',{...existingPayload,password:'must-not-leave-browser'},schoolState())).resolves.toEqual({id:syntheticId});
  expect(ports.rpc).toHaveBeenCalledExactlyOnceWith('driving_save_student',{_organization_id:'qa-school',_name:'Existing QA account',_email:'existing@example.invalid',_phone:'',_program_id:'program',_group_id:null,_instructor_id:null,_user_id:null});expect(ports.invoke).not.toHaveBeenCalled();
 });
 it('ASI03 unknown account modes, nonowner callers, invalid email and unconfirmed save responses never fall through to registration',async()=>{
  const value=createCloudAdapter('qa-school',false),owner=schoolState(),learner=schoolState();learner.user={...learner.user,role:'student',resource_id:'student'};
  for(const [payload,state] of [[{...existingPayload,accountMode:'guess'},owner],[existingPayload,learner],[{...existingPayload,email:'not an email'},owner]] as const){await expect(value.mutate('resources',payload,state)).rejects.toBeInstanceOf(Error);}
  expect(ports.rpc).not.toHaveBeenCalled();expect(ports.invoke).not.toHaveBeenCalled();
  ports.rpc.mockResolvedValueOnce({data:null,error:null});await expect(value.mutate('resources',existingPayload,owner)).rejects.toThrow('Обновите список перед повторением');expect(ports.invoke).not.toHaveBeenCalled();expect(ports.rpc).toHaveBeenCalledTimes(1);
 });
 it('ASI04 the default adapter path keeps registration, returned Auth id and the original new-account capability gate',async()=>{
  const state=schoolState(),payload={kind:'student',name:'New QA account',email:'contact@example.invalid',password:'synthetic-password',programId:'program'};
  await expect(createCloudAdapter('qa-school',false).mutate('resources',payload,state)).rejects.toThrow('новых учеников добавляет');expect(ports.invoke).not.toHaveBeenCalled();expect(ports.rpc).not.toHaveBeenCalled();
  ports.invoke.mockResolvedValueOnce({data:{success:true,user_id:'synthetic-auth-user',login:'qa-generated-login',is_existing:false},error:null});ports.rpc.mockResolvedValueOnce({data:syntheticId,error:null});
  await expect(createCloudAdapter('qa-school',true).mutate('resources',payload,state)).resolves.toEqual({id:syntheticId,account:{login:'qa-generated-login',isExisting:false}});
  expect(ports.invoke).toHaveBeenCalledExactlyOnceWith('register-student',{body:{email:'contact@example.invalid',full_name:'New QA account',password:'synthetic-password',organization_id:'qa-school'}});expect(ports.rpc).toHaveBeenCalledExactlyOnceWith('driving_save_student',{_organization_id:'qa-school',_name:'New QA account',_email:'contact@example.invalid',_phone:'',_program_id:'program',_group_id:null,_instructor_id:null,_user_id:'synthetic-auth-user'});
 });
 it('ASI05 only an owner sees row invitation actions for active students with valid returned email; no linkage flag is assumed',async()=>{
  const state=schoolState(),base=student(state);state.resources.push({...base,id:'paused-student',name:'Paused QA',active:0},{...base,id:'bad-email-student',name:'Bad email QA',data:{...base.data,email:'missing-login'}});for(const id of ['paused-student','bad-email-student'])state.balances.push({id,completed:0,reserved:0,planned:600});
  const view=render(ui(adapter(state)));await screen.findByText('Private QA Student');expect(row('Private QA Student').getByRole('button',{name:'Создать приглашение'})).toBeTruthy();expect(row('Paused QA').queryByRole('button',{name:'Создать приглашение'})).toBeNull();expect(row('Bad email QA').queryByRole('button',{name:'Создать приглашение'})).toBeNull();
  const instructor=schoolState('Instructor QA School');instructor.user={...instructor.user,role:'instructor',resource_id:'instructor'};view.rerender(ui(adapter(instructor)));await screen.findByText('Instructor QA School');expect(screen.queryByRole('button',{name:'Создать приглашение'})).toBeNull();expect(screen.queryByRole('button',{name:'Пригласить существующий аккаунт'})).toBeNull();expect(ports.rpc).not.toHaveBeenCalled();expect(ports.invoke).not.toHaveBeenCalled();
 });
 it('ASI06 invitation RPCs select exact resource kind and id, reject ambiguous or ineligible targets, and reject malformed token responses',async()=>{
  const state=schoolState(),value=createCloudAdapter('qa-school');state.resources.unshift({...state.resources.find(r=>r.kind==='instructor')!,id:'student'});ports.rpc.mockResolvedValueOnce({data:{token},error:null});
  await expect(value.mutate('invites',{resourceId:'student',resourceKind:'student'},state)).resolves.toEqual({url:window.location.origin+'/driving-school?invite='+token});expect(ports.rpc).toHaveBeenLastCalledWith('driving_create_invite',{_organization_id:'qa-school',_role:'student',_target_id:'student'});
  ports.rpc.mockClear();for(const payload of [{resourceId:'student'},{resourceId:'student',resourceKind:'program'},{resourceId:'missing',resourceKind:'student'}])await expect(value.mutate('invites',payload,state)).rejects.toThrow('Получатель не найден');expect(ports.rpc).not.toHaveBeenCalled();
  const paused=schoolState();student(paused).active=0;await expect(value.mutate('invites',{resourceId:'student',resourceKind:'student'},paused)).rejects.toThrow('действующая запись');student(paused).active=1;student(paused).data.email='invalid';await expect(value.mutate('invites',{resourceId:'student',resourceKind:'student'},paused)).rejects.toThrow('email для входа');paused.user.role='student';await expect(value.mutate('invites',{resourceId:'student',resourceKind:'student'},paused)).rejects.toThrow('владелец');expect(ports.rpc).not.toHaveBeenCalled();
  ports.rpc.mockResolvedValueOnce({data:{token:{unexpected:true}},error:null});await expect(value.mutate('invites',{resourceId:'student',resourceKind:'student'},schoolState())).rejects.toThrow('Ссылка не подтверждена');expect(ports.invoke).not.toHaveBeenCalled();
 });
 it('ASI07 the default new-student form retains its password and contact-email fields and linked-account receipt',async()=>{
  const value=adapter();value.mutate.mockResolvedValueOnce({id:syntheticId,account:{login:'qa-generated-login',isExisting:false}});render(ui(value));await screen.findByText('QA School A');fireEvent.click(screen.getByRole('button',{name:'Добавить ученика'}));const dialog=await screen.findByRole('dialog',{name:'Добавить ученика'});
  fireEvent.change(within(dialog).getByLabelText('ФИО'),{target:{value:'New QA account'}});const password=within(dialog).getByLabelText(/^Начальный пароль/)as HTMLInputElement;expect(password.type).toBe('password');expect(password.minLength).toBe(10);fireEvent.change(password,{target:{value:'synthetic-password'}});fireEvent.change(within(dialog).getByLabelText('Контактная почта (не логин)'),{target:{value:'contact@example.invalid'}});fireEvent.change(within(dialog).getByLabelText('Программа'),{target:{value:'program'}});fireEvent.submit(dialog.querySelector('form')!);
  const receipt=await screen.findByRole('dialog',{name:'Доступ ученика подтверждён'});expect((within(receipt).getByLabelText('Логин ученика')as HTMLInputElement).value).toBe('qa-generated-login');expect(value.mutate).toHaveBeenCalledWith('resources',{kind:'student',name:'New QA account',password:'synthetic-password',email:'contact@example.invalid',phone:'',programId:'program',groupId:'',instructorId:''},expect.any(Object));
 });
 it('ASI08 SQLSTATE25000 purges an existing-account draft; a successful retry does not retain its mode or private email',async()=>{
  const value=adapter();render(ui(value));await screen.findByText('QA School A');fireEvent.click(screen.getByRole('button',{name:'Пригласить существующий аккаунт'}));const dialog=await screen.findByRole('dialog',{name:'Пригласить существующий аккаунт'});fireEvent.change(within(dialog).getByLabelText(/^Email для входа/),{target:{value:'private-draft@example.invalid'}});
  value.load.mockRejectedValueOnce(drivingError({code:'25000'}));act(()=>window.dispatchEvent(new Event('focus')));await screen.findByRole('button',{name:'Повторить загрузку'});expect(screen.queryByRole('dialog')).toBeNull();expect(screen.queryByDisplayValue('private-draft@example.invalid')).toBeNull();expect(screen.queryByText('QA School A')).toBeNull();
  value.load.mockResolvedValueOnce(schoolState('Fresh QA School'));fireEvent.click(screen.getByRole('button',{name:'Повторить загрузку'}));await screen.findByText('Fresh QA School');fireEvent.click(screen.getByRole('button',{name:'Добавить ученика'}));const fresh=await screen.findByRole('dialog',{name:'Добавить ученика'});expect(within(fresh).getByLabelText(/^Начальный пароль/)).toBeTruthy();expect((within(fresh).getByLabelText('Контактная почта (не логин)')as HTMLInputElement).value).toBe('');expect(value.mutate).not.toHaveBeenCalled();
 });
 it('ASI09 a student invite pending across SQLSTATE25000 and clean retry cannot resurrect its old link or receipt',async()=>{
  const pending=deferred<Record<string,unknown>>(),value=adapter();value.mutate.mockReturnValueOnce(pending.promise);render(ui(value));await screen.findByText('Private QA Student');fireEvent.click(row('Private QA Student').getByRole('button',{name:'Создать приглашение'}));await waitFor(()=>expect(value.mutate).toHaveBeenCalledTimes(1));
  value.load.mockRejectedValueOnce(drivingError({code:'25000'}));act(()=>window.dispatchEvent(new Event('focus')));await screen.findByRole('button',{name:'Повторить загрузку'});value.load.mockResolvedValueOnce(schoolState('Fresh QA School'));fireEvent.click(screen.getByRole('button',{name:'Повторить загрузку'}));await screen.findByText('Fresh QA School');await act(async()=>pending.resolve({url:syntheticUrl}));expect(screen.queryByRole('dialog')).toBeNull();expect(screen.queryByDisplayValue(syntheticUrl)).toBeNull();expect(screen.queryByText('Приглашение создано')).toBeNull();expect(value.load).toHaveBeenCalledTimes(3);expect(ports.invoke).not.toHaveBeenCalled();
 });
 it('ASI10 changing organization adapters before an invite returns keeps the new organization free of the old link',async()=>{
  const pending=deferred<Record<string,unknown>>(),old=adapter(),next=adapter(schoolState('QA School B','qa-school-B'));old.mutate.mockReturnValueOnce(pending.promise);const view=render(ui(old));await screen.findByText('Private QA Student');fireEvent.click(row('Private QA Student').getByRole('button',{name:'Создать приглашение'}));await waitFor(()=>expect(old.mutate).toHaveBeenCalledTimes(1));view.rerender(ui(next));await screen.findByText('QA School B');await act(async()=>pending.resolve({url:syntheticUrl}));expect(screen.getByText('QA School B')).toBeTruthy();expect(screen.queryByRole('dialog')).toBeNull();expect(screen.queryByDisplayValue(syntheticUrl)).toBeNull();expect(next.mutate).not.toHaveBeenCalled();expect(old.load).toHaveBeenCalledTimes(1);
 });
});
