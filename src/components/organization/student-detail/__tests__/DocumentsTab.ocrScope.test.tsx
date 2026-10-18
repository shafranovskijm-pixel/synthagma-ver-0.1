import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), rpc: vi.fn(), error: vi.fn(), permissions: {} as any }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke }, rpc: mocks.rpc } }));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => mocks.permissions }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
vi.mock("@/components/organization/student-detail/StudentLaborSafetyXmlCard", () => ({ StudentLaborSafetyXmlCard: () => null }));
vi.mock("@/components/ui/alert-dialog", async () => {
  const { createContext, useContext } = await import("react");
  const CloseContext = createContext<() => void>(() => {});
  const Content = ({ children }: any) => <>{children}</>;
  // Radix Action/Cancel close by default unless the caller prevents default.
  const CloseButton = ({ children, onClick, ...props }: any) => {
    const close = useContext(CloseContext);
    return <button {...props} onClick={event => { onClick?.(event); if (!event.defaultPrevented) close(); }}>{children}</button>;
  };
  return { AlertDialog: ({ open, onOpenChange, children }: any) => open ? <CloseContext.Provider value={() => onOpenChange?.(false)}><div role="alertdialog">{children}</div></CloseContext.Provider> : null,
    AlertDialogAction: CloseButton, AlertDialogCancel: CloseButton, AlertDialogContent: Content, AlertDialogDescription: Content,
    AlertDialogFooter: Content, AlertDialogHeader: Content, AlertDialogTitle: Content };
});
import { DocumentsTab } from "../DocumentsTab";

const ids = { org: "11111111-1111-4111-8111-111111111111", student: "22222222-2222-4222-8222-222222222222",
  actor: "33333333-3333-4333-8333-333333333333", doc: "44444444-4444-4444-8444-444444444444",
  other: "55555555-5555-4555-8555-555555555555" };
function access(rights = ["documents.write", "students.write", "frdo.write"], extra: Record<string, unknown> = {}) {
  const orgPermissions = new Set(rights);
  return { loading: false, error: null, organizationId: ids.org, orgRole: "admin", adminRole: null, isOrgOwner: false,
    orgPermissions, can: (permission: string) => orgPermissions.has(permission), ...extra };
}
const source = (extra = {}) => ({ id: ids.doc, user_id: ids.student, organization_id: ids.org, type: "passport", name: "QA-паспорт.pdf",
  file_path: `${ids.student}/passport_1.pdf`, file_url: `${ids.student}/passport_1.pdf`, updated_at: "2026-10-19T00:00:00Z", created_at: "2026-10-19T00:00:00Z", ...extra });
function data(extra = {}) {
  return { isLoading: false, dataLoadError: null, identityDocs: [source()],
    frdoData: { user_id: ids.student, organization_id: ids.org, last_name: "QA", first_name: "Тест", birth_date: null, snils: null },
    savingFrdoField: null, saveFrdoField: vi.fn().mockResolvedValue(true), fileInputRef: { current: null },
    handleUploadClick: vi.fn(), handleFileChange: vi.fn(), handlePreviewDoc: vi.fn(), handleDeleteIdentityDoc: vi.fn(), formatDate: () => "19.10.2026", ...extra };
}
const normalized = (extra = {}) => ({ documentId: ids.doc, doc_type: "passport", snils: null, birth_date: "1990-01-01",
  passport_series: "12 34", passport_number: "123456", passport_issue_date: "2010-01-01", passport_issued_by: "QA synthetic issuer",
  passport_department_code: "123-456", confidence: 0.9, ...extra });
const panel = (h: any, extra = {}) => <DocumentsTab h={h} orgPlan="professional" organizationId={ids.org} studentUserId={ids.student} actorUserId={ids.actor} {...extra} />;
const recognize = () => fireEvent.click(screen.getByRole("button", { name: "Распознать QA-паспорт.pdf" }));
async function recognized() { recognize(); await screen.findByRole("alertdialog"); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

describe("organizational OCR exact source and current authority", () => {
  beforeEach(() => {
    mocks.permissions = access(); mocks.invoke.mockReset().mockResolvedValue({ data: normalized(), error: null });
    mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null }); mocks.error.mockClear();
  });
  it("sends only exact source identity/context assertions and waits for explicit apply", async () => {
    const h = data(); render(panel(h)); await recognized();
    expect(mocks.invoke).toHaveBeenCalledWith("ocr-snils", { body: { documentId: ids.doc, organizationId: ids.org, studentUserId: ids.student, doc_type: "passport" } });
    expect(h.saveFrdoField).not.toHaveBeenCalled(); expect(screen.getByText("123456")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Применить все" })).toBeEnabled());
    fireEvent.click(screen.getAllByRole("button", { name: "Применить" })[0]);
    await waitFor(() => expect(h.saveFrdoField).toHaveBeenCalledWith("birth_date", "1990-01-01"));
    expect(h.saveFrdoField).toHaveBeenCalledTimes(1);
  });
  it.each([{ rights: ["students.write"] }, { rights: ["documents.write"] }, { rights: [] }])("does not process with incomplete organizational processing rights $rights", ({ rights }) => {
    mocks.permissions = access(rights); const h = data(); render(panel(h));
    expect(screen.getByRole("button", { name: "Распознать QA-паспорт.pdf" })).toBeDisabled(); recognize();
    expect(mocks.invoke).not.toHaveBeenCalled(); expect(h.saveFrdoField).not.toHaveBeenCalled();
  });
  it.each([{ loading: true }, { error: "Rights unavailable" }, { adminRole: "viewer", organizationId: null, isOrgOwner: true },
    { adminRole: "sales_manager", organizationId: null, isOrgOwner: true }, { organizationId: ids.other }])("fails closed for current rights/context %j", extra => {
    mocks.permissions = access(undefined, extra); render(panel(data()));
    expect(screen.getByRole("button", { name: "Распознать QA-паспорт.pdf" })).toBeDisabled(); recognize(); expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it("keeps extraction and manual FRDO permissions separate", async () => {
    mocks.permissions = access(["documents.write", "students.write"]); const h = data(); render(panel(h)); await recognized();
    expect(screen.getByRole("button", { name: "Применить все" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Сохранить фамилию" })).toBeDisabled();
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(h.saveFrdoField).not.toHaveBeenCalled();
  });
  it("allows current scoped manual FRDO editing without granting paid OCR processing", async () => {
    mocks.permissions = access(["frdo.write"]); const h = data(); render(panel(h, { orgPlan: "start" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Сохранить фамилию" })).toBeEnabled());
    fireEvent.change(screen.getByPlaceholderText("Иванов"), { target: { value: "QA новое" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить фамилию" }));
    expect(h.saveFrdoField).toHaveBeenCalledWith("last_name", "QA новое"); expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("can_write_student_frdo_data", { p_organization_id: ids.org, p_user_id: ids.student });
  });
  it.each([{ data: false, error: null }, { data: true, error: { message: "Scope failed" } }, { data: "true", error: null }])("does not apply when authoritative FRDO scope is not proven %j", async result => {
    mocks.rpc.mockResolvedValue(result); const h = data(); render(panel(h)); await recognized();
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("button", { name: "Сохранить фамилию" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Применить все" })).toBeDisabled(); expect(h.saveFrdoField).not.toHaveBeenCalled();
  });
  it("does not reuse a late authoritative write grant after the acting user changes", async () => {
    const scope = deferred<any>(); mocks.rpc.mockReturnValueOnce(scope.promise).mockResolvedValue({ data: false, error: null });
    const h = data(); const view = render(panel(h)); expect(screen.getByRole("button", { name: "Сохранить фамилию" })).toBeDisabled();
    view.rerender(panel(h, { actorUserId: ids.other })); await act(async () => scope.resolve({ data: true, error: null }));
    expect(screen.getByRole("button", { name: "Сохранить фамилию" })).toBeDisabled(); expect(h.saveFrdoField).not.toHaveBeenCalled();
  });
  it.each([{ organization_id: ids.other }, { user_id: ids.other }, { file_path: "" }])("does not process an unbound source row %j", extra => {
    render(panel(data({ identityDocs: [source(extra)] })));
    expect(screen.getByRole("button", { name: "Распознать QA-паспорт.pdf" })).toBeDisabled(); expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it.each([{ documentId: ids.other }, { doc_type: "snils" }, { raw: { hidden: "provider extra" } }, { confidence: 100 },
    { birth_date: "1990-02-31" }, { passport_number: 123456 }, { snils: "112-233-445 95" }])("rejects mismatched or non-normalized response %j", extra => {
    mocks.invoke.mockResolvedValue({ data: normalized(extra), error: null }); const h = data(); render(panel(h)); recognize();
    return waitFor(() => { expect(mocks.error).toHaveBeenCalled(); expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(); expect(h.saveFrdoField).not.toHaveBeenCalled(); });
  });
  it("discards a pending result when processing rights are revoked and restored", async () => {
    const pending = deferred<any>(); mocks.invoke.mockReturnValue(pending.promise); const h = data(); const view = render(panel(h)); recognize();
    mocks.permissions = access(["frdo.write"]); view.rerender(panel(h)); mocks.permissions = access(); view.rerender(panel(h));
    await act(async () => pending.resolve({ data: normalized(), error: null }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(); expect(mocks.error).not.toHaveBeenCalled(); expect(h.saveFrdoField).not.toHaveBeenCalled();
  });
  for (const kind of ["path", "revision", "actor", "student", "organization"]) rejects_pending_for_context_change(kind);
  function rejects_pending_for_context_change(kind: string) {
    it(`discards a pending result after ${kind} changes`, async () => {
      const pending = deferred<any>(); mocks.invoke.mockReturnValue(pending.promise); const h = data(); const view = render(panel(h)); recognize();
      let next: any = h, props: any = {};
      if (kind === "path") next = { ...h, identityDocs: [source({ file_path: `${ids.student}/passport_2.pdf` })] };
      if (kind === "revision") next = { ...h, identityDocs: [source({ updated_at: "2026-10-19T01:00:00Z" })] };
      if (kind === "actor") props = { actorUserId: ids.other };
      if (kind === "student") { props = { studentUserId: ids.other }; next = data({ identityDocs: [source({ user_id: ids.other })], frdoData: { user_id: ids.other, organization_id: ids.org } }); }
      if (kind === "organization") { mocks.permissions = access(undefined, { organizationId: ids.other }); props = { organizationId: ids.other }; next = data({ identityDocs: [source({ organization_id: ids.other })], frdoData: { user_id: ids.student, organization_id: ids.other } }); }
      view.rerender(panel(next, props)); await act(async () => pending.resolve({ data: normalized(), error: null }));
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(); expect(h.saveFrdoField).not.toHaveBeenCalled();
    });
  }
  it("clears a displayed candidate after its file changes", async () => {
    const h = data(); const view = render(panel(h)); await recognized();
    view.rerender(panel({ ...h, identityDocs: [source({ file_path: `${ids.student}/new.pdf` })] }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(); expect(h.saveFrdoField).not.toHaveBeenCalled();
  });
  it("stops apply-all after a current FRDO permission change without pretending the first write was cancelled", async () => {
    const write = deferred<boolean>(); const h = data({ saveFrdoField: vi.fn().mockReturnValue(write.promise) }); const view = render(panel(h)); await recognized();
    await waitFor(() => expect(screen.getByRole("button", { name: "Применить все" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Применить все" })); expect(h.saveFrdoField).toHaveBeenCalledWith("birth_date", "1990-01-01");
    mocks.permissions = access(["documents.write", "students.write"]); view.rerender(panel(h)); await act(async () => write.resolve(true));
    expect(h.saveFrdoField).toHaveBeenCalledTimes(1); expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
  it("keeps the Radix action dialog open while an apply is pending and closes only after all saves confirm", async () => {
    const write = deferred<boolean>(); const h = data({ saveFrdoField: vi.fn().mockReturnValueOnce(write.promise).mockResolvedValue(true) });
    render(panel(h)); await recognized(); await waitFor(() => expect(screen.getByRole("button", { name: "Применить все" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Применить все" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Применить все" })).toBeDisabled();
    expect(h.saveFrdoField).toHaveBeenCalledTimes(1);
    await act(async () => write.resolve(true));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()); expect(h.saveFrdoField).toHaveBeenCalledTimes(6);
  });
  it.each([false, undefined])("requires explicit save confirmation and keeps a partial apply visible (%s)", async outcome => {
    const h = data({ saveFrdoField: vi.fn().mockResolvedValueOnce(true).mockResolvedValue(outcome) }); render(panel(h)); await recognized();
    await waitFor(() => expect(screen.getByRole("button", { name: "Применить все" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Применить все" }));
    await waitFor(() => expect(h.saveFrdoField).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument(); await waitFor(() => expect(screen.getByRole("button", { name: "Применить все" })).toBeEnabled());
  });
  it("keeps an apply failure visible when a save rejects", async () => {
    const h = data({ saveFrdoField: vi.fn().mockRejectedValue(new Error("QA failed write")) }); render(panel(h)); await recognized();
    await waitFor(() => expect(screen.getByRole("button", { name: "Применить все" })).toBeEnabled()); fireEvent.click(screen.getByRole("button", { name: "Применить все" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Не удалось сохранить распознанные данные."));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument(); expect(h.saveFrdoField).toHaveBeenCalledTimes(1);
  });
  it("hides old FRDO values and disables saving until the selected identity is freshly confirmed", async () => {
    const h = data(); const view = render(panel(h)); await waitFor(() => expect(screen.getByRole("button", { name: "Сохранить фамилию" })).toBeEnabled());
    view.rerender(panel(h, { studentUserId: ids.other }));
    expect(screen.getByPlaceholderText("Иванов")).toHaveValue(""); expect(screen.getByRole("button", { name: "Сохранить фамилию" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("ещё не подтверждены");
    const fresh = data({ frdoData: { user_id: ids.other, organization_id: ids.org, last_name: "QA fresh" } });
    view.rerender(panel(fresh, { studentUserId: ids.other })); await waitFor(() => expect(screen.getByPlaceholderText("Иванов")).toHaveValue("QA fresh"));
    expect(h.saveFrdoField).not.toHaveBeenCalled();
  });
});
