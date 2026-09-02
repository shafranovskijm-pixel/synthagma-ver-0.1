import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CourseSidebarContent } from "@/components/course-learning/CourseSidebar";

describe("CourseSidebarContent electronic library entry", () => {
  it("shows the library button and invokes its callback", () => {
    const onOpenLibrary = vi.fn();
    const onNavigate = vi.fn();

    render(
      <CourseSidebarContent
        courseTitle="Пожарная безопасность"
        lessons={[]}
        currentLessonIndex={0}
        completedCount={0}
        progressPercent={0}
        getLessonIcon={() => null}
        isLessonCompleted={() => false}
        isLessonAccessible={() => true}
        goToLesson={vi.fn()}
        resetCourseProgress={vi.fn()}
        onNavigateBack={vi.fn()}
        onNavigate={onNavigate}
        onOpenLibrary={onOpenLibrary}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Электронная библиотека" }));

    expect(onOpenLibrary).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
