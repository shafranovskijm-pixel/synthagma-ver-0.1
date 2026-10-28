import type { ButtonHTMLAttributes, MouseEventHandler, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const h=vi.hoisted(()=>({clicks:[] as {label:string;handler:MouseEventHandler<HTMLButtonElement>}[]}));
vi.mock('@/components/ui/button',()=>({Button:({children,onClick,variant:_,size:__,...props}:
  ButtonHTMLAttributes<HTMLButtonElement>&{variant?:string;size?:string})=>{
  if(typeof children==='string'&&onClick)h.clicks.push({label:children,handler:onClick});
  return <button {...props} onClick={onClick}>{children}</button>;
}}));
vi.mock('@/components/ui/dialog',()=>({
  Dialog:({open,children}:{open:boolean;children:ReactNode})=>open?<div role="dialog">{children}</div>:null,
  DialogContent:({children}:{children:ReactNode})=><div>{children}</div>,
  DialogHeader:({children}:{children:ReactNode})=><div>{children}</div>,
  DialogTitle:({children}:{children:ReactNode})=><h2>{children}</h2>,
  DialogDescription:({children}:{children:ReactNode})=><p>{children}</p>,
}));
import { DrivingMembershipAccessButton } from './DrivingMembershipAccess';
import type { DrivingMembershipAccess, DrivingMembershipAccessPort } from '@/lib/driving-school/membership-access';
const actor='10000000-0000-0000-0000-000000000001',org='20000000-0000-0000-0000-000000000001';
const target='30000000-0000-0000-0000-000000000001',other='30000000-0000-0000-0000-000000000002';
const access=():DrivingMembershipAccess=>({actorId:actor,organizationId:org,role:'student',targetId:target,state:'linked',
  membership:{id:'40000000-0000-0000-0000-000000000001',userId:'50000000-0000-0000-0000-000000000001',updatedAt:'2026-10-29T01:00:00.123456+00:00'},revocation:null});
function deferred<T>() {let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
const port=()=>({read:vi.fn<DrivingMembershipAccessPort['read']>().mockResolvedValue(access())});
const handler=()=>{const clicks=h.clicks.filter(item=>item.label==='Отозвать доступ в автошколу');return clicks[clicks.length-1]!.handler;};
const invoke=(held:MouseEventHandler<HTMLButtonElement>)=>held({} as Parameters<MouseEventHandler<HTMLButtonElement>>[0]);
beforeEach(()=>{h.clicks.length=0;});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
describe('explicit school access review and revoke',()=>{
  it('ASMR12 mount has no read/write side effect; the owner explicitly reads one selected relationship',async()=>{
    const api=port(),revoke=vi.fn().mockResolvedValue(undefined);
    render(<DrivingMembershipAccessButton port={api} role="student" targetId={target} name="Synthetic learner" enabled onRevoke={revoke}/>);
    expect(api.read).not.toHaveBeenCalled();expect(revoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Доступ в кабинет'}));
    await screen.findByLabelText('Причина отзыва');
    expect(api.read).toHaveBeenCalledExactlyOnceWith('student',target);
    expect(revoke).not.toHaveBeenCalled();
    expect(screen.getByText(/Обычный кабинет СИНТАГМЫ и история обучения сохранятся/)).toBeTruthy();
  });
  it('ASMR13 a nonempty explicit reason is required; one click submits the exact reviewed grant',async()=>{
    const api=port(),revoke=vi.fn().mockResolvedValue(undefined);
    render(<DrivingMembershipAccessButton port={api} role="student" targetId={target} name="Synthetic learner" enabled onRevoke={revoke}/>);
    fireEvent.click(screen.getByRole('button',{name:'Доступ в кабинет'}));await screen.findByLabelText('Причина отзыва');
    expect(screen.getByRole('button',{name:'Отозвать доступ в автошколу'}).hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('Причина отзыва'),{target:{value:'  Завершён доступ  '}});
    fireEvent.click(screen.getByRole('button',{name:'Отозвать доступ в автошколу'}));
    await waitFor(()=>expect(revoke).toHaveBeenCalledTimes(1));
    expect(revoke.mock.calls[0][0]).toEqual(access());expect(revoke.mock.calls[0][1]).toBe('Завершён доступ');
    expect(revoke.mock.calls[0][2]).toMatch(/^[0-9a-f-]{36}$/i);
    await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('ASMR14 same-payload retry after a lost acknowledgement retains the same operation id',async()=>{
    const api=port(),revoke=vi.fn().mockRejectedValueOnce(new Error('Ответ потерян')).mockResolvedValue(undefined);
    render(<DrivingMembershipAccessButton port={api} role="student" targetId={target} name="Synthetic learner" enabled onRevoke={revoke}/>);
    fireEvent.click(screen.getByRole('button',{name:'Доступ в кабинет'}));await screen.findByLabelText('Причина отзыва');
    fireEvent.change(screen.getByLabelText('Причина отзыва'),{target:{value:'Причина'}});
    fireEvent.click(screen.getByRole('button',{name:'Отозвать доступ в автошколу'}));await screen.findByText('Ответ потерян');
    fireEvent.click(screen.getByRole('button',{name:'Отозвать доступ в автошколу'}));
    await waitFor(()=>expect(revoke).toHaveBeenCalledTimes(2));
    expect(revoke.mock.calls[1]).toEqual(revoke.mock.calls[0]);
  });
  it.each(['unlinked','protected','revoked'] as const)('ASMR15 %s status offers no revoke or implicit restore',async state=>{
    const value=access();value.state=state;
    if(state!=='revoked')value.membership=null;
    else value.revocation={requestId:'60000000-0000-0000-0000-000000000001',revokedAt:'2026-10-29T02:00:00+00:00'};
    const api=port();api.read.mockResolvedValue(value);const revoke=vi.fn();
    render(<DrivingMembershipAccessButton port={api} role="student" targetId={target} name="Synthetic learner" enabled onRevoke={revoke}/>);
    fireEvent.click(screen.getByRole('button',{name:'Доступ в кабинет'}));
    await waitFor(()=>expect(screen.queryByText('Проверяем текущую привязку…')).toBeNull());
    expect(screen.queryByRole('button',{name:'Отозвать доступ в автошколу'})).toBeNull();
    expect(screen.queryByLabelText('Причина отзыва')).toBeNull();expect(revoke).not.toHaveBeenCalled();
  });
  it('ASMR16 deferred response from a former port/resource cannot revive a previous grant',async()=>{
    const a=deferred<DrivingMembershipAccess>(),b=deferred<DrivingMembershipAccess>();
    const apiA=port(),apiB=port();apiA.read.mockReturnValue(a.promise);apiB.read.mockReturnValue(b.promise);const revoke=vi.fn();
    const view=render(<DrivingMembershipAccessButton port={apiA} role="student" targetId={target} name="A" enabled onRevoke={revoke}/>);
    fireEvent.click(screen.getByRole('button',{name:'Доступ в кабинет'}));
    view.rerender(<DrivingMembershipAccessButton port={apiB} role="student" targetId={other} name="B" enabled onRevoke={revoke}/>);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Доступ в кабинет'}));
    await act(async()=>a.resolve(access()));expect(screen.queryByLabelText('Причина отзыва')).toBeNull();
    await act(async()=>b.resolve({...access(),targetId:other}));await screen.findByLabelText('Причина отзыва');
    expect(revoke).not.toHaveBeenCalled();
  });
  it('ASMR17 a retained stale click handler cannot start a new mutation after actor/school context changes',async()=>{
    const apiA=port(),apiB=port(),revoke=vi.fn();
    const view=render(<DrivingMembershipAccessButton port={apiA} role="student" targetId={target} name="A" enabled onRevoke={revoke}/>);
    fireEvent.click(screen.getByRole('button',{name:'Доступ в кабинет'}));await screen.findByLabelText('Причина отзыва');
    fireEvent.change(screen.getByLabelText('Причина отзыва'),{target:{value:'Причина'}});const stale=handler();
    view.rerender(<DrivingMembershipAccessButton port={apiB} role="student" targetId={other} name="B" enabled onRevoke={revoke}/>);
    act(()=>invoke(stale));expect(revoke).not.toHaveBeenCalled();expect(apiB.read).not.toHaveBeenCalled();
  });
  it('ASMR18 enabled false→true requires a new review and cannot reuse an old handler/result',async()=>{
    const api=port(),revoke=vi.fn();
    const props={port:api,role:'student' as const,targetId:target,name:'A',onRevoke:revoke};
    const view=render(<DrivingMembershipAccessButton {...props} enabled/>);
    fireEvent.click(screen.getByRole('button',{name:'Доступ в кабинет'}));await screen.findByLabelText('Причина отзыва');
    fireEvent.change(screen.getByLabelText('Причина отзыва'),{target:{value:'Причина'}});const stale=handler();
    view.rerender(<DrivingMembershipAccessButton {...props} enabled={false}/>);
    view.rerender(<DrivingMembershipAccessButton {...props} enabled/>);
    expect(screen.queryByRole('dialog')).toBeNull();act(()=>invoke(stale));expect(revoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Доступ в кабинет'}));await screen.findByLabelText('Причина отзыва');
    expect(api.read).toHaveBeenCalledTimes(2);
  });
  it('ASMR19 disabling the parent masks an already-started operation; it does not cancel or replay it',async()=>{
    const done=deferred<void>(),api=port(),revoke=vi.fn().mockReturnValue(done.promise);
    const props={port:api,role:'student' as const,targetId:target,name:'A',onRevoke:revoke};
    const view=render(<DrivingMembershipAccessButton {...props} enabled/>);
    fireEvent.click(screen.getByRole('button',{name:'Доступ в кабинет'}));await screen.findByLabelText('Причина отзыва');
    fireEvent.change(screen.getByLabelText('Причина отзыва'),{target:{value:'Причина'}});
    fireEvent.click(screen.getByRole('button',{name:'Отозвать доступ в автошколу'}));
    expect(revoke).toHaveBeenCalledTimes(1);view.rerender(<DrivingMembershipAccessButton {...props} enabled={false}/>);
    expect(screen.queryByRole('dialog')).toBeNull();await act(async()=>done.resolve());
    view.rerender(<DrivingMembershipAccessButton {...props} enabled/>);
    expect(screen.queryByRole('dialog')).toBeNull();expect(revoke).toHaveBeenCalledTimes(1);
  });
});
