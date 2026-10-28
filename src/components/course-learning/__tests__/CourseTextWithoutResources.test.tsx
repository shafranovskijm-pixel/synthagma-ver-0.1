import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CourseTextWithoutResources } from "../CourseTextWithoutResources";
import { LessonAttachments } from "../LessonAttachments";
afterEach(cleanup);
describe("held text and stable attachment metadata", () => {
  it("keeps text/table numbers and never mounts HTML resource loads or relinkified URLs", () => {
    const content = JSON.stringify([{ id: "text", type: "paragraph", content: '<p>Число 42 <a href="/secret">источник</a><img src="/secret"><span style="background:url(/secret)">текст</span> https://private.example/raw</p>' }, { id: "table", type: "table", content: "", tableRows: [["Параметр", "Значение"], ["Вес", "25"]], tableHasHeader: true }]);
    const view = render(<CourseTextWithoutResources content={content} />); expect(screen.getByText("25")).toBeTruthy(); expect(screen.getByRole("table")).toBeTruthy();
    expect(view.container.querySelector("[src],[href],[style],iframe,object,embed,svg")).toBeNull(); expect(view.container.textContent).toContain("42");
  });
  it("holds relative/URN media blocks before generic rendering", () => {
    const content = JSON.stringify([{ id: "file", type: "document", content: "", documentUrl: "urn:bound" }, { id: "video", type: "video", content: "", videoUrl: "/relative" }, { id: "slider", type: "slider", content: "", sliderSlides: [{ id: "slide", content: "", imageUrl: "/image" }] }]);
    const view = render(<CourseTextWithoutResources content={content} />); expect(screen.getAllByRole("status")).toHaveLength(3); expect(view.container.querySelector("[src],[href],iframe,video,audio")).toBeNull();
  });
  it("emits the exact target reference even when a frozen row has NULL URL", () => {
    const onPreview = vi.fn(); render(<LessonAttachments attachments={[{ id: "target-id", course_id: "course", organization_id: "org", lesson_id: "lesson", module_id: "module", reference_kind: "lesson_attachment", name: "Лекция.pdf", file_url: null, file_type: "pdf", file_size: 50, category: "lecture", visible_to_students: true, allow_download: false }]} onPreview={onPreview} />);
    fireEvent.click(screen.getByRole("button")); expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ referenceId: "target-id", referenceKind: "lesson_attachment", courseId: "course", organizationId: "org", legacyUrl: null }), false);
  });
});
