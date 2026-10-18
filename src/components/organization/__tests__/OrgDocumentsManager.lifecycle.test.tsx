import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { getOrgDocumentState, isOrgDocumentReady } from "@/lib/orgDocumentLifecycle";

const state = vi.hoisted(() => ({ read: vi.fn(), openUpload: vi.fn(), openHistory: vi.fn(), openFile: vi.fn(), download: vi.fn() }));
vi.mock("@/utils/storageHelpers", () => ({ openPrivateFile: state.openFile, downloadPrivateFile: state.download }));
vi.mock("@/hooks/useOrgDocumentsManager", () => ({
  useOrgDocumentsManager: state.read,
  REGULAR_CATEGORIES: [{ id: "foundation", title: "Документы центра", icon: "FileText", documents: [
    { type: "license", label: "Лицензия", required: true },
  ] }],
  SPECIAL_CATEGORIES: [], ALL_CATEGORIES: [], getAllDocumentTypes: () => [],
}));
vi.mock("../SelfExaminationQuiz", () => ({ SelfExaminationQuiz: () => null }));
vi.mock("../OrgDocumentVersionsDialog", () => ({ OrgDocumentVersionsDialog: () => null }));
import { OrgDocumentsManager } from "../OrgDocumentsManager";

const document = { id: "doc", name: "Лицензия", type: "license", file_url: "https://example.test/license.pdf",
  status: "active", updated_at: "2026-10-18T00:00:00Z", expires_at: "2099-12-31" };
function setup(doc: typeof document | undefined, canWrite = true) {
  state.read.mockReturnValue({
    isLoading: false, canWrite, expiryFilter: "all", searchQuery: "", selectedDocsForOrder: [],
    getDocumentForType: () => doc, getExpiryStatus: () => getOrgDocumentState(doc),
    isDocumentReady: () => isOrgDocumentReady(doc), openUploadDialog: state.openUpload,
    setVersionsDocument: state.openHistory, uploadedRequired: isOrgDocumentReady(doc) ? 1 : 0,
    completionPercent: isOrgDocumentReady(doc) ? 100 : 0, totalRequired: 1,
  });
  render(<OrgDocumentsManager organizationId="org" canWrite={canWrite} />);
  fireEvent.click(screen.getByRole("button", { name: /Документы центра/ }));
}
beforeEach(() => vi.clearAllMocks());
describe("document readiness is reflected in the existing row UI", () => {
  it("uses authorized private Storage helpers for both current-file actions", () => {
    state.openFile.mockResolvedValue(true); state.download.mockResolvedValue(true);
    setup(document);
    fireEvent.click(screen.getByTitle("Просмотр"));
    fireEvent.click(screen.getByTitle("Скачать"));
    expect(state.openFile).toHaveBeenCalledWith("org-documents", document.file_url);
    expect(state.download).toHaveBeenCalledWith("org-documents", document.file_url, "Лицензия");
  });
  it("offers the first upload for a missing document", () => {
    setup(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Загрузить" }));
    expect(state.openUpload).toHaveBeenCalledWith("license");
    expect(screen.queryByRole("button", { name: "Обновить" })).not.toBeInTheDocument();
    expect(screen.getByText("0 из 1 обязательных")).toBeInTheDocument();
  });
  it("does not claim a dated but fileless record is active", () => {
    setup({ ...document, file_url: " " });
    expect(screen.queryByText("Действует", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Загрузить" })).toBeEnabled();
    expect(screen.getByText("0 из 1 обязательных")).toBeInTheDocument();
  });
  it("keeps history readable and replacement disabled for a read-only user", () => {
    setup(document, false);
    expect(screen.getByRole("button", { name: "Заменить" })).toBeDisabled();
    fireEvent.click(screen.getByTitle("История версий"));
    expect(state.openHistory).toHaveBeenCalledWith(document);
    expect(screen.getByText("1 из 1 обязательных")).toBeInTheDocument();
  });
  it("marks an archived file for update but excludes it from completeness", () => {
    setup({ ...document, status: "archived" });
    expect(screen.getByRole("button", { name: "Обновить" })).toBeEnabled();
    expect(screen.queryByText("Действует", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText("0 из 1 обязательных")).toBeInTheDocument();
  });
});
