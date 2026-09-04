import { describe, expect, it } from "vitest";
import { fetchStudentLaborSafetyXmlContext } from "@/api/studentLaborSafetyXml";
import type { StudentEnrollment } from "@/types/student";

interface QueryLog {
  table: string;
  eq: Array<[string, unknown]>;
  in: Array<[string, unknown[]]>;
  is: Array<[string, unknown]>;
}

function createClient(responses: Record<string, { data: any; error: any }>) {
  const logs: QueryLog[] = [];
  return {
    logs,
    from(table: string) {
      const log: QueryLog = { table, eq: [], in: [], is: [] };
      logs.push(log);
      const response = responses[table] ?? { data: [], error: null };
      const query: any = {
        select: () => query,
        eq: (column: string, value: unknown) => { log.eq.push([column, value]); return query; },
        in: (column: string, value: unknown[]) => { log.in.push([column, value]); return query; },
        is: (column: string, value: unknown) => { log.is.push([column, value]); return query; },
        order: () => Promise.resolve(response),
        maybeSingle: () => Promise.resolve(response),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => (
          Promise.resolve(response).then(resolve, reject)
        ),
      };
      return query;
    },
  };
}

const enrollment = (overrides: Partial<StudentEnrollment> = {}): StudentEnrollment => ({
  id: "enr-1",
  course_id: "course-1",
  course_title: "Untrusted display title",
  progress: 100,
  status: "completed",
  started_at: "2026-08-01T00:00:00Z",
  completed_at: "2026-08-30T00:00:00Z",
  time_spent: 120,
  ...overrides,
});

describe("fetchStudentLaborSafetyXmlContext", () => {
  it.each(["courses", "course_categories"])("rejects a substituted %s ID even when the row count matches", async (table) => {
    const client = createClient({
      courses: { data: [{ id: table === "courses" ? "course-other" : "course-1", title: "Курс ОТ", category_id: "cat-1" }], error: null },
      course_categories: { data: [{ id: table === "course_categories" ? "cat-other" : "cat-1", name: "Охрана труда" }], error: null },
    });
    await expect(fetchStudentLaborSafetyXmlContext({
      organizationId: "org-1", userId: "student-1", enrollments: [enrollment()],
    }, client as never)).rejects.toThrow("Не удалось подтвердить");
    expect(client.logs.some(log => log.table === "labor_safety_enrollment_protocols")).toBe(false);
  });

  it("scopes company, courses, categories and protocols to the active organization", async () => {
    const client = createClient({
      companies: { data: { id: "company-1", name: "Компания", inn: "123" }, error: null },
      courses: { data: [{ id: "course-1", title: "Курс ОТ", category_id: "cat-1" }], error: null },
      course_categories: { data: [{ id: "cat-1", name: "Охрана труда" }], error: null },
      education_document_records: {
        data: [{ id: "record-1", enrollment_id: "enr-1", protocol_number: "П-7", created_at: "2026-08-31" }],
        error: null,
      },
    });

    const result = await fetchStudentLaborSafetyXmlContext({
      organizationId: "org-1",
      userId: "student-1",
      companyId: "company-1",
      enrollments: [enrollment()],
    }, client as never);

    for (const table of ["companies", "courses", "course_categories", "labor_safety_enrollment_protocols", "education_document_records"]) {
      expect(client.logs.find(log => log.table === table)?.eq).toContainEqual(["organization_id", "org-1"]);
    }
    expect(client.logs.find(log => log.table === "companies")?.eq).toContainEqual(["id", "company-1"]);
    expect(client.logs.find(log => log.table === "education_document_records")?.in).toContainEqual([
      "enrollment_id",
      ["enr-1"],
    ]);
    expect(result.courses).toEqual([expect.objectContaining({
      enrollmentId: "enr-1",
      educationDocumentRecordId: "record-1",
      courseTitle: "Курс ОТ",
      categoryName: "Охрана труда",
      protocolNumber: "П-7",
    })]);
  });

  it("does not query protocols for incomplete or non-occupational-safety courses", async () => {
    const client = createClient({
      courses: { data: [{ id: "course-1", title: "Охрана труда", category_id: "cat-1" }], error: null },
      course_categories: { data: [{ id: "cat-1", name: "Пожарная безопасность" }], error: null },
    });

    const result = await fetchStudentLaborSafetyXmlContext({
      organizationId: "org-1",
      userId: "student-1",
      enrollments: [enrollment()],
    }, client as never);

    expect(result.courses).toEqual([]);
    expect(client.logs.some(log => log.table === "education_document_records")).toBe(false);
    expect(client.logs.some(log => log.table === "labor_safety_enrollment_protocols")).toBe(false);
  });

  it("returns the newest education-document record even before its protocol number is filled", async () => {
    const client = createClient({
      courses: { data: [{ id: "course-1", title: "Курс ОТ", category_id: "cat-1" }], error: null },
      course_categories: { data: [{ id: "cat-1", name: "Охрана труда" }], error: null },
      education_document_records: {
        data: [
          { id: "record-new", enrollment_id: "enr-1", protocol_number: null, created_at: "2026-09-01" },
          { id: "record-old", enrollment_id: "enr-1", protocol_number: "П-1", created_at: "2026-08-31" },
        ],
        error: null,
      },
    });

    const result = await fetchStudentLaborSafetyXmlContext({
      organizationId: "org-1",
      userId: "student-1",
      enrollments: [enrollment()],
    }, client as never);

    expect(result.courses[0]).toEqual(expect.objectContaining({
      educationDocumentRecordId: "record-new",
      protocolNumber: null,
    }));
  });

  it("prefers the separately saved protocol and does not require the certificate journal", async () => {
    const protocol = {
      id: "protocol-1", organization_id: "org-1", enrollment_id: "enr-1",
      source_enrollment_id: "enr-1", source_user_id: "student-1", source_course_id: "course-1",
      learner_name_snapshot: "Тестовый ученик", course_title_snapshot: "Программа А",
      protocol_number: "ОТ-7", knowledge_check_date: "2026-09-01", is_passed: false, version: 1,
      created_by: "operator-1", updated_by: "operator-1",
      created_at: "2026-09-04T00:00:00Z", updated_at: "2026-09-04T00:00:00Z",
    };
    const client = createClient({
      courses: { data: [{ id: "course-1", title: "Курс ОТ", category_id: "cat-1" }], error: null },
      course_categories: { data: [{ id: "cat-1", name: "Охрана труда" }], error: null },
      labor_safety_enrollment_protocols: { data: [protocol], error: null },
      education_document_records: { data: null, error: { message: "No journal permission" } },
    });
    const result = await fetchStudentLaborSafetyXmlContext({
      organizationId: "org-1", userId: "student-1", enrollments: [enrollment()],
    }, client as never);
    expect(result.protocolStorageAvailable).toBe(true);
    expect(result.courses[0].protocolRecord).toEqual(protocol);
    expect(result.courses[0].educationDocumentRecordId).toBeNull();
    expect(client.logs.some(log => log.table === "education_document_records")).toBe(false);
  });

  it("keeps a clearly unavailable storage state when the additive migration is absent", async () => {
    const client = createClient({
      courses: { data: [{ id: "course-1", title: "Курс ОТ", category_id: "cat-1" }], error: null },
      course_categories: { data: [{ id: "cat-1", name: "Охрана труда" }], error: null },
      labor_safety_enrollment_protocols: { data: null, error: { code: "PGRST205" } },
      education_document_records: { data: [{ id: "old", enrollment_id: "enr-1", protocol_number: "П-1" }], error: null },
    });
    const result = await fetchStudentLaborSafetyXmlContext({
      organizationId: "org-1", userId: "student-1", enrollments: [enrollment()],
    }, client as never);
    expect(result.protocolStorageAvailable).toBe(false);
    expect(result.courses[0].protocolRecord).toBeNull();
    expect(result.courses[0].protocolNumber).toBe("П-1");
  });

  it("does not pretend a transient protocol read failure is an empty record", async () => {
    const client = createClient({
      courses: { data: [{ id: "course-1", title: "Курс ОТ", category_id: "cat-1" }], error: null },
      course_categories: { data: [{ id: "cat-1", name: "Охрана труда" }], error: null },
      labor_safety_enrollment_protocols: { data: null, error: { message: "Network unavailable" } },
    });
    await expect(fetchStudentLaborSafetyXmlContext({
      organizationId: "org-1", userId: "student-1", enrollments: [enrollment()],
    }, client as never)).rejects.toThrow("Network unavailable");
    expect(client.logs.some(log => log.table === "education_document_records")).toBe(false);
  });

  it("marks optional legacy-journal failure explicitly without blocking the new form", async () => {
    const client = createClient({
      courses: { data: [{ id: "course-1", title: "Курс ОТ", category_id: "cat-1" }], error: null },
      course_categories: { data: [{ id: "cat-1", name: "Охрана труда" }], error: null },
      education_document_records: { data: null, error: { message: "No journal permission" } },
    });
    const result = await fetchStudentLaborSafetyXmlContext({
      organizationId: "org-1", userId: "student-1", enrollments: [enrollment()],
    }, client as never);
    expect(result.protocolStorageAvailable).toBe(true);
    expect(result.legacyProtocolLookupFailed).toBe(true);
    expect(result.courses[0].protocolRecord).toBeNull();
    expect(result.courses[0].protocolNumber).toBeNull();
  });
});
