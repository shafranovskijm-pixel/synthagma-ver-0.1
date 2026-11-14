import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RtnApiError } from "@/api/rostechnadzor";
import { StudentRtnCourses } from "./StudentRtnCourses";
import type { RtnAssignmentDetail, RtnAttempt, RtnStudentAssignment } from "@/types/rostechnadzor";

const api = vi.hoisted(() => ({ getRtnStudentWorkspace: vi.fn(), getRtnAssignment: vi.fn(), startRtnAttempt: vi.fn(), getRtnAttempt: vi.fn(), submitRtnAttempt: vi.fn(), hydrateRtnAttempt: vi.fn(), getRtnAttemptDraft: vi.fn(), saveRtnAttemptDraft: vi.fn(), recordRtnMaterialOpen: vi.fn() }));
vi.mock("@/api/rostechnadzor", () => ({ ...api, RtnApiError: class extends Error { constructor(readonly code: string, message: string) { super(message); } } }));

const assignment: RtnStudentAssignment = {
  id: "assignment-a", assignment_id: "assignment-a", organization_id: "org-a", bank_id: "bank-a", code: "А.1-116-ФЗ",
  title: "Основы безопасности · учебный модуль", status: "assigned", assigned_at: "2026-11-14T09:00:00Z",
  access_allowed: true, last_attempt_id: null, last_score: null, last_passed: null,
  can_start: true, normative_status: "current", normative_cutoff_at: "2026-11-21T00:00:00+03:00",
};
const material = { id: "section-a", title: "Обязанности эксплуатирующей организации", body: "Организация обязана соблюдать требования промышленной безопасности.", source_refs: [{ url: "http://publication.pravo.gov.ru/document/116", citation: "Федеральный закон №116-ФЗ, статья 9" }] };
const detail: RtnAssignmentDetail = { assignment, release: { id: "release-a", effective_from: "2026-11-14", question_count: 2 }, source: { page_url: "https://www.gosnadzor.ru/industrial/", document_url: "https://www.gosnadzor.ru/industrial/questions.pdf", approved_on: null }, materials: [material] };
const attempt: RtnAttempt = {
  attempt_id: "attempt-a", assignment_id: "assignment-a", release_id: "release-a", status: "active", started_at: "2026-11-14T09:00:00Z", materials: [material],
  questions: [
    { id: "q1", number: 10, text: "Выберите обязанности", expected_correct_count: 2, options_origin: "authorial_training", options: [{ id: "a", text: "Соблюдать требования" }, { id: "b", text: "Поддерживать готовность" }, { id: "wrong", text: "Игнорировать требования" }] },
    { id: "q2", number: 21, text: "Выберите один ответ", expected_correct_count: 1, options: [{ id: "c", text: "Действовать по инструкции" }, { id: "d", text: "Отменить инструкцию" }] },
  ],
};
const submitted = { ...attempt, status: "submitted" as const, score: 50, correct: 1, total: 2, passed: false, submitted_at: "2026-11-14T10:00:00Z", feedback: [{ id: "q1", explanation: "Обязанности установлены законом.", evidence: material.source_refs }] };

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { ...render(<StudentRtnCourses userId="user-a" organizationId="org-a" />, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }), client };
}
async function openQuestions() {
  fireEvent.click(await screen.findByRole("button", { name: "Открыть обучение" }));
  await screen.findByRole("region", { name: "Учебные материалы" });
  fireEvent.click(screen.getByRole("button", { name: "Перейти к учебным вопросам" }));
  await screen.findByText("10. Выберите обязанности");
}
function answerAll() {
  fireEvent.click(screen.getByLabelText("Соблюдать требования"));
  fireEvent.click(screen.getByLabelText("Поддерживать готовность"));
  fireEvent.click(screen.getByLabelText("Действовать по инструкции"));
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getRtnStudentWorkspace.mockResolvedValue({ access: { allowed: true }, assignments: [assignment] });
  api.getRtnAssignment.mockResolvedValue(detail);
  api.startRtnAttempt.mockResolvedValue(attempt);
  api.getRtnAttempt.mockResolvedValue(submitted);
  api.submitRtnAttempt.mockResolvedValue(submitted);
  api.getRtnAttemptDraft.mockResolvedValue({ attempt_id: "attempt-a", status: "active", revision: 0, answers: {}, saved_at: null });
  api.hydrateRtnAttempt.mockImplementation(async loaded => {
    if (loaded.status === "submitted") return loaded;
    const saved = await api.getRtnAttemptDraft(loaded.attempt_id);
    return { ...loaded, answers: saved.answers, draft_revision: saved.revision };
  });
  api.saveRtnAttemptDraft.mockImplementation(async (id, answers, revision) => ({ attempt_id: id, status: "active", answers, revision: revision + 1, saved_at: "2026-11-14T10:00:00Z" }));
  api.recordRtnMaterialOpen.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("assigned RTN learner course", () => {
  it("preserves unsaved choices through a background workspace error and pauses new actions until recovery", async () => {
    const view = mount(); await openQuestions();
    fireEvent.click(screen.getByLabelText("Соблюдать требования"));
    api.getRtnStudentWorkspace.mockRejectedValue(new Error("Background network outage"));
    await act(async () => { await view.client.refetchQueries({ queryKey: ["rtn-student-workspace", "user-a", "org-a"] }); });
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByText(/Выбранные ответы и состояние отправки остаются в этом окне/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Соблюдать требования")).not.toBeInTheDocument();
    const unloading = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unloading); expect(unloading.defaultPrevented).toBe(true);
    api.getRtnStudentWorkspace.mockResolvedValue({ access: { allowed: true }, assignments: [assignment] });
    fireEvent.click(within(dialog).getByRole("button", { name: "Проверить доступ" }));
    expect(await screen.findByLabelText("Соблюдать требования")).toBeChecked();
    await waitFor(() => expect(api.saveRtnAttemptDraft).toHaveBeenCalledWith("attempt-a", { q1: ["a"] }, 0));
    expect(api.startRtnAttempt).toHaveBeenCalledTimes(1);
  });

  it("protects frozen answers while final submission is pending or its outcome is uncertain", async () => {
    let finish: (value: unknown) => void = () => {};
    api.submitRtnAttempt.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    mount(); await openQuestions(); answerAll();
    fireEvent.click(screen.getByRole("button", { name: "Завершить и отправить результат" }));
    await waitFor(() => expect(api.submitRtnAttempt).toHaveBeenCalled());
    const unloading = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unloading);
    expect(unloading.defaultPrevented).toBe(true);
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    finish(submitted);
    await screen.findByText("50% · 1 из 2");
    const afterFinal = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(afterFinal); expect(afterFinal.defaultPrevented).toBe(false);
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("blocks new attempts awaiting normative review while preserving access to a previous result", async () => {
    api.getRtnStudentWorkspace.mockResolvedValue({ access: { allowed: true }, assignments: [{ ...assignment, status: "completed", last_attempt_id: "attempt-old", can_start: false, normative_status: "review_required" }] });
    api.getRtnAttempt.mockResolvedValue({ ...submitted, attempt_id: "attempt-old", answers: { q1: ["a"], q2: ["c"] } });
    mount();
    expect(await screen.findByRole("button", { name: "Пройти ещё раз" })).toBeDisabled();
    expect(screen.getByText(/начатые попытки и результаты сохранены/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Результат" }));
    expect(await screen.findByText("50% · 1 из 2")).toBeInTheDocument();
    expect(api.startRtnAttempt).not.toHaveBeenCalled();
  });

  it("keeps an unsaved attempt open when Escape is pressed and permits closing after save", async () => {
    let finish: (value: unknown) => void = () => {};
    api.saveRtnAttemptDraft.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    mount(); await openQuestions();
    fireEvent.click(screen.getByLabelText("Соблюдать требования"));
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByText(/Дождитесь подтверждения или повторите действие перед закрытием/)).toBeInTheDocument();
    await waitFor(() => expect(api.saveRtnAttemptDraft).toHaveBeenCalled());
    finish({ attempt_id: "attempt-a", status: "active", revision: 1, answers: { q1: ["a"] }, saved_at: "now" });
    await screen.findByText("Ответы сохранены на сервере. Можно продолжить на другом устройстве.");
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("does not log menu browsing as study and records actual opened material without starting a test", async () => {
    mount();
    await screen.findByRole("button", { name: "Открыть обучение" });
    expect(api.recordRtnMaterialOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Открыть обучение" }));
    await screen.findByText(material.body);
    await waitFor(() => expect(api.recordRtnMaterialOpen).toHaveBeenCalledWith("assignment-a", "release-a"));
    expect(api.startRtnAttempt).not.toHaveBeenCalled();
  });

  it("saves partial choices and restores them after closing and reopening the learner cabinet", async () => {
    let saved = { attempt_id: "attempt-a", status: "active", revision: 0, answers: {}, saved_at: null };
    api.getRtnAttemptDraft.mockImplementation(async () => saved);
    api.saveRtnAttemptDraft.mockImplementation(async (id, answers, revision) => (saved = { attempt_id: id, status: "active", answers, revision: revision + 1, saved_at: "now" }));
    const first = mount();
    await openQuestions();
    fireEvent.click(screen.getByLabelText("Соблюдать требования"));
    await waitFor(() => expect(api.saveRtnAttemptDraft).toHaveBeenCalledWith("attempt-a", { q1: ["a"] }, 0));
    await screen.findByText("Ответы сохранены на сервере. Можно продолжить на другом устройстве.");
    first.unmount();
    api.getRtnStudentWorkspace.mockResolvedValue({ access: { allowed: true }, assignments: [{ ...assignment, status: "in_progress", last_attempt_id: "attempt-a" }] });
    api.getRtnAttempt.mockResolvedValue(attempt);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Продолжить" }));
    expect(await screen.findByLabelText("Соблюдать требования")).toBeChecked();
    expect(screen.getByLabelText("Поддерживать готовность")).not.toBeChecked();
    expect(api.startRtnAttempt).toHaveBeenCalledTimes(1);
  });

  it("retries the exact uncertain autosave before sending newer local choices", async () => {
    api.saveRtnAttemptDraft.mockRejectedValueOnce(new Error("Network timeout"));
    mount(); await openQuestions();
    fireEvent.click(screen.getByLabelText("Соблюдать требования"));
    await screen.findByRole("button", { name: "Повторить сохранение ответов" });
    fireEvent.click(screen.getByLabelText("Поддерживать готовность"));
    fireEvent.click(screen.getByRole("button", { name: "Повторить сохранение ответов" }));
    await waitFor(() => expect(api.saveRtnAttemptDraft).toHaveBeenCalledTimes(3), { timeout: 2000 });
    expect(api.saveRtnAttemptDraft.mock.calls[0]).toEqual(api.saveRtnAttemptDraft.mock.calls[1]);
    expect(api.saveRtnAttemptDraft.mock.calls[2]).toEqual(["attempt-a", { q1: ["a", "b"] }, 1]);
  });

  it("stops a device conflict and requires explicit loading of the saved remote choices", async () => {
    api.saveRtnAttemptDraft.mockRejectedValueOnce(new RtnApiError("conflict", "Ответы изменились на другом устройстве"));
    mount(); await openQuestions();
    fireEvent.click(screen.getByLabelText("Соблюдать требования"));
    const reload = await screen.findByRole("button", { name: "Загрузить ответы с сервера" });
    expect(screen.getByLabelText("Поддерживать готовность")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Завершить и отправить результат" })).toBeDisabled();
    api.getRtnAttempt.mockResolvedValue(attempt);
    api.getRtnAttemptDraft.mockResolvedValue({ attempt_id: "attempt-a", status: "active", revision: 9, answers: { q1: ["wrong"] }, saved_at: "now" });
    fireEvent.click(reload);
    await waitFor(() => expect(screen.getByLabelText("Игнорировать требования")).toBeChecked());
    expect(screen.getByLabelText("Соблюдать требования")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("Действовать по инструкции"));
    await waitFor(() => expect(api.saveRtnAttemptDraft).toHaveBeenLastCalledWith("attempt-a", { q1: ["wrong"], q2: ["c"] }, 9));
  });

  it("uses the authoritative final answers when another device submits during autosave", async () => {
    api.saveRtnAttemptDraft.mockResolvedValue({ attempt_id: "attempt-a", status: "submitted", revision: 2, answers: { q1: ["wrong"], q2: ["d"] }, saved_at: "now" });
    api.getRtnAttempt.mockResolvedValue({ ...submitted, answers: { q1: ["wrong"], q2: ["d"] } });
    mount(); await openQuestions();
    fireEvent.click(screen.getByLabelText("Соблюдать требования"));
    expect(await screen.findByText("50% · 1 из 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Посмотреть свои ответы" }));
    expect(screen.getByLabelText("Игнорировать требования")).toBeChecked();
    expect(screen.getByLabelText("Соблюдать требования")).not.toBeChecked();
    expect(api.submitRtnAttempt).not.toHaveBeenCalled();
  });

  it("shows current-organization assignments and reads real material before starting an attempt", async () => {
    api.getRtnStudentWorkspace.mockResolvedValue({ access: { allowed: true }, assignments: [assignment, { ...assignment, id: "other", organization_id: "org-b", title: "Чужой контур" }] });
    mount();
    expect(await screen.findByText(/Основы безопасности/)).toBeInTheDocument();
    expect(screen.queryByText(/Чужой контур/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Открыть обучение" }));
    expect(await screen.findByText(material.body)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: material.source_refs[0].citation })).toHaveAttribute("href", material.source_refs[0].url);
    expect(api.startRtnAttempt).not.toHaveBeenCalled();
  });

  it("does not start a quiz-only course if its real materials are missing", async () => {
    api.getRtnAssignment.mockResolvedValue({ ...detail, materials: [] });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Открыть обучение" }));
    expect(await screen.findByRole("button", { name: "Перейти к учебным вопросам" })).toBeDisabled();
    expect(api.startRtnAttempt).not.toHaveBeenCalled();
  });

  it("keeps the primary law portal clickable without allowing credential-bearing source links", async () => {
    api.getRtnAssignment.mockResolvedValue({ ...detail, materials: [{ ...material, source_refs: [
      { url: "http://pravo.gov.ru/proxy/ips/?docbody=&nd=102048376", citation: "Первичная публикация закона" },
      { url: "http://actual.pravo.gov.ru/fixture-document", citation: "Официальная актуальная редакция" },
      { url: "http://actual.pravo.gov.ru.evil.test/fixture-document", citation: "Поддельный домен" },
      { url: "https://user:password@example.org/private", citation: "Непроверенная ссылка с реквизитами" },
    ] }] });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Открыть обучение" }));
    expect(await screen.findByRole("link", { name: "Первичная публикация закона" })).toHaveAttribute("href", "http://pravo.gov.ru/proxy/ips/?docbody=&nd=102048376");
    expect(screen.getByRole("link", { name: "Официальная актуальная редакция" })).toHaveAttribute("href", "http://actual.pravo.gov.ru/fixture-document");
    expect(screen.queryByRole("link", { name: "Поддельный домен" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Непроверенная ссылка с реквизитами" })).not.toBeInTheDocument();
  });

  it("supports multiple answers, identifies authorial options, and uses only the server score", async () => {
    mount();
    await openQuestions();
    expect(screen.getByText(/Варианты ответов разработаны СИНТАГМОЙ/)).toBeInTheDocument();
    const finish = screen.getByRole("button", { name: "Завершить и отправить результат" });
    expect(finish).toBeDisabled();
    answerAll();
    fireEvent.click(finish);
    await waitFor(() => expect(api.submitRtnAttempt).toHaveBeenCalledWith("attempt-a", { q1: ["a", "b"], q2: ["c"] }));
    expect(await screen.findByText("50% · 1 из 2")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Результат учебной попытки" })).toHaveTextContent("Не зачтено");
    expect(await screen.findByText("Обязанности установлены законом.")).toBeInTheDocument();
    expect(api.startRtnAttempt).toHaveBeenCalledTimes(1);
  });

  it("resumes the exact existing active snapshot without starting another attempt", async () => {
    api.getRtnStudentWorkspace.mockResolvedValue({ access: { allowed: true }, assignments: [{ ...assignment, status: "in_progress", last_attempt_id: "attempt-old" }] });
    api.getRtnAttempt.mockResolvedValue({ ...attempt, attempt_id: "attempt-old", release_id: "old-release" });
    api.getRtnAttemptDraft.mockResolvedValue({ attempt_id: "attempt-old", status: "active", revision: 7, answers: { q1: ["a"] }, saved_at: "now" });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Продолжить" }));
    expect(await screen.findByText("Редакция: old-release")).toBeInTheDocument();
    expect(screen.getByLabelText("Соблюдать требования")).toBeChecked();
    expect(api.getRtnAttempt).toHaveBeenCalledWith("attempt-old");
    expect(api.startRtnAttempt).not.toHaveBeenCalled();
  });

  it("resolves a lost submission response by reading the same committed attempt", async () => {
    api.submitRtnAttempt.mockRejectedValue(new Error("Network timeout"));
    api.getRtnAttempt.mockResolvedValue(submitted);
    mount(); await openQuestions(); answerAll();
    fireEvent.click(screen.getByRole("button", { name: "Завершить и отправить результат" }));
    expect(await screen.findByText("50% · 1 из 2")).toBeInTheDocument();
    expect(api.submitRtnAttempt).toHaveBeenCalledTimes(1);
    expect(api.getRtnAttempt).toHaveBeenCalledWith("attempt-a");
    expect(api.startRtnAttempt).toHaveBeenCalledTimes(1);
  });

  it("retries an uncertain submission with identical frozen answers", async () => {
    api.submitRtnAttempt.mockRejectedValueOnce(new Error("Сеть недоступна")).mockResolvedValueOnce(submitted);
    api.getRtnAttempt.mockRejectedValue(new Error("Сеть недоступна"));
    mount(); await openQuestions(); answerAll();
    fireEvent.click(screen.getByRole("button", { name: "Завершить и отправить результат" }));
    const retry = await screen.findByRole("button", { name: "Повторить отправку" });
    expect(screen.getByLabelText("Соблюдать требования")).toBeDisabled();
    fireEvent.click(retry);
    expect(await screen.findByText("50% · 1 из 2")).toBeInTheDocument();
    expect(api.submitRtnAttempt.mock.calls[0]).toEqual(api.submitRtnAttempt.mock.calls[1]);
  });

  it("pairs a remotely submitted score with authoritative saved answers instead of the local draft", async () => {
    api.submitRtnAttempt.mockRejectedValue(new Error("Другой ответ уже отправлен с другого устройства"));
    api.getRtnAttempt.mockResolvedValue({ ...submitted, answers: { q1: ["wrong", "b"], q2: ["d"] } });
    mount(); await openQuestions(); answerAll();
    fireEvent.click(screen.getByRole("button", { name: "Завершить и отправить результат" }));
    expect(await screen.findByText("50% · 1 из 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Посмотреть свои ответы" }));
    expect(screen.getByLabelText("Соблюдать требования")).not.toBeChecked();
    expect(screen.getByLabelText("Игнорировать требования")).toBeChecked();
    expect(screen.getByLabelText("Отменить инструкцию")).toBeChecked();
  });

  it("shows a previous result without creating an attempt or assigning a new score", async () => {
    api.getRtnStudentWorkspace.mockResolvedValue({ access: { allowed: true }, assignments: [{ ...assignment, status: "completed", last_attempt_id: "attempt-old", last_score: 50, last_passed: false }] });
    api.getRtnAttempt.mockResolvedValue({ ...submitted, attempt_id: "attempt-old", release_id: "old-release", answers: { q1: ["a"], q2: ["c"] } });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Результат" }));
    expect(await screen.findByText("50% · 1 из 2")).toBeInTheDocument();
    expect(screen.getByText("Редакция: old-release")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Посмотреть свои ответы" }));
    expect(screen.getByLabelText("Соблюдать требования")).toBeChecked();
    expect(api.startRtnAttempt).not.toHaveBeenCalled();
    expect(api.submitRtnAttempt).not.toHaveBeenCalled();
  });

  it("does not open suspended assignments and reports a failed workspace read without stale cards", async () => {
    api.getRtnStudentWorkspace.mockResolvedValue({ access: { allowed: true }, assignments: [{ ...assignment, access_allowed: false }] });
    mount();
    expect(await screen.findByText(/Доступ к обучению сейчас не подтверждён/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Открыть обучение" })).not.toBeInTheDocument();
    expect(api.startRtnAttempt).not.toHaveBeenCalled();
  });
});
