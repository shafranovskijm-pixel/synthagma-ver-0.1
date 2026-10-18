import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { EducationProfileDialog } from "./EducationProfileDialog";
import { createEmptyEducationProfile } from "@/lib/uc-compliance/model";
import type { OrgDocument } from "@/hooks/useOrgDocumentsManager";

const save = vi.fn(), close = vi.fn();
const snapshot = () => ({ organization_id: "org", revision: 0, updated_at: null, updated_by: null, profile: createEmptyEducationProfile() });
const props = () => ({ open: true, onOpenChange: vi.fn(), snapshot: snapshot(), organization: { name: "ООО Учебный центр", inn: "1234567890", ogrn: "123", legal_address: "Адрес" }, documents: [] as OrgDocument[], canWrite: true, saving: false, conflict: false, uncertain: false, error: null, onSave: save, onReload: vi.fn(), onClose: close });
beforeEach(() => {
  save.mockReset().mockResolvedValue(true); close.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn(); Element.prototype.releasePointerCapture = vi.fn();
});
it("does not infer any legal facts from existing requisites", async () => {
  render(<EducationProfileDialog {...props()} />);
  expect(screen.getByText("ООО Учебный центр")).toBeVisible();
  expect(screen.getByRole("combobox", { name: "Организационная форма" })).toHaveTextContent("Не указано");
  fireEvent.click(screen.getByRole("button", { name: "Сохранить профиль" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(createEmptyEducationProfile())); expect(close).toHaveBeenCalledOnce();
});
it("distinguishes unknown program types from an explicit empty selection", async () => {
  render(<EducationProfileDialog {...props()} />);
  const programs = screen.getByRole("group", { name: "Виды программ" });
  fireEvent.click(within(programs).getByRole("button", { name: "Ничего из перечисленного" }));
  fireEvent.click(screen.getByRole("button", { name: "Сохранить профиль" }));
  await waitFor(() => expect(save).toHaveBeenLastCalledWith({ ...createEmptyEducationProfile(), programTypes: [] }));
  fireEvent.click(within(programs).getByRole("button", { name: "Сведения неизвестны" }));
  fireEvent.click(screen.getByRole("button", { name: "Сохранить профиль" }));
  await waitFor(() => expect(save).toHaveBeenLastCalledWith(createEmptyEducationProfile()));
});
it("retains the selected historical evidence version when a file has a newer version", async () => {
  const base = props(); base.snapshot.profile.license.evidenceDocumentId = "00000000-0000-4000-8000-000000000001";
  base.snapshot.profile.license.evidenceVersionId = "00000000-0000-4000-8000-000000000002";
  base.documents = [{ id: base.snapshot.profile.license.evidenceDocumentId, name: "Основание", current_version_id: "00000000-0000-4000-8000-000000000003" } as OrgDocument];
  render(<EducationProfileDialog {...base} />);
  fireEvent.click(screen.getByRole("button", { name: "Сохранить профиль" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(base.snapshot.profile));
});
it("uses the explicitly selected file's current version as evidence", async () => {
  const base = props(); const document = { id: "00000000-0000-4000-8000-000000000001", name: "Основание лицензии", current_version_id: "00000000-0000-4000-8000-000000000002" } as OrgDocument;
  base.documents = [document]; render(<EducationProfileDialog {...base} />);
  fireEvent.click(screen.getByRole("button", { name: "Лицензия или основание исключения" }));
  fireEvent.click(screen.getByRole("combobox", { name: "Документ-основание из файлов центра" }));
  fireEvent.click(await screen.findByRole("option", { name: document.name }));
  fireEvent.click(screen.getByRole("button", { name: "Сохранить профиль" }));
  await waitFor(() => expect(save.mock.lastCall?.[0].license).toMatchObject({ evidenceDocumentId: document.id, evidenceVersionId: document.current_version_id }));
});
it("keeps read-only and conflict forms from editing or saving", () => {
  const base = props(); const view = render(<EducationProfileDialog {...base} canWrite={false} />);
  expect(screen.queryByRole("button", { name: "Сохранить профиль" })).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Организационная форма" })).toBeDisabled();
  view.rerender(<EducationProfileDialog {...base} conflict />);
  expect(screen.getByRole("button", { name: "Сохранить профиль" })).toBeDisabled(); expect(save).not.toHaveBeenCalled();
});
it("replaces an unsaved draft after switching organization", async () => {
  const base = props(); const view = render(<EducationProfileDialog {...base} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Виды программ: Повышение квалификации" }));
  view.rerender(<EducationProfileDialog {...base} snapshot={{ ...snapshot(), organization_id: "other" }} />);
  fireEvent.click(screen.getByRole("button", { name: "Сохранить профиль" }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(createEmptyEducationProfile()));
});
it("views a historical profile read-only and returns to current facts without restoring it", async () => {
  const base = props(); base.snapshot.revision = 3;
  const old = { ...snapshot(), revision: 1, profile: { ...createEmptyEducationProfile(), legalForm: "individual_entrepreneur" as const } };
  const loadHistory = vi.fn().mockResolvedValue([old]);
  render(<EducationProfileDialog {...base} loadHistory={loadHistory} />);
  fireEvent.click(screen.getByText("История профиля"));
  fireEvent.click(await screen.findByRole("button", { name: /Версия 1/ }));
  expect(screen.getByRole("combobox", { name: "Организационная форма" })).toHaveTextContent("Индивидуальный предприниматель");
  expect(screen.getByRole("combobox", { name: "Организационная форма" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Сохранить профиль" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Вернуться к текущему профилю" }));
  expect(screen.getByRole("combobox", { name: "Организационная форма" })).toHaveTextContent("Не указано"); expect(save).not.toHaveBeenCalled();
});
