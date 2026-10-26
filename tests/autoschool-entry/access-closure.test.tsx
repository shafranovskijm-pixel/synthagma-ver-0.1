import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { DrivingAdapter, State } from '@/lib/driving-school/types';
import { deferred, schoolState } from './fixtures';
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:vi.fn(()=>{throw new Error('Unexpected RPC');}),functions:{invoke:vi.fn(()=>{throw new Error('Unexpected account write');})}}}));
import { drivingError } from '@/lib/driving-school/cloud-adapter';
import DrivingApp from '@/components/driving-school/DrivingApp';
function adapter(load=vi.fn().mockResolvedValue(schoolState())) {return {load,mutate:vi.fn().mockResolvedValue({}),canCreateStudents:true} satisfies DrivingAdapter;}
const ui=(value:DrivingAdapter,entry='/driving-school')=><MemoryRouter initialEntries={[entry]}><DrivingApp adapter={value} onExit={()=>{}}/></MemoryRouter>;
describe('loaded autoschool context closure',()=>{
 it('ASC01 permission-denied refresh purges school, private form and receipt context; retry starts clean',async()=>{
  const value=adapter();render(ui(value));await screen.findByText('QA School A');
  fireEvent.click(screen.getByRole('button',{name:'Добавить ученика'}));await screen.findByRole('dialog');
  value.load.mockRejectedValueOnce(drivingError({code:'42501'}));act(()=>window.dispatchEvent(new Event('focus')));
  await screen.findByRole('button',{name:'Повторить загрузку'});
  expect(screen.queryByText('QA School A')).toBeNull();expect(screen.queryByRole('dialog')).toBeNull();expect(value.mutate).not.toHaveBeenCalled();
  value.load.mockResolvedValueOnce(schoolState('QA School B'));fireEvent.click(screen.getByRole('button',{name:'Повторить загрузку'}));
  await screen.findByText('QA School B');expect(screen.queryByRole('dialog')).toBeNull();
 });
 it('ASC02 network failure retains an explicitly stale view with writes disabled until successful reread',async()=>{
  const value=adapter();render(ui(value));await screen.findByText('QA School A');
  value.load.mockRejectedValueOnce(drivingError({message:'Failed to fetch'}));fireEvent.click(screen.getByRole('button',{name:'Обновить данные'}));
  await screen.findByText(/Показаны последние загруженные данные/);expect(screen.getByText('QA School A')).toBeTruthy();
  const book=screen.getByRole('button',{name:'Записать на вождение'}) as HTMLButtonElement;
  expect(book.disabled).toBe(true);fireEvent.click(book);expect(value.mutate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Обновить данные'}));await waitFor(()=>expect((screen.getByRole('button',{name:'Записать на вождение'})as HTMLButtonElement).disabled).toBe(false));
 });
 it('ASC03 a late old adapter response cannot replace the new organization view',async()=>{
  const old=deferred<State>(),next=deferred<State>();const a=adapter(),b=adapter(vi.fn().mockReturnValue(next.promise));
  const view=render(ui(a));await screen.findByText('QA School A');a.load.mockReturnValueOnce(old.promise);
  fireEvent.click(screen.getByRole('button',{name:'Обновить данные'}));view.rerender(ui(b));expect(screen.queryByText('QA School A')).toBeNull();
  await act(async()=>next.resolve(schoolState('QA School B','qa-school-B')));await screen.findByText('QA School B');
  await act(async()=>old.resolve(schoolState('Late private old school')));expect(screen.queryByText('Late private old school')).toBeNull();expect(screen.getByText('QA School B')).toBeTruthy();
 });
 it('ASC04 denied invite mutation clears private workspace and cannot display a returned old invite',async()=>{
  const value=adapter();value.mutate.mockRejectedValueOnce(drivingError({code:'42501'}));render(ui(value,'/driving-school?view=team'));
  await screen.findAllByText('Private QA Instructor');fireEvent.click(screen.getByRole('button',{name:'Пригласить'}));
  await screen.findByRole('button',{name:'Повторить загрузку'});expect(screen.queryAllByText('Private QA Instructor')).toHaveLength(0);expect(screen.queryByText('QA School A')).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();expect(value.mutate).toHaveBeenCalledTimes(1);
 });
 it('ASC05 SQLSTATE25000 refresh closes a loaded private form and retries without its prior values',async()=>{
  const value=adapter();render(ui(value));await screen.findByText('QA School A');
  fireEvent.click(screen.getByRole('button',{name:'Добавить ученика'}));await screen.findByRole('dialog');
  const privateDraft='Synthetic private draft before context closure';
  fireEvent.change(screen.getByLabelText('ФИО'),{target:{value:privateDraft}});
  expect(screen.getByDisplayValue(privateDraft)).toBeTruthy();
  value.load.mockRejectedValueOnce(drivingError({code:'25000',message:'network connection with stale private context'}));
  act(()=>window.dispatchEvent(new Event('focus')));
  await screen.findByRole('button',{name:'Повторить загрузку'});
  expect(screen.queryByText('QA School A')).toBeNull();expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByDisplayValue(privateDraft)).toBeNull();expect(screen.queryByText(/Показаны последние загруженные данные/)).toBeNull();
  expect(screen.getByRole('alert').textContent).toContain('Повторите загрузку');expect(value.mutate).not.toHaveBeenCalled();
  value.load.mockResolvedValueOnce(schoolState('Fresh verified QA School'));
  fireEvent.click(screen.getByRole('button',{name:'Повторить загрузку'}));await screen.findByText('Fresh verified QA School');
  expect(screen.queryByRole('dialog')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Добавить ученика'}));
  await screen.findByRole('dialog');expect((screen.getByLabelText('ФИО')as HTMLInputElement).value).toBe('');
 });
 it('ASC06 a late invite result cannot resurrect a workspace closed by SQLSTATE25000 after a clean retry',async()=>{
  const invite=deferred<Record<string,unknown>>(),value=adapter();value.mutate.mockReturnValueOnce(invite.promise);
  render(ui(value,'/driving-school?view=team'));await screen.findAllByText('Private QA Instructor');
  fireEvent.click(screen.getByRole('button',{name:'Пригласить'}));await waitFor(()=>expect(value.mutate).toHaveBeenCalledTimes(1));
  value.load.mockRejectedValueOnce(drivingError({code:'25000'}));act(()=>window.dispatchEvent(new Event('focus')));
  await screen.findByRole('button',{name:'Повторить загрузку'});
  expect(screen.queryByText('QA School A')).toBeNull();expect(screen.queryAllByText('Private QA Instructor')).toHaveLength(0);
  value.load.mockResolvedValueOnce(schoolState('Fresh verified QA School'));
  fireEvent.click(screen.getByRole('button',{name:'Повторить загрузку'}));await screen.findByText('Fresh verified QA School');
  const obsoleteInvite='https://example.invalid/synthetic-obsolete-as-invite';
  await act(async()=>invite.resolve({url:obsoleteInvite}));
  expect(screen.getByText('Fresh verified QA School')).toBeTruthy();expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByDisplayValue(obsoleteInvite)).toBeNull();expect(screen.queryByText('Приглашение создано')).toBeNull();
  expect(value.mutate).toHaveBeenCalledTimes(1);expect(value.load).toHaveBeenCalledTimes(3);
 });
});
