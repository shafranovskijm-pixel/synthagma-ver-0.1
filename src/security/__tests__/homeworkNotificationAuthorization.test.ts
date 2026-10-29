import { describe, it, expect, vi } from 'vitest';
import { createHomeworkNotificationHandler, type VerifiedHomeworkReview, type VerifiedHomeworkDelivery } from '../../../supabase/functions/notify-homework-graded/handler';
const id = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const actor = id(1), student = id(2), submission = id(3), lesson = id(4), course = id(5), org = id(6);
function fixture() {
  const row: VerifiedHomeworkReview = { id: submission, student_id: student, lesson_id: lesson, course_id: course, organization_id: org,
    status: 'revision', score: null, reviewer_id: actor, reviewer_comment: '[TEST] Add the requested check.', reviewed_at: '2026-10-29T00:00:00.000Z' };
  const scope = { lesson_id: lesson, course_id: course, organization_id: org, lesson_title: 'TEST lesson', course_title: 'TEST course', student_id: student, student_organization_id: org,
    enrollment_user_id: student, enrollment_course_id: course, enrollment_status: 'active' };
  const client = { currentUser: vi.fn(async (): Promise<string | null> => actor),
    readSubmission: vi.fn(async (_id: string): Promise<unknown> => ({ ...row })),
    readScope: vi.fn(async (_lesson: string, _course: string): Promise<unknown> => ({ ...scope })),
    canReview: vi.fn(async (_course: string) => true) };
  const deliver = vi.fn(async (_context: VerifiedHomeworkDelivery) => ({ emailSent: false }));
  const ordinary = vi.fn((_bearer: string) => client);
  return { row, scope, client, deliver, ordinary, handler: createHomeworkNotificationHandler({ ordinary, deliver }) };
}
function request(body: unknown = { submission_id: submission }, bearer: string | null = 'Bearer unit-ordinary-token') {
  return new Request('https://unit.invalid/notify-homework-graded', { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: bearer } : {}) }, body: JSON.stringify(body) });
}
describe('homework notification ordinary authorization: no outbound sends', () => {
  it('HN01 denies missing bearer before client or delivery', async () => { const f=fixture(); expect((await f.handler(request(undefined,null))).status).toBe(401); expect(f.ordinary).not.toHaveBeenCalled(); expect(f.deliver).not.toHaveBeenCalled(); });
  it('HN02 denies a service token that has no genuine user', async () => { const f=fixture(); f.client.currentUser.mockResolvedValue(null); expect((await f.handler(request(undefined,'Bearer service-token-not-a-user'))).status).toBe(401); expect(f.client.readSubmission).not.toHaveBeenCalled(); expect(f.deliver).not.toHaveBeenCalled(); });
  it('HN03 rejects caller-supplied recipient or scope fields', async () => { const f=fixture(); expect((await f.handler(request({ submission_id:submission,user_id:student }))).status).toBe(400); expect(f.ordinary).not.toHaveBeenCalled(); expect(f.deliver).not.toHaveBeenCalled(); });
  it('HN04 rejects malformed submission ID', async () => { const f=fixture(); expect((await f.handler(request({submission_id:'not-uuid'}))).status).toBe(400); expect(f.deliver).not.toHaveBeenCalled(); });
  it('HN05 denies RLS-hidden or missing submission', async () => { const f=fixture(); f.client.readSubmission.mockResolvedValue(null); expect((await f.handler(request())).status).toBe(403); expect(f.deliver).not.toHaveBeenCalled(); });
  it('HN06 denies student self-notification even if a malformed row names them reviewer', async () => { const f=fixture(); f.client.currentUser.mockResolvedValue(student); f.client.readSubmission.mockResolvedValue({...f.row,reviewer_id:student}); expect((await f.handler(request())).status).toBe(403); expect(f.deliver).not.toHaveBeenCalled(); });
  it('HN07 denies another same-organization reviewer', async () => { const f=fixture(); f.client.readSubmission.mockResolvedValue({...f.row,reviewer_id:id(7)}); expect((await f.handler(request())).status).toBe(403); expect(f.deliver).not.toHaveBeenCalled(); });
  it('HN08 denies an unreviewed pending response', async () => { const f=fixture(); f.client.readSubmission.mockResolvedValue({...f.row,status:'pending',reviewed_at:null}); expect((await f.handler(request())).status).toBe(403); expect(f.deliver).not.toHaveBeenCalled(); });
  it('HN09 denies absent active-profile or homework.write permission', async () => { const f=fixture(); f.client.canReview.mockResolvedValue(false); expect((await f.handler(request())).status).toBe(403); expect(f.deliver).not.toHaveBeenCalled(); });
  it('HN10 denies cross-organization course/lesson association', async () => { const f=fixture(); f.client.readScope.mockResolvedValue({...f.scope,organization_id:id(8)}); expect((await f.handler(request())).status).toBe(403); expect(f.deliver).not.toHaveBeenCalled(); });
  it('HN11 denies a changed actor on fresh ordinary confirmation', async () => { const f=fixture(); f.client.currentUser.mockResolvedValueOnce(actor).mockResolvedValueOnce(id(9)); expect((await f.handler(request())).status).toBe(403); expect(f.deliver).not.toHaveBeenCalled(); });
  it('HN12 denies changed comment or review before delivery', async () => { const f=fixture(); f.client.readSubmission.mockResolvedValueOnce({...f.row}).mockResolvedValueOnce({...f.row,reviewer_comment:'changed'}); expect((await f.handler(request())).status).toBe(403); expect(f.deliver).not.toHaveBeenCalled(); });
  it('HN13 denies permission revocation between ordinary reads', async () => { const f=fixture(); f.client.canReview.mockResolvedValueOnce(true).mockResolvedValueOnce(false); expect((await f.handler(request())).status).toBe(403); expect(f.deliver).not.toHaveBeenCalled(); });
  it('HN14 denies a fresh lesson reparenting or unavailable scope', async () => { const f=fixture(); f.client.readScope.mockResolvedValueOnce({...f.scope}).mockResolvedValueOnce({...f.scope,course_id:id(10)}); expect((await f.handler(request())).status).toBe(403); expect(f.deliver).not.toHaveBeenCalled(); });
  it('HN15 only sends the exact stored student review after both ordinary checks', async () => { const f=fixture(); const r=await f.handler(request()); expect(r.status).toBe(200); expect(await r.json()).toEqual({success:true,emailSent:false}); expect(f.ordinary).toHaveBeenCalledExactlyOnceWith('unit-ordinary-token'); expect(f.client.currentUser).toHaveBeenCalledTimes(2); expect(f.client.canReview).toHaveBeenCalledTimes(2); expect(f.deliver).toHaveBeenCalledExactlyOnceWith({review:f.row,courseTitle:'TEST course',lessonTitle:'TEST lesson'}); });
  it('HN16 handles ordinary lookup failure without reaching delivery', async () => { const f=fixture(); f.client.readSubmission.mockRejectedValue(new Error('private internal failure')); const r=await f.handler(request()); expect(r.status).toBe(403); expect(await r.text()).not.toContain('private internal'); expect(f.deliver).not.toHaveBeenCalled(); });
  it('HN17 bounds actual request bytes before JSON parsing or client access', async () => { const f=fixture(); expect((await f.handler(request({submission_id:submission,padding:'x'.repeat(3000)}))).status).toBe(400); expect(f.ordinary).not.toHaveBeenCalled(); expect(f.deliver).not.toHaveBeenCalled(); });
  it('HN18 permits preflight without authentication or delivery', async () => { const f=fixture(); expect((await f.handler(new Request('https://unit.invalid/notify-homework-graded',{method:'OPTIONS'}))).status).toBe(200); expect(f.ordinary).not.toHaveBeenCalled(); expect(f.deliver).not.toHaveBeenCalled(); });
  it('HN19 denies a recipient profile from another organization', async () => { const f=fixture(); f.client.readScope.mockResolvedValue({...f.scope,student_organization_id:id(11)}); expect((await f.handler(request())).status).toBe(403); expect(f.deliver).not.toHaveBeenCalled(); });
  it('HN20 denies a recipient without an active or completed enrollment', async () => { const f=fixture(); f.client.readScope.mockResolvedValue({...f.scope,enrollment_status:'cancelled'}); expect((await f.handler(request())).status).toBe(403); expect(f.deliver).not.toHaveBeenCalled(); });
  it('HN21 accepts an existing PostgreSQL UUID actor without imposing an RFC version or variant', async () => { const f=fixture(); const legacy='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'; f.client.currentUser.mockResolvedValue(legacy); f.client.readSubmission.mockResolvedValue({...f.row,reviewer_id:legacy}); expect((await f.handler(request())).status).toBe(200); expect(f.deliver).toHaveBeenCalledTimes(1); });
  it('HN22 keeps a string score invalid rather than coercing it to a number or null', async () => { const f=fixture(); f.client.readSubmission.mockResolvedValue({...f.row,score:'70'}); expect((await f.handler(request())).status).toBe(403); expect(f.deliver).not.toHaveBeenCalled(); });
  it('HN23 keeps a structured reviewer comment invalid rather than replacing it silently', async () => { const f=fixture(); f.client.readSubmission.mockResolvedValue({...f.row,reviewer_comment:{body:'not text'}}); expect((await f.handler(request())).status).toBe(403); expect(f.deliver).not.toHaveBeenCalled(); });
});
