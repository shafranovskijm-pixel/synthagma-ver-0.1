import { describe, expect, it } from "vitest";
import {
  COURSE_LIBRARY_CATEGORIES,
  COURSE_LIBRARY_CSV_HEADERS,
  COURSE_LIBRARY_STATUSES,
  COURSE_LIBRARY_USAGE_BASES,
  CourseLibraryValidationError,
  LIBRARY_CATEGORY_LABELS,
  LIBRARY_CATEGORIES,
  LIBRARY_STATUS_LABELS,
  LIBRARY_STATUSES,
  LIBRARY_USAGE_BASIS_LABELS,
  LIBRARY_USAGE_BASES,
  courseLibraryToCsv,
  exportCourseLibraryResourcesToCsv,
  filterResourcesByModule,
  filterCourseLibraryResourcesByModule,
  isValidHttpsUrl,
  isStrictHttpsUrl,
  normalizeCourseLibraryResource,
  normalizeCourseLibraryResources,
  normalizeStrictHttpsUrl,
  sortLibraryResources,
  type CourseLibraryResourceInput,
} from "@/lib/courseLibrary";

const baseResource: CourseLibraryResourceInput = {
  id: "resource-1",
  courseId: "course-178",
  name: "Приказ МЧС России № 1120",
  category: "legal_acts",
  description: "Официальный текст нормативного правового акта.",
  sourceName: "МЧС России",
  externalUrl: "https://example.org/documents/1120",
  moduleId: "module-1",
  moduleName: "Модуль 1",
  documentDateOrEdition: "редакция от 01.03.2025",
  lastCheckedAt: "2026-09-03",
  usageBasis: "official_open_source",
  status: "active",
  displayOrder: 10,
};

function resource(
  overrides: Partial<CourseLibraryResourceInput> = {},
): CourseLibraryResourceInput {
  return { ...baseResource, ...overrides };
}

describe("courseLibrary", () => {
  it("keeps the four agreed categories, statuses and usage bases fixed", () => {
    expect(COURSE_LIBRARY_CATEGORIES).toEqual([
      "legal_acts",
      "educational_materials",
      "manufacturer_guides",
      "additional_resources",
    ]);
    expect(COURSE_LIBRARY_STATUSES).toEqual([
      "active",
      "needs_review",
      "archive",
    ]);
    expect(COURSE_LIBRARY_USAGE_BASES).toEqual([
      "official_open_source",
      "own_material",
      "rights_holder_permission",
    ]);
    expect(LIBRARY_CATEGORY_LABELS).toEqual({
      legal_acts: "Нормативные правовые акты",
      educational_materials: "Учебно-методические материалы",
      manufacturer_guides: "Инструкции и руководства изготовителей",
      additional_resources: "Дополнительные информационные ресурсы",
    });
    expect(LIBRARY_STATUS_LABELS).toEqual({
      active: "действует",
      needs_review: "требует проверки",
      archive: "архив",
    });
    expect(LIBRARY_USAGE_BASIS_LABELS).toEqual({
      official_open_source: "официальный открытый источник",
      own_material: "собственный материал",
      rights_holder_permission: "разрешение правообладателя",
    });
    expect(LIBRARY_CATEGORIES).toBe(COURSE_LIBRARY_CATEGORIES);
    expect(LIBRARY_STATUSES).toBe(COURSE_LIBRARY_STATUSES);
    expect(LIBRARY_USAGE_BASES).toBe(COURSE_LIBRARY_USAGE_BASES);
    expect(isValidHttpsUrl).toBe(isStrictHttpsUrl);
    expect(filterResourcesByModule).toBeTypeOf("function");
    expect(sortLibraryResources).toBeTypeOf("function");
    expect(courseLibraryToCsv).toBeTypeOf("function");
  });

  it("accepts only absolute HTTPS links without credentials or whitespace", () => {
    expect(isStrictHttpsUrl("https://example.org/path?document=1#section")).toBe(true);
    expect(isStrictHttpsUrl("HTTPS://xn--80acgfbsl1azdqr.xn--p1ai/document")).toBe(true);

    expect(isStrictHttpsUrl("http://example.org/document")).toBe(false);
    expect(isStrictHttpsUrl("ftp://example.org/document")).toBe(false);
    expect(isStrictHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isStrictHttpsUrl("//example.org/document")).toBe(false);
    expect(isStrictHttpsUrl("https:example.org/document")).toBe(false);
    expect(isStrictHttpsUrl("https://user:password@example.org/document")).toBe(false);
    expect(isStrictHttpsUrl("https://example.org/path with space")).toBe(false);
    expect(isStrictHttpsUrl(" https://example.org/document ")).toBe(false);
    expect(isStrictHttpsUrl("not a URL")).toBe(false);

    expect(normalizeStrictHttpsUrl("  https://example.org  ")).toBe("https://example.org/");
    expect(() => normalizeStrictHttpsUrl("http://example.org"))
      .toThrow(CourseLibraryValidationError);
  });

  it("normalizes text, resource location, optional module and display order", () => {
    const normalized = normalizeCourseLibraryResource(resource({
      id: " resource-1 ",
      name: "  Приказ МЧС России № 1120  ",
      sourceName: " МЧС России ",
      externalUrl: "  https://example.org/documents/1120  ",
      moduleId: " ",
      moduleName: "Не должен остаться без модуля",
      displayOrder: null,
    }));

    expect(normalized).toMatchObject({
      id: "resource-1",
      name: "Приказ МЧС России № 1120",
      sourceName: "МЧС России",
      externalUrl: "https://example.org/documents/1120",
      internalFilePath: null,
      moduleId: null,
      moduleName: null,
      displayOrder: 0,
    });
  });

  it("requires exactly one location and rejects invalid fixed values or order", () => {
    expect(() => normalizeCourseLibraryResource(resource({
      externalUrl: null,
      internalFilePath: null,
    }))).toThrowError(expect.objectContaining({ field: "resourceLocation" }));

    expect(() => normalizeCourseLibraryResource(resource({
      internalFilePath: "private/course-178/guide.pdf",
    }))).toThrowError(expect.objectContaining({ field: "resourceLocation" }));

    expect(() => normalizeCourseLibraryResource(resource({
      displayOrder: 1.5,
    }))).toThrowError(expect.objectContaining({ field: "displayOrder" }));

    expect(() => normalizeCourseLibraryResource(resource({
      status: "published" as CourseLibraryResourceInput["status"],
    }))).toThrowError(expect.objectContaining({ field: "status" }));
  });

  it("sorts without mutating by fixed category, display order, Russian name and id", () => {
    const inputs = [
      resource({
        id: "additional",
        category: "additional_resources",
        name: "МЧС России",
        displayOrder: 0,
      }),
      resource({
        id: "method-b",
        category: "educational_materials",
        name: "Схема 10",
        displayOrder: 2,
      }),
      resource({
        id: "regulatory-second",
        name: "Приказ 2",
        displayOrder: 5,
      }),
      resource({
        id: "method-a",
        category: "educational_materials",
        name: "Схема 2",
        displayOrder: 2,
      }),
      resource({
        id: "regulatory-first",
        name: "Постановление",
        displayOrder: 0,
      }),
    ];
    const originalIds = inputs.map(item => item.id);

    expect(normalizeCourseLibraryResources(inputs).map(item => item.id)).toEqual([
      "regulatory-first",
      "regulatory-second",
      "method-a",
      "method-b",
      "additional",
    ]);
    expect(inputs.map(item => item.id)).toEqual(originalIds);
  });

  it("includes course-wide resources in a module filter and excludes other modules", () => {
    const inputs = [
      resource({ id: "module-b", moduleId: "module-b", moduleName: "Модуль Б", displayOrder: 3 }),
      resource({ id: "course-wide", moduleId: null, moduleName: null, displayOrder: 1 }),
      resource({ id: "module-a", moduleId: "module-a", moduleName: "Модуль А", displayOrder: 2 }),
    ];

    expect(filterCourseLibraryResourcesByModule(inputs, " module-a ").map(item => item.id))
      .toEqual(["course-wide", "module-a"]);
    expect(filterCourseLibraryResourcesByModule(inputs, null).map(item => item.id))
      .toEqual(["course-wide", "module-a", "module-b"]);
    expect(filterCourseLibraryResourcesByModule(inputs, " ").map(item => item.id))
      .toEqual(["course-wide", "module-a", "module-b"]);
  });

  it("keeps API view-model fields and treats the reader's all value as no module filter", () => {
    const apiResources = [
      {
        assignmentId: "assignment-2",
        category: "educational_materials" as const,
        moduleId: "module-b",
        title: "Материал 10",
        sortOrder: 2,
      },
      {
        assignmentId: "assignment-1",
        category: "educational_materials" as const,
        moduleId: null,
        title: "Материал 2",
        sortOrder: 1,
      },
    ];

    expect(filterResourcesByModule(apiResources, "all")).toEqual(apiResources);
    expect(filterResourcesByModule(apiResources, "module-b")).toEqual(apiResources);
    expect(filterResourcesByModule(apiResources, "module-a").map(item => item.assignmentId))
      .toEqual(["assignment-1"]);
    expect(sortLibraryResources(apiResources).map(item => item.assignmentId))
      .toEqual(["assignment-1", "assignment-2"]);
  });

  it("exports every specification field and safely escapes CSV and spreadsheet formulas", () => {
    const csv = exportCourseLibraryResourcesToCsv([
      resource({
        id: "external",
        name: "Приказ \"МЧС\"; № 1120",
        description: "Описание; с \"кавычками\"\r\nи строкой",
        sourceName: "=HYPERLINK(\"https://malicious.example\")",
        moduleName: "Модуль \"А\"",
        displayOrder: 1,
      }),
      resource({
        id: "internal",
        name: "Собственная лекция",
        category: "educational_materials",
        sourceName: "ЦСЗ",
        externalUrl: null,
        internalFilePath: "private/course-178/lecture;1.pdf",
        moduleId: null,
        moduleName: null,
        usageBasis: "own_material",
        status: "needs_review",
        displayOrder: 2,
      }),
    ], { includeBom: false, lineEnding: "\n" });

    const expectedHeader = COURSE_LIBRARY_CSV_HEADERS
      .map(header => `"${header}"`)
      .join(";");

    expect(COURSE_LIBRARY_CSV_HEADERS).toHaveLength(11);
    expect(csv.startsWith(`${expectedHeader}\n`)).toBe(true);
    expect(csv).toContain('"Приказ ""МЧС""; № 1120"');
    expect(csv).toContain('"Описание; с ""кавычками""\nи строкой"');
    expect(csv).toContain('"\'=HYPERLINK(""https://malicious.example"")"');
    expect(csv).toContain('"Модуль ""А"""');
    expect(csv).toContain('"private/course-178/lecture;1.pdf"');
    expect(csv).toContain('"собственный материал";"требует проверки";"2"');
  });

  it("uses an Excel-friendly UTF-8 BOM and CRLF by default", () => {
    const csv = exportCourseLibraryResourcesToCsv([baseResource]);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("\r\n");
  });

  it("removes every null byte before checking spreadsheet formulas", () => {
    const csv = exportCourseLibraryResourcesToCsv([
      resource({ sourceName: "\u0000=SUM(1,2)\u0000", description: "a\u0000b\u0000c" }),
    ], { includeBom: false, lineEnding: "\n" });

    expect(csv).not.toContain("\u0000");
    expect(csv).toContain('"\'=SUM(1,2)"');
    expect(csv).toContain('"abc"');
  });

  it("exports the API view-model field names without a second mapper", () => {
    const csv = courseLibraryToCsv([{
      assignmentId: "assignment-1",
      libraryDocumentId: "document-1",
      category: "manufacturer_guides",
      moduleId: "module-2",
      moduleTitle: "Модуль 2",
      title: "Руководство изготовителя",
      description: null,
      sourceName: "Завод-изготовитель",
      externalUrl: null,
      storagePath: "library/org-1/manual.pdf",
      editionLabel: "редакция 2025 года",
      lastCheckedAt: null,
      usageBasis: "rights_holder_permission",
      status: "active",
      sortOrder: 3,
    }], { includeBom: false, lineEnding: "\n" });

    expect(csv).toContain('"Руководство изготовителя";"Инструкции и руководства изготовителей"');
    expect(csv).toContain('"library/org-1/manual.pdf";"Модуль 2";"редакция 2025 года"');
    expect(csv).toContain('"разрешение правообладателя";"действует";"3"');
  });

  it("keeps an unavailable review card in the complete CSV instead of dropping the export", () => {
    const csv = courseLibraryToCsv([{
      assignmentId: "assignment-review",
      category: "additional_resources",
      moduleId: null,
      title: "Источник ожидает замены",
      sourceName: "ЦСЗ",
      externalUrl: null,
      storagePath: null,
      usageBasis: "own_material",
      status: "needs_review",
      sortOrder: 4,
    }], { includeBom: false });

    expect(csv).toContain('"Источник ожидает замены"');
    expect(csv).toContain('"Недоступно"');
    expect(csv).toContain('"требует проверки"');
  });
});
