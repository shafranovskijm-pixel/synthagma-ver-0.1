import { useMemo } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilePreviewDialog } from "../FilePreviewDialog";
const mocks = vi.hoisted(() => ({ actor: "00000000-0000-4000-8000-000000000001", revision: 1, mode: null as any, refMode: "legacy", preview: null as any, download: null as any, read: vi.fn(), refresh: vi.fn(), handlers: [] as Array<() => void> }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: mocks.actor } }) }));
vi.mock("@/utils/courseCache", () => ({ captureOfflineAuthRevision: () => mocks.revision, captureOfflineContext: () => ({ actorId: mocks.actor, revision: mocks.revision }), subscribeOfflineAuthRevision: () => () => {} }));
vi.mock("@/hooks/useCourseFileDeliveryMode", () => ({ useCourseFileDeliveryMode: () => ({ view: mocks.mode, refresh: vi.fn() }) }));
vi.mock("@/hooks/useCourseExactFileDelivery", () => ({ useCourseExactFileDelivery: (scope: any, enabled: boolean) => {
  mocks.read(scope, enabled);
  const legacy = useMemo(() => ({ schema_version: 1, actor_id: mocks.actor, organization_id: scope.organizationId, course_id: scope.courseId, reference_kind: scope.referenceKind, reference_id: scope.referenceId, access_mode: scope.accessMode, purpose: scope.purpose, mode: "legacy", state: "legacy", binding: null }), [JSON.stringify(scope)]);
  return { view: !enabled ? { state: "idle" } : mocks.refMode === "legacy" ? { state: "legacy", context: legacy } : { state: "exact", lease: scope.purpose === "download" ? mocks.download : mocks.preview }, refresh: mocks.refresh };
} }));
vi.mock("@/components/ui/dialog", () => ({ Dialog: ({ open, children }: any) => open ? <div role="dialog">{children}</div> : null, DialogContent: ({ children }: any) => <div>{children}</div>, DialogHeader: ({ children }: any) => <header>{children}</header>, DialogTitle: ({ children }: any) => <h2>{children}</h2> }));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, onClick, ...props }: any) => { if (onClick) mocks.handlers.push(onClick); return <button {...props} onClick={onClick}>{children}</button>; } }));
vi.mock("@/components/ui/SigmaSpinner", () => ({ SigmaSpinner: () => <span /> }));
const id = (n: number) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const marker = { schema_version: 1, copy_generation_id: id(8), publication_id: id(9), publication_manifest_sha256: "a".repeat(64), source_course_id: id(10), reference_count: 1, reference_vector_sha256: "b".repeat(64) };
const context = { schema_version: 1, actor_id: id(1), organization_id: id(2), course_id: id(3), access_mode: "learner", mode: "legacy", state: "legacy", cohort: null };
const reference = { courseId: id(3), organizationId: id(2), referenceKind: "course_document" as const, referenceId: id(4), name: "Учебный.pdf", fileType: "pdf", legacyUrl: "https://platform.example/storage/v1/object/public/course-files/raw.pdf" };
const props = { open: true, onOpenChange: vi.fn(), reference, accessMode: "learner" as const, allowDownload: true };
const lease = (url: string) => ({ url, previewKind: "pdf", mime: "application/pdf", release: vi.fn(), binding: { ...marker, allow_download: true, display_name: "Проверенный.pdf" } });
const noRaw = (container: HTMLElement) => expect(container.innerHTML).not.toMatch(/src="https:|href="https:|officeapps|docs.google|urn:/i);
beforeEach(() => { mocks.actor = id(1); mocks.revision = 1; mocks.mode = { state: "legacy", context }; mocks.refMode = "legacy"; mocks.preview = lease("blob:verified-preview"); mocks.download = lease("blob:verified-download"); mocks.read.mockClear(); mocks.refresh.mockClear(); mocks.handlers = []; vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("stable file preview consumer", () => {
  it("permits a live legacy URL only after both explicit legacy authorities", async () => {
    render(<FilePreviewDialog {...props} />); await waitFor(() => expect(screen.getByTitle(reference.name).getAttribute("src")).toBe(reference.legacyUrl));
  });
  it.each(["idle", "loading", "held"])("never mounts a raw URL or resolves storage while course mode is %s", async state => {
    mocks.mode = { state }; const resolve = vi.fn(); const view = render(<FilePreviewDialog {...props} resolveLegacyUrl={resolve} />);
    await act(async () => {}); noRaw(view.container); expect(resolve).not.toHaveBeenCalled(); expect(mocks.read.mock.calls.every(call => call[1] === false)).toBe(true);
  });
  it("does not trust per-reference legacy when course is a frozen publication", async () => {
    mocks.mode = { state: "frozen_required", context: { ...context, mode: "frozen_required", state: "held", cohort: marker } };
    const resolve = vi.fn(); const view = render(<FilePreviewDialog {...props} resolveLegacyUrl={resolve} />); await act(async () => {}); noRaw(view.container); expect(resolve).not.toHaveBeenCalled();
  });
  it("holds a source publication with no copied cohort even if its row still has a URL", () => {
    mocks.mode = { state: "frozen_required", context: { ...context, mode: "frozen_required", state: "held", cohort: null } };
    const view = render(<FilePreviewDialog {...props} />); noRaw(view.container); expect(mocks.read.mock.calls.every(call => call[1] === false)).toBe(true);
  });
  it("renders only the verified Blob lease from the matching cohort", () => {
    mocks.refMode = "frozen"; mocks.mode = { state: "frozen_required", context: { ...context, mode: "frozen_required", state: "held", cohort: marker } };
    const view = render(<FilePreviewDialog {...props} allowDownload={false} />); expect(screen.getByTitle(reference.name).getAttribute("src")).toBe("blob:verified-preview"); expect(screen.getByTitle(reference.name).getAttribute("sandbox")).toBe(""); expect(screen.queryByRole("button", { name: "Скачать" })).toBeNull(); noRaw(view.container);
  });
  it("revokes a mismatched cohort lease without opening a raw fallback", () => {
    mocks.refMode = "frozen"; mocks.preview.binding.publication_id = id(90); mocks.mode = { state: "frozen_required", context: { ...context, mode: "frozen_required", state: "held", cohort: marker } };
    const view = render(<FilePreviewDialog {...props} />); expect(mocks.preview.release).toHaveBeenCalled(); expect(view.container.querySelector("iframe,img,a[href]")).toBeNull(); noRaw(view.container);
  });
  it("reauthorizes download purpose and never downloads the preview-purpose Blob", async () => {
    mocks.refMode = "frozen"; mocks.mode = { state: "frozen_required", context: { ...context, mode: "frozen_required", state: "held", cohort: marker } };
    const click = vi.mocked(HTMLAnchorElement.prototype.click); render(<FilePreviewDialog {...props} />); fireEvent.click(screen.getByRole("button", { name: "Скачать" }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1)); expect((click.mock.instances[0] as unknown as HTMLAnchorElement).href).toBe("blob:verified-download");
    expect(mocks.read.mock.calls.some(call => call[0].purpose === "download" && call[1] === true)).toBe(true); expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
  it("does not resolve opaque URNs through the legacy resolver", async () => {
    const resolve = vi.fn(); const view = render(<FilePreviewDialog {...props} reference={{ ...reference, legacyUrl: "urn:sintagma:course-file-binding:unbound" }} resolveLegacyUrl={resolve} />);
    await act(async () => {}); noRaw(view.container); expect(resolve).not.toHaveBeenCalled();
  });
  it("rejects revived download handlers after reference A to B to A and after unmount", async () => {
    const view = render(<FilePreviewDialog {...props} />); await waitFor(() => expect(screen.getByRole("button", { name: "Скачать" })).toBeTruthy()); const old = mocks.handlers.at(-1)!;
    view.rerender(<FilePreviewDialog {...props} reference={{ ...reference, referenceId: id(5) }} />); view.rerender(<FilePreviewDialog {...props} />);
    act(() => old()); expect(mocks.refresh).not.toHaveBeenCalled(); view.unmount(); act(() => old()); expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
