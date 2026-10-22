import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: "actor-a", role: "organization", loading: false,
  permissionOrg: "org-a" as string | null, permissionLoading: false, permissionError: null as string | null,
  journalRead: true, missingProvider: false,
  confirm: null as null | (() => Promise<void>),
  deletes: [] as Array<() => void>, toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: mocks.actor }, userRole: mocks.role, loading: mocks.loading }) }));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => mocks.missingProvider
  ? { loading: false, error: null, organizationId: null, isOrgOwner: false, orgPermissions: new Set(), can: () => true }
  : { loading: mocks.permissionLoading, error: mocks.permissionError, organizationId: mocks.permissionOrg,
    isOrgOwner: false, orgPermissions: new Set(mocks.journalRead ? ["journals.read"] : []), can: (permission: string) => permission === "journals.read" && mocks.journalRead } }));
vi.mock("@/hooks/useUrlNavigation", () => ({ useUrlNavigation: () => ({ params: new URLSearchParams(), updateParams: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const query = { select: () => query, eq: () => query, then: (resolve: (reply: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve) };
  return query;
} } }));
vi.mock("@/api/studentGroupMemberships", () => ({ fetchEffectiveGroupProfiles: async () => [] }));
vi.mock("@/components/organization/JournalEditor", () => ({ JournalEditor: () => null }));
vi.mock("@/components/organization/AutoAttendanceJournal", () => ({ AutoAttendanceJournal: () => null }));
vi.mock("@/components/organization/AutoGradesJournal", () => ({ AutoGradesJournal: () => null }));
vi.mock("@/components/organization/AutoFinalAttestationJournal", () => ({ AutoFinalAttestationJournal: () => null }));
vi.mock("@/components/organization/AutoDocumentRegistrationJournal", () => ({ AutoDocumentRegistrationJournal: () => null }));
vi.mock("@/components/organization/EducationDocumentsJournal", () => ({ EducationDocumentsJournal: () => null }));
vi.mock("@/components/organization/JournalCreationWizard", () => ({ JournalCreationWizard: () => null }));
vi.mock("@/components/organization/IdentificationJournal", () => ({ IdentificationJournal: () => null }));
vi.mock("@/components/organization/GroupContextBanner", () => ({ GroupContextBanner: () => null }));
vi.mock("@/components/ui/button", async importOriginal => {
  const actual = await importOriginal<typeof import("@/components/ui/button")>();
  return { ...actual, Button: (props: React.ComponentProps<typeof actual.Button>) => {
    if (props.title === "Удалить журнал" && typeof props.onClick === "function") mocks.deletes.push(props.onClick as unknown as () => void);
    return <actual.Button {...props} />;
  } };
});
vi.mock("@/components/ui/alert-dialog", () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { AlertDialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div role="alertdialog">{children}</div> : null,
    AlertDialogContent: Box, AlertDialogDescription: Box, AlertDialogFooter: Box, AlertDialogHeader: Box, AlertDialogTitle: Box,
    AlertDialogCancel: Box, AlertDialogAction: ({ onClick, children }: { onClick: () => Promise<void>; children: ReactNode }) => {
      mocks.confirm = onClick; return <button onClick={onClick}>{children}</button>;
    } };
});


vi.mock('@/hooks/useScopedCustomJournals',()=>({useScopedCustomJournals:(_org:string,context:any)=>({contextKey:'SYN_SCOPED',context,scopeCurrent:()=>true,refresh:0,journals:[],next:null,loading:false,error:null,canRead:true,canWrite:true,saving:false,pending:false,mutationError:null,read:vi.fn(),reload:vi.fn(),loadMore:vi.fn(),mutate:vi.fn(),retry:vi.fn()})}));
import { JournalsManager } from "../JournalsManager";

const key = (org: string) => `copies_duplicates_${org}`;
const raw = JSON.stringify([{ id: "copy-row", reg_number: "КОП-2026/009", recipient_name: "Synthetic recipient", original_document_type: "certificate", original_document_number: "original-1", original_issue_date: "2026-01-01", copy_type: "copy", issue_date: "2026-02-02", issue_reason: "lost", notes: null }], null, 2);
function openCopyClear() {
  fireEvent.click(screen.getByRole("button", { name: /Часто требуемые журналы/ }));
  expect(mocks.deletes.length).toBeGreaterThan(0);
  act(() => mocks.deletes[0]());
}
beforeEach(() => {
  vi.restoreAllMocks(); vi.clearAllMocks(); localStorage.clear();
  mocks.actor = "actor-a"; mocks.role = "organization"; mocks.loading = false; mocks.confirm = null; mocks.deletes = [];
  mocks.permissionOrg = "org-a"; mocks.permissionLoading = false; mocks.permissionError = null; mocks.journalRead = true; mocks.missingProvider = false;
  localStorage.setItem(key("org-a"), raw); localStorage.setItem(key("org-b"), raw.replace("copy-row", "copy-b"));
});
afterEach(cleanup);

describe("parent copy journal clear confirmation is bound to its original context", () => {
  it.each(["organization", "organization-aba", "actor", "actor-aba", "role", "loading", "group", "unmount", "permission-loading", "permission-error", "permission-mismatch", "permission-revoked", "permission-revoked-aba", "missing-provider"])("refuses an already captured clear confirmation after %s change", async transition => {
    const page = render(<JournalsManager organizationId="org-a" />);
    openCopyClear();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("копий / дубликатов");
    const confirm = mocks.confirm!, oldOpen = mocks.deletes[0];
    if (transition === "unmount") page.unmount();
    else if (transition.startsWith("organization")) {
      mocks.permissionOrg = "org-b"; page.rerender(<JournalsManager organizationId="org-b" />);
      if (transition.endsWith("aba")) { mocks.permissionOrg = "org-a"; page.rerender(<JournalsManager organizationId="org-a" />); }
    } else if (transition === "group") page.rerender(<JournalsManager organizationId="org-a" groupId="group-a" />);
    else {
      if (transition === "role") mocks.role = "student";
      else if (transition === "loading") mocks.loading = true;
      else if (transition === "permission-loading") mocks.permissionLoading = true;
      else if (transition === "permission-error") mocks.permissionError = "lookup failed";
      else if (transition === "permission-mismatch") mocks.permissionOrg = "org-b";
      else if (transition.startsWith("permission-revoked")) mocks.journalRead = false;
      else if (transition === "missing-provider") mocks.missingProvider = true;
      else mocks.actor = "actor-b";
      page.rerender(<JournalsManager organizationId="org-a" />);
      if (transition === "actor-aba") { mocks.actor = "actor-a"; page.rerender(<JournalsManager organizationId="org-a" />); }
      if (transition === "permission-revoked-aba") { mocks.journalRead = true; page.rerender(<JournalsManager organizationId="org-a" />); }
    }
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    await act(async () => { oldOpen(); await confirm(); });
    expect(remove).not.toHaveBeenCalled(); expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(localStorage.getItem(key("org-a"))).toBe(raw); expect(localStorage.getItem(key("org-b"))).toBe(raw.replace("copy-row", "copy-b"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("retains the explicit clear operation for the unchanged readable own-org key only", async () => {
    render(<JournalsManager organizationId="org-a" />); openCopyClear();
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    await act(async () => { await mocks.confirm!(); });
    expect(remove).toHaveBeenCalledTimes(1); expect(remove).toHaveBeenCalledWith(key("org-a"));
    expect(localStorage.getItem(key("org-a"))).toBeNull(); expect(localStorage.getItem(key("org-b"))).toBe(raw.replace("copy-row", "copy-b"));
    expect(mocks.toast.success).toHaveBeenCalledWith("Журнал очищен");
  });

  it("does not open a clear dialog for an unreadable source", () => {
    localStorage.setItem(key("org-a"), "{unreadable");
    render(<JournalsManager organizationId="org-a" />); const remove = vi.spyOn(Storage.prototype, "removeItem");
    openCopyClear();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(); expect(remove).not.toHaveBeenCalled();
    expect(localStorage.getItem(key("org-a"))).toBe("{unreadable"); expect(mocks.toast.error).toHaveBeenCalledWith(expect.stringContaining("Исходные данные сохранены"));
  });

  it.each(["valid", "malformed"])("does not clear a %s source changed after opening the dialog", async kind => {
    render(<JournalsManager organizationId="org-a" />); openCopyClear();
    const changed = kind === "valid" ? raw.replace("copy-row", "new-row") : "null";
    localStorage.setItem(key("org-a"), changed); const remove = vi.spyOn(Storage.prototype, "removeItem");
    await act(async () => { await mocks.confirm!(); });
    expect(remove).not.toHaveBeenCalled(); expect(localStorage.getItem(key("org-a"))).toBe(changed); expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it("reports removeItem failure without falsely announcing a clear or altering bytes", async () => {
    render(<JournalsManager organizationId="org-a" />); openCopyClear();
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new DOMException("Denied", "SecurityError"); });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await act(async () => { await mocks.confirm!(); });
    expect(localStorage.getItem(key("org-a"))).toBe(raw); expect(mocks.toast.success).not.toHaveBeenCalled(); expect(mocks.toast.error).toHaveBeenCalledWith("Ошибка при удалении");
    log.mockRestore();
  });
});

describe("ordinary group journal availability",()=>{
 it("allows journal creation with server write permission even when the group has no course",async()=>{render(<JournalsManager organizationId="org-a" groupId="00000000-0000-4000-8000-000000000002" courseId={null}/>);await act(async()=>{});expect(screen.getByRole("button",{name:"Создать журнал группы"})).toBeEnabled();expect(screen.getByTestId("group-journals-scope-notice")).toHaveTextContent("Заметки можно вести и без закреплённой программы");expect(screen.getByTestId("group-journals-scope-notice")).toHaveTextContent("Для связи с подтверждёнными занятиями и результатами закрепите программу группы");});
});
