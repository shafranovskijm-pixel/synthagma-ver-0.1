import { supabase } from "@/integrations/supabase/client";
import { captureCustomJournalScope, customJournalScopeCurrent, type CustomJournalScope } from "@/lib/customJournals/client";
import { retainedLearningSummaryQuerySchema, retainedLearningSummarySchema, type RetainedLearningSummary } from "./contract";
import { LearningOutcomeError, normalizeLearningOutcomeError } from "@/lib/learningOutcomes/client";

export type OwnRetainedScope = CustomJournalScope;
export function captureOwnRetainedScope(organizationId: string, effectiveUserId: string, current?: () => boolean): OwnRetainedScope {
  const scope = captureCustomJournalScope(organizationId, current);
  if (scope.actorId !== effectiveUserId) throw new LearningOutcomeError("ACCESS_DENIED");
  return scope;
}
async function bearer(scope: OwnRetainedScope) {
  if (!customJournalScopeCurrent(scope)) throw new LearningOutcomeError("ACCESS_DENIED");
  const { data, error } = await supabase.auth.getSession();
  if (!customJournalScopeCurrent(scope) || error || data.session?.user.id !== scope.actorId || !data.session.access_token)
    throw new LearningOutcomeError("ACCESS_DENIED");
  return "Bearer " + data.session.access_token;
}
export async function readOwnRetainedLearningSummary(scope: OwnRetainedScope, enrollmentId: string, courseId: string, afterDecisionId: string | null = null): Promise<RetainedLearningSummary> {
  const query = retainedLearningSummaryQuerySchema.parse({ kind: "retained_summary", enrollment_id: enrollmentId, after_decision_id: afterDecisionId, limit: 50 });
  const authorization = await bearer(scope);
  const response = await supabase.rpc("read_learning_outcome" as never, { p_organization_id: scope.organizationId, p_query: query } as never)
    .setHeader("Authorization", authorization);
  if (!customJournalScopeCurrent(scope)) throw new LearningOutcomeError("ACCESS_DENIED");
  if (response.error) throw normalizeLearningOutcomeError(response.error);
  const parsed = retainedLearningSummarySchema.safeParse(response.data);
  if (!parsed.success) throw new LearningOutcomeError();
  const value = parsed.data as RetainedLearningSummary;
  if (value.organization_id !== scope.organizationId || value.user_id !== scope.actorId || value.enrollment_id !== enrollmentId || value.course_id !== courseId)
    throw new LearningOutcomeError();
  let previous = afterDecisionId;
  for (const row of value.decisions) {
    if (previous !== null && row.id <= previous) throw new LearningOutcomeError();
    previous = row.id;
  }
  if (value.next_after_decision_id !== null && (!value.decisions.length || value.next_after_decision_id !== previous))
    throw new LearningOutcomeError();
  return value;
}
export async function readOwnAssignmentIds(scope: OwnRetainedScope, afterId: string | null = null) {
  const authorization = await bearer(scope);
  let request = supabase.from("enrollments").select("id, course_id").eq("user_id", scope.actorId).order("id").limit(100);
  if (afterId) request = request.gt("id", afterId);
  const { data, error } = await request.setHeader("Authorization", authorization);
  if (!customJournalScopeCurrent(scope)) throw new LearningOutcomeError("ACCESS_DENIED");
  if (error) throw normalizeLearningOutcomeError(error);
  let previous = afterId;
  for (const row of data ?? []) {
    if (!retainedLearningSummaryQuerySchema.shape.enrollment_id.safeParse(row.id).success ||
        !retainedLearningSummaryQuerySchema.shape.enrollment_id.safeParse(row.course_id).success ||
        previous !== null && row.id <= previous) throw new LearningOutcomeError();
    previous = row.id;
  }
  return { items: data ?? [], next: data?.length === 100 ? previous : null };
}
