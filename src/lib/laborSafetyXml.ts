import { isValidSnilsChecksum } from "@/utils/formatSnils";
import type { LaborSafetyEnrollmentProtocol } from "@/types/laborSafetyProtocol";

export interface LaborSafetyXmlRecord {
  full_name: string;
  snils: string | null;
  position: string | null;
  inn: string | null;
  organization_name: string | null;
  protocol_number: string | null;
  program_name: string | null;
  exam_date: string | null;
  is_passed: boolean | null;
  protocol_source?: "operator_saved" | "legacy_unconfirmed" | "missing";
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
  protocolRecord?: LaborSafetyEnrollmentProtocol | null;
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
  invalidFields: string[];
  protocolRecord: LaborSafetyEnrollmentProtocol | null;
}

const REQUIRED_FIELDS: Array<{
  key: keyof Omit<LaborSafetyXmlRecord, "is_passed" | "protocol_source">;
  label: string;
}> = [
  { key: "full_name", label: "ФИО" },
  { key: "snils", label: "СНИЛС" },
  { key: "position", label: "Должность" },
  { key: "inn", label: "ИНН организации" },
  { key: "organization_name", label: "Наименование организации" },
  { key: "protocol_number", label: "Номер протокола" },
  { key: "program_name", label: "Программа обучения" },
  { key: "exam_date", label: "Дата проверки знаний" },
];

/** XML 1.0 Char production; for...of keeps valid UTF-16 pairs together. */
function findInvalidXmlCharacter(value: string): { codePoint: number; position: number } | null {
  let position = 0;
  for (const character of value) {
    position += 1;
    const codePoint = character.codePointAt(0)!;
    if (!(codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d
      || (codePoint >= 0x20 && codePoint <= 0xd7ff)
      || (codePoint >= 0xe000 && codePoint <= 0xfffd)
      || (codePoint >= 0x10000 && codePoint <= 0x10ffff))) {
      return { codePoint, position };
    }
  }
  return null;
}

export class LaborSafetyXmlValidationError extends Error {
  constructor(field: string, invalid: { codePoint: number; position: number }, recordNumber?: number) {
    const code = invalid.codePoint.toString(16).toUpperCase().padStart(4, "0");
    super(`${recordNumber ? `Запись ${recordNumber}, поле` : "Поле"} «${field}»: недопустимый для XML 1.0 символ U+${code} (позиция ${invalid.position}). Исправьте значение; экспорт отменён.`);
    this.name = "LaborSafetyXmlValidationError";
  }
}

function assertXmlCharacters(value: string, field: string, recordNumber?: number): void {
  const invalid = findInvalidXmlCharacter(value);
  if (invalid) throw new LaborSafetyXmlValidationError(field, invalid, recordNumber);
}

const normalize = (value: string | null | undefined): string | null => {
  // trim() removes e.g. U+000B/U+000C: preserve invalid input so it is reported,
  // not silently repaired into different personal data before export validation.
  if (value && findInvalidXmlCharacter(value)) return value;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const digitsOnly = (value: string | null | undefined): string => value?.replace(/\D/g, "") ?? "";

/** Validates Russian taxpayer identifiers for legal entities (10 digits) and individuals (12 digits). */
export function isValidInnChecksum(value: string | null | undefined): boolean {
  const digits = digitsOnly(value);
  if (!/^\d{10}(?:\d{2})?$/.test(digits)) return false;

  const checksum = (weights: number[]): number => (
    weights.reduce((sum, weight, index) => sum + Number(digits[index]) * weight, 0) % 11
  ) % 10;

  if (digits.length === 10) {
    return checksum([2, 4, 10, 3, 5, 9, 4, 6, 8]) === Number(digits[9]);
  }

  return checksum([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === Number(digits[10])
    && checksum([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === Number(digits[11]);
}

export function isValidIsoDate(value: string | null | undefined): boolean {
  const normalized = normalize(value);
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized;
}

export function escapeXml(value: string): string {
  assertXmlCharacters(value, "Значение XML");
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
  const missing = REQUIRED_FIELDS
    .filter(({ key }) => !normalize(record[key] as string | null))
    .map(({ label }) => label);
  if (typeof record.is_passed !== "boolean") missing.push("Результат проверки знаний");
  return missing;
}

/**
 * Checks syntax and checksums that can be verified without claiming XSD compatibility.
 * An empty required value is reported by getLaborSafetyMissingFields instead.
 */
export function getLaborSafetyInvalidFields(record: LaborSafetyXmlRecord): string[] {
  const invalid: string[] = [];
  const snils = normalize(record.snils);
  if (snils && !isValidSnilsChecksum(snils)) invalid.push("СНИЛС");
  if (normalize(record.inn) && !isValidInnChecksum(record.inn)) invalid.push("ИНН организации");
  if (normalize(record.exam_date) && !isValidIsoDate(record.exam_date)) invalid.push("Дата проверки знаний");
  for (const { key, label } of REQUIRED_FIELDS) {
    if (findInvalidXmlCharacter(record[key] ?? "") && !invalid.includes(label)) invalid.push(label);
  }
  if (record.protocol_source && findInvalidXmlCharacter(record.protocol_source)) invalid.push("Источник протокола");
  return invalid;
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
      const protocol = course.protocolRecord ?? null;
      const record: LaborSafetyXmlRecord = {
        full_name: normalize(input.fullName) ?? "",
        snils: normalize(input.snils),
        position: normalize(input.position),
        inn: normalize(input.companyInn),
        organization_name: normalize(input.companyName),
        protocol_number: protocol?.protocol_number ?? normalize(course.protocolNumber),
        program_name: normalize(course.courseTitle),
        exam_date: protocol?.knowledge_check_date ?? null,
        is_passed: protocol?.is_passed ?? null,
        protocol_source: protocol ? "operator_saved" : normalize(course.protocolNumber) ? "legacy_unconfirmed" : "missing",
      };

      return {
        enrollmentId: course.enrollmentId,
        educationDocumentRecordId: course.educationDocumentRecordId,
        courseId: course.courseId,
        courseTitle: course.courseTitle,
        record,
        missingFields: getLaborSafetyMissingFields(record),
        invalidFields: getLaborSafetyInvalidFields(record),
        protocolRecord: protocol,
      };
    });
}

export function serializeLaborSafetyRecordsXml(input: {
  groupName: string;
  exportDate: string;
  records: LaborSafetyXmlRecord[];
}): string {
  // Validate the whole batch before generating output. This is XML syntax only,
  // not an official XSD/registry contract or a completeness gate for drafts.
  input.records.forEach((record, index) => {
    for (const { key, label } of REQUIRED_FIELDS) assertXmlCharacters(record[key] ?? "", label, index + 1);
    if (record.protocol_source) assertXmlCharacters(record.protocol_source, "Источник протокола", index + 1);
  });
  assertXmlCharacters(input.groupName, "Название группы");
  assertXmlCharacters(input.exportDate, "Дата экспорта");
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
      `    <IsPassed>${typeof record.is_passed !== "boolean" ? "" : record.is_passed ? "Да" : "Нет"}</IsPassed>`,
      ...(record.protocol_source ? [`    <ProtocolSource>${escapeXml(record.protocol_source)}</ProtocolSource>`] : []),
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
