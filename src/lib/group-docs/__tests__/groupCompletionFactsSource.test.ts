import { describe, expect, it, vi } from "vitest";
import { loadGroupCompletionFacts, type CompletionFactsReader } from "../../../../supabase/functions/_shared/docx-ooxml/groupCompletionFactsSource";
import type { EnrollmentFactRow } from "../../../../supabase/functions/_shared/docx-ooxml/groupDocumentFactsSource";
import type { GroupRegistrationFactsRecord } from "../../../../supabase/functions/_shared/docx-ooxml/groupRegistrationFacts";

const scope = { organizationId: "org", courseId: "course", studentUserIds: ["u1"] };
const enrollment = (id = "e1", user_id = "u1"): EnrollmentFactRow => ({
  id, user_id, course_id: "course", status: "completed", progress: 100,
  started_at: "2026-09-01T00:00:00Z", completed_at: "2026-09-03T00:00:00Z",
});
const lesson = (id = "final", order_index = 10) => ({
  id, course_id: "course", type: "test", order_index, test_passing_score: 60,
  updated_at: "2026-08-01T00:00:00Z",
});
const attempt = (id = "a1", user_id = "u1") => ({
  id, user_id, lesson_id: "final", score: 8, max_score: 10, completed_at: "2026-09-02T00:00:00Z",
});
const record = (id = "r1", enrollment_id = "e1", user_id = "u1"): GroupRegistrationFactsRecord => ({
  id, enrollment_id, user_id, organization_id: "org", course_id: "course", group_id: "group",
  document_status: "original", deleted_at: null, full_name: "Ученик", birth_date: null,
  document_type: "certificate", document_series: null, document_number: "1", reg_number: "1",
  issue_date: "2026-09-03", order_number: null, order_date: null, specialty_name: "Курс",
});
const page = <T,>(data: T[], count = data.length) => ({ data, count, error: null });
const input = () => ({ scope, enrollments: [enrollment()], fillMode: "data" as const });
const readers = (): CompletionFactsReader => ({
  lessons: vi.fn().mockResolvedValue(page([lesson()])),
  attempts: vi.fn().mockResolvedValue(page([attempt()])),
  records: vi.fn().mockResolvedValue(page([record()])),
});

describe("completion facts source reads", () => {
  it("blank mode performs no queries", async () => {
    const reader = readers();
    const result = await loadGroupCompletionFacts({ ...input(), fillMode: "blank" }, reader);
    Object.values(reader).forEach((read) => expect(read).not.toHaveBeenCalled());
    expect(result).toEqual({ lessons: [], testAttempts: [], educationDocumentRecords: [], sourceIssues: [] });
  });

  it("reads exact scopes and the enrollment start boundary", async () => {
    const reader = readers();
    const result = await loadGroupCompletionFacts(input(), reader);
    expect(reader.lessons).toHaveBeenCalledWith({ courseId: "course", from: 0, to: 199 });
    expect(reader.attempts).toHaveBeenCalledWith({ lessonId: "final", studentUserIds: ["u1"], completedSince: "2026-09-01T00:00:00.000Z", from: 0, to: 199 });
    expect(reader.records).toHaveBeenCalledWith({ organizationId: "org", enrollmentIds: ["e1"], from: 0, to: 199 });
    expect(result.sourceIssues).toEqual([]);
    expect(result.testAttempts).toEqual([attempt()]);
    expect(result.educationDocumentRecords).toEqual([record()]);
  });

  it("paginates every source by actual received count", async () => {
    const reader = readers();
    reader.lessons = vi.fn().mockResolvedValueOnce(page([lesson("early", 1)], 2)).mockResolvedValueOnce(page([lesson()], 2));
    reader.attempts = vi.fn().mockResolvedValueOnce(page([attempt("a1")], 2)).mockResolvedValueOnce(page([attempt("a2")], 2));
    reader.records = vi.fn().mockResolvedValueOnce(page([record("r1")], 2)).mockResolvedValueOnce(page([record("r2")], 2));
    const result = await loadGroupCompletionFacts(input(), reader);
    for (const read of Object.values(reader)) expect(read).toHaveBeenNthCalledWith(2, expect.objectContaining({ from: 1, to: 200 }));
    expect(result.sourceIssues).toEqual([]);
    expect(result.testAttempts).toHaveLength(2);
    expect(result.educationDocumentRecords).toHaveLength(2);
  });

  it("chunks more than 100 users and enrollment IDs without dropping rows", async () => {
    const users = Array.from({ length: 205 }, (_, i) => `u${String(i).padStart(3, "0")}`);
    const reader = readers();
    reader.attempts = vi.fn<CompletionFactsReader["attempts"]>(async (request) => page(request.studentUserIds.map((u) => attempt(`a-${u}`, u))));
    reader.records = vi.fn<CompletionFactsReader["records"]>(async (request) => page(request.enrollmentIds.map((e) => record(`r-${e}`, e, e.slice(2)))));
    const result = await loadGroupCompletionFacts({ ...input(), scope: { ...scope, studentUserIds: users }, enrollments: users.map((u) => enrollment(`e-${u}`, u)) }, reader);
    expect(reader.attempts).toHaveBeenCalledTimes(3);
    expect(reader.records).toHaveBeenCalledTimes(3);
    expect(result.testAttempts).toHaveLength(205);
    expect(result.educationDocumentRecords).toHaveLength(205);
    expect(result.sourceIssues).toEqual([]);
  });

  it.each(["count changed", "duplicate ID", "empty page", "SQL error", "network error"])("discards all partial attempts after %s and retains records", async (kind) => {
    const read = vi.fn().mockResolvedValueOnce(page([attempt()], 2));
    if (kind === "network error") read.mockRejectedValueOnce(new Error("private transport"));
    else read.mockResolvedValueOnce(kind === "count changed" ? page([attempt("a2")], 3)
      : kind === "duplicate ID" ? page([attempt()], 2)
      : kind === "SQL error" ? { data: [attempt("a2")], count: 2, error: { message: "private SQL" } } : page([], 2));
    const result = await loadGroupCompletionFacts(input(), { ...readers(), attempts: read });
    expect(result.testAttempts).toEqual([]);
    expect(result.educationDocumentRecords).toEqual([record()]);
    expect(result.sourceIssues).toEqual([expect.objectContaining({ source: "test_attempts" })]);
    expect(JSON.stringify(result.sourceIssues)).not.toContain("private");
  });

  it.each([
    ["another course lesson", "lessons", { ...lesson(), course_id: "foreign" }],
    ["not a test", "lessons", { ...lesson(), type: "text" }],
    ["another lesson attempt", "attempts", { ...attempt(), lesson_id: "foreign" }],
    ["another user attempt", "attempts", attempt("a1", "foreign")],
    ["another tenant record", "records", { ...record(), organization_id: "foreign" }],
    ["another enrollment record", "records", { ...record(), enrollment_id: "foreign" }],
    ["conflicting record user", "records", { ...record(), user_id: "foreign" }],
    ["conflicting record course", "records", { ...record(), course_id: "foreign" }],
    ["deleted record", "records", { ...record(), deleted_at: "2026-09-03T00:00:00Z" }],
    ["unsupported status", "records", { ...record(), document_status: "issued" }],
  ] as const)("rejects %s", async (_name, source, row) => {
    const reader = readers();
    reader[source] = vi.fn().mockResolvedValue(page([row]));
    const result = await loadGroupCompletionFacts(input(), reader);
    const resultKey = source === "lessons" ? "lessons" : source === "attempts" ? "testAttempts" : "educationDocumentRecords";
    expect(result[resultKey]).toEqual([]);
    expect(result.sourceIssues).toContainEqual(expect.objectContaining({ code: "scope_mismatch" }));
  });

  it("never fetches attempts for tied final tests", async () => {
    const reader = readers();
    reader.lessons = vi.fn().mockResolvedValue(page([lesson("one"), lesson("two")]));
    const result = await loadGroupCompletionFacts(input(), reader);
    expect(reader.attempts).not.toHaveBeenCalled();
    expect(result.educationDocumentRecords).toEqual([record()]);
  });

  it("permits nullable legacy record links for the builder to qualify", async () => {
    const row = { ...record(), user_id: null, course_id: null };
    const result = await loadGroupCompletionFacts(input(), { ...readers(), records: vi.fn().mockResolvedValue(page([row])) });
    expect(result.educationDocumentRecords).toEqual([row]);
    expect(result.sourceIssues).toEqual([]);
  });

  it("rejects a response older than the requested minimum boundary", async () => {
    const result = await loadGroupCompletionFacts(input(), { ...readers(), attempts: vi.fn().mockResolvedValue(page([{ ...attempt(), completed_at: "2026-08-31T23:59:59.999Z" }])) });
    expect(result.testAttempts).toEqual([]);
    expect(result.sourceIssues).toContainEqual(expect.objectContaining({ source: "test_attempts", code: "scope_mismatch" }));
    expect(result.educationDocumentRecords).toEqual([record()]);
  });

  it("keeps a response exactly at the minimum boundary", async () => {
    const row = { ...attempt(), completed_at: "2026-09-01T00:00:00.000Z" };
    const result = await loadGroupCompletionFacts(input(), { ...readers(), attempts: vi.fn().mockResolvedValue(page([row])) });
    expect(result.testAttempts).toEqual([row]);
  });

  it.each(["attempts", "records"] as const)("discards the entire %s source after duplicate IDs across chunks", async (source) => {
    const users = Array.from({ length: 101 }, (_, i) => `u${String(i).padStart(3, "0")}`);
    const reader = readers();
    reader.attempts = vi.fn<CompletionFactsReader["attempts"]>(async (request) => page(request.studentUserIds.map((u) => attempt(source === "attempts" ? "same" : `a-${u}`, u))));
    reader.records = vi.fn<CompletionFactsReader["records"]>(async (request) => page(request.enrollmentIds.map((e) => record(source === "records" ? "same" : `r-${e}`, e, e.slice(2)))));
    // Only the first row of each chunk is needed to exercise cross-chunk IDs.
    if (source === "attempts") reader.attempts = vi.fn<CompletionFactsReader["attempts"]>(async (request) => page([attempt("same", request.studentUserIds[0])]));
    else reader.records = vi.fn<CompletionFactsReader["records"]>(async (request) => page([record("same", request.enrollmentIds[0], request.enrollmentIds[0].slice(2))]));
    const result = await loadGroupCompletionFacts({ ...input(), scope: { ...scope, studentUserIds: users }, enrollments: users.map((u) => enrollment(`e-${u}`, u)) }, reader);
    expect(result[source === "attempts" ? "testAttempts" : "educationDocumentRecords"]).toEqual([]);
    expect(result.sourceIssues).toContainEqual(expect.objectContaining({ code: "source_changed" }));
    expect(result[source === "attempts" ? "educationDocumentRecords" : "testAttempts"]).toHaveLength(101);
  });

  it.each(["", "invalid"])("does not fall back to all history for invalid boundary %s", async (started_at) => {
    const reader = readers();
    const result = await loadGroupCompletionFacts({ ...input(), enrollments: [{ ...enrollment(), started_at }] }, reader);
    expect(reader.attempts).not.toHaveBeenCalled();
    expect(result.testAttempts).toEqual([]);
  });

  it("does not query attempts for ambiguous enrollment runs", async () => {
    const reader = readers();
    await loadGroupCompletionFacts({ ...input(), enrollments: [enrollment(), enrollment("e2")] }, reader);
    expect(reader.attempts).not.toHaveBeenCalled();
  });

  it("discards earlier record pages on failure without losing attempts", async () => {
    const reader = readers();
    reader.records = vi.fn().mockResolvedValueOnce(page([record()], 2)).mockRejectedValueOnce(new Error("network"));
    const result = await loadGroupCompletionFacts(input(), reader);
    expect(result.educationDocumentRecords).toEqual([]);
    expect(result.testAttempts).toEqual([attempt()]);
    expect(result.sourceIssues).toEqual([expect.objectContaining({ source: "education_document_records", code: "read_failed" })]);
  });
});
