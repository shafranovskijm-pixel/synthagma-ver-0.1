import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorialWorkspace } from "@/api/rtn-editorial";
import type { RtnSourceUploadRequest } from "@/api/rtn-source-upload";
const api = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@/api/rtn-source-upload", async () => ({ ...await vi.importActual<typeof import("@/api/rtn-source-upload")>("@/api/rtn-source-upload"), uploadRtnOfficialFile: api.upload }));
import { RtnSourceUploadError } from "@/api/rtn-source-upload";
import { RtnOfficialFileUpload } from "./RtnOfficialFileUpload";
const source = { id: "11111111-1111-4111-8111-111111111111", code: "A.1", title: "Официальный перечень А.1", page_url: "https://www.gosnadzor.ru/service/list/Safety%20certification/index.php", document_url: "https://www.gosnadzor.ru/service/list/Safety%20certification/A.1.pdf", parser: "industrial-pdf" as const, source_generation: 0 };
const energy = { id: "22222222-2222-4222-8222-222222222222", code: "energy", title: "Энергонадзор", page_url: "https://www.gosnadzor.ru/energy/energy/index.php", document_url: "https://www.gosnadzor.ru/energy/energy/questions.xlsx", parser: "energy-xlsx" as const, source_generation: 3 };
const workspace: EditorialWorkspace = { sources: [source, energy], banks: [], source_revisions: [], bank_revisions: [], key_sets: [], releases: [], manual_source_import_capability: { version: "rtn-manual-intake-v1", attestation_version: "official-current-location-v1", max_file_bytes: 16777216 } };
const saved = (request: RtnSourceUploadRequest) => ({ intake_id: "33333333-3333-4333-8333-333333333333", request_id: request.metadata.intakeRequestId, source_id: request.metadata.sourceId, revision_id: "44444444-4444-4444-8444-444444444444", sha256: "a".repeat(64), byte_size: request.file.size, received_at: "2026-11-22T14:01:28Z", acquisition_method: "admin_upload", replayed: false, normalization_required: false, accepted_generation: 1, still_current: true, automatic_verification_advanced: false });
const attestation = "Файл получен из указанной публикации Ростехнадзора; её актуальное расположение сверено.";
function mount(overrides: Partial<React.ComponentProps<typeof RtnOfficialFileUpload>> = {}) {
  const props = { workspace, showTrigger: true, disabled: false, onAccepted: vi.fn(), onRefresh: vi.fn(), ...overrides };
  return { ...render(<RtnOfficialFileUpload {...props} />), props };
}
async function fill() {
  fireEvent.click(screen.getByRole("button", { name: "Загрузить официальный файл" })); await screen.findByRole("dialog");
  fireEvent.change(screen.getByLabelText("Официальный источник"), { target: { value: source.id } });
  const file = new File(["%PDF-1 synthetic"], "official.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText("Оригинал файла"), { target: { files: [file] } });
  return file;
}
beforeEach(() => { vi.resetAllMocks(); api.upload.mockImplementation(async (request: RtnSourceUploadRequest) => saved(request)); });
afterEach(cleanup);

describe("official original upload dialog", () => {
  it("hides the upload action until the server advertises its exact capability", () => {
    mount({ workspace: { ...workspace, manual_source_import_capability: undefined } });
    expect(screen.queryByRole("button", { name: "Загрузить официальный файл" })).not.toBeInTheDocument();
    expect(api.upload).not.toHaveBeenCalled();
  });
  it("labels every field and requires the actual publication attestation before sending", async () => {
    const mounted = mount(); const file = await fill();
    expect(screen.getByLabelText("Страница официальной публикации")).toHaveValue(source.page_url);
    expect(screen.getByLabelText("Ссылка на оригинал на сайте Ростехнадзора")).toHaveValue(source.document_url);
    expect(screen.getByRole("button", { name: "Загрузить оригинал" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(attestation)); fireEvent.click(screen.getByRole("button", { name: "Загрузить оригинал" }));
    await screen.findByText("Официальный оригинал сохранён.");
    expect(api.upload.mock.calls[0][0]).toMatchObject({ file, parser: "industrial-pdf", metadata: { sourceId: source.id, expectedSourceGeneration: 0, publicationPageUrl: source.page_url, documentUrl: source.document_url, attestationVersion: "official-current-location-v1" } });
    expect(mounted.props.onAccepted).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Дата автоматической проверки сайта не изменена/)).toBeInTheDocument();
  });
  it("retains the same request and file after an uncertain reply, closing, collapse and updated source metadata", async () => {
    api.upload.mockRejectedValueOnce(new RtnSourceUploadError("unavailable", "Результат не подтверждён", true));
    const mounted = mount(); await fill(); fireEvent.click(screen.getByLabelText(attestation)); fireEvent.click(screen.getByRole("button", { name: "Загрузить оригинал" }));
    await screen.findByRole("alert");
    const original = api.upload.mock.calls[0][0];
    expect(screen.getByLabelText("Оригинал файла")).toBeDisabled(); expect(screen.getByLabelText("Официальный источник")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    mounted.rerender(<RtnOfficialFileUpload {...mounted.props} showTrigger={false} />);
    mounted.rerender(<RtnOfficialFileUpload {...mounted.props} workspace={{ ...workspace, sources: [{ ...source, source_generation: 7 }] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Загрузить официальный файл" }));
    fireEvent.click(screen.getByRole("button", { name: "Повторить ту же загрузку" }));
    await screen.findByText("Официальный оригинал сохранён.");
    expect(api.upload).toHaveBeenCalledTimes(2); expect(api.upload.mock.calls[1][0]).toBe(original);
    expect(original.metadata.expectedSourceGeneration).toBe(0);
  });
  it("clears the old file and attestation when a different source is selected", async () => {
    mount(); await fill(); fireEvent.click(screen.getByLabelText(attestation));
    fireEvent.change(screen.getByLabelText("Официальный источник"), { target: { value: energy.id } });
    expect(screen.getByLabelText("Оригинал файла")).toHaveAttribute("accept", expect.stringContaining(".xlsx"));
    expect((screen.getByLabelText("Оригинал файла") as HTMLInputElement).files).toHaveLength(0);
    expect(screen.getByLabelText(attestation)).not.toBeChecked(); expect(screen.getByRole("button", { name: "Загрузить оригинал" })).toBeDisabled();
  });
  it("never sends parallel requests for repeated clicks while an upload is pending", async () => {
    let complete!: (value: ReturnType<typeof saved>) => void;
    api.upload.mockImplementation((request: RtnSourceUploadRequest) => new Promise(resolve => { complete = value => resolve(value); }));
    mount(); await fill(); fireEvent.click(screen.getByLabelText(attestation));
    const submit = screen.getByRole("button", { name: "Загрузить оригинал" }); fireEvent.click(submit); fireEvent.click(submit);
    expect(api.upload).toHaveBeenCalledTimes(1); expect(screen.getByRole("button", { name: "Закрыть" })).toBeDisabled();
    await act(async () => complete(saved(api.upload.mock.calls[0][0])));
  });
  it("does not expose a late receipt or refresh another actor's workspace after the component identity changes", async () => {
    let complete!: (value: ReturnType<typeof saved>) => void;
    api.upload.mockImplementation(() => new Promise(resolve => { complete = value => resolve(value); }));
    const accepted = vi.fn(), props = { workspace, showTrigger: true, disabled: false, onAccepted: accepted, onRefresh: vi.fn() };
    const mounted = render(<RtnOfficialFileUpload key="actor-a" {...props} />);
    await fill(); fireEvent.click(screen.getByLabelText(attestation)); fireEvent.click(screen.getByRole("button", { name: "Загрузить оригинал" }));
    const original = api.upload.mock.calls[0][0], signal = api.upload.mock.calls[0][1];
    mounted.rerender(<RtnOfficialFileUpload key="actor-b" {...props} />);
    expect(signal.aborted).toBe(true);
    await act(async () => complete(saved(original)));
    expect(accepted).not.toHaveBeenCalled(); expect(screen.queryByText("Официальный оригинал сохранён.")).not.toBeInTheDocument();
  });
  it("stops a historical-file retry and clearly preserves a newer current edition", async () => {
    api.upload.mockRejectedValue(new RtnSourceUploadError("historical", "Этот файл уже заменён другой редакцией. Нужна отдельная проверка возврата; текущая редакция не изменена."));
    mount(); await fill(); fireEvent.click(screen.getByLabelText(attestation)); fireEvent.click(screen.getByRole("button", { name: "Загрузить оригинал" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("текущая редакция не изменена");
    expect(screen.getByRole("button", { name: "Загрузить оригинал" })).toBeDisabled(); expect(api.upload).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Повторить ту же загрузку" })).not.toBeInTheDocument();
  });
  it("shows an old replay as history rather than a new current-file update", async () => {
    api.upload.mockImplementation(async (request: RtnSourceUploadRequest) => ({ ...saved(request), replayed: true, still_current: false }));
    mount(); await fill(); fireEvent.click(screen.getByLabelText(attestation)); fireEvent.click(screen.getByRole("button", { name: "Загрузить оригинал" }));
    await screen.findByText("Официальный оригинал сохранён.");
    expect(screen.getByText(/Дата оригинала не обновлялась/)).toBeInTheDocument(); expect(screen.getByText(/Этот оригинал сохранён в истории/)).toBeInTheDocument();
  });
  it("does not reinterpret a saved original as an uncertain upload when only the following metadata refresh fails", async () => {
    mount({ onAccepted: vi.fn().mockRejectedValue(new Error("read failed")) }); await fill(); fireEvent.click(screen.getByLabelText(attestation)); fireEvent.click(screen.getByRole("button", { name: "Загрузить оригинал" }));
    await screen.findByText(/Оригинал сохранён, но список редакций пока не обновился/);
    expect(screen.queryByRole("button", { name: "Повторить ту же загрузку" })).not.toBeInTheDocument(); expect(api.upload).toHaveBeenCalledTimes(1);
  });
});
