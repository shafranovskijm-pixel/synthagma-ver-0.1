import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { RtnBank } from "@/types/rostechnadzor";
import { RtnBankFreshness } from "./RtnBankFreshness";
afterEach(cleanup);

it("shows the exclusive normative instant in Moscow time rather than suggesting the whole displayed day remains available", () => {
  const bank: RtnBank = {
    id: "bank", code: "A.1", title: "Технический модуль", domain: "industrial-safety", source_id: "source",
    source_revision_id: "source-revision", bank_revision_id: "bank-revision", source_url: null,
    approved_on: null, effective_from: "2026-11-20", question_count: 1, release_id: "release",
    key_status: "released", normative_status: "current", available_for_training: true, can_manual_check: false,
    last_checked_at: null, last_success_at: null, check_status: null, approval_policy: "source-tracked-v2",
    legal_validity: "bounded", legal_cutoff_at: "2026-11-22T21:00:00Z", editorial_review_before: "2026-11-25", editorial_status: "scheduled",
  };
  render(<RtnBankFreshness bank={bank} officialUrl={null} details />);
  expect(screen.getByText(/Новые попытки доступны до/)).toHaveTextContent("до 23.11.2026, 00:00 МСК, не включая этот момент");
});

describe("manual source acquisition", () => {
  const bank: RtnBank = {
    id: "bank", code: "A.1", title: "Технический модуль", domain: "industrial-safety", source_id: "source",
    source_revision_id: "selected-source-revision", bank_revision_id: "bank-revision", source_url: null,
    approved_on: null, effective_from: "2026-11-20", question_count: 1, release_id: "release", published_at: "2026-11-21T10:00:00Z",
    key_status: "released", normative_status: "current", available_for_training: true, can_manual_check: false,
    last_checked_at: "2026-11-22T12:00:00Z", last_success_at: null, check_status: "error",
    source_acquisition_method: "admin_upload", source_received_at: "2026-11-22T14:01:28Z",
  };
  it("explains failed automatic verification while retaining a received, released manual original and real course date", () => {
    render(<RtnBankFreshness bank={bank} officialUrl={null} />);
    expect(screen.getByText("Источник проверен").nextElementSibling).toHaveTextContent("Не подтверждено");
    expect(screen.getByText("Курс обновлён").nextElementSibling).toHaveTextContent("21.11.2026");
    expect(screen.getByText(/Файл загружен администратором:/)).toHaveTextContent("22.11.2026, 17:01 МСК");
    expect(screen.getByText(/Автоматическая проверка источника недоступна/)).toHaveTextContent("Используется официальный файл, загруженный администратором");
    expect(screen.queryByText(/Актуальность вопросов пока не подтверждена/)).not.toBeInTheDocument();
  });
  it("does not imply a reviewed course is ready merely because its original was uploaded", () => {
    render(<RtnBankFreshness bank={{ ...bank, release_id: null, published_at: null }} officialUrl={null} />);
    expect(screen.getByText("Курс обновлён").nextElementSibling).toHaveTextContent("Не подтверждено");
    expect(screen.getByText(/Автоматическая проверка источника недоступна/)).toHaveTextContent("учебная редакция ещё не выпущена");
  });
  it("keeps an unknown acquisition explicit rather than inventing a manual-origin claim", () => {
    render(<RtnBankFreshness bank={{ ...bank, source_acquisition_method: "unknown", source_received_at: null, release_id: null }} officialUrl={null} />);
    expect(screen.queryByText(/Файл загружен администратором:/)).not.toBeInTheDocument();
    expect(screen.getByText(/Не удалось сверить официальный источник/)).toBeInTheDocument();
  });
});
