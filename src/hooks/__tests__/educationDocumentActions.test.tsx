import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ReactNode } from "react";
import { useEducationDocumentsJournal } from "../useEducationDocumentsJournal";
import { useFRDOManager } from "../useFRDOManager";

const mocks = vi.hoisted(() => ({ allowed: false, rpc: vi.fn(), mutate: vi.fn(), issue: vi.fn() }));
vi.mock("@/hooks/useDocumentActionPermissions", () => ({ useDocumentActionPermissions: () => ({ canIssue: mocks.allowed }) }));
vi.mock("@/lib/education-docs/issueBatch", () => ({ issueEducationDocumentsByCourse: mocks.issue, issuedRowKey: () => "key" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: mocks.rpc,
  from: (table: string) => {
    const data = table === "organizations" ? { name: "Org", branding: {} } : table === "courses"
      ? [{ id: "course", title: "Курс", frdo_program_type: "qualification_upgrade" }] : table === "enrollments"
        ? [{ id: "enrollment", user_id: "user", course_id: "course", completed_at: "2026-10-01" }] : [];
    const chain: any = new Proxy({}, { get: (_, key) => key === "then"
      ? (resolve: any) => Promise.resolve({ data, error: null }).then(resolve)
      : (...args: any[]) => { if (["insert", "update", "delete"].includes(String(key))) mocks.mutate(table, key, ...args); return chain; } });
    return chain;
  },
} }));
function setup(group = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useEducationDocumentsJournal({ organizationId: "org", groupContext: group
    ? { groupId: "group", courseId: "course", memberUserIds: ["user"], status: "ready" } : null }), { wrapper });
}
describe("education issuance actions", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.allowed = false; mocks.rpc.mockResolvedValue({ data: 9, error: null }); mocks.issue.mockResolvedValue([]); });
  it("write-only/read-only staff cannot invoke number allocation or journal mutations even via handlers", async () => {
    const { result } = setup(); await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      result.current.setFormData({ ...result.current.formData, full_name: "Ученик", reg_number: "1", document_number: "2", specialty_name: "Курс" });
      result.current.setDeletingRecord({ id: "record" } as any);
    });
    await act(async () => {
      result.current.handleOpenAdd(); result.current.handleOpenEdit({ id: "record" } as any);
      await result.current.handleOpenSelectStudents(); await result.current.handleOpenEnrollment("enrollment");
      await result.current.generateRegNumber(); await result.current.handleSave(); await result.current.handleDelete();
      await result.current.handleAutoAddAllGraduates(); await result.current.handleCreateFromStudents();
    });
    expect(result.current.showAddDialog).toBe(false); expect(result.current.showSelectStudentsDialog).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.mutate).not.toHaveBeenCalled(); expect(mocks.issue).not.toHaveBeenCalled();
  });
  it("an authorized issuer reserves a number with the exact group context", async () => {
    mocks.allowed = true;
    const { result } = setup(true); await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.generateRegNumber(); });
    expect(mocks.rpc).toHaveBeenCalledWith("reserve_education_registration_number", expect.objectContaining({ p_org: "org", p_group: "group", p_doc_type: "certificate" }));
  });
  it("authorized graduate issuance remains available and includes the group", async () => {
    mocks.allowed = true;
    const { result } = setup(true); await waitFor(() => expect(result.current.completedStudents).toHaveLength(1));
    await act(async () => { await result.current.handleAutoAddAllGraduates(); });
    expect(mocks.issue).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org", groupId: "group", items: [expect.objectContaining({ enrollment_id: "enrollment", user_id: "user" })] }));
  });
  it("revocation before submit cancels pending form and graduate actions", async () => {
    mocks.allowed = true;
    const { result, rerender } = setup(); await waitFor(() => expect(result.current.completedStudents).toHaveLength(1));
    act(() => { result.current.handleOpenAdd(); });
    mocks.allowed = false; rerender();
    await act(async () => { await result.current.handleSave(); await result.current.handleAutoAddAllGraduates(); });
    expect(mocks.issue).not.toHaveBeenCalled(); expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("FRDO bulk export cannot create issuance rows without issue permission", async () => {
    const { result } = renderHook(() => useFRDOManager("org"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await result.current.handleBulkExport("dpo"); await result.current.handleBulkExport("po"); });
    expect(result.current.canIssue).toBe(false); expect(mocks.issue).not.toHaveBeenCalled();
  });
});
