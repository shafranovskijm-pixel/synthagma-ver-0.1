import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VerifiedPdfBytesLease } from "@/lib/selectedPdfCanvas";
const mock = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("@/lib/selectedPdfCanvas", () => ({ openSelectedPdf: (...args: unknown[]) => mock.open(...args) }));
import { VerifiedPdfCanvas } from "../VerifiedPdfCanvas";
const lease = (): VerifiedPdfBytesLease => ({ mime: "application/pdf", previewKind: "pdf", copyVerifiedPdfBytes: () => new Uint8Array([37, 80, 68, 70, 45]) });
const session = () => ({ pages: 2, render: vi.fn(async () => {}), close: vi.fn() });
beforeEach(() => { vi.clearAllMocks(); Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); });
afterEach(cleanup);
describe("neutral verified-memory PDF canvas", () => {
  it("accepts the memory-only port without forging a moderator receipt, URL or copied cohort", async () => {
    const value = lease(), opened = session(); mock.open.mockResolvedValue(opened);
    const view = render(<VerifiedPdfCanvas lease={value} title="Synthetic learner PDF" />);
    await waitFor(() => expect(screen.getByRole("img").className).not.toContain("hidden"));
    expect(mock.open).toHaveBeenCalledWith(value, expect.any(AbortSignal)); expect(Object.keys(value).sort()).toEqual(["copyVerifiedPdfBytes", "mime", "previewKind"]);
    expect(view.container.querySelector("iframe,object,embed,a[href]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    await waitFor(() => expect(opened.render).toHaveBeenLastCalledWith(expect.any(HTMLCanvasElement), 2, expect.any(AbortSignal)));
    view.unmount(); expect(opened.close).toHaveBeenCalled();
  });
  it("keeps a failed byte session held rather than falling back to browser PDF or a URL", async () => {
    mock.open.mockRejectedValue(new Error("verified bytes unavailable"));
    const view = render(<VerifiedPdfCanvas lease={lease()} title="Held synthetic PDF" />);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Безопасный предпросмотр PDF пока недоступен"));
    expect(screen.getByRole("img").className).toContain("hidden"); expect(view.container.querySelector("iframe,object,embed,a[href]")).toBeNull();
  });
  it("closes an obsolete learner session after a new lease wins the same view", async () => {
    let resolve!: (value: ReturnType<typeof session>) => void; const old = new Promise<ReturnType<typeof session>>(done => { resolve = done; });
    const fresh = session(); mock.open.mockReturnValueOnce(old).mockResolvedValueOnce(fresh);
    const view = render(<VerifiedPdfCanvas lease={lease()} title="A" />); view.rerender(<VerifiedPdfCanvas lease={lease()} title="B" />);
    await waitFor(() => expect(fresh.render).toHaveBeenCalled()); const stale = session(); await act(async () => { resolve(stale); });
    expect(stale.close).toHaveBeenCalledOnce(); expect(stale.render).not.toHaveBeenCalled(); expect(screen.getByRole("img").getAttribute("aria-label")).toBe("B · страница 1");
  });
});
