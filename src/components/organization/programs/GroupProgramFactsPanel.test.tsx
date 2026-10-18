import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { groupEnvelope, ids, programVersion } from "./programFacts.fixtures";
const mocks = vi.hoisted(() => ({ course: {} as any, useCourse: vi.fn() }));
vi.mock("@/hooks/useProgramFacts", () => ({ useCourseProgramBinding: (...a: any[]) => { mocks.useCourse(...a); return mocks.course; } }));
vi.mock("@/components/organization/OrgDocumentVersionsDialog", () => ({ OrgDocumentVersionsDialog: () => null }));
import { GroupProgramFactsPanel } from "./GroupProgramFactsPanel";

describe("Group programme confirmation", () => {
  let resource: any;
  beforeEach(() => {
    mocks.useCourse.mockClear();
    resource = { data: groupEnvelope(), loading: false, saving: false, denied: false, conflict: false, error: null, bind: vi.fn().mockResolvedValue(true), confirmExisting: vi.fn().mockResolvedValue(true), reload: vi.fn() };
    mocks.course = { data: { revision: 1, binding: { version_id: ids.version }, version: programVersion() }, loading: false, saving: false, error: null, reload: vi.fn() };
  });
  const panel = (canConfigure = false) => <GroupProgramFactsPanel organizationId={ids.org} groupId={ids.group} courseId={ids.course} courseTitle="Курс" students={[{ user_id: ids.learner, full_name: "Иван Участник" }]} resource={resource} canConfigure={canConfigure} />;
  it("requires explicit selection of exact existing enrollment IDs, even for an assigned writer outside org-wide permissions", async () => {
    render(panel(false));
    expect(screen.getByRole("button", { name: /Подтвердить программу выбранных/ })).toBeDisabled();
    expect(resource.confirmExisting).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Иван Участник/ }));
    fireEvent.click(screen.getByRole("button", { name: /Подтвердить программу выбранных/ }));
    await waitFor(() => expect(resource.confirmExisting).toHaveBeenCalledWith([ids.enrollment]));
    await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeChecked());
    expect(screen.getByText(/без выдуманной даты зачисления/)).toBeInTheDocument();
  });
  it("does not offer group rebinding after the server locks a snapshot", () => {
    render(panel(true));
    expect(screen.getByText(/После фиксации сведений обучения менять программу/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Закрепить эту версию за группой" })).not.toBeInTheDocument();
    expect(mocks.useCourse).toHaveBeenLastCalledWith(null, ids.course);
    expect(resource.bind).not.toHaveBeenCalled();
  });
  it("shows exact approved course facts and binds only after a deliberate click under server capability", () => {
    resource.data.binding = null; resource.data.state = "unconfirmed"; resource.data.capabilities.can_bind = true;
    render(panel(false));
    expect(screen.getByText("Подтверждённая программа")).toBeInTheDocument();
    expect(screen.queryByText(ids.version)).not.toBeInTheDocument();
    expect(resource.bind).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Закрепить эту версию за группой" }));
    expect(resource.bind).toHaveBeenCalledWith(ids.course, ids.version);
  });
  it("does not bind when the exact course version cannot be loaded", () => {
    resource.data.binding = null; resource.data.capabilities.can_bind = true; mocks.course.data = null; mocks.course.error = "Не удалось загрузить связь курса";
    render(panel(true));
    expect(screen.getByRole("button", { name: "Закрепить эту версию за группой" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось загрузить связь курса");
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку доступной программы" })); expect(mocks.course.reload).toHaveBeenCalledOnce();
  });
  it("keeps a failed confirmation selected for retry and hides controls without server capability", async () => {
    resource.confirmExisting.mockResolvedValue(false); const view = render(panel(true));
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: /Подтвердить программу выбранных/ }));
    await waitFor(() => expect(resource.confirmExisting).toHaveBeenCalledOnce()); expect(screen.getByRole("checkbox")).toBeChecked();
    resource.data = { ...resource.data, capabilities: { can_bind: false, can_confirm_existing: false } }; view.rerender(panel(true));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: /Подтвердить программу выбранных/ })).not.toBeInTheDocument();
  });
  it("never substitutes missing read evidence with a clean unconfirmed state", () => {
    resource.data = null; resource.error = "Сведения о программе недоступны с вашими правами.";
    render(panel(false));
    expect(screen.getByRole("alert")).toHaveTextContent("недоступны");
    expect(screen.queryByText(/Версия программы группы пока не подтверждена/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Связей обучения с курсом этой группы пока нет/)).not.toBeInTheDocument();
  });
});
