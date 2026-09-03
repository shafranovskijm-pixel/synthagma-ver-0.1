import {
  FactReadError,
  readExactFactPages,
  type EnrollmentFactRow,
  type FactPage,
  type FactReadScope,
  type FactSourceIssue,
} from "./groupDocumentFactsSource.ts";
import {
  selectUnambiguousFinalTestLesson,
  type GroupAttestationFactsAttempt,
  type GroupAttestationFactsLesson,
} from "./groupAttestationFacts.ts";
import type { GroupRegistrationFactsRecord } from "./groupRegistrationFacts.ts";

interface PageBounds { from: number; to: number }
export interface CompletionFactsReader {
  lessons: (request: PageBounds & { courseId: string }) => PromiseLike<FactPage<GroupAttestationFactsLesson>>;
  attempts: (request: PageBounds & {
    lessonId: string; studentUserIds: string[]; completedSince: string;
  }) => PromiseLike<FactPage<GroupAttestationFactsAttempt>>;
  records: (request: PageBounds & {
    organizationId: string; enrollmentIds: string[];
  }) => PromiseLike<FactPage<GroupRegistrationFactsRecord>>;
}

export interface CompletionSourceIssue {
  source: "lessons" | "test_attempts" | "education_document_records";
  code: FactSourceIssue["code"];
  message: string;
}

function chunks<T>(items: T[], size = 100): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) result.push(items.slice(offset, offset + size));
  return result;
}

/** Caller authorizes the course/roster first. Every page is checked again here. */
export async function loadGroupCompletionFacts(input: {
  scope: FactReadScope;
  enrollments: readonly EnrollmentFactRow[];
  fillMode: "blank" | "data";
}, reader: CompletionFactsReader) {
  const sourceIssues: CompletionSourceIssue[] = [];
  const empty = {
    lessons: [] as GroupAttestationFactsLesson[],
    testAttempts: [] as GroupAttestationFactsAttempt[],
    educationDocumentRecords: [] as GroupRegistrationFactsRecord[],
    sourceIssues,
  };
  // A blank form must not silently collect grades or look like an issued ledger.
  if (input.fillMode === "blank" || !input.scope.courseId) return empty;
  const courseId = input.scope.courseId;
  const users = new Set(input.scope.studentUserIds);
  const authorizedEnrollments = input.enrollments.filter((row) =>
    row.course_id === courseId && users.has(row.user_id) && row.id);
  const enrollmentById = new Map(authorizedEnrollments.map((row) => [row.id, row]));

  async function guarded<T>(
    source: CompletionSourceIssue["source"], label: string, read: () => Promise<T[]>,
  ): Promise<T[]> {
    try {
      return await read();
    } catch (error) {
      sourceIssues.push({
        source,
        code: error instanceof FactReadError ? error.code : "read_failed",
        message: `Не удалось полностью подтвердить ${label}. Частичные данные не использованы; документ требует повторной проверки.`,
      });
      return [];
    }
  }

  const recordsPromise = guarded("education_document_records", "записи реестра документов", async () => {
    const records: GroupRegistrationFactsRecord[] = [];
    const seen = new Set<string>();
    const enrollmentIds = [...new Set(authorizedEnrollments.map((row) => row.id))].sort();
    for (const batch of chunks(enrollmentIds)) {
      const allowed = new Set(batch);
      const rows = await readExactFactPages(
        (from, to) => reader.records({ organizationId: input.scope.organizationId, enrollmentIds: batch, from, to }),
        (row) => row.organization_id === input.scope.organizationId
          && Boolean(row.enrollment_id && allowed.has(row.enrollment_id))
          && (row.user_id === null || row.user_id === enrollmentById.get(row.enrollment_id!)?.user_id)
          && (row.course_id === null || row.course_id === courseId)
          && row.deleted_at === null
          && (row.document_status === "original" || row.document_status === "duplicate"),
      );
      for (const row of rows) {
        if (seen.has(row.id)) throw new FactReadError("source_changed");
        seen.add(row.id);
        records.push(row);
      }
    }
    return records;
  });

  const lessons = await guarded("lessons", "итоговый тест курса", () => readExactFactPages(
    (from, to) => reader.lessons({ courseId, from, to }),
    (row) => row.course_id === courseId && row.type === "test",
  ));
  const finalLesson = selectUnambiguousFinalTestLesson(lessons, courseId);
  const testAttempts = finalLesson
    ? await guarded("test_attempts", "результаты итогового теста", async () => {
        const attempts: GroupAttestationFactsAttempt[] = [];
        const seen = new Set<string>();
        const byUser = new Map<string, EnrollmentFactRow[]>();
        for (const row of authorizedEnrollments) {
          byUser.set(row.user_id, [...(byUser.get(row.user_id) || []), row]);
        }
        // Do not fetch other users' or historical runs' attempts as a fallback
        // for missing/ambiguous enrollment boundaries. The builder reports these.
        const boundaries = [...byUser.entries()].flatMap(([userId, rows]) => {
          const time = rows.length === 1 && rows[0].started_at ? Date.parse(rows[0].started_at) : NaN;
          return Number.isFinite(time) ? [{ userId, time }] : [];
        }).sort((a, b) => a.userId.localeCompare(b.userId));
        for (const batch of chunks(boundaries)) {
          const studentUserIds = batch.map((item) => item.userId);
          const allowed = new Set(studentUserIds);
          const completedSince = new Date(Math.min(...batch.map((item) => item.time))).toISOString();
          const rows = await readExactFactPages(
            (from, to) => reader.attempts({ lessonId: finalLesson.id, studentUserIds, completedSince, from, to }),
            (row) => row.lesson_id === finalLesson.id && allowed.has(row.user_id)
              && Number.isFinite(Date.parse(row.completed_at))
              && Date.parse(row.completed_at) >= Date.parse(completedSince),
          );
          for (const row of rows) {
            if (seen.has(row.id)) throw new FactReadError("source_changed");
            seen.add(row.id);
            attempts.push(row);
          }
        }
        return attempts;
      })
    : [];

  return { lessons, testAttempts, educationDocumentRecords: await recordsPromise, sourceIssues };
}
