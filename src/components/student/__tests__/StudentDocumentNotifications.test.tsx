import React from 'react';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {TooltipProvider} from '@/components/ui/tooltip';
const m=vi.hoisted(()=>({navigate:vi.fn(),inbox:{pendingCount:1,pending:[{id:'30000000-0000-4000-8000-000000000001',document_title:'Подтверждение получения электронной копии'}],error:null as string|null,reload:vi.fn()},legacy:[] as any[],updates:vi.fn()}));
vi.mock('react-router-dom',()=>({useNavigate:()=>m.navigate}));
vi.mock('@/hooks/useStudentSignatureInbox',()=>({useStudentSignatureInbox:()=>m.inbox}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>{const chain:any={select:()=>chain,eq:()=>chain,order:()=>chain,limit:()=>Promise.resolve({data:m.legacy,error:null}),update:(value:any)=>{m.updates(value);return chain;},in:()=>chain,then:(done:any)=>done({error:null})};return chain;},channel:()=>{const c:any={on:()=>c,subscribe:()=>c};return c;},removeChannel:vi.fn()}}));
import {StudentNotifications} from '../StudentNotifications';
beforeEach(()=>{vi.clearAllMocks();m.inbox.pendingCount=1;m.inbox.error=null;m.legacy=[];});
afterEach(cleanup);
const open=async()=>{render(<TooltipProvider><StudentNotifications userId="20000000-0000-4000-8000-000000000001" organizationId="10000000-0000-4000-8000-000000000001"/></TooltipProvider>);fireEvent.click(screen.getByRole('button',{name:/Уведомления:/}));await screen.findByText(/Документы: требуется подтверждение/);};
describe('document actions in the learner bell',()=>{
 it('opens the exact own request through documents without publishing its signing token',async()=>{await open();fireEvent.click(screen.getByRole('button',{name:/Подтверждение получения электронной копии/}));expect(m.navigate).toHaveBeenCalledWith('/student?tab=profile&section=documents&documentRequest=30000000-0000-4000-8000-000000000001');expect(m.updates).not.toHaveBeenCalled();});
 it('marking notifications read does not confirm a document or clear its action',async()=>{m.legacy=[{id:'old-note',type:'homework',title:'Проверено задание',message:null,related_id:null,is_read:false,created_at:'2026-11-23T08:00:00Z'}];await open();await waitFor(()=>expect(screen.getByRole('button',{name:/Отметить все/})).toBeTruthy());fireEvent.click(screen.getByRole('button',{name:/Отметить все/}));expect(screen.getByText(/Документы: требуется подтверждение \(1\)/)).toBeTruthy();expect(m.updates).toHaveBeenCalledWith({is_read:true});});
 it('shows a failed document read explicitly instead of declaring that there are none',async()=>{m.inbox.error='Не удалось проверить документы. Повторите загрузку.';await open();expect(screen.getByRole('alert').textContent).toContain('Не удалось проверить документы');fireEvent.click(screen.getByRole('button',{name:'Повторить проверку документов'}));expect(m.inbox.reload).toHaveBeenCalledTimes(1);});
});
