import type { PropsWithChildren } from "react";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useTabNavigation } from "@/hooks/useTabNavigation";

const settings = {
  showLibrary: true,
  showStats: true,
  showLinks: true,
  showDocuments: true,
  showServices: true,
  showLaborSafety: true,
};

function wrapper(entry: string) {
  return ({ children }: PropsWithChildren) => (
    <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>
  );
}

function useNavigation(isMobile = false) {
  const navigation = useTabNavigation({
    isMobile,
    menuSettings: settings,
    isFrdoEnabled: true,
    isEnabled: () => true,
  });
  const location = useLocation();
  return { ...navigation, search: location.search };
}

describe("useTabNavigation per-window state", () => {
  it("uses Home as the canonical start workspace and keeps Courses addressable", () => {
    const { result } = renderHook(() => useNavigation(), {
      wrapper: wrapper("/organization"),
    });

    expect(result.current.activeTab).toBe("home");
    expect(result.current.getVisibleTabs()[0]).toBe("home");

    act(() => result.current.setActiveTab("courses"));
    expect(result.current.activeTab).toBe("courses");
    expect(result.current.search).toBe("?tab=courses");
  });

  it("preserves account/catalogue workspaces and does not swipe unknown detail tabs to Home", () => {
    const { result } = renderHook(() => useNavigation(true), {
      wrapper: wrapper("/organization?tab=course-details&courseId=course-A"),
    });

    expect(result.current.getVisibleTabs()).toEqual(expect.arrayContaining([
      "payments",
      "subscription",
      "services",
    ]));

    act(() => result.current.handleSwipeLeft());
    expect(result.current.activeTab).toBe("course-details");
    expect(result.current.search).toBe("?tab=course-details&courseId=course-A");
  });

  it("derives independent entities from two separate router windows", () => {
    const left = renderHook(() => useNavigation(), {
      wrapper: wrapper("/organization?tab=student-details&studentId=student-A"),
    });
    const right = renderHook(() => useNavigation(), {
      wrapper: wrapper("/organization?tab=course-details&courseId=course-B"),
    });

    expect(left.result.current.activeTab).toBe("student-details");
    expect(left.result.current.selectedStudentId).toBe("student-A");
    expect(left.result.current.selectedCourseId).toBeNull();
    expect(right.result.current.activeTab).toBe("course-details");
    expect(right.result.current.selectedCourseId).toBe("course-B");
    expect(right.result.current.selectedStudentId).toBeNull();

    act(() => left.result.current.openCourseDetails("course-A2"));
    expect(left.result.current.activeTab).toBe("course-details");
    expect(left.result.current.selectedCourseId).toBe("course-A2");
    expect(right.result.current.selectedCourseId).toBe("course-B");
  });

  it("clears a company entity when the same top-level sidebar workspace is selected", () => {
    const { result } = renderHook(() => useNavigation(), {
      wrapper: wrapper("/organization?tab=organizations&companyId=company-A"),
    });

    act(() => result.current.setActiveTab("organizations"));
    expect(result.current.activeTab).toBe("organizations");
    expect(result.current.search).toBe("?tab=organizations");
  });

  it("cleans unrelated entity state before opening another workspace record", () => {
    const { result } = renderHook(() => useNavigation(), {
      wrapper: wrapper(
        "/organization?tab=organizations&companyId=company-A&studentId=student-A&groupId=group-A&folder=docs&returnToGroupId=group-A&groupSettings=1",
      ),
    });

    act(() => result.current.openCourseDetails("course-B"));
    expect(result.current.search).toBe("?tab=course-details&courseId=course-B");

    act(() => result.current.openGroupFolder("group-B"));
    expect(result.current.search).toBe("?tab=group-folder&studentsView=groups&groupId=group-B");
  });
});
