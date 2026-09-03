import { getOksmName } from "../oksm.ts";

/** Pure registration-book snapshot. No browser rows, writes, issuance or finalisation. */
export interface GroupRegistrationFactsRecord {
  id: string;
  organization_id: string;
  enrollment_id: string | null;
  user_id: string | null;
  course_id: string | null;
  group_id: string | null;
  document_status: string;
  deleted_at: string | null;
  full_name: string;
  birth_date: string | null;
  document_type: string;
  document_series: string | null;
  document_number: string;
  reg_number: string;
  issue_date: string;
  order_number: string | null;
  order_date: string | null;
  specialty_name: string;
}

export interface GroupRegistrationFactsFrdo {
  id: string;
  user_id: string;
  organization_id: string;
  last_name?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  citizenship_code?: string | null;
  passport_series?: string | null;
  passport_number?: string | null;
}

export interface GroupRegistrationFactsSnapshot {
  organization: { id: string; name: string };
  group: {
    id: string; organization_id: string; course_id: string | null;
    group_number: string | null; program_title: string | null;
    start_date: string | null; end_date: string | null;
  };
  course: { id: string; organization_id: string } | null;
  profiles: readonly {
    user_id: string; organization_id: string | null; student_group_id: string | null;
    archived_at: string | null; full_name: string | null;
  }[];
  enrollments: readonly { id: string; user_id: string; course_id: string }[];
  educationDocumentRecords: readonly GroupRegistrationFactsRecord[];
  /** Caller-JWT/RLS reads only, with organization_id AND roster user_id filters. */
  studentFrdoData: readonly GroupRegistrationFactsFrdo[];
}

export interface GroupRegistrationIssue {
  docType: "registration_book";
  code: string;
  field: string;
  message: string;
  severity: "warning" | "error";
  userId?: string;
  enrollmentId?: string;
  recordId?: string;
}

export interface GroupRegistrationFactsResult {
  docType: "registration_book";
  rows: Array<Record<string, string>>;
  rowSources: Array<{ userId: string; enrollmentId: string | null; recordId: string | null }>;
  issues: GroupRegistrationIssue[];
}

// This is document kind, NOT an issued/draft/delivered lifecycle in the current DB.
export const REGISTRATION_RECORD_STATUSES = ["original", "duplicate"] as const;
export const REGISTRATION_RECORD_SELECT = "id, organization_id, enrollment_id, user_id, course_id, group_id, document_status, deleted_at, full_name, birth_date, document_type, document_series, document_number, reg_number, issue_date, order_number, order_date, specialty_name";
export const REGISTRATION_FRDO_SELECT = "id, user_id, organization_id, last_name, first_name, middle_name, birth_date, gender, citizenship_code, passport_series, passport_number";

const text = (value: string | null | undefined) => typeof value === "string" ? value.trim() : "";
const DOCUMENT_LABELS: Record<string, string> = {
  certificate: "Удостоверение о повышении квалификации",
  diploma: "Диплом о профессиональной переподготовке",
  qualification: "Свидетельство о квалификации",
};

function date(value: string | null | undefined): string {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw
    ? `${raw.slice(8)}.${raw.slice(5, 7)}.${raw.slice(0, 4)}` : "";
}

function gender(value: string | null): string {
  const raw = text(value).toLowerCase();
  if (["м", "мужской", "male"].includes(raw)) return "М";
  if (["ж", "женский", "female"].includes(raw)) return "Ж";
  return "";
}

function emptyRow(n: number): Record<string, string> {
  return {
    N: String(n), DOCUMENT_ISSUER: "", PROGRAM_GROUP: "", REGISTRATION_NUMBER_ISSUE_DATE: "",
    SERIES_NUMBER: "", STUDENT_NAME: "", BIRTH_DATE: "", GENDER: "", IDENTITY_DOCUMENT: "",
    CITIZENSHIP: "", COMPLETION_ORDER: "", DIRECTOR_SIGN: "", RECIPIENT_SIGN: "",
    TRUSTEE_SIGN: "", LOSS_NOTE: "", DUPLICATE_SIGN: "",
  };
}

function grouped<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    map.set(id, [...(map.get(id) || []), row]);
  }
  return map;
}

/**
 * Exact enrollment -> validated course + active roster, never a name join.
 * Nullable legacy provenance is resolved only via the enrollment FK; conflicting
 * non-null provenance is rejected. Missing documents never create roster rows in
 * data mode. Explicit blank mode intentionally retains the old manual roster.
 */
export function buildGroupRegistrationFactRows(input: {
  fillMode: "data" | "blank";
  snapshot: GroupRegistrationFactsSnapshot;
  /** Optional trusted override; otherwise use the same retained catalogue as the browser. */
  citizenshipNamesByCode?: Readonly<Record<string, string>>;
}): GroupRegistrationFactsResult {
  const { snapshot, fillMode } = input;
  const { organization, group } = snapshot;
  const result: GroupRegistrationFactsResult = { docType: "registration_book", rows: [], rowSources: [], issues: [] };
  const issue = (code: string, field: string, message: string,
    source: Pick<GroupRegistrationIssue, "userId" | "enrollmentId" | "recordId"> = {},
    severity: "warning" | "error" = "warning") => {
    result.issues.push({ docType: "registration_book", code, field, message, severity, ...source });
  };
  if (!text(organization.id) || !text(group.id) || group.organization_id !== organization.id) {
    issue("group_scope_mismatch", "group", "Группа не подтверждена в организации; книга не заполнена.", {}, "error");
    return result;
  }
  const profiles = grouped(snapshot.profiles.filter((profile) => {
    if (profile.organization_id !== organization.id || profile.student_group_id !== group.id) {
      issue("profile_scope_mismatch", "profiles", "Профиль вне выбранной группы или организации исключён.", {}, "error");
      return false;
    }
    return profile.archived_at === null && Boolean(text(profile.user_id));
  }), (profile) => profile.user_id);
  for (const [userId, rows] of profiles) {
    if (rows.length !== 1) {
      issue("ambiguous_profile", "profiles", "Несколько активных профилей одного ученика; его строки не подтверждены.", { userId }, "error");
      profiles.delete(userId);
    }
  }
  if (!profiles.size) issue("empty_group", "profiles", "Нет подтверждённых активных участников группы.");

  const start = date(group.start_date), end = date(group.end_date);
  if ((text(group.start_date) && !start) || (text(group.end_date) && !end)
    || (start && end && group.end_date! < group.start_date!)) {
    issue("invalid_group_dates", "group", "Период обучения некорректен; срок в книге оставлен пустым.");
  }
  const period = start && end && group.end_date! >= group.start_date! ? `${start}–${end}` : "";
  const programGroup = (program: string) => [
    program ? `Программа дополнительного профессионального образования «${program}»` : "",
    text(group.group_number) ? `группа № ${text(group.group_number)}` : "",
    period ? `срок обучения ${period}` : "",
  ].filter(Boolean).join("; ");

  if (fillMode === "blank") {
    for (const [userId, [profile]] of [...profiles].sort(([a, [pa]], [b, [pb]]) =>
      text(pa.full_name).localeCompare(text(pb.full_name), "ru") || a.localeCompare(b))) {
      result.rows.push({ ...emptyRow(result.rows.length + 1), STUDENT_NAME: text(profile.full_name), PROGRAM_GROUP: programGroup(text(group.program_title)) });
      result.rowSources.push({ userId, enrollmentId: null, recordId: null });
    }
    return result;
  }
  const course = snapshot.course;
  if (!course || !text(course.id) || course.organization_id !== organization.id || course.id !== group.course_id) {
    issue("course_scope_mismatch", "course", "Курс группы не подтверждён; записи документов не выбраны.", {}, "error");
    return result;
  }
  if (!start) issue("group_period_not_confirmed", "group.start_date", "Дата начала группы не подтверждена; принадлежность исторических документов периоду этой группы требует проверки.");

  const enrollments = grouped(snapshot.enrollments, (row) => row.id);
  for (const [id, rows] of enrollments) {
    if (!text(id) || rows.length !== 1 || rows[0].course_id !== course.id || !profiles.has(rows[0].user_id)) {
      issue("enrollment_not_confirmed", "enrollments", "Зачисление неоднозначно или вне курса и активного состава группы.", {}, "error");
      enrollments.delete(id);
    }
  }
  const frdo = grouped(snapshot.studentFrdoData.filter((row) =>
    row.organization_id === organization.id && profiles.has(row.user_id)), (row) => row.user_id);
  for (const [userId, rows] of frdo) {
    if (rows.length !== 1 || !text(rows[0].id)) {
      issue("ambiguous_student_frdo", "student_frdo_data", "Личные данные неоднозначны; паспорт, пол и гражданство не подставлены.", { userId }, "error");
      frdo.delete(userId);
    }
  }
  const records = grouped(snapshot.educationDocumentRecords, (row) => row.id);
  const accepted: Array<{ record: GroupRegistrationFactsRecord; userId: string; enrollmentId: string }> = [];
  for (const [recordId, rows] of records) {
    if (!text(recordId) || rows.length !== 1) {
      issue("duplicate_record_id", "education_document_records.id", "Повторный или отсутствующий ID документа; неоднозначные строки исключены.", { recordId }, "error");
      continue;
    }
    const record = rows[0];
    if (record.deleted_at !== null || !REGISTRATION_RECORD_STATUSES.some((status) => status === record.document_status)) {
      issue("record_not_eligible", "education_document_records.document_status", "Удалённая запись или неподдерживаемый статус документа исключены.", { recordId });
      continue;
    }
    const enrollment = record.enrollment_id ? enrollments.get(record.enrollment_id)?.[0] : null;
    if (record.organization_id !== organization.id || !enrollment
      || (record.user_id !== null && record.user_id !== enrollment.user_id)
      || (record.course_id !== null && record.course_id !== course.id)
      || (record.group_id !== null && record.group_id !== group.id)) {
      issue("record_scope_mismatch", "education_document_records", "Документ не связан однозначно с зачислением, учеником, курсом и организацией этой группы.", { recordId }, "error");
      continue;
    }
    if (start && date(record.issue_date) && record.issue_date < group.start_date!) {
      issue("historical_document_outside_group", "education_document_records.issue_date", "Документ выдан до начала текущей группы; историческая запись исключена из её книги.", { recordId, userId: enrollment.user_id, enrollmentId: enrollment.id });
      continue;
    }
    if (record.user_id === null || record.course_id === null || record.group_id === null) {
      issue("linkage_incomplete", "education_document_records", "В старой записи не сохранена полная связь с учеником, курсом или группой. Строка связана через зачисление и требует проверки исторической принадлежности.", { recordId, userId: enrollment.user_id, enrollmentId: enrollment.id });
    }
    accepted.push({ record, userId: enrollment.user_id, enrollmentId: enrollment.id });
  }
  // Distinct real IDs stay distinct, including an original and its duplicate.
  for (const field of ["document_number", "reg_number"] as const) {
    const numbered = grouped(accepted.filter(({ record }) => text(record[field])), ({ record }) => text(record[field]));
    for (const rows of numbered.values()) if (rows.length > 1) {
      for (const row of rows) issue("conflicting_document_number", `education_document_records.${field}`,
        "У разных записей совпадает номер; записи сохранены отдельно и требуют проверки.",
        { recordId: row.record.id, userId: row.userId, enrollmentId: row.enrollmentId }, "error");
    }
  }
  accepted.sort((a, b) => text(a.record.issue_date).localeCompare(text(b.record.issue_date))
    || text(a.record.reg_number).localeCompare(text(b.record.reg_number), "ru") || a.record.id.localeCompare(b.record.id));
  for (const { record, userId, enrollmentId } of accepted) {
    const source = { userId, enrollmentId, recordId: record.id };
    const personal = frdo.get(userId)?.[0];
    const personalName = personal ? [personal.last_name, personal.first_name, personal.middle_name].map(text).filter(Boolean).join(" ") : "";
    const name = text(record.full_name) || personalName || text(profiles.get(userId)![0].full_name);
    if (text(record.full_name) && personalName && text(record.full_name) !== personalName) {
      issue("record_personal_conflict", "education_document_records.full_name", "ФИО в документе отличается от текущих личных данных; сохранено ФИО записи документа.", source);
    }
    if (text(record.birth_date) && text(personal?.birth_date) && record.birth_date !== personal?.birth_date) {
      issue("record_personal_conflict", "education_document_records.birth_date", "Дата рождения в документе отличается от текущих личных данных; сохранено значение записи документа.", source);
    }
    const birth = date(text(record.birth_date) ? record.birth_date : personal?.birth_date);
    const issueDate = date(record.issue_date), orderDate = date(record.order_date);
    const countryCode = text(personal?.citizenship_code);
    const row = {
      ...emptyRow(result.rows.length + 1),
      DOCUMENT_ISSUER: [DOCUMENT_LABELS[text(record.document_type).toLowerCase()] || text(record.document_type), text(organization.name)].filter(Boolean).join(". "),
      PROGRAM_GROUP: programGroup(text(record.specialty_name) || text(group.program_title)),
      REGISTRATION_NUMBER_ISSUE_DATE: [text(record.reg_number), issueDate].filter(Boolean).join(", "),
      SERIES_NUMBER: [text(record.document_series), text(record.document_number)].filter(Boolean).join(" "),
      STUDENT_NAME: name,
      // Original client template explicitly asks for year, not a full birth date.
      BIRTH_DATE: birth ? birth.slice(-4) : "",
      GENDER: gender(personal?.gender ?? null),
      IDENTITY_DOCUMENT: [text(personal?.passport_series), text(personal?.passport_number)].filter(Boolean).join(" "),
      CITIZENSHIP: countryCode
        ? input.citizenshipNamesByCode === undefined ? getOksmName(countryCode)
          : text(input.citizenshipNamesByCode[countryCode.padStart(3, "0")]) || countryCode
        : "",
      COMPLETION_ORDER: [text(record.order_number), orderDate].filter(Boolean).join(" от "),
    };
    for (const [field, value, label] of [
      ["full_name", name, "ФИО"], ["document_number", text(record.document_number), "Номер документа"],
      ["reg_number", text(record.reg_number), "Регистрационный номер"], ["issue_date", issueDate, "Дата выдачи"],
      ["specialty_name", text(record.specialty_name) || text(group.program_title), "Название программы"],
      ["birth_date", birth, "Год рождения"], ["gender", row.GENDER, "Пол"],
      ["passport_series", text(personal?.passport_series), "Серия паспорта"],
      ["passport_number", text(personal?.passport_number), "Номер паспорта"],
      ["citizenship_code", row.CITIZENSHIP, "Гражданство"],
    ]) if (!value) issue("missing_registration_detail", field, `${label}: данные не сохранены или не подтверждены; поле оставлено пустым.`, source);
    if (!text(record.specialty_name) && text(group.program_title)) issue("program_from_current_group", "specialty_name", "Название программы отсутствует в записи документа; использовано текущее название программы группы. Проверьте соответствие выданному документу.", source);
    if (text(record.order_date) && !orderDate) issue("invalid_order_date", "order_date", "Дата приказа некорректна; дата оставлена пустой.", source);
    result.rows.push(row);
    result.rowSources.push(source);
  }
  if (!result.rows.length) issue("no_registration_records", "education_document_records", "Нет подтверждённых записей документов для этой группы; книга не заполнена. Это не блокирует создание группы или обучение.");
  return result;
}
