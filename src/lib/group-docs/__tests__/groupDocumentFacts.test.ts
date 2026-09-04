import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  buildGroupDocumentFactRows,
  type GroupDocumentFactsSnapshot,
  type GroupDocumentFactsType,
} from "../../../../supabase/functions/_shared/docx-ooxml/groupDocumentFacts";
import {
  compileGroupDocumentXml,
  type GroupDocumentManifest,
} from "../../../../supabase/functions/_shared/docx-ooxml/groupDocument";
import { findUnresolvedTokens } from "../../../../supabase/functions/_shared/docx-ooxml/xml";
import { GROUP_DOCUMENT_TEMPLATE_BUNDLE } from "../../../../supabase/functions/_shared/group-doc-templates/goreltech/group-package/v1/embedded";

function fixture(): GroupDocumentFactsSnapshot {
  return {
    organization: { id: "org-1" },
    group: {
      id: "group-1", organization_id: "org-1", course_id: "course-1",
      group_number: "1-ПК-26", program_title: "Программа из группы", program_hours: 40,
      start_date: "2026-09-01", end_date: "2026-09-30",
    },
    course: {
      id: "course-1", organization_id: "org-1", title: "Название курса",
      duration: "72", frdo_duration_hours: 48,
    },
    profiles: [{
      user_id: "user-1", organization_id: "org-1", student_group_id: "group-1",
      archived_at: null, full_name: "Иванов Иван Иванович", email: "learner@example.invalid",
    }],
    enrollments: [{
      id: "enrollment-1", user_id: "user-1", course_id: "course-1",
      status: "completed", progress: 100, completed_at: "2026-09-30T12:00:00Z",
    }],
    studentFrdoData: [{
      user_id: "user-1", organization_id: "org-1", passport_series: "0001",
      passport_number: "000234", education_level: "Высшее образование",
    }],
  };
}

const types: GroupDocumentFactsType[] = ["enrollment_order", "expulsion_order", "student_list"];
const build = (snapshot: GroupDocumentFactsSnapshot, docType: GroupDocumentFactsType = "enrollment_order") =>
  buildGroupDocumentFactRows({ docType, snapshot });

describe("server factual rows for the original GORELTECH documents", () => {
  it.each(["enrollment_order", "student_list"] as const)("emits exactly %s manifest.row_tokens without padding or invented people", (docType) => {
    const manifest = JSON.parse(readFileSync(resolve(
      "supabase/functions/_shared/group-doc-templates/goreltech/group-package/v1/manifests",
      `${docType}.json`,
    ), "utf8"));
    const result = build(fixture(), docType);
    expect(result.rows).toHaveLength(1);
    expect(Object.keys(result.rows[0])).toEqual(manifest.row_tokens);
    expect(result.issues).toEqual([]);
    expect(result.docType).toBe(docType);
    expect(result).not.toHaveProperty("docStatus");
    expect(result).not.toHaveProperty("serverVerifiedCriticalRequisites");
  });

  it("uses stored fields and authoritative dates and leaves the agreed basis empty", () => {
    const snapshot = {
      ...fixture(),
      variables: { STUDENT_NAME: "Injected", START_DATE_RU: "Injected", students_list_rows: "<tr>Injected</tr>" },
      html: "<table><tr><td>Injected</td></tr></table>",
    };
    const result = build(snapshot);
    expect(result.rows).toEqual([{
      N: "1", STUDENT_NAME: "Иванов Иван Иванович", STUDENT_PROGRAM: "Программа из группы",
      STUDENT_HOURS: "40", STUDENT_PERIOD: "01.09.2026–30.09.2026", STUDENT_BASIS: "",
    }]);
    expect(result.scalars).toEqual({
      GROUP_NUMBER: "1-ПК-26", PROGRAM_TITLE: "Программа из группы", PROGRAM_HOURS: "40",
      START_DATE: "01.09.2026", END_DATE: "30.09.2026",
      START_DATE_RU: "«01» сентября 2026 г", END_DATE_RU: "«30» сентября 2026 г",
    });
    expect(JSON.stringify(result)).not.toContain("Injected");
  });

  it("keeps different user IDs with identical names and joins FRDO by org + user", () => {
    const snapshot = fixture();
    snapshot.profiles = [
      { ...snapshot.profiles[0], user_id: "user-2", email: "second@example.invalid" },
      snapshot.profiles[0],
    ];
    snapshot.studentFrdoData = [
      { ...snapshot.studentFrdoData[0], user_id: "user-2", passport_number: "900000" },
      { ...snapshot.studentFrdoData[0], organization_id: "org-other", passport_number: "OUTSIDE" },
      snapshot.studentFrdoData[0],
    ];
    const result = build(snapshot, "student_list");
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((row) => row.PASSPORT_NUMBER)).toEqual(["000234", "900000"]);
    expect(result.rows.map((row) => row.EMAIL)).toEqual(["learner@example.invalid", "second@example.invalid"]);
    expect(result.rowSources).toEqual([
      { userId: "user-1", enrollmentId: null }, { userId: "user-2", enrollmentId: null },
    ]);
  });

  it("retains every active participant without enrollment in draft enrollment order", () => {
    const snapshot = fixture();
    snapshot.profiles = [...snapshot.profiles, { ...snapshot.profiles[0], user_id: "user-2", full_name: "Второй участник" }];
    const result = build(snapshot, "enrollment_order");
    expect(result.rows.map((row) => row.STUDENT_NAME)).toEqual(["Второй участник", "Иванов Иван Иванович"]);
    expect(result.rowSources).toEqual([
      { userId: "user-2", enrollmentId: null }, { userId: "user-1", enrollmentId: "enrollment-1" },
    ]);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "missing_enrollment", docType: "enrollment_order", userId: "user-2", severity: "warning",
    }));
  });

  it("uses alphabetical display order, with ID ties, regardless of source array order", () => {
    const snapshot = fixture();
    snapshot.profiles = [
      { ...snapshot.profiles[0], user_id: "a", full_name: "Яковлев Яков" },
      { ...snapshot.profiles[0], user_id: "z", full_name: "Антонов Антон" },
      { ...snapshot.profiles[0], user_id: "y", full_name: "Антонов Антон" },
    ];
    const first = build(snapshot, "student_list");
    const second = build({ ...snapshot, profiles: [...snapshot.profiles].reverse() }, "student_list");
    expect(first).toEqual(second);
    expect(first.rowSources.map((source) => source.userId)).toEqual(["y", "z", "a"]);
  });

  it("does not match an enrollment on another course or of another user", () => {
    const snapshot = fixture();
    snapshot.enrollments = [
      { ...snapshot.enrollments[0], course_id: "course-other" },
      { ...snapshot.enrollments[0], user_id: "user-other" },
    ];
    const result = build(snapshot);
    expect(result.rows).toHaveLength(1);
    expect(result.rowSources[0].enrollmentId).toBeNull();
    expect(result.issues[0].code).toBe("missing_enrollment");
  });

  it("does not arbitrarily choose duplicate enrollments or duplicate FRDO rows", () => {
    const snapshot = fixture();
    snapshot.enrollments = [...snapshot.enrollments, { ...snapshot.enrollments[0], id: "enrollment-2" }];
    snapshot.studentFrdoData = [...snapshot.studentFrdoData, { ...snapshot.studentFrdoData[0], passport_number: "CONFLICT" }];
    const order = build(snapshot);
    expect(order.rows).toHaveLength(1);
    expect(order.rowSources[0].enrollmentId).toBeNull();
    expect(order.issues.map((issue) => issue.code)).toEqual(["ambiguous_enrollment"]);
    const list = build(snapshot, "student_list");
    expect(list.rows[0]).toMatchObject({ PASSPORT_SERIES: "", PASSPORT_NUMBER: "", EDUCATION: "" });
    expect(list.issues).toContainEqual(expect.objectContaining({ code: "ambiguous_student_frdo", userId: "user-1" }));
    expect(list.issues.some((issue) => issue.code.includes("enrollment"))).toBe(false);
  });

  it("deduplicates by user ID without arbitrarily choosing conflicting personal data", () => {
    const snapshot = fixture();
    snapshot.profiles = [...snapshot.profiles, { ...snapshot.profiles[0], full_name: "Конфликт" }];
    const result = build(snapshot);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].STUDENT_NAME).toBe("");
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "ambiguous_profile", userId: "user-1" }));
  });

  it("does not leak profiles outside the organization/group or include archived participants", () => {
    const snapshot = fixture();
    snapshot.profiles = [
      snapshot.profiles[0],
      { ...snapshot.profiles[0], user_id: "other-org", organization_id: "org-other", full_name: "OUTSIDE_ORG" },
      { ...snapshot.profiles[0], user_id: "other-group", student_group_id: "group-other", full_name: "OUTSIDE_GROUP" },
      { ...snapshot.profiles[0], user_id: "archived", archived_at: "2026-01-01T00:00:00Z", full_name: "ARCHIVED" },
    ];
    const result = build(snapshot);
    expect(result.rows).toHaveLength(1);
    expect(result.issues.filter((issue) => issue.code === "profile_scope_mismatch")).toHaveLength(2);
    expect(JSON.stringify(result)).not.toMatch(/OUTSIDE_ORG|OUTSIDE_GROUP|ARCHIVED/);
  });

  it("rejects a group outside organization before reading any personal data", () => {
    const snapshot = fixture();
    snapshot.group.organization_id = "org-other";
    const result = build(snapshot);
    expect(result.rows).toEqual([]);
    expect(result.rowSources).toEqual([]);
    expect(Object.values(result.scalars).every((value) => value === "")).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toEqual(["group_scope_mismatch"]);
  });

  it.each(["organization_id", "id"] as const)("does not use a course with mismatched %s even as fallback", (field) => {
    const snapshot = fixture();
    snapshot.course = { ...snapshot.course!, [field]: "outside", title: "OUTSIDE_COURSE" };
    snapshot.group.program_title = null;
    snapshot.group.program_hours = null;
    const result = build(snapshot);
    expect(result.rows).toHaveLength(1);
    expect(result.scalars.PROGRAM_TITLE).toBe("");
    expect(result.scalars.PROGRAM_HOURS).toBe("");
    expect(result.rowSources[0].enrollmentId).toBeNull();
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "course_scope_mismatch", severity: "error" }));
    expect(JSON.stringify(result)).not.toContain("OUTSIDE_COURSE");
  });

  it("uses only stored program fallbacks and positive numeric hours", () => {
    const snapshot = fixture();
    snapshot.group.program_title = " ";
    snapshot.group.program_hours = -1;
    expect(build(snapshot).scalars).toMatchObject({ PROGRAM_TITLE: "Название курса", PROGRAM_HOURS: "48" });
    snapshot.course!.frdo_duration_hours = null;
    expect(build(snapshot).scalars.PROGRAM_HOURS).toBe("72");
    snapshot.course!.duration = "72 часа";
    expect(build(snapshot).scalars.PROGRAM_HOURS).toBe("");
    snapshot.group.program_hours = Infinity;
    snapshot.course!.duration = "0x48";
    expect(build(snapshot).scalars.PROGRAM_HOURS).toBe("");
    expect(build(snapshot).issues).toContainEqual(expect.objectContaining({ code: "missing_program_hours" }));
  });

  it.each([null, "", "2026-02-30", "2025-02-29", "2026-13-01", "01.09.2026", "2026-09-01T00:00:00Z"])("does not invent/normalize absent or invalid date %s", (date) => {
    const snapshot = fixture();
    snapshot.group.start_date = date;
    const result = build(snapshot);
    expect(result.scalars.START_DATE).toBe("");
    expect(result.scalars.START_DATE_RU).toBe("");
    expect(result.rows[0].STUDENT_PERIOD).toBe("");
    expect(result.issues).toContainEqual(expect.objectContaining({ field: "group.start_date" }));
  });

  it("accepts leap date deterministically and does not repair a reversed period", () => {
    const snapshot = fixture();
    snapshot.group.start_date = "2024-02-29";
    expect(build(snapshot).scalars.START_DATE_RU).toBe("«29» февраля 2024 г");
    snapshot.group.end_date = "2024-02-01";
    const result = build(snapshot);
    expect(result.scalars).toMatchObject({ START_DATE: "", END_DATE: "", START_DATE_RU: "", END_DATE_RU: "" });
    expect(result.rows[0].STUDENT_PERIOD).toBe("");
    expect(result.issues).toContainEqual(expect.objectContaining({ code: "invalid_group_period" }));
  });

  it("does not make missing FRDO data block an order or absent enrollments/dates/hours block a student list", () => {
    const snapshot = fixture();
    snapshot.studentFrdoData = [];
    expect(build(snapshot).issues).toEqual([]);
    snapshot.studentFrdoData = fixture().studentFrdoData;
    snapshot.enrollments = [];
    snapshot.group.start_date = null;
    snapshot.group.end_date = null;
    snapshot.group.program_hours = null;
    snapshot.course = null;
    expect(build(snapshot, "student_list").issues).toEqual([]);
  });

  it("leaves missing personal fields blank and identifies each field/user/document", () => {
    const snapshot = fixture();
    snapshot.studentFrdoData = [];
    snapshot.profiles = [{ ...snapshot.profiles[0], email: null, full_name: null }];
    const result = build(snapshot, "student_list");
    expect(result.rows[0]).toEqual({ N: "1", STUDENT_NAME: "", EMAIL: "", PASSPORT_SERIES: "", PASSPORT_NUMBER: "", EDUCATION: "" });
    expect(result.issues).toHaveLength(5);
    expect(result.issues.every((issue) => issue.userId === "user-1" && issue.docType === "student_list")).toBe(true);
  });

  it.each(["active", "completed"])("keeps expulsion as a manual form regardless of status=%s", (status) => {
    const snapshot = fixture();
    snapshot.enrollments = [{ ...snapshot.enrollments[0], status }];
    const result = build(snapshot, "expulsion_order");
    expect(result.rows).toEqual([]);
    expect(result.rowSources).toEqual([]);
    expect(result).not.toHaveProperty("docStatus");
    expect(result.scalars).toMatchObject({ GROUP_NUMBER: "1-ПК-26", PROGRAM_TITLE: "Программа из группы", PROGRAM_HOURS: "40", END_DATE: "30.09.2026" });
    expect(result.issues).toEqual([expect.objectContaining({
      docType: "expulsion_order", code: "expulsion_classification_not_confirmed",
      field: "expulsion_decisions", severity: "warning",
      message: expect.stringContaining("бланк для ручного оформления"),
    })]);
    expect(JSON.stringify(result)).not.toMatch(/user-1|enrollment-1|Иванов Иван Иванович/);
  });

  it.each([
    { status: "completed", progress: 0, completed_at: null },
    { status: "completed", progress: 100, completed_at: null },
    { status: "completed", progress: 0, completed_at: "2026-09-30T12:00:00Z" },
    { status: "completed", progress: 99, completed_at: "2026-09-30T12:00:00Z" },
    { status: "completed", progress: 100, completed_at: "2026-09-30T12:00:00Z" },
    { status: "active", progress: 100, completed_at: "2026-09-30T12:00:00Z" },
  ])("does not classify certificate issuance from completion evidence: %j", (evidence) => {
    const snapshot = fixture();
    snapshot.enrollments = [{ ...snapshot.enrollments[0], ...evidence }];
    const expulsion = build(snapshot, "expulsion_order");
    expect(expulsion.rows).toEqual([]);
    expect(expulsion.rowSources).toEqual([]);
    expect(expulsion.issues[0].code).toBe("expulsion_classification_not_confirmed");
    const enrollment = build(snapshot, "enrollment_order");
    expect(enrollment.issues).toEqual([]);
    expect(enrollment.rows[0].STUDENT_NAME).toBe("Иванов Иван Иванович");
    expect(build(snapshot, "student_list").issues).toEqual([]);
  });

  it("returns an explicit empty-roster issue, not a sample person or minimum-row padding", () => {
    const snapshot = fixture();
    snapshot.profiles = [];
    expect(build(snapshot).rows).toEqual([]);
    expect(build(snapshot).issues).toContainEqual(expect.objectContaining({ code: "empty_group" }));
  });

  it("does not mutate the source snapshot or pre-escape OOXML text", () => {
    const snapshot = fixture();
    snapshot.group.program_title = "Курс <А> & Б";
    const original = structuredClone(snapshot);
    expect(build(snapshot).rows[0].STUDENT_PROGRAM).toBe("Курс <А> & Б");
    expect(snapshot).toEqual(original);
  });

  it.each(["с выдачей удостоверений", "без выдачи удостоверений"])(
    "ignores forged browser outcome %s in both retained expulsion tables", async (outcome) => {
      // Even a completed course and a browser-supplied decision are not an
      // authoritative issuance decision for this exact enrollment.
      const snapshot = {
        ...fixture(),
        variables: {
          EXPULSION_OUTCOME: outcome,
          students_list_rows: "<tr><td>FORGED_BROWSER_NAME</td></tr>",
        },
        expulsionDecisions: [{ userId: "user-1", enrollmentId: "enrollment-1", outcome }],
      };
      const facts = build(snapshot, "expulsion_order");
      expect(facts.rows).toEqual([]);
      expect(facts.rowSources).toEqual([]);
      const template = GROUP_DOCUMENT_TEMPLATE_BUNDLE.expulsion_order;
      const manifest = JSON.parse(template.manifestJson) as GroupDocumentManifest;
      const bytes = Buffer.from(template.templateBase64, "base64");
      expect(createHash("sha256").update(bytes).digest("hex").toUpperCase()).toBe(manifest.template_sha256);
      const zip = await JSZip.loadAsync(bytes);
      const sourceXml = await zip.file("word/document.xml")!.async("string");
      const remainingScalars = Object.fromEntries(findUnresolvedTokens(sourceXml)
        .map((token) => [token.slice(2, -2), ""]));
      const compiled = compileGroupDocumentXml({ documentXml: sourceXml, manifest,
        snapshot: { rows: facts.rows, rowsBySource: { expulsion_with_issuance: [], expulsion_without_issuance: [] }, scalars: { ...remainingScalars, EXPULSION_OUTCOME: outcome, ...facts.scalars } },
      });
      expect(findUnresolvedTokens(compiled)).toEqual([]);
      expect(compiled).not.toMatch(/Иванов Иван Иванович|user-1|enrollment-1|FORGED_BROWSER_NAME/);
      const original = new DOMParser().parseFromString(sourceXml, "application/xml");
      const generated = new DOMParser().parseFromString(compiled, "application/xml");
      expect(generated.getElementsByTagName("parsererror")).toHaveLength(0);
      const tables = generated.getElementsByTagName("w:tbl");
      expect(tables).toHaveLength(2);
      const sourceSecondTable = original.getElementsByTagName("w:tbl")[1];
      expect(tables[1].getElementsByTagName("w:tblPr")[0].outerHTML).toBe(sourceSecondTable.getElementsByTagName("w:tblPr")[0].outerHTML);
      const emptyBody = tables[1].getElementsByTagName("w:tr")[2];
      expect(Array.from(emptyBody.getElementsByTagName("w:t")).map(node => node.textContent).join("")).toBe("");
      const renderedText = Array.from(generated.getElementsByTagName("w:t")).map((node) => node.textContent).join("");
      expect(renderedText).toContain("отчислить с выдачей удостоверений установленного образца");
      expect(renderedText).toContain("Отчислить без выдачи удостоверений");
      expect(renderedText).toContain("Программа из группы");
      expect(facts.issues).toContainEqual(expect.objectContaining({ code: "expulsion_classification_not_confirmed" }));
    }, 15000,
  );

  it.each(types)("integrates facts into retained %s DOCX without changing other package parts", async (docType) => {
    const template = GROUP_DOCUMENT_TEMPLATE_BUNDLE[docType];
    const manifest = JSON.parse(template.manifestJson) as GroupDocumentManifest;
    const bytes = Buffer.from(template.templateBase64, "base64");
    expect(createHash("sha256").update(bytes).digest("hex").toUpperCase()).toBe(manifest.template_sha256);
    expect(bytes).toEqual(readFileSync(resolve(
      "supabase/functions/_shared/group-doc-templates/goreltech/group-package/v1/templates",
      `${docType}.docx`,
    )));
    const source = await JSZip.loadAsync(bytes);
    const output = await JSZip.loadAsync(bytes);
    const originalXml = await source.file("word/document.xml")!.async("string");
    const database = fixture();
    database.group.program_title = "Серверная программа <А> & Б";
    database.studentFrdoData = [
      { ...database.studentFrdoData[0], organization_id: "foreign-org", passport_number: "FOREIGN_FRDO" },
      database.studentFrdoData[0],
    ];
    const facts = build({
      ...database,
      // Extra browser data is deliberately outside the typed source contract.
      ...{ html: "<tr>BROWSER_INJECTED</tr>", variables: { student_list_detail_rows: "BROWSER_INJECTED" } },
    }, docType);
    // Other scalars belong to the existing compiler's separate org/signatory/metadata path.
    // They are blank unless explicitly supplied below; no invented final numbers or dates.
    const remainingScalars = Object.fromEntries(findUnresolvedTokens(originalXml)
      .map((token) => [token.slice(2, -2), ""]));
    const compiledXml = compileGroupDocumentXml({
      documentXml: originalXml,
      manifest,
      snapshot: {
        rows: facts.rows,
        ...(docType === "expulsion_order" ? { rowsBySource: { expulsion_with_issuance: [], expulsion_without_issuance: [] } } : {}),
        scalars: {
          ...remainingScalars,
          STUDENT_NAME: "BROWSER_INJECTED", PASSPORT_NUMBER: "BROWSER_INJECTED",
          START_DATE_RU: "BROWSER_INJECTED", PROGRAM_TITLE: "BROWSER_INJECTED",
          ORG_SHORT_NAME: "Организация из серверного снимка",
          ...facts.scalars,
        },
      },
    });
    output.file("word/document.xml", compiledXml);
    const reloaded = await JSZip.loadAsync(await output.generateAsync({ type: "nodebuffer" }));
    const writtenXml = await reloaded.file("word/document.xml")!.async("string");
    const xmlDocument = new DOMParser().parseFromString(writtenXml, "application/xml");
    expect(xmlDocument.getElementsByTagName("parsererror")).toHaveLength(0);
    if (docType === "expulsion_order") {
      expect(writtenXml).not.toContain("Иванов Иван Иванович");
      expect(writtenXml).not.toMatch(/user-1|enrollment-1/);
      expect(facts.rows).toEqual([]);
      expect(facts.rowSources).toEqual([]);
      expect(facts.issues.some((issue) => issue.code === "expulsion_classification_not_confirmed")).toBe(true);
    } else {
      expect(writtenXml).toContain("Иванов Иван Иванович");
    }
    expect(writtenXml).toContain("Серверная программа &lt;А&gt; &amp; Б");
    expect(writtenXml).not.toMatch(/BROWSER_INJECTED|FOREIGN_FRDO/);
    expect(findUnresolvedTokens(writtenXml)).toEqual([]);
    if (docType === "student_list") {
      expect(writtenXml).toContain("learner@example.invalid");
      expect(writtenXml).toContain("0001");
      expect(writtenXml).toContain("000234");
      expect(writtenXml).toContain("Высшее образование");
    } else {
      // The original enrollment/expulsion sentences already end in a literal dot.
      // Verify rendered text across Word runs, not just a contiguous XML substring.
      const paragraphTexts = (document: Document) => Array.from(document.getElementsByTagName("w:p"))
        .map((paragraph) => Array.from(paragraph.getElementsByTagName("w:t"))
          .map((node) => node.textContent).join(""));
      const dateToken = docType === "enrollment_order" ? "START_DATE_RU" : "END_DATE_RU";
      const expectedDay = docType === "enrollment_order" ? "01" : "30";
      const originalDocument = new DOMParser().parseFromString(originalXml, "application/xml");
      expect(paragraphTexts(originalDocument).some((paragraph) => paragraph.endsWith(`с [[${dateToken}]].`)))
        .toBe(true);
      const renderedParagraphs = paragraphTexts(xmlDocument);
      expect(renderedParagraphs.some((paragraph) => paragraph.endsWith(`с «${expectedDay}» сентября 2026 г.`)))
        .toBe(true);
      expect(renderedParagraphs.join("\n")).not.toContain("г..");
      const repeater = manifest.repeater || manifest.repeaters![0];
      const table = xmlDocument.getElementsByTagName("w:tbl")[repeater.table_index];
      const firstRow = table.getElementsByTagName("w:tr")[repeater.header_rows];
      const cells = Array.from(firstRow.getElementsByTagName("w:tc"));
      const basisText = Array.from(cells.at(-1)!.getElementsByTagName("w:t"))
        .map((node) => node.textContent).join("");
      expect(basisText).toBe("");
    }
    // Page orientation, margins and header/footer relationships are preserved verbatim.
    expect(writtenXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g))
      .toEqual(originalXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g));
    const pageSize = xmlDocument.getElementsByTagName("w:pgSz")[0];
    expect(Number(pageSize.getAttribute("w:w")) > Number(pageSize.getAttribute("w:h")))
      .toBe(manifest.orientation === "landscape");
    expect(Object.keys(reloaded.files).sort()).toEqual(Object.keys(source.files).sort());
    for (const [path, entry] of Object.entries(source.files)) {
      if (entry.dir || path === "word/document.xml") continue;
      // Covers header/footer XML, media/logos, relationships, styles and every other ZIP part.
      expect(await reloaded.file(path)!.async("nodebuffer"), path).toEqual(await entry.async("nodebuffer"));
    }
  }, 15000);
});
