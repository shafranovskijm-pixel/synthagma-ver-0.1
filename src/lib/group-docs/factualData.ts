/**
 * Фактические данные Синтагмы для документов группы.
 *
 * ЖЁСТКОЕ ПРАВИЛО: этот модуль НИКОГДА не придумывает отметки посещения,
 * баллы, оценки, темы занятий, время и номера документов. Любое значение
 * приходит из snapshot, собранного из Supabase (lesson_progress,
 * test_attempts, education_document_records, lessons/student_frdo_data).
 * Нет источника → ячейка остаётся пустой, документ остаётся черновиком.
 */

export type DocumentFillMode = "blank" | "data";

/** Формат макета: HTML-приближение, не оригинальный DOCX клиента. */
export const LEGACY_LAYOUT_FORMAT = "legacy_html";
export const LEGACY_LAYOUT_NOTICE =
  "Формат legacy_html: макет не совпадает с оригиналом клиента. Итоговое оформление будет заменено DOCX-first шаблоном.";

/** Факт прохождения онлайн-урока (НЕ физическая посещаемость). */
export interface LessonCompletionFact {
  user_id: string;
  /** ISO дата завершения урока */
  date: string;
  lesson_title?: string;
}

/** Факт итоговой аттестации (лучшая попытка финального теста). */
export interface AttestationFact {
  user_id: string;
  score: number;
  max_score: number;
  date: string | null;
}

/** Запись книги регистрации из education_document_records. */
export interface RegistrationFact {
  user_id?: string | null;
  full_name: string;
  document_type: string;
  document_series: string;
  document_number: string;
  issue_date: string;
  order_number: string;
  birth_date?: string;
  gender?: string;
  passport?: string;
  citizenship?: string;
  program?: string;
}

/** Структурированное занятие (дата/время/тема) — только если оно реально задано. */
export interface ScheduleFact {
  date: string;
  time: string;
  topic: string;
  hours: string;
  teacher: string;
}

export interface GroupFactualData {
  /** Завершения уроков онлайн-курса учениками этой группы. */
  lessonCompletions: LessonCompletionFact[];
  attestation: AttestationFact[];
  registration: RegistrationFact[];
  schedule: ScheduleFact[];
  /** Курс привязан к группе — без него snapshot всегда пустой. */
  courseLinked: boolean;
  /** Честные предупреждения об источниках (курс не привязан, нет финального теста и т.д.). */
  warnings: string[];
}

export const NO_COURSE_WARNING =
  "Курс не привязан к группе: данные прохождения, тестов и документов не собираются. Привяжите курс в настройках группы.";

export function emptyFactualData(warnings: string[] = []): GroupFactualData {
  return {
    lessonCompletions: [],
    attestation: [],
    registration: [],
    schedule: [],
    courseLinked: false,
    warnings,
  };
}

export const JOURNAL_SOURCE_LABEL =
  "Прохождение онлайн-курса (lesson_progress). Это не отметки физической посещаемости.";
export const ATTESTATION_SOURCE_LABEL =
  "Лучшая попытка ФИНАЛЬНОГО теста курса (последний урок type='test' по order_index, test_attempts). Порог 70%.";
export const REGISTRATION_SOURCE_LABEL =
  "Выданные документы об образовании (education_document_records по зачислениям этого курса) + структурированные персональные данные ФИС ФРДО.";
export const SCHEDULE_SOURCE_LABEL =
  "Структурированные занятия группы. Без них выдаётся пустой рабочий бланк.";

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU");
}

interface StudentLike {
  user_id: string;
  full_name: string;
  birth_date?: string;
  gender?: string;
  passport?: string;
  citizenship?: string;
  email?: string;
  phone?: string;
}

/** Все фактические дни завершения уроков — без молчаливой потери данных. */
export function journalAllDates(facts: LessonCompletionFact[]): string[] {
  const set = new Set<string>();
  for (const f of facts) {
    const d = (f.date || "").slice(0, 10);
    if (d) set.add(d);
  }
  return [...set].sort();
}

/**
 * Даты-колонки журнала. Возвращает ВСЕ фактические даты: журнал не должен
 * молча выбрасывать дни. Если дат больше пороговых, документ разбивается
 * на страницы (см. journalDatePages) — данные не теряются.
 */
export function journalDateColumns(facts: LessonCompletionFact[]): string[] {
  return journalAllDates(facts);
}

/** Разбивка дат на страницы журнала по perPage колонок — все даты остаются. */
export function journalDatePages(dates: string[], perPage = 8): string[][] {
  if (dates.length === 0) return [];
  const pages: string[][] = [];
  for (let i = 0; i < dates.length; i += perPage) pages.push(dates.slice(i, i + perPage));
  return pages;
}

/** Явное предупреждение о разбивке на страницы вместо тихой обрезки. */
export function journalOverflowNotice(dates: string[], perPage = 8): string | null {
  if (dates.length <= perPage) return null;
  const pages = journalDatePages(dates, perPage).length;
  return `Фактических дат занятий: ${dates.length}. Журнал разбит на ${pages} страниц(ы) по ${perPage} колонок — ни одна дата не потеряна.`;
}

export function buildJournalHead(dates: string[]): string {
  if (dates.length === 0) {
    return `<th>Дата занятия</th><th>Отметка</th>`;
  }
  return dates.map((d) => `<th>${esc(shortDate(d))}</th>`).join("");
}

/**
 * Журнал: отметка ставится ТОЛЬКО если в snapshot есть завершение урока
 * этим учеником в этот день. Никаких «V» по умолчанию.
 */
export function buildJournalRowsFromFacts(
  students: StudentLike[],
  facts: LessonCompletionFact[],
  dates: string[],
): string {
  const done = new Set(facts.map((f) => `${f.user_id}|${(f.date || "").slice(0, 10)}`));
  const cols = dates.length > 0 ? dates : ["", ""];
  return students
    .map((s, i) => {
      const cells = cols
        .map((d) => {
          const mark = d && done.has(`${s.user_id}|${d}`) ? "✓" : "";
          return `<td style="text-align:center">${mark}</td>`;
        })
        .join("");
      return (
        `<tr><td style="text-align:center">${i + 1}</td>` +
        `<td>${esc(s.full_name)}</td>${cells}</tr>`
      );
    })
    .join("");
}

/** Рабочий бланк журнала: все ячейки пустые. */
export function buildJournalBlankRows(students: StudentLike[], columns = 4): string {
  const cells = Array.from({ length: columns }, () => `<td></td>`).join("");
  return students
    .map(
      (s, i) =>
        `<tr><td style="text-align:center">${i + 1}</td><td>${esc(s.full_name)}</td>${cells}</tr>`,
    )
    .join("");
}

export function gradeFromPercent(percent: number): string {
  if (percent >= 90) return "5";
  if (percent >= 75) return "4";
  if (percent >= 70) return "3";
  return "2";
}

export const NO_RESULT_TEXT = "нет результата";

/**
 * Итоговая ведомость: процент и оценка считаются исключительно из фактической
 * попытки. Нет попытки → «нет результата», не оценка.
 */
export function buildAttestationRowsFromFacts(
  students: StudentLike[],
  facts: AttestationFact[],
): string {
  const byUser = new Map<string, AttestationFact>();
  for (const f of facts) {
    const prev = byUser.get(f.user_id);
    if (!prev || f.score > prev.score) byUser.set(f.user_id, f);
  }
  return students
    .map((s, i) => {
      const f = byUser.get(s.user_id);
      const percent =
        f && f.max_score > 0 ? Math.round((f.score / f.max_score) * 100) : null;
      const percentCell = percent === null ? NO_RESULT_TEXT : String(percent);
      const gradeCell = percent === null ? "" : gradeFromPercent(percent);
      return (
        `<tr><td style="text-align:center">${i + 1}</td>` +
        `<td>${esc(s.full_name)}</td>` +
        `<td style="text-align:center">${percentCell}</td>` +
        `<td style="text-align:center">${gradeCell}</td></tr>`
      );
    })
    .join("");
}

export function buildAttestationBlankRows(students: StudentLike[]): string {
  return students
    .map(
      (s, i) =>
        `<tr><td style="text-align:center">${i + 1}</td><td>${esc(s.full_name)}</td><td></td><td></td></tr>`,
    )
    .join("");
}

/** Книга регистрации: только фактически выданные документы. */
export function buildRegistrationRowsFromFacts(facts: RegistrationFact[]): string {
  return facts
    .map((f, i) => {
      return (
        `<tr><td style="text-align:center">${i + 1}</td>` +
        `<td>${esc(f.document_type)}</td>` +
        `<td>${esc(f.program || "")}</td>` +
        `<td>${esc(f.document_series)}</td>` +
        `<td>${esc(f.document_number)}</td>` +
        `<td>${esc(f.full_name)}</td>` +
        `<td>${esc(f.birth_date ? shortDate(f.birth_date) : "")}</td>` +
        `<td style="text-align:center">${esc(f.gender || "")}</td>` +
        `<td>${esc(f.passport || "")}</td>` +
        `<td>${esc(f.citizenship || "")}</td>` +
        `<td>${esc(f.order_number || "")}</td>` +
        `<td>${esc(f.issue_date ? shortDate(f.issue_date) : "")}</td>` +
        `<td></td><td></td></tr>`
      );
    })
    .join("");
}

/** Рабочий бланк книги регистрации: ФИО из группы, номера документов пустые. */
export function buildRegistrationBlankRows(students: StudentLike[]): string {
  return students
    .map(
      (s, i) =>
        `<tr><td style="text-align:center">${i + 1}</td>` +
        `<td></td><td></td><td></td><td></td>` +
        `<td>${esc(s.full_name)}</td>` +
        `<td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`,
    )
    .join("");
}

/** Расписание: строки только из структурированных занятий. */
export function buildScheduleRowsFromFacts(facts: ScheduleFact[]): string {
  return facts
    .map(
      (f) =>
        `<tr><td class="center">${esc(shortDate(f.date))}</td>` +
        `<td class="center">${esc(f.time)}</td>` +
        `<td>${esc(f.topic)}</td>` +
        `<td class="center">${esc(f.hours)}</td>` +
        `<td>${esc(f.teacher)}</td></tr>`,
    )
    .join("");
}

export const SCHEDULE_EMPTY_NOTICE = "Расписание не заполнено: занятия не заданы в Синтагме.";

/** Пустой рабочий бланк расписания (4 пустые строки для ручного заполнения). */
export function buildScheduleBlankRows(rows = 4): string {
  return Array.from(
    { length: rows },
    () => `<tr><td></td><td></td><td></td><td></td><td></td></tr>`,
  ).join("");
}

/* ─────────────── Готовность документа к финальному статусу ─────────────── */

export interface DocDataReadiness {
  docType: string;
  /** Человеческое описание источника данных. */
  source: string;
  /** Число фактических записей в источнике. */
  recordCount: number;
  /** Финальный статус недоступен (данных нет/неполные). Черновик разрешён. */
  finalBlocked: boolean;
  warning?: string;
  /** Охват: сколько учеников/записей покрыто источником, строкой для UI. */
  coverage: string;
  /** Сколько учеников покрыто источником (для покрытия по людям). */
  coveredStudents: number;
  studentCount: number;
}

export const DATA_DRIVEN_DOC_LIST: readonly string[] = [
  "class_journal",
  "attestation_sheet",
  "registration_book",
  "schedule",
];

function coverageText(covered: number, total: number, unit = "учеников"): string {
  if (total === 0) return "нет учеников в группе";
  return `${covered} из ${total} ${unit}`;
}

const DATA_DRIVEN_DOC_TYPES = [
  "class_journal",
  "attestation_sheet",
  "registration_book",
  "schedule",
] as const;

export function isDataDrivenDoc(docType: string): boolean {
  return (DATA_DRIVEN_DOC_TYPES as readonly string[]).includes(docType);
}

export function documentDataReadiness(
  docType: string,
  factual: GroupFactualData | null,
  studentCount: number,
): DocDataReadiness | null {
  if (!isDataDrivenDoc(docType)) return null;
  const f = factual || emptyFactualData();
  const courseNote = f.courseLinked ? "" : ` ${NO_COURSE_WARNING}`;
  const extra = f.warnings.length ? ` ${f.warnings.join(" ")}` : "";

  if (docType === "class_journal") {
    const count = f.lessonCompletions.length;
    const covered = new Set(f.lessonCompletions.map((l) => l.user_id)).size;
    return {
      docType,
      source: JOURNAL_SOURCE_LABEL,
      recordCount: count,
      coverage: coverageText(covered, studentCount),
      coveredStudents: covered,
      studentCount,
      finalBlocked: count === 0 || covered < studentCount || studentCount === 0,
      warning:
        count === 0
          ? `Нет завершённых уроков — журнал будет пустым бланком.${courseNote}${extra}`.trim()
          : covered < studentCount
            ? `Прохождение есть только у ${covered} из ${studentCount} учеников.${extra}`.trim()
            : extra.trim() || undefined,
    };
  }
  if (docType === "attestation_sheet") {
    const withResult = f.attestation.filter((a) => a.max_score > 0).length;
    return {
      docType,
      source: ATTESTATION_SOURCE_LABEL,
      recordCount: withResult,
      coverage: coverageText(withResult, studentCount),
      coveredStudents: withResult,
      studentCount,
      finalBlocked: withResult < studentCount || studentCount === 0,
      warning:
        withResult === 0
          ? `Нет результатов итогового теста — оценки не подставляются.${courseNote}${extra}`.trim()
          : withResult < studentCount
            ? `Результаты есть только у ${withResult} из ${studentCount} учеников.${extra}`.trim()
            : extra.trim() || undefined,
    };
  }
  if (docType === "registration_book") {
    const count = f.registration.length;
    const covered = new Set(
      f.registration.map((r) => r.user_id).filter(Boolean) as string[],
    ).size;
    return {
      docType,
      source: REGISTRATION_SOURCE_LABEL,
      recordCount: count,
      coverage: coverageText(covered, studentCount),
      coveredStudents: covered,
      studentCount,
      finalBlocked: count === 0 || covered < studentCount || studentCount === 0,
      warning:
        count === 0
          ? `Документы об образовании ещё не выданы.${courseNote}${extra}`.trim()
          : covered < studentCount
            ? `Документы выданы только ${covered} из ${studentCount} учеников.${extra}`.trim()
            : extra.trim() || undefined,
    };
  }
  const count = f.schedule.length;
  return {
    docType,
    source: SCHEDULE_SOURCE_LABEL,
    recordCount: count,
    coverage: count === 0 ? "занятий не задано" : `${count} занятий`,
    coveredStudents: 0,
    studentCount,
    finalBlocked: count === 0,
    warning: count === 0 ? SCHEDULE_EMPTY_NOTICE : undefined,
  };
}

/** Можно ли выпустить пакет со статусом final. */
export function canPublishFinal(
  docTypes: string[],
  factual: GroupFactualData | null,
  studentCount: number,
): boolean {
  return docTypes.every((t) => {
    const r = documentDataReadiness(t, factual, studentCount);
    return !r || !r.finalBlocked;
  });
}
