import { describe, expect, it } from "vitest";
import {
  buildLaborSafetyXmlFilename,
  buildStudentLaborSafetyRecords,
  getLaborSafetyMissingFields,
  serializeLaborSafetyRecordsXml,
  type LaborSafetyXmlRecord,
} from "@/lib/laborSafetyXml";

const completeRecord: LaborSafetyXmlRecord = {
  full_name: "Попова Елизавета Олеговна",
  snils: "123-456-789 00",
  position: "Инженер",
  inn: "1234567890",
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
});
