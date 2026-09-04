import JSZip from "jszip";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildGroupPassFactRows, type GroupPassFactsSnapshot } from "../../../../supabase/functions/_shared/docx-ooxml/groupPassFacts";
import { loadGroupContractFacts, type GroupContractFactRow, type GroupContractFactsReader } from "../../../../supabase/functions/_shared/docx-ooxml/groupContractFacts";
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
    expect(result.scalars.DAY1_DATE).toBe("05.09.\n2026");
    expect(result.scalars.DAY2_DATE).toBe("06.09.\n2026");
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
    expect(r.scalars.DAY1_DATE).toBe("05.09.\n2026");
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
    expect(blank.issues).toEqual([]);
    expect(blank.contractSources).toEqual([]);
    expect(blank.contractCoverage).toEqual({ coveredStudentUserIds: [], missingStudentUserIds: [] });
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
    const dateHeaders = Array.from(rows[1].getElementsByTagName("w:tc")).slice(-4);
    expect(values(1).slice(-4)).toEqual(["05.09.2026", "06.09.2026", "07.09.2026", "08.09.2026"]);
    for (const [index, cell] of dateHeaders.entries()) {
      expect(cell.getElementsByTagName("w:br")).toHaveLength(1);
      expect(Array.from(cell.getElementsByTagName("w:t")).map(t => t.textContent).filter(Boolean))
        .toEqual([`0${index + 5}.09.`, "2026"]);
    }
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

describe("selected contract facts reach the retained pass DOCX", () => {
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const ORG = uuid(101), GROUP = uuid(102), COURSE = uuid(103), COMPANY = uuid(104);
  const A = uuid(105), B = uuid(106), CONTRACT_A = uuid(107), CONTRACT_B = uuid(108);
  const escapedNumber = 'SYNTH-<A&B>-"Q"';
  const sourceRow = (changes: Partial<GroupContractFactRow> = {}): GroupContractFactRow => ({
    id: CONTRACT_A, organization_id: ORG, student_group_id: GROUP,
    student_user_id: null, company_id: COMPANY, counterparty_type: "legal",
    contract_number: escapedNumber, contract_date: "2026-09-05", status: "draft", generation_status: "generated",
    students: [{ user_id: A }, { user_id: B }], ...changes,
  });
  const snapshotFor = (contractFacts: Awaited<ReturnType<typeof loadGroupContractFacts>>): GroupPassFactsSnapshot => ({
    organization: { id: ORG },
    group: { id: GROUP, organization_id: ORG, course_id: COURSE, training_dates: ["2026-09-05", "2026-09-06"],
      start_date: "2026-09-01", end_date: "2026-09-30" },
    profiles: [A, B].map((user_id, index) => ({
      user_id, organization_id: ORG, student_group_id: GROUP, archived_at: null,
      full_name: `Тестовый участник ${index + 1}`, email: `synthetic-${index + 1}@example.invalid`, phone: null, company_id: COMPANY,
    })),
    companies: [{ id: COMPANY, organization_id: ORG, name: "Синтетическая организация" }],
    contractFacts,
  });
  function readerFor(rows: GroupContractFactRow[]): GroupContractFactsReader {
    return {
      contracts: vi.fn<GroupContractFactsReader["contracts"]>().mockImplementation(async ({ contractIds, from, to }) => {
        const selected = rows.filter(row => contractIds.includes(row.id));
        return { data: selected.slice(from, to + 1), count: selected.length, error: null };
      }),
      companies: vi.fn<GroupContractFactsReader["companies"]>().mockImplementation(async ({ companyIds }) => ({
        data: companyIds.map(id => ({ id, organization_id: ORG })), count: companyIds.length, error: null,
      })),
    };
  }
  async function loadSelected(rows: GroupContractFactRow[]) {
    const reader = readerFor(rows);
    const facts = await loadGroupContractFacts({
      organizationId: ORG, groupId: GROUP, studentUserIds: [A, B], contractIds: rows.map(row => row.id), fillMode: "data",
    }, reader);
    return { facts, reader };
  }
  async function compileRetainedPass(result: ReturnType<typeof build>) {
    const template = GROUP_DOCUMENT_TEMPLATE_BUNDLE.pass;
    const bytes = Buffer.from(template.templateBase64, "base64");
    const manifest = JSON.parse(template.manifestJson) as GroupDocumentManifest;
    expect(createHash("sha256").update(bytes).digest("hex").toUpperCase()).toBe(manifest.template_sha256);
    const original = await JSZip.loadAsync(bytes), output = await JSZip.loadAsync(bytes);
    const xml = await original.file("word/document.xml")!.async("string");
    expect(findUnresolvedTokens(xml)).toContain("[[CONTRACT_BASIS_LINE]]");
    const emptyScalars = Object.fromEntries(findUnresolvedTokens(xml).map(token => [token.slice(2, -2), ""]));
    const compiled = compileGroupDocumentXml({
      documentXml: xml, manifest, snapshot: { rows: result.rows, scalars: { ...emptyScalars, ...result.scalars } },
    });
    output.file("word/document.xml", compiled);
    const reopened = await JSZip.loadAsync(await output.generateAsync({ type: "nodebuffer" }));
    const savedXml = await reopened.file("word/document.xml")!.async("string");
    expect(savedXml).toBe(compiled);
    expect(findUnresolvedTokens(savedXml)).toEqual([]);
    const document = new DOMParser().parseFromString(savedXml, "application/xml");
    expect(document.getElementsByTagName("parsererror")).toHaveLength(0);
    const wordText = (node: Document | Element) => Array.from(node.getElementsByTagName("w:t")).map(text => text.textContent).join("");
    expect(savedXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)).toEqual(xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g));
    expect(Object.keys(reopened.files).sort()).toEqual(Object.keys(original.files).sort());
    for (const [name, entry] of Object.entries(original.files)) if (!entry.dir && name !== "word/document.xml") {
      expect(await reopened.file(name)!.async("uint8array"), name).toEqual(await entry.async("uint8array"));
    }
    return { xml: savedXml, text: wordText(document), paragraphs: Array.from(document.getElementsByTagName("w:p")).map(wordText) };
  }

  it("prints the confirmed saved source line as escaped XML text and retains source/coverage snapshot metadata", async () => {
    const { facts, reader } = await loadSelected([sourceRow()]);
    const snapshot = snapshotFor(facts), before = structuredClone(snapshot);
    const result = build(snapshot);
    expect(reader.contracts).toHaveBeenCalledExactlyOnceWith({
      organizationId: ORG, groupId: GROUP, contractIds: [CONTRACT_A], from: 0, to: 199,
    });
    expect(reader.companies).toHaveBeenCalledExactlyOnceWith({ organizationId: ORG, companyIds: [COMPANY], from: 0, to: 199 });
    expect(facts.issues).toEqual([]);
    expect(facts.line).toBe(`Номер договора: № ${escapedNumber}`);
    expect(result.scalars.CONTRACT_BASIS_LINE).toBe(facts.line);
    expect(result.contractSources).toEqual([{
      id: CONTRACT_A, organization_id: ORG, student_group_id: GROUP, contract_number: escapedNumber,
      contract_date: "2026-09-05", status: "draft", generation_status: "generated", counterparty_type: "legal",
      company_id: COMPANY, student_user_ids: [A, B],
    }]);
    expect(result.contractCoverage).toEqual({ coveredStudentUserIds: [A, B], missingStudentUserIds: [] });
    expect(JSON.parse(JSON.stringify({ contractSources: result.contractSources, contractCoverage: result.contractCoverage })))
      .toEqual({ contractSources: facts.sources, contractCoverage: { coveredStudentUserIds: [A, B], missingStudentUserIds: [] } });
    const docx = await compileRetainedPass(result);
    expect(docx.paragraphs.filter(text => text.includes(facts.line))).toHaveLength(1);
    expect(docx.xml).toContain("SYNTH-&lt;A&amp;B&gt;");
    expect(docx.xml).not.toContain("<A&B>");
    expect(docx.text).toContain(facts.line);
    expect(snapshot).toEqual(before);
  });

  it("prints both selected individual contract numbers with UUID coverage, not a single guessed group contract", async () => {
    const { facts, reader } = await loadSelected([
      sourceRow({ id: CONTRACT_B, contract_number: "SYNTH-B", counterparty_type: "individual", company_id: null,
        student_user_id: B, students: [{ user_id: B }] }),
      sourceRow({ contract_number: "SYNTH-A", counterparty_type: "individual", company_id: null,
        student_user_id: A, students: [{ user_id: A }] }),
    ]);
    const result = build(snapshotFor(facts));
    expect(reader.companies).not.toHaveBeenCalled();
    expect(facts.line).toBe("Номера договоров: № SYNTH-A; № SYNTH-B");
    expect(result.contractSources.map(source => [source.id, source.student_user_ids])).toEqual([[CONTRACT_A, [A]], [CONTRACT_B, [B]]]);
    expect(result.contractCoverage).toEqual({ coveredStudentUserIds: [A, B], missingStudentUserIds: [] });
    expect((await compileRetainedPass(result)).text).toContain(facts.line);
  });

  it("keeps partial selection provenance and its warning but leaves the DOCX source line blank", async () => {
    const { facts } = await loadSelected([sourceRow({ students: [{ user_id: A }] })]);
    expect(facts.sources).toHaveLength(1);
    const result = build(snapshotFor(facts));
    expect(result.scalars.CONTRACT_BASIS_LINE).toBe("");
    expect(result.contractSources).toEqual(facts.sources);
    expect(result.contractCoverage).toEqual({ coveredStudentUserIds: [A], missingStudentUserIds: [B] });
    expect(result.issues).toContainEqual(expect.objectContaining({
      docType: "pass", field: "CONTRACT_BASIS_LINE", code: "contract_coverage_incomplete", severity: "warning",
    }));
    expect(result.rows).toHaveLength(2);
    const docx = await compileRetainedPass(result);
    expect(docx.text).not.toContain(escapedNumber);
    expect(docx.text).not.toContain("Номер договора:");
    expect(docx.text).not.toContain("Номера договоров:");
  });

  it("blank mode suppresses even supplied confirmed contract facts from both DOCX and provenance", async () => {
    const { facts } = await loadSelected([sourceRow()]);
    expect(facts.line).toBe(`Номер договора: № ${escapedNumber}`);
    expect(facts.sources).toHaveLength(1);
    const snapshot = snapshotFor(facts), before = structuredClone(snapshot);
    const result = build(snapshot, "blank");
    expect(result.scalars.CONTRACT_BASIS_LINE).toBe("");
    expect(result.contractSources).toEqual([]);
    expect(result.contractCoverage).toEqual({ coveredStudentUserIds: [], missingStudentUserIds: [] });
    expect(result.issues).toEqual([]);
    const docx = await compileRetainedPass(result);
    expect(docx.text).not.toContain(escapedNumber);
    expect(docx.text).not.toContain("Номер договора:");
    expect(docx.text).not.toContain("Номера договоров:");
    expect(snapshot).toEqual(before);
  });
});
