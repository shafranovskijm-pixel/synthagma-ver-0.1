import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { createEmptyEducationProfile } from "@/lib/uc-compliance/model";
import { COMPLIANCE_CATALOG_VERSION, REQUIREMENTS } from "@/lib/uc-compliance/catalog";
import type { OrgDocument } from "@/hooks/useOrgDocumentsManager";
const state = vi.hoisted(() => ({ profile: {} as any, decisions: {} as any, permissions: {} as any, readProfile: vi.fn(), readDecisions: vi.fn() }));
vi.mock("@/hooks/useStaffPermissions", () => ({ useStaffPermissions: () => state.permissions }));
vi.mock("@/hooks/useEducationComplianceProfile", () => ({ useEducationComplianceProfile: (...args: unknown[]) => { state.readProfile(...args); return state.profile; } }));
vi.mock("@/hooks/useDocumentApplicabilityDecisions", () => ({ useDocumentApplicabilityDecisions: (...args: unknown[]) => { state.readDecisions(...args); return state.decisions; } }));
import { EducationCenterAssistant } from "./EducationCenterAssistant";
const upload = vi.fn(), history = vi.fn(), archive = vi.fn();
const renderAssistant = (documents: OrgDocument[] = []) => render(<EducationCenterAssistant organizationId="org" organization={{ name: "Центр" }} documents={documents} onUpload={upload} onHistory={history} onArchive={archive} />);
beforeEach(() => {
  vi.clearAllMocks();
  state.permissions = { organizationId: "org", loading: false, error: null, orgRole: "owner", isOrgOwner: true, adminRole: null, orgPermissions: new Set(["documents.read"]), can: () => true, canSeeOrgTab: () => true };
  state.profile = { data: { organization_id: "org", revision: 1, profile: createEmptyEducationProfile(), updated_at: null, updated_by: null }, loading: false, saving: false, denied: false, conflict: false, uncertain: false, error: null, save: vi.fn().mockResolvedValue(true), reload: vi.fn() };
  state.decisions = { data: [], loading: false, saving: false, denied: false, conflict: false, uncertain: false, error: null, save: vi.fn().mockResolvedValue(true), reload: vi.fn(), loadHistory: vi.fn().mockResolvedValue([]) };
  Element.prototype.scrollIntoView = vi.fn(); Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn(); Element.prototype.releasePointerCapture = vi.fn();
});
it("shows five stages but never legal completeness from every uploaded file and an unknown profile", () => {
  renderAssistant(REQUIREMENTS.map(requirement => ({ id: requirement.id, type: requirement.id, name: requirement.label, file_url: "https://example.test/file.pdf", status: "active", created_at: "2026-10-18", updated_at: "2026-10-18" })));
  for (const label of ["До старта", "Во время обучения", "При выпуске", "Периодически", "Архив"]) expect(screen.getByRole("button", { name: new RegExp(label) })).toBeVisible();
  expect(screen.queryByText(/100\s*%/)).not.toBeInTheDocument(); expect(screen.getByText(/Наличие файла не подтверждает/)).toBeVisible();
  expect(screen.getByText(/Нужно уточнить: [1-9]/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /Архив/ })); expect(screen.getByText(/Архивирование не разрешает удаление/)).toBeVisible();
});
it("reuses exact type upload and real document history callbacks without creating a new file", () => {
  const document: OrgDocument = { id: "file", type: "charter", name: "Устав", file_url: "https://example.test/file.pdf", status: "active", created_at: "2026-10-18", updated_at: "2026-10-18" };
  renderAssistant([document]); const task = screen.getByRole("article", { name: "Устав / учредительный документ" });
  fireEvent.click(within(task).getByRole("button", { name: "Загрузить файл" })); expect(upload).toHaveBeenCalledWith("charter");
  fireEvent.click(within(task).getByRole("button", { name: "Файл и версии" })); expect(history).toHaveBeenCalledWith(document);
  expect(within(task).getByRole("link", { name: "Открыть конструктор" })).toHaveAttribute("href", "/organization?tab=documents&documentView=constructor");
  expect(within(screen.getByRole("article", { name: "Приказ / основание зачисления" })).getByRole("link", { name: "Открыть рабочий раздел" })).toHaveAttribute("href", "/organization?tab=documents&documentView=orders");
});
it("does not mistake denied or failed decision reads for an empty successful evaluation", () => {
  state.decisions = { ...state.decisions, data: null, error: "Не удалось загрузить решения" }; renderAssistant();
  expect(screen.getByRole("alert")).toHaveTextContent("Не удалось загрузить решения"); expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(screen.queryByText(/Применяется:/)).not.toBeInTheDocument();
});
it("routes scoped teachers to groups and disables profile/decision reads", () => {
  state.permissions = { ...state.permissions, orgRole: "teacher", isOrgOwner: false }; renderAssistant();
  expect(screen.getByText(/Документы учеников доступны в назначенных вам группах/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Перейти к группам" })).toHaveAttribute("href", "/organization?tab=students&studentsView=groups");
  expect(state.readProfile).toHaveBeenCalledWith("org", false, false); expect(state.readDecisions.mock.lastCall?.slice(-2)).toEqual([false, false]);
  expect(screen.queryByText(/Применяется:/)).not.toBeInTheDocument();
});
it("keeps read-only users from upload/decisions while retaining history", async () => {
  state.permissions.can = (permission: string) => permission.endsWith(".read"); renderAssistant();
  const task = screen.getByRole("article", { name: "Устав / учредительный документ" });
  expect(within(task).getByRole("button", { name: "Загрузить файл" })).toBeDisabled();
  fireEvent.click(within(task).getByRole("button", { name: "История решений" }));
  await waitFor(() => expect(state.decisions.loadHistory).toHaveBeenCalledWith("charter", null));
  expect(screen.queryByRole("button", { name: "Сохранить решение" })).not.toBeInTheDocument(); expect(screen.queryByRole("combobox", { name: "Новое решение" })).not.toBeInTheDocument();
});
it("requires an explicit choice and reason, and records a stale prior reason without using it silently", async () => {
  state.decisions.data = [{ organization_id: "org", requirement_id: "charter", revision: 1, profile_revision: 0, catalog_version: COMPLIANCE_CATALOG_VERSION, decision: "not_applicable", reason: "Прежнее основание", decided_at: "2026-10-18T00:00:00Z", decided_by: "actor" }];
  renderAssistant(); const task = screen.getByRole("article", { name: "Устав / учредительный документ" });
  expect(within(task).getByText(/Прежнее решение требует пересмотра/)).toBeVisible();
  fireEvent.click(within(task).getByRole("button", { name: "Решение центра" }));
  expect(screen.getByText("Прежнее основание")).toBeVisible(); const button = screen.getByRole("button", { name: "Сохранить решение" }); expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole("combobox", { name: "Новое решение" })); fireEvent.click(await screen.findByRole("option", { name: "Не применяется" }));
  expect(button).toBeDisabled(); fireEvent.change(screen.getByLabelText("Обоснование"), { target: { value: "Новые обстоятельства" } });
  fireEvent.click(button); await waitFor(() => expect(state.decisions.save).toHaveBeenCalledWith("charter", "not_applicable", "Новые обстоятельства"));
});
it("does not claim a withdrawn decision is a current exclusion", () => {
  state.decisions.data = [{ organization_id: "org", requirement_id: "charter", revision: 2, profile_revision: 1, catalog_version: COMPLIANCE_CATALOG_VERSION, decision: null, reason: "Отозвано для проверки", decided_at: "2026-10-18T00:00:00Z", decided_by: "actor" }];
  renderAssistant(); const task = screen.getByRole("article", { name: "Устав / учредительный документ" });
  expect(within(task).getByText("Прежнее решение отозвано.")).toBeVisible(); expect(within(task).getByText("Нужно уточнить", { exact: true })).toBeVisible();
});
it.each([{ status: "archived" }, { status: "active", expires_at: "2020-01-01" }])("keeps archived/expired file history accessible without claiming active evidence", changes => {
  const document: OrgDocument = { id: "old-file", type: "charter", name: "Прежний устав", file_url: "https://example.test/file.pdf", created_at: "2019-01-01", updated_at: "2019-01-01", ...changes };
  renderAssistant([document]); const task = screen.getByRole("article", { name: "Устав / учредительный документ" });
  expect(within(task).getByText(/Есть прежний файл/)).toBeVisible();
  expect(within(task).queryByText(/^Файл есть/)).not.toBeInTheDocument();
  fireEvent.click(within(task).getByRole("button", { name: "Файл и версии" })); expect(history).toHaveBeenCalledWith(document);
});
it("provides a practical archive checklist and existing navigation without creating a 33rd requirement", () => {
  renderAssistant(); fireEvent.click(screen.getByRole("button", { name: /Архив/ }));
  const task = screen.getByRole("article", { name: "Подготовить дело к архивному хранению" });
  expect(within(task).getAllByRole("listitem")).toHaveLength(3);
  expect(within(task).getByText(/не назначает единый срок/)).toBeVisible();
  expect(within(task).getByRole("link", { name: "Архив приказов" })).toHaveAttribute("href", "/organization?tab=documents&documentView=orders");
  expect(within(task).getByRole("link", { name: "Архив протоколов" })).toHaveAttribute("href", "/organization?tab=documents&documentView=protocols");
  fireEvent.click(within(task).getByRole("link", { name: "Показать архивные файлы" })); expect(archive).toHaveBeenCalledOnce();
  expect(within(task).queryByRole("button", { name: "Решение центра" })).not.toBeInTheDocument(); expect(state.decisions.save).not.toHaveBeenCalled(); expect(REQUIREMENTS).toHaveLength(32);
});
