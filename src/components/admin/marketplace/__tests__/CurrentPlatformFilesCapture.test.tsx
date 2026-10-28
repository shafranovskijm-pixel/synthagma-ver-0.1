import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P, parsedContext, sourceDto } from "@/lib/__tests__/platformCoursePublication.fixtures";
const mock = vi.hoisted(() => ({ actor: "10000000-0000-0000-0000-000000000001", role: "admin", revision: 1,
  listeners: new Set<() => void>(), capture: vi.fn(), refresh: vi.fn(), uuid: vi.fn(), handlers: [] as Array<() => void> }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: mock.actor }, userRole: mock.role, loading: false, authError: null }) }));
vi.mock("@/api/currentPlatformFileCapture", () => ({ currentPlatformFileCapture: { capture: mock.capture } }));
vi.mock("@/utils/courseCache", () => ({ captureOfflineAuthRevision: () => mock.revision,
  captureOfflineContext: () => ({ actorId: mock.actor, revision: mock.revision }),
  subscribeOfflineAuthRevision: (listener: () => void) => { mock.listeners.add(listener); return () => mock.listeners.delete(listener); } }));
vi.mock("@/components/ui/button", () => ({ Button: ({ onClick, children, ...props }: any) => {
  mock.handlers.push(onClick); return <button {...props} onClick={onClick}>{children}</button>;
} }));
import { CurrentPlatformFilesCapture } from "../CurrentPlatformFilesCapture";
const ref = "60000000-0000-0000-0000-000000000001";
const label = "Зафиксировать текущий файл для новой редакции";
function context() { return parsedContext({ current_file_state: "unconfirmed", current_source_context: sourceDto(P.target, {
  file_bindings: [{ reference_kind: "course_document", reference_id: ref, state: "unconfirmed", receipt_id: null,
    exact_version_kind: null, exact_version_id: null, file_bytes_sha256: null, byte_length: null }] }) }); }
function delayed() { let resolve!: (x: unknown) => void; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
beforeEach(() => {
  vi.clearAllMocks(); mock.capture.mockReset(); mock.refresh.mockResolvedValue(null); mock.actor = P.actor;
  mock.role = "admin"; mock.revision = 1; mock.listeners.clear(); mock.handlers = []; mock.uuid.mockReturnValue(P.request);
  vi.stubGlobal("crypto", { randomUUID: mock.uuid });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("explicit current-source capture control", () => {
  it("never starts on mount, StrictMode replay or remount", () => {
    const c = context(); const view = render(<StrictMode><CurrentPlatformFilesCapture context={c} scopeVersion={1} enabled isCurrentContext={() => true} onRefresh={mock.refresh}/></StrictMode>);
    expect(mock.capture).not.toHaveBeenCalled(); expect(mock.uuid).not.toHaveBeenCalled(); view.unmount();
    render(<CurrentPlatformFilesCapture context={c} scopeVersion={1} enabled isCurrentContext={() => true} onRefresh={mock.refresh}/>);
    expect(mock.capture).not.toHaveBeenCalled(); expect(mock.uuid).not.toHaveBeenCalled();
  });
  it("captures only the clicked current reference and waits for gateway server reread before acknowledgement", async () => {
    const wait = delayed(); mock.capture.mockReturnValue(wait.promise); const c = context();
    c.proposal!.source.fileBindings = [{ kind: "lesson_attachment", referenceId: P.receipt, state: "unconfirmed" }];
    render(<CurrentPlatformFilesCapture context={c} scopeVersion={1} enabled isCurrentContext={() => true} onRefresh={mock.refresh}/>);
    fireEvent.click(screen.getByRole("button", { name: label }));
    act(() => mock.handlers[0]()); // A retained pre-render handler cannot double-submit.
    expect(mock.capture).toHaveBeenCalledTimes(1);
    expect(mock.uuid).toHaveBeenCalledTimes(1);
    expect(mock.capture.mock.calls[0][0]).toEqual({ actorId: P.actor, marketplaceId: P.target.marketplaceId, courseId: P.target.courseId,
      currentEditionSha256: P.sha, referenceKind: "course_document", referenceId: ref });
    expect(mock.capture.mock.calls[0][1]).toBe(P.request);
    expect(screen.queryByText(/Копия файла сохранена/)).toBeNull(); expect(mock.refresh).not.toHaveBeenCalled();
    await act(async () => wait.resolve({ receipt_id: P.receipt }));
    expect(screen.getByRole("status")).toHaveTextContent("подтверждена повторным чтением");
    expect(screen.getByRole("status")).toHaveTextContent("выпуск ещё не подтверждены");
    expect(c.currentFileState).toBe("unconfirmed");
    fireEvent.click(screen.getByRole("button", { name: "Обновить состояние досье" })); expect(mock.refresh).toHaveBeenCalledTimes(1);
  });
  it("blocks a non-admin, a different actor and disabled context without any API action", () => {
    const c = context(); mock.role = "student";
    const view = render(<CurrentPlatformFilesCapture context={c} scopeVersion={1} enabled isCurrentContext={() => true} onRefresh={mock.refresh}/>);
    expect(screen.getByRole("button", { name: label })).toBeDisabled();
    mock.role = "admin"; mock.actor = P.otherActor; view.rerender(<CurrentPlatformFilesCapture context={c} scopeVersion={1} enabled isCurrentContext={() => true} onRefresh={mock.refresh}/>);
    expect(screen.getByRole("button", { name: label })).toBeDisabled();
    mock.actor = P.actor; view.rerender(<CurrentPlatformFilesCapture context={c} scopeVersion={1} enabled={false} isCurrentContext={() => false} onRefresh={mock.refresh}/>);
    expect(screen.getByRole("button", { name: label })).toBeDisabled(); expect(mock.capture).not.toHaveBeenCalled();
  });
  it("does not revive a stale action or acknowledgement after context A to B to A", async () => {
    const a = context(), b = context(); b.currentEditionSha256 = P.changedSha;
    const wait = delayed(); mock.capture.mockReturnValue(wait.promise);
    const view = render(<CurrentPlatformFilesCapture context={a} scopeVersion={1} enabled isCurrentContext={() => true} onRefresh={mock.refresh}/>);
    const old = mock.handlers[0]; fireEvent.click(screen.getByRole("button", { name: label })); const signal = mock.capture.mock.calls[0][2] as AbortSignal;
    view.rerender(<CurrentPlatformFilesCapture context={b} scopeVersion={1} enabled isCurrentContext={() => true} onRefresh={mock.refresh}/>);
    view.rerender(<CurrentPlatformFilesCapture context={a} scopeVersion={1} enabled isCurrentContext={() => true} onRefresh={mock.refresh}/>);
    old(); expect(mock.capture).toHaveBeenCalledTimes(1); expect(signal.aborted).toBe(true);
    await act(async () => wait.resolve({ receipt_id: P.receipt })); expect(screen.queryByText(/Копия файла сохранена/)).toBeNull();
  });
  it("aborts on focus revalidation, Auth revision and unmount without accepting late responses", async () => {
    const c = context(), wait = delayed(); mock.capture.mockReturnValue(wait.promise);
    const view = render(<CurrentPlatformFilesCapture context={c} scopeVersion={1} enabled isCurrentContext={() => true} onRefresh={mock.refresh}/>);
    fireEvent.click(screen.getByRole("button", { name: label })); const signal = mock.capture.mock.calls[0][2] as AbortSignal;
    act(() => window.dispatchEvent(new Event("focus"))); expect(signal.aborted).toBe(true);
    act(() => { mock.revision++; for (const listener of mock.listeners) listener(); });
    view.unmount(); await act(async () => wait.resolve({ receipt_id: P.receipt })); expect(mock.refresh).not.toHaveBeenCalled();
  });
  it("holds gateway errors with exact-version guidance and never opens or downloads a raw URL", async () => {
    mock.capture.mockRejectedValue(new Error("held"));
    const view = render(<CurrentPlatformFilesCapture context={context()} scopeVersion={1} enabled isCurrentContext={() => true} onRefresh={mock.refresh}/>);
    fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("нужна точная версия"));
    expect(view.container.querySelector("a[href],iframe,img[src]")).toBeNull();
    expect(mock.refresh).not.toHaveBeenCalled();
  });
});
