/** Database facts only: no browser variables, HTML, document status or finalisation. */
export type GroupDocumentFactsType = "enrollment_order" | "expulsion_order" | "student_list";

export interface GroupDocumentFactsEnrollment {
  id: string;
  user_id: string;
  course_id: string;
  status: string;
  progress: number;
  completed_at: string | null;
}

export interface GroupDocumentFactsFrdo {
  user_id: string;
  organization_id: string;
  passport_series: string | null;
  passport_number: string | null;
  education_level: string | null;
}

export interface GroupDocumentFactsProfile {
  user_id: string;
  organization_id: string | null;
  student_group_id: string | null;
  archived_at: string | null;
  full_name: string | null;
  email: string | null;
}

export interface GroupDocumentFactsSnapshot {
  organization: { id: string };
  group: {
    id: string;
    organization_id: string;
    course_id: string | null;
    group_number: string | null;
    program_title: string | null;
    program_hours: number | null;
    start_date: string | null;
    end_date: string | null;
  };
  course: {
    id: string;
    organization_id: string;
    title: string;
    duration: string | null;
    frdo_duration_hours: number | null;
  } | null;
  profiles: readonly GroupDocumentFactsProfile[];
  // enrollments has no organization_id: scope is checked through course + roster.
  enrollments: readonly GroupDocumentFactsEnrollment[];
  studentFrdoData: readonly GroupDocumentFactsFrdo[];
}

export interface GroupDocumentFactsIssue {
  docType: GroupDocumentFactsType;
  code: string;
  field: string;
  message: string;
  severity: "error" | "warning";
  userId?: string;
  enrollmentId?: string;
}

export interface GroupDocumentFactsResult {
  docType: GroupDocumentFactsType;
  rows: Array<Record<string, string>>;
  rowSources: Array<{ userId: string; enrollmentId: string | null }>;
  scalars: Record<
    "GROUP_NUMBER" | "PROGRAM_TITLE" | "PROGRAM_HOURS"
    | "START_DATE" | "END_DATE" | "START_DATE_RU" | "END_DATE_RU",
    string
  >;
  issues: GroupDocumentFactsIssue[];
}

const MONTHS_RU = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
] as const;

function text(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveHours(value: number | string | null | undefined): number | null {
  const candidate = typeof value === "number" ? value
    : typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;
  return Number.isFinite(candidate) && candidate > 0 ? candidate : null;
}

function storedDate(value: string | null): { iso: string; short: string; ru: string } | null {
  const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const parsed = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== match[0]) return null;
  return {
    iso: match[0],
    short: `${day}.${month}.${year}`,
    ru: `«${day}» ${MONTHS_RU[Number(month) - 1]} ${year} г.`,
  };
}

/** Builds only the exact row tokens of the three original GORELTECH manifests. */
export function buildGroupDocumentFactRows(input: {
  docType: GroupDocumentFactsType;
  snapshot: GroupDocumentFactsSnapshot;
}): GroupDocumentFactsResult {
  const { docType, snapshot } = input;
  const { group, organization } = snapshot;
  const isOrder = docType !== "student_list";
  const result: GroupDocumentFactsResult = {
    docType,
    rows: [],
    rowSources: [],
    scalars: {
      GROUP_NUMBER: "", PROGRAM_TITLE: "", PROGRAM_HOURS: "",
      START_DATE: "", END_DATE: "", START_DATE_RU: "", END_DATE_RU: "",
    },
    issues: [],
  };
  const issue = (
    code: string, field: string, message: string,
    severity: "error" | "warning" = "warning",
    source: { userId?: string; enrollmentId?: string } = {},
  ) => result.issues.push({ docType, code, field, message, severity, ...source });

  if (!text(organization.id) || !text(group.id) || group.organization_id !== organization.id) {
    issue("group_scope_mismatch", "group.organization_id", "Группа не подтверждена в выбранной организации; данные документа не заполнены.", "error");
    return result;
  }

  const course = snapshot.course
    && snapshot.course.id === group.course_id
    && snapshot.course.organization_id === organization.id
    ? snapshot.course : null;
  if (snapshot.course && !course) {
    issue("course_scope_mismatch", "course", "Курс не соответствует группе или организации; его данные не использованы.", "error");
  } else if (isOrder && !course) {
    issue("missing_course", "group.course_id", "Курс группы не подтверждён; зачисления участников нельзя проверить.");
  }

  result.scalars.GROUP_NUMBER = text(group.group_number);
  result.scalars.PROGRAM_TITLE = text(group.program_title) || text(course?.title);
  const hours = [group.program_hours, course?.frdo_duration_hours, course?.duration]
    .map(positiveHours).find((value) => value !== null);
  result.scalars.PROGRAM_HOURS = hours === undefined ? "" : String(hours);
  if (!result.scalars.GROUP_NUMBER) issue("missing_group_number", "group.group_number", "Не сохранён номер группы.");
  if (!result.scalars.PROGRAM_TITLE) issue("missing_program_title", "group.program_title", "Не сохранено название программы группы или курса.");
  if (isOrder && !result.scalars.PROGRAM_HOURS) issue("missing_program_hours", "group.program_hours", "Не сохранена положительная продолжительность программы в часах.");

  const start = storedDate(group.start_date);
  const end = storedDate(group.end_date);
  for (const [field, raw, date] of [
    ["start_date", group.start_date, start],
    ["end_date", group.end_date, end],
  ] as const) {
    // Student list does not require dates; an invalid saved date is still visible as a warning.
    if (!date && (isOrder || text(raw))) {
      issue(text(raw) ? "invalid_group_date" : "missing_group_date", `group.${field}`,
        `${field === "start_date" ? "Дата начала" : "Дата окончания"} обучения ${text(raw) ? "некорректна" : "не сохранена"}; поле документа оставлено пустым.`);
    }
  }
  result.scalars.START_DATE = start?.short || "";
  result.scalars.START_DATE_RU = start?.ru || "";
  result.scalars.END_DATE = end?.short || "";
  result.scalars.END_DATE_RU = end?.ru || "";
  const reversedPeriod = Boolean(start && end && end.iso < start.iso);
  if (reversedPeriod) {
    issue("invalid_group_period", "group.end_date", "Дата окончания предшествует дате начала; даты и период документа оставлены пустыми.");
    result.scalars.START_DATE = "";
    result.scalars.END_DATE = "";
    result.scalars.START_DATE_RU = "";
    result.scalars.END_DATE_RU = "";
  }
  const period = start && end && !reversedPeriod ? `${start.short}–${end.short}` : "";

  const profiles = new Map<string, GroupDocumentFactsProfile[]>();
  for (const profile of snapshot.profiles) {
    if (profile.organization_id !== organization.id || profile.student_group_id !== group.id) {
      issue("profile_scope_mismatch", "profiles", "Запись ученика вне выбранной группы или организации исключена.", "error");
      continue;
    }
    if (profile.archived_at) continue;
    if (!text(profile.user_id)) {
      issue("missing_user_id", "profiles.user_id", "Запись участника без идентификатора не может быть подтверждена.", "error");
      continue;
    }
    const matches = profiles.get(profile.user_id) || [];
    matches.push(profile);
    profiles.set(profile.user_id, matches);
  }
  if (!profiles.size) issue("empty_group", "profiles", "В группе нет подтверждённых активных участников.");

  const enrollmentsByUser = new Map<string, GroupDocumentFactsEnrollment[]>();
  const frdoByUser = new Map<string, GroupDocumentFactsFrdo[]>();
  if (isOrder && course) {
    for (const row of snapshot.enrollments) {
      if (row.course_id !== course.id || !profiles.has(row.user_id)) continue;
      const matches = enrollmentsByUser.get(row.user_id) || [];
      matches.push(row);
      enrollmentsByUser.set(row.user_id, matches);
    }
  } else if (!isOrder) {
    for (const row of snapshot.studentFrdoData) {
      if (row.organization_id !== organization.id || !profiles.has(row.user_id)) continue;
      const matches = frdoByUser.get(row.user_id) || [];
      matches.push(row);
      frdoByUser.set(row.user_id, matches);
    }
  }

  // Name is only display order, never identity. The UUID tie-break preserves namesakes.
  const confirmedName = (userId: string) => {
    const rows = profiles.get(userId)!;
    return rows.length === 1 ? text(rows[0].full_name) : "";
  };
  const userIds = [...profiles.keys()].sort((a, b) =>
    confirmedName(a).localeCompare(confirmedName(b), "ru") || a.localeCompare(b));
  for (const userId of userIds) {
    const matches = profiles.get(userId)!;
    const profile = matches.length === 1 ? matches[0] : null;
    const source = { userId };
    if (!profile) issue("ambiguous_profile", "profiles", "У участника несколько записей профиля; ФИО и почта не подтверждены.", "error", source);
    const fullName = text(profile?.full_name);
    if (!fullName) issue("missing_student_name", "profiles.full_name", "Не заполнено подтверждённое ФИО участника.", "warning", source);

    let enrollment: GroupDocumentFactsEnrollment | null = null;
    if (isOrder) {
      const enrollments = enrollmentsByUser.get(userId) || [];
      if (enrollments.length === 1 && text(enrollments[0].id)) {
        enrollment = enrollments[0];
        // Same evidence gate as src/lib/groups/releaseReadiness.ts; this is not an attestation result.
        const completed = enrollment.status === "completed"
          && Number(enrollment.progress) >= 100
          && Boolean(enrollment.completed_at);
        if (docType === "expulsion_order" && !completed) {
          issue("completion_not_confirmed", "enrollments.status", "Завершение обучения участника не подтверждено. Строка сохранена в черновике; результат аттестации не присваивается.", "warning", { userId, enrollmentId: enrollment.id });
        }
      } else if (enrollments.length > 1) {
        issue("ambiguous_enrollment", "enrollments", "У участника несколько зачислений на курс группы; конкретное зачисление не выбрано.", "error", source);
      } else {
        issue("missing_enrollment", "enrollments", "Зачисление участника на курс группы не подтверждено; участник сохранён в черновике приказа.", "warning", source);
      }
    }

    result.rowSources.push({ userId, enrollmentId: enrollment?.id || null });
    if (isOrder) {
      result.rows.push({
        N: String(result.rows.length + 1),
        STUDENT_NAME: fullName,
        STUDENT_PROGRAM: result.scalars.PROGRAM_TITLE,
        STUDENT_HOURS: result.scalars.PROGRAM_HOURS,
        STUDENT_PERIOD: period,
        // Per the agreed client correction this is a blank for manual completion.
        STUDENT_BASIS: "",
      });
      continue;
    }

    const frdoMatches = frdoByUser.get(userId) || [];
    const frdo = frdoMatches.length === 1 ? frdoMatches[0] : null;
    if (frdoMatches.length > 1) issue("ambiguous_student_frdo", "student_frdo_data", "Найдено несколько записей личных данных участника; паспорт и образование не выбраны.", "error", source);
    const row = {
      N: String(result.rows.length + 1), STUDENT_NAME: fullName,
      EMAIL: text(profile?.email),
      PASSPORT_SERIES: text(frdo?.passport_series),
      PASSPORT_NUMBER: text(frdo?.passport_number),
      EDUCATION: text(frdo?.education_level),
    };
    for (const [token, field, label] of [
      ["EMAIL", "profiles.email", "Почта"],
      ["PASSPORT_SERIES", "student_frdo_data.passport_series", "Серия паспорта"],
      ["PASSPORT_NUMBER", "student_frdo_data.passport_number", "Номер паспорта"],
      ["EDUCATION", "student_frdo_data.education_level", "Образование"],
    ] as const) {
      if (!row[token]) issue("missing_student_detail", field, `${label}: данные не сохранены или не подтверждены; поле списка оставлено пустым.`, "warning", source);
    }
    result.rows.push(row);
  }
  return result;
}
