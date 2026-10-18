import { z } from "zod";
import DOMPurify from "dompurify";

const id = z.string().uuid();
const revision = z.number().int().nonnegative();
export const workflowStates = ["draft", "in_review", "changes_requested", "approved", "cancelled"] as const;
export const workflowLabels: Record<typeof workflowStates[number], string> = {
  draft: "Черновик", in_review: "На проверке", changes_requested: "Нужны изменения", approved: "Утверждено внутри центра", cancelled: "Согласование отменено",
};
export const workflowLinkSchema = z.object({
  kind: z.enum(["course", "group", "document"]),
  id, version_id: id.nullable(),
});
export type WorkflowLink = z.infer<typeof workflowLinkSchema>;
const commentSchema = z.object({
  id, author_user_id: id, author_name: z.string(), author_role: z.string(),
  quoted_text: z.string().nullable(), comment_text: z.string(), position_anchor: z.unknown().nullable(),
  resolved: z.boolean(), resolution_status: z.enum(["unresolved", "accepted", "declined"]),
  org_reply: z.string().nullable(), created_at: z.string(),
});
export type WorkflowComment = z.infer<typeof commentSchema>;
const approvalSchema = z.object({ number: z.string().min(1), date: z.string(), recorded_at: z.string(), recorded_by: id });
export const workflowSchema = z.object({
  id, organization_id: id, document_id: id, version_id: id, revision,
  state: z.enum(workflowStates), responsible_user_id: id, reviewer_user_id: id,
  responsible_name: z.string(), reviewer_name: z.string(),
  links: z.array(workflowLinkSchema), approval: approvalSchema.nullable(), requires_new_version: z.boolean(),
  comments: z.array(commentSchema), events: z.array(z.object({ id, action: z.string(), actor_id: id, created_at: z.string(), note: z.string().nullable() })),
});
export type OrgDocumentWorkflow = z.infer<typeof workflowSchema>;
export const workflowEnvelopeSchema = z.object({
  document: z.object({ id, organization_id: id, document_revision: revision, current_version_id: id.nullable(),
    file_state: z.enum(["none", "fileless", "active", "expiring", "expired", "archived", "deleted", "unconfirmed"]),
    file_url: z.string().nullable(), file_path: z.string().nullable(), file_name: z.string().nullable() }),
  workflow: workflowSchema.nullable(), cycles: z.array(workflowSchema), revision,
  capabilities: z.object({ can_configure: z.boolean(), can_submit: z.boolean(), can_comment: z.boolean(),
    can_request_changes: z.boolean(), can_decide: z.boolean(), can_cancel: z.boolean() }),
});
export type WorkflowEnvelope = z.infer<typeof workflowEnvelopeSchema>;
const option = z.object({ id, name: z.string() });
export const workflowCandidatesSchema = z.object({
  actors: z.array(z.object({ user_id: id, staff_id: id.nullable(), display_name: z.string(), kind: z.enum(["owner", "staff"]) })),
  courses: z.array(z.object({ id, title: z.string() })), groups: z.array(option.extend({ course_id: id.nullable() })),
  related_documents: z.array(option.extend({ current_version_id: id.nullable() })),
});
export type WorkflowCandidates = z.infer<typeof workflowCandidatesSchema>;
export function parseWorkflowEnvelope(value: unknown, documentId: string, organizationId: string): WorkflowEnvelope {
  const result = workflowEnvelopeSchema.parse(value);
  if (result.document.id !== documentId || result.document.organization_id !== organizationId
    || result.revision !== (result.workflow?.revision ?? 0)
    || result.workflow && result.workflow.version_id !== result.document.current_version_id
    || [result.workflow, ...result.cycles].some(w => w && (w.document_id !== documentId || w.organization_id !== organizationId))) {
    throw new Error("Не удалось подтвердить версию и доступ к документу");
  }
  return result;
}
export function acceptedContentChange(comment: WorkflowComment): boolean {
  const kind = (comment.position_anchor as { kind?: string } | null)?.kind;
  return comment.resolution_status === "accepted" && ["insert", "delete", "replace"].includes(kind ?? "");
}
export function validApprovalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function canApproveWorkflow(value: WorkflowEnvelope): boolean {
  const w = value.workflow;
  return value.capabilities.can_decide && !!w && w.state === "in_review"
    && w.version_id === value.document.current_version_id && ["active", "expiring"].includes(value.document.file_state)
    && !w.requires_new_version && w.comments.every(c => c.resolved && !acceptedContentChange(c));
}
export function normalizeWorkflowLinks(links: WorkflowLink[]): WorkflowLink[] {
  return [...new Map(links.map(link => {
    const parsed = workflowLinkSchema.parse(link);
    return [`${parsed.kind}:${parsed.id}`, parsed] as const;
  })).values()].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
}
/** Derived display only. No scripts, active links, remote images or style URLs. */
export function sanitizeWorkflowHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["div", "p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "i", "u", "s", "span", "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "blockquote", "sup", "sub", "hr"],
    ALLOWED_ATTR: ["colspan", "rowspan", "scope", "lang", "dir"],
    ALLOW_DATA_ATTR: false,
  });
}
