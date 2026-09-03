import {
  buildGroupDocumentFactRows,
  type GroupDocumentFactsEnrollment,
  type GroupDocumentFactsIssue,
  type GroupDocumentFactsResult,
  type GroupDocumentFactsSnapshot,
} from "./groupDocumentFacts.ts";

export interface GroupAttestationFactsEnrollment extends GroupDocumentFactsEnrollment {
  started_at: string;
}

export interface GroupAttestationFactsLesson {
  id: string;
  course_id: string;
  type: string;
  order_index: number;
  test_passing_score: number;
  updated_at: string;
}

export interface GroupAttestationFactsAttempt {
  id: string;
  user_id: string;
  lesson_id: string;
  score: number;
  max_score: number;
  completed_at: string;
}

export interface GroupAttestationFactsSnapshot extends Omit<
  GroupDocumentFactsSnapshot, "enrollments" | "studentFrdoData"
> {
  enrollments: readonly GroupAttestationFactsEnrollment[];
  lessons: readonly GroupAttestationFactsLesson[];
  testAttempts: readonly GroupAttestationFactsAttempt[];
}

export interface GroupAttestationFactsIssue extends Omit<GroupDocumentFactsIssue, "docType"> {
  docType: "attestation_sheet";
  lessonId?: string;
  attemptId?: string;
}

export interface GroupAttestationFactsRowSource {
  userId: string;
  enrollmentId: string | null;
  lessonId: string | null;
  attemptId: string | null;
  percent: number | null;
  passingScore: number | null;
  /** Calculated test outcome only, never an awarded grade or a final attestation. */
  passed: boolean | null;
}

export interface GroupAttestationFactsResult {
  docType: "attestation_sheet";
  rows: Array<Record<"N" | "STUDENT_NAME" | "PERCENT" | "GRADE", string>>;
  scalars: GroupDocumentFactsResult["scalars"];
  rowSources: GroupAttestationFactsRowSource[];
  issues: GroupAttestationFactsIssue[];
}

/** The existing course convention is the last type=test by order_index, only when unique. */
export function selectUnambiguousFinalTestLesson(
  lessons: readonly GroupAttestationFactsLesson[],
  courseId: string,
): GroupAttestationFactsLesson | null {
  const tests = lessons.filter((lesson) => lesson.course_id === courseId && lesson.type === "test");
  if (!tests.length || tests.some((lesson) => !lesson.id || !Number.isInteger(lesson.order_index))) return null;
  if (new Set(tests.map((lesson) => lesson.id)).size !== tests.length) return null;
  const maximum = Math.max(...tests.map((lesson) => lesson.order_index));
  const lastTests = tests.filter((lesson) => lesson.order_index === maximum);
  return lastTests.length === 1 ? lastTests[0] : null;
}

function timestamp(value: string): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!match || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) return null;
  const date = new Date(`${match[1]}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== match[1]) return null;
  // PostgreSQL stores microseconds. Do not collapse an update after the attempt
  // or a reenrollment boundary into the same JavaScript millisecond.
  const micros = Date.parse(value) * 1000 + Number((match[5] || "").padEnd(6, "0").slice(3));
  return Number.isSafeInteger(micros) ? micros : null;
}

/**
 * Server evidence for the original attestation DOCX. It deliberately does not
 * reuse the old HTML resolver's fixed 70% / invented 2–5 grading scale.
 * Attempt policy is an explicit server choice; old attempts cannot cross reenrollment.
 */
export function buildGroupAttestationFacts(input: {
  snapshot: GroupAttestationFactsSnapshot;
  fillMode: "blank" | "data";
  attemptPolicy?: "latest" | "best_percent";
}): GroupAttestationFactsResult {
  const { snapshot, fillMode } = input;
  const roster = buildGroupDocumentFactRows({
    docType: "enrollment_order",
    snapshot: {
      organization: snapshot.organization, group: snapshot.group, course: snapshot.course,
      profiles: snapshot.profiles, enrollments: snapshot.enrollments, studentFrdoData: [],
    },
  });
  const result: GroupAttestationFactsResult = {
    docType: "attestation_sheet",
    rows: roster.rows.map(({ N, STUDENT_NAME }) => ({ N, STUDENT_NAME, PERCENT: "", GRADE: "" })),
    scalars: roster.scalars,
    rowSources: roster.rowSources.map((row) => ({
      ...row, lessonId: null, attemptId: null, percent: null, passingScore: null, passed: null,
    })),
    issues: roster.issues.map((issue) => ({
      ...issue,
      docType: "attestation_sheet",
      message: issue.message.replace("в черновике приказа", "в черновике ведомости"),
    })),
  };
  // A blank form does not inspect or derive any lesson/test outcomes.
  if (fillMode === "blank" || !result.rows.length) return result;
  const issue = (
    code: string, field: string, message: string,
    source: Partial<Pick<GroupAttestationFactsIssue, "userId" | "enrollmentId" | "lessonId" | "attemptId">> = {},
  ) => result.issues.push({ docType: "attestation_sheet", code, field, message, severity: "warning", ...source });

  // No numeric or text grading policy is persisted for this form. Keep GRADE blank.
  issue("grading_policy_missing", "GRADE", "Шкала оценок для ведомости не подтверждена; графа «Оценка» оставлена пустой. Процент теста не заменяет итоговую оценку.");
  const course = snapshot.course;
  if (!course || course.organization_id !== snapshot.organization.id || course.id !== snapshot.group.course_id) return result;

  const tests = snapshot.lessons.filter((lesson) => lesson.course_id === course.id && lesson.type === "test");
  if (!tests.length) {
    issue("missing_final_test", "lessons", "В курсе нет подтверждённого теста; результаты ведомости оставлены пустыми.");
    return result;
  }
  if (tests.some((lesson) => !lesson.id || !Number.isInteger(lesson.order_index))) {
    issue("invalid_test_order", "lessons.order_index", "Порядок тестов курса некорректен; итоговый тест не выбран.");
    return result;
  }
  if (new Set(tests.map((lesson) => lesson.id)).size !== tests.length) {
    issue("ambiguous_lesson_identity", "lessons.id", "Идентификатор теста повторяется в источнике; итоговый тест не подтверждён.");
    return result;
  }
  const finalTest = selectUnambiguousFinalTestLesson(tests, course.id);
  if (!finalTest) {
    issue("ambiguous_final_test", "lessons.order_index", "Несколько тестов занимают последнюю позицию курса; итоговый тест не выбран произвольно.");
    return result;
  }
  const passingScore = Number.isInteger(finalTest.test_passing_score)
    && finalTest.test_passing_score >= 0 && finalTest.test_passing_score <= 100
    ? finalTest.test_passing_score : null;
  if (passingScore === null) {
    issue("invalid_passing_score", "lessons.test_passing_score", "Проходной процент итогового теста не подтверждён; значения по умолчанию не применяются.", { lessonId: finalTest.id });
  }
  const settingsUpdatedAt = timestamp(finalTest.updated_at);
  const enrollments = new Map(snapshot.enrollments.map((row) => [row.id, row]));
  const allowedUsers = new Set(result.rowSources.map((row) => row.userId));
  const attempts = new Map<string, GroupAttestationFactsAttempt[]>();
  for (const attempt of snapshot.testAttempts) {
    if (attempt.lesson_id !== finalTest.id || !allowedUsers.has(attempt.user_id)) continue;
    const rows = attempts.get(attempt.user_id) || [];
    rows.push(attempt);
    attempts.set(attempt.user_id, rows);
  }

  result.rowSources.forEach((source, index) => {
    source.lessonId = finalTest.id;
    source.passingScore = passingScore;
    if (!source.enrollmentId) return; // Roster builder already reports missing/ambiguous enrollment.
    const enrollment = enrollments.get(source.enrollmentId);
    if (!enrollment || enrollment.user_id !== source.userId || enrollment.course_id !== course.id) {
      issue("enrollment_identity_mismatch", "enrollments", "Связь зачисления с участником и курсом не подтверждена; результат не заполнен.", { userId: source.userId });
      return;
    }
    const sourceIds = { userId: source.userId, enrollmentId: enrollment.id, lessonId: finalTest.id };
    const startedAt = timestamp(enrollment.started_at);
    if (startedAt === null) {
      issue("missing_enrollment_start", "enrollments.started_at", "Дата текущего зачисления некорректна или отсутствует; нельзя отделить старые попытки от текущего обучения.", sourceIds);
      return;
    }
    const userAttempts = (attempts.get(source.userId) || [])
      .map((attempt) => ({ attempt, at: timestamp(attempt.completed_at) }));
    if (userAttempts.some((row) => row.at === null)) {
      issue("invalid_attempt_date", "test_attempts.completed_at", "У попытки нет достоверной даты; последнюю попытку текущего зачисления определить нельзя.", sourceIds);
      return;
    }
    const currentAttempts = userAttempts.filter((row) => row.at! >= startedAt);
    if (!currentAttempts.length) {
      issue(userAttempts.length ? "only_prior_enrollment_attempts" : "missing_test_attempt", "test_attempts",
        userAttempts.length ? "Все попытки предшествуют текущему зачислению; прежний результат не перенесён."
          : "Нет сохранённой попытки итогового теста для участника; результат оставлен пустым.", sourceIds);
      return;
    }
    const validScore = ({ attempt }: typeof currentAttempts[number]) => Boolean(attempt.id)
      && Number.isInteger(attempt.score) && Number.isInteger(attempt.max_score)
      && attempt.max_score > 0 && attempt.score >= 0 && attempt.score <= attempt.max_score;
    let candidates = currentAttempts;
    if (input.attemptPolicy === "latest") {
      const lastAt = Math.max(...currentAttempts.map((row) => row.at!));
      candidates = currentAttempts.filter((row) => row.at === lastAt);
    }
    // Invalid candidates cannot silently cause an older/better result to be substituted.
    if (candidates.some((row) => !validScore(row))) {
      issue("invalid_attempt_score", "test_attempts.score", "Баллы подходящей попытки некорректны; другая попытка не подставлена вместо неё.", sourceIds);
      return;
    }
    if (input.attemptPolicy === "best_percent") {
      const bestPercent = Math.max(...candidates.map(({ attempt }) => attempt.score / attempt.max_score));
      candidates = candidates.filter(({ attempt }) => attempt.score / attempt.max_score === bestPercent);
      const lastBestAt = Math.max(...candidates.map((row) => row.at!));
      candidates = candidates.filter((row) => row.at === lastBestAt);
    }
    if (candidates.length !== 1) {
      const explicitPolicy = input.attemptPolicy === "latest" || input.attemptPolicy === "best_percent";
      issue(explicitPolicy ? "ambiguous_selected_attempt" : "attempt_policy_missing", "test_attempts",
        explicitPolicy ? "Несколько попыток равнозначны по выбранному правилу и времени; конкретная попытка не выбрана произвольно."
          : "Найдено несколько попыток, но правило «последняя» или «лучшая по проценту» не согласовано; результат оставлен пустым.", sourceIds);
      return;
    }
    const { attempt, at: selectedAt } = candidates[0];
    const percent = Math.round((attempt.score / attempt.max_score) * 100);
    source.attemptId = attempt.id;
    source.percent = percent;
    result.rows[index].PERCENT = String(percent);
    if (settingsUpdatedAt === null || settingsUpdatedAt > selectedAt!) {
      issue("historical_passing_score_unconfirmed", "lessons.updated_at", "Настройки теста изменены после попытки или дата настроек не подтверждена; исторический проходной порог не сохранён. Подставлен только фактический процент.", { ...sourceIds, attemptId: attempt.id });
      return;
    }
    source.passed = passingScore === null ? null : percent >= passingScore;
  });
  if (result.rowSources.some((row) => row.attemptId !== null)) {
    issue("cycle_boundary_unverified", "enrollments.started_at", "Попытки до текущего зачисления исключены. Дата сброса обучения внутри того же зачисления отдельно не хранится, поэтому принадлежность попытки последнему циклу после сброса не подтверждена; ведомость остаётся черновиком.");
  }
  return result;
}
