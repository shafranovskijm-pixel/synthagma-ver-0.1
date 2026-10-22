import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: "actor-a", role: "organization", loading: false,
  permissionOrg: "org-a" as string | null, permissionLoading: false, permissionError: null as string | null,
  journalRead: true, missingProvider: false, params: new URLSearchParams(),
  confirm: null as null | (() => Promise<void>),
  deletes: [] as Array<() => void>, toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: mocks.actor }, userRole: mocks.role, loading: mocks.loading }) }));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => mocks.missingProvider
  ? { loading: false, error: null, organizationId: null, isOrgOwner: false, orgPermissions: new Set(), can: () => true }
  : { loading: mocks.permissionLoading, error: mocks.permissionError, organizationId: mocks.permissionOrg,
    isOrgOwner: false, orgPermissions: new Set(mocks.journalRead ? ["journals.read"] : []), can: (permission: string) => permission === "journals.read" && mocks.journalRead } }));
vi.mock("@/hooks/useUrlNavigation", () => ({ useUrlNavigation: () => ({ params: mocks.params, updateParams: vi.fn() }) }));
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
vi.mock("@/components/organization/ServerDocumentRegistrationJournal", () => ({ ServerDocumentRegistrationJournal: ({ organizationId, registryScope }: any) => <div data-testid="server-document-registry">{JSON.stringify({ organizationId, registryScope })}</div> }));
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
vi.mock("@/components/organization/ServerCopiesDuplicatesJournal", () => ({ ServerCopiesDuplicatesJournal: ({ organizationId, registryScope }: any) => <div data-testid="server-copy-registry">{JSON.stringify({ organizationId, registryScope })}</div> }));
import { JournalsManager } from "../JournalsManager";

const key = (org: string) => `copies_duplicates_${org}`;
const raw = JSON.stringify([{ id: "copy-row", reg_number: "КОП-2026/009", recipient_name: "Synthetic recipient", original_document_type: "certificate", original_document_number: "original-1", original_issue_date: "2026-01-01", copy_type: "copy", issue_date: "2026-02-02", issue_reason: "lost", notes: null }], null, 2);
beforeEach(() => {
  vi.restoreAllMocks(); vi.clearAllMocks(); localStorage.clear();
  mocks.params = new URLSearchParams(); mocks.actor = "actor-a"; mocks.role = "organization"; mocks.loading = false; mocks.confirm = null; mocks.deletes = [];
  mocks.permissionOrg = "org-a"; mocks.permissionLoading = false; mocks.permissionError = null; mocks.journalRead = true; mocks.missingProvider = false;
  localStorage.setItem(key("org-a"), raw); localStorage.setItem(key("org-b"), raw.replace("copy-row", "copy-b"));
});
afterEach(cleanup);

describe("copy journal production routing preserves historical browser bytes", () => {
  it.each(["auto", "manual"])("routes %s links to the server registry without reading or deleting the legacy source", async view => {
    mocks.params = new URLSearchParams({ journalType: "copies_duplicates", journalView: view });
    const read = vi.spyOn(Storage.prototype, "getItem"), remove = vi.spyOn(Storage.prototype, "removeItem"), write = vi.spyOn(Storage.prototype, "setItem");
    render(<JournalsManager organizationId="org-a" />); await act(async () => {});
    expect(screen.getByTestId("server-copy-registry")).toHaveTextContent(JSON.stringify({ organizationId: "org-a", registryScope: { kind: "organization" } }));
    expect(read).not.toHaveBeenCalledWith(key("org-a")); expect(remove).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
  });
  it("passes the exact group context to the server registry instead of falling back to organization rows", async () => {
    mocks.params = new URLSearchParams({ journalType: "copies_duplicates", journalView: "auto" });
    render(<JournalsManager organizationId="org-a" groupId="00000000-0000-4000-8000-000000000002" />); await act(async () => {});
    expect(screen.getByTestId("server-copy-registry")).toHaveTextContent(JSON.stringify({ organizationId: "org-a", registryScope: { kind: "group", group_id: "00000000-0000-4000-8000-000000000002" } }));
  });
  it("has no destructive copy-journal clear entry point, including malformed historical bytes", async () => {
    localStorage.setItem(key("org-a"), "{unreadable");
    const read = vi.spyOn(Storage.prototype, "getItem"), remove = vi.spyOn(Storage.prototype, "removeItem");
    render(<JournalsManager organizationId="org-a" />); await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Часто требуемые журналы/ }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    const label = screen.getByText("Журнал учёта выдачи копий / дубликатов документов");
    expect(label.closest("div.border-b")?.querySelector('button[title="Удалить журнал"]')).toBeFalsy();
    expect(read).not.toHaveBeenCalledWith(key("org-a")); expect(remove).not.toHaveBeenCalled(); expect(localStorage.getItem(key("org-a"))).toBe("{unreadable");
  });
});

describe("ordinary group journal availability",()=>{
 it("allows journal creation with server write permission even when the group has no course",async()=>{render(<JournalsManager organizationId="org-a" groupId="00000000-0000-4000-8000-000000000002" courseId={null}/>);await act(async()=>{});expect(screen.getByRole("button",{name:"Создать журнал группы"})).toBeEnabled();expect(screen.getByTestId("group-journals-scope-notice")).toHaveTextContent("Заметки можно вести и без закреплённой программы");expect(screen.getByTestId("group-journals-scope-notice")).toHaveTextContent("Для связи с подтверждёнными занятиями и результатами закрепите программу группы");});
});

describe('document registration production routing', () => {
  it.each(['auto', 'manual'])('routes %s document links to the authoritative registry, bypassing old aggregate writers', async view => {
    mocks.params = new URLSearchParams({ journalType: 'document_registration', journalView: view });
    render(<JournalsManager organizationId="org-a" />); await act(async () => {});
    expect(screen.getByTestId('server-document-registry')).toHaveTextContent(JSON.stringify({ organizationId: 'org-a', registryScope: { kind: 'organization' } }));
  });
  it('passes the exact group even without a program and never silently falls back to organization scope for an invalid group input', async () => {
    mocks.params = new URLSearchParams({ journalType: 'document_registration', journalView: 'auto' });
    render(<JournalsManager organizationId="org-a" groupId="invalid-group" courseId={null} />); await act(async () => {});
    expect(screen.getByTestId('server-document-registry')).toHaveTextContent(JSON.stringify({ organizationId: 'org-a', registryScope: { kind: 'group', group_id: 'invalid-group' } }));
  });
});
