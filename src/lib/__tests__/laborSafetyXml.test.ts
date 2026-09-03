import { describe, expect, it } from "vitest";
import {
  buildLaborSafetyXmlFilename,
  buildStudentLaborSafetyRecords,
  getLaborSafetyInvalidFields,
  getLaborSafetyMissingFields,
  isValidInnChecksum,
  isValidIsoDate,
  serializeLaborSafetyRecordsXml,
  type LaborSafetyXmlRecord,
} from "@/lib/laborSafetyXml";
import type { LaborSafetyEnrollmentProtocol } from "@/types/laborSafetyProtocol";

const savedProtocol = (overrides: Partial<LaborSafetyEnrollmentProtocol> = {}): LaborSafetyEnrollmentProtocol => ({
  id: "protocol-1", organization_id: "org-1", enrollment_id: "enr-1",
  source_enrollment_id: "enr-1", source_user_id: "student-1", source_course_id: "course-1",
  learner_name_snapshot: "Тестовый ученик", course_title_snapshot: "Программа А",
  protocol_number: "ОТ-1", knowledge_check_date: "2026-08-30", is_passed: true,
  version: 1, created_by: "operator-1", updated_by: "operator-1",
  created_at: "2026-09-04T00:00:00Z", updated_at: "2026-09-04T00:00:00Z",
  ...overrides,
});

const completeRecord: LaborSafetyXmlRecord = {
  full_name: "Попова Елизавета Олеговна",
  snils: "112-233-445 95",
  position: "Инженер",
  inn: "7707083893",
  organization_name: "ООО «Современные горные технологии»",
  protocol_number: "ОТ-15",
  program_name: "Общие вопросы охраны труда",
  exam_date: "2026-09-01",
  is_passed: true,
};

describe("laborSafetyXml", () => {
  it("escapes XML text and attributes", () => {
    const xml = serializeLaborSafetyRecordsXml({
      groupName: `Группа & <1> "А" 'Б'`,
      exportDate: "2026-09-01",
      records: [{
        ...completeRecord,
        full_name: `Попова & <Елизавета> "О" 'Т'`,
      }],
    });

    expect(xml).toContain('group="Группа &amp; &lt;1&gt; &quot;А&quot; &apos;Б&apos;"');
    expect(xml).toContain("<FullName>Попова &amp; &lt;Елизавета&gt; &quot;О&quot; &apos;Т&apos;</FullName>");
    expect(xml).not.toContain("<Елизавета>");
  });

  it("creates one record per completed course in the stored occupational-safety category only", () => {
    const results = buildStudentLaborSafetyRecords({
      fullName: completeRecord.full_name,
      snils: completeRecord.snils,
      position: completeRecord.position,
      companyInn: completeRecord.inn,
      companyName: completeRecord.organization_name,
      courses: [
        {
          enrollmentId: "enr-1",
          educationDocumentRecordId: "record-1",
          courseId: "course-1",
          courseTitle: "Общие вопросы охраны труда",
          categoryName: "Охрана труда",
          status: "completed",
          completedAt: "2026-08-30T12:00:00Z",
          protocolNumber: "ОТ-1",
          protocolRecord: savedProtocol(),
        },
        {
          enrollmentId: "enr-2",
          educationDocumentRecordId: "record-2",
          courseId: "course-2",
          courseTitle: "Первая помощь",
          categoryName: "Дополнительная охрана труда",
          status: "completed",
          completedAt: "2026-08-31T12:00:00Z",
          protocolNumber: "ОТ-2",
          protocolRecord: savedProtocol({ enrollment_id: "enr-2", protocol_number: "ОТ-2", knowledge_check_date: "2026-08-31" }),
        },
        {
          enrollmentId: "enr-3",
          educationDocumentRecordId: "record-3",
          courseId: "course-3",
          courseTitle: "Охрана труда в названии не является категорией",
          categoryName: "Пожарная безопасность",
          status: "completed",
          completedAt: "2026-08-31T12:00:00Z",
          protocolNumber: "ОТ-3",
        },
        {
          enrollmentId: "enr-4",
          educationDocumentRecordId: null,
          courseId: "course-4",
          courseTitle: "Незавершённый курс",
          categoryName: "Охрана труда",
          status: "active",
          completedAt: null,
          protocolNumber: null,
        },
      ],
    });

    expect(results.map(result => result.enrollmentId)).toEqual(["enr-1", "enr-2"]);
    expect(results.map(result => result.record.program_name)).toEqual([
      "Общие вопросы охраны труда",
      "Первая помощь",
    ]);
    expect(results.map(result => result.record.exam_date)).toEqual(["2026-08-30", "2026-08-31"]);
  });

  it("reports every required missing field and keeps a deterministic filename", () => {
    expect(getLaborSafetyMissingFields({
      ...completeRecord,
      snils: " ",
      protocol_number: null,
    })).toEqual(["СНИЛС", "Номер протокола"]);

    expect(buildLaborSafetyXmlFilename({
      exportDate: "2026-09-01",
      subject: "Попова Елизавета Олеговна",
    })).toBe("labor_safety_попова_елизавета_олеговна_2026-09-01.xml");
  });

  it("rejects invalid INN and SNILS checksums and impossible ISO dates", () => {
    expect(isValidInnChecksum("7707083893")).toBe(true);
    expect(isValidInnChecksum("500100732259")).toBe(true);
    expect(isValidInnChecksum("1234567890")).toBe(false);
    expect(isValidInnChecksum("123")).toBe(false);
    expect(isValidIsoDate("2026-02-28")).toBe(true);
    expect(isValidIsoDate("2026-02-31")).toBe(false);

    expect(getLaborSafetyInvalidFields({
      ...completeRecord,
      snils: "123-456-789 00",
      inn: "1234567890",
      exam_date: "2026-02-31",
    })).toEqual(["СНИЛС", "ИНН организации", "Дата проверки знаний"]);
  });

  it("keeps invalid required values separate from missing values", () => {
    const [result] = buildStudentLaborSafetyRecords({
      fullName: completeRecord.full_name,
      snils: "123-456-789 00",
      position: completeRecord.position,
      companyInn: "1234567890",
      companyName: completeRecord.organization_name,
      courses: [{
        enrollmentId: "enr-1",
        educationDocumentRecordId: "record-1",
        courseId: "course-1",
        courseTitle: completeRecord.program_name!,
        categoryName: "Охрана труда",
        status: "completed",
        completedAt: "2026-09-01T00:00:00Z",
        protocolNumber: completeRecord.protocol_number,
        protocolRecord: savedProtocol(),
      }],
    });

    expect(result.missingFields).toEqual([]);
    expect(result.invalidFields).toEqual(["СНИЛС", "ИНН организации"]);
  });

  it("never uses course completion as the knowledge-check date or a passed result", () => {
    const [result] = buildStudentLaborSafetyRecords({
      fullName: completeRecord.full_name, snils: completeRecord.snils,
      position: completeRecord.position, companyInn: completeRecord.inn,
      companyName: completeRecord.organization_name,
      courses: [{
        enrollmentId: "enr-1", educationDocumentRecordId: "legacy-1", courseId: "course-1",
        courseTitle: "Программа А", categoryName: "Охрана труда", status: "completed",
        completedAt: "2026-09-01T12:00:00Z", protocolNumber: "Старый-7",
      }],
    });
    expect(result.record).toMatchObject({
      protocol_number: "Старый-7", exam_date: null, is_passed: null, protocol_source: "legacy_unconfirmed",
    });
    expect(result.missingFields).toEqual(["Дата проверки знаний", "Результат проверки знаний"]);
    const xml = serializeLaborSafetyRecordsXml({ groupName: "Тест", exportDate: "2026-09-04", records: [result.record] });
    expect(xml).toContain("<IsPassed></IsPassed>");
    expect(xml).toContain("<ExamDate></ExamDate>");
    expect(xml).toContain("<ProtocolSource>legacy_unconfirmed</ProtocolSource>");
  });

  it("uses the explicitly saved failed result and protocol date over legacy data", () => {
    const [result] = buildStudentLaborSafetyRecords({
      fullName: completeRecord.full_name, snils: completeRecord.snils,
      position: completeRecord.position, companyInn: completeRecord.inn,
      companyName: completeRecord.organization_name,
      courses: [{
        enrollmentId: "enr-1", educationDocumentRecordId: "legacy-1", courseId: "course-1",
        courseTitle: "Программа А", categoryName: "Охрана труда", status: "completed",
        completedAt: "2026-09-01T12:00:00Z", protocolNumber: "Старый-7",
        protocolRecord: savedProtocol({ protocol_number: "Новый-8", knowledge_check_date: "2026-08-29", is_passed: false }),
      }],
    });
    expect(result.record).toMatchObject({ protocol_number: "Новый-8", exam_date: "2026-08-29", is_passed: false, protocol_source: "operator_saved" });
    expect(result.missingFields).toEqual([]);
    expect(serializeLaborSafetyRecordsXml({ groupName: "Тест", exportDate: "2026-09-04", records: [result.record] })).toContain("<IsPassed>Нет</IsPassed>");
  });
});
