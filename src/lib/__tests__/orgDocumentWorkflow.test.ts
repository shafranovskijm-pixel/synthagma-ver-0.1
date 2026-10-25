import { describe, expect, it } from "vitest";
import { acceptedContentChange, canApproveWorkflow, normalizeWorkflowLinks, parseWorkflowEnvelope, sanitizeWorkflowHtml, validApprovalDate } from '../orgDocumentWorkflow.ts';
import { ids, workflow, workflowComment, workflowEnvelope, workflowId } from "./orgDocumentWorkflow.fixture";
describe("exact-version internal review model", () => {
  it("never inherits approval from a historical version", () => {
    const data = workflowEnvelope(null); data.cycles = [workflow({ version_id: workflowId(30), state: "approved", approval: { number: "17", date: "2026-10-17", recorded_at: "2026-10-18T00:00:00Z", recorded_by: ids.reviewer } })];
    expect(parseWorkflowEnvelope(data, ids.doc, ids.org).workflow).toBeNull(); expect(canApproveWorkflow(data)).toBe(false);
  });
  it.each(["organization", "document", "version", "revision"])("rejects mismatched %s metadata", kind => {
    const data = workflowEnvelope();
    if (kind === "organization") data.workflow!.organization_id = workflowId(40);
    if (kind === "document") data.document.id = workflowId(40);
    if (kind === "version") data.workflow!.version_id = workflowId(40);
    if (kind === "revision") data.revision = 12;
    expect(() => parseWorkflowEnvelope(data, ids.doc, ids.org)).toThrow();
  });
  it.each(["insert", "delete", "replace"])("accepted %s requires a new file even when all comments are resolved", kind => {
    const comment = workflowComment({ resolved: true, resolution_status: "accepted", position_anchor: { kind, replacement: "Текст" } });
    const data = workflowEnvelope(workflow({ state: "in_review", comments: [comment] }));
    expect(acceptedContentChange(comment)).toBe(true); expect(canApproveWorkflow(data)).toBe(false);
  });
  it("resolved general comments permit internal approval; unresolved comments and inactive file do not", () => {
    const data = workflowEnvelope(workflow({ state: "in_review", comments: [workflowComment({ resolved: true, resolution_status: "accepted", position_anchor: { kind: "comment" } })] }));
    expect(canApproveWorkflow(data)).toBe(true);
    data.workflow!.comments[0].resolved = false; expect(canApproveWorkflow(data)).toBe(false);
    data.workflow!.comments = [];
    for (const state of ["archived", "deleted", "fileless", "expired", "unconfirmed"] as const) { data.document.file_state = state; expect(canApproveWorkflow(data)).toBe(false); }
  });
  it("sanitizes derived HTML without active content, external resources or attributes", () => {
    const html = sanitizeWorkflowHtml('<script>bad()</script><iframe src="https://evil.test"></iframe><img src="https://evil.test/pixel"><a href="javascript:bad()">Ссылка</a><p style="background:url(https://evil.test)" onclick="bad()">Текст</p><table><tr><td colspan="2">Ячейка</td></tr></table>');
    expect(html).not.toMatch(/script|iframe|img|href|style|onclick|evil/); expect(html).toContain("Текст"); expect(html).toContain('colspan="2"');
  });
  it("deduplicates explicit relations without inventing programme or case objects", () => {
    const link = { kind: "document" as const, id: workflowId(12), version_id: workflowId(13) };
    expect(normalizeWorkflowLinks([link, link])).toEqual([link]);
    expect(() => normalizeWorkflowLinks([{ ...link, kind: "case" } as any])).toThrow();
  });
  it("validates calendar input without inventing a legal date or forbidding a supplied reporting date", () => {
    expect(validApprovalDate("2026-02-31")).toBe(false); expect(validApprovalDate("")).toBe(false);
    expect(validApprovalDate("2024-02-29")).toBe(true); expect(validApprovalDate("2027-01-01")).toBe(true);
  });
});
