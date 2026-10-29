export interface OrdinaryHomeworkNotifier {
  currentUser(): Promise<string | null>;
  readSubmission(id: string): Promise<unknown>;
  readScope(lessonId: string, courseId: string, studentId: string): Promise<unknown>;
  canReview(courseId: string): Promise<boolean>;
}
export interface VerifiedHomeworkReview {
  id: string; student_id: string; lesson_id: string; course_id: string; organization_id: string;
  status: 'approved' | 'revision' | 'rejected'; score: number | null; reviewer_id: string;
  reviewer_comment: string | null; reviewed_at: string;
}
export interface VerifiedHomeworkDelivery { review: VerifiedHomeworkReview; courseTitle: string; lessonTitle: string; }
export interface HomeworkNotifierDependencies {
  ordinary(bearer: string): OrdinaryHomeworkNotifier;
  deliver(context: VerifiedHomeworkDelivery): Promise<{ emailSent: boolean }>;
}
export const homeworkCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const response = (status: number, error?: string, emailSent?: boolean) => new Response(
  JSON.stringify(error ? { error } : { success: true, emailSent: emailSent === true }),
  { status, headers: { ...homeworkCors, 'Content-Type': 'application/json' } },
);
function reviewedRow(raw: unknown, id: string, actor: string): VerifiedHomeworkReview | null {
  if (!record(raw) || raw.id !== id || raw.reviewer_id !== actor || raw.student_id === actor) return null;
  const ids = ['id', 'student_id', 'lesson_id', 'course_id', 'organization_id', 'reviewer_id'] as const;
  if (ids.some(k => typeof raw[k] !== 'string' || !uuid.test(raw[k]))) return null;
  if (raw.status !== 'approved' && raw.status !== 'revision' && raw.status !== 'rejected') return null;
  if (raw.score !== null && (typeof raw.score !== 'number' || !Number.isInteger(raw.score) || raw.score < 0 || raw.score > 100)) return null;
  if (raw.reviewer_comment !== null && typeof raw.reviewer_comment !== 'string') return null;
  if (typeof raw.reviewed_at !== 'string' || !Number.isFinite(Date.parse(raw.reviewed_at))) return null;
  return { id, student_id: String(raw.student_id), lesson_id: String(raw.lesson_id), course_id: String(raw.course_id),
    organization_id: String(raw.organization_id), status: raw.status, score: typeof raw.score === 'number' ? raw.score : null, reviewer_id: actor,
    reviewer_comment: typeof raw.reviewer_comment === 'string' ? raw.reviewer_comment : null, reviewed_at: raw.reviewed_at };
}
function exactScope(raw: unknown, review: VerifiedHomeworkReview): { courseTitle: string; lessonTitle: string } | null {
  if (!record(raw) || raw.lesson_id !== review.lesson_id || raw.course_id !== review.course_id
    || raw.organization_id !== review.organization_id || raw.student_id !== review.student_id
    || raw.student_organization_id !== review.organization_id || raw.enrollment_user_id !== review.student_id
    || raw.enrollment_course_id !== review.course_id || (raw.enrollment_status !== 'active' && raw.enrollment_status !== 'completed')
    || typeof raw.course_title !== 'string' || typeof raw.lesson_title !== 'string') return null;
  return { courseTitle: raw.course_title, lessonTitle: raw.lesson_title };
}
/** Ordinary bearer/RLS and exact current review are required before any service delivery. */
export function createHomeworkNotificationHandler(deps: HomeworkNotifierDependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: homeworkCors });
    if (req.method !== 'POST') return response(405, 'method_not_allowed');
    const header = req.headers.get('Authorization') ?? '';
    if (!/^Bearer [^\s]+$/i.test(header)) return response(401, 'authentication_required');
    let id: string;
    try {
      const reader = req.body?.getReader();
      if (!reader) return response(400, 'invalid_request');
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          bytes += next.value.byteLength;
          if (bytes > 2048) { await reader.cancel(); return response(400, 'invalid_request'); }
          chunks.push(next.value);
        }
      } finally { reader.releaseLock(); }
      const joined = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
      const text = new TextDecoder('utf-8', { fatal: true }).decode(joined);
      if (text.length > 2048) return response(400, 'invalid_request');
      const body: unknown = JSON.parse(text);
      if (!record(body) || Object.keys(body).length !== 1 || typeof body.submission_id !== 'string' || !uuid.test(body.submission_id)) return response(400, 'invalid_request');
      id = body.submission_id;
    } catch { return response(400, 'invalid_request'); }
    const bearer = header.slice(7);
    let ordinary: OrdinaryHomeworkNotifier;
    let actor: string | null;
    try { ordinary = deps.ordinary(bearer); actor = await ordinary.currentUser(); } catch { return response(401, 'authentication_required'); }
    if (!actor || !uuid.test(actor)) return response(401, 'authentication_required');
    let verified: VerifiedHomeworkDelivery;
    try {
      const review = reviewedRow(await ordinary.readSubmission(id), id, actor);
      if (!review || !await ordinary.canReview(review.course_id)) return response(403, 'review_not_authorized');
      const scope = exactScope(await ordinary.readScope(review.lesson_id, review.course_id, review.student_id), review);
      if (!scope) return response(403, 'review_not_authorized');
      // Never deliver from a cached first SELECT or a replaced ordinary actor/review.
      if (await ordinary.currentUser() !== actor) return response(403, 'review_not_authorized');
      const current = reviewedRow(await ordinary.readSubmission(id), id, actor);
      if (!current || JSON.stringify(current) !== JSON.stringify(review) || !await ordinary.canReview(review.course_id)) return response(403, 'review_not_authorized');
      const currentScope = exactScope(await ordinary.readScope(review.lesson_id, review.course_id, review.student_id), current);
      if (!currentScope || currentScope.courseTitle !== scope.courseTitle || currentScope.lessonTitle !== scope.lessonTitle) return response(403, 'review_not_authorized');
      verified = { review: current, ...currentScope };
    } catch { return response(403, 'review_not_authorized'); }
    try { const delivered = await deps.deliver(verified); return response(200, undefined, delivered.emailSent); }
    catch { return response(500, 'notification_delivery_failed'); }
  };
}
