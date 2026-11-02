import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ upload: vi.fn(), insert: vi.fn(), error: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  storage: { from: () => ({ upload: mocks.upload }) },
  from: () => ({ select: () => { const query = { eq: () => query, order: () => query, then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }) }; return query; }, insert: mocks.insert }),
} }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: vi.fn() } }));
vi.mock("@/utils/storageHelpers", () => ({ openPrivateFile: vi.fn(), extractStoragePath: vi.fn() }));
import { StudentDocumentsUpload } from "./StudentDocumentsUpload";

describe("student document uploads", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.upload.mockResolvedValue({ error: null }); mocks.insert.mockResolvedValue({ error: null }); });
  afterEach(cleanup);
  it("handles a file selected before the click handler returns", async () => {
    const file = new File(["test"], "scan.pdf", { type: "application/pdf" });
    const { container } = render(<StudentDocumentsUpload userId="user" organizationId="org" isOpen onOpenChange={() => {}} embedded />);
    await screen.findAllByText("Загрузить");
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    vi.spyOn(input, "click").mockImplementation(() => { fireEvent.change(input, { target: { files: [file] } }); });
    fireEvent.click(screen.getAllByText("Загрузить")[0]);
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledOnce());
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ type: "passport", user_id: "user", organization_id: "org" }));
  });
  it("clears the file input after rejecting an oversized file", async () => {
    const { container } = render(<StudentDocumentsUpload userId="user" organizationId="org" isOpen onOpenChange={() => {}} embedded />);
    await screen.findAllByText("Загрузить");
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.click(screen.getAllByText("Загрузить")[0]);
    const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(mocks.error).toHaveBeenCalledWith("Файл слишком большой. Максимальный размер: 10 МБ");
    expect(input.value).toBe("");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
