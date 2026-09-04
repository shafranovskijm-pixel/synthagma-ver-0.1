import JSZip from "jszip";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildGroupPassFactRows, type GroupPassFactsSnapshot } from "../../../../supabase/functions/_shared/docx-ooxml/groupPassFacts";
import type { GroupClassJournalMarkRow } from "../../../../supabase/functions/_shared/docx-ooxml/groupClassJournalMarks";
import { compileGroupDocumentXml, type GroupDocumentManifest } from "../../../../supabase/functions/_shared/docx-ooxml/groupDocument";
import { findUnresolvedTokens } from "../../../../supabase/functions/_shared/docx-ooxml/xml";
import { GROUP_DOCUMENT_TEMPLATE_BUNDLE } from "../../../../supabase/functions/_shared/group-doc-templates/goreltech/group-package/v1/embedded";
const fixture = (): GroupPassFactsSnapshot => ({
  organization: { id: "o" }, group: { id: "g", organization_id: "o", course_id: "c", training_dates: ["2026-09-05", "2026-09-06"], start_date: "2026-09-01", end_date: "2026-09-30" },
  profiles: ["a", "b"].map(user_id => ({ user_id, organization_id: "o", student_group_id: "g", archived_at: null, full_name: "Однофамилец Иван", email: `${user_id}@example.invalid`, phone: user_id === "a" ? "+70001" : null, company_id: user_id })),
  companies: [{ id: "a", organization_id: "o", name: "Компания <А> & Б" }, { id: "b", organization_id: "o", name: "Вторая" }],
});
const build = (snapshot = fixture(), fillMode: "data" | "blank" = "data") => buildGroupPassFactRows({ snapshot, fillMode });
const markCells = (result: ReturnType<typeof build>) => result.rows.map(row => [1, 2, 3, 4].map(slot => row[`DAY_${slot}`]));
function marksFixture(): GroupPassFactsSnapshot {
  const snapshot = fixture();
  const dates = ["2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08"];
  snapshot.group.training_dates = dates;
  const raw = [["V", "Н", "2", ""], ["ОП", "0", "<&>", "[[X]]"]];
  const rows: GroupClassJournalMarkRow[] = snapshot.profiles.flatMap((profile, index) => dates.map((date, i) => ({
    id: `${profile.user_id}-${i + 1}`, organization_id: "o", group_id: "g", user_id: profile.user_id,
    slot: i + 1, course_id: "c", source_date: date, mark: raw[index][i], revision: i + 1,
    updated_by: "operator", updated_at: "2026-09-08T12:00:00Z",
  })));
  snapshot.journalMarksSource = { rows, sourceAvailable: true, sourceIssues: [] };
  return snapshot;
}
describe("pass server facts", () => {
  it("preserves namesakes by IDs and each person's own company and contacts", () => {
    const result = build();
    expect(result.rows.map(r => r.COMPANY)).toEqual(["Компания <А> & Б", "Вторая"]);
    expect(result.rows.map(r => r.EMAIL)).toEqual(["a@example.invalid", "b@example.invalid"]);
    expect(result.rowSources).toEqual([{ userId: "a", companyId: "a" }, { userId: "b", companyId: "b" }]);
    expect(Object.keys(result.rows[0])).toEqual(JSON.parse(GROUP_DOCUMENT_TEMPLATE_BUNDLE.pass.manifestJson).row_tokens);
    expect(result.scalars.DAY1_DATE).toBe("05.09.2026");
    expect(result.scalars.DAY2_DATE).toBe("06.09.2026");
    expect(result.scalars.DAY3_DATE).toBe("");
    expect(result.scalars.CONTRACT_BASIS_LINE).toBe("");
    expect(result.scalars).not.toHaveProperty("SIGNATORY_SHORT");
  });
  it.each([[], ["2026-02-30"], ["2026-09-05", "2026-09-05"], ["2026-09-06", "2026-09-05"], ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]].map(dates => ({ dates })))("does not silently repair unsupported dates $dates", ({ dates }) => {
    const s = fixture(); s.group.training_dates = dates;
    const r = build(s);
    expect([1, 2, 3, 4].map(i => r.scalars[`DAY${i}_DATE`])).toEqual(["", "", "", ""]);
    expect(r.issues.some(i => i.field === "training_dates")).toBe(true);
    expect(r.rows).toHaveLength(2);
  });
  it.each(["2026-08-31", "2026-10-01"])("does not print a saved date outside the group period: %s", date => {
    const s = fixture(); s.group.training_dates = [date];
    const r = build(s);
    expect(r.scalars.DAY1_DATE).toBe("");
    expect(r.issues).toContainEqual(expect.objectContaining({ code: "training_dates_outside_period" }));
    expect(r.rows).toHaveLength(2);
  });
  it.each([null, {}, "2026-09-05", [3], [null]])("reports malformed dates without throwing: %j", dates => {
    const s = fixture(); s.group.training_dates = dates;
    const r = build(s);
    expect(r.scalars.DAY1_DATE).toBe("");
    expect(r.issues.some(i => i.code.startsWith("training_dates_invalid"))).toBe(true);
  });
  it("retains actual saved dates with an explicit warning if the period is incomplete", () => {
    const s = fixture(); s.group.start_date = null;
    const r = build(s);
    expect(r.scalars.DAY1_DATE).toBe("05.09.2026");
    expect(r.issues).toContainEqual(expect.objectContaining({ code: "group_period_incomplete" }));
  });
  it.each(["2026-02-30", "2026-10-01"])("does not use a corrupt/reversed group period %s", start => {
    const s = fixture(); s.group.start_date = start;
    const r = build(s);
    expect(r.scalars.DAY1_DATE).toBe("");
    expect(r.issues).toContainEqual(expect.objectContaining({ code: "invalid_group_period" }));
  });
  it.each(["foreign", "duplicate", "missing"])("rejects %s company without losing contacts", kind => {
    const s = fixture();
    s.companies = kind === "missing" ? [] : kind === "duplicate" ? [...s.companies, s.companies[0]] : [{ ...s.companies[0], organization_id: "foreign" }];
    const r = build(s); expect(r.rows[0].COMPANY).toBe(""); expect(r.rows[0].EMAIL).toBe("a@example.invalid");
    expect(r.rowSources[0].companyId).toBeNull(); expect(r.issues.some(i => i.code === "company_unconfirmed")).toBe(true);
  });
  it.each(["duplicate", "archived", "tenant", "group"])("fails closed for %s profile", kind => {
    const s = fixture();
    if (kind === "duplicate") s.profiles = [...s.profiles, s.profiles[0]];
    else s.profiles = [{ ...s.profiles[0], ...(kind === "archived" ? { archived_at: "2026-09-01" } : kind === "tenant" ? { organization_id: "foreign" } : { student_group_id: "foreign" }) }, s.profiles[1]];
    const r = build(s); expect(r.rowSources).toEqual([{ userId: "b", companyId: "b" }]);
    expect(r.issues.some(i => i.severity === "error")).toBe(true);
  });
  it("rejects foreign group and keeps blank mode roster but no marks", () => {
    const s = fixture(); s.group.organization_id = "foreign"; expect(build(s).rows).toEqual([]);
    const r = build(fixture(), "blank"); expect(r.rows).toHaveLength(2);
    expect(r.rows.every(row => [1, 2, 3, 4].every(i => row[`DAY_${i}`] === ""))).toBe(true);
    expect(r.issues.some(i => i.code === "attendance_source_missing")).toBe(false);
  });
  it("does not mutate or accept browser values", () => {
    const s = { ...fixture(), variables: { pass_rows: "INJECTED", contract_basis_line: "INJECTED" } }; const before = structuredClone(s);
    expect(JSON.stringify(build(s))).not.toContain("INJECTED"); expect(s).toEqual(before);
  });
  it("compiles retained DOCX and preserves every other ZIP part", async () => {
    const template = GROUP_DOCUMENT_TEMPLATE_BUNDLE.pass;
    const source = await JSZip.loadAsync(Buffer.from(template.templateBase64, "base64"));
    const output = await JSZip.loadAsync(Buffer.from(template.templateBase64, "base64"));
    const xml = await source.file("word/document.xml")!.async("string");
    const r = build();
    const scalars = Object.fromEntries(findUnresolvedTokens(xml).map(token => [token.slice(2, -2), ""]));
    const compiled = compileGroupDocumentXml({ documentXml: xml, manifest: JSON.parse(template.manifestJson) as GroupDocumentManifest, snapshot: { rows: r.rows, scalars: { ...scalars, ...r.scalars } } });
    output.file("word/document.xml", compiled);
    const reloaded = await JSZip.loadAsync(await output.generateAsync({ type: "nodebuffer" }));
    expect(compiled).toContain("Компания &lt;А&gt; &amp; Б"); expect(compiled).toContain("Вторая"); expect(compiled).toContain("a@example.invalid");
    expect(findUnresolvedTokens(compiled)).toEqual([]);
    for (const [name, entry] of Object.entries(source.files)) if (!entry.dir && name !== "word/document.xml") expect(await reloaded.file(name)!.async("uint8array")).toEqual(await entry.async("uint8array"));
  });
});

describe("pass uses the original group journal's saved manual marks", () => {
  it("maps by UUID and slot despite namesakes and reversed source order; preserves raw numbers and explicit clear", () => {
    const snapshot = marksFixture();
    snapshot.journalMarksSource!.rows.reverse();
    const before = structuredClone(snapshot);
    const result = build(snapshot);
    expect(markCells(result)).toEqual([["V", "Н", "2", ""], ["ОП", "0", "<&>", "[[X]]"]]);
    expect(result.attendanceSource).toBe("saved_manual_marks");
    expect(result.markSources).toEqual(snapshot.journalMarksSource!.rows);
    expect(result.issues.map(issue => issue.code)).toEqual(["contract_source_missing"]);
    expect(result.scalars.CONTRACT_BASIS_LINE).toBe("");
    expect(result).not.toHaveProperty("docStatus");
    expect(snapshot).toEqual(before);
  });

  it.each(["organization_id", "group_id"] as const)("rejects a foreign %s source without leaking any partial marks", field => {
    const snapshot = marksFixture();
    snapshot.journalMarksSource!.rows[0][field] = "foreign";
    const result = build(snapshot);
    expect(markCells(result)).toEqual([["", "", "", ""], ["", "", "", ""]]);
    expect(result.attendanceSource).toBe("unavailable_blank");
    expect(result.markSources).toEqual([]);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "scope_mismatch" }));
  });

  it.each(["course_id", "source_date"] as const)("omits a saved old %s, preserving independent current cells", field => {
    const snapshot = marksFixture();
    snapshot.journalMarksSource!.rows[0][field] = field === "course_id" ? "old-course" : "2026-09-04";
    const result = build(snapshot);
    expect(markCells(result)).toEqual([["", "Н", "2", ""], ["ОП", "0", "<&>", "[[X]]"]]);
    expect(result.markSources).toHaveLength(7);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: field === "course_id" ? "stale_course" : "stale_date" }));
  });

  it.each(["absent", "no-records", "unavailable", "partial-read"] as const)("leaves %s source blank with an explicit warning", state => {
    const snapshot = marksFixture();
    if (state === "absent") delete snapshot.journalMarksSource;
    if (state === "no-records") snapshot.journalMarksSource!.rows = [];
    if (state === "unavailable") snapshot.journalMarksSource!.sourceAvailable = false;
    if (state === "partial-read") snapshot.journalMarksSource!.sourceIssues = [{ source: "group_class_journal_marks", code: "incomplete_page", message: "Не удалось подтвердить следующую страницу" }];
    const result = build(snapshot);
    expect(markCells(result)).toEqual([["", "", "", ""], ["", "", "", ""]]);
    expect(result.markSources).toEqual([]);
    expect(result.attendanceSource).toBe(state === "no-records" ? "no_matching_marks_blank" : "unavailable_blank");
    expect(result.issues.length).toBeGreaterThan(1);
  });

  it.each(["duplicate-id", "duplicate-cell", "conflicting-cell", "malformed-xml"] as const)("fails closed for %s", kind => {
    const snapshot = marksFixture(), rows = snapshot.journalMarksSource!.rows;
    if (kind === "duplicate-id") rows[1].id = rows[0].id;
    if (kind === "duplicate-cell" || kind === "conflicting-cell") rows.push({ ...rows[0], id: "another-id", mark: kind === "conflicting-cell" ? "CONFLICT" : rows[0].mark });
    if (kind === "malformed-xml") rows[0].mark = "\u0001";
    const result = build(snapshot);
    expect(markCells(result)).toEqual([["", "", "", ""], ["", "", "", ""]]);
    expect(result.markSources).toEqual([]);
    expect(result.attendanceSource).toBe("unavailable_blank");
    expect(result.issues).toContainEqual(expect.objectContaining({ code: kind === "malformed-xml" ? "malformed_mark" : "duplicate_mark" }));
  });

  it("never carries a departed learner's cell to a namesake", () => {
    const snapshot = marksFixture();
    snapshot.journalMarksSource!.rows[0].user_id = "departed";
    const result = build(snapshot);
    expect(markCells(result)[0]).toEqual(["", "Н", "2", ""]);
    expect(result.markSources.some(mark => mark.user_id === "departed")).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "inactive_student" }));
  });

  it.each(["duplicate", "archived", "tenant", "group"] as const)("retains contacts but no marks when roster context is %s", kind => {
    const snapshot = marksFixture();
    if (kind === "duplicate") snapshot.profiles = [...snapshot.profiles, snapshot.profiles[0]];
    else snapshot.profiles = [{ ...snapshot.profiles[0], ...(kind === "archived" ? { archived_at: "2026-09-08" } : kind === "tenant" ? { organization_id: "foreign" } : { student_group_id: "foreign" }) }, snapshot.profiles[1]];
    const result = build(snapshot);
    expect(result.rowSources).toEqual([{ userId: "b", companyId: "b" }]);
    expect(markCells(result)).toEqual([["", "", "", ""]]);
    expect(result.markSources).toEqual([]);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "roster_mismatch" }));
  });

  it.each([null, [], ["2026-02-30"], ["2026-09-05", "2026-09-05"], ["2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09"]].map(dates => ({ dates })))("does not print marks under rejected date headers $dates", ({ dates }) => {
    const snapshot = marksFixture(); snapshot.group.training_dates = dates;
    const result = build(snapshot);
    expect(markCells(result)).toEqual([["", "", "", ""], ["", "", "", ""]]);
    expect(result.markSources).toEqual([]);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "attendance_dates_unconfirmed" }));
  });

  it("does not print marks for dates outside the group period", () => {
    const snapshot = marksFixture(); snapshot.group.end_date = "2026-09-04";
    const result = build(snapshot);
    expect(markCells(result)).toEqual([["", "", "", ""], ["", "", "", ""]]);
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "attendance_dates_unconfirmed" }));
  });

  it("never infers marks from completed courses or browser HTML and preserves blank mode", () => {
    const snapshot = { ...marksFixture(), variables: { pass_rows: "FORGED", DAY_1: "FORGED" }, progress: 100, status: "completed" };
    const blank = build(snapshot, "blank");
    expect(blank.attendanceSource).toBe("blank_mode");
    expect(blank.markSources).toEqual([]);
    expect(markCells(blank)).toEqual([["", "", "", ""], ["", "", "", ""]]);
    expect(blank.issues.map(issue => issue.code)).toEqual(["contract_source_missing"]);
    delete snapshot.journalMarksSource;
    expect(JSON.stringify(build(snapshot))).not.toMatch(/FORGED|completed/);
    expect(markCells(build(snapshot))).toEqual([["", "", "", ""], ["", "", "", ""]]);
  });

  it.each(["data", "blank", "unavailable"] as const)("prints %s marks in the exact four retained DOCX columns without touching layout", async mode => {
    const template = GROUP_DOCUMENT_TEMPLATE_BUNDLE.pass;
    const bytes = Buffer.from(template.templateBase64, "base64");
    const manifest = JSON.parse(template.manifestJson) as GroupDocumentManifest;
    expect(createHash("sha256").update(bytes).digest("hex").toUpperCase()).toBe(manifest.template_sha256);
    const original = await JSZip.loadAsync(bytes), output = await JSZip.loadAsync(bytes);
    const xml = await original.file("word/document.xml")!.async("string");
    const snapshot = marksFixture();
    if (mode === "unavailable") snapshot.journalMarksSource!.sourceAvailable = false;
    const result = build(snapshot, mode === "blank" ? "blank" : "data");
    const scalars = Object.fromEntries(findUnresolvedTokens(xml).map(token => [token.slice(2, -2), ""]));
    const compiled = compileGroupDocumentXml({ documentXml: xml, manifest, snapshot: { rows: result.rows, scalars: { ...scalars, ...result.scalars } } });
    output.file("word/document.xml", compiled);
    const reloaded = await JSZip.loadAsync(await output.generateAsync({ type: "nodebuffer" }));
    const doc = new DOMParser().parseFromString(compiled, "application/xml");
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(findUnresolvedTokens(compiled)).toEqual([]);
    const table = doc.getElementsByTagName("w:tbl")[0];
    const rows = Array.from(table.getElementsByTagName("w:tr"));
    const values = (index: number) => Array.from(rows[index].getElementsByTagName("w:tc"))
      .map(cell => Array.from(cell.getElementsByTagName("w:t")).map(t => t.textContent).join(""));
    expect(values(2).slice(5, 9)).toEqual(mode === "data" ? ["V", "Н", "2", ""] : ["", "", "", ""]);
    expect(values(3).slice(5, 9)).toEqual(mode === "data" ? ["ОП", "0", "<&>", "[[X]]"] : ["", "", "", ""]);
    for (const row of rows.slice(4)) expect(Array.from(row.getElementsByTagName("w:tc")).slice(5, 9)
      .map(cell => cell.textContent)).toEqual(["", "", "", ""]);
    expect(compiled.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)).toEqual(xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g));
    expect(Object.keys(reloaded.files).sort()).toEqual(Object.keys(original.files).sort());
    for (const [name, entry] of Object.entries(original.files)) if (!entry.dir && name !== "word/document.xml")
      expect(await reloaded.file(name)!.async("uint8array"), name).toEqual(await entry.async("uint8array"));
  });
});
