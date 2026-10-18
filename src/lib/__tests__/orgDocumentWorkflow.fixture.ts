import type { OrgDocumentWorkflow, WorkflowEnvelope, WorkflowCandidates, WorkflowComment } from "../orgDocumentWorkflow";
export const workflowId = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const ids = { org: workflowId(1), doc: workflowId(2), version: workflowId(3), responsible: workflowId(4), reviewer: workflowId(5), review: workflowId(6) };
export function workflowComment(overrides: Partial<WorkflowComment> = {}): WorkflowComment {
  return { id: workflowId(8), author_user_id: ids.reviewer, author_name: "Проверяющий", author_role: "staff", quoted_text: null,
    comment_text: "Проверьте формулировку", position_anchor: null, resolved: false, resolution_status: "unresolved", org_reply: null, created_at: "2026-10-18T10:00:00Z", ...overrides };
}
export function workflow(overrides: Partial<OrgDocumentWorkflow> = {}): OrgDocumentWorkflow {
  return { id: ids.review, organization_id: ids.org, document_id: ids.doc, version_id: ids.version, revision: 1, state: "draft",
    responsible_user_id: ids.responsible, reviewer_user_id: ids.reviewer, responsible_name: "Владелец центра", reviewer_name: "Проверяющий", links: [], approval: null, requires_new_version: false, comments: [], events: [], ...overrides };
}
export function workflowEnvelope(w: OrgDocumentWorkflow | null = workflow()): WorkflowEnvelope {
  return { document: { id: ids.doc, organization_id: ids.org, document_revision: 2, current_version_id: ids.version,
    file_state: "active", file_url: `${ids.org}/versions/${ids.doc}/file.pdf`, file_path: null, file_name: "Положение.pdf" },
    workflow: w, cycles: [], revision: w?.revision ?? 0,
    capabilities: { can_configure: true, can_submit: true, can_comment: true, can_request_changes: true, can_decide: true, can_cancel: true } };
}
export function workflowCandidates(): WorkflowCandidates {
  return { actors: [{ user_id: ids.responsible, staff_id: null, display_name: "Владелец центра", kind: "owner" },
    { user_id: ids.reviewer, staff_id: workflowId(7), display_name: "Проверяющий", kind: "staff" }],
    courses: [{ id: workflowId(10), title: "Обучение" }], groups: [{ id: workflowId(11), name: "Первая группа", course_id: workflowId(10) }],
    related_documents: [{ id: workflowId(12), name: "Основание", current_version_id: workflowId(13) }] };
}
