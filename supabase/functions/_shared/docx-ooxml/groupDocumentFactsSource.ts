/** Read only the server-authorized group's facts, without truncating large groups. */
export interface FactPage<T> {
  data: T[] | null;
  count: number | null;
  error: unknown;
}

export interface FactReadScope {
  organizationId: string;
  courseId: string | null;
  studentUserIds: string[];
}

export interface FactPageRequest extends FactReadScope {
  from: number;
  to: number;
}

export interface EnrollmentFactRow {
  id: string;
  user_id: string;
  course_id: string;
  status: string;
  progress: number;
  completed_at: string | null;
}

export interface StudentFrdoFactRow {
  id: string;
  user_id: string;
  organization_id: string;
  passport_series: string | null;
  passport_number: string | null;
  education_level: string | null;
}

export interface GroupFactsReader {
  enrollments: (request: FactPageRequest) => PromiseLike<FactPage<EnrollmentFactRow>>;
  studentFrdoData: (request: FactPageRequest) => PromiseLike<FactPage<StudentFrdoFactRow>>;
}

export interface FactSourceIssue {
  source: "enrollments" | "student_frdo_data";
  code: "read_failed" | "incomplete_page" | "source_changed" | "scope_mismatch";
  message: string;
}

const PAGE_SIZE = 200;
const USER_CHUNK_SIZE = 100;
const MAX_ROWS_PER_CHUNK = 10_000;

class FactReadError extends Error {
  constructor(readonly code: FactSourceIssue["code"]) {
    super(code);
  }
}

async function readAll<T extends { id: string; user_id: string }>(
  scope: FactReadScope,
  readPage: (request: FactPageRequest) => PromiseLike<FactPage<T>>,
  matchesScope: (row: T) => boolean,
): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  const userIds = [...new Set(scope.studentUserIds)].sort();
  for (let start = 0; start < userIds.length; start += USER_CHUNK_SIZE) {
    const chunk = userIds.slice(start, start + USER_CHUNK_SIZE);
    const allowedUsers = new Set(chunk);
    let expectedCount: number | undefined;
    let received = 0;
    do {
      const result = await readPage({
        ...scope,
        studentUserIds: chunk,
        from: received,
        to: received + PAGE_SIZE - 1,
      });
      if (result.error) throw new FactReadError("read_failed");
      if (!Array.isArray(result.data) || !Number.isSafeInteger(result.count)
        || result.count! < 0 || result.count! > MAX_ROWS_PER_CHUNK) {
        throw new FactReadError("incomplete_page");
      }
      if (expectedCount !== undefined && expectedCount !== result.count) {
        throw new FactReadError("source_changed");
      }
      expectedCount = result.count!;
      if (result.data.length > PAGE_SIZE || received + result.data.length > expectedCount
        || (result.data.length === 0 && received < expectedCount)) {
        throw new FactReadError("incomplete_page");
      }
      for (const row of result.data) {
        if (!row.id || !allowedUsers.has(row.user_id) || !matchesScope(row)) {
          throw new FactReadError("scope_mismatch");
        }
        if (seen.has(row.id)) throw new FactReadError("source_changed");
        seen.add(row.id);
        rows.push(row);
      }
      // Advance by rows actually returned; a server page limit must not omit people.
      received += result.data.length;
    } while (received < expectedCount);
  }
  return rows;
}

/** A failed source has no partial rows: its own documents receive an explicit issue. */
export async function loadGroupDocumentFacts(scope: FactReadScope, reader: GroupFactsReader) {
  const sourceIssues: FactSourceIssue[] = [];
  async function guarded<T>(
    source: FactSourceIssue["source"],
    label: string,
    read: () => Promise<T[]>,
  ): Promise<T[]> {
    try {
      return await read();
    } catch (error) {
      sourceIssues.push({
        source,
        code: error instanceof FactReadError ? error.code : "read_failed",
        message: `Не удалось полностью подтвердить ${label} в базе. Данные этого источника не использованы; документ требует повторной проверки.`,
      });
      return [];
    }
  }

  const [enrollments, studentFrdoData] = await Promise.all([
    scope.courseId
      ? guarded("enrollments", "зачисления группы на курс", () => readAll(
          scope, reader.enrollments, (row) => row.course_id === scope.courseId,
        ))
      : Promise.resolve([] as EnrollmentFactRow[]),
    guarded("student_frdo_data", "паспортные данные и образование учеников", () => readAll(
      scope, reader.studentFrdoData, (row) => row.organization_id === scope.organizationId,
    )),
  ]);
  return { enrollments, studentFrdoData, sourceIssues };
}
