import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CourseFilePreviewReference } from "@/lib/courseFileConsumer";
const mocks = vi.hoisted(() => ({ organization: vi.fn(), dialog: vi.fn(), from: vi.fn(), allowDownload: true, url: null as string | null, kind: "program" }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "ordinary-staff" } }) }));
vi.mock("@/api/courseLibrary", () => ({ fetchCourseFileOrganization: mocks.organization }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/components/course-learning/FilePreviewDialog", () => ({ FilePreviewDialog: (props: unknown) => { mocks.dialog(props); return <div data-testid="authorized-manager-file-dialog" />; } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { CourseDocumentsManager } from "../CourseDocumentsManager";
interface DialogBoundary { reference: CourseFilePreviewReference; accessMode: string; initialPurpose: string; allowDownload: boolean }
function lastDialog(): DialogBoundary { return mocks.dialog.mock.calls.at(-1)![0] as DialogBoundary; }
beforeEach(() => {
  vi.clearAllMocks(); mocks.allowDownload = true; mocks.url = null; mocks.kind = "program";
  mocks.organization.mockResolvedValue("org-current");
  mocks.from.mockImplementation((table: string) => {
    if (table !== "course_documents") throw new Error("Unexpected table");
    let course = "";
    const query = { select: () => query, eq: (_column: string, value: string) => { course = value; return query; },
      order: async () => ({ data: [{ id: "target-" + course, course_id: course, name: "Программа.pdf", type: mocks.kind,
        description: null, file_url: mocks.url, created_at: "2026-10-28T00:00:00Z", allow_download: mocks.allowDownload }], error: null }) };
    return query;
  });
});
afterEach(cleanup);

describe("organization document stable file entry (no SQL/Auth execution)", () => {
  it("opens a frozen NULL-URL document with actual course organization and staff_preview mode", async () => {
    const view = render(<CourseDocumentsManager courseId="course-a" courseName="Курс А" embedded />);
    await screen.findByText("Программа.pdf"); fireEvent.click(screen.getByTitle("Просмотр"));
    expect(lastDialog()).toMatchObject({ accessMode: "staff_preview", initialPurpose: "preview", reference: { courseId: "course-a", organizationId: "org-current", referenceKind: "course_document", referenceId: "target-course-a", legacyUrl: null } });
    expect(view.container.querySelector("a[href],iframe,object,[src]")).toBeNull();
  });

  it("requests a distinct download purpose instead of creating a URL anchor", async () => {
    const view = render(<CourseDocumentsManager courseId="course-a" courseName="Курс А" embedded />);
    await screen.findByText("Программа.pdf"); fireEvent.click(screen.getByTitle("Скачать"));
    expect(lastDialog()).toMatchObject({ accessMode: "staff_preview", initialPurpose: "download", allowDownload: true });
    expect(view.container.querySelector("a[download],a[href]")).toBeNull();
  });

  it("does not enable download when current row metadata already forbids it", async () => {
    mocks.allowDownload = false;
    render(<CourseDocumentsManager courseId="course-a" courseName="Курс А" embedded />);
    await screen.findByText("Программа.pdf");
    expect(screen.getByTitle("Скачать")).toBeDisabled();
    fireEvent.click(screen.getByTitle("Просмотр"));
    expect(lastDialog().allowDownload).toBe(false);
  });

  it("does not navigate directly to a binding URN or revive the previous preview after course A→B→A", async () => {
    mocks.kind = "link"; mocks.url = "urn:sintagma:course-file-binding:target-course-a";
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const view = render(<CourseDocumentsManager courseId="course-a" courseName="Курс А" embedded />);
    await screen.findByText("Программа.pdf"); fireEvent.click(screen.getByTitle("Просмотр"));
    expect(lastDialog().reference.legacyUrl).toBe(mocks.url);
    expect(open).not.toHaveBeenCalled();
    view.rerender(<CourseDocumentsManager courseId="course-b" courseName="Курс Б" embedded />);
    view.rerender(<CourseDocumentsManager courseId="course-a" courseName="Курс А" embedded />);
    await waitFor(() => expect(screen.queryByTestId("authorized-manager-file-dialog")).toBeNull());
    open.mockRestore();
  });
});
