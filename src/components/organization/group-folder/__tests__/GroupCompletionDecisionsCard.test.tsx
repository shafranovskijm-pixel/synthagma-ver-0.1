import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ id: "00000000-0000-4000-8000-000000000006" as string | null, loading: false }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: auth.id ? { id: auth.id } : null, loading: auth.loading }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/groups/groupCompletionDecisions", async original => {
  const actual = await original<typeof import("@/lib/groups/groupCompletionDecisions")>();
  return { ...actual, fetchGroupCompletionDecisions: vi.fn(), saveGroupCompletionDecision: vi.fn() };
});
import { GroupCompletionDecisionsCard } from "../GroupCompletionDecisionsCard";
import { fetchGroupCompletionDecisions, saveGroupCompletionDecision, type GroupCompletionContext, type GroupCompletionDecision } from "@/lib/groups/groupCompletionDecisions";
const ORG = "7237f9d4-3670-4a19-8946-a43c68fd3473";
const GROUP = "00000000-0000-4000-8000-000000000002";
const USER = "00000000-0000-4000-8000-000000000003";
const COURSE = "00000000-0000-4000-8000-000000000004";
const ENROLLMENT = "00000000-0000-4000-8000-000000000005";
const ACTOR = "00000000-0000-4000-8000-000000000006";
const DECISION = "00000000-0000-4000-8000-000000000007";
const OTHER = "00000000-0000-4000-8000-000000000099";
const props = { organizationId: ORG, groupId: GROUP };
function context(): GroupCompletionContext {
  return { organization_id: ORG, can_manage: true,
    group: { id: GROUP, organization_id: ORG, course_id: COURSE, name: "Тестовая группа", start_date: "2026-09-01", end_date: "2026-09-04" },
    students: [{ user_id: USER, full_name: "Тестовый Ученик", decision: null, enrollments: [
      { id: ENROLLMENT, user_id: USER, course_id: COURSE, status: "completed", progress: 100, started_at: "2026-09-01T09:00:00Z", completed_at: "2026-09-04T09:00:00Z", document_facts_revision: "3" },
    ] }],
  };
}
function decision(): GroupCompletionDecision {
  return { id: DECISION, organization_id: ORG, group_id: GROUP, user_id: USER, enrollment_id: ENROLLMENT, enrollment_facts_revision: "3", course_id: COURSE,
    group_start_date: "2026-09-01", group_end_date: "2026-09-04", grade_text: "Зачтено", issuance_decision: "with_document", protocol_number: null, protocol_date: null, decision_note: null,
    revision: 1, confirmed_by: ACTOR, confirmed_at: "2026-09-04T10:00:00Z" };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
async function open() {
  fireEvent.click(screen.getByRole("button", { name: "Заполнить итоговые решения" }));
  await screen.findByLabelText("Участник группы");
  await waitFor(() => expect(screen.getByRole("button", { name: "Обновить решения" })).toBeEnabled());
}
function select() { fireEvent.change(screen.getByLabelText("Участник группы"), { target: { value: USER } }); }
function fill() {
  fireEvent.change(screen.getByLabelText("Итоговая оценка"), { target: { value: "Не зачтено" } });
  fireEvent.change(screen.getByLabelText("Решение о выдаче документа"), { target: { value: "without_document" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Проверил итоговую оценку/ }));
}
const saveButton = () => screen.getByRole("button", { name: "Подтвердить и сохранить решение" });
beforeEach(() => {
  vi.clearAllMocks(); auth.id = ACTOR; auth.loading = false;
  vi.mocked(fetchGroupCompletionDecisions).mockReset().mockResolvedValue(context());
  vi.mocked(saveGroupCompletionDecision).mockReset().mockImplementation(async input => {
    const result = context(); result.students[0].decision = { ...decision(), grade_text: input.gradeText, issuance_decision: input.issuanceDecision,
      protocol_number: input.protocolNumber, protocol_date: input.protocolDate, decision_note: input.decisionNote };
    return result;
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("GroupCompletionDecisionsCard explicit operator decisions", () => {
  it("stays collapsed without fetching until explicitly opened; reopening rereads", async () => {
    render(<GroupCompletionDecisionsCard {...props} />);
    expect(fetchGroupCompletionDecisions).not.toHaveBeenCalled(); expect(screen.queryByLabelText("Участник группы")).not.toBeInTheDocument();
    await open(); expect(fetchGroupCompletionDecisions).toHaveBeenCalledExactlyOnceWith(props);
    fireEvent.click(screen.getByRole("button", { name: "Свернуть" }));
    expect(screen.queryByLabelText("Участник группы")).not.toBeInTheDocument(); await open();
    expect(fetchGroupCompletionDecisions).toHaveBeenCalledTimes(2);
  });
  it("requires an explicit student, grade, issuance choice and confirmation; test progress sets none", async () => {
    render(<GroupCompletionDecisionsCard {...props} />); await open();
    expect(screen.getByLabelText("Участник группы")).toHaveValue(""); expect(screen.queryByLabelText("Итоговая оценка")).not.toBeInTheDocument();
    select(); expect(screen.getByLabelText("Итоговая оценка")).toHaveValue(""); expect(screen.getByLabelText("Решение о выдаче документа")).toHaveValue(""); expect(saveButton()).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Итоговая оценка"), { target: { value: "Зачтено" } }); expect(saveButton()).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Решение о выдаче документа"), { target: { value: "with_document" } }); expect(saveButton()).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox")); expect(saveButton()).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Номер протокола (необязательно)"), { target: { value: "1" } });
    expect(screen.getByRole("checkbox")).not.toBeChecked(); expect(saveButton()).toBeDisabled();
    expect(saveGroupCompletionDecision).not.toHaveBeenCalled();
  });
  it("saves the selected person's explicit fields and displays the verified saved source", async () => {
    render(<GroupCompletionDecisionsCard {...props} />); await open(); select();
    fireEvent.change(screen.getByLabelText("Номер протокола (необязательно)"), { target: { value: "9/26" } });
    fireEvent.change(screen.getByLabelText("Дата протокола (необязательно)"), { target: { value: "2026-09-04" } });
    fireEvent.change(screen.getByLabelText("Основание / примечание (необязательно)"), { target: { value: "Решение комиссии" } });
    fill(); fireEvent.click(saveButton());
    await screen.findByText(/Решение сохранено и подтверждено повторным чтением/);
    expect(saveGroupCompletionDecision).toHaveBeenCalledExactlyOnceWith({ ...props, actorId: ACTOR, context: context(), userId: USER, gradeText: "Не зачтено", issuanceDecision: "without_document", protocolNumber: "9/26", protocolDate: "2026-09-04", decisionNote: "Решение комиссии" });
    expect(screen.getByText("Сохранённое актуальное решение")).toBeInTheDocument(); expect(screen.getByText(/Оценка: Не зачтено. Без выдачи/)).toBeInTheDocument();
    expect(screen.getByLabelText("Итоговая оценка")).toHaveValue(""); expect(screen.getByLabelText("Решение о выдаче документа")).toHaveValue(""); expect(saveButton()).toBeDisabled();
  });
  it("does not save twice or change selected inputs during an in-flight operation", async () => {
    const pending = deferred<GroupCompletionContext>(); vi.mocked(saveGroupCompletionDecision).mockReturnValue(pending.promise);
    render(<GroupCompletionDecisionsCard {...props} />); await open(); select(); fill();
    fireEvent.click(saveButton()); fireEvent.click(saveButton());
    fireEvent.change(screen.getByLabelText("Итоговая оценка"), { target: { value: "Другая оценка" } });
    expect(saveGroupCompletionDecision).toHaveBeenCalledOnce(); expect(screen.getByLabelText("Итоговая оценка")).toHaveValue("Не зачтено");
    expect(screen.getByRole("button", { name: "Обновить решения" })).toBeDisabled(); expect(screen.getByRole("button", { name: "Свернуть" })).toBeDisabled();
    await act(async () => pending.resolve(context()));
  });
  it.each(["network", "conflict", "malformed"])("forces a reload after %s failure and never blindly retries", async kind => {
    vi.mocked(saveGroupCompletionDecision).mockRejectedValue(new Error(kind === "conflict" ? "Данные изменились в другой вкладке" : "Сохранение не подтверждено"));
    render(<GroupCompletionDecisionsCard {...props} />); await open(); select(); fill(); fireEvent.click(saveButton());
    await screen.findByText(/Повторное сохранение отключено/); expect(saveButton()).toBeDisabled();
    fireEvent.click(saveButton()); expect(saveGroupCompletionDecision).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Обновить решения" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Обновить решения" })).toBeEnabled());
    expect(screen.queryByText(/Повторное сохранение отключено/)).not.toBeInTheDocument(); expect(screen.getByLabelText("Участник группы")).toHaveValue("");
    select(); expect(saveButton()).toBeDisabled();
  });
  it("does not auto-populate a current saved decision, but keeps it inspectable", async () => {
    const c = context(); c.students[0].decision = decision(); vi.mocked(fetchGroupCompletionDecisions).mockResolvedValue(c);
    render(<GroupCompletionDecisionsCard {...props} />); await open(); select();
    expect(screen.getByText("Сохранённое актуальное решение")).toBeInTheDocument();
    expect(screen.getByText(/Оценка: Зачтено. С выдачей/)).toBeInTheDocument();
    expect(screen.getByLabelText("Итоговая оценка")).toHaveValue(""); expect(screen.getByLabelText("Решение о выдаче документа")).toHaveValue("");
  });
  it.each(["enrollment", "dates", "course"])("shows stale %s decisions only for inspection, never as editable defaults", async kind => {
    const c = context(); c.students[0].decision = { ...decision(), ...(kind === "enrollment" ? { enrollment_facts_revision: "2" } : {}), ...(kind === "dates" ? { group_end_date: "2026-09-03" } : {}), ...(kind === "course" ? { course_id: OTHER } : {}) };
    vi.mocked(fetchGroupCompletionDecisions).mockResolvedValue(c);
    render(<GroupCompletionDecisionsCard {...props} />); await open(); select();
    expect(screen.getByText(/Предыдущее решение — требует повторной проверки/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/Предыдущее решение не используется/);
    expect(screen.getByLabelText("Итоговая оценка")).toHaveValue(""); expect(screen.getByLabelText("Решение о выдаче документа")).toHaveValue(""); expect(saveButton()).toBeDisabled();
  });
  it("shows readonly saved decisions without exposing a write form", async () => {
    const c = context(); c.can_manage = false; c.students[0].decision = decision(); vi.mocked(fetchGroupCompletionDecisions).mockResolvedValue(c);
    render(<GroupCompletionDecisionsCard {...props} />); await open(); select();
    expect(screen.getByText(/Доступен только просмотр/)).toBeInTheDocument(); expect(screen.getByText("Сохранённое актуальное решение")).toBeInTheDocument();
    expect(screen.queryByLabelText("Итоговая оценка")).not.toBeInTheDocument(); expect(saveGroupCompletionDecision).not.toHaveBeenCalled();
  });
  it.each(["missing", "multiple", "inactive", "course"])("does not allow decisions with %s enrollment context", async kind => {
    const c = context();
    if (kind === "missing") c.students[0].enrollments = [];
    if (kind === "multiple") c.students[0].enrollments.push({ ...c.students[0].enrollments[0], id: OTHER });
    if (kind === "inactive") c.students[0].enrollments[0].status = "cancelled";
    if (kind === "course") { c.group.course_id = null; c.students[0].enrollments = []; }
    vi.mocked(fetchGroupCompletionDecisions).mockResolvedValue(c);
    render(<GroupCompletionDecisionsCard {...props} />); await open(); select();
    expect(screen.getByLabelText("Итоговая оценка")).toBeDisabled(); expect(saveButton()).toBeDisabled(); expect(saveGroupCompletionDecision).not.toHaveBeenCalled();
    if (kind === "multiple") expect(screen.getByRole("alert")).toHaveTextContent(/несколько зачислений/);
    if (kind === "course") expect(screen.getByText(/Сначала назначьте группе курс/)).toBeInTheDocument();
  });
  it("reports an empty roster and missing server migration without fake records", async () => {
    const c = context(); c.students = []; vi.mocked(fetchGroupCompletionDecisions).mockResolvedValue(c);
    const view = render(<GroupCompletionDecisionsCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Заполнить итоговые решения" })); await screen.findByText(/В группе пока нет учеников/);
    expect(screen.queryByLabelText("Участник группы")).not.toBeInTheDocument(); view.unmount();
    vi.mocked(fetchGroupCompletionDecisions).mockRejectedValue(new Error("Бета: итоговые решения пока недоступны — серверное обновление не установлено."));
    render(<GroupCompletionDecisionsCard {...props} />); fireEvent.click(screen.getByRole("button", { name: "Заполнить итоговые решения" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Бета.*не установлено/); expect(screen.queryByLabelText("Участник группы")).not.toBeInTheDocument();
  });
  it.each(["group", "organization", "actor", "logout"])("discards late reads and form state after %s changes", async kind => {
    const pending = deferred<GroupCompletionContext>(); vi.mocked(fetchGroupCompletionDecisions).mockReturnValue(pending.promise);
    const view = render(<GroupCompletionDecisionsCard {...props} />); fireEvent.click(screen.getByRole("button", { name: "Заполнить итоговые решения" }));
    if (kind === "actor") auth.id = OTHER; if (kind === "logout") auth.id = null;
    view.rerender(<GroupCompletionDecisionsCard organizationId={kind === "organization" ? OTHER : ORG} groupId={kind === "group" ? OTHER : GROUP} />);
    await act(async () => pending.resolve(context()));
    expect(screen.queryByLabelText("Участник группы")).not.toBeInTheDocument(); expect(screen.queryByText("Тестовый Ученик")).not.toBeInTheDocument();
    expect(saveGroupCompletionDecision).not.toHaveBeenCalled();
    if (kind === "logout") expect(screen.getByRole("alert")).toHaveTextContent(/Войдите/); else expect(screen.getByRole("button", { name: "Заполнить итоговые решения" })).toBeInTheDocument();
  });
  it("discards a late saved-result message after account changes", async () => {
    const pending = deferred<GroupCompletionContext>(); vi.mocked(saveGroupCompletionDecision).mockReturnValue(pending.promise);
    const view = render(<GroupCompletionDecisionsCard {...props} />); await open(); select(); fill(); fireEvent.click(saveButton());
    auth.id = OTHER; view.rerender(<GroupCompletionDecisionsCard {...props} />);
    await act(async () => pending.resolve(context()));
    expect(screen.queryByText(/Решение сохранено/)).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Заполнить итоговые решения" })).toBeInTheDocument();
  });
  it("does not set state or store PII when unmounted during a read", async () => {
    const pending = deferred<GroupCompletionContext>(); vi.mocked(fetchGroupCompletionDecisions).mockReturnValue(pending.promise);
    const storage = vi.spyOn(Storage.prototype, "setItem"); const view = render(<GroupCompletionDecisionsCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Заполнить итоговые решения" })); view.unmount();
    await act(async () => pending.resolve(context())); expect(storage).not.toHaveBeenCalled(); expect(saveGroupCompletionDecision).not.toHaveBeenCalled();
  });
  it("prevents fetching while auth is loading or absent", () => {
    auth.loading = true; const view = render(<GroupCompletionDecisionsCard {...props} />); expect(screen.getByRole("status")).toHaveTextContent(/Проверяем доступ/);
    auth.loading = false; auth.id = null; view.rerender(<GroupCompletionDecisionsCard {...props} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/Войдите/); expect(fetchGroupCompletionDecisions).not.toHaveBeenCalled();
  });
  it("rejects more than 100 grade characters without hiding the entered text", async () => {
    render(<GroupCompletionDecisionsCard {...props} />); await open(); select(); fill();
    fireEvent.change(screen.getByLabelText("Итоговая оценка"), { target: { value: "а".repeat(101) } }); fireEvent.click(screen.getByRole("checkbox"));
    expect(saveButton()).toBeDisabled(); expect(screen.getByLabelText("Итоговая оценка")).toHaveValue("а".repeat(101));
  });
});
