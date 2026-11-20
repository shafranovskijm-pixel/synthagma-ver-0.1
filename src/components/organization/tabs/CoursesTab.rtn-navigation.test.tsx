import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CoursesTab } from "./CoursesTab";

const courseApi = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn(), refetch: vi.fn() }));
vi.mock("@/api/courseDeletion", () => ({ deleteUnusedCourses: courseApi.remove }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn(), functions: { invoke: vi.fn() } } }));
vi.mock("@/contexts/OrgDashboardContext", () => ({ useOrgDashboard: () => ({
  courses: [], categories: [], isLoadingCourses: false, hasCourseOverviewData: true,
  user: { id: "actor-a" }, isAdminView: false,
  dashboardSettings: { menuSettings: { courseViewMode: "grid", courseFolderMode: "folders" }, setMenuSettings: vi.fn() },
  tabNavigation: { setActiveTab: vi.fn() },
}) }));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => ({ can: () => true }) }));
vi.mock("@/hooks/useSubscriptionLimits", () => ({ useSubscriptionLimits: () => ({ checkLimit: () => ({ allowed: true }), hasCourseSettings: true, loading: false, refetch: courseApi.refetch }) }));
vi.mock("@/hooks/useCourses", () => ({ useCourses: () => ({
  courses: [], categories: [], isLoading: false, error: null, filter: "all", setFilter: vi.fn(),
  categoryFilter: "all", setCategoryFilter: vi.fn(), searchQuery: "", setSearchQuery: vi.fn(),
  viewMode: "grid", setViewMode: vi.fn(), filteredCourses: [], create: courseApi.create, update: courseApi.update,
  duplicate: vi.fn(), createCat: vi.fn(), updateCat: vi.fn(), removeCat: vi.fn(), refresh: vi.fn(),
  updateCourseLocally: vi.fn(), reorderCourses: vi.fn(),
}) }));
vi.mock("@/lib/organization/firstRun", () => ({ hasOrganizationCourse: () => true, isSystemWelcomeCourse: () => false }));
vi.mock("./courses/CoursesToolbar", () => ({ CoursesToolbar: () => <div>Обычные фильтры курсов</div> }));
vi.mock("./courses/CoursesEmptyState", () => ({ CoursesEmptyState: () => <p>Обычный список курсов</p> }));
vi.mock("./courses/CourseListRow", () => ({ SortableCourseListRow: () => null }));
vi.mock("./courses/CourseCardView", () => ({ CourseCard: () => null }));
vi.mock("./courses/CourseCatalogCard", () => ({ CourseCatalogCard: () => null }));
vi.mock("./courses/CategoryFolder", () => ({ CategoryFolder: () => null }));
vi.mock("./courses/CourseDialogs", () => ({ CategoryDialog: () => null, CreateCourseDialog: () => null, MoveCourseDialog: () => null, BulkDeleteDialog: () => null }));
vi.mock("@/components/organization/dialogs/TransferCourseDialog", () => ({ TransferCourseDialog: () => null }));
vi.mock("../rtn/RostechnadzorWorkspace", () => ({ RostechnadzorWorkspace: ({ navigation, onNavigate }: {
  navigation: { view: string; bankId: string | null; eventId: string | null; invalidTarget: boolean };
  onNavigate: (target: { view: "sources" }) => void;
}) => <section aria-label="Проверяемое подключение Ростехнадзора"><output data-testid="rtn-state">{JSON.stringify(navigation)}</output><button onClick={() => onNavigate({ view: "sources" })}>К источникам из программы</button></section> }));

function RouteProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-testid="route">{location.pathname}{location.search}</output><button onClick={() => navigate(-1)}>Назад в браузере</button></>;
}
function mount(url: string) {
  return render(<MemoryRouter initialEntries={[url]}><RouteProbe /><CoursesTab organizationId="org-a" /></MemoryRouter>);
}
function selectTab(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0, ctrlKey: false });
}
afterEach(cleanup);

describe("CoursesTab RTN URL integration", () => {
  it("opens a canonical RTN link on its exact section and bank rather than the ordinary course list", () => {
    const bankId = "b5772345-904c-4aba-bf73-d6105b29e532";
    mount(`/organization?tab=courses&courseWorkspace=rtn&rtnView=sources&rtnBankId=${bankId}&courseSearch=keep`);
    expect(screen.getByRole("tab", { name: "Ростехнадзор" })).toHaveAttribute("aria-selected", "true");
    expect(JSON.parse(screen.getByTestId("rtn-state").textContent!)).toMatchObject({ workspace: "rtn", view: "sources", bankId, invalidTarget: false });
    expect(screen.getByText("Обычный список курсов")).not.toBeVisible();
  });

  it("keeps the generic course URL in My courses and does not mount RTN", () => {
    mount("/organization?tab=courses&courseSearch=keep");
    expect(screen.getByRole("tab", { name: "Мои курсы" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Обычный список курсов")).toBeVisible();
    expect(screen.queryByTestId("rtn-state")).not.toBeInTheDocument();
  });

  it("preserves unrelated display parameters across view changes, clears old detail IDs and supports browser Back", () => {
    mount("/organization?tab=courses&courseWorkspace=rtn&rtnView=changes&rtnEventId=5fca3c7a-6f03-439c-b719-84a7b2065ef0&courseSearch=keep");
    fireEvent.click(screen.getByRole("button", { name: "К источникам из программы" }));
    const sourceUrl = new URL(screen.getByTestId("route").textContent!, "https://sintagma.invalid");
    expect(sourceUrl.searchParams.get("rtnView")).toBe("sources");
    expect(sourceUrl.searchParams.get("courseSearch")).toBe("keep");
    expect(sourceUrl.searchParams.has("rtnEventId")).toBe(false);
    selectTab("Мои курсы");
    expect(screen.getByText("Обычный список курсов")).toBeVisible();
    expect(screen.getByTestId("route")).toHaveTextContent("courseSearch=keep");
    expect(screen.getByTestId("route")).not.toHaveTextContent("courseWorkspace");
    fireEvent.click(screen.getByRole("button", { name: "Назад в браузере" }));
    expect(screen.getByRole("tab", { name: "Ростехнадзор" })).toHaveAttribute("aria-selected", "true");
    expect(JSON.parse(screen.getByTestId("rtn-state").textContent!)).toMatchObject({ view: "sources", eventId: null });
    fireEvent.click(screen.getByRole("button", { name: "Назад в браузере" }));
    expect(JSON.parse(screen.getByTestId("rtn-state").textContent!)).toMatchObject({ view: "changes", eventId: "5fca3c7a-6f03-439c-b719-84a7b2065ef0" });
  });

  it("does not reuse an invalid target and leaves ordinary course handlers untouched", () => {
    mount("/organization?tab=courses&courseWorkspace=rtn&rtnView=changes&rtnEventId=not-a-uuid");
    expect(JSON.parse(screen.getByTestId("rtn-state").textContent!)).toMatchObject({ view: "training", bankId: null, eventId: null, invalidTarget: true });
    expect(courseApi.create).not.toHaveBeenCalled();
    expect(courseApi.update).not.toHaveBeenCalled();
    expect(courseApi.remove).not.toHaveBeenCalled();
  });

  it("explains an unknown course workspace without selecting a stale RTN subject", () => {
    mount("/organization?tab=courses&courseWorkspace=unknown&rtnBankId=b5772345-904c-4aba-bf73-d6105b29e532");
    expect(screen.getByText(/Ссылка на раздел курсов некорректна/)).toHaveAttribute("role", "status");
    expect(screen.getByRole("tab", { name: "Мои курсы" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByTestId("rtn-state")).not.toBeInTheDocument();
  });
});
