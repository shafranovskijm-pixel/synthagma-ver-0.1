import type { GroupScheduleFactRow } from "./groupScheduleFacts.ts";

export const GROUP_SCHEDULE_FACTS_SELECT = "group_id, organization_id, course_id, slots, revision, updated_by, updated_at";

export interface GroupScheduleFactsReader {
  /** Caller JWT/RLS, exact organization_id + group_id, maybeSingle(); no service-role fallback. */
  schedule(request: { organizationId: string; groupId: string }): PromiseLike<{
    data: GroupScheduleFactRow | null; error: unknown;
  }>;
}

export interface GroupScheduleSourceIssue {
  source: "group_document_schedules";
  code: "read_failed" | "scope_mismatch" | "malformed_response";
  message: string;
  severity: "warning";
}

/** An unavailable optional source does not fail unrelated documents or return stale partial facts. */
export async function loadGroupScheduleFacts(
  input: { organizationId: string; groupId: string }, reader: GroupScheduleFactsReader,
): Promise<{ schedule: GroupScheduleFactRow | null; sourceIssues: GroupScheduleSourceIssue[] }> {
  const failed = (code: GroupScheduleSourceIssue["code"]) => ({
    schedule: null,
    sourceIssues: [{
      source: "group_document_schedules" as const, code, severity: "warning" as const,
      message: "Не удалось подтвердить сохранённое расписание этой группы. Оно не использовано; оставлен рабочий бланк. Повторите проверку расписания.",
    }],
  });
  if (!input.organizationId || !input.groupId) return failed("scope_mismatch");
  try {
    const response = await reader.schedule({ organizationId: input.organizationId, groupId: input.groupId });
    if (!response || response.error) return failed("read_failed");
    if (response.data === null) return { schedule: null, sourceIssues: [] };
    if (!response.data || typeof response.data !== "object" || Array.isArray(response.data)) return failed("malformed_response");
    if (response.data.organization_id !== input.organizationId || response.data.group_id !== input.groupId) return failed("scope_mismatch");
    return { schedule: response.data, sourceIssues: [] };
  } catch {
    return failed("read_failed");
  }
}
