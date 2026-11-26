import '@testing-library/jest-dom/vitest';
import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import * as f from '@/lib/individualEducationIssuance/__tests__/fixtures';
import {captureOfflineContext,observeOfflineAccess,setOfflineAuthActor} from '@/utils/courseCache';

const m=vi.hoisted(()=>({read:vi.fn(),run:vi.fn(),make:vi.fn(),changed:vi.fn(),close:vi.fn(),childCleanup:vi.fn(),extraCurrent:true}));
vi.mock('@/lib/individualEducationIssuance/client',async original=>{
  const actual=await original<typeof import('@/lib/individualEducationIssuance/client')>();
  return {...actual,read:(...args:any[])=>m.read(...args),scopeCurrent:(scope:any)=>m.extraCurrent&&actual.scopeCurrent(scope)};
});
vi.mock('../AdmissionReview',()=>({
  button:'test-button',
  AdmissionReview:({scope,disabled,perform}:any)=>{
    React.useEffect(()=>()=>m.childCleanup(),[scope]);
    return <section><p>PRIVATE verified evidence preview</p><button disabled={disabled} onClick={()=>void perform('Сохранить файл',async()=>{m.make();return{run:m.run};})}>Сохранить выбранный файл</button></section>;
  },
}));
vi.mock('../ProtocolReview',()=>({ProtocolReview:()=> <p>PRIVATE protocol preview</p>}));
vi.mock('../ArtifactReview',()=>({ArtifactReview:()=> <p>PRIVATE issued PDF preview</p>}));
vi.mock('@/components/organization/education-issuance/RecordDialog',()=>({EducationIssuanceRecordDialog:()=> <p>PRIVATE record dialog</p>}));
import {IndividualEducationIssuanceDialog} from '../IndividualEducationIssuanceDialog';
import {IndividualIssuanceError} from '@/lib/individualEducationIssuance/client';

const row:any={enrollment_id:f.enrollment,student_user_id:f.pupil,student_label:'PRIVATE pupil label',course_id:f.course,course_label:'PRIVATE course label',group_id:null};
const contextResult=()=>({...f.envelope('context'),context:f.context()});
const rendered=(accessKey='same-scope')=><MemoryRouter><IndividualEducationIssuanceDialog organizationId={f.org} row={row} enabled accessKey={accessKey} onChanged={m.changed} onClose={m.close} onOpenOrders={()=>undefined}/></MemoryRouter>;
const mount=()=>render(rendered());
const save=()=>screen.getByRole('button',{name:'Сохранить выбранный файл'});
const reopen=()=>screen.getByRole('button',{name:'Открыть актуальную проверку'});
const staleMessage=()=>screen.getByText(/Сведения о сеансе или доступе изменились/);
const heldMessage=()=>screen.getByText(/Результат подготовленного запроса ещё не подтверждён/);
const changedSameOwner=()=>{
  const previous=captureOfflineContext();
  act(()=>observeOfflineAccess(f.actor,'role-hint:organization'));
  expect(captureOfflineContext()?.actorId).toBe(previous?.actorId);
  expect(captureOfflineContext()!.revision).toBeGreaterThan(previous!.revision);
};

beforeEach(()=>{
  vi.clearAllMocks();m.extraCurrent=true;
  setOfflineAuthActor(f.actor);observeOfflineAccess(f.actor,'server-role:organization');
  m.read.mockImplementation(async()=>contextResult());m.run.mockResolvedValue({});
});
afterEach(()=>{cleanup();setOfflineAuthActor(null);});

describe('visible fail-closed recovery for an expired individual issuance view',()=>{
  it('unmounts private children on a same-owner access epoch, then reads fresh state only after an explicit action',async()=>{
    mount();await screen.findByText('PRIVATE verified evidence preview');
    const initialScope=m.read.mock.calls[0][0];const reads=m.read.mock.calls.length;
    changedSameOwner();
    expect(staleMessage()).toBeInTheDocument();
    expect(screen.queryByText('PRIVATE verified evidence preview')).toBeNull();
    expect(screen.queryByText('PRIVATE protocol preview')).toBeNull();
    expect(screen.queryByText('PRIVATE issued PDF preview')).toBeNull();
    expect(screen.queryByText(/PRIVATE pupil label/)).toBeNull();
    expect(m.childCleanup).toHaveBeenCalledTimes(1);
    expect(m.read).toHaveBeenCalledTimes(reads);expect(m.make).not.toHaveBeenCalled();expect(m.run).not.toHaveBeenCalled();
    fireEvent.click(reopen());
    await screen.findByText('PRIVATE verified evidence preview');
    const freshScope=m.read.mock.calls.at(-1)![0];
    expect(freshScope.actorId).toBe(initialScope.actorId);
    expect(freshScope.accessRevision).toBeGreaterThan(initialScope.accessRevision);
    expect(freshScope.enrollmentId).toBe(initialScope.enrollmentId);
    expect(m.make).not.toHaveBeenCalled();expect(m.run).not.toHaveBeenCalled();
    fireEvent.click(save());await waitFor(()=>expect(m.run).toHaveBeenCalledTimes(1));
  });

  it('turns a failed current-scope action guard into a visible blocked state without invoking its command',async()=>{
    mount();await screen.findByText('PRIVATE verified evidence preview');
    m.extraCurrent=false;fireEvent.click(save());
    expect(staleMessage()).toBeInTheDocument();expect(m.make).not.toHaveBeenCalled();expect(m.run).not.toHaveBeenCalled();
    expect(screen.queryByText('PRIVATE verified evidence preview')).toBeNull();
  });

  it('does not recapture or replay the old pupil context for a different authenticated actor',async()=>{
    mount();await screen.findByText('PRIVATE verified evidence preview');const reads=m.read.mock.calls.length;
    act(()=>setOfflineAuthActor(f.uid(999)));
    expect(staleMessage()).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Открыть актуальную проверку'})).toBeNull();
    expect(screen.queryByText(/PRIVATE pupil label/)).toBeNull();expect(m.read).toHaveBeenCalledTimes(reads);expect(m.run).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Закрыть проверку'}));expect(m.close).toHaveBeenCalledTimes(1);
  });

  it('suppresses an old private context response and releases its owned read flight after epoch invalidation',async()=>{
    let finish!:(value:any)=>void;
    m.read.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
    mount();await waitFor(()=>expect(m.read).toHaveBeenCalledTimes(1));
    changedSameOwner();expect(staleMessage()).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Открыть актуальную проверку'})).toBeNull();
    await act(async()=>finish(contextResult()));
    expect(screen.queryByText('PRIVATE verified evidence preview')).toBeNull();
    expect(screen.queryByText('Проверяем сохранённые сведения…')).toBeNull();
    expect(reopen()).toBeEnabled();expect(m.changed).not.toHaveBeenCalled();
    fireEvent.click(reopen());await screen.findByText('PRIVATE verified evidence preview');
    expect(m.read).toHaveBeenCalledTimes(2);expect(m.run).not.toHaveBeenCalled();
  });

  it('keeps exactly one in-flight prepared request held after a late response, without publishing it or rebinding it',async()=>{
    let finish!:(value:any)=>void;m.run.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
    mount();await screen.findByText('PRIVATE verified evidence preview');
    const button=save();act(()=>{fireEvent.click(button);fireEvent.click(button);});
    await waitFor(()=>expect(m.run).toHaveBeenCalledTimes(1));expect(m.make).toHaveBeenCalledTimes(1);
    changedSameOwner();expect(heldMessage()).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Открыть актуальную проверку'})).toBeNull();
    await act(async()=>finish({late:'PRIVATE ignored mutation response'}));
    expect(heldMessage()).toBeInTheDocument();expect(screen.queryByText('Проверяем сохранённые сведения…')).toBeNull();
    expect(screen.queryByText('PRIVATE verified evidence preview')).toBeNull();expect(m.changed).not.toHaveBeenCalled();
    expect(screen.queryByRole('button',{name:'Проверить и повторить тот же запрос'})).toBeNull();
    act(()=>observeOfflineAccess(f.actor,'server-role:organization'));
    expect(heldMessage()).toBeInTheDocument();expect(m.make).toHaveBeenCalledTimes(1);expect(m.run).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button',{name:'Закрыть проверку'}));expect(m.close).toHaveBeenCalledTimes(1);
  });

  it('retains an unknown request across a prop/access reset rather than initializing a replacement',async()=>{
    m.run.mockRejectedValueOnce(new IndividualIssuanceError());
    const view=mount();await screen.findByText('PRIVATE verified evidence preview');
    fireEvent.click(save());await screen.findByRole('button',{name:'Проверить и повторить тот же запрос'});
    const reads=m.read.mock.calls.length;view.rerender(rendered('access-reset'));
    expect(heldMessage()).toBeInTheDocument();expect(m.read).toHaveBeenCalledTimes(reads);
    expect(m.make).toHaveBeenCalledTimes(1);expect(m.run).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button',{name:'Открыть актуальную проверку'})).toBeNull();
  });
});
