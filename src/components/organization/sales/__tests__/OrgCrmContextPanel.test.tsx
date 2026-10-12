import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrgCrmContextPanel } from "../OrgCrmContextPanel";

const mocks = vi.hoisted(() => ({ context: vi.fn(), crm: vi.fn(), link: vi.fn(), saveDeal: vi.fn(), saveTask: vi.fn(), addActivity: vi.fn(), refetch: vi.fn() }));
vi.mock("@/hooks/useOrgCrmContext", () => ({ useOrgCrmContext: mocks.context }));
vi.mock("@/hooks/useOrgCrm", () => ({ useOrgCrm: mocks.crm }));
const revision = "2026-10-12T08:00:00.123456+00:00";
const base = { organization_id: "org-a", created_at: revision, updated_at: revision };
const client = (id = "client-a", org_name = "Связанный центр", links = {}) => ({ ...base, id, org_name, inn: null, email: null, phone: null, address: null, notes: null, company_id: null, student_user_id: null, linked_at: null, ...links });
const snapshot = () => ({ clients: [] as any[], deals: [] as any[], tasks: [] as any[], activities: [] as any[], assignees: [], counts: { clients: 0, deals: 0, tasks: 0, activities: 0 }, truncated: { clients: false, deals: false, tasks: false, activities: false } });
let data: any;
let contextState: any;
let crmState: any;

beforeEach(() => {
  vi.resetAllMocks();
  data = { subject: { type: "student", id: "student-a", name: "Анна Иванова", profile_id: "profile-a" }, client: null, related_company: null, crm: snapshot(), timeline: { events: [], total: 0, truncated: false, restricted_sources: [], unavailable_sources: [] } };
  mocks.refetch.mockResolvedValue(undefined);
  mocks.link.mockImplementation(async id => {
    data.client = client(id || "created-client", "Анна Иванова", { student_user_id: "student-a", linked_at: revision });
    data.crm.clients = [data.client]; data.crm.counts.clients = 1;
    return { id: data.client.id, updated_at: revision };
  });
  mocks.saveDeal.mockResolvedValue({ id: "new-deal", updated_at: revision });
  mocks.saveTask.mockResolvedValue({ id: "new-task", updated_at: revision });
  mocks.addActivity.mockResolvedValue({ id: "new-activity", created_at: revision });
  contextState = { data, isLoading: false, error: null, refetch: mocks.refetch, linkClient: { mutateAsync: mocks.link, isPending: false }, saveDeal: { mutateAsync: mocks.saveDeal, isPending: false }, saveTask: { mutateAsync: mocks.saveTask, isPending: false }, addActivity: { mutateAsync: mocks.addActivity, isPending: false } };
  crmState = { data: snapshot(), isLoading: false, error: null, refetch: mocks.refetch };
  mocks.context.mockImplementation(() => contextState);
  mocks.crm.mockImplementation(() => crmState);
});
afterEach(cleanup);
const props = { organizationId: "org-a", entityType: "student" as const, entityId: "student-a", entityName: "Анна Иванова", canWrite: true };
function mount(overrides: Partial<React.ComponentProps<typeof OrgCrmContextPanel>> = {}) { return render(<MemoryRouter><OrgCrmContextPanel {...props} {...overrides} /></MemoryRouter>); }
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Сохранить" }));
function linkFixture() {
  data.client = client("client-a", "Анна Иванова", { student_user_id: "student-a", linked_at: revision });
  data.crm.clients = [data.client]; data.crm.counts.clients = 1;
}

describe("CRM in student and company cards", () => {
  it("does not create or search clients merely by opening a card", () => {
    mount();
    expect(mocks.context).toHaveBeenCalledWith("org-a", "student", "student-a");
    expect(mocks.link).not.toHaveBeenCalled();
    expect(mocks.crm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Создать связанного клиента CRM" })).toBeInTheDocument();
    expect(screen.getByText(/карточка ученика ещё не связана/)).toBeInTheDocument();
  });

  it("creates a linked CRM client only after an explicit action and prevents duplicate submission", async () => {
    let resolve!: (value: unknown) => void;
    mocks.link.mockImplementation(() => new Promise(done => { resolve = done; }));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Создать связанного клиента CRM" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранение связи…" }));
    expect(mocks.link).toHaveBeenCalledTimes(1);
    expect(mocks.link).toHaveBeenCalledWith(null);
    linkFixture();
    await act(async () => resolve({ id: "client-a", updated_at: revision }));
    expect(screen.getByText("Связь с CRM сохранена.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Создать связанного клиента CRM" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Открыть клиента в CRM" })).toHaveAttribute("href", "/organization?tab=sales&crmClient=client-a");
    expect(mocks.link).toHaveBeenCalledTimes(1);
  });

  it("offers only genuinely unlinked clients, including exclusion of orphaned links", async () => {
    crmState.data.clients = [client("free", "Свободный клиент"), client("company-linked", "Другая компания", { company_id: "company-b" }), client("student-linked", "Другой ученик", { student_user_id: "student-b" }), client("orphaned", "Удалённый источник", { linked_at: revision })];
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Связать существующего клиента" }));
    expect(mocks.crm).toHaveBeenCalledWith("org-a");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Связать выбранного клиента" })).toBeDisabled();
    expect(within(dialog).queryByText("Другая компания")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Другой ученик")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Удалённый источник")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("radio", { name: "Свободный клиент" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Связать выбранного клиента" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.link).toHaveBeenCalledWith("free");
    expect(mocks.link).toHaveBeenCalledTimes(1);
  });

  it("uses scoped client IDs and exact revisions for in-card deals, tasks and manual notes", async () => {
    linkFixture();
    data.crm.deals = [{ ...base, id: "deal-a", client_id: "client-a", title: "Повторное обучение", stage: "new", amount: 0 }];
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Изменить сделку" }));
    expect(screen.getByLabelText("Клиент")).toHaveValue("client-a");
    change("Название сделки", "Повторное обучение — новая группа");
    submit();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.saveDeal).toHaveBeenCalledWith(expect.objectContaining({ id: "deal-a", expected_updated_at: revision, client_id: "client-a", title: "Повторное обучение — новая группа", amount: 0 }));
    fireEvent.click(screen.getByRole("button", { name: "Добавить задачу" }));
    change("Название задачи", "Уточнить расписание"); change("Сделка (необязательно)", "deal-a"); change("Срок задачи", "2030-04-15T12:30");
    submit();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.saveTask).toHaveBeenCalledWith(expect.objectContaining({ client_id: "client-a", deal_id: "deal-a", due_date: new Date("2030-04-15T12:30").toISOString() }));
    fireEvent.click(screen.getByRole("button", { name: "Добавить заметку / общение" }));
    change("Результат общения / заметка", "Ученик попросил вечернюю группу");
    submit();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.addActivity).toHaveBeenCalledWith({ client_id: "client-a", deal_id: null, activity_type: "note", description: "Ученик попросил вечернюю группу" });
  });

  it("keeps a student's personal CRM separate from the company's labelled context", () => {
    linkFixture();
    data.related_company = { id: "company-a", name: "Работодатель", client_id: "company-client" };
    data.crm.deals = [{ ...base, id: "deal-a", client_id: "client-a", title: "Личная заявка ученика", stage: "new", amount: 0 }];
    mount({ canWrite: false });
    expect(screen.getByRole("article", { name: "Сделка: Личная заявка ученика" })).toBeInTheDocument();
    const related = screen.getByRole("complementary", { name: "CRM компании ученика" });
    expect(within(related).getByText("Работодатель")).toBeInTheDocument();
    expect(within(related).getByRole("link", { name: "Открыть CRM компании" })).toHaveAttribute("href", "/organization?tab=organizations&companyId=company-a&companySection=crm");
    expect(within(related).queryByText("Личная заявка ученика")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Добавить|Изменить|Создать связанного|Связать существующего/ })).not.toBeInTheDocument();
  });

  it("shows context load failure and retry without suggesting a new client", () => {
    contextState.error = new Error("permission unavailable");
    mount();
    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось загрузить CRM этой карточки");
    expect(screen.queryByRole("button", { name: "Создать связанного клиента CRM" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку CRM" }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("reports a failed link while preserving the selected existing client", async () => {
    crmState.data.clients = [client("free", "Свободный клиент")];
    mocks.link.mockRejectedValue(new Error("Клиент уже связан. Обновите данные."));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Связать существующего клиента" }));
    fireEvent.click(screen.getByRole("radio", { name: "Свободный клиент" }));
    fireEvent.click(screen.getByRole("button", { name: "Связать выбранного клиента" }));
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Клиент уже связан");
    expect(within(dialog).getByRole("radio", { name: "Свободный клиент" })).toBeChecked();
    expect(screen.queryByText("Связь с CRM сохранена.")).not.toBeInTheDocument();
  });

  it("ignores an old linking result when the selected student changes", async () => {
    let resolve!: (value: unknown) => void;
    mocks.link.mockReturnValue(new Promise(done => { resolve = done; }));
    const view = mount();
    fireEvent.click(screen.getByRole("button", { name: "Создать связанного клиента CRM" }));
    contextState = { ...contextState, data: { ...data, subject: { ...data.subject, id: "student-b", name: "Борис Петров" } } };
    view.rerender(<MemoryRouter><OrgCrmContextPanel {...props} entityId="student-b" entityName="Борис Петров" /></MemoryRouter>);
    await act(async () => resolve({ id: "old-client", updated_at: revision }));
    expect(screen.queryByText("Связь с CRM сохранена.")).not.toBeInTheDocument();
    expect(screen.getByText("Борис Петров")).toBeInTheDocument();
    expect(mocks.context).toHaveBeenLastCalledWith("org-a", "student", "student-b");
  });

  it("links chronology to the real company documents workspace only when allowed", () => {
    data.subject = { type: "company", id: "company-a", name: "Заказчик", profile_id: null };
    data.timeline.events = [{ id: "document-a", occurred_at: revision, source: "documents", kind: "document", title: "Загружен договор", description: null }];
    data.timeline.total = 1;
    const view = mount({ entityType: "company", entityId: "company-a", entityName: "Заказчик", canOpenDocuments: false });
    expect(screen.queryByRole("link", { name: "Открыть раздел «Документы»" })).not.toBeInTheDocument();
    view.rerender(<MemoryRouter><OrgCrmContextPanel {...props} entityType="company" entityId="company-a" entityName="Заказчик" canOpenDocuments /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Открыть раздел «Документы»" })).toHaveAttribute("href", "/organization?tab=organizations&companyId=company-a&companySection=documents");
    expect(screen.queryByRole("complementary", { name: "CRM компании ученика" })).not.toBeInTheDocument();
  });
});
