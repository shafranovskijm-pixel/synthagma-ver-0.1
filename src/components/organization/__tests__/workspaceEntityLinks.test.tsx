import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { CourseCatalogCard } from "@/components/organization/tabs/courses/CourseCatalogCard";
import { CourseCard } from "@/components/organization/tabs/courses/CourseCardView";
import { StudentMobileCard } from "@/components/organization/tabs/students/StudentMobileCard";
import { StudentTableRow } from "@/components/organization/tabs/students/StudentTableRow";
import type { Course, Student } from "@/types";

const course = {
  id: "course-1",
  title: "Курс 1",
  description: "Описание",
  is_published: false,
  organization_id: "org-1",
  category_id: null,
  lessonsCount: 0,
  studentsCount: 0,
} as Course;

const student = {
  id: "profile-1",
  user_id: "student-1",
  name: "Ученик 1",
  full_name: "Ученик 1",
  email: "student@example.test",
  status: "active",
} as unknown as Student;

function preventJsdomNavigation(link: HTMLElement) {
  link.addEventListener("click", (event) => event.preventDefault());
}

describe("organization entity workspace links", () => {
  it("keeps a native course deep link for modified clicks in catalog view", () => {
    const onCourseClick = vi.fn();
    render(
      <CourseCatalogCard
        course={course}
        onCourseClick={onCourseClick}
        onDuplicate={vi.fn()}
        onCoverUpload={vi.fn()}
        onGenerateCover={vi.fn()}
        generatingCoverForCourse={null}
        getCategoryById={() => undefined}
      />,
    );

    const link = screen.getByRole("link", { name: "Курс 1" });
    expect(link).toHaveAttribute("href", "/organization?tab=course-details&courseId=course-1");
    preventJsdomNavigation(link);
    fireEvent.click(link, { ctrlKey: true });
    expect(onCourseClick).not.toHaveBeenCalled();
    fireEvent.click(link);
    expect(onCourseClick).toHaveBeenCalledWith(course);
  });

  it("provides the same canonical course link in compact folder view", () => {
    const onCourseClick = vi.fn();
    render(
      <MemoryRouter>
        <CourseCard
          course={course}
          compact
          isSelected={false}
          onToggleSelect={vi.fn()}
          onCourseClick={onCourseClick}
          onToggleSetting={vi.fn()}
          onDuplicate={vi.fn()}
          onMove={vi.fn()}
        />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: "Курс 1" });
    expect(link).toHaveAttribute("href", "/organization?tab=course-details&courseId=course-1");
    preventJsdomNavigation(link);
    fireEvent.click(link, { metaKey: true });
    expect(onCourseClick).not.toHaveBeenCalled();
  });

  it("keeps a native student deep link instead of shared local state", () => {
    const onViewStudent = vi.fn();
    render(
      <StudentMobileCard
        student={student}
        isSelected={false}
        onToggleSelection={vi.fn()}
        onViewStudent={onViewStudent}
        onCopyCredentials={vi.fn()}
      />,
    );

    const link = screen.getByRole("link", { name: "Ученик 1" });
    expect(link).toHaveAttribute("href", "/organization?tab=student-details&studentId=student-1");
    preventJsdomNavigation(link);
    fireEvent.click(link, { ctrlKey: true });
    expect(onViewStudent).not.toHaveBeenCalled();
  });

  it("keeps the student deep link in the desktop table row", () => {
    const onViewStudent = vi.fn();
    render(
      <table><tbody><StudentTableRow
        student={student}
        isSelected={false}
        onToggleSelection={vi.fn()}
        onViewStudent={onViewStudent}
        onCopyCredentials={vi.fn()}
        onRemoveStudent={vi.fn()}
        frdoStatus={new Map()}
        studentGroups={[]}
        studentGroupMap={new Map()}
        onAssignGroup={vi.fn()}
      /></tbody></table>,
    );

    const link = screen.getByRole("link", { name: "Ученик 1" });
    expect(link).toHaveAttribute("href", "/organization?tab=student-details&studentId=student-1");
    preventJsdomNavigation(link);
    fireEvent.click(link, { metaKey: true });
    expect(onViewStudent).not.toHaveBeenCalled();
    fireEvent.click(link);
    expect(onViewStudent).toHaveBeenCalledTimes(1);
  });
});
