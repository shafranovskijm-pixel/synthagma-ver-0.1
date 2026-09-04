import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GORELTECH_CURRICULA } from "@/lib/contracts/docxContract";
import { GenerateDocxContractDialog } from "../GenerateDocxContractDialog";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  invoke: vi.fn(),
  onGenerated: vi.fn(),
  onClose: vi.fn(),
  toastError: vi.fn(),
}));

const organizationId = "10000000-0000-4000-8000-000000000001";
const groupId = "20000000-0000-4000-8000-000000000001";
const studentId = "30000000-0000-4000-8000-000000000001";
const savedContractId = "40000000-0000-4000-8000-000000000001";
const contractNumber = "TEST-DOCX-001";
const curriculum = GORELTECH_CURRICULA[0];
// Deliberately synthetic source records; no real customer or student data.
const company = {
  id: "50000000-0000-4000-8000-000000000001",
  name: "ТЕСТОВАЯ КОМПАНИЯ — НЕ СУЩЕСТВУЕТ",
  inn: "0000000000", kpp: "000000000", ogrn: "0000000000000",
  address: "ТЕСТОВЫЙ ЮРИДИЧЕСКИЙ АДРЕС",
  postal_address: "ТЕСТОВЫЙ ПОЧТОВЫЙ АДРЕС",
  email: "company@example.invalid", phone: "+7 000 000-00-00",
  bank_name: "ТЕСТОВЫЙ БАНК", bank_account: "00000000000000000000",
  bank_bik: "000000000", bank_corr_account: "00000000000000000000",
  director: "Тестовый Подписант", signatory_position: "Тестовая должность",
  signatory_name_genitive: "Тестового Подписанта",
  signatory_authority_clause: "ТЕСТОВОЕ ОСНОВАНИЕ",
};
const students = [{ user_id: studentId, full_name: "ТЕСТОВЫЙ СЛУШАТЕЛЬ", email: "student@example.invalid" }];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc, functions: { invoke: mocks.invoke } },
}));
vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: vi.fn(), warning: vi.fn() },
}));
// Only replace Radix presentation: real component state, readiness and API adapter run.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: { children: ReactNode; value: string; onValueChange: (value: string) => void }) => (
    <select value={value} onChange={(event) => onValueChange(event.target.value)}>{children}</select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <option value={value}>{children}</option>,
  SelectTrigger: () => null,
  SelectValue: () => null,
}));
vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

function queryFor(table: string) {
  const fixtures: Record<string, unknown> = {
    contract_template_registry: [{
      id: "test-template", template_key: "goreltech.company.paid_education",
      name: "ТЕСТОВЫЙ WORD-ШАБЛОН", counterparty_type: "legal", template_format: "docx_ooxml",
      version_label: "test-v1", status: "validated", source_path: "synthetic.docx", template_sha256: "0".repeat(64),
    }],
    companies: [company],
    student_groups: {
      id: groupId, organization_id: organizationId, course_id: null,
      default_price: 10000, program_title: curriculum, program_form: "очная",
      start_date: "2026-09-01", end_date: "2026-09-05",
      training_address: "ТЕСТОВОЕ МЕСТО ОБУЧЕНИЯ", schedule_text: "ТЕСТОВЫЙ РЕЖИМ",
    },
    profiles: [{ ...students[0], job_position: "ТЕСТОВАЯ ДОЛЖНОСТЬ" }],
    student_frdo_data: [{ user_id: studentId, education_level: "высшее" }],
  };
  if (!(table in fixtures)) throw new Error(`Unexpected table: ${table}`);
  const result = { data: fixtures[table], error: null };
  const query: any = {
    select: vi.fn(() => query), eq: vi.fn(() => query), neq: vi.fn(() => query),
    is: vi.fn(() => query), order: vi.fn(() => query), maybeSingle: vi.fn(() => query),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

function compilerReply() {
  return {
    data: {
      contract: { id: savedContractId }, docx_sha256: "1".repeat(64),
      kept_curricula: [curriculum], pdf_status: "unavailable",
    },
    error: null,
  };
}

async function openReadyDialog() {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <GenerateDocxContractDialog
        open organizationId={organizationId} groupId={groupId} groupName="ТЕСТОВАЯ ГРУППА"
        students={students} onClose={mocks.onClose} onGenerated={mocks.onGenerated}
      />
    </MemoryRouter>,
  );
  const companyOption = await screen.findByRole("option", { name: company.name });
  fireEvent.change(companyOption.closest("select")!, { target: { value: company.id } });
  const taxOption = screen.getByRole("option", { name: /НДС не облагается в связи с применением упрощённой/ });
  fireEvent.change(taxOption.closest("select")!, { target: { value: taxOption.getAttribute("value") } });
  fireEvent.change(screen.getByLabelText("Порядок оплаты"), { target: { value: "ТЕСТОВЫЕ УСЛОВИЯ ОПЛАТЫ" } });
  const submit = screen.getByRole("button", { name: "Сформировать Word" });
  await waitFor(() => expect(submit).not.toBeDisabled());
  return submit;
}

describe("GenerateDocxContractDialog saved contract callback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.from.mockImplementation(queryFor);
    mocks.rpc.mockResolvedValue({ data: contractNumber, error: null });
    mocks.invoke.mockResolvedValue(compilerReply());
    mocks.onGenerated.mockResolvedValue(true);
  });

  it("returns the actual compiler ID in contractIds and preserves legacy contractId only after success", async () => {
    let resolveCompiler!: (result: ReturnType<typeof compilerReply>) => void;
    mocks.invoke.mockImplementation(() => new Promise((resolve) => { resolveCompiler = resolve; }));
    fireEvent.click(await openReadyDialog());

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    expect(mocks.onGenerated).not.toHaveBeenCalled();
    expect(mocks.onClose).not.toHaveBeenCalled();
    expect(mocks.invoke).toHaveBeenCalledWith("compile-docx-contract", {
      body: expect.objectContaining({
        organizationId, groupId, companyId: company.id,
        studentUserIds: [studentId], contractNumber,
      }),
    });
    resolveCompiler(compilerReply());

    await waitFor(() => expect(mocks.onGenerated).toHaveBeenCalledExactlyOnceWith({
      scenario: "legal", count: 1, contractNumbers: [contractNumber],
      contractIds: [savedContractId], contractId: savedContractId,
    }));
    expect(mocks.onClose).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("does not report saved IDs when the compiler request fails", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: { message: "synthetic compiler failure" } });
    fireEvent.click(await openReadyDialog());

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(
      "Договор не сформирован", { description: "synthetic compiler failure" },
    ));
    expect(mocks.onGenerated).not.toHaveBeenCalled();
    expect(mocks.onClose).not.toHaveBeenCalled();
  });

  it("forwards the returned saved ID on retry without reserving a new number or submission key", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: { message: "synthetic lost response" } });
    fireEvent.click(await openReadyDialog());
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.onGenerated).not.toHaveBeenCalled();
    const firstBody = mocks.invoke.mock.calls[0][1].body;

    const retry = screen.getByRole("button", { name: "Сформировать Word" });
    await waitFor(() => expect(retry).not.toBeDisabled());
    fireEvent.click(retry);

    await waitFor(() => expect(mocks.onGenerated).toHaveBeenCalledExactlyOnceWith({
      scenario: "legal", count: 1, contractNumbers: [contractNumber],
      contractIds: [savedContractId], contractId: savedContractId,
    }));
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(firstBody.submissionKey).toEqual(expect.any(String));
    expect(mocks.invoke.mock.calls[1][1].body).toEqual(firstBody);
    expect(mocks.onClose).toHaveBeenCalledTimes(1);
  });
});
