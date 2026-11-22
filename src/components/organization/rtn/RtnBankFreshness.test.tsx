import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
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
