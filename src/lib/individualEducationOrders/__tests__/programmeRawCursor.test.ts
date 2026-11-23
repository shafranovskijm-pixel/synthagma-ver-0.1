import { beforeEach, describe, expect, it, vi } from 'vitest';
import { actor, choice, course, enrollment, envelope, org, pupil, uid } from './fixtures';
const m = vi.hoisted(() => ({ reply: null as any, rpc: vi.fn(), session: vi.fn() }));
vi.mock('@/utils/courseCache', () => ({ captureOfflineContext: () => ({ actorId: '00000000-0000-4000-8000-000000000002', revision: 1 }), isOfflineActorCurrent: () => true }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: (...args: any[]) => m.session(...args) }, rpc: (...args: any[]) => { m.rpc(...args); const result: any = { setHeader: () => result, then: (yes: any, no: any) => Promise.resolve({ data: m.reply, error: null }).then(yes, no) }; return result; } } }));
import { captureIndividualOrderScope, readIndividualEducationOrder } from '../client';
const scope = () => captureIndividualOrderScope(org, enrollment, { subjectUserId: pupil, courseId: course });
const query = (after: string) => ({ version: 1 as const, kind: 'programme_choices' as const, after_version_id: after, limit: 1 });
const reply = (choices: any[], next: string) => ({ ...envelope('programme_choices'), choices, next_after_version_id: next });
beforeEach(() => { vi.clearAllMocks(); m.session.mockResolvedValue({ data: { session: { user: { id: actor }, access_token: 'synthetic-cursor-actor' } }, error: null }); });
describe('W1 bounded raw-catalog cursor semantic closure', () => {
 it('accepts a skipped raw suffix and an empty valid page only with a forward raw cursor', async () => { m.reply = reply([choice()], uid(30)); const first = await readIndividualEducationOrder(scope(), query(uid(10))); expect(first.kind === 'programme_choices' && first.choices).toEqual([choice()]); expect(first.kind === 'programme_choices' && first.next_after_version_id).toBe(uid(30)); m.reply = reply([], uid(40)); const next = await readIndividualEducationOrder(scope(), query(uid(30))); expect(next).toMatchObject({ kind: 'programme_choices', choices: [], next_after_version_id: uid(40) }); expect(m.rpc.mock.calls[1][1].p_query).toEqual(query(uid(30))); });
 it('rejects stalled or backward empty-page cursors and a cursor behind the last valid choice', async () => { for (const next of [uid(30), uid(29)]) { m.reply = reply([], next); await expect(readIndividualEducationOrder(scope(), query(uid(30)))).rejects.toBeDefined(); } const row = choice(); row.id = uid(50); row.programme.version_id = uid(50); m.reply = reply([row], uid(40)); await expect(readIndividualEducationOrder(scope(), query(uid(10)))).rejects.toBeDefined(); });
});
