import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

const testState = vi.hoisted(() => ({
  courses: [] as Array<{ id: string; title: string; is_published: boolean; system_key?: string | null }>,
  studentTotal: 0,
  enrollmentCount: 0,
  documentCount: 0,
  groupIds: ["group-1"] as string[],
  documentGroupIds: [] as string[],
  setActiveTab: vi.fn(),
  openCourseDetails: vi.fn(),
  setShowAddStudentDialog: vi.fn(),
  checkLimit: vi.fn(() => ({ allowed: true, message: "" })),
}));

vi.mock("@/contexts/OrgDashboardContext", () => ({
  useOrgDashboard: () => ({
    organizationId: "org-1",
    courses: testState.courses,
    isLoadingCourses: false,
    branding: { brandingSettings: { logoUrl: null } },
    subscriptionLimits: { plan: "free" },
    tabNavigation: {
      setActiveTab: testState.setActiveTab,
      openCourseDetails: testState.openCourseDetails,
    },
    studentManagement: {
      setShowAddStudentDialog: testState.setShowAddStudentDialog,
    },
    checkLimit: testState.checkLimit,
  }),
}));

vi.mock("@/api/students", () => ({
  fetchOrganizationStudentsCounts: vi.fn(async () => ({
    active_count: testState.studentTotal,
    archived_count: 0,
    total_count: testState.studentTotal,
  })),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const result = () => ({
        count: table === "enrollments" ? testState.enrollmentCount : testState.documentCount,
        data: table === "student_groups"
          ? testState.groupIds.map((id) => ({ id }))
          : table === "group_documents"
            ? testState.documentGroupIds.map((group_id) => ({ group_id }))
            : null,
        error: null,
      });
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        neq: () => builder,
        in: () => builder,
        limit: () => builder,
        maybeSingle: () => Promise.resolve(result()),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(result()).then(resolve, reject),
      };
      return builder;
    },
  },
}));

import { QuickStartCard } from "@/components/organization/QuickStartCard";
import { SYSTEM_WELCOME_COURSE_KEY } from "@/lib/organization/firstRun";

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location-probe">{location.pathname}{location.search}</span>;
}

function renderCard() {
  return render(
    <MemoryRouter initialEntries={["/organization"]}>
      <QuickStartCard />
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  testState.courses = [];
  testState.studentTotal = 0;
  testState.enrollmentCount = 0;
  testState.documentCount = 0;
  testState.groupIds = ["group-1"];
  testState.documentGroupIds = [];
  testState.setActiveTab.mockReset();
  testState.openCourseDetails.mockReset();
  testState.setShowAddStudentDialog.mockReset();
  testState.checkLimit.mockReset();
  testState.checkLimit.mockReturnValue({ allowed: true, message: "" });
});

describe("QuickStartCard — первый рабочий цикл организации", () => {
  it("не считает системный welcome-course собственным и раскрывает только создание курса", async () => {
    testState.courses = [
      {
        id: "welcome",
        title: "Приветственный курс с изменённым названием",
        system_key: SYSTEM_WELCOME_COURSE_KEY,
        is_published: true,
      },
    ];
    const courseEvents: Event[] = [];
    const onCourse = (event: Event) => courseEvents.push(event);
    window.addEventListener("org-create-course", onCourse);

    renderCard();

    expect(await screen.findByTestId("quickstart-step-course")).toBeInTheDocument();
    expect(screen.getByText("Первый запуск")).toBeInTheDocument();
    expect(screen.getByTestId("quickstart-step-course")).toHaveAttribute("data-step-state", "current");
    expect(screen.getByTestId("quickstart-step-student")).toHaveAttribute("data-step-state", "upcoming");
    expect(screen.getAllByTestId("quickstart-primary-action")).toHaveLength(1);
    expect(screen.getByTestId("quickstart-primary-action")).toHaveTextContent("Создать курс");

    fireEvent.click(screen.getByTestId("quickstart-primary-action"));
    expect(testState.setActiveTab).toHaveBeenCalledWith("courses");
    await waitFor(() => expect(courseEvents).toHaveLength(1));
    window.removeEventListener("org-create-course", onCourse);
  });

  it("не открывает создание курса при исчерпанном тарифном лимите", async () => {
    testState.checkLimit.mockReturnValue({ allowed: false, message: "Лимит курсов исчерпан" });
    const courseEvents: Event[] = [];
    const onCourse = (event: Event) => courseEvents.push(event);
    window.addEventListener("org-create-course", onCourse);

    renderCard();
    fireEvent.click(await screen.findByTestId("quickstart-primary-action"));

    expect(testState.checkLimit).toHaveBeenCalledWith("course");
    expect(testState.setActiveTab).not.toHaveBeenCalled();
    expect(courseEvents).toHaveLength(0);
    window.removeEventListener("org-create-course", onCourse);
  });

  it("разделяет добавленного ученика и зачисление и ведёт в собственный курс", async () => {
    testState.courses = [{ id: "course-1", title: "Охрана труда", is_published: true }];
    testState.studentTotal = 1;
    testState.enrollmentCount = 0;

    renderCard();

    await waitFor(() =>
      expect(screen.getByTestId("quickstart-step-enrollment")).toHaveAttribute(
        "data-step-state",
        "current",
      ),
    );
    expect(screen.getByTestId("quickstart-step-course")).toHaveAttribute("data-step-state", "done");
    expect(screen.getByTestId("quickstart-step-student")).toHaveAttribute("data-step-state", "done");
    expect(screen.getAllByTestId("quickstart-primary-action")).toHaveLength(1);

    fireEvent.click(screen.getByTestId("quickstart-primary-action"));
    expect(testState.openCourseDetails).toHaveBeenCalledWith("course-1");
  });

  it("после зачисления делает документы текущим шагом и оставляет настройки вторичными", async () => {
    testState.courses = [{ id: "course-1", title: "Охрана труда", is_published: true }];
    testState.studentTotal = 1;
    testState.enrollmentCount = 1;
    testState.documentCount = 0;

    renderCard();

    await waitFor(() =>
      expect(screen.getByTestId("quickstart-step-documents")).toHaveAttribute(
        "data-step-state",
        "current",
      ),
    );
    expect(screen.getByTestId("quickstart-primary-action")).toHaveTextContent("Открыть документы группы");
    fireEvent.click(screen.getByTestId("quickstart-primary-action"));
    expect(screen.getByTestId("location-probe")).toHaveTextContent(
      "/organization?tab=group-folder&studentsView=groups&groupId=group-1&folder=docs",
    );

    expect(screen.getByText("Можно сделать позже")).toBeInTheDocument();
    expect(screen.getByTestId("quickstart-later-logo")).toBeInTheDocument();
    expect(screen.getByTestId("quickstart-later-staff")).toBeInTheDocument();
    expect(screen.getByTestId("quickstart-plan")).toHaveAttribute(
      "href",
      "/organization?tab=subscription",
    );
  });

  it("скрывается, когда все четыре обязательных шага подтверждены", async () => {
    testState.courses = [{ id: "course-1", title: "Охрана труда", is_published: true }];
    testState.studentTotal = 1;
    testState.enrollmentCount = 1;
    testState.documentCount = 1;
    testState.documentGroupIds = ["group-1"];

    renderCard();

    await waitFor(() => expect(screen.queryByText("Первый запуск")).not.toBeInTheDocument());
  });

  it("проверяет документы во всех подходящих группах, а не только в первой", async () => {
    testState.courses = [{ id: "course-1", title: "Охрана труда", is_published: true }];
    testState.studentTotal = 1;
    testState.enrollmentCount = 1;
    testState.groupIds = ["group-1", "group-2"];
    testState.documentCount = 1;
    testState.documentGroupIds = ["group-2"];

    renderCard();

    await waitFor(() => expect(screen.queryByText("Первый запуск")).not.toBeInTheDocument());
  });
});
