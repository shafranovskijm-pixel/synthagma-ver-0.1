import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const A = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const B = "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee";
const TARGET = "cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee";
const mocks = vi.hoisted(() => ({
  user: { id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", email: "24@24zxc.ru" },
  canWrite: true,
  getSession: vi.fn(), getUser: vi.fn(), profile: vi.fn(), insert: vi.fn(), load: vi.fn(),
  success: vi.fn(), error: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getSession: (...args: unknown[]) => mocks.getSession(...args), getUser: (...args: unknown[]) => mocks.getUser(...args) },
  rpc: () => Promise.resolve({ data: false, error: null }),
  from: (table: string) => {
    let email = "";
    let org = "";
    let payload: unknown;
    const headers: Record<string, string> = {};
    const query = {
      select: () => query,
      eq: (key: string, value: string) => { if (key === "email") email = value; if (key === "organization_id") org = value; return query; },
      order: () => query,
      single: () => query,
      insert: (value: unknown) => { payload = value; return query; },
      setHeader: (key: string, value: string) => { headers[key] = value; return query; },
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(
        table === "profiles" ? mocks.profile(email, { ...headers }) :
          payload ? mocks.insert(payload, { ...headers }) : mocks.load(org, { ...headers }),
      ).then(resolve, reject),
    };
    return query;
  },
} }));
vi.mock("sonner", () => ({ toast: { success: (...args: unknown[]) => mocks.success(...args), error: (...args: unknown[]) => mocks.error(...args) } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => ({
  loading: false, error: null, organizationId: null, orgRole: null, adminRole: null,
  isOrgOwner: true, orgPermissions: new Set(mocks.canWrite ? ["staff.read", "staff.write"] : ["staff.read"]),
  adminSections: new Set(), can: (permission: string) => permission === "staff.read" || (mocks.canWrite && permission === "staff.write"),
}) }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children, disabled }: { value: string; onValueChange: (value: string) => void; children: React.ReactNode; disabled?: boolean }) =>
    <select value={value} disabled={disabled} onChange={event => onValueChange(event.target.value)}>{children}</select>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
  SelectTrigger: () => null, SelectValue: () => null,
}));
vi.mock("@/components/staff/StaffInvitationDialog", () => ({ StaffInvitationDialog: () => null }));
vi.mock("@/components/staff/RoleAuditLog", () => ({ RoleAuditLog: () => null }));
vi.mock("@/components/staff/PermissionMatrix", () => ({ OrgPermissionMatrix: () => null }));
vi.mock("@/components/staff/OrgCustomRolesManager", () => ({ OrgCustomRolesManager: () => null }));
vi.mock("@/components/staff/StaffExpirationButton", () => ({ StaffExpirationButton: () => null }));
vi.mock("@/components/staff/OwnershipTransfer", () => ({ OwnershipTransfer: () => null }));
vi.mock("@/components/staff/StaffDocumentGroupsDialog", () => ({ StaffDocumentGroupsDialog: () => null }));

import { StaffManager } from "../StaffManager";
import { observeOfflineAccess, setOfflineAuthActor } from "@/utils/courseCache";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function open(email = "24@24zxc.ru") {
  fireEvent.click(screen.getByRole("button", { name: "Добавить существующего" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByPlaceholderText("email@example.com"), { target: { value: email } });
  return dialog;
}
function submit(dialog: HTMLElement) { fireEvent.click(within(dialog).getByRole("button", { name: /^Добавить$/ })); }

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { id: A, email: "24@24zxc.ru" };
  mocks.canWrite = true;
  setOfflineAuthActor(null); setOfflineAuthActor(A);
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: A }, access_token: "original-test-token" } }, error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { id: A, email: "24@24zxc.ru" } }, error: null });
  mocks.profile.mockResolvedValue({ data: null, error: { code: "PGRST116" } });
  mocks.insert.mockResolvedValue({ data: null, error: null });
  mocks.load.mockResolvedValue({ data: [], error: null });
});
afterEach(() => { cleanup(); setOfflineAuthActor(null); });

describe("StaffManager existing authenticated account", () => {
  it("adds the verified current account without a profile, preserving the selected role and visibility", async () => {
    render(<StaffManager organizationId="org-a" />);
    const dialog = await open("  24@24ZXC.RU  ");
    fireEvent.change(within(dialog).getByPlaceholderText("Иван Иванов"), { target: { value: "QA · Максим" } });
    const selects = within(dialog).getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "admin" } });
    fireEvent.change(selects[1], { target: { value: "hidden" } });
    submit(dialog);
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Сотрудник добавлен"));
    expect(mocks.getUser).toHaveBeenCalledWith("original-test-token");
    expect(mocks.profile).not.toHaveBeenCalled();
    expect(mocks.insert).toHaveBeenCalledExactlyOnceWith({
      organization_id: "org-a", user_id: A, role: "admin", display_name: "QA · Максим", visibility: "hidden",
    }, { Authorization: "Bearer original-test-token" });
    expect(mocks.load).toHaveBeenLastCalledWith("org-a", { Authorization: "Bearer original-test-token" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not turn a missing foreign profile into membership of the current account", async () => {
    render(<StaffManager organizationId="org-a" />);
    const dialog = await open("other@example.ru"); submit(dialog);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Пользователь с таким email не найден");
    expect(mocks.profile).toHaveBeenCalledWith("other@example.ru", { Authorization: "Bearer original-test-token" });
    expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled();
  });

  it("keeps the existing foreign-profile lookup and default teacher/all assignment", async () => {
    mocks.profile.mockResolvedValue({ data: { user_id: TARGET }, error: null });
    render(<StaffManager organizationId="org-a" />);
    const dialog = await open("Other@Example.ru"); submit(dialog);
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
    expect(mocks.insert).toHaveBeenCalledExactlyOnceWith({ organization_id: "org-a", user_id: TARGET,
      role: "teacher", display_name: "Other@Example.ru", visibility: "all" }, { Authorization: "Bearer original-test-token" });
  });

  it("requires server-verified current identity and never falls back to the hook when verification fails", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: B, email: "24@24zxc.ru" } }, error: null });
    render(<StaffManager organizationId="org-a" />); const dialog = await open(); submit(dialog);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Не удалось подтвердить текущую учётную запись");
    expect(mocks.profile).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("keeps duplicate membership as a visible error without updating the existing row", async () => {
    mocks.insert.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate" } });
    render(<StaffManager organizationId="org-a" />); const dialog = await open(); submit(dialog);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Этот сотрудник уже добавлен");
    expect(mocks.insert).toHaveBeenCalledTimes(1); expect(mocks.success).not.toHaveBeenCalled();
  });

  it("does not label a failed profile query as an unknown account", async () => {
    mocks.profile.mockResolvedValue({ data: null, error: { code: "503" } });
    render(<StaffManager organizationId="org-a" />); const dialog = await open("other@example.ru"); submit(dialog);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Не удалось найти пользователя. Повторите попытку.");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("refuses a late lookup after organization A→B→A, even though the original identifiers return", async () => {
    const pending = deferred<unknown>(); mocks.profile.mockReturnValue(pending.promise);
    const view = render(<StaffManager organizationId="org-a" />); const dialog = await open("other@example.ru"); submit(dialog);
    await waitFor(() => expect(mocks.profile).toHaveBeenCalled());
    view.rerender(<StaffManager organizationId="org-b" />);
    view.rerender(<StaffManager organizationId="org-a" />);
    await act(async () => pending.resolve({ data: { user_id: TARGET }, error: null }));
    expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("refuses a late lookup after an auth A→B→A round trip published before React rerenders", async () => {
    const pending = deferred<unknown>(); mocks.profile.mockReturnValue(pending.promise);
    render(<StaffManager organizationId="org-a" />); const dialog = await open("other@example.ru"); submit(dialog);
    await waitFor(() => expect(mocks.profile).toHaveBeenCalled());
    setOfflineAuthActor(B); setOfflineAuthActor(A);
    await act(async () => pending.resolve({ data: { user_id: TARGET }, error: null }));
    expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled();
  });

  it("refuses a late lookup after an observed access downgrade and restoration", async () => {
    const pending = deferred<unknown>(); mocks.profile.mockReturnValue(pending.promise);
    render(<StaffManager organizationId="org-a" />); const dialog = await open("other@example.ru"); submit(dialog);
    await waitFor(() => expect(mocks.profile).toHaveBeenCalled());
    observeOfflineAccess(A, "restricted"); observeOfflineAccess(A, "restored");
    await act(async () => pending.resolve({ data: { user_id: TARGET }, error: null }));
    expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled();
  });

  it("does not let a closed operation write or clear a reopened dialog", async () => {
    const pending = deferred<unknown>(); mocks.getUser.mockReturnValue(pending.promise);
    render(<StaffManager organizationId="org-a" />); let dialog = await open(); submit(dialog);
    await waitFor(() => expect(mocks.getUser).toHaveBeenCalled());
    fireEvent.click(within(dialog).getByRole("button", { name: "Отмена" }));
    dialog = await open("new@example.ru");
    await act(async () => pending.resolve({ data: { user: { id: A, email: "24@24zxc.ru" } }, error: null }));
    expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled();
    expect(within(dialog).getByPlaceholderText("email@example.com")).toHaveValue("new@example.ru");
    expect(within(dialog).getByRole("button", { name: /^Добавить$/ })).toBeEnabled();
  });

  it("keeps an already dispatched write bound to its captured org and suppresses late success in a new dialog", async () => {
    const pending = deferred<unknown>(); mocks.insert.mockReturnValue(pending.promise);
    render(<StaffManager organizationId="org-a" />); let dialog = await open(); submit(dialog);
    await waitFor(() => expect(mocks.insert).toHaveBeenCalled());
    fireEvent.click(within(dialog).getByRole("button", { name: "Отмена" }));
    dialog = await open("new@example.ru");
    await act(async () => pending.resolve({ data: null, error: null }));
    expect(mocks.insert).toHaveBeenCalledTimes(1); expect(mocks.success).not.toHaveBeenCalled();
    expect(within(dialog).getByPlaceholderText("email@example.com")).toHaveValue("new@example.ru");
  });

  it("does not leave Create Staff disabled after an Add request loses its organization context", async () => {
    const pending = deferred<unknown>(); mocks.getUser.mockReturnValue(pending.promise);
    const view = render(<StaffManager organizationId="org-a" />); const dialog = await open(); submit(dialog);
    await waitFor(() => expect(mocks.getUser).toHaveBeenCalled());
    view.rerender(<StaffManager organizationId="org-b" />);
    fireEvent.click(screen.getByRole("button", { name: "Создать с паролем" }));
    const createDialog = await screen.findByRole("dialog");
    expect(within(createDialog).getByRole("button", { name: /^Создать$/ })).toBeEnabled();
    expect(within(createDialog).getByPlaceholderText("email@example.com")).toHaveValue("");
    await act(async () => pending.resolve({ data: { user: { id: A, email: "24@24zxc.ru" } }, error: null }));
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(within(createDialog).getByRole("button", { name: /^Создать$/ })).toBeEnabled();
  });

  it("starts a new Add owner with empty private fields and original defaults after an actor and organization switch", async () => {
    const view = render(<StaffManager organizationId="org-a" />);
    const oldDialog = await open("private-old@example.ru");
    fireEvent.change(within(oldDialog).getByPlaceholderText("Иван Иванов"), { target: { value: "Частное старое имя" } });
    const oldSelects = within(oldDialog).getAllByRole("combobox");
    fireEvent.change(oldSelects[0], { target: { value: "admin" } });
    fireEvent.change(oldSelects[1], { target: { value: "hidden" } });
    mocks.user = { id: B, email: "second@example.ru" }; setOfflineAuthActor(B);
    view.rerender(<StaffManager organizationId="org-b" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Добавить существующего" }));
    const newDialog = await screen.findByRole("dialog");
    expect(within(newDialog).getByPlaceholderText("email@example.com")).toHaveValue("");
    expect(within(newDialog).getByPlaceholderText("Иван Иванов")).toHaveValue("");
    const newSelects = within(newDialog).getAllByRole("combobox");
    expect(newSelects[0]).toHaveValue("teacher"); expect(newSelects[1]).toHaveValue("all");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
