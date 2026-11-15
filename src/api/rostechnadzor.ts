import { supabase } from "@/integrations/supabase/client";
import type { RtnAnswers, RtnAssignment, RtnAssignmentDetail, RtnAttempt, RtnAttemptDraft, RtnCheckResult, RtnMaterial, RtnSettings, RtnStudentWorkspace, RtnSubmission, RtnWorkspace } from "@/types/rostechnadzor";

type RtnErrorCode = "forbidden" | "quota" | "conflict" | "network" | "invalid_response" | "unknown";

export class RtnApiError extends Error {
  constructor(readonly code: RtnErrorCode, message: string) {
    super(message);
    this.name = "RtnApiError";
  }
}

function apiError(error: unknown): RtnApiError {
  if (error instanceof RtnApiError) return error;
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = String(record.message || "");
  const context = record.context && typeof record.context === "object" ? record.context as Record<string, unknown> : {};
  const status = record.status || context.status;
  if (message === "rtn_normative_review_required") {
    return new RtnApiError("unknown", "Для этой редакции нужна повторная нормативная проверка. Начатые попытки и прежние результаты сохранены; новые попытки откроются после выпуска проверенной редакции.");
  }
  if (record.code === "40001" && message === "rtn_draft_revision_conflict") {
    return new RtnApiError("conflict", "Ответы этой попытки изменились на другом устройстве. Загрузите сохранённую версию перед продолжением.");
  }
  if (record.code === "42501" || status === 401 || status === 403) {
    return new RtnApiError("forbidden", "Нет прав для этого действия. Обновите доступ организации или обратитесь к её администратору.");
  }
  if (record.code === 'P0001' && record.details === 'STUDENT_ASSIGNMENT_LIMIT_EXCEEDED') {
    return new RtnApiError('quota', 'Достигнут месячный лимит учеников с назначенными курсами. Личные дела можно создавать и хранить без ограничений. Обратитесь к администратору организации.');
  }
  if (record.code === 'P0001' && record.details === 'TRAINING_COMPLETION_LIMIT_EXCEEDED') {
    return new RtnApiError('quota', 'Достигнут месячный лимит завершённых обучений. Ответы остаются в этом окне; обратитесь к администратору организации.');
  }
  if (/fetch|network|timeout|connection/i.test(message) || error instanceof TypeError) {
    return new RtnApiError("network", "Не удалось связаться с сервером. Проверьте соединение и повторите попытку.");
  }
  return new RtnApiError("unknown", "Сервер не выполнил запрос. Повторите попытку; если ошибка сохранится, обратитесь в поддержку.");
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidResponse(): never {
  throw new RtnApiError("invalid_response", "Сервер вернул неполные данные. Обновите раздел, чтобы проверить доступ и состояние программ.");
}

// New RPCs are kept behind this boundary until generated Database types include them.
// Tenant and permission checks always remain on the server; this cast grants no access.
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string, args: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;

async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    const { data, error } = await rpc(name, args);
    if (error) throw error;
    return data;
  } catch (error) { throw apiError(error); }
}

function settings(value: unknown): RtnSettings {
  if (!record(value) || typeof value.notify_updates !== "boolean" || typeof value.show_archived_releases !== "boolean") invalidResponse();
  return value as unknown as RtnSettings;
}

export async function getRtnWorkspace(organizationId: string): Promise<RtnWorkspace> {
  const data = await call("get_rtn_workspace", { p_organization_id: organizationId });
  if (!record(data) || !record(data.access) || typeof data.access.allowed !== "boolean"
    || typeof data.access.can_manage !== "boolean" || typeof data.access.pilot !== "boolean"
    || typeof data.access.can_assign !== "boolean" || typeof data.access.can_view_results !== "boolean"
    || !["banks", "checks", "assignments", "results", "students", "groups"].every(key => Array.isArray(data[key]))) invalidResponse();
  settings(data.settings);
  const banks = data.banks as unknown[];
  if (!banks.every(bank => record(bank) && typeof bank.id === "string" && typeof bank.title === "string"
    && typeof bank.code === "string" && typeof bank.domain === "string"
    && typeof bank.source_id === "string" && typeof bank.available_for_training === "boolean"
    && ["current", "review_required"].includes(String(bank.normative_status))
    && (bank.normative_cutoff_at === null || typeof bank.normative_cutoff_at === "string")
    && typeof bank.can_manual_check === "boolean" && ["unreviewed", "reviewed", "released"].includes(String(bank.key_status)))) invalidResponse();
  if (!(data.students as unknown[]).every(student => record(student) && ["id", "user_id"].every(key => typeof student[key] === "string") && (typeof student.full_name === "string" || student.full_name === null))
    || !(data.groups as unknown[]).every(group => record(group) && typeof group.id === "string" && typeof group.name === "string")
    || !(data.checks as unknown[]).every(check => record(check) && typeof check.id === "string" && typeof check.source_id === "string" && typeof check.status === "string")
    || !(data.assignments as unknown[]).every(item => record(item) && typeof item.id === "string" && typeof item.student_id === "string" && typeof item.bank_id === "string")
    || !(data.results as unknown[]).every(item => record(item) && ["attempt_id", "student_id", "bank_id", "release_id"].every(key => typeof item[key] === "string"))) invalidResponse();
  const workspace = data as unknown as RtnWorkspace;
  if (data.archived_releases !== undefined && (!Array.isArray(data.archived_releases)
    || !data.archived_releases.every(item => record(item) && typeof item.bank_id === "string" && typeof item.release_id === "string"
      && ["current", "archived", "scheduled"].includes(String(item.state))))) invalidResponse();
  return { ...workspace, students: workspace.students.map(student => ({ ...student, full_name: student.full_name?.trim() || "Ученик без ФИО" })) };
}

export async function saveRtnSettings(organizationId: string, value: RtnSettings): Promise<RtnSettings> {
  return settings(await call("save_rtn_settings", {
    p_organization_id: organizationId,
    p_notify_updates: value.notify_updates,
    p_show_archived_releases: value.show_archived_releases,
  }));
}

export async function checkRtnSource(organizationId: string, sourceId: string): Promise<RtnCheckResult> {
  try {
    // The Edge function queues the run itself: do not call request_rtn_source_check twice.
    const { data, error } = await supabase.functions.invoke("rtn-source-check", {
      body: { organizationId, sourceId },
    });
    if (error) throw error;
    if (!record(data) || typeof data.run_id !== "string"
      || !["queued", "running", "unchanged", "changed", "error", "success"].includes(String(data.status))) invalidResponse();
    return data as unknown as RtnCheckResult;
  } catch (error) { throw apiError(error); }
}

export async function assignRtnTraining(input: {
  organizationId: string; bankId: string; studentIds: string[]; groupId: string | null;
}): Promise<{ assignments: RtnAssignment[]; replayed: boolean }> {
  const data = await call("assign_rtn_training", {
    p_organization_id: input.organizationId,
    p_bank_id: input.bankId,
    p_student_ids: input.studentIds,
    p_group_id: input.groupId,
  });
  if (!record(data) || !Array.isArray(data.assignments) || typeof data.replayed !== "boolean") invalidResponse();
  return data as unknown as { assignments: RtnAssignment[]; replayed: boolean };
}

export async function getRtnStudentWorkspace(): Promise<RtnStudentWorkspace> {
  const data = await call("get_rtn_student_workspace", {});
  if (!record(data) || !record(data.access) || typeof data.access.allowed !== "boolean" || !Array.isArray(data.assignments)
    || !data.assignments.every(item => record(item) && ["id", "assignment_id", "organization_id", "bank_id", "code", "title", "status"].every(key => typeof item[key] === "string") && typeof item.access_allowed === "boolean"
      && typeof item.can_start === "boolean" && ["current", "review_required"].includes(String(item.normative_status))
      && (item.normative_cutoff_at === null || typeof item.normative_cutoff_at === "string"))) invalidResponse();
  return data as unknown as RtnStudentWorkspace;
}

function attempt(data: unknown): RtnAttempt {
  if (!record(data) || typeof data.attempt_id !== "string" || typeof data.release_id !== "string"
    || !["active", "submitted"].includes(String(data.status)) || !Array.isArray(data.questions) || !data.questions.length
    || !data.questions.every(question => record(question) && typeof question.id === "string" && typeof question.text === "string"
      && !Object.prototype.hasOwnProperty.call(question, "correct_option_ids") && Array.isArray(question.options) && question.options.length > 0
      && question.options.every(option => record(option) && typeof option.id === "string" && typeof option.text === "string" && !Object.prototype.hasOwnProperty.call(option, "is_correct")))) invalidResponse();
  if (data.status === "submitted") submission(data);
  if (data.materials !== undefined) materials(data.materials);
  if (data.feedback !== undefined && data.feedback !== null) {
    if (data.status !== "submitted" || !Array.isArray(data.feedback) || !data.feedback.every(item => record(item)
      && typeof item.id === "string" && Array.isArray(item.evidence)
      && item.evidence.every(ref => record(ref) && typeof ref.url === "string" && typeof ref.citation === "string"))) invalidResponse();
  }
  return data as unknown as RtnAttempt;
}

function materials(data: unknown): RtnMaterial[] {
  if (!Array.isArray(data) || !data.every(section => record(section) && ["id", "title", "body"].every(key => typeof section[key] === "string")
    && Array.isArray(section.source_refs) && section.source_refs.every(ref => record(ref) && typeof ref.url === "string" && typeof ref.citation === "string"))) invalidResponse();
  return data as RtnMaterial[];
}

export async function getRtnAssignment(assignmentId: string): Promise<RtnAssignmentDetail> {
  const data = await call("get_rtn_assignment", { p_assignment_id: assignmentId });
  if (!record(data) || !record(data.assignment) || typeof data.assignment.id !== "string"
    || typeof data.assignment.can_start !== "boolean" || !["current", "review_required"].includes(String(data.assignment.normative_status))
    || !record(data.release) || typeof data.release.id !== "string" || typeof data.release.question_count !== "number"
    || !record(data.source) || typeof data.source.page_url !== "string" || typeof data.source.document_url !== "string") invalidResponse();
  materials(data.materials);
  return data as unknown as RtnAssignmentDetail;
}

function submission(data: unknown): RtnSubmission {
  if (!record(data) || typeof data.attempt_id !== "string" || typeof data.release_id !== "string" || data.status !== "submitted"
    || typeof data.score !== "number" || !Number.isFinite(data.score) || data.score < 0 || data.score > 100
    || typeof data.correct !== "number" || typeof data.total !== "number" || typeof data.passed !== "boolean" || typeof data.submitted_at !== "string") invalidResponse();
  return data as unknown as RtnSubmission;
}

export async function startRtnAttempt(assignmentId: string): Promise<RtnAttempt> {
  return attempt(await call("start_rtn_attempt", { p_assignment_id: assignmentId }));
}

export async function getRtnAttempt(attemptId: string): Promise<RtnAttempt> {
  return attempt(await call("get_rtn_attempt", { p_attempt_id: attemptId }));
}

function draft(data: unknown, attemptId: string): RtnAttemptDraft {
  if (!record(data) || data.attempt_id !== attemptId || !["active", "submitted"].includes(String(data.status))
    || !Number.isSafeInteger(data.revision) || (data.revision as number) < 0 || !record(data.answers)
    || !(data.saved_at === null || typeof data.saved_at === "string")
    || !Object.values(data.answers).every(choices => Array.isArray(choices)
      && choices.every(choice => typeof choice === "string") && new Set(choices).size === choices.length)) invalidResponse();
  return data as unknown as RtnAttemptDraft;
}

export async function getRtnAttemptDraft(attemptId: string): Promise<RtnAttemptDraft> {
  return draft(await call("get_rtn_attempt_draft", { p_attempt_id: attemptId }), attemptId);
}

export async function saveRtnAttemptDraft(attemptId: string, answers: RtnAnswers, revision: number): Promise<RtnAttemptDraft> {
  return draft(await call("save_rtn_attempt_draft", {
    p_attempt_id: attemptId, p_answers: answers, p_expected_revision: revision,
  }), attemptId);
}

export async function hydrateRtnAttempt(loaded: RtnAttempt): Promise<RtnAttempt> {
  if (loaded.status === "submitted") return loaded;
  const saved = await getRtnAttemptDraft(loaded.attempt_id);
  // A different device may have submitted while the active snapshot was loading.
  if (saved.status === "submitted") return getRtnAttempt(loaded.attempt_id);
  for (const [id, choices] of Object.entries(saved.answers)) {
    const question = loaded.questions.find(item => item.id === id);
    if (!question || choices.some(choice => !question.options.some(option => option.id === choice))) invalidResponse();
  }
  return { ...loaded, answers: saved.answers, draft_revision: saved.revision };
}

export async function recordRtnMaterialOpen(assignmentId: string, releaseId: string): Promise<void> {
  const data = await call("record_rtn_material_open", { p_assignment_id: assignmentId, p_release_id: releaseId });
  if (!record(data) || typeof data.recorded !== "boolean" || data.extra_charge !== 0) invalidResponse();
}

export async function submitRtnAttempt(attemptId: string, answers: RtnAnswers): Promise<RtnSubmission> {
  return submission(await call("submit_rtn_attempt", { p_attempt_id: attemptId, p_answers: answers }));
}
