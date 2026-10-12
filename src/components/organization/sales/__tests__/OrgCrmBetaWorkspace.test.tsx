import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrgCrmBetaWorkspace } from "../OrgCrmBetaWorkspace";

const mocks = vi.hoisted(() => ({ hook: vi.fn(), saveClient: vi.fn(), saveDeal: vi.fn(), saveTask: vi.fn(), addActivity: vi.fn(), refetch: vi.fn() }));
vi.mock("@/hooks/useOrgCrm", () => ({ useOrgCrm: mocks.hook }));
const revision = "2026-10-12T08:00:00.123456+00:00";
const base = { organization_id: "org-a", created_at: revision, updated_at: revision };
const client = (id = "client-a", org_name = "Учебный центр") => ({ ...base, id, org_name, inn: "2540000000", email: "school@example.org", phone: null, address: null, notes: null });
const deal = (id = "deal-a", title = "Обучение первой группы", client_id = "client-a") => ({ ...base, id, title, client_id, stage: "new", amount: 0 });
const task = () => ({ ...base, id: "task-a", client_id: "client-a", deal_id: "deal-a", title: "Согласовать дату", description: "Уточнить состав группы", due_date: "2020-01-01T09:00:00Z", type: "call", status: "pending", assigned_user_id: null, completed_at: null });
const snapshot = () => ({
  clients: [] as ReturnType<typeof client>[], deals: [] as ReturnType<typeof deal>[], tasks: [] as ReturnType<typeof task>[], activities: [] as any[],
  assignees: [{ user_id: "staff-a", full_name: "Екатерина", role: "admin", email: "staff@example.org" }],
  counts: { clients: 0, deals: 0, tasks: 0, activities: 0 },
  truncated: { clients: false, deals: false, tasks: false, activities: false },
});
let data: ReturnType<typeof snapshot>;
let hookState: any;

function LocationControls() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><span data-testid="location">{location.search}</span><button onClick={() => navigate(-1)}>Назад в браузере</button></>;
}
function mount(props: Partial<React.ComponentProps<typeof OrgCrmBetaWorkspace>> = {}, url = "/organization?tab=sales") {
  return render(<MemoryRouter initialEntries={[url]}><LocationControls /><OrgCrmBetaWorkspace organizationId="org-a" canWrite {...props} /></MemoryRouter>);
}
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Сохранить" }));

beforeEach(() => {
  vi.resetAllMocks();
  data = snapshot();
  mocks.refetch.mockResolvedValue(undefined);
  mocks.saveClient.mockImplementation(async input => { const saved = { ...client(`client-${data.clients.length + 1}`), ...input }; data.clients.push(saved); return { id: saved.id, updated_at: revision }; });
  mocks.saveDeal.mockImplementation(async input => { const saved = { ...deal(`deal-${data.deals.length + 1}`), ...input }; data.deals.push(saved); return { id: saved.id, updated_at: revision }; });
  mocks.saveTask.mockImplementation(async input => {
    if (input.id) data.tasks = data.tasks.map(item => item.id === input.id ? { ...item, ...input } : item);
    else data.tasks.push({ ...task(), id: `task-${data.tasks.length + 1}`, ...input });
    return { id: input.id || data.tasks[data.tasks.length - 1]!.id, updated_at: revision };
  });
  mocks.addActivity.mockImplementation(async input => { const saved = { ...base, ...input, id: `activity-${data.activities.length + 1}`, actor_user_id: "staff-a" }; data.activities.push(saved); return { id: saved.id, created_at: revision }; });
  hookState = { data, isLoading: false, error: null, refetch: mocks.refetch,
    saveClient: { mutateAsync: mocks.saveClient, isPending: false }, saveDeal: { mutateAsync: mocks.saveDeal, isPending: false },
    saveTask: { mutateAsync: mocks.saveTask, isPending: false }, addActivity: { mutateAsync: mocks.addActivity, isPending: false } };
  mocks.hook.mockImplementation(() => hookState);
});
afterEach(cleanup);

describe("organization CRM beta", () => {
  it("reports a failed load instead of empty clients and offers retry", () => {
    hookState.error = new Error("network unavailable");
    mount();
    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось загрузить CRM");
    expect(screen.queryByText(/Клиентов пока нет/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("shows loading without client actions or false zero state", () => {
    hookState.isLoading = true;
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Загрузка CRM");
    expect(screen.queryByRole("button", { name: "Добавить клиента" })).not.toBeInTheDocument();
  });

  it("supports two separate deals, a linked deadline task and manual history for one client", async () => {
    mount({ canOpenDocuments: true, canOpenMailing: true });
    fireEvent.click(screen.getByRole("button", { name: "Добавить клиента" }));
    change("Название клиента", "  Развитие  ");
    change("Email", "director@example.org");
    submit();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.saveClient).toHaveBeenCalledWith(expect.objectContaining({ org_name: "Развитие", email: "director@example.org", phone: null }));
    expect(screen.getByTestId("location")).toHaveTextContent("crmClient=client-1");

    for (const [title, amount] of [["Первая группа", "15000"], ["Вторая группа", "0"]]) {
      fireEvent.click(screen.getByRole("button", { name: "Добавить сделку" }));
      expect(screen.getByLabelText("Клиент")).toHaveValue("client-1");
      change("Название сделки", title);
      change("Сумма сделки, ₽", amount);
      submit();
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    }
    expect(data.deals.map(item => item.title)).toEqual(["Первая группа", "Вторая группа"]);
    expect(mocks.saveDeal).toHaveBeenNthCalledWith(2, { client_id: "client-1", title: "Вторая группа", amount: 0, stage: "new" });
    expect(screen.getByRole("article", { name: "Сделка: Вторая группа" })).toHaveTextContent("0 ₽");

    fireEvent.click(screen.getByRole("button", { name: "Добавить задачу" }));
    change("Название задачи", "Позвонить по второй группе");
    change("Сделка (необязательно)", "deal-2");
    change("Срок задачи", "2030-02-15T10:30");
    change("Ответственный", "staff-a");
    submit();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.saveTask).toHaveBeenCalledWith(expect.objectContaining({ client_id: "client-1", deal_id: "deal-2", assigned_user_id: "staff-a", due_date: new Date("2030-02-15T10:30").toISOString(), status: "pending" }));

    fireEvent.click(screen.getByRole("button", { name: "Добавить запись" }));
    change("Тип записи", "call");
    change("Сделка (необязательно)", "deal-2");
    change("Результат общения / заметка", "Согласовали обучение второй группы");
    submit();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.addActivity).toHaveBeenCalledWith({ client_id: "client-1", deal_id: "deal-2", activity_type: "call", description: "Согласовали обучение второй группы" });
    expect(screen.getByText("Согласовали обучение второй группы")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Документы" })).toHaveAttribute("href", "/organization?tab=documents");
    expect(screen.getByRole("link", { name: "Рассылки" })).toHaveAttribute("href", "/organization?tab=mailing&mailingTab=overview");
  });

  it("read-only users see related records without mutation actions or unauthorized shortcuts", () => {
    data.clients.push(client()); data.deals.push(deal()); data.tasks.push(task());
    mount({ canWrite: false }, "/organization?tab=sales&crmClient=client-a");
    expect(screen.getByRole("article", { name: "Сделка: Обучение первой группы" })).toBeInTheDocument();
    expect(screen.getByText("Просрочено")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Добавить|Изменить|Выполнить/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Рассылки" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Документы" })).not.toBeInTheDocument();
  });

  it("retains the exact revision when completing a task and reports rejected writes", async () => {
    data.clients.push(client()); data.deals.push(deal()); data.tasks.push(task());
    mocks.saveTask.mockRejectedValueOnce(new Error("Запись уже изменена. Обновите данные."));
    mount({}, "/organization?tab=sales&crmTab=tasks&crmClient=client-a");
    fireEvent.click(screen.getByRole("button", { name: "Выполнить" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Запись уже изменена");
    expect(screen.queryByText("Задача выполнена.")).not.toBeInTheDocument();
    expect(mocks.saveTask).toHaveBeenCalledWith(expect.objectContaining({ id: "task-a", client_id: "client-a", status: "done", expected_updated_at: revision }));
    fireEvent.click(screen.getByRole("button", { name: "Выполнить" }));
    expect(await screen.findByText("Задача выполнена.")).toBeInTheDocument();
    expect(screen.getByText("Выполнена")).toBeInTheDocument();
  });

  it("keeps entered client values after failed save and does not claim success", async () => {
    mocks.saveClient.mockRejectedValue(new Error("Нет доступа к CRM этой организации."));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Добавить клиента" }));
    change("Название клиента", "Новый клиент");
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Нет доступа");
    expect(screen.getByLabelText("Название клиента")).toHaveValue("Новый клиент");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("Изменения сохранены.")).not.toBeInTheDocument();
  });

  it("stores the selected client and section in URL and restores them with browser Back", () => {
    data.clients.push(client());
    mount({}, "/organization?tab=sales&context=retained");
    fireEvent.click(screen.getByRole("button", { name: /Учебный центр/ }));
    expect(screen.getByTestId("location")).toHaveTextContent("crmClient=client-a");
    fireEvent.click(screen.getByRole("button", { name: /^Задачи$/ }));
    expect(screen.getByTestId("location")).toHaveTextContent("crmTab=tasks");
    fireEvent.click(screen.getByRole("button", { name: "Назад в браузере" }));
    expect(screen.getByRole("button", { name: /^Клиенты$/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Учебный центр" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("context=retained");
    fireEvent.click(screen.getByRole("button", { name: "Назад в браузере" }));
    expect(screen.queryByRole("heading", { name: "Учебный центр" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить клиента" })).toBeInTheDocument();
  });

  it("does not navigate or surface an old save result after changing organization", async () => {
    let resolve!: (value: unknown) => void;
    mocks.saveClient.mockReturnValue(new Promise(done => { resolve = done; }));
    const view = mount();
    fireEvent.click(screen.getByRole("button", { name: "Добавить клиента" }));
    change("Название клиента", "Старый клиент");
    submit();
    expect(screen.getByRole("button", { name: "Сохранение…" })).toBeDisabled();
    hookState = { ...hookState, data: snapshot() };
    view.rerender(<MemoryRouter><LocationControls /><OrgCrmBetaWorkspace organizationId="org-b" canWrite /></MemoryRouter>);
    await act(async () => resolve({ id: "old-client", updated_at: revision }));
    expect(screen.getByTestId("location")).not.toHaveTextContent("old-client");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Изменения сохранены.")).not.toBeInTheDocument();
    expect(mocks.hook).toHaveBeenLastCalledWith("org-b");
  });

  it("clears a selected deal when the task client changes", async () => {
    data.clients.push(client(), client("client-b", "Другой центр"));
    data.deals.push(deal(), deal("deal-b", "Другая сделка", "client-b"));
    mount({}, "/organization?tab=sales&crmTab=tasks");
    fireEvent.click(screen.getByRole("button", { name: "Добавить задачу" }));
    change("Клиент", "client-a"); change("Сделка (необязательно)", "deal-a");
    change("Клиент", "client-b");
    expect(screen.getByLabelText("Сделка (необязательно)")).toHaveValue("");
    expect(screen.queryByRole("option", { name: "Обучение первой группы" })).not.toBeInTheDocument();
    change("Название задачи", "Уточнить условия");
    submit();
    await waitFor(() => expect(mocks.saveTask).toHaveBeenCalledWith(expect.objectContaining({ client_id: "client-b", deal_id: null })));
  });

  it("does not substitute a different client for an inaccessible URL and discloses truncated data", () => {
    data.clients.push(client());
    data.counts.clients = 1001; data.truncated.clients = true;
    mount({}, "/organization?tab=sales&crmClient=missing-client");
    expect(screen.getByRole("alert")).toHaveTextContent("Клиент не найден");
    expect(screen.queryByRole("heading", { name: "Учебный центр" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Показана часть данных");
  });
});
