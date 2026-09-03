import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  buildGroupAttestationFacts,
  selectUnambiguousFinalTestLesson,
  type GroupAttestationFactsAttempt,
  type GroupAttestationFactsSnapshot,
} from "../../../../supabase/functions/_shared/docx-ooxml/groupAttestationFacts";
import { compileGroupDocumentXml, type GroupDocumentManifest } from "../../../../supabase/functions/_shared/docx-ooxml/groupDocument";
import { findUnresolvedTokens } from "../../../../supabase/functions/_shared/docx-ooxml/xml";
import { GROUP_DOCUMENT_TEMPLATE_BUNDLE } from "../../../../supabase/functions/_shared/group-doc-templates/goreltech/group-package/v1/embedded";

function fixture(): GroupAttestationFactsSnapshot {
  return {
    organization: { id: "org" },
    group: {
      id: "group", organization_id: "org", course_id: "course", group_number: "1-ПК-26",
      program_title: "Программа из базы", program_hours: 40,
      start_date: "2026-09-01", end_date: "2026-09-30",
    },
    course: { id: "course", organization_id: "org", title: "Курс", duration: "40", frdo_duration_hours: 40 },
    profiles: [{ user_id: "user", organization_id: "org", student_group_id: "group", archived_at: null, full_name: "Иванов Иван", email: null }],
    enrollments: [{ id: "enrollment", user_id: "user", course_id: "course", status: "completed", progress: 100,
      started_at: "2026-09-01T00:00:00Z", completed_at: "2026-09-30T12:00:00Z" }],
    lessons: [
      { id: "intermediate", course_id: "course", type: "test", order_index: 1, test_passing_score: 40, updated_at: "2026-08-01T00:00:00Z" },
      { id: "final", course_id: "course", type: "test", order_index: 10, test_passing_score: 80, updated_at: "2026-08-01T00:00:00Z" },
    ],
    testAttempts: [{ id: "attempt", user_id: "user", lesson_id: "final", score: 8, max_score: 10, completed_at: "2026-09-30T11:00:00Z" }],
  };
}
const build = (snapshot = fixture(), options: { fillMode?: "blank" | "data"; attemptPolicy?: "latest" | "best_percent" } = {}) =>
  buildGroupAttestationFacts({ snapshot, fillMode: options.fillMode ?? "data", attemptPolicy: options.attemptPolicy });
const codes = (result: ReturnType<typeof build>) => result.issues.map((issue) => issue.code);

describe("server attestation facts", () => {
  it("builds only factual percent, the exact manifest row tokens, and no invented grade/final status", () => {
    const result = build();
    const manifest = JSON.parse(GROUP_DOCUMENT_TEMPLATE_BUNDLE.attestation_sheet.manifestJson);
    expect(Object.keys(result.rows[0])).toEqual(manifest.row_tokens);
    expect(result.rows).toEqual([{ N: "1", STUDENT_NAME: "Иванов Иван", PERCENT: "80", GRADE: "" }]);
    expect(result.rowSources[0]).toEqual({ userId: "user", enrollmentId: "enrollment", lessonId: "final", attemptId: "attempt", percent: 80, passingScore: 80, passed: true });
    expect(codes(result)).toEqual(["grading_policy_missing", "cycle_boundary_unverified"]);
    expect(result).not.toHaveProperty("docStatus");
    expect(result).not.toHaveProperty("final");
  });

  it.each([0, 58, 60, 70, 80, 100])("uses saved threshold %s and the real grade-test rounding", (threshold) => {
    const snapshot = fixture();
    snapshot.lessons = snapshot.lessons.map((lesson) => ({ ...lesson, test_passing_score: threshold }));
    snapshot.testAttempts = [{ ...snapshot.testAttempts[0], score: 7, max_score: 12 }];
    const result = build(snapshot);
    expect(result.rows[0].PERCENT).toBe("58");
    expect(result.rowSources[0].passed).toBe(58 >= threshold);
    expect(result.rows[0].GRADE).toBe("");
  });

  it.each([NaN, Infinity, -1, 101, 70.5])("does not replace invalid threshold %s with a default", (threshold) => {
    const snapshot = fixture();
    snapshot.lessons = snapshot.lessons.map((lesson) => ({ ...lesson, test_passing_score: threshold }));
    const result = build(snapshot);
    expect(result.rows[0].PERCENT).toBe("80");
    expect(result.rowSources[0]).toMatchObject({ passed: null, passingScore: null });
    expect(codes(result)).toContain("invalid_passing_score");
  });

  it("keeps factual percent but does not claim historical pass when settings changed after attempt", () => {
    const snapshot = fixture();
    snapshot.lessons = snapshot.lessons.map((lesson) => ({ ...lesson, updated_at: "2026-10-01T00:00:00Z" }));
    const result = build(snapshot);
    expect(result.rows[0].PERCENT).toBe("80");
    expect(result.rowSources[0].passed).toBeNull();
    expect(codes(result)).toContain("historical_passing_score_unconfirmed");
  });

  it("does not inspect test arrays in blank mode and leaves every mark empty", () => {
    const snapshot = fixture();
    Object.defineProperty(snapshot, "lessons", { get() { throw new Error("must not read lessons"); } });
    Object.defineProperty(snapshot, "testAttempts", { get() { throw new Error("must not read attempts"); } });
    const result = build(snapshot, { fillMode: "blank" });
    expect(result.rows).toEqual([{ N: "1", STUDENT_NAME: "Иванов Иван", PERCENT: "", GRADE: "" }]);
    expect(result.rowSources[0]).toMatchObject({ attemptId: null, lessonId: null, percent: null, passed: null });
    expect(result.issues).toEqual([]);
  });

  it("retains all active participants, including unenrolled namesakes, and joins only IDs", () => {
    const snapshot = fixture();
    snapshot.profiles = [
      ...snapshot.profiles,
      { ...snapshot.profiles[0], user_id: "user2" },
      { ...snapshot.profiles[0], user_id: "outside", organization_id: "foreign", full_name: "FOREIGN_PERSON" },
    ];
    snapshot.testAttempts = [...snapshot.testAttempts, { ...snapshot.testAttempts[0], user_id: "outside", score: 10 }];
    const result = build(snapshot);
    expect(result.rows.map((row) => row.PERCENT)).toEqual(["80", ""]);
    expect(result.rowSources.map((row) => row.userId)).toEqual(["user", "user2"]);
    expect(codes(result)).toContain("missing_enrollment");
    expect(JSON.stringify(result)).not.toContain("FOREIGN_PERSON");
  });

  it("rejects mismatched organization/course and never reads other-course attempts", () => {
    const snapshot = fixture();
    snapshot.lessons = [...snapshot.lessons, { ...snapshot.lessons[1], id: "foreign-test", course_id: "foreign-course", order_index: 999 }];
    snapshot.testAttempts = [{ ...snapshot.testAttempts[0], lesson_id: "foreign-test" }];
    expect(build(snapshot).rows[0].PERCENT).toBe("");
    expect(codes(build(snapshot))).toContain("missing_test_attempt");
    snapshot.course!.organization_id = "foreign-org";
    expect(build(snapshot).rows[0].PERCENT).toBe("");
    expect(codes(build(snapshot))).toContain("course_scope_mismatch");
    snapshot.group.organization_id = "foreign-org";
    expect(build(snapshot).rows).toEqual([]);
  });

  it("does not mistake an intermediate test for the last test", () => {
    const snapshot = fixture();
    snapshot.testAttempts = [{ ...snapshot.testAttempts[0], lesson_id: "intermediate", score: 10 }];
    expect(build(snapshot).rows[0].PERCENT).toBe("");
    expect(selectUnambiguousFinalTestLesson(snapshot.lessons, "course")?.id).toBe("final");
  });

  it("does not choose missing, unordered, duplicate or tied final tests arbitrarily", () => {
    const snapshot = fixture();
    const final = snapshot.lessons[1];
    for (const lessons of [[], [{ ...final, order_index: NaN }], [final, final], [final, { ...final, id: "tied" }]]) {
      snapshot.lessons = lessons;
      expect(selectUnambiguousFinalTestLesson(lessons, "course")).toBeNull();
      expect(build(snapshot).rows[0].PERCENT).toBe("");
    }
  });

  it("does not reuse a higher result from before reenrollment", () => {
    const snapshot = fixture();
    snapshot.enrollments = [{ ...snapshot.enrollments[0], id: "new-enrollment" }];
    snapshot.testAttempts = [
      { ...snapshot.testAttempts[0], id: "old-perfect", score: 10, completed_at: "2026-08-30T12:00:00Z" },
      { ...snapshot.testAttempts[0], score: 4 },
    ];
    const result = build(snapshot);
    expect(result.rows[0].PERCENT).toBe("40");
    expect(result.rowSources[0]).toMatchObject({ enrollmentId: "new-enrollment", attemptId: "attempt" });
    snapshot.testAttempts = [snapshot.testAttempts[0]];
    expect(build(snapshot).rows[0].PERCENT).toBe("");
    expect(codes(build(snapshot))).toContain("only_prior_enrollment_attempts");
  });

  it.each(["", "2026-02-30T00:00:00Z", "2026-09-01", "invalid"])("does not guess enrollment start when it is %s", (started_at) => {
    const snapshot = fixture();
    snapshot.enrollments = [{ ...snapshot.enrollments[0], started_at }];
    const result = build(snapshot);
    expect(result.rows[0].PERCENT).toBe("");
    expect(codes(result)).toContain("missing_enrollment_start");
  });

  it("compares timezone timestamps and permits an attempt exactly at enrollment start", () => {
    const snapshot = fixture();
    snapshot.enrollments = [{ ...snapshot.enrollments[0], started_at: "2026-09-01T10:00:00+10:00" }];
    snapshot.testAttempts = [{ ...snapshot.testAttempts[0], completed_at: "2026-09-01T00:00:00Z" }];
    expect(build(snapshot).rows[0].PERCENT).toBe("80");
  });

  it("preserves PostgreSQL microsecond ordering for enrollment and historical settings", () => {
    const snapshot = fixture();
    snapshot.enrollments = [{ ...snapshot.enrollments[0], started_at: "2026-09-01T00:00:00.123456Z" }];
    snapshot.testAttempts = [{ ...snapshot.testAttempts[0], completed_at: "2026-09-01T00:00:00.123455Z" }];
    expect(codes(build(snapshot))).toContain("only_prior_enrollment_attempts");
    snapshot.testAttempts = [{ ...snapshot.testAttempts[0], completed_at: "2026-09-01T00:00:00.123456Z" }];
    snapshot.lessons = snapshot.lessons.map((lesson) => ({ ...lesson, updated_at: "2026-09-01T00:00:00.123457Z" }));
    const result = build(snapshot);
    expect(result.rows[0].PERCENT).toBe("80");
    expect(result.rowSources[0].passed).toBeNull();
    expect(codes(result)).toContain("historical_passing_score_unconfirmed");
  });

  it("does not use ambiguous enrollments or an invalid attempt date", () => {
    const snapshot = fixture();
    snapshot.enrollments = [...snapshot.enrollments, { ...snapshot.enrollments[0], id: "duplicate" }];
    expect(build(snapshot).rows[0].PERCENT).toBe("");
    expect(codes(build(snapshot))).toContain("ambiguous_enrollment");
    snapshot.enrollments = [snapshot.enrollments[0]];
    snapshot.testAttempts = [...snapshot.testAttempts, { ...snapshot.testAttempts[0], id: "unknown-date", completed_at: "not a date" }];
    expect(build(snapshot).rows[0].PERCENT).toBe("");
    expect(codes(build(snapshot))).toContain("invalid_attempt_date");
  });

  const policyAttempts = (): GroupAttestationFactsAttempt[] => [
    { id: "earlier-best", user_id: "user", lesson_id: "final", score: 7, max_score: 9, completed_at: "2026-09-29T12:00:00Z" },
    { id: "latest-raw-high", user_id: "user", lesson_id: "final", score: 70, max_score: 100, completed_at: "2026-09-30T12:00:00Z" },
  ];

  it("does not silently default to latest or best when the business policy is unset", () => {
    const snapshot = fixture();
    snapshot.testAttempts = policyAttempts();
    const result = build(snapshot);
    expect(result.rows[0].PERCENT).toBe("");
    expect(result.rowSources[0].attemptId).toBeNull();
    expect(codes(result)).toContain("attempt_policy_missing");
  });

  it("supports explicit latest, not old best/raw-score selection", () => {
    const snapshot = fixture();
    snapshot.testAttempts = policyAttempts();
    const result = build(snapshot, { attemptPolicy: "latest" });
    expect(result.rows[0].PERCENT).toBe("70");
    expect(result.rowSources[0].attemptId).toBe("latest-raw-high");
  });

  it("supports explicit best normalized percent, not the highest raw score", () => {
    const snapshot = fixture();
    snapshot.testAttempts = policyAttempts();
    const result = build(snapshot, { attemptPolicy: "best_percent" });
    expect(result.rows[0].PERCENT).toBe("78");
    expect(result.rowSources[0].attemptId).toBe("earlier-best");
  });

  it.each(["latest", "best_percent"] as const)("does not arbitrarily choose timestamp ties for %s", (attemptPolicy) => {
    const snapshot = fixture();
    snapshot.testAttempts = [...snapshot.testAttempts, { ...snapshot.testAttempts[0], id: "tied" }];
    expect(build(snapshot, { attemptPolicy }).rows[0].PERCENT).toBe("");
    expect(codes(build(snapshot, { attemptPolicy }))).toContain("ambiguous_selected_attempt");
  });

  it.each([
    { score: -1, max_score: 10 }, { score: 11, max_score: 10 }, { score: 0, max_score: 0 },
    { score: NaN, max_score: 10 }, { score: 1.2, max_score: 10 }, { score: 1, max_score: Infinity },
  ])("leaves invalid persisted score blank: %j", (score) => {
    const snapshot = fixture();
    snapshot.testAttempts = [{ ...snapshot.testAttempts[0], ...score }];
    expect(build(snapshot).rows[0].PERCENT).toBe("");
    expect(codes(build(snapshot))).toContain("invalid_attempt_score");
  });

  it("does not fall back to an old success if the explicit latest attempt is invalid", () => {
    const snapshot = fixture();
    const attempts = policyAttempts();
    snapshot.testAttempts = [attempts[0], { ...attempts[1], max_score: 0 }];
    expect(build(snapshot, { attemptPolicy: "latest" }).rows[0].PERCENT).toBe("");
  });

  it("does not hide factual zero percent and does not mutate snapshots", () => {
    const snapshot = fixture();
    snapshot.testAttempts = [{ ...snapshot.testAttempts[0], score: 0 }];
    const original = structuredClone(snapshot);
    expect(build(snapshot).rows[0].PERCENT).toBe("0");
    expect(snapshot).toEqual(original);
  });

  it.each(["data", "blank"] as const)("compiles the retained attestation DOCX from %s facts and preserves all non-document parts", async (fillMode) => {
    const template = GROUP_DOCUMENT_TEMPLATE_BUNDLE.attestation_sheet;
    const bytes = Buffer.from(template.templateBase64, "base64");
    const manifest = JSON.parse(template.manifestJson) as GroupDocumentManifest;
    expect(createHash("sha256").update(bytes).digest("hex").toUpperCase()).toBe(manifest.template_sha256);
    expect(bytes).toEqual(readFileSync(resolve("supabase/functions/_shared/group-doc-templates/goreltech/group-package/v1/templates/attestation_sheet.docx")));
    const before = await JSZip.loadAsync(bytes);
    const after = await JSZip.loadAsync(bytes);
    const sourceXml = await before.file("word/document.xml")!.async("string");
    const snapshot = fixture();
    snapshot.testAttempts = [...snapshot.testAttempts, { ...snapshot.testAttempts[0], user_id: "FOREIGN", score: 10 }];
    const facts = build(snapshot, { fillMode });
    const scalarBlanks = Object.fromEntries(findUnresolvedTokens(sourceXml).map((token) => [token.slice(2, -2), ""]));
    const compiled = compileGroupDocumentXml({
      documentXml: sourceXml, manifest,
      snapshot: {
        rows: facts.rows,
        scalars: { ...scalarBlanks, PERCENT: "BROWSER_INJECTED", GRADE: "BROWSER_INJECTED", END_DATE: "BROWSER_INJECTED", ...facts.scalars },
      },
    });
    after.file("word/document.xml", compiled);
    const saved = await JSZip.loadAsync(await after.generateAsync({ type: "nodebuffer" }));
    const savedXml = await saved.file("word/document.xml")!.async("string");
    expect(findUnresolvedTokens(savedXml)).toEqual([]);
    expect(savedXml).not.toMatch(/BROWSER_INJECTED|FOREIGN/);
    expect(savedXml).toContain("Иванов Иван");
    expect(savedXml).toContain("Программа из базы");
    const parsed = new DOMParser().parseFromString(savedXml, "application/xml");
    expect(parsed.getElementsByTagName("parsererror")).toHaveLength(0);
    const table = parsed.getElementsByTagName("w:tbl")[manifest.repeater!.table_index];
    const row = table.getElementsByTagName("w:tr")[manifest.repeater!.header_rows];
    const cells = Array.from(row.getElementsByTagName("w:tc"));
    const text = (index: number) => Array.from(cells[index].getElementsByTagName("w:t")).map((node) => node.textContent).join("");
    expect(text(2)).toBe(fillMode === "data" ? "80" : "");
    expect(text(3)).toBe("");
    expect(savedXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)).toEqual(sourceXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g));
    const page = parsed.getElementsByTagName("w:pgSz")[0];
    expect(Number(page.getAttribute("w:w"))).toBeLessThan(Number(page.getAttribute("w:h")));
    expect(Object.keys(saved.files).sort()).toEqual(Object.keys(before.files).sort());
    for (const [path, entry] of Object.entries(before.files)) {
      if (entry.dir || path === "word/document.xml") continue;
      expect(await saved.file(path)!.async("nodebuffer"), path).toEqual(await entry.async("nodebuffer"));
    }
  }, 15000);
});
