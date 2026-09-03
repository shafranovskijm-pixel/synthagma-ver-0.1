import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import {
  buildGroupTitleFacts,
  type GroupTitleFactsSnapshot,
} from "../../../../supabase/functions/_shared/docx-ooxml/groupTitleFacts";
import {
  compileGroupDocumentXml,
  type GroupDocumentManifest,
} from "../../../../supabase/functions/_shared/docx-ooxml/groupDocument";
import { findUnresolvedTokens } from "../../../../supabase/functions/_shared/docx-ooxml/xml";
import { GROUP_DOCUMENT_TEMPLATE_BUNDLE } from "../../../../supabase/functions/_shared/group-doc-templates/goreltech/group-package/v1/embedded";

const fixture = (): GroupTitleFactsSnapshot => ({
  organization: { id: "org-1", legal_address: "190000, г. Санкт-Петербург, ул. Садовая, д. 1" },
  group: {
    id: "group-1", organization_id: "org-1",
    start_date: "2026-09-01", end_date: "2026-09-30",
  },
});
const build = (snapshot = fixture(), documentDate: string | null | undefined = "2026-10-02") =>
  buildGroupTitleFacts({ snapshot, documentDate });
const emptyScalars = { START_DATE: "", END_DATE: "", ORG_CITY: "", YEAR: "" };

describe("title-page server facts", () => {
  it("uses stored dates, not browser variables, without inventing student counts or mutating the source", () => {
    const snapshot = {
      ...fixture(),
      variables: { START_DATE: "BROWSER_START", END_DATE: "BROWSER_END", ORG_CITY: "BROWSER_CITY", YEAR: "BROWSER_YEAR", STUDENTS_COUNT: "999" },
      html: "BROWSER_HTML",
    };
    const before = structuredClone(snapshot);
    const result = build(snapshot);
    expect(result).toEqual({
      docType: "title_page", rows: [], rowSources: [],
      scalars: { START_DATE: "01.09.2026", END_DATE: "30.09.2026", ORG_CITY: "Санкт-Петербург", YEAR: "2026" },
      issues: [],
    });
    expect(JSON.stringify(result)).not.toContain("BROWSER_");
    expect(result.scalars).not.toHaveProperty("STUDENTS_COUNT");
    expect(result).not.toHaveProperty("docStatus");
    expect(result).not.toHaveProperty("serverVerifiedCriticalRequisites");
    expect(snapshot).toEqual(before);
  });

  it.each([null, "", "2026-02-30", "2025-02-29", "2026-13-01", "2026-09-00", "2026-9-01", "2026-09-01T00:00:00Z", "01.09.2026"])(
    "leaves an absent/invalid stored start date %j blank, retaining the independently confirmed end",
    (start_date) => {
      const snapshot = fixture();
      snapshot.group.start_date = start_date;
      const result = build(snapshot);
      expect(result.scalars).toMatchObject({ START_DATE: "", END_DATE: "30.09.2026" });
      expect(result.issues).toEqual([expect.objectContaining({
        code: "missing_or_invalid_date", field: "group.start_date", severity: "warning",
      })]);
    },
  );

  it("retains the valid start when the end is invalid and reports both missing dates independently", () => {
    const snapshot = fixture();
    snapshot.group.end_date = "2026-11-31";
    expect(build(snapshot).scalars).toMatchObject({ START_DATE: "01.09.2026", END_DATE: "" });
    expect(build(snapshot).issues).toEqual([expect.objectContaining({ code: "missing_or_invalid_date", field: "group.end_date" })]);
    snapshot.group.start_date = null;
    snapshot.group.end_date = null;
    const result = build(snapshot);
    expect(result.scalars).toMatchObject({ START_DATE: "", END_DATE: "" });
    expect(result.issues.map(issue => issue.field)).toEqual(["group.start_date", "group.end_date"]);
  });

  it("leaves a reversed period entirely blank instead of repairing or swapping it", () => {
    const snapshot = fixture();
    snapshot.group.start_date = "2026-09-30";
    snapshot.group.end_date = "2026-09-01";
    const result = build(snapshot);
    expect(result.scalars).toMatchObject({ START_DATE: "", END_DATE: "", YEAR: "2026" });
    expect(result.issues).toEqual([expect.objectContaining({ code: "invalid_group_period", field: "group.end_date" })]);
  });

  it("accepts a real leap day, equal dates and a cross-year period without shifting calendar dates", () => {
    const snapshot = fixture();
    snapshot.group.start_date = "2024-02-29";
    snapshot.group.end_date = "2024-02-29";
    expect(build(snapshot).scalars).toMatchObject({ START_DATE: "29.02.2024", END_DATE: "29.02.2024" });
    expect(build(snapshot).issues).toEqual([]);
    snapshot.group.start_date = "2025-12-31";
    snapshot.group.end_date = "2026-01-01";
    expect(build(snapshot).scalars).toMatchObject({ START_DATE: "31.12.2025", END_DATE: "01.01.2026" });
  });

  it("derives YEAR only from the selected document date, never the server clock or group period", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2040-01-01T00:00:00Z"));
      expect(build(fixture(), "2023-12-31").scalars.YEAR).toBe("2023");
      expect(build(fixture(), null).scalars.YEAR).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([null, undefined, "", "2025-02-29", "2026-02-30", "2026-10-02T00:00:00Z"])(
    "does not infer YEAR when the explicit document date is %j",
    (documentDate) => {
      const result = buildGroupTitleFacts({ snapshot: fixture(), documentDate });
      expect(result.scalars.YEAR).toBe("");
      expect(result.scalars.START_DATE).toBe("01.09.2026");
      expect(result.issues).toEqual([expect.objectContaining({ code: "document_year_not_confirmed", field: "document_date" })]);
    },
  );

  it.each([
    ["г. Москва, ул. Садовая, д. 1", "Москва"],
    ["190000, город Санкт-Петербург, ул. Садовая, д. 1", "Санкт-Петербург"],
    ["603000, г Нижний Новгород, ул. Садовая, д. 1", "Нижний Новгород"],
    ["344000, г.Ростов-на-Дону, ул. Садовая, д. 1", "Ростов-на-Дону"],
    [" 190000,\n ГОРОД   Санкт-Петербург , ул. Садовая", "Санкт-Петербург"],
  ])("uses the one explicitly designated legal-address city in %s", (legal_address, expected) => {
    const snapshot = fixture();
    snapshot.organization.legal_address = legal_address;
    expect(build(snapshot).scalars.ORG_CITY).toBe(expected);
    expect(build(snapshot).issues).toEqual([]);
  });

  it.each([
    null, "", "Москва, ул. Ленина, д. 1", "городской округ Подольск, ул. Ленина, д. 1",
    "Московская область, городской округ Подольск, ул. Ленина, д. 1",
    "ул. г. Москвы, д. 1", "ул. город Москва, д. 1",
    "г. Москва, город Тверь, ул. Ленина, д. 1", "г. , ул. Ленина",
    "г. Москва ул. Ленина, д. 1",
  ])("leaves an absent or ambiguous city blank for %j", (legal_address) => {
    const snapshot = fixture();
    snapshot.organization.legal_address = legal_address;
    const result = build(snapshot);
    expect(result.scalars.ORG_CITY).toBe("");
    expect(result.issues).toEqual([expect.objectContaining({
      code: "city_not_confirmed", field: "organization.legal_address", severity: "warning",
    })]);
  });

  it.each(["foreign-organization", "missing-organization", "missing-group"])("returns no facts for %s", (kind) => {
    const snapshot = fixture();
    if (kind === "foreign-organization") snapshot.group.organization_id = "foreign";
    if (kind === "missing-organization") snapshot.organization.id = "";
    if (kind === "missing-group") snapshot.group.id = "";
    const result = build(snapshot);
    expect(result.scalars).toEqual(emptyScalars);
    expect(result.rows).toEqual([]);
    expect(result.rowSources).toEqual([]);
    expect(result.issues).toEqual([expect.objectContaining({ code: "group_scope_mismatch", severity: "error" })]);
    expect(JSON.stringify(result)).not.toContain("Санкт-Петербург");
    expect(JSON.stringify(result)).not.toContain("2026");
  });

  it.each(["confirmed", "manual-blanks"])("compiles the actual title DOCX with %s facts and unchanged header, portrait section and other ZIP parts", async (mode) => {
    const template = GROUP_DOCUMENT_TEMPLATE_BUNDLE.title_page;
    const manifest = JSON.parse(template.manifestJson) as GroupDocumentManifest;
    const bytes = Buffer.from(template.templateBase64, "base64");
    const templateRoot = "supabase/functions/_shared/group-doc-templates/goreltech/group-package/v1";
    expect(bytes).toEqual(readFileSync(resolve(templateRoot, "templates/title_page.docx")));
    expect(JSON.parse(readFileSync(resolve(templateRoot, "manifests/title_page.json"), "utf8"))).toEqual(manifest);
    expect(createHash("sha256").update(bytes).digest("hex").toUpperCase()).toBe(manifest.template_sha256);
    expect(manifest.row_tokens).toEqual([]);
    expect(manifest.repeater).toBeNull();
    const source = await JSZip.loadAsync(bytes);
    const output = await JSZip.loadAsync(bytes);
    const originalXml = await source.file("word/document.xml")!.async("string");
    expect(findUnresolvedTokens(originalXml).sort()).toEqual([
      "[[END_DATE]]", "[[GROUP_NUMBER]]", "[[ORG_CITY]]", "[[ORG_HEADER_LINE_1]]",
      "[[ORG_HEADER_LINE_2]]", "[[PROGRAM_TITLE]]", "[[START_DATE]]", "[[YEAR]]",
    ].sort());
    expect(originalXml).not.toMatch(/STUDENT.*COUNT|COUNT.*STUDENT|Обучающихся\s*:/i);
    const snapshot = fixture();
    if (mode === "manual-blanks") {
      snapshot.group.start_date = null;
      snapshot.group.end_date = null;
      snapshot.organization.legal_address = null;
    }
    const facts = build(snapshot, mode === "manual-blanks" ? null : "2023-12-31");
    const browserScalars = {
      START_DATE: "BROWSER_START", END_DATE: "BROWSER_END", ORG_CITY: "BROWSER_CITY", YEAR: "BROWSER_YEAR",
    };
    const compiled = compileGroupDocumentXml({
      documentXml: originalXml, manifest,
      snapshot: {
        rows: facts.rows,
        scalars: {
          ...browserScalars,
          ORG_HEADER_LINE_1: "Учебный центр ООО «ИЦ «ГОРЭЛТЕХ»",
          ORG_HEADER_LINE_2: "(ООО «ИЦ «ГОРЭЛТЕХ»)",
          GROUP_NUMBER: "1-ПК-26", PROGRAM_TITLE: "Программа <А> & Б",
          ...facts.scalars,
        },
      },
    });
    output.file("word/document.xml", compiled);
    const reread = await JSZip.loadAsync(await output.generateAsync({ type: "nodebuffer" }));
    const xml = await reread.file("word/document.xml")!.async("string");
    const parsed = new DOMParser().parseFromString(xml, "application/xml");
    expect(parsed.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(findUnresolvedTokens(xml)).toEqual([]);
    expect(xml).not.toContain("BROWSER_");
    expect(xml).toContain("Программа &lt;А&gt; &amp; Б");
    const text = parsed.documentElement.textContent || "";
    expect(text).toContain("Учебный центр ООО «ИЦ «ГОРЭЛТЕХ»");
    expect(text).toContain("группы слушателей курсов дополнительного профессионального образования");
    expect(text).toContain("№ 1-ПК-26");
    expect(text).not.toMatch(/Обучающихся\s*:/i);
    if (mode === "confirmed") {
      expect(text).toContain("Сроки проведения с 01.09.2026 по 30.09.2026");
      expect(text).toContain("г. Санкт-Петербург 2023 г.");
    } else {
      expect(text).toContain("Сроки проведения с  по ");
      expect(text).toContain("г.   г.");
      expect(text).not.toContain("Санкт-Петербург");
      expect(text).not.toContain("2026");
      expect(facts.issues).toHaveLength(4);
    }
    expect(xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)).toEqual(originalXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g));
    const size = parsed.getElementsByTagName("w:pgSz")[0];
    expect(Number(size.getAttribute("w:w"))).toBeLessThan(Number(size.getAttribute("w:h")));
    expect(xml.replace(/(<w:t\b[^>]*>)[\s\S]*?(<\/w:t>)/g, "$1$2"))
      .toBe(originalXml.replace(/(<w:t\b[^>]*>)[\s\S]*?(<\/w:t>)/g, "$1$2"));
    expect(Object.keys(reread.files).sort()).toEqual(Object.keys(source.files).sort());
    expect(source.file("word/header1.xml")).not.toBeNull();
    expect(source.file("word/media/image1.jpeg")).not.toBeNull();
    for (const [path, part] of Object.entries(source.files)) {
      if (part.dir || path === "word/document.xml") continue;
      expect(await reread.file(path)!.async("nodebuffer"), path).toEqual(await part.async("nodebuffer"));
    }
  }, 15000);
});
