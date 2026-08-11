import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ContractsFolder } from "../ContractsFolder";
import type { GroupContractRow } from "@/hooks/useGroupContracts";

const { useGroupContractsMock, openPrivateFileMock } = vi.hoisted(() => ({
  useGroupContractsMock: vi.fn(),
  openPrivateFileMock: vi.fn(),
}));

vi.mock("@/hooks/useGroupContracts", () => ({
  useGroupContracts: useGroupContractsMock,
}));

vi.mock("@/utils/storageHelpers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/storageHelpers")>()),
  openPrivateFile: openPrivateFileMock,
}));

vi.mock("../GenerateContractDialog", () => ({ GenerateContractDialog: () => null }));
vi.mock("../GenerateDocxContractDialog", () => ({ GenerateDocxContractDialog: () => null }));
vi.mock("../UploadContractDialog", () => ({ UploadContractDialog: () => null }));
vi.mock("../UploadTemplateDialog", () => ({ UploadTemplateDialog: () => null }));

const base: GroupContractRow = {
  id: "base",
  organization_id: "org-1",
  name: "Договор",
  contract_number: "1",
  contract_date: "2026-08-12",
  file_url: null,
  file_path: null,
  status: "draft",
  student_user_id: null,
  student_group_id: "group-1",
  company_id: "company-1",
  counterparty_type: "legal",
  template_id: null,
  template_version: null,
  body_html: null,
  students: [],
  variables: {},
  created_at: "2026-08-12T00:00:00Z",
  company_name: "ООО Тест",
};

const docxReady: GroupContractRow = {
  ...base,
  id: "docx-ready",
  name: "DOCX ready",
  template_format: "docx_ooxml",
  file_path: "org/docx-ready.docx",
  docx_path: "org/docx-ready.docx",
  pdf_path: "org/docx-ready.pdf",
  pdf_status: "ready",
};

const docxPending: GroupContractRow = {
  ...base,
  id: "docx-pending",
  name: "DOCX pending",
  template_format: "docx_ooxml",
  file_path: "org/docx-pending.docx",
  docx_path: "org/docx-pending.docx",
  // A path alone must not make the PDF available before the compiler marks it ready.
  pdf_path: "org/docx-pending.pdf",
  pdf_status: "pending",
};

const legacyHtml: GroupContractRow = {
  ...base,
  id: "legacy-html",
  name: "Legacy HTML",
  template_format: "html",
  file_path: "org/legacy.pdf",
  body_html: "<p>legacy</p>",
};

describe("ContractsFolder format actions", () => {
  beforeEach(() => {
    openPrivateFileMock.mockReset();
    openPrivateFileMock.mockResolvedValue(undefined);
    useGroupContractsMock.mockReturnValue({
      contracts: [docxReady, docxPending, legacyHtml],
      loading: false,
      refresh: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(true),
    });
  });

  it("разрешает предпросмотр только готового PDF и сохраняет legacy HTML", async () => {
    render(
      <ContractsFolder
        organizationId="org-1"
        groupId="group-1"
        groupName="Группа"
        students={[{ user_id: "student-1", full_name: "Тест" }]}
      />,
    );

    const ready = within(screen.getByText("DOCX ready").closest("tr")!);
    expect(ready.getByLabelText("Просмотр договора DOCX ready")).not.toBeDisabled();
    expect(ready.getByRole("button", { name: "PDF" })).not.toBeDisabled();
    expect(ready.getByRole("button", { name: "DOCX" })).not.toBeDisabled();

    const pending = within(screen.getByText("DOCX pending").closest("tr")!);
    expect(pending.getByLabelText("Просмотр договора DOCX pending")).toBeDisabled();
    expect(pending.getByRole("button", { name: "PDF" })).toBeDisabled();
    expect(pending.getByRole("button", { name: "DOCX" })).not.toBeDisabled();

    const legacy = within(screen.getByText("Legacy HTML").closest("tr")!);
    expect(legacy.getByLabelText("Просмотр договора Legacy HTML")).not.toBeDisabled();
    expect(legacy.getByRole("button", { name: "PDF" })).not.toBeDisabled();
    expect(legacy.getByRole("button", { name: "DOCX" })).not.toBeDisabled();

    fireEvent.click(ready.getByRole("button", { name: "PDF" }));
    await waitFor(() => {
      expect(openPrivateFileMock).toHaveBeenCalledWith("billing-documents", "org/docx-ready.pdf");
    });

    fireEvent.click(ready.getByRole("button", { name: "DOCX" }));
    await waitFor(() => {
      expect(openPrivateFileMock).toHaveBeenCalledWith("billing-documents", "org/docx-ready.docx");
    });
  });
});
