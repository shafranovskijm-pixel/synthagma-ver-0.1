import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MARKETPLACE_ORG_ID } from "@/constants/marketplace";
import { knownPrograms } from "@/data/knownPrograms";
import { observeOfflineAccess, setOfflineAuthActor } from "@/utils/courseCache";
import { KnowledgeBankTab } from "../KnowledgeBankTab";
import { ProgramListImporter } from "../ProgramListImporter";

interface Query { table: string; columns: string; filters: Record<string, unknown>; kind: string; payload?: Record<string, unknown> }
const mocks = vi.hoisted(() => ({
  auth: { user: { id: "admin-a" } as { id: string } | null, userRole: "admin" as string | null, loading: false },
  role: vi.fn(), permission: vi.fn(), invoke: vi.fn(), read: vi.fn(), write: vi.fn(),
  success: vi.fn(), error: vi.fn(), warning: vi.fn(), loading: vi.fn(), dismiss: vi.fn(), complete: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error, warning: mocks.warning, loading: mocks.loading, dismiss: mocks.dismiss } }));
vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: (...args: unknown[]) => mocks.invoke(...args) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (name: string, args: Record<string, unknown>) => name === "get_user_role" ? mocks.role(args) : mocks.permission(args),
  from: (table: string) => {
    const query: Query = { table, columns: "", filters: {}, kind: "read" };
    const execute = () => query.kind === "read" ? mocks.read({ ...query, filters: { ...query.filters } }) : mocks.write({ ...query, filters: { ...query.filters } });
    const chain = {
      select: (columns: string) => { query.columns = columns; return chain; },
      order: () => chain,
      eq: (key: string, value: unknown) => { query.filters[key] = value; return chain; },
      is: (key: string, value: unknown) => { query.filters[`is:${key}`] = value; return chain; },
      insert: (payload: Record<string, unknown>) => { query.kind = "insert"; query.payload = payload; return chain; },
      update: (payload: Record<string, unknown>) => { query.kind = "update"; query.payload = payload; return chain; },
      delete: () => { query.kind = "delete"; return chain; },
      single: () => Promise.resolve(execute()),
      then: (done: (result: unknown) => unknown, fail: (error: unknown) => unknown) => Promise.resolve(execute()).then(done, fail),
    };
    return chain;
  },
} }));

const response = (titles = [knownPrograms[0].title]) => ({ data: { success: true, lessons: titles.map((title, index) => ({ title: `Раздел ${index + 1}`, content: `<p>${title}</p><table><tr><th>Параметр</th></tr><tr><td>Данные ${index + 1}</td></tr></table>` })) }, error: null });
const file = (name = "synthetic.docx") => new File(["synthetic fixture"], name);
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const defaultRead = (query: Query) => ({ data: query.table === "organizations" ? { id: MARKETPLACE_ORG_ID }
  : query.table === "course_categories" ? [{ id: "cat-ot", name: "Охрана труда", parent_type: "Охрана труда / Пожарная безопасность" }] : [], error: null });
function mount(kind: "knowledge" | "program") {
  const view = render(kind === "knowledge" ? <KnowledgeBankTab /> : <ProgramListImporter onComplete={mocks.complete} />);
  return { ...view, input: () => view.container.querySelector<HTMLInputElement>('input[type="file"]')! };
}
function upload(input: HTMLInputElement, files = [file()]) { fireEvent.change(input, { target: { files } }); }

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.user = { id: "admin-a" }; mocks.auth.userRole = "admin"; mocks.auth.loading = false;
  setOfflineAuthActor(null); setOfflineAuthActor("admin-a");
  mocks.role.mockResolvedValue({ data: "admin", error: null });
  mocks.permission.mockResolvedValue({ data: true, error: null });
  mocks.invoke.mockResolvedValue(response());
  mocks.read.mockImplementation(defaultRead);
  mocks.write.mockImplementation(async (query: Query) => ({ data: query.table === "courses" ? { id: "new-course" } : null, error: null }));
  mocks.loading.mockReturnValue("synthetic-toast");
});
afterEach(() => { cleanup(); setOfflineAuthActor(null); });

describe("actual admin importer components", () => {
  it("stores every parsed knowledge lesson and table as block JSON, with a verified org in FormData", async () => {
    mocks.invoke.mockResolvedValue(response([knownPrograms[0].title, knownPrograms[1].title]));
    const view = mount("knowledge"); upload(view.input());
    await waitFor(() => expect(mocks.write).toHaveBeenCalledOnce());
    const write: Query = mocks.write.mock.calls[0][0];
    expect(write.table).toBe("knowledge_bank");
    expect(write.payload).toMatchObject({ title: "synthetic", source_filename: "synthetic.docx" });
    const content = JSON.parse(String(write.payload?.content));
    expect(content.filter((block: { type: string }) => block.type === "table")).toHaveLength(2);
    expect(JSON.stringify(content)).toContain(knownPrograms[0].title);
    expect(JSON.stringify(content)).toContain(knownPrograms[1].title);
    expect(mocks.invoke.mock.calls[0][1].body.get("organization_id")).toBe(MARKETPLACE_ORG_ID);
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Загружено 1 файлов"));
  });

  it.each(["after-new-result", "while-newer-read-pending"])("ignores the old mount read %s after an actual knowledge upload and refresh", async mode => {
    const oldRead = deferred<{ data: { id: string; title: string; content: string; source_filename: string; tags: string[]; created_at: string }[]; error: null }>();
    const newerRead = deferred<{ data: { id: string; title: string; content: string; source_filename: string; tags: string[]; created_at: string }[]; error: null }>();
    const fresh = { id: "new-knowledge", title: "Новый материал после импорта", content: "Сохранённый материал", source_filename: "new.docx", tags: [], created_at: "2026-10-20" };
    let knowledgeReads = 0;
    mocks.read.mockImplementation((query: Query) => {
      if (query.table !== "knowledge_bank") return defaultRead(query);
      knowledgeReads++;
      if (knowledgeReads === 1) return oldRead.promise;
      if (knowledgeReads === 3) return newerRead.promise;
      return { data: [fresh], error: null };
    });
    const view = mount("knowledge");
    await waitFor(() => expect(knowledgeReads).toBe(1));
    upload(view.input());
    await waitFor(() => expect(screen.getByText(fresh.title)).toBeTruthy());
    expect(mocks.write).toHaveBeenCalledOnce();
    const refresh = screen.getByRole<HTMLButtonElement>("button", { name: "Обновить" });
    if (mode === "while-newer-read-pending") {
      fireEvent.click(refresh);
      await waitFor(() => expect(knowledgeReads).toBe(3));
      expect(refresh.disabled).toBe(true);
    }
    await act(async () => { oldRead.resolve({ data: [{ ...fresh, id: "old-knowledge", title: "Устаревшая строка до импорта" }], error: null }); });
    expect(screen.queryByText("Устаревшая строка до импорта")).toBeNull();
    if (mode === "while-newer-read-pending") {
      expect(refresh.disabled).toBe(true);
      await act(async () => { newerRead.resolve({ data: [fresh], error: null }); });
    }
    await waitFor(() => expect(screen.getByText(fresh.title)).toBeTruthy());
    expect(refresh.disabled).toBe(false);
  });

  it.each(["knowledge", "program"] as const)("keeps %s closed while auth is pending", async kind => {
    mocks.auth.loading = true;
    const view = mount(kind);
    expect(view.input().disabled).toBe(true);
    await act(async () => { upload(view.input()); });
    expect(mocks.invoke).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled(); expect(mocks.role).not.toHaveBeenCalled();
  });

  it.each(["knowledge", "program"] as const)("denies %s when the fresh canonical admin role is unknown", async kind => {
    mocks.role.mockResolvedValue({ data: null, error: new Error("offline") });
    const view = mount(kind); upload(view.input());
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.invoke).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each(["knowledge", "program"] as const)("rejects oversized %s files before invoking the parser", async kind => {
    const oversized = file();
    Object.defineProperty(oversized, "size", { value: (kind === "knowledge" ? 20 : 30) * 1024 * 1024 + 1 });
    const view = mount(kind); upload(view.input(), [oversized]);
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.invoke).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each(["knowledge", "program"] as const)("rejects obsolete parser responses in %s without an empty insert or full-list preview", async kind => {
    mocks.invoke.mockResolvedValue({ data: { text: "old protocol" }, error: null });
    const view = mount(kind); upload(view.input());
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.write).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^Создать \d+ курсов/ })).toBeNull();
  });

  it.each(["knowledge", "program"] as const)("blocks %s reentry while a parser response is pending", async kind => {
    const pending = deferred<ReturnType<typeof response>>(); mocks.invoke.mockReturnValueOnce(pending.promise);
    const view = mount(kind); upload(view.input());
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledOnce());
    upload(view.input(), [file("second.docx")]);
    expect(mocks.invoke).toHaveBeenCalledOnce();
    await act(async () => { pending.resolve(response()); });
    await waitFor(() => expect(view.input().disabled).toBe(false));
    expect(mocks.invoke).toHaveBeenCalledOnce();
  });

  it.each(["knowledge", "program"] as const)("discards a late %s parse reply after actor ABA without a React rerender", async kind => {
    const pending = deferred<ReturnType<typeof response>>(); mocks.invoke.mockReturnValueOnce(pending.promise);
    const view = mount(kind); upload(view.input());
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledOnce());
    setOfflineAuthActor("admin-b"); setOfflineAuthActor("admin-a");
    await act(async () => { pending.resolve(response()); });
    expect(mocks.write).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^Создать \d+ курсов/ })).toBeNull();
  });

  it.each(["knowledge", "program"] as const)("rejects access revision changes during the fresh %s pre-commit verification", async kind => {
    const pending = deferred<{ data: boolean; error: null }>();
    mocks.permission.mockResolvedValueOnce({ data: true, error: null }).mockReturnValueOnce(pending.promise);
    const view = mount(kind); upload(view.input());
    await waitFor(() => expect(mocks.permission).toHaveBeenCalledTimes(2));
    observeOfflineAccess("admin-a", "roles:changed");
    await act(async () => { pending.resolve({ data: true, error: null }); });
    expect(mocks.write).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^Создать \d+ курсов/ })).toBeNull();
  });

  it.each(["knowledge", "program"] as const)("ignores a %s parse response after unmount", async kind => {
    const pending = deferred<ReturnType<typeof response>>(); mocks.invoke.mockReturnValueOnce(pending.promise);
    const view = mount(kind); upload(view.input());
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledOnce());
    view.unmount(); await act(async () => { pending.resolve(response()); });
    expect(mocks.write).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled();
  });

  it("does not claim knowledge was uploaded after an actual insert failure", async () => {
    mocks.write.mockResolvedValue({ data: null, error: { message: "synthetic database refusal" } });
    const view = mount("knowledge"); upload(view.input());
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Файлы не загружены, ошибок: 1"));
    expect(mocks.write).toHaveBeenCalledOnce(); expect(mocks.success).not.toHaveBeenCalled();
  });

  it("clears the previous program preview when a new file has no matching complete title", async () => {
    const view = mount("program"); upload(view.input());
    await waitFor(() => expect(screen.getByRole("button", { name: "Создать 1 курсов" })).toBeTruthy());
    mocks.invoke.mockResolvedValue(response(["Незнакомая образовательная программа"]));
    upload(view.input(), [file("unknown.docx")]);
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Не удалось найти программы в файле"));
    expect(screen.queryByRole("button", { name: /^Создать \d+ курсов/ })).toBeNull();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("loads the complete known list only through its explicit existing button and creates nothing automatically", async () => {
    mount("program"); fireEvent.click(screen.getByRole("button", { name: "Загрузить из перечня" }));
    await waitFor(() => expect(screen.getByRole("button", { name: `Создать ${knownPrograms.length} курсов` })).toBeTruthy());
    expect(mocks.invoke).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled();
  });

  it("repairs orphan categories only for selected programs in the fixed marketplace organization", async () => {
    mocks.read.mockImplementation((query: Query) => {
      if (query.table === "courses") return { data: [{ id: "selected", title: knownPrograms[0].title }, { id: "unselected", title: knownPrograms[1].title }], error: null };
      if (query.table === "marketplace_courses") return { data: [{ course_id: "selected" }, { course_id: "unselected" }], error: null };
      return defaultRead(query);
    });
    const view = mount("program"); upload(view.input());
    await waitFor(() => expect(screen.getByRole("button", { name: "Создать 1 курсов" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Создать 1 курсов" }));
    await waitFor(() => expect(mocks.complete).toHaveBeenCalledOnce());
    const writes = mocks.write.mock.calls.map(call => call[0] as Query);
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every(write => write.table === "courses" && write.kind === "update" && write.filters.id === "selected" && write.filters.organization_id === MARKETPLACE_ORG_ID)).toBe(true);
  });

  it("rechecks scope before creating selected programs and writes nothing after an unknown permission", async () => {
    const view = mount("program"); upload(view.input());
    await waitFor(() => expect(screen.getByRole("button", { name: "Создать 1 курсов" })).toBeTruthy());
    mocks.permission.mockResolvedValue({ data: null, error: new Error("offline") });
    fireEvent.click(screen.getByRole("button", { name: "Создать 1 курсов" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.write).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("does not create a preview captured before actor ABA even without a React rerender", async () => {
    const view = mount("program"); upload(view.input());
    await waitFor(() => expect(screen.getByRole("button", { name: "Создать 1 курсов" })).toBeTruthy());
    const previousChecks = mocks.role.mock.calls.length;
    setOfflineAuthActor("admin-b"); setOfflineAuthActor("admin-a");
    fireEvent.click(screen.getByRole("button", { name: "Создать 1 курсов" }));
    await act(async () => { await Promise.resolve(); });
    expect(mocks.role).toHaveBeenCalledTimes(previousChecks);
    expect(mocks.write).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("stops the create loop after access changes during the first in-flight course insert", async () => {
    mocks.invoke.mockResolvedValue(response([knownPrograms[0].title, knownPrograms[1].title]));
    mocks.write.mockImplementation(async (query: Query) => {
      if (query.table === "courses" && query.kind === "insert") observeOfflineAccess("admin-a", "roles:changed");
      return { data: { id: "already-sent-course" }, error: null };
    });
    const view = mount("program"); upload(view.input());
    await waitFor(() => expect(screen.getByRole("button", { name: "Создать 2 курсов" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Создать 2 курсов" }));
    await waitFor(() => expect(mocks.write).toHaveBeenCalledOnce());
    await act(async () => { await Promise.resolve(); });
    expect(mocks.write.mock.calls[0][0]).toMatchObject({ table: "courses", kind: "insert", payload: { organization_id: MARKETPLACE_ORG_ID } });
    expect(mocks.write).toHaveBeenCalledOnce(); expect(mocks.complete).not.toHaveBeenCalled();
  });
});
