import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { rpc }=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc}}));
import { usePostpaidLessonActivity } from '../usePostpaidLessonActivity';
beforeEach(()=>{
  vi.useFakeTimers();rpc.mockReset().mockResolvedValue({error:null});
  Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
  Object.defineProperty(navigator,'onLine',{value:true,configurable:true});
});
afterEach(()=>vi.useRealTimers());
describe('learner usage instrumentation',()=>{
  it('records the visible lesson without accepting a client supplied learner identity',async()=>{
    renderHook(()=>usePostpaidLessonActivity('lesson','learner',true));
    await act(async()=>{});
    expect(rpc).toHaveBeenCalledWith('record_postpaid_lesson_activity',{p_lesson_id:'lesson'});
  });
  it('skips preview, loading, offline and non-lesson screens through the active gate',async()=>{
    renderHook(()=>usePostpaidLessonActivity('lesson','admin',false));await act(async()=>{});
    expect(rpc).not.toHaveBeenCalled();
  });
  it('does not record hidden content and resumes after returning to the lesson',async()=>{
    Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});
    renderHook(()=>usePostpaidLessonActivity('lesson','learner',true));await act(async()=>{});
    expect(rpc).not.toHaveBeenCalled();
    Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
    await act(async()=>document.dispatchEvent(new Event('visibilitychange')));
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('retries while the lesson remains open and stops on unmount',async()=>{
    const {unmount}=renderHook(()=>usePostpaidLessonActivity('lesson','learner',true));await act(async()=>{});
    await act(async()=>vi.advanceTimersByTime(300000));expect(rpc).toHaveBeenCalledTimes(2);
    unmount();await act(async()=>vi.advanceTimersByTime(300000));expect(rpc).toHaveBeenCalledTimes(2);
  });
});
