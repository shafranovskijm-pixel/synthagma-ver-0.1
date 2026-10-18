import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GenerateContractDialog } from "../GenerateContractDialog";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  resolveProgram: vi.fn(),
  rpc: vi.fn(),
  invoke: vi.fn(),
  insert: vi.fn(),
  onGenerated: vi.fn(),
  onClose: vi.fn(),
  htmlDocsToZipBlob: vi.fn(),
  downloadBlob: vi.fn(),
  toastError: vi.fn(),
  existingRows: [] as any[],
}));

vi.mock("../../../../../supabase/functions/_shared/program-facts", async importOriginal => ({
  ...await importOriginal<typeof import("../../../../../supabase/functions/_shared/program-facts")>(),
  resolveGroupProgramGeneration: mocks.resolveProgram,
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
  if (table === "org_contracts") return { data: mocks.existingRows, error: null };
  return { data: [], error: null };
}

function queryFor(table: string) {
  const result = queryResult(table);
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    range: vi.fn(() => Promise.resolve(result)),
    order: vi.fn(() => query),
    in: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    insert: mocks.insert,
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

function renderDialog() {
  return render(
    <GenerateContractDialog
      organizationId="org-1"
      groupId="group-1"
      groupName="Группа 1"
      students={students}
      open
      fixedScenario="individual"
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

async function openReviewAndSubmit() {
  renderDialog();

  // 1. Сценарий зафиксирован как individual.
  let next = await screen.findByRole("button", { name: "Далее" });
  await waitFor(() => expect(next).not.toBeDisabled());
  fireEvent.click(next);

  // 2. Дожидаемся асинхронно загруженного встроенного шаблона.
  const template = await screen.findByText("Базовый договор с физическим лицом (встроенный)");
  fireEvent.click(template);
  next = screen.getByRole("button", { name: "Далее" });
  await waitFor(() => expect(next).not.toBeDisabled());
  fireEvent.click(next);

  // 3. Два individual job: отмечаем обоих учеников.
  const checkboxes = await screen.findAllByRole("checkbox");
  expect(checkboxes).toHaveLength(2);
  fireEvent.click(checkboxes[0]);
  fireEvent.click(checkboxes[1]);
  next = screen.getByRole("button", { name: "Далее" });
  await waitFor(() => expect(next).not.toBeDisabled());
  fireEvent.click(next);

  // 4. Программа/часы/форма/цена уже пришли из groupDefaults.
  next = await screen.findByRole("button", { name: "Далее" });
  await waitFor(() => expect(next).not.toBeDisabled());
  fireEvent.click(next);

  const submit = await screen.findByRole("button", { name: "Сгенерировать 2 договора" });
  expect(submit).toBeDisabled();

  const authority = screen.getByRole("textbox", { name: "Формулировка полномочий руководителя" });
  expect(authority).toHaveValue("");
  fireEvent.change(authority, {
    target: { value: "действующего на основании решения учредителя № 1" },
  });
  await waitFor(() => expect(submit).not.toBeDisabled());
  fireEvent.click(submit);
}

describe("GenerateContractDialog individual bulk persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockImplementation((table: string) => queryFor(table));
    mocks.resolveProgram.mockReset().mockResolvedValue({state:"confirmed",reason:null,
      fields:{program_title:"Утверждённая QA v1",program_hours:16,program_form:"Очно-заочная"},
      provenance:{schema_version:1,state:"confirmed",organization_id:"org-1",group_id:"group-1",course_id:"qa-course",version_id:"qa-version"}});
    mocks.rpc
      .mockResolvedValueOnce({ data: 1, error: null })
      .mockResolvedValueOnce({ data: 2, error: null });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.existingRows = [];
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
      .mockResolvedValueOnce({ data: { success:true,renderer:"browserless",path: "org/contracts/student-1.pdf" }, error: null })
      .mockResolvedValueOnce({ data: { success:true,renderer:"browserless",path: "org/contracts/student-2.pdf" }, error: null });

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
      contractNumbers: expect.arrayContaining([
        expect.stringMatching(/-001$/),
        expect.stringMatching(/-002$/),
      ]),
    });
  });

  it("сохраняет неподтверждённую программу только в черновиках с явным источником", async () => {
    mocks.resolveProgram.mockResolvedValue({state:"unconfirmed",reason:"no_confirmed_group_binding",fields:null,
      provenance:{schema_version:1,state:"unconfirmed",organization_id:"org-1",group_id:"group-1",course_id:null,reason:"no_confirmed_group_binding"}});
    mocks.invoke.mockResolvedValue({data:{success:true,renderer:"browserless",path:"qa-only.pdf"},error:null});
    await openReviewAndSubmit();
    await waitFor(()=>expect(mocks.insert).toHaveBeenCalledOnce());
    const rows=mocks.insert.mock.calls[0][0];
    expect(rows.every((row:any)=>row.status==="draft" && row.variables_snapshot.program_facts.state==="unconfirmed")).toBe(true);
    expect(rows.every((row:any)=>row.body_html.includes('data-sintagma-program-state="unconfirmed"'))).toBe(true);
    expect(rows.every((row:any)=>row.contract_number===null)).toBe(true);expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("берёт программу из повторной проверки, защищает её от ручных значений и сохраняет proof", async () => {
    mocks.resolveProgram.mockResolvedValue({state:"confirmed",reason:null,fields:{program_title:"Утверждённая QA v1",program_hours:16,program_form:"Очно-заочная"},
      groupFields:{name:"Pinned QA group",start_date:"2026-10-01",end_date:"2026-10-02",training_dates:["2026-10-01"],schedule_text:"Pinned schedule",instructor_name:"Pinned teacher"},
      facts:{duration_calendar:"2 days",attestation_form:"test",attestation_criteria:"explicit criteria"},provenance:{state:"confirmed",version_id:"qa-version",enrollment_snapshot_ids:["qa-snapshot"]}});
    mocks.invoke.mockResolvedValue({data:{success:true,renderer:"browserless",path:"qa-only.pdf"},error:null});
    await openReviewAndSubmit();
    await waitFor(()=>expect(mocks.insert).toHaveBeenCalledOnce());
    const rows=mocks.insert.mock.calls[0][0];
    expect(rows.every((row:any)=>row.variables.program_title==="Утверждённая QA v1" && row.variables.program_hours==="16" && row.variables.program_form==="Очно-заочная")).toBe(true);
    expect(rows.every((row:any)=>row.variables_snapshot.program_facts.version_id==="qa-version")).toBe(true);
    expect(rows.every((row:any)=>row.variables.start_date==="01.10.2026" && row.variables.end_date==="02.10.2026"
      && row.variables.schedule_text==="Режим занятий: Pinned schedule." && row.variables.attestation_form==="test")).toBe(true);
    expect(mocks.resolveProgram).toHaveBeenCalledWith(expect.anything(),"org-1","group-1",["student-1"]);
    expect(mocks.resolveProgram).toHaveBeenCalledWith(expect.anything(),"org-1","group-1",["student-2"]);
  });

  it("при недоступном источнике программы не расходует номер и не создаёт PDF или договор", async () => {
    mocks.resolveProgram.mockRejectedValue(new Error("Programme source unavailable"));
    await openReviewAndSubmit();
    await waitFor(()=>expect(mocks.toastError).toHaveBeenCalledWith("Ошибка генерации",expect.objectContaining({description:"Programme source unavailable"})));
    expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.invoke).not.toHaveBeenCalled();expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("не делает insert, если второй PDF не сохранён", async () => {
    mocks.invoke
      .mockResolvedValueOnce({ data: { success:true,renderer:"browserless",path: "org/contracts/student-1.pdf" }, error: null })
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
      .mockResolvedValueOnce({ data: { success:true,renderer:"browserless",path: "org/contracts/student-1.pdf" }, error: null })
      .mockResolvedValueOnce({ data: { success:true,renderer:"browserless",path: "org/contracts/student-2.pdf" }, error: null });
    mocks.insert.mockImplementationOnce(async (rows: any[]) => {
      mocks.existingRows = rows.map((row) => ({
        contract_number: row.contract_number,
        student_user_id: row.student_user_id,
        company_id: row.company_id,
        variables: row.variables,
      }));
      return { error: { message: "Failed to fetch", code: "" } };
    });

    await openReviewAndSubmit();

    await waitFor(() => expect(mocks.onGenerated).toHaveBeenCalledTimes(1));
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.onClose).toHaveBeenCalledTimes(1);
    expect(mocks.existingRows).toHaveLength(2);
    expect(mocks.existingRows[0].variables._sintagma_generation_id).toBeTruthy();
    expect(mocks.existingRows[0].variables._sintagma_job_key).toBeTruthy();
  });

  it("при неподтверждённом transport error блокирует закрытие и повторяет те же номера", async () => {
    mocks.invoke
      .mockResolvedValue({ data: { success:true,renderer:"browserless",path: "org/contracts/student.pdf" }, error: null });
    mocks.insert
      .mockResolvedValueOnce({ error: { message: "Failed to fetch", code: "" } })
      .mockResolvedValueOnce({ error: null });

    await openReviewAndSubmit();

    expect(await screen.findByText(/статус сохранения пока не подтверждён/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отмена" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Назад" })).toBeDisabled();
    expect(mocks.onGenerated).not.toHaveBeenCalled();
    const firstNumbers = mocks.insert.mock.calls[0][0].map((row: any) => row.contract_number);

    fireEvent.click(screen.getByRole("button", { name: "Сгенерировать 2 договора" }));

    await waitFor(() => expect(mocks.onGenerated).toHaveBeenCalledTimes(1));
    const secondNumbers = mocks.insert.mock.calls[1][0].map((row: any) => row.contract_number);
    expect(secondNumbers).toEqual(firstNumbers);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(mocks.onClose).toHaveBeenCalledTimes(1);
  });
});
