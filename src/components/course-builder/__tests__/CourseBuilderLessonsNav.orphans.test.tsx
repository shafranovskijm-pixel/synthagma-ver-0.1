import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseBuilderLessonsNav } from "../CourseBuilderLessonsNav";
import type { CourseModule, Lesson } from "../LessonTypeConfig";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const lesson = (id: string, module_id?: string | null): Lesson => ({
  id, title: id, type: "text", content: "Synthetic QA text", expanded: false, module_id,
});
function show(lessons: Lesson[], modules: CourseModule[] = []) {
  const onLessonClick = vi.fn(), onCreateModule = vi.fn(), onToggleModuleCollapsed = vi.fn();
  render(<CourseBuilderLessonsNav
    lessons={lessons} modules={modules} activeLessonId={null} sensors={[]}
    onDragEnd={vi.fn()} onLessonClick={onLessonClick} onCreateModule={onCreateModule}
    onToggleModuleCollapsed={onToggleModuleCollapsed}
  />);
  return { onLessonClick, onCreateModule, onToggleModuleCollapsed };
}

describe("course builder preserves access to lessons without a loaded module", () => {
  it("opens a freshly imported lesson before any module exists or page reload", () => {
    const rows = [lesson("Fresh import")];
    const before = JSON.stringify(rows);
    const { onLessonClick, onCreateModule } = show(rows);
    fireEvent.click(screen.getByRole("button", { name: "Fresh import" }));
    expect(onLessonClick).toHaveBeenCalledExactlyOnceWith("Fresh import");
    expect(screen.queryByText("Создайте первый модуль")).not.toBeInTheDocument();
    expect(onCreateModule).not.toHaveBeenCalled();
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("shows unassigned and missing-module lessons once alongside existing module lessons", () => {
    const { onLessonClick } = show([
      lesson("Unassigned", null), lesson("Existing", "module-a"), lesson("Missing module", "not-loaded"),
    ], [{ id: "module-a", title: "Existing module", order_index: 0 }]);
    expect(screen.getByText("Без модуля")).toBeInTheDocument();
    for (const name of ["Unassigned", "Existing", "Missing module"]) {
      expect(screen.getAllByRole("button", { name })).toHaveLength(1);
    }
    fireEvent.click(screen.getByRole("button", { name: "Missing module" }));
    expect(onLessonClick).toHaveBeenCalledExactlyOnceWith("Missing module");
  });

  it("keeps the original empty-course guidance", () => {
    show([]);
    expect(screen.getByText("Создайте первый модуль")).toBeInTheDocument();
    expect(screen.queryByText("Без модуля")).not.toBeInTheDocument();
  });

  it("preserves module collapse and does not expose a collapsed module lesson as an orphan", () => {
    const { onToggleModuleCollapsed } = show(
      [lesson("Inside collapsed", "module-a")],
      [{ id: "module-a", title: "Existing module", order_index: 0, collapsed: true }],
    );
    expect(screen.queryByRole("button", { name: "Inside collapsed" })).not.toBeInTheDocument();
    expect(screen.queryByText("Без модуля")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Развернуть модуль" }));
    expect(onToggleModuleCollapsed).toHaveBeenCalledExactlyOnceWith("module-a");
  });
});

