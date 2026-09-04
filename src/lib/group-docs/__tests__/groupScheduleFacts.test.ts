import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildGroupScheduleFacts, type GroupScheduleFactsSnapshot } from "../../../../supabase/functions/_shared/docx-ooxml/groupScheduleFacts";
import { compileGroupDocumentXml, type GroupDocumentManifest } from "../../../../supabase/functions/_shared/docx-ooxml/groupDocument";
import { findUnresolvedTokens } from "../../../../supabase/functions/_shared/docx-ooxml/xml";
import { GROUP_DOCUMENT_TEMPLATE_BUNDLE } from "../../../../supabase/functions/_shared/group-doc-templates/goreltech/group-package/v1/embedded";

const slot = (index = 1) => ({ slot: index, date: `2026-09-0${index}`, time_from: "09:00", time_to: "18:00", topic: `Тема ${index}` });
const fixture = (): GroupScheduleFactsSnapshot => ({
  organization: { id: "org" },
  group: { id: "group", organization_id: "org", course_id: "course", start_date: "2026-09-01", end_date: "2026-09-30" },
  schedule: {
    group_id: "group", organization_id: "org", course_id: "course", slots: [slot()],
    revision: 3, updated_by: "editor", updated_at: "2026-08-31T10:15:00.123456+00:00",
  },
});
const build = (snapshot = fixture(), fillMode: "data" | "blank" = "data") => buildGroupScheduleFacts({ snapshot, fillMode });
const blank = (result: ReturnType<typeof build>) => {
  expect(Object.keys(result.scalars)).toHaveLength(12);
  expect(Object.values(result.scalars)).toEqual(Array(12).fill(""));
  expect(result.rows).toEqual([]);
  expect(result.rowSources).toEqual([]);
};

describe("canonical group schedule facts", () => {
  it("fills only the twelve supported fields and records exact source identity/revision", () => {
    const result = build();
    expect(result.docType).toBe("schedule");
    expect(result.rows).toEqual([]);
    expect(result.rowSources).toEqual([]);
    expect(Object.keys(result.scalars)).toHaveLength(12);
    expect(result.scalars).toMatchObject({ SCHEDULE_DATE_1: "01.09.2026", SCHEDULE_TIME_1: "09:00–18:00", SCHEDULE_TOPIC_1: "Тема 1", SCHEDULE_DATE_2: "" });
    expect(result.scheduleSource).toEqual({ groupId: "group", organizationId: "org", courseId: "course", revision: 3, updatedBy: "editor", updatedAt: "2026-08-31T10:15:00.123456+00:00" });
    expect(result.issues).toEqual([]);
    expect(result).not.toHaveProperty("docStatus");
    expect(result.scalars).not.toHaveProperty("SCHEDULE_HOURS_1");
    expect(result.scalars).not.toHaveProperty("SCHEDULE_TEACHER_1");
  });

  it("preserves explicit slot holes and repeated dates without sorting or merging blocks", () => {
    const snapshot = fixture();
    snapshot.schedule!.slots = [slot(4), { ...slot(2), date: "2026-09-04", topic: "Другое занятие той же даты" }];
    const result = build(snapshot);
    expect(result.scalars).toMatchObject({
      SCHEDULE_DATE_1: "", SCHEDULE_TOPIC_1: "", SCHEDULE_DATE_2: "04.09.2026", SCHEDULE_TOPIC_2: "Другое занятие той же даты",
      SCHEDULE_DATE_3: "", SCHEDULE_TOPIC_3: "", SCHEDULE_DATE_4: "04.09.2026", SCHEDULE_TOPIC_4: "Тема 4",
    });
    expect(result.issues).toEqual([]);
  });

  it.each([
    null, {}, "[]", [null], [[slot()]], [slot(), slot()], [slot(0)], [slot(5)], [{ ...slot(), slot: 1.5 }],
    [{ ...slot(), slot: "1" }], [slot(1), slot(2), slot(3), slot(4), slot(5)],
    [{ ...slot(), date: null }], [{ ...slot(), topic: 123 }], [{ ...slot(), time_from: ["09:00"] }],
    [{ ...slot(), hours: "8" }], [{ ...slot(), teacher: "Нельзя молча потерять" }],
  ].map(slots => ({ slots })))("discards the entire malformed structure $slots, never partly fills or truncates", ({ slots }) => {
    const snapshot = fixture();
    snapshot.schedule!.slots = slots;
    const result = build(snapshot);
    blank(result);
    expect(result.scheduleSource).toBeNull();
    expect(result.issues).toEqual([expect.objectContaining({ code: "schedule_slots_invalid", severity: "warning" })]);
  });

  it.each(["organization", "group", "course", "null-course"])("discards a schedule with mismatching %s provenance", (kind) => {
    const snapshot = fixture();
    if (kind === "organization") snapshot.schedule!.organization_id = "foreign";
    if (kind === "group") snapshot.schedule!.group_id = "foreign";
    if (kind === "course") snapshot.schedule!.course_id = "previous-course";
    if (kind === "null-course") snapshot.schedule!.course_id = null;
    const result = build(snapshot);
    blank(result);
    expect(result.scheduleSource).toBeNull();
    expect(result.issues[0].code).toBe("schedule_scope_mismatch");
    expect(JSON.stringify(result)).not.toContain("Тема 1");
  });

  it("allows an explicitly unlinked schedule only for an explicitly unlinked group", () => {
    const snapshot = fixture();
    snapshot.group.course_id = null;
    snapshot.schedule!.course_id = null;
    expect(build(snapshot).scalars.SCHEDULE_TOPIC_1).toBe("Тема 1");
    expect(build(snapshot).issues).toEqual([]);
  });

  it.each(["foreign", "missing-org", "missing-group"])("fails closed on %s group scope even in blank mode", (kind) => {
    const snapshot = fixture();
    if (kind === "foreign") snapshot.group.organization_id = "foreign";
    if (kind === "missing-org") snapshot.organization.id = "";
    if (kind === "missing-group") snapshot.group.id = "";
    for (const mode of ["data", "blank"] as const) {
      const result = build(snapshot, mode);
      blank(result);
      expect(result.issues[0].code).toBe("group_scope_mismatch");
    }
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("does not claim provenance for invalid revision %s", (revision) => {
    const snapshot = fixture(); snapshot.schedule!.revision = revision;
    const result = build(snapshot); blank(result);
    expect(result.issues[0].code).toBe("schedule_metadata_invalid");
    expect(result.scheduleSource).toBeNull();
  });

  it("preserves legacy/manual blank output without querying or depending on missing schedule fields", () => {
    const snapshot = fixture();
    snapshot.group.start_date = null;
    snapshot.group.end_date = "INVALID";
    snapshot.schedule!.slots = { invalid: true };
    const result = build(snapshot, "blank");
    blank(result);
    expect(result.issues).toEqual([]);
    expect(result.scheduleSource).toBeNull();
    snapshot.schedule = null;
    expect(build(snapshot, "blank").issues).toEqual([]);
  });

  it("distinguishes unavailable and stored-empty schedules without inventing dates from the group", () => {
    const snapshot = fixture();
    snapshot.schedule!.slots = [];
    const empty = build(snapshot); blank(empty);
    expect(empty.issues[0].code).toBe("schedule_empty");
    expect(empty.scheduleSource?.revision).toBe(3);
    snapshot.schedule = null;
    const absent = build(snapshot); blank(absent);
    expect(absent.issues[0].code).toBe("schedule_not_available");
    expect(absent.scheduleSource).toBeNull();
  });

  it("retains independently valid fields of incomplete blocks without filling unnamed slots", () => {
    const snapshot = fixture();
    snapshot.schedule!.slots = [{ slot: 1 }, { slot: 3, date: "2026-09-03", topic: "Подтверждённая тема", time_from: "10:00" }];
    const result = build(snapshot);
    expect(result.scalars).toMatchObject({ SCHEDULE_DATE_1: "", SCHEDULE_TIME_1: "", SCHEDULE_TOPIC_1: "", SCHEDULE_DATE_3: "03.09.2026", SCHEDULE_TIME_3: "", SCHEDULE_TOPIC_3: "Подтверждённая тема" });
    expect(result.issues).toHaveLength(4);
    expect(result.issues.every(issue => issue.severity === "warning")).toBe(true);
    expect(result.issues.every(issue => !issue.field.includes("[2]") && !issue.field.includes("[4]"))).toBe(true);
  });

  it.each(["2026-02-30", "2025-02-29", "2026-09-31", "01.09.2026", "2026-9-01", "2026-09-01T00:00:00Z"])("leaves invalid date %s blank without losing a confirmed time/topic", (date) => {
    const snapshot = fixture(); snapshot.schedule!.slots = [{ ...slot(), date }];
    const result = build(snapshot);
    expect(result.scalars).toMatchObject({ SCHEDULE_DATE_1: "", SCHEDULE_TIME_1: "09:00–18:00", SCHEDULE_TOPIC_1: "Тема 1" });
    expect(result.issues[0].code).toBe("schedule_date_missing_or_invalid");
  });

  it.each(["2026-08-31", "2026-10-01"])("does not move an out-of-period date %s into the period", (date) => {
    const snapshot = fixture(); snapshot.schedule!.slots = [{ ...slot(), date }];
    const result = build(snapshot);
    expect(result.scalars.SCHEDULE_DATE_1).toBe("");
    expect(result.issues[0].code).toBe("schedule_date_outside_period");
  });

  it.each([
    { start_date: "2026-09-30", end_date: "2026-09-01" },
    { start_date: "2026-02-30", end_date: "2026-09-30" },
  ])("does not confirm any dates for invalid group period %j", (period) => {
    const snapshot = fixture(); Object.assign(snapshot.group, period);
    const result = build(snapshot);
    expect(result.scalars.SCHEDULE_DATE_1).toBe("");
    expect(result.scalars.SCHEDULE_TOPIC_1).toBe("Тема 1");
    expect(result.issues[0].code).toBe("invalid_group_period");
  });

  it("warns when group bounds are missing but preserves explicit dates and enforces any known bound", () => {
    const snapshot = fixture(); snapshot.group.start_date = null;
    expect(build(snapshot).scalars.SCHEDULE_DATE_1).toBe("01.09.2026");
    expect(build(snapshot).issues[0].code).toBe("group_period_incomplete");
    snapshot.schedule!.slots = [{ ...slot(), date: "2026-10-01" }];
    expect(build(snapshot).scalars.SCHEDULE_DATE_1).toBe("");
    snapshot.group.end_date = null;
    expect(build(snapshot).scalars.SCHEDULE_DATE_1).toBe("01.10.2026");
  });

  it("accepts a leap day and inclusive group boundaries without timezone shifting", () => {
    const snapshot = fixture(); snapshot.group.start_date = "2024-02-29"; snapshot.group.end_date = "2024-03-01";
    snapshot.schedule!.slots = [{ ...slot(), date: "2024-02-29" }, { ...slot(2), date: "2024-03-01" }];
    const result = build(snapshot);
    expect(result.scalars.SCHEDULE_DATE_1).toBe("29.02.2024");
    expect(result.scalars.SCHEDULE_DATE_2).toBe("01.03.2024");
    expect(result.issues).toEqual([]);
  });

  it.each([
    ["", "18:00", "schedule_time_incomplete"], ["09:00", "", "schedule_time_incomplete"],
    ["9:00", "18:00", "schedule_time_invalid"], ["09:60", "18:00", "schedule_time_invalid"],
    ["09:00", "24:00", "schedule_time_invalid"], ["18:00", "09:00", "schedule_time_invalid"],
    ["09:00", "09:00", "schedule_time_invalid"], ["23:00", "01:00", "schedule_time_invalid"],
  ])("does not fabricate a range from %s/%s", (time_from, time_to, code) => {
    const snapshot = fixture(); snapshot.schedule!.slots = [{ ...slot(), time_from, time_to }];
    const result = build(snapshot);
    expect(result.scalars.SCHEDULE_TIME_1).toBe("");
    expect(result.scalars.SCHEDULE_TOPIC_1).toBe("Тема 1");
    expect(result.issues[0].code).toBe(code);
  });

  it("preserves the authored topic exactly, rejects overlong text and never derives academic hours", () => {
    const snapshot = fixture(); snapshot.schedule!.slots = [{ ...slot(), topic: "  Тема <А> & Б\nВторая часть  " }];
    expect(build(snapshot).scalars.SCHEDULE_TOPIC_1).toBe("  Тема <А> & Б\nВторая часть  ");
    snapshot.schedule!.slots = [{ ...slot(), topic: "а".repeat(2000) }];
    expect(build(snapshot).scalars.SCHEDULE_TOPIC_1).toHaveLength(2000);
    snapshot.schedule!.slots = [{ ...slot(), topic: "а".repeat(2001) }];
    expect(build(snapshot).scalars.SCHEDULE_TOPIC_1).toBe("");
    expect(build(snapshot).issues[0].code).toBe("schedule_topic_missing_or_invalid");
  });

  it.each(["\u0000", "\u0001", "\u000b", "\u001f", "\ud800", "\udfff", "\ufffe", "\uffff"])("rejects forbidden XML text %j without silent cleanup or partial schedule facts", (character) => {
    const snapshot = fixture();
    snapshot.schedule!.slots = [slot(1), { ...slot(2), topic: `Тема ${character} проверки` }];
    const before = structuredClone(snapshot);
    const result = build(snapshot);
    blank(result);
    expect(result.scheduleSource).toBeNull();
    expect(result.issues).toEqual([expect.objectContaining({ code: "schedule_topic_invalid_xml", severity: "warning" })]);
    expect(snapshot).toEqual(before);
  });

  it("preserves valid XML whitespace and paired supplementary Unicode in the topic", () => {
    const topic = "Тема\t\n\r🧑\u{10ffff}\u0085\ue000\ufffd";
    const snapshot = fixture(); snapshot.schedule!.slots = [{ ...slot(), topic }];
    expect(build(snapshot).scalars.SCHEDULE_TOPIC_1).toBe(topic);
    expect(build(snapshot).issues).toEqual([]);
  });

  it("counts Unicode characters like PostgreSQL instead of rejecting valid supplementary text at half the limit", () => {
    const snapshot = fixture(); snapshot.schedule!.slots = [{ ...slot(), topic: "🧑".repeat(2000) }];
    expect(build(snapshot).scalars.SCHEDULE_TOPIC_1).toBe("🧑".repeat(2000));
    expect(build(snapshot).issues).toEqual([]);
    snapshot.schedule!.slots = [{ ...slot(), topic: "🧑".repeat(2001) }];
    expect(build(snapshot).scalars.SCHEDULE_TOPIC_1).toBe("");
    expect(build(snapshot).issues[0].code).toBe("schedule_topic_missing_or_invalid");
  });

  it("does not mutate the snapshot or accept browser scalar/HTML substitutes", () => {
    const snapshot = { ...fixture(), variables: { SCHEDULE_TOPIC_1: "INJECTED" }, schedule_rows: "INJECTED" };
    const before = structuredClone(snapshot);
    expect(JSON.stringify(build(snapshot))).not.toContain("INJECTED");
    expect(snapshot).toEqual(before);
  });

  it.each(["complete", "holes", "manual-blank", "missing"])("compiles actual retained DOCX for %s with preserved header/layout/other ZIP parts", async (mode) => {
    const template = GROUP_DOCUMENT_TEMPLATE_BUNDLE.schedule;
    const manifest = JSON.parse(template.manifestJson) as GroupDocumentManifest;
    const bytes = Buffer.from(template.templateBase64, "base64");
    expect(bytes).toEqual(readFileSync(resolve("supabase/functions/_shared/group-doc-templates/goreltech/group-package/v1/templates/schedule.docx")));
    expect(createHash("sha256").update(bytes).digest("hex").toUpperCase()).toBe(manifest.template_sha256);
    expect(manifest.repeater).toBeNull();
    const source = await JSZip.loadAsync(bytes), output = await JSZip.loadAsync(bytes);
    const originalXml = await source.file("word/document.xml")!.async("string");
    const snapshot = fixture();
    snapshot.schedule!.slots = (mode === "holes" ? [4, 2] : [1, 2, 3, 4]).map(index => ({
      ...slot(index), topic: `Тема <${index}> & проверка${index === 1 ? " [[PROGRAM_TITLE]] [[UNKNOWN]]" : ""}`,
    }));
    if (mode === "missing") snapshot.schedule = null;
    const facts = build(snapshot, mode === "manual-blank" ? "blank" : "data");
    const defaults = Object.fromEntries(findUnresolvedTokens(originalXml).map(token => [token.slice(2, -2), ""]));
    const xml = compileGroupDocumentXml({ documentXml: originalXml, manifest, snapshot: { rows: facts.rows, scalars: {
      ...defaults, PROGRAM_TITLE: "Подтверждённая программа", PROGRAM_HOURS: "40", INSTRUCTOR_1_SHORT: "И.И. Иванов",
      SCHEDULE_TOPIC_1: "BROWSER_INJECTION", ...facts.scalars,
    } } });
    output.file("word/document.xml", xml);
    const reread = await JSZip.loadAsync(await output.generateAsync({ type: "nodebuffer" }));
    expect(await reread.file("word/document.xml")!.async("string")).toBe(xml);
    const parsed = new DOMParser().parseFromString(xml, "application/xml");
    expect(parsed.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(findUnresolvedTokens(xml)).toEqual([]);
    expect(xml).not.toContain("BROWSER_INJECTION");
    const rows = parsed.getElementsByTagName("w:tbl")[0].getElementsByTagName("w:tr");
    expect(rows).toHaveLength(3);
    const dateCells = rows[1].getElementsByTagName("w:tc"), topicCells = rows[2].getElementsByTagName("w:tc");
    expect(dateCells).toHaveLength(4); expect(topicCells).toHaveLength(4);
    for (let index = 1; index <= 4; index++) {
      expect(dateCells[index - 1].textContent).toBe(`Дата ${facts.scalars[`SCHEDULE_DATE_${index}`]} ${facts.scalars[`SCHEDULE_TIME_${index}`]}`);
      expect(topicCells[index - 1].textContent).toBe(`Темы обучения ${facts.scalars[`SCHEDULE_TOPIC_${index}`]}`);
    }
    if (mode === "complete" || mode === "holes") expect(xml).toContain("Тема &lt;4&gt; &amp; проверка");
    else { expect(xml).not.toContain("09:00"); expect(xml).not.toContain("2026"); }
    if (mode === "complete") {
      expect(topicCells[0].textContent).toBe("Темы обучения Тема <1> & проверка [[PROGRAM_TITLE]] [[UNKNOWN]]");
      expect(topicCells[0].textContent).not.toContain("Подтверждённая программа");
    }
    expect(xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)).toEqual(originalXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g));
    const page = parsed.getElementsByTagName("w:pgSz")[0];
    expect(Number(page.getAttribute("w:w"))).toBeLessThan(Number(page.getAttribute("w:h")));
    expect(Object.keys(reread.files).sort()).toEqual(Object.keys(source.files).sort());
    expect(source.file("word/header1.xml")).not.toBeNull();
    for (const [path, part] of Object.entries(source.files)) {
      if (part.dir || path === "word/document.xml") continue;
      expect(await reread.file(path)!.async("nodebuffer"), path).toEqual(await part.async("nodebuffer"));
    }
  }, 15000);
});
