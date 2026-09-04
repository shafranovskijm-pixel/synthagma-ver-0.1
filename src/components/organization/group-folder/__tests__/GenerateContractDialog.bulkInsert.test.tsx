import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GenerateContractDialog } from "../GenerateContractDialog";
import { builtinTemplateFor } from "@/lib/contracts/builtinTemplates";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  invoke: vi.fn(),
  insert: vi.fn(),
  onGenerated: vi.fn(),
  onClose: vi.fn(),
  htmlDocsToZipBlob: vi.fn(),
  downloadBlob: vi.fn(),
  toastError: vi.fn(),
  existingRows: [] as any[],
  verifyError: null as any,
  withoutNumberTemplate: false,
  legalTemplate: false,
}));

const organization = {
  name: "ТЕСТОВАЯ ОРГАНИЗАЦИЯ — НЕ РЕАЛЬНАЯ",
  inn: "0000000000",
  kpp: "000000000",
  ogrn: "1022500000000",
  legal_address: "ТЕСТОВЫЙ АДРЕС — НЕ РЕАЛЬНЫЕ ДАННЫЕ",
  email: "organization@example.invalid",
  phone: "+7 000 000-00-00",
  director_name: "ТЕСТОВЫЙ РУКОВОДИТЕЛЬ",
  director_position: "Директор",
  bank_name: "ТЕСТОВЫЙ БАНК — НЕ СУЩЕСТВУЕТ",
  bank_bik: "000000000",
  bank_account: "00000000000000000000",
  bank_corr_account: "00000000000000000000",
};

const students = [
  {
    user_id: "student-1",
    full_name: "ТЕСТОВЫЙ СЛУШАТЕЛЬ 1",
    email: "student1@example.invalid",
    passport: "00 00 000000",
    address: "ТЕСТОВЫЙ АДРЕС 1",
    phone: "+7 000 000-00-01",
  },
  {
    user_id: "student-2",
    full_name: "ТЕСТОВЫЙ СЛУШАТЕЛЬ 2",
    email: "student2@example.invalid",
    passport: "00 00 000000",
    address: "ТЕСТОВЫЙ АДРЕС 2",
    phone: "+7 000 000-00-02",
  },
];

function queryResult(table: string) {
  if (table === "organizations") return { data: organization, error: null };
  if (table === "companies") return { data: [{ id: "company-1", name: "ТЕСТОВЫЙ ЗАКАЗЧИК", inn: "0000000000", address: "ТЕСТОВЫЙ АДРЕС", director: "ТЕСТОВЫЙ ПОДПИСАНТ" }], error: null };
  if (table === "org_contract_templates" && mocks.withoutNumberTemplate) return { data: [{
    ...builtinTemplateFor("individual"), id: "unnumbered-template", name: "ТЕСТОВЫЙ ШАБЛОН БЕЗ НОМЕРА",
    body_html: builtinTemplateFor("individual").body_html.split("{{contract_number}}").join("без номера"),
  }], error: null };
  if (table === "org_contract_templates" && mocks.legalTemplate) return { data: [{
    id: "legal-template", name: "ТЕСТОВЫЙ ШАБЛОН КОМПАНИИ", counterparty_type: "legal",
    body_html: "<p>{{company_name}} {{program_title}} {{students_table}}</p>",
  }], error: null };
  if (table === "org_contracts") return { data: mocks.existingRows, error: mocks.verifyError };
  return { data: [], error: null };
}

function queryFor(table: string) {
  const result = queryResult(table);
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    in: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    insert: (rows: any[]) => ({ select: () => mocks.insert(rows) }),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
    functions: { invoke: mocks.invoke },
  },
}));

// Keep real form/scenario/save behavior; replace only Radix select presentation.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: { children: ReactNode; value: string; onValueChange: (value: string) => void }) => (
    <select value={value} onChange={event => onValueChange(event.target.value)}>{children}</select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <option value={value}>{children}</option>,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));

vi.mock("@/lib/docx/htmlToDocx", () => ({
  htmlToDocxBlob: vi.fn(async () => new Blob(["docx"])),
  htmlDocsToZipBlob: mocks.htmlDocsToZipBlob,
  downloadBlob: mocks.downloadBlob,
  sanitizeFileName: (name: string, extension: string) => `${name}.${extension}`,
}));

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

function renderDialog(scenario: "individual" | "legal" = "individual") {
  return render(
    <GenerateContractDialog
      organizationId="org-1"
      groupId="group-1"
      groupName="Группа 1"
      students={students}
      open
      fixedScenario={scenario}
      groupDefaults={{
        programTitle: "Повышение квалификации",
        programHours: 40,
        programForm: "очная",
        price: 10_000,
      }}
      onClose={mocks.onClose}
      onGenerated={mocks.onGenerated}
    />,
  );
}

async function openReviewAndSubmit(options: { count?: number; withoutNumber?: boolean } = {}) {
  mocks.withoutNumberTemplate = !!options.withoutNumber;
  renderDialog();

  // 1. Сценарий зафиксирован как individual.
  let next = await screen.findByRole("button", { name: "Далее" });
  await waitFor(() => expect(next).not.toBeDisabled());
  fireEvent.click(next);

  // 2. Дожидаемся асинхронно загруженного встроенного шаблона.
  const template = await screen.findByText(options.withoutNumber ? "ТЕСТОВЫЙ ШАБЛОН БЕЗ НОМЕРА" : "Базовый договор с физическим лицом (встроенный)");
  fireEvent.click(template);
  next = screen.getByRole("button", { name: "Далее" });
  await waitFor(() => expect(next).not.toBeDisabled());
  fireEvent.click(next);

  // 3. Два individual job: отмечаем обоих учеников.
  const checkboxes = await screen.findAllByRole("checkbox");
  expect(checkboxes).toHaveLength(2);
  fireEvent.click(checkboxes[0]);
  if (options.count !== 1) fireEvent.click(checkboxes[1]);
  next = screen.getByRole("button", { name: "Далее" });
  await waitFor(() => expect(next).not.toBeDisabled());
  fireEvent.click(next);

  // 4. Программа/часы/форма/цена уже пришли из groupDefaults.
  next = await screen.findByRole("button", { name: "Далее" });
  await waitFor(() => expect(next).not.toBeDisabled());
  fireEvent.click(next);

  const submit = await screen.findByRole("button", { name: options.count === 1 ? "Сгенерировать и сохранить" : "Сгенерировать 2 договора" });
  expect(submit).toBeDisabled();

  const authority = screen.getByRole("textbox", { name: "Формулировка полномочий руководителя" });
  expect(authority).toHaveValue("");
  fireEvent.change(authority, {
    target: { value: "действующего на основании решения учредителя № 1" },
  });
  if (options.withoutNumber) fireEvent.click(screen.getByRole("button", { name: "Без номера" }));
  await waitFor(() => expect(submit).not.toBeDisabled());
  fireEvent.click(submit);
}

const contractIds = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002"];
const savedRows = (rows: any[]) => rows.map((row, index) => ({ ...row, id: contractIds[index] }));

describe("GenerateContractDialog individual bulk persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockReset();
    mocks.rpc.mockReset();
    mocks.invoke.mockReset();
    mocks.from.mockImplementation((table: string) => queryFor(table));
    mocks.rpc
      .mockResolvedValueOnce({ data: 1, error: null })
      .mockResolvedValueOnce({ data: 2, error: null });
    mocks.insert.mockImplementation(async (rows: any[]) => ({ data: savedRows(rows), error: null }));
    mocks.existingRows = [];
    mocks.verifyError = null;
    mocks.withoutNumberTemplate = false;
    mocks.legalTemplate = false;
    mocks.onGenerated.mockResolvedValue(true);
    mocks.htmlDocsToZipBlob.mockResolvedValue(new Blob(["zip"]));
  });

  it("фиксирует legal-сценарий и явно показывает компанию без переключателя на физлицо", async () => {
    render(
      <GenerateContractDialog
        organizationId="org-1"
        groupId="group-1"
        groupName="Группа 1"
        students={students}
        open
        quick
        fixedScenario="legal"
        groupDefaults={{
          programTitle: "Повышение квалификации",
          programHours: 40,
          programForm: "очная",
          price: 10_000,
        }}
        onClose={mocks.onClose}
        onGenerated={mocks.onGenerated}
      />,
    );

    const fixedCard = await screen.findByRole("group", { name: "Зафиксированный сценарий: Компания" });
    expect(fixedCard).toHaveTextContent("Компания");
    expect(fixedCard).not.toHaveTextContent("Физическое лицо");
    expect(screen.queryByRole("button", { name: /Физическое лицо/ })).not.toBeInTheDocument();

    const next = screen.getByRole("button", { name: "Далее" });
    await waitFor(() => expect(next).not.toBeDisabled());
    fireEvent.click(next);

    expect(await screen.findByText("Компания-заказчик")).toBeInTheDocument();
    expect(screen.queryByText("Выберите учеников")).not.toBeInTheDocument();
  });

  it("вставляет два договора одним массивом только после обоих PDF", async () => {
    mocks.invoke
      .mockResolvedValueOnce({ data: { path: "org/contracts/student-1.pdf" }, error: null })
      .mockResolvedValueOnce({ data: { path: "org/contracts/student-2.pdf" }, error: null });

    await openReviewAndSubmit();

    await waitFor(() => expect(mocks.onGenerated).toHaveBeenCalledTimes(1));
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    const rows = mocks.insert.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows).toEqual([
      expect.objectContaining({
        student_user_id: "student-1",
        file_path: "org/contracts/student-1.pdf",
      }),
      expect.objectContaining({
        student_user_id: "student-2",
        file_path: "org/contracts/student-2.pdf",
      }),
    ]);
    expect(Math.max(...mocks.invoke.mock.invocationCallOrder)).toBeLessThan(
      mocks.insert.mock.invocationCallOrder[0],
    );
    expect(mocks.onGenerated).toHaveBeenCalledWith({
      scenario: "individual",
      count: 2,
      contractIds,
      contractNumbers: expect.arrayContaining([
        expect.stringMatching(/-001$/),
        expect.stringMatching(/-002$/),
      ]),
    });
  });

  it("не делает insert, если второй PDF не сохранён", async () => {
    mocks.invoke
      .mockResolvedValueOnce({ data: { path: "org/contracts/student-1.pdf" }, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("second PDF failed") });

    await openReviewAndSubmit();

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.onGenerated).not.toHaveBeenCalled();
    expect(mocks.onClose).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Ошибка генерации",
      expect.objectContaining({ description: "second PDF failed" }),
    );
  });

  it("сверяет уже сохранённый пакет, если HTTP-ответ bulk insert потерян", async () => {
    mocks.invoke
      .mockResolvedValueOnce({ data: { path: "org/contracts/student-1.pdf" }, error: null })
      .mockResolvedValueOnce({ data: { path: "org/contracts/student-2.pdf" }, error: null });
    mocks.insert.mockImplementationOnce(async (rows: any[]) => {
      mocks.existingRows = savedRows(rows).reverse();
      return { error: { message: "Failed to fetch", code: "" } };
    });

    await openReviewAndSubmit();

    await waitFor(() => expect(mocks.onGenerated).toHaveBeenCalledTimes(1));
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.onClose).toHaveBeenCalledTimes(1);
    expect(mocks.existingRows).toHaveLength(2);
    expect(mocks.existingRows[0].variables._sintagma_generation_id).toBeTruthy();
    expect(mocks.existingRows[0].variables._sintagma_job_key).toBeTruthy();
    expect(mocks.onGenerated.mock.calls[0][0].contractIds).toEqual(contractIds);
  });

  it("после transport error только перечитывает тот же пакет, не повторяя insert/PDF/номера", async () => {
    mocks.invoke
      .mockResolvedValue({ data: { path: "org/contracts/student.pdf" }, error: null });
    mocks.insert.mockResolvedValueOnce({ error: { message: "Failed to fetch", code: "" } });

    await openReviewAndSubmit();

    expect(await screen.findByText(/статус сохранения пока не подтверждён/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отмена" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Назад" })).toBeDisabled();
    expect(mocks.onGenerated).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Проверить сохранение договоров" }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(2));
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.onGenerated).not.toHaveBeenCalled();

    mocks.existingRows = savedRows(mocks.insert.mock.calls[0][0]);
    fireEvent.click(screen.getByRole("button", { name: "Проверить сохранение договоров" }));

    await waitFor(() => expect(mocks.onGenerated).toHaveBeenCalledTimes(1));
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.onGenerated.mock.calls[0][0].contractIds).toEqual(contractIds);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(mocks.onClose).toHaveBeenCalledTimes(1);
  });

  it("возвращает ID только выбранного ученика, не расширяя состав до всей группы", async () => {
    mocks.invoke.mockResolvedValue({ data: { path: "org/contracts/selected.pdf" }, error: null });
    await openReviewAndSubmit({ count: 1 });
    await waitFor(() => expect(mocks.onGenerated).toHaveBeenCalledTimes(1));
    expect(mocks.insert.mock.calls[0][0]).toHaveLength(1);
    expect(mocks.insert.mock.calls[0][0][0].student_user_id).toBe("student-1");
    expect(mocks.onGenerated.mock.calls[0][0]).toMatchObject({ count: 1, contractIds: [contractIds[0]] });
  });

  it("сверяет реальные ID после thrown network result даже без номера договора", async () => {
    mocks.invoke.mockResolvedValue({ data: { path: "org/contracts/unnumbered.pdf" }, error: null });
    mocks.insert.mockImplementationOnce(async (rows: any[]) => {
      mocks.existingRows = savedRows(rows).reverse();
      throw new TypeError("Failed to fetch");
    });
    await openReviewAndSubmit({ withoutNumber: true });
    await waitFor(() => expect(mocks.onGenerated).toHaveBeenCalledTimes(1));
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.onGenerated.mock.calls[0][0]).toMatchObject({ count: 2, contractNumbers: [], contractIds });
  });

  it("не повторяет insert, если thrown network result и чтение результата также не подтверждены", async () => {
    mocks.invoke.mockResolvedValue({ data: { path: "org/contracts/unknown.pdf" }, error: null });
    mocks.insert.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    mocks.verifyError = { message: "read unavailable" };
    await openReviewAndSubmit();
    await screen.findByText(/статус сохранения пока не подтверждён/i);
    mocks.verifyError = null;
    fireEvent.click(screen.getByRole("button", { name: "Проверить сохранение договоров" }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(2));
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(mocks.onGenerated).not.toHaveBeenCalled();
  });

  it("сверяет неполный success payload и возвращает сохранённые ID в порядке исходных jobs", async () => {
    mocks.invoke.mockResolvedValue({ data: { path: "org/contracts/saved.pdf" }, error: null });
    mocks.insert.mockImplementationOnce(async (rows: any[]) => {
      mocks.existingRows = savedRows(rows).reverse();
      return { data: null, error: null };
    });
    await openReviewAndSubmit();
    await waitFor(() => expect(mocks.onGenerated).toHaveBeenCalledTimes(1));
    expect(mocks.onGenerated.mock.calls[0][0].contractIds).toEqual(contractIds);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it.each(["08006", "40003"])("SQLSTATE %s не принимается за подтверждённый rollback", async (code) => {
    mocks.invoke.mockResolvedValue({ data: { path: "org/contracts/uncertain.pdf" }, error: null });
    mocks.insert.mockResolvedValueOnce({ data: null, error: { code, message: "completion unknown" } });
    await openReviewAndSubmit();
    await screen.findByText(/статус сохранения пока не подтверждён/i);
    fireEvent.click(screen.getByRole("button", { name: "Проверить сохранение договоров" }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(2));
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.onGenerated).not.toHaveBeenCalled();
  });

  it.each([
    ["missing row", (rows: any[]) => rows.pop()],
    ["extra row", (rows: any[]) => rows.push({ ...rows[0], id: "10000000-0000-4000-8000-000000000003" })],
    ["missing ID", (rows: any[]) => delete rows[0].id],
    ["invalid UUID", (rows: any[]) => { rows[0].id = "invented-contract"; }],
    ["duplicate ID", (rows: any[]) => { rows[1].id = rows[0].id; }],
    ["duplicate job", (rows: any[]) => { rows[1].variables = rows[0].variables; }],
    ["foreign organization", (rows: any[]) => { rows[0].organization_id = "foreign"; }],
    ["foreign group", (rows: any[]) => { rows[0].student_group_id = "foreign"; }],
    ["wrong student", (rows: any[]) => { rows[0].student_user_id = "student-2"; }],
    ["wrong company", (rows: any[]) => { rows[0].company_id = "foreign"; }],
    ["wrong scenario", (rows: any[]) => { rows[0].counterparty_type = "legal"; }],
    ["wrong generation", (rows: any[]) => { rows[0].variables = { ...rows[0].variables, _sintagma_generation_id: "foreign" }; }],
    ["wrong number", (rows: any[]) => { rows[0].contract_number = "foreign"; }],
    ["wrong date", (rows: any[]) => { rows[0].contract_date = "1900-01-01"; }],
    ["wrong file", (rows: any[]) => { rows[0].file_path = "foreign/file.pdf"; }],
    ["wrong roster", (rows: any[]) => { rows[0].students = [{ user_id: "foreign" }]; }],
  ] as const)("не подтверждает success/reconciliation с %s", async (_label, invalidate) => {
    mocks.invoke.mockResolvedValue({ data: { path: "org/contracts/saved.pdf" }, error: null });
    mocks.insert.mockImplementationOnce(async (rows: any[]) => {
      const invalid = savedRows(rows);
      invalidate(invalid);
      mocks.existingRows = invalid;
      return { data: invalid, error: null };
    });
    await openReviewAndSubmit();
    await screen.findByText(/статус сохранения пока не подтверждён/i);
    expect(mocks.onGenerated).not.toHaveBeenCalled();
    expect(mocks.onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Проверить сохранение договоров" }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(2));
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.onGenerated).not.toHaveBeenCalled();
  });

  it("разрешает обычную попытку после подтверждённого SQL rejection", async () => {
    mocks.invoke.mockResolvedValue({ data: { path: "org/contracts/rejected.pdf" }, error: null });
    mocks.insert.mockResolvedValueOnce({ data: null, error: { code: "23514", message: "check constraint rejected" } });
    await openReviewAndSubmit();
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(screen.queryByText(/статус сохранения пока не подтверждён/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отмена" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Сгенерировать 2 договора" }));
    await waitFor(() => expect(mocks.onGenerated).toHaveBeenCalledTimes(1));
    expect(mocks.onGenerated.mock.calls[0][0].contractIds).toEqual(contractIds);
  });

  it.each([false, true])("возвращает единственный реальный HTML legal ID (reconciliation=%s)", async (lostResponse) => {
    mocks.legalTemplate = true;
    mocks.invoke.mockResolvedValue({ data: { path: "org/contracts/company.pdf" }, error: null });
    if (lostResponse) mocks.insert.mockImplementationOnce(async (rows: any[]) => {
      mocks.existingRows = savedRows(rows);
      throw new TypeError("Failed to fetch");
    });
    renderDialog("legal");
    fireEvent.click(await screen.findByRole("button", { name: "Далее" }));
    fireEvent.click(await screen.findByText("ТЕСТОВЫЙ ШАБЛОН КОМПАНИИ"));
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "company-1" } });
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    const submit = await screen.findByRole("button", { name: "Сгенерировать и сохранить" });
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.onGenerated).toHaveBeenCalledTimes(1));
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert.mock.calls[0][0]).toEqual([expect.objectContaining({
      counterparty_type: "legal", student_user_id: null, company_id: "company-1",
      students: students.map(student => ({ user_id: student.user_id, full_name: student.full_name, email: student.email })),
    })]);
    expect(mocks.onGenerated.mock.calls[0][0]).toMatchObject({ scenario: "legal", count: 1, contractIds: [contractIds[0]] });
  });
});
