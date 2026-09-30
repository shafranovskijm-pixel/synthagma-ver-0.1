import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { useState } from "react";
import { CourseStoreDetailView } from "../CourseStoreDetailView";
import { OrderDialog } from "../CourseStoreDialogs";
import { usePaidProgramDeepLink } from "@/hooks/usePaidProgramDeepLink";
import { PAID_PROGRAMS_20260922, getPaidProgram } from "@/constants/paidPrograms20260922";
import { loginWithNext, safeInternalNext } from "@/utils/authReturn";
import { resolveLoginDestination } from "@/utils/loginDestination";

vi.mock("../CourseComments", () => ({ CourseComments: () => null }));
vi.mock("@/api/courseReviewer", () => ({ fetchCourseReviewSnapshot: vi.fn() }));
const program = PAID_PROGRAMS_20260922[0];
const listing = {
  id: "paid-listing", course_id: program.courseId as string,
  price_organization: 44900, price_student: 0,
  course: { title: "Программа учебного центра", duration: "256 часов" },
};

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}
function Detail({ course = listing, userRole = "organization" }) {
  return <MemoryRouter><CourseStoreDetailView course={course} userRole={userRole} onBack={vi.fn()} onOrder={vi.fn()} /><LocationProbe /></MemoryRouter>;
}
function Ordering({ course = listing }) {
  const [count, setCount] = useState(1);
  return <OrderDialog open onOpenChange={vi.fn()} course={course} userRole="organization" studentsCount={count} setStudentsCount={setCount} orderNotes="" setOrderNotes={vi.fn()} isOrdering={false} onOrder={vi.fn()} />;
}

describe("paid UMK marketplace presentation", () => {
  it("uses the exact source IDs only", () => {
    expect(PAID_PROGRAMS_20260922).toHaveLength(25);
    expect(new Set(PAID_PROGRAMS_20260922.map((p) => p.courseId)).size).toBe(25);
    expect(getPaidProgram("not-a-paid-course")).toBeUndefined();
    expect(getPaidProgram(null)).toBeUndefined();
  });

  it("links the paid preview to its static B2B landing and removes certificate/urgency claims", () => {
    render(<Detail />);
    expect(screen.getByRole("link", { name: "Просмотр" })).toHaveAttribute("href", program.landingPath);
    expect(screen.getByText("Комплект для учебного центра")).toBeInTheDocument();
    expect(screen.queryByText("Удостоверение по завершении")).not.toBeInTheDocument();
    expect(screen.queryByText("Ограниченное предложение")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Приобрести комплект" })).toBeEnabled();
  });

  it("does not present the zero student placeholder as a free package purchase", () => {
    render(<Detail userRole="student" />);
    expect(screen.queryByText("БЕСПЛАТНО")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Приобрести комплект" })).toBeDisabled();
  });

  it("preserves the legacy preview and wording", () => {
    render(<Detail course={{ ...listing, course_id: "legacy-course" }} />);
    expect(screen.getByText("Удостоверение по завершении")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Просмотр" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/course-preview/legacy-course?from=store");
  });

  it("keeps legacy free courses free with their existing preview", () => {
    render(<Detail course={{ ...listing, course_id: "legacy-free-course", price_organization: 0, price_student: 0 }} />);
    expect(screen.getByText("БЕСПЛАТНО")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Получить курс" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Приобрести комплект" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Просмотр" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/course-preview/legacy-free-course?from=store");
  });

  it("keeps one package price when the planning count changes", () => {
    render(<Ordering />);
    fireEvent.change(screen.getByLabelText("Планируемое количество слушателей"), { target: { value: "20" } });
    const amount = (44900).toLocaleString().replace(/\s/g, " ");
    expect(screen.getAllByText(`${amount} ₽`)).toHaveLength(2);
    expect(screen.queryByText(`${(898000).toLocaleString().replace(/\s/g, " ")} ₽`)).not.toBeInTheDocument();
    expect(screen.getByText(/Стоимость комплекта не умножается/)).toBeInTheDocument();
  });

  it("leaves legacy order calculations unchanged", () => {
    render(<Ordering course={{ ...listing, course_id: "legacy-course" }} />);
    fireEvent.change(screen.getByLabelText("Количество студентов"), { target: { value: "2" } });
    expect(screen.getByText(`${(89800).toLocaleString().replace(/\s/g, " ")} ₽`)).toBeInTheDocument();
  });
});

const select = vi.fn();
const openCatalog = vi.fn();
function DeepLink({ loading = false, catalog = [listing] }: { loading?: boolean; catalog?: typeof listing[] }) {
  const result = usePaidProgramDeepLink({ catalog, isLoading: loading, organizationId: "buyer-org", onSelect: select, onOpenCatalog: openCatalog });
  return <><button onClick={result.clearRequestedCourse}>Назад</button><output>{result.unavailable ? "Недоступно" : "Готово"}</output><LocationProbe /></>;
}
beforeEach(() => { select.mockClear(); openCatalog.mockClear(); });

describe("paid-program deep link", () => {
  const path = `/organization?tab=services&course=${program.courseId}`;
  it("opens only the selected detail, never the order dialog, and clears the link on back", async () => {
    render(<MemoryRouter initialEntries={[path]}><DeepLink /></MemoryRouter>);
    await waitFor(() => expect(select).toHaveBeenCalledWith(listing));
    expect(select).toHaveBeenCalledTimes(1);
    expect(openCatalog).toHaveBeenCalledWith("catalog");
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/organization?tab=services");
    expect(screen.getByTestId("location")).not.toHaveTextContent("course=");
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("waits for the fetched catalog", () => {
    render(<MemoryRouter initialEntries={[path]}><DeepLink loading /></MemoryRouter>);
    expect(select).not.toHaveBeenCalled();
  });

  it("does not select an unavailable listing or an arbitrary legacy ID", () => {
    const first = render(<MemoryRouter initialEntries={[path]}><DeepLink catalog={[]} /></MemoryRouter>);
    expect(screen.getByText("Недоступно")).toBeInTheDocument();
    expect(select).not.toHaveBeenCalled();
    first.unmount();
    render(<MemoryRouter initialEntries={["/organization?tab=services&course=legacy-course"]}><DeepLink /></MemoryRouter>);
    expect(select).not.toHaveBeenCalled();
  });

  it("preserves tab and exact course through the authenticated login destination", async () => {
    const login = new URL(loginWithNext(path), "https://example.test");
    expect(login.pathname).toBe("/login");
    expect(safeInternalNext(login.searchParams.get("next"))).toBe(path);
    const destination = await resolveLoginDestination("buyer-user", "organization", login.searchParams.get("next"));
    expect(destination).toBe(path);
    render(<MemoryRouter initialEntries={[destination]}><DeepLink /></MemoryRouter>);
    await waitFor(() => expect(select).toHaveBeenCalledExactlyOnceWith(listing));
    expect(openCatalog).toHaveBeenCalledWith("catalog");
  });
});
