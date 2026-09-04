import { describe, expect, it, vi } from "vitest";
import {
  buildGroupClassJournalMarks, describeGroupClassJournalMarks, loadGroupClassJournalMarks,
  type GroupClassJournalMarkRow, type GroupClassJournalMarksSnapshot,
} from "../../../../supabase/functions/_shared/docx-ooxml/groupClassJournalMarks";

const scope = { organizationId: "org-a", groupId: "group-a", fillMode: "data" as const };
const dates = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"];
function mark(patch: Partial<GroupClassJournalMarkRow> = {}): GroupClassJournalMarkRow {
  return {
    id: "mark-a", organization_id: "org-a", group_id: "group-a", user_id: "student-a",
    slot: 1, course_id: "course-a", source_date: dates[0], mark: "Н", revision: 2,
    updated_at: "2026-09-04T10:00:00+00:00", updated_by: "teacher-a", ...patch,
  };
}
function snapshot(rows: GroupClassJournalMarkRow[] = []): GroupClassJournalMarksSnapshot {
  return {
    organization: { id: "org-a" },
    group: { id: "group-a", organization_id: "org-a", course_id: "course-a", training_dates: [...dates] },
    profiles: [
      { user_id: "student-b", full_name: "Антон Тестовый", organization_id: "org-a", student_group_id: "group-a", archived_at: null },
      { user_id: "student-a", full_name: "Яна Тестовая", organization_id: "org-a", student_group_id: "group-a", archived_at: null },
    ],
    source: { rows, sourceAvailable: true, sourceIssues: [] },
  };
}
const build = (rows: GroupClassJournalMarkRow[] = []) => buildGroupClassJournalMarks({ snapshot: snapshot(rows), fillMode: "data" });
const allBlank = (students: Array<Record<string, string>>) => students.every(student =>
  [1, 2, 3, 4].every(slot => student[`MARK_${slot}`] === ""));

describe("group journal marks: exact server source", () => {
  it("loads all exact-count pages with fixed tenant/group scope", async () => {
    const rows = Array.from({ length: 201 }, (_, i) => mark({ id: `mark-${i}`, user_id: `student-${i}` }));
    const read = vi.fn(async ({ from, to }: { from: number; to: number }) => ({ data: rows.slice(from, to + 1), count: rows.length, error: null }));
    const result = await loadGroupClassJournalMarks(scope, { marks: read });
    expect(result.sourceAvailable).toBe(true);
    expect(result.rows).toEqual(rows);
    expect(read.mock.calls).toEqual([
      [{ organizationId: "org-a", groupId: "group-a", from: 0, to: 199 }],
      [{ organizationId: "org-a", groupId: "group-a", from: 200, to: 399 }],
    ]);
  });

  it("does not read attendance in blank mode", async () => {
    const read = vi.fn();
    expect(await loadGroupClassJournalMarks({ ...scope, fillMode: "blank" }, { marks: read }))
      .toEqual({ rows: [], sourceAvailable: true, sourceIssues: [] });
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    { data: [mark()], count: null, error: null },
    { data: [mark()], count: 0, error: null },
    { data: [], count: 1, error: null },
    { data: null, count: null, error: { code: "42501" } },
    { data: [mark({ organization_id: "foreign-org" })], count: 1, error: null },
    { data: [mark({ group_id: "foreign-group" })], count: 1, error: null },
    { data: [mark(), mark({ id: "another-id" })], count: 2, error: null },
    { data: [mark(), mark({ slot: 2 })], count: 2, error: null },
  ])("discards malformed, duplicate, incomplete or inaccessible source %#", async reply => {
    const read = vi.fn(async () => reply);
    const result = await loadGroupClassJournalMarks(scope, { marks: read });
    expect(result.rows).toEqual([]);
    expect(result.sourceAvailable).toBe(false);
    expect(result.sourceIssues).toHaveLength(1);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("discards a successful first page when the next read fails; never returns partial marks", async () => {
    const first = Array.from({ length: 200 }, (_, i) => mark({ id: `mark-${i}`, user_id: `student-${i}` }));
    const read = vi.fn().mockResolvedValueOnce({ data: first, count: 201, error: null })
      .mockRejectedValueOnce(new Error("network"));
    const result = await loadGroupClassJournalMarks(scope, { marks: read });
    expect(result).toMatchObject({ rows: [], sourceAvailable: false });
    expect(result.sourceIssues[0].code).toBe("read_failed");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("detects a changing source count across pages", async () => {
    const first = Array.from({ length: 200 }, (_, i) => mark({ id: `mark-${i}`, user_id: `student-${i}` }));
    const read = vi.fn().mockResolvedValueOnce({ data: first, count: 201, error: null })
      .mockResolvedValueOnce({ data: [mark()], count: 202, error: null });
    const result = await loadGroupClassJournalMarks(scope, { marks: read });
    expect(result).toMatchObject({ rows: [], sourceAvailable: false });
    expect(result.sourceIssues[0].code).toBe("source_changed");
  });
});

describe("group journal marks: raw cells and provenance", () => {
  it("joins by IDs, keeps server roster order and transfers all four raw cells without a status mapping", () => {
    const values = ["Н", "+", "present", " 🟢 "];
    const rows = values.map((value, index) => mark({ id: `mark-${index}`, slot: index + 1, source_date: dates[index], mark: value }));
    const result = build([...rows].reverse());
    expect(result.students.map(student => student.STUDENT_NAME)).toEqual(["Антон Тестовый", "Яна Тестовая"]);
    expect([1, 2, 3, 4].map(slot => result.students[1][`MARK_${slot}`])).toEqual(values);
    expect(allBlank([result.students[0]])).toBe(true);
    expect(result.studentSources[1]).toEqual({ user_id: "student-a", full_name: "Яна Тестовая" });
    expect(result.markSources).toEqual([...rows].reverse());
    expect(result.attendanceSource).toBe("saved_manual_marks");
    expect(result.issues).toEqual([expect.objectContaining({ code: "missing_marks" })]);
  });

  it("does not join students by the same name or use browser fields/progress to infer a mark", () => {
    const input = snapshot([mark()]);
    input.profiles = input.profiles.map(profile => ({ ...profile, full_name: "Одинаковое ФИО", progress: 100, attendance: "Н", MARK_1: "+" }));
    const result = buildGroupClassJournalMarks({ snapshot: input, fillMode: "data" });
    expect(result.students[0].MARK_1).toBe("");
    expect(result.students[1].MARK_1).toBe("Н");
  });

  it("keeps every current participant and all empty cells when no records are saved", () => {
    const result = build();
    expect(result.students).toHaveLength(2);
    expect(allBlank(result.students)).toBe(true);
    expect(result.attendanceSource).toBe("no_matching_marks_blank");
    expect(result.issues[0].message).toContain("8");
  });

  it("records an explicit cleared cell with its row, revision and author instead of inventing attendance", () => {
    const clear = mark({ mark: "", revision: 4 });
    const result = build([clear]);
    expect(allBlank(result.students)).toBe(true);
    expect(result.markSources).toEqual([clear]);
    expect(result.attendanceSource).toBe("saved_manual_marks");
    expect(result.issues[0].message).toContain("7");
  });

  it("rejects duplicate cell identities even when called without the loader", () => {
    const result = build([mark(), mark({ id: "duplicate-cell", mark: "+" })]);
    expect(allBlank(result.students)).toBe(true);
    expect(result.markSources).toEqual([]);
    expect(result.issues[0].code).toBe("duplicate_mark");
  });

  it("leaves all marks blank in blank mode even if a source is supplied", () => {
    const input = snapshot([mark()]);
    const result = buildGroupClassJournalMarks({ snapshot: input, fillMode: "blank" });
    expect(allBlank(result.students)).toBe(true);
    expect(result.markSources).toEqual([]);
    expect(result.attendanceSource).toBe("blank_mode");
    expect(result.issues).toEqual([]);
  });

  it.each([
    { organization_id: "org-b" }, { group_id: "group-b" }, { slot: 0 }, { slot: 5 },
    { source_date: "2026-02-30" }, { revision: 0 }, { revision: 1.5 },
    { mark: "x".repeat(13) }, { mark: "🟢".repeat(13) },
    { mark: "\u0000" }, { mark: "\u000b" }, { mark: "\ufffe" }, { mark: "\ud800" },
    { updated_by: null }, { updated_by: "" }, { updated_by: " " },
    { updated_at: "not-date" }, { updated_at: "2026-02-30T12:00:00Z" },
  ])("fails closed for malformed or cross-scope records, not partial good cells: %j", patch => {
    const result = build([mark({ id: "good", user_id: "student-b" }), mark(patch as Partial<GroupClassJournalMarkRow>)]);
    expect(allBlank(result.students)).toBe(true);
    expect(result.markSources).toEqual([]);
    expect(result.attendanceSource).toBe("unavailable_blank");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).not.toContain("foreign-org");
  });

  it.each(["\t\r\n", "<&>", "🟢".repeat(12)])("preserves valid XML-safe Unicode exactly: %j", value => {
    expect(build([mark({ mark: value })]).students[1].MARK_1).toBe(value);
  });

  it("does not transfer a mark to another course, date, slot or inactive student", () => {
    const result = build([
      mark({ id: "old-course", course_id: "course-b" }),
      mark({ id: "old-date", slot: 2, source_date: dates[0] }),
      mark({ id: "left", user_id: "student-left" }),
      mark({ id: "current", slot: 4, source_date: dates[3], mark: "ОП" }),
    ]);
    expect([1, 2, 3, 4].map(slot => result.students[1][`MARK_${slot}`])).toEqual(["", "", "", "ОП"]);
    expect(result.markSources.map(row => row.id)).toEqual(["current"]);
    expect(result.issues.map(row => row.code)).toEqual(["stale_course", "stale_date", "inactive_student", "missing_marks"]);
  });

  it("requires exact nullable course identity, not a fallback to another course", () => {
    const input = snapshot([mark({ course_id: null })]);
    expect(buildGroupClassJournalMarks({ snapshot: input, fillMode: "data" }).students[1].MARK_1).toBe("");
    input.group.course_id = null;
    expect(buildGroupClassJournalMarks({ snapshot: input, fillMode: "data" }).students[1].MARK_1).toBe("Н");
  });

  it("does not sort or move saved column dates", () => {
    const input = snapshot([mark()]);
    input.group.training_dates = [dates[1], dates[0], dates[2], dates[3]];
    const result = buildGroupClassJournalMarks({ snapshot: input, fillMode: "data" });
    expect(allBlank(result.students)).toBe(true);
    expect(result.issues.some(issue => issue.code === "stale_date")).toBe(true);
  });

  it("does not use good rows if the source is flagged unavailable", () => {
    const input = snapshot([mark()]);
    input.source.sourceAvailable = false;
    const result = buildGroupClassJournalMarks({ snapshot: input, fillMode: "data" });
    expect(result.students).toHaveLength(2);
    expect(allBlank(result.students)).toBe(true);
    expect(result.attendanceSource).toBe("unavailable_blank");
  });

  it("rechecks group scope and duplicate roster IDs before matching marks", () => {
    const foreignGroup = snapshot([mark()]);
    foreignGroup.group.organization_id = "foreign-org";
    const result = buildGroupClassJournalMarks({ snapshot: foreignGroup, fillMode: "data" });
    expect(allBlank(result.students)).toBe(true);
    expect(result.attendanceSource).toBe("unavailable_blank");
    const input = snapshot([mark()]);
    input.profiles = [...input.profiles, input.profiles[1]];
    expect(buildGroupClassJournalMarks({ snapshot: input, fillMode: "data" }).attendanceSource).toBe("unavailable_blank");
  });

  it("describes blank/unavailable/saved states without claiming final readiness", () => {
    expect(describeGroupClassJournalMarks("saved_manual_marks")).toContain("дословно");
    expect(describeGroupClassJournalMarks("blank_mode")).toContain("не запрашивались");
    expect(describeGroupClassJournalMarks("no_matching_marks_blank")).toContain("не найдены");
    expect(describeGroupClassJournalMarks("unavailable_blank")).toContain("не удалось");
  });
});
