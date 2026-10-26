import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import fixtureJson from "./fixtures/materialSource.json?raw";
import scopeJson from "../../src/data/platformCoursePassportScope20261026.json?raw";
import { passportPort } from "./ports";
import { CourseMaterialPassportCard } from "../../src/components/organization/CourseMaterialPassportCard";
import { CourseStoreDetailView } from "../../src/components/organization/CourseStoreDetailView";
import { courseMaterialPassports, findCourseMaterialPassport } from "../../src/lib/courseMaterialPassport";

const source = JSON.parse(fixtureJson);
const context = { revision: 1 };
const actorId = "10000000-0000-4000-8000-000000000001";
const passport = findCourseMaterialPassport(source.course_id)!;
const other = courseMaterialPassports.find(row => row.courseId !== source.course_id)!;
const unlistedPlatformId = JSON.parse(scopeJson).courseIds.find((id: string) => !courseMaterialPassports.some(row => row.courseId === id));
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
const ownership = (id: string) => ({ data: { id, organization_id: "4ac2c05a-d8b5-4e72-ba31-f2c743091d95" }, error: null });
beforeEach(() => {
  passportPort.calls.length = 0;
  passportPort.read = async request => request.table === "courses" ? ownership(request.id) : ({ data: source, error: null });
});
afterEach(cleanup);

describe("read-only course material passport card", () => {
  it("shows declared facts only after exact source verification and retains unknown approvals", async () => {
    const read = deferred<{ data: unknown; error: unknown }>();
    passportPort.read = async request => request.table === "courses" ? ownership(request.id) : read.promise;
    render(<CourseMaterialPassportCard courseId={source.course_id} context={context} actorId={actorId} />);
    await screen.findByText("Проверка источника…");
    expect(screen.queryByText(passport.sourceDeclared.fullTitle)).toBeNull();
    await act(async () => { read.resolve({ data: source, error: null }); await read.promise; });
    await screen.findByText("Материал источника сверён");
    fireEvent.click(screen.getByRole("button", { name: "Заявленные результаты" }));
    expect(screen.getByText(passport.sourceDeclared.outcomes[0])).toBeTruthy();
    expect(screen.getByText(/Выдаваемый документ, автор, права на материалы, методист и утверждение фактов: не подтверждены/)).toBeTruthy();
    expect(passportPort.calls).toEqual([
      { table: "courses", columns: "id,organization_id", field: "id", id: source.course_id },
      { table: "lessons", columns: "id,content,course_id", field: "id", id: source.id },
      { table: "courses", columns: "id,organization_id", field: "id", id: source.course_id },
    ]);
  });
  it("hides frozen outcomes and plan when the live HTML has changed", async () => {
    passportPort.read = async request => request.table === "courses" ? ownership(request.id) : ({ data: { ...source, content: source.content + "\n" }, error: null });
    render(<CourseMaterialPassportCard courseId={source.course_id} context={context} actorId={actorId} />);
    await screen.findByText(/Сведения не подтверждены:/);
    expect(screen.queryByText("Материал источника сверён")).toBeNull();
    expect(screen.queryByRole("button", { name: "Заявленные результаты" })).toBeNull();
    expect(screen.queryByText(passport.sourceDeclared.purpose)).toBeNull();
  });
  it("uses a clear unconfirmed state for denied or missing source without exposing raw errors", async () => {
    passportPort.read = async request => request.table === "courses" ? ownership(request.id) : ({ data: null, error: { message: "SYNTHETIC_PRIVATE_INTERNAL_ERROR" } });
    const view = render(<CourseMaterialPassportCard courseId={source.course_id} context={context} actorId={actorId} />);
    await screen.findByText(/Сведения не подтверждены:/);
    expect(screen.queryByText(/SYNTHETIC_PRIVATE_INTERNAL_ERROR/)).toBeNull();
    view.unmount();
    passportPort.read = async request => request.table === "courses" ? ownership(request.id) : ({ data: null, error: null });
    render(<CourseMaterialPassportCard courseId={source.course_id} context={context} actorId={actorId} />);
    await screen.findByText(/Сведения не подтверждены:/);
    expect(screen.queryByText("Материал источника сверён")).toBeNull();
  });
  it("shows explicit unknown for a currently platform-owned ID without a prepared passport and does not query lessons", async () => {
    expect(unlistedPlatformId).toBeTruthy();
    render(<CourseMaterialPassportCard courseId={unlistedPlatformId} context={context} actorId={actorId} />);
    await screen.findByText(/Сведения не подтверждены:/);
    expect(passportPort.calls.map(row => row.table)).toEqual(["courses"]);
  });
  it("never shows the card or reads a source for a customer copy sharing a platform title or source_course", () => {
    const course = { id: "10000000-0000-4000-8000-000000000098", course_id: "10000000-0000-4000-8000-000000000099", source_course_id: source.course_id,
      course: { title: passport.sourceDeclared.fullTitle, source_course_id: source.course_id }, organization: { name: "Synthetic customer" }, price_organization: 0, price_student: 0 };
    render(<MemoryRouter><CourseStoreDetailView course={course} userRole="organization" onBack={() => {}} onOrder={() => {}} /></MemoryRouter>);
    expect(screen.queryByText("Паспорт по материалам курса")).toBeNull();
    expect(passportPort.calls).toHaveLength(0);
    expect(screen.getByText(passport.sourceDeclared.fullTitle)).toBeTruthy();
  });
  it("ignores an old course read after switching context and never displays the old facts", async () => {
    const first = deferred<{ data: unknown; error: unknown }>();
    const second = deferred<{ data: unknown; error: unknown }>();
    passportPort.read = async request => request.table === "courses" ? ownership(request.id) : request.id === source.id ? first.promise : second.promise;
    const view = render(<CourseMaterialPassportCard courseId={source.course_id} context={context} actorId={actorId} />);
    await screen.findByText("Проверка источника…");
    view.rerender(<CourseMaterialPassportCard courseId={other.courseId} context={context} actorId={actorId} />);
    await screen.findByText("Проверка источника…");
    await act(async () => { first.resolve({ data: source, error: null }); await first.promise; });
    expect(screen.queryByText("Материал источника сверён")).toBeNull();
    expect(screen.queryByText(passport.sourceDeclared.fullTitle)).toBeNull();
    expect(screen.getByText("Проверка источника…")).toBeTruthy();
    await act(async () => { second.resolve({ data: null, error: null }); await second.promise; });
    await screen.findByText(/Сведения не подтверждены:/);
  });
  it("does not mount the card or read lesson content when current platform ownership is lost or cannot be proved", async () => {
    for (const response of [
      { data: { id: source.course_id, organization_id: "10000000-0000-4000-8000-000000000099" }, error: null },
      { data: null, error: null },
      { data: null, error: { message: "SYNTHETIC_OWNERSHIP_RLS" } },
    ]) {
      passportPort.calls.length = 0;
      passportPort.read = async () => response;
      const view = render(<CourseMaterialPassportCard courseId={source.course_id} context={context} actorId={actorId} />);
      await act(async () => { await Promise.resolve(); });
      expect(screen.queryByText("Паспорт по материалам курса")).toBeNull();
      expect(passportPort.calls.map(row => row.table)).toEqual(["courses"]);
      view.unmount();
    }
  });
  it("does not publish matching source facts if ownership is lost while the lesson read or hash is pending", async () => {
    const lesson = deferred<{ data: unknown; error: unknown }>();
    let ownershipReads = 0;
    passportPort.read = async request => {
      if (request.table === "lessons") return lesson.promise;
      ownershipReads += 1;
      return ownershipReads === 1 ? ownership(request.id) : {
        data: { id: request.id, organization_id: "10000000-0000-4000-8000-000000000099" }, error: null,
      };
    };
    render(<CourseMaterialPassportCard courseId={source.course_id} context={context} actorId={actorId} />);
    await screen.findByText("Проверка источника…");
    await act(async () => { lesson.resolve({ data: source, error: null }); await lesson.promise; });
    await waitFor(() => expect(ownershipReads).toBe(2));
    await waitFor(() => expect(screen.queryByText("Паспорт по материалам курса")).toBeNull());
    expect(screen.queryByText("Материал источника сверён")).toBeNull();
    expect(screen.queryByText(passport.sourceDeclared.fullTitle)).toBeNull();
  });
  it("hides prior facts immediately and rechecks ownership for a new same-ID course object or actor", async () => {
    const firstContext = { revision: 1 }, nextContext = { revision: 2 };
    const view = render(<CourseMaterialPassportCard courseId={source.course_id} context={firstContext} actorId={actorId} />);
    await screen.findByText("Материал источника сверён");
    const contextRead = deferred<{ data: unknown; error: unknown }>();
    passportPort.read = async request => request.table === "courses" ? contextRead.promise : { data: source, error: null };
    view.rerender(<CourseMaterialPassportCard courseId={source.course_id} context={nextContext} actorId={actorId} />);
    expect(screen.queryByText("Паспорт по материалам курса")).toBeNull();
    expect(screen.queryByText(passport.sourceDeclared.fullTitle)).toBeNull();
    await act(async () => { contextRead.resolve(ownership(source.course_id)); await contextRead.promise; });
    await screen.findByText("Материал источника сверён");
    const lessonReadsBeforeActorChange = passportPort.calls.filter(row => row.table === "lessons").length;
    const actorRead = deferred<{ data: unknown; error: unknown }>();
    passportPort.read = async request => request.table === "courses" ? actorRead.promise : { data: source, error: null };
    view.rerender(<CourseMaterialPassportCard courseId={source.course_id} context={nextContext} actorId="10000000-0000-4000-8000-000000000002" />);
    expect(screen.queryByText("Паспорт по материалам курса")).toBeNull();
    await act(async () => { actorRead.resolve({ data: null, error: { message: "SYNTHETIC_NEW_ACTOR_DENIED" } }); await actorRead.promise; });
    expect(screen.queryByText("Паспорт по материалам курса")).toBeNull();
    expect(passportPort.calls.filter(row => row.table === "lessons")).toHaveLength(lessonReadsBeforeActorChange);
  });
  it("mounts once in the existing store view while retaining the course description, price and order callback", async () => {
    const order = vi.fn(), back = vi.fn();
    const course = { id: "10000000-0000-4000-8000-000000000097", course_id: source.course_id,
      course: { title: "Synthetic store heading", description: "Existing course description" }, organization: { name: "Synthetic platform" }, price_organization: 12345, price_student: 999 };
    render(<MemoryRouter><CourseStoreDetailView course={course} userRole="organization" onBack={back} onOrder={order} /></MemoryRouter>);
    await screen.findByText("Материал источника сверён");
    expect(screen.getAllByText("Паспорт по материалам курса")).toHaveLength(1);
    expect(screen.getByText("Existing course description")).toBeTruthy();
    expect(screen.getByText(/12\D?345 ₽/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Получить курс" }));
    expect(order).toHaveBeenCalledTimes(1); expect(order).toHaveBeenCalledWith(course);
    fireEvent.click(screen.getByRole("button", { name: "Назад к каталогу" }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("existing-course-comments")).toBeTruthy();
  });
});
