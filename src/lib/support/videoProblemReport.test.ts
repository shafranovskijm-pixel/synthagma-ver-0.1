import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), profile: vi.fn(), insert: vi.fn(), read: vi.fn(), invoke: vi.fn(), upload: vi.fn() }));
vi.mock('./videoReportScreenshotUpload',()=>({uploadVideoReportScreenshot:mocks.upload}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getUser: mocks.getUser }, functions: { invoke: mocks.invoke },
  from: (table: string) => table === 'profiles' ? { select: () => ({ eq: () => ({ single: mocks.profile }) }) } : {
    insert: (row: unknown) => ({ select: () => ({ single: () => mocks.insert(row) }) }),
    select: () => ({ eq: () => ({ eq: () => ({ single: mocks.read, maybeSingle:mocks.read }) }) }),
  },
} }));
import { submitVideoProblemReport, videoReportBrowser, videoReportDiagnostics, videoReportIncident } from './videoProblemReport';

const context = { userId: '10000000-0000-4000-8000-000000000001', courseId: '20000000-0000-4000-8000-000000000001', lessonId: '30000000-0000-4000-8000-000000000001' };
const failure = { backend: 'kinescope' as const, stage: 'provider-media', message: 'secret-token https://private.invalid/doc/secret?token=unsafe', code: 'token=unsafe' };
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear();
  mocks.getUser.mockResolvedValue({ data: { user: { id: context.userId, email: 'qa@example.invalid' } }, error: null });
  mocks.profile.mockResolvedValue({ data: { full_name: 'QA', organization_id: '40000000-0000-4000-8000-000000000001' }, error: null });
  mocks.insert.mockImplementation(async (row: {id: string}) => ({ data: {id: row.id}, error: null }));
  mocks.invoke.mockResolvedValue({ data: {ok: true}, error: null });
  mocks.read.mockResolvedValue({data:null,error:null});
  mocks.upload.mockResolvedValue('storage://student-documents/support/private-image.png');
});

describe('video error support persistence', () => {
  it('uploads an explicitly chosen image before saving only its private reference',async()=>{
    const file=new File(['synthetic'],'private-file-name.png',{type:'image/png'});
    const result=await submitVideoProblemReport({...context,lessonId:'30000000-0000-4000-8000-000000000088'},failure,()=>true,file);
    expect(result.selectedScreenshotNotAdded).toBe(false);
    expect(mocks.upload).toHaveBeenCalledWith(context.userId,result.id,file,expect.any(Function));
    expect(mocks.insert.mock.calls[0][0].screenshot_url).toBe('storage://student-documents/support/private-image.png');
    expect(JSON.stringify(mocks.insert.mock.calls[0][0])).not.toMatch(/private-file-name|token=|https:\/\/private/);
    expect(mocks.upload.mock.invocationCallOrder[0]).toBeLessThan(mocks.insert.mock.invocationCallOrder[0]);
  });
  it('preserves an already stored incident instead of replacing its image after an uncertain response',async()=>{
    const scope={...context,lessonId:'30000000-0000-4000-8000-000000000089'};
    let stored:any;mocks.insert.mockImplementationOnce(async row=>{stored=row;return{data:null,error:{code:'NETWORK'}};});
    await expect(submitVideoProblemReport(scope,failure)).rejects.toThrow();
    mocks.read.mockResolvedValue({data:stored,error:null});
    const result=await submitVideoProblemReport(scope,failure,()=>true,new File(['image'],'new.png',{type:'image/png'}));
    expect(result).toEqual({id:stored.id,selectedScreenshotNotAdded:true});
    expect(mocks.upload).not.toHaveBeenCalled();expect(mocks.insert).toHaveBeenCalledTimes(1);
  });
  it.each([null,'storage://student-documents/support/private-image.png'])('reports the image actually stored when a concurrent insert wins',async savedReference=>{
    let stored:any;
    mocks.read.mockImplementation(async()=>({data:stored||null,error:null}));
    mocks.insert.mockImplementation(async row=>{stored={...row,screenshot_url:savedReference};return{data:null,error:{code:'23505'}};});
    const result=await submitVideoProblemReport(context,failure,()=>true,new File(['image'],'new.png',{type:'image/png'}));
    expect(result.selectedScreenshotNotAdded).toBe(savedReference===null);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });
  it.each(['foreign','unreadable','upload-failed','context-changed'])('never saves a misleading screenshot report when %s',async kind=>{
    if(kind==='foreign')mocks.read.mockResolvedValue({data:{id:'other'},error:null});
    if(kind==='unreadable')mocks.read.mockResolvedValue({data:null,error:{code:'403'}});
    if(kind==='upload-failed')mocks.upload.mockRejectedValue(new Error('storage unavailable'));
    let current=true;if(kind==='context-changed')mocks.upload.mockImplementation(async()=>{current=false;return'private-ref';});
    await expect(submitVideoProblemReport(context,failure,()=>current,new File(['image'],'new.png',{type:'image/png'}))).rejects.toThrow();
    expect(mocks.insert).not.toHaveBeenCalled();expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it('stores only allowlisted diagnostics and canonical lesson context; not URLs, tokens or raw errors', async () => {
    await submitVideoProblemReport(context, failure);
    const row = mocks.insert.mock.calls[0][0];
    expect(row).toMatchObject({ user_id: context.userId, page_url: `https://xn--80aaiswd0ak.xn--p1ai/course/${context.courseId}/learn` });
    expect(JSON.parse(row.error_logs)).toMatchObject({kind: 'video_playback', courseId: context.courseId, lessonId: context.lessonId, stage: 'provider-media', code: null});
    expect(JSON.stringify(row)).not.toMatch(/unsafe|secret-token|private\.invalid|drmauthtoken|screenshot_url|contact_phone/);
    expect(mocks.invoke).toHaveBeenCalledWith('notify-support-request', {body: {request_id: row.id}});
    expect(mocks.insert.mock.invocationCallOrder[0]).toBeLessThan(mocks.invoke.mock.invocationCallOrder[0]);
  });
  it.each([null, {id: '90000000-0000-4000-8000-000000000001'}])('does not write for absent/changed authenticated actor %j', async user => {
    mocks.getUser.mockResolvedValue({data: {user}, error: null});
    await expect(submitVideoProblemReport(context, failure)).rejects.toThrow('authentication_required');
    expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it('does not write after the lesson context is unmounted while profile is loading', async () => {
    let current = true;
    mocks.profile.mockImplementation(async () => { current = false; return {data: {}, error: null}; });
    await expect(submitVideoProblemReport(context, failure, () => current)).rejects.toThrow('profile_unavailable');
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('reuses the incident across reload/retry storage and other failure types', () => {
    const first = videoReportIncident(context);
    expect(videoReportIncident({...context})).toEqual(first);
    expect(JSON.stringify([...Object.values(sessionStorage)])).not.toMatch(/token|message|email/);
  });
  it('resolves an uncertain network write through the same ID and an exact own-row read', async () => {
    const delayedContext = {...context, lessonId:'30000000-0000-4000-8000-000000000077'};
    let stored: any;
    mocks.insert.mockImplementationOnce(async row => { stored = row; return {data: null, error: {code: 'NETWORK'}}; })
      .mockImplementationOnce(async row => { expect(row.id).toBe(stored.id); return {data: null, error: {code: '23505'}}; });
    mocks.read.mockImplementation(async () => ({data: stored, error: null}));
    await expect(submitVideoProblemReport(delayedContext, failure)).rejects.toThrow('support_request_not_stored');
    expect(mocks.invoke).not.toHaveBeenCalled();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 16 * 60_000);
    try {
      const result = await submitVideoProblemReport(delayedContext, failure);
      expect(result.id).toBe(stored.id); expect(mocks.invoke).toHaveBeenCalledTimes(1);
    } finally {clock.mockRestore();}
  });
  it.each(['foreign-user', 'other-page', 'other-description', 'not-readable'])('rejects a conflicting request that is %s', async kind => {
    let stored: any;
    mocks.insert.mockImplementation(async row => {stored = row; return {data:null,error:{code:'23505'}};});
    mocks.read.mockImplementation(async () => ({data: kind === 'not-readable' ? null : {...stored,
      ...(kind === 'foreign-user' ? {user_id:'other'} : kind === 'other-page' ? {page_url:'/other'} : {description:'other'})}, error:null}));
    await expect(submitVideoProblemReport(context, failure)).rejects.toThrow('support_request_conflict');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it('keeps successful persistence even if notification delivery fails', async () => {
    mocks.invoke.mockRejectedValue(new Error('offline'));
    await expect(submitVideoProblemReport(context, failure)).resolves.toHaveProperty('id');
  });
  it('preserves an unresolved request ID even when retry happens after the ordinary dedup window', async () => {
    const delayedContext = {...context, lessonId:'30000000-0000-4000-8000-000000000099'};
    const first = videoReportIncident(delayedContext);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(first.createdAt + 60 * 60_000);
    expect(videoReportIncident(delayedContext).id).toBe(first.id);
    clock.mockRestore();
  });
  it('rejects invalid course/lesson context before any authenticated call', async () => {
    await expect(submitVideoProblemReport({...context, courseId:'https://secret.invalid?token=unsafe'}, failure)).rejects.toThrow('invalid_video_report_context');
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it('keeps numeric codes but discards arbitrary backend/stage/message fields', () => {
    const diag = videoReportDiagnostics(context, {...failure, backend: 'secret' as any, stage: 'https://secret', code: 403}, {id: context.userId, createdAt: 1});
    expect(diag).toMatchObject({backend:'unknown',stage:'unknown',code:'403'});
    expect(JSON.stringify(diag)).not.toContain('secret');
  });
  it.each([
    ['Mozilla Windows Chrome/130.0.1 Edg/131.2 token=unsafe', 'Edge 131 / Windows'],
    ['Mozilla iPhone Version/18.2 Safari/600.1 secret', 'Safari 18 / iOS'],
    ['Mozilla Android Chrome/130.1 secret', 'Chrome 130 / Android'],
    ['secret token=unsafe', 'Other / Other'],
  ])('reduces a raw browser signature to family/version/platform', (ua, expected) => {
    expect(videoReportBrowser(ua)).toBe(expected);
  });
});
