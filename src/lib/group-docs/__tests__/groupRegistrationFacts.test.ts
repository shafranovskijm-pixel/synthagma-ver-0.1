import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  buildGroupRegistrationFactRows,
  REGISTRATION_FRDO_SELECT,
  REGISTRATION_RECORD_SELECT,
  REGISTRATION_RECORD_STATUSES,
  type GroupRegistrationFactsSnapshot,
} from "../../../../supabase/functions/_shared/docx-ooxml/groupRegistrationFacts";
import { compileGroupDocumentXml, type GroupDocumentManifest } from "../../../../supabase/functions/_shared/docx-ooxml/groupDocument";
import { findUnresolvedTokens } from "../../../../supabase/functions/_shared/docx-ooxml/xml";
import { GROUP_DOCUMENT_TEMPLATE_BUNDLE } from "../../../../supabase/functions/_shared/group-doc-templates/goreltech/group-package/v1/embedded";
import { buildRegistrationBlankRows } from "../factualData";
import { parseGeneratedHtmlRows } from "../../../../supabase/functions/_shared/docx-ooxml/groupDocument";
import { getOksmName } from "@/constants/oksm";

function fixture(): GroupRegistrationFactsSnapshot {
  return {
    organization: { id: "org-1", name: "ООО «ИЦ «ГОРЭЛТЕХ»" },
    group: {
      id: "group-1", organization_id: "org-1", course_id: "course-1",
      group_number: "1-ПК-26", program_title: "Сохранённая программа группы",
      start_date: "2026-09-01", end_date: "2026-09-30",
    },
    course: { id: "course-1", organization_id: "org-1" },
    profiles: [{
      user_id: "user-1", organization_id: "org-1", student_group_id: "group-1",
      archived_at: null, full_name: "Иванов Иван Иванович",
    }],
    enrollments: [{ id: "enrollment-1", user_id: "user-1", course_id: "course-1" }],
    educationDocumentRecords: [{
      id: "record-1", organization_id: "org-1", enrollment_id: "enrollment-1",
      user_id: "user-1", course_id: "course-1", group_id: "group-1",
      document_status: "original", deleted_at: null, full_name: "Иванов Иван Иванович",
      birth_date: "1990-01-02", document_type: "certificate", document_series: "ПК",
      document_number: "000123", reg_number: "000045", issue_date: "2026-10-01",
      order_number: "007", order_date: "2026-09-30", specialty_name: "Программа документа",
    }],
    studentFrdoData: [{
      id: "frdo-1", user_id: "user-1", organization_id: "org-1",
      last_name: "Иванов", first_name: "Иван", middle_name: "Иванович",
      birth_date: "1990-01-02", gender: "male", citizenship_code: "643",
      passport_series: "0001", passport_number: "000002",
    }],
  };
}

const build = (snapshot: GroupRegistrationFactsSnapshot, fillMode: "data" | "blank" = "data") =>
  buildGroupRegistrationFactRows({ snapshot, fillMode });
const codes = (result: ReturnType<typeof build>) => result.issues.map((issue) => issue.code);

describe("server registration-book records", () => {
  it("uses the real schema columns/statuses and every exact retained manifest token", () => {
    expect(REGISTRATION_RECORD_STATUSES).toEqual(["original", "duplicate"]);
    for (const key of REGISTRATION_RECORD_SELECT.split(", ")) expect(fixture().educationDocumentRecords[0]).toHaveProperty(key);
    for (const key of REGISTRATION_FRDO_SELECT.split(", ")) expect(fixture().studentFrdoData[0]).toHaveProperty(key);
    const manifest = JSON.parse(GROUP_DOCUMENT_TEMPLATE_BUNDLE.registration_book.manifestJson);
    const result = build(fixture());
    expect(Object.keys(result.rows[0])).toEqual(manifest.row_tokens);
    expect(result.issues).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      DOCUMENT_ISSUER: "Удостоверение о повышении квалификации. ООО «ИЦ «ГОРЭЛТЕХ»",
      PROGRAM_GROUP: "Программа дополнительного профессионального образования «Программа документа»; группа № 1-ПК-26; срок обучения 01.09.2026–30.09.2026",
      REGISTRATION_NUMBER_ISSUE_DATE: "000045, 01.10.2026", SERIES_NUMBER: "ПК 000123",
      STUDENT_NAME: "Иванов Иван Иванович", BIRTH_DATE: "1990", GENDER: "М",
      IDENTITY_DOCUMENT: "0001 000002", CITIZENSHIP: "Россия", COMPLETION_ORDER: "007 от 30.09.2026",
      DIRECTOR_SIGN: "", RECIPIENT_SIGN: "", TRUSTEE_SIGN: "", LOSS_NOTE: "", DUPLICATE_SIGN: "",
    });
    expect(result.rowSources).toEqual([{ userId: "user-1", enrollmentId: "enrollment-1", recordId: "record-1" }]);
    expect(result).not.toHaveProperty("docStatus");
    expect(result).not.toHaveProperty("serverVerifiedCriticalRequisites");
  });

  it.each(["draft", "cancelled", "issued", "", "Original"])("does not invent support for status %s", (document_status) => {
    const snapshot = fixture();
    snapshot.educationDocumentRecords = [{ ...snapshot.educationDocumentRecords[0], document_status }];
    expect(build(snapshot).rows).toEqual([]);
    expect(codes(build(snapshot))).toContain("record_not_eligible");
  });

  it("excludes soft-deleted records, never expands to the roster in data mode", () => {
    const snapshot = fixture();
    snapshot.educationDocumentRecords = [{ ...snapshot.educationDocumentRecords[0], deleted_at: "2026-10-02T10:00:00Z" }];
    expect(build(snapshot).rows).toEqual([]);
    snapshot.educationDocumentRecords = [];
    expect(codes(build(snapshot))).toContain("no_registration_records");
    expect(build(snapshot, "blank").rows).toHaveLength(1);
  });

  it.each([
    { organization_id: "org-foreign" }, { enrollment_id: null }, { enrollment_id: "other-enrollment" },
    { user_id: "other-user" }, { course_id: "other-course" }, { group_id: "other-group" },
  ])("rejects conflicting provenance %j despite identical display names", (patch) => {
    const snapshot = fixture();
    snapshot.educationDocumentRecords = [{ ...snapshot.educationDocumentRecords[0], ...patch }];
    expect(build(snapshot).rows).toEqual([]);
    expect(codes(build(snapshot))).toContain("record_scope_mismatch");
  });

  it("resolves nullable legacy provenance only by the exact enrollment FK", () => {
    const snapshot = fixture();
    snapshot.educationDocumentRecords = [{ ...snapshot.educationDocumentRecords[0], user_id: null, course_id: null, group_id: null }];
    expect(build(snapshot).rows).toHaveLength(1);
    expect(codes(build(snapshot))).toContain("linkage_incomplete");
    snapshot.enrollments = [{ ...snapshot.enrollments[0], course_id: "foreign-course" }];
    expect(build(snapshot).rows).toEqual([]);
  });

  it("excludes an old document before this group's start even when enrollment ID was reused", () => {
    const snapshot = fixture();
    snapshot.educationDocumentRecords = [{ ...snapshot.educationDocumentRecords[0], group_id: null, issue_date: "2026-08-31" }];
    expect(build(snapshot).rows).toEqual([]);
    expect(codes(build(snapshot))).toContain("historical_document_outside_group");
    snapshot.educationDocumentRecords = [{ ...snapshot.educationDocumentRecords[0], issue_date: "2026-12-01" }];
    expect(build(snapshot).rows).toHaveLength(1);
  });

  it("warns about unconfirmed historical attribution if the group's start is absent", () => {
    const snapshot = fixture();
    snapshot.group.start_date = null;
    expect(build(snapshot).rows).toHaveLength(1);
    expect(codes(build(snapshot))).toContain("group_period_not_confirmed");
    expect(build(snapshot).rows[0].PROGRAM_GROUP).not.toContain("срок обучения");
  });

  it.each(["archive", "foreign-org", "foreign-group", "duplicate-profile", "duplicate-enrollment", "course-scope", "group-scope"])("fails closed for %s", (kind) => {
    const snapshot = fixture();
    if (kind === "archive") snapshot.profiles = [{ ...snapshot.profiles[0], archived_at: "2026-10-02T00:00:00Z" }];
    if (kind === "foreign-org") snapshot.profiles = [{ ...snapshot.profiles[0], organization_id: "foreign" }];
    if (kind === "foreign-group") snapshot.profiles = [{ ...snapshot.profiles[0], student_group_id: "foreign" }];
    if (kind === "duplicate-profile") snapshot.profiles = [snapshot.profiles[0], { ...snapshot.profiles[0], full_name: "Конфликт" }];
    if (kind === "duplicate-enrollment") snapshot.enrollments = [snapshot.enrollments[0], { ...snapshot.enrollments[0], user_id: "foreign" }];
    if (kind === "course-scope") snapshot.course = { ...snapshot.course!, organization_id: "foreign" };
    if (kind === "group-scope") snapshot.group = { ...snapshot.group, organization_id: "foreign" };
    expect(build(snapshot).rows).toEqual([]);
    expect(build(snapshot).issues.length).toBeGreaterThan(0);
  });

  it("retains distinct original and duplicate records of one student and same-name students", () => {
    const snapshot = fixture();
    snapshot.profiles = [...snapshot.profiles, { ...snapshot.profiles[0], user_id: "user-2" }];
    snapshot.enrollments = [...snapshot.enrollments, { ...snapshot.enrollments[0], id: "enrollment-2", user_id: "user-2" }];
    snapshot.educationDocumentRecords = [
      { ...snapshot.educationDocumentRecords[0], id: "record-3", user_id: "user-2", enrollment_id: "enrollment-2", document_number: "003", reg_number: "003" },
      { ...snapshot.educationDocumentRecords[0], id: "record-2", document_status: "duplicate", document_number: "002", reg_number: "002" },
      snapshot.educationDocumentRecords[0],
    ];
    snapshot.studentFrdoData = [...snapshot.studentFrdoData, { ...snapshot.studentFrdoData[0], id: "frdo-2", user_id: "user-2", passport_number: "999999" }];
    const result = build(snapshot);
    expect(result.rows).toHaveLength(3);
    expect(new Set(result.rowSources.map((row) => row.recordId)).size).toBe(3);
    const second = result.rowSources.findIndex((row) => row.userId === "user-2");
    expect(result.rows[second].IDENTITY_DOCUMENT).toBe("0001 999999");
    expect(result.issues).toEqual([]);
  });

  it("rejects repeated IDs instead of arbitrarily selecting one version", () => {
    const snapshot = fixture();
    snapshot.educationDocumentRecords = [snapshot.educationDocumentRecords[0], { ...snapshot.educationDocumentRecords[0], document_number: "conflict" }];
    expect(build(snapshot).rows).toEqual([]);
    expect(codes(build(snapshot))).toContain("duplicate_record_id");
  });

  it("retains distinct records with number conflicts but explicitly flags every affected record", () => {
    const snapshot = fixture();
    snapshot.educationDocumentRecords = [snapshot.educationDocumentRecords[0], { ...snapshot.educationDocumentRecords[0], id: "record-2" }];
    const result = build(snapshot);
    expect(result.rows).toHaveLength(2);
    expect(result.issues.filter((issue) => issue.code === "conflicting_document_number")).toHaveLength(4);
  });

  it("never leaks same-user foreign-org FRDO or guesses from a namesake", () => {
    const snapshot = fixture();
    snapshot.studentFrdoData = [{ ...snapshot.studentFrdoData[0], organization_id: "foreign", passport_number: "SECRET" }];
    const result = build(snapshot);
    expect(result.rows[0]).toMatchObject({ STUDENT_NAME: "Иванов Иван Иванович", BIRTH_DATE: "1990", GENDER: "", CITIZENSHIP: "", IDENTITY_DOCUMENT: "" });
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(codes(result)).toContain("missing_registration_detail");
  });

  it("leaves ambiguous or RLS-hidden personal data blank without losing confirmed registry records", () => {
    const snapshot = fixture();
    snapshot.studentFrdoData = [snapshot.studentFrdoData[0], { ...snapshot.studentFrdoData[0], id: "frdo-conflict", gender: "female" }];
    const result = build(snapshot);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].GENDER).toBe("");
    expect(codes(result)).toContain("ambiguous_student_frdo");
    snapshot.studentFrdoData = [];
    expect(build(snapshot).rows).toHaveLength(1);
  });

  it("preserves registry name/date snapshots while warning about newer conflicting personal data", () => {
    const snapshot = fixture();
    snapshot.studentFrdoData = [{ ...snapshot.studentFrdoData[0], last_name: "Петров", birth_date: "2000-01-01" }];
    const result = build(snapshot);
    expect(result.rows[0].STUDENT_NAME).toBe("Иванов Иван Иванович");
    expect(result.rows[0].BIRTH_DATE).toBe("1990");
    expect(result.issues.filter((issue) => issue.code === "record_personal_conflict")).toHaveLength(2);
  });

  it("uses confirmed current fields only when registry values are missing and labels programme fallback", () => {
    const snapshot = fixture();
    snapshot.educationDocumentRecords = [{ ...snapshot.educationDocumentRecords[0], full_name: "", birth_date: null, specialty_name: "" }];
    const result = build(snapshot);
    expect(result.rows[0]).toMatchObject({ STUDENT_NAME: "Иванов Иван Иванович", BIRTH_DATE: "1990" });
    expect(result.rows[0].PROGRAM_GROUP).toContain("Сохранённая программа группы");
    expect(codes(result)).toContain("program_from_current_group");
  });

  it("does not fabricate numbers, dates, gender, country or signatures for incomplete records", () => {
    const snapshot = fixture();
    snapshot.group.start_date = "2026-02-30";
    snapshot.group.end_date = "2026-01-01";
    snapshot.group.program_title = "";
    snapshot.educationDocumentRecords = [{ ...snapshot.educationDocumentRecords[0], document_series: null, document_number: "", reg_number: "", issue_date: "2026-02-30", order_number: null, order_date: "yesterday", birth_date: "2026-02-30", specialty_name: "" }];
    snapshot.studentFrdoData = [{ id: "frdo-1", user_id: "user-1", organization_id: "org-1", gender: "может быть", passport_series: "0001" }];
    const result = build(snapshot);
    expect(result.rows[0]).toMatchObject({ REGISTRATION_NUMBER_ISSUE_DATE: "", SERIES_NUMBER: "", BIRTH_DATE: "", GENDER: "", CITIZENSHIP: "", COMPLETION_ORDER: "", IDENTITY_DOCUMENT: "0001", RECIPIENT_SIGN: "" });
    expect(result.rows[0].PROGRAM_GROUP).toBe("группа № 1-ПК-26");
    expect(result.issues).toContainEqual(expect.objectContaining({ field: "passport_number", code: "missing_registration_detail" }));
  });

  it("supports trusted country labels without inventing a country when the code is absent/unknown", () => {
    const snapshot = fixture();
    expect(build(snapshot).rows[0].CITIZENSHIP).toBe(getOksmName("643"));
    const result = buildGroupRegistrationFactRows({ snapshot, fillMode: "data", citizenshipNamesByCode: { "643": "Согласованное название" } });
    expect(result.rows[0].CITIZENSHIP).toBe("Согласованное название");
    const defaultResult = buildGroupRegistrationFactRows({ snapshot, fillMode: "data" });
    expect(defaultResult.rows[0].CITIZENSHIP).toBe("Россия");
    snapshot.studentFrdoData = [{ ...snapshot.studentFrdoData[0], citizenship_code: "999" }];
    expect(build(snapshot).rows[0].CITIZENSHIP).toBe("999");
    snapshot.studentFrdoData = [{ ...snapshot.studentFrdoData[0], citizenship_code: null }];
    expect(build(snapshot).rows[0].CITIZENSHIP).toBe("");
  });

  it("preserves explicit manual blank mode without requiring a course, records or FRDO", () => {
    const snapshot = fixture();
    snapshot.course = null;
    snapshot.enrollments = [];
    snapshot.educationDocumentRecords = [];
    snapshot.studentFrdoData = [];
    const result = build(snapshot, "blank");
    const tokens = JSON.parse(GROUP_DOCUMENT_TEMPLATE_BUNDLE.registration_book.manifestJson).row_tokens;
    const existing = buildRegistrationBlankRows([{ user_id: "user-1", full_name: snapshot.profiles[0].full_name! }], snapshot.group.end_date!, snapshot.group.program_title!, snapshot.group.group_number!, snapshot.group.start_date!);
    expect(result.rows).toEqual(parseGeneratedHtmlRows(existing, tokens));
    expect(result.rowSources).toEqual([{ userId: "user-1", enrollmentId: null, recordId: null }]);
    expect(result.issues).toEqual([]);
  });

  it("does not mutate its snapshot or accept extra browser HTML as evidence", () => {
    const snapshot = fixture();
    const before = structuredClone(snapshot);
    const result = build({ ...snapshot, ...{ html: "INJECTED", variables: { registration_rows: "INJECTED" } } });
    expect(snapshot).toEqual(before);
    expect(JSON.stringify(result)).not.toContain("INJECTED");
  });

  it.each([0, 1, 6])("compiles %i exact registry rows into the retained DOCX, preserving headers and all other ZIP parts", async (count) => {
    const template = GROUP_DOCUMENT_TEMPLATE_BUNDLE.registration_book;
    const manifest = JSON.parse(template.manifestJson) as GroupDocumentManifest;
    const bytes = Buffer.from(template.templateBase64, "base64");
    expect(createHash("sha256").update(bytes).digest("hex").toUpperCase()).toBe(manifest.template_sha256);
    expect(bytes).toEqual(readFileSync(resolve("supabase/functions/_shared/group-doc-templates/goreltech/group-package/v1/templates/registration_book.docx")));
    const source = await JSZip.loadAsync(bytes), output = await JSZip.loadAsync(bytes);
    const originalXml = await source.file("word/document.xml")!.async("string");
    const snapshot = fixture();
    snapshot.educationDocumentRecords = Array.from({ length: count }, (_, index) => ({
      ...snapshot.educationDocumentRecords[0], id: `record-${index}`, reg_number: `REG-${index}`, document_number: `DOC-${index}`, specialty_name: "Программа <А> & Б",
    }));
    snapshot.studentFrdoData = [{ ...snapshot.studentFrdoData[0], organization_id: "foreign", passport_number: "FOREIGN_SECRET" }, snapshot.studentFrdoData[0]];
    const facts = build(snapshot);
    const scalars = Object.fromEntries(findUnresolvedTokens(originalXml).map((token) => [token.slice(2, -2), ""]));
    const compiled = compileGroupDocumentXml({ documentXml: originalXml, manifest, snapshot: { rows: facts.rows, scalars } });
    output.file("word/document.xml", compiled);
    const reread = await JSZip.loadAsync(await output.generateAsync({ type: "nodebuffer" }));
    const xml = await reread.file("word/document.xml")!.async("string");
    const parsed = new DOMParser().parseFromString(xml, "application/xml");
    expect(parsed.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(findUnresolvedTokens(xml)).toEqual([]);
    expect(xml).not.toContain("FOREIGN_SECRET");
    const table = parsed.getElementsByTagName("w:tbl")[manifest.repeater!.table_index];
    expect(table.getElementsByTagName("w:tr")).toHaveLength(manifest.repeater!.header_rows + Math.max(count, manifest.repeater!.minimum_rows!));
    if (count) {
      expect(xml).toContain("Программа &lt;А&gt; &amp; Б");
      expect(xml).toContain("Иванов Иван Иванович");
      const cells = Array.from(table.getElementsByTagName("w:tr")[manifest.repeater!.header_rows].getElementsByTagName("w:tc"));
      expect(cells[4].textContent).toBe("ПК DOC-0");
      expect(cells[6].textContent).toBe("1990");
      for (const cell of cells.slice(11)) expect(cell.textContent).toBe("");
    } else expect(xml).not.toContain("Иванов Иван Иванович");
    expect(xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)).toEqual(originalXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g));
    const size = parsed.getElementsByTagName("w:pgSz")[0];
    expect(Number(size.getAttribute("w:w"))).toBeGreaterThan(Number(size.getAttribute("w:h")));
    expect(Object.keys(reread.files).sort()).toEqual(Object.keys(source.files).sort());
    for (const [path, part] of Object.entries(source.files)) {
      if (part.dir || path === "word/document.xml") continue;
      expect(await reread.file(path)!.async("nodebuffer"), path).toEqual(await part.async("nodebuffer"));
    }
  }, 15000);
});
