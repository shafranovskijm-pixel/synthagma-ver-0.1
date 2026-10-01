import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useTabNavigation } from "@/hooks/useTabNavigation";
import { useUrlNavigation, useUrlQueryState } from "@/hooks/useUrlNavigation";
import { useTariffCheckout } from "@/lib/organization/subscriptionNavigation";
import { studentDetailsPath } from "@/lib/groups/groupContext";

const settings = { showLibrary: true, showStats: true, showLinks: true, showDocuments: true, showServices: true, showLaborSafety: true };
function useWorkspace() {
  const nav = useTabNavigation({ isMobile: false, menuSettings: settings, isFrdoEnabled: true, isEnabled: () => true });
  const [department, setDepartment] = useUrlQueryState<string>("department", "all", undefined, { replace: true });
  const [participantSearch, setParticipantSearch] = useUrlQueryState<string>("participantSearch", "", undefined, { replace: true });
  return { ...nav, ...useUrlNavigation(), department, setDepartment, participantSearch, setParticipantSearch, location: useLocation(), navigate: useNavigate() };
}
const wrapper = (entries: Array<string | { pathname: string; state: unknown }>) => ({ children }: PropsWithChildren) => <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>{children}</MemoryRouter>;

describe("organization workspace browser history", () => {
  it("restores the same group, participants and filters after viewing a student", () => {
    const { result } = renderHook(useWorkspace, { wrapper: wrapper(["/organization?tab=group-folder&groupId=g1&groupView=members"]) });
    act(() => result.current.setDepartment("department:Учебный центр"));
    act(() => result.current.setParticipantSearch("Ученик"));
    const groupUrl = result.current.location.search;
    act(() => result.current.navigate(studentDetailsPath("s1", { groupId: "g1" })));
    expect(result.current.selectedStudentId).toBe("s1");
    expect(result.current.params.get("returnToGroupId")).toBe("g1");
    act(() => result.current.navigate(-1));
    expect(result.current.location.search).toBe(groupUrl);
    expect(result.current.params.get("groupView")).toBe("members");
    expect(result.current.department).toBe("department:Учебный центр");
    expect(result.current.participantSearch).toBe("Ученик");
    act(() => result.current.navigate(1));
    expect(result.current.selectedStudentId).toBe("s1");
  });

  it("does not add a blank course or duplicate workspace between screen transitions", () => {
    const { result } = renderHook(useWorkspace, { wrapper: wrapper(["/organization?tab=courses"]) });
    act(() => result.current.openCourseDetails("c1"));
    act(() => result.current.setActiveTab("courses"));
    act(() => result.current.setActiveTab("courses"));
    act(() => result.current.navigate(-1));
    expect(result.current.activeTab).toBe("course-details");
    expect(result.current.selectedCourseId).toBe("c1");
  });

  it.each(["ai-tutors", "webinars", "payments", "sales"])("normalizes legacy %s using replace so Back does not loop", (tab) => {
    const { result } = renderHook(useWorkspace, { wrapper: wrapper(["/organization?tab=students", `/organization?tab=${tab}`]) });
    act(() => result.current.navigate(-1));
    expect(result.current.activeTab).toBe("students");
    act(() => result.current.navigate(1));
    expect(result.current.activeTab).toBe(tab === "payments" ? "subscription" : tab === "sales" ? "home" : "courses");
  });

  it("consumes a legacy location.state tab without adding another history entry", () => {
    const { result } = renderHook(useWorkspace, { wrapper: wrapper(["/organization?tab=students", { pathname: "/organization", state: { tab: "courses" } }]) });
    expect(result.current.activeTab).toBe("courses");
    expect(result.current.location.state).toBeNull();
    act(() => result.current.navigate(-1));
    expect(result.current.activeTab).toBe("students");
  });

  it("closes checkout on Back and reopens its chosen plan on Forward", () => {
    const { result } = renderHook(() => ({ ...useTariffCheckout("start"), navigate: useNavigate() }), { wrapper: wrapper(["/organization?tab=subscription"]) });
    act(() => result.current.openCheckout("professional"));
    act(() => result.current.openCheckout("professional"));
    expect(result.current.open).toBe(true);
    act(() => result.current.navigate(-1));
    expect(result.current.open).toBe(false);
    act(() => result.current.navigate(1));
    expect(result.current.open).toBe(true);
    expect(result.current.plan).toBe("professional");
  });
});
