export interface LaborSafetyXmlRecord {
  full_name: string;
  snils: string | null;
  position: string | null;
  inn: string | null;
  organization_name: string | null;
  protocol_number: string | null;
  program_name: string | null;
  exam_date: string | null;
  is_passed: boolean;
}

export interface StudentLaborSafetyCourse {
  enrollmentId: string;
  educationDocumentRecordId: string | null;
  courseId: string;
  courseTitle: string;
  categoryName: string | null;
  status: string;
  completedAt: string | null;
  protocolNumber: string | null;
}

export interface StudentLaborSafetyRecordInput {
  fullName: string;
  snils: string | null;
  position: string | null;
  companyName: string | null;
  companyInn: string | null;
  courses: StudentLaborSafetyCourse[];
}

export interface StudentLaborSafetyRecordResult {
  enrollmentId: string;
  educationDocumentRecordId: string | null;
  courseId: string;
  courseTitle: string;
  record: LaborSafetyXmlRecord;
  missingFields: string[];
}

const REQUIRED_FIELDS: Array<{
  key: keyof Omit<LaborSafetyXmlRecord, "is_passed">;
  label: string;
}> = [
  { key: "full_name", label: "ФИО" },
  { key: "snils", label: "СНИЛС" },
  { key: "position", label: "Должность" },
  { key: "inn", label: "ИНН организации" },
  { key: "organization_name", label: "Наименование организации" },
  { key: "protocol_number", label: "Номер протокола" },
  { key: "program_name", label: "Программа обучения" },
  { key: "exam_date", label: "Дата экзамена" },
];

const normalize = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function isOccupationalSafetyCategory(categoryName: string | null | undefined): boolean {
  return normalize(categoryName)?.toLocaleLowerCase("ru-RU").includes("охрана труда") ?? false;
}

export function getLaborSafetyMissingFields(record: LaborSafetyXmlRecord): string[] {
  return REQUIRED_FIELDS
    .filter(({ key }) => !normalize(record[key] as string | null))
    .map(({ label }) => label);
}

/**
 * Builds exactly one record for every completed enrollment whose stored course
 * category explicitly contains "охрана труда". Course titles are deliberately
 * not used as a fallback classifier.
 */
export function buildStudentLaborSafetyRecords(
  input: StudentLaborSafetyRecordInput,
): StudentLaborSafetyRecordResult[] {
  return input.courses
    .filter(course => (
      course.status === "completed"
      && Boolean(normalize(course.completedAt))
      && isOccupationalSafetyCategory(course.categoryName)
    ))
    .map(course => {
      const record: LaborSafetyXmlRecord = {
        full_name: normalize(input.fullName) ?? "",
        snils: normalize(input.snils),
        position: normalize(input.position),
        inn: normalize(input.companyInn),
        organization_name: normalize(input.companyName),
        protocol_number: normalize(course.protocolNumber),
        program_name: normalize(course.courseTitle),
        exam_date: normalize(course.completedAt)?.slice(0, 10) ?? null,
        is_passed: true,
      };

      return {
        enrollmentId: course.enrollmentId,
        educationDocumentRecordId: course.educationDocumentRecordId,
        courseId: course.courseId,
        courseTitle: course.courseTitle,
        record,
        missingFields: getLaborSafetyMissingFields(record),
      };
    });
}

export function serializeLaborSafetyRecordsXml(input: {
  groupName: string;
  exportDate: string;
  records: LaborSafetyXmlRecord[];
}): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<LaborSafetyRecords group="${escapeXml(input.groupName)}" exportDate="${escapeXml(input.exportDate)}">`,
  ];

  input.records.forEach((record, index) => {
    lines.push(
      `  <Record number="${index + 1}">`,
      `    <FullName>${escapeXml(record.full_name)}</FullName>`,
      `    <SNILS>${escapeXml(record.snils ?? "")}</SNILS>`,
      `    <Position>${escapeXml(record.position ?? "")}</Position>`,
      `    <INN>${escapeXml(record.inn ?? "")}</INN>`,
      `    <OrganizationName>${escapeXml(record.organization_name ?? "")}</OrganizationName>`,
      `    <ProtocolNumber>${escapeXml(record.protocol_number ?? "")}</ProtocolNumber>`,
      `    <ProgramName>${escapeXml(record.program_name ?? "")}</ProgramName>`,
      `    <ExamDate>${escapeXml(record.exam_date ?? "")}</ExamDate>`,
      `    <IsPassed>${record.is_passed ? "Да" : "Нет"}</IsPassed>`,
      "  </Record>",
    );
  });

  lines.push("</LaborSafetyRecords>");
  return lines.join("\n");
}

export function buildLaborSafetyXmlFilename(input: {
  exportDate: string;
  subject?: string | null;
}): string {
  const subject = normalize(input.subject)
    ?.toLocaleLowerCase("ru-RU")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "") || "records";
  const date = input.exportDate.replace(/[^0-9-]/g, "") || "undated";
  return `labor_safety_${subject}_${date}.xml`;
}
