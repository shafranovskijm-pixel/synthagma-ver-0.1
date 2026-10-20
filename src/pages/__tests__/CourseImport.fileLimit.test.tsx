import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: { id: "synthetic-user" }, error: vi.fn(), invoke: vi.fn(), resolve: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn(), useSearchParams: () => [new URLSearchParams()] }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.user, userRole: "organization" }) }));
vi.mock("@/lib/courseImportScope", async original => ({
  ...await original<typeof import("@/lib/courseImportScope")>(), resolveCourseImportScope: mocks.resolve,
}));
vi.mock("@/utils/safeInvoke", () => ({ safeInvoke: mocks.invoke }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, warning: vi.fn() } }));
import CourseImport from "../CourseImport";

beforeEach(() => { vi.clearAllMocks(); mocks.resolve.mockResolvedValue({ organizationId: "org", source: "current_organization" }); });
afterEach(cleanup);
function fixture(bytes: number, name = "synthetic.txt") {
  const result = new File(["Synthetic text"], name, { type: "text/plain" });
  Object.defineProperty(result, "size", { value: bytes });
  return result;
}

describe("course import page uses the existing 30-MiB server file limit", () => {
  it("shows 30 MB and rejects one byte above it before parser invocation", async () => {
    render(<CourseImport />);
    expect(await screen.findByText(/старый DOC — Beta \(до 30 МБ\)/)).toBeInTheDocument();
    fireEvent.change(document.getElementById("file-input")!, { target: { files: [fixture(30 * 1024 * 1024 + 1)] } });
    expect(mocks.error).toHaveBeenCalledWith("Максимальный размер файла — 30 МБ");
    expect(screen.queryByText("synthetic.txt")).not.toBeInTheDocument();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("accepts the exact boundary without starting an import or expanding supported formats", async () => {
    render(<CourseImport />);
    await screen.findByText(/старый DOC — Beta \(до 30 МБ\)/);
    const input = document.getElementById("file-input")!;
    expect(input.getAttribute("accept")).toBe(".pptx,.doc,.docx,.txt,.html,.htm");
    fireEvent.change(input, { target: { files: [fixture(30 * 1024 * 1024)] } });
    expect(screen.getByText("synthetic.txt")).toBeInTheDocument();
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
