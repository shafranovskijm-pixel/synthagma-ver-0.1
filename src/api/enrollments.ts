import { supabase } from "@/integrations/supabase/client";

export interface EnrollmentInsertRow {
  user_id: string;
  course_id: string;
  status: string;
  progress: number;
  access_days?: number;
  time_spent?: number;
}

export interface ConfirmedEnrollmentRow {
  id: string;
  user_id: string;
  course_id: string;
}

export interface EnrollmentAccessRow extends ConfirmedEnrollmentRow {
  status: string | null;
  expires_at: string | null;
}

export class EnrollmentAccessExpiredError extends Error {
  readonly courseIds: string[];

  constructor(courseIds: string[]) {
    const uniqueCourseIds = Array.from(new Set(courseIds.filter(Boolean))).sort();
    super(
      uniqueCourseIds.length > 1
        ? "Для одного или нескольких выбранных курсов срок доступа ученика истёк. Измените срок доступа в карточке ученика."
        : "Срок доступа ученика к курсу истёк. Измените срок доступа в карточке ученика.",
    );
    this.name = "EnrollmentAccessExpiredError";
    this.courseIds = uniqueCourseIds;
  }
}

export function isEnrollmentAccessExpired(
  enrollment: Pick<EnrollmentAccessRow, "status" | "expires_at">,
  now: Date = new Date(),
): boolean {
  if (!enrollment.expires_at || enrollment.status === "completed") return false;

  const expiresAt = new Date(enrollment.expires_at);
  return Number.isFinite(expiresAt.getTime()) && expiresAt < now;
}

function getDatabaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

async function readExactEnrollmentAccess(
  userId: string,
  courseId: string,
): Promise<EnrollmentAccessRow | null> {
  const { data, error } = await supabase
    .from("enrollments")
    .select("id, user_id, course_id, status, expires_at")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (data.user_id !== userId || data.course_id !== courseId) return null;

  return data as EnrollmentAccessRow;
}

/** Raised when the server accepted INSERT but did not prove persistence. */
export class EnrollmentPersistenceError extends Error {
  readonly expectedUserIds: string[];
  readonly returnedUserIds: string[];
  readonly persistedUserIds: string[];

  constructor({
    expectedUserIds,
    returnedUserIds,
    persistedUserIds,
  }: {
    expectedUserIds: string[];
    returnedUserIds: string[];
    persistedUserIds: string[];
  }) {
    super(
      `Enrollment persistence was not confirmed: expected=${expectedUserIds.length}, returned=${returnedUserIds.length}, persisted=${persistedUserIds.length}`,
    );
    this.name = "EnrollmentPersistenceError";
    this.expectedUserIds = expectedUserIds;
    this.returnedUserIds = returnedUserIds;
    this.persistedUserIds = persistedUserIds;
  }
}

function matchingUserIds(
  rows: ConfirmedEnrollmentRow[] | null,
  courseId: string,
  expected: Set<string>,
): string[] {
  return Array.from(new Set(
    (rows ?? [])
      .filter((row) => row.course_id === courseId && expected.has(row.user_id))
      .map((row) => row.user_id),
  )).sort();
}

/**
 * Insert a single-course batch and prove persistence before UI success.
 * A plain `{ error: null }` is insufficient: every requested user/course
 * pair must be present in INSERT ... RETURNING and in a fresh read-back.
 */
export async function insertEnrollmentsVerified(
  rows: EnrollmentInsertRow[],
): Promise<ConfirmedEnrollmentRow[]> {
  if (rows.length === 0) return [];

  const courseIds = Array.from(new Set(rows.map((row) => row.course_id).filter(Boolean)));
  if (courseIds.length !== 1) {
    throw new Error("A verified enrollment batch must target exactly one course");
  }

  const expectedUserIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean))).sort();
  if (expectedUserIds.length !== rows.length) {
    throw new Error("A verified enrollment batch must contain unique non-empty user IDs");
  }

  const courseId = courseIds[0];
  const expected = new Set(expectedUserIds);
  const { data: returned, error: insertError } = await supabase
    .from("enrollments")
    .insert(rows)
    .select("id, user_id, course_id");
  if (insertError) throw insertError;

  const returnedUserIds = matchingUserIds(
    (returned ?? []) as ConfirmedEnrollmentRow[],
    courseId,
    expected,
  );

  const { data: persisted, error: verificationError } = await supabase
    .from("enrollments")
    .select("id, user_id, course_id")
    .eq("course_id", courseId)
    .in("user_id", expectedUserIds);
  if (verificationError) throw verificationError;

  const persistedRows = (persisted ?? []) as ConfirmedEnrollmentRow[];
  const persistedUserIds = matchingUserIds(persistedRows, courseId, expected);
  if (
    returnedUserIds.length !== expectedUserIds.length
    || persistedUserIds.length !== expectedUserIds.length
  ) {
    throw new EnrollmentPersistenceError({
      expectedUserIds,
      returnedUserIds,
      persistedUserIds,
    });
  }

  return persistedRows.filter(
    (row) => row.course_id === courseId && expected.has(row.user_id),
  );
}

/**
 * Used only by workflows that must safely resume after a partial success.
 * An existing exact enrollment is accepted only when learner access is valid.
 */
export async function ensureEnrollmentVerified(
  row: EnrollmentInsertRow,
): Promise<EnrollmentAccessRow> {
  const existing = await readExactEnrollmentAccess(row.user_id, row.course_id);
  if (existing) {
    if (isEnrollmentAccessExpired(existing)) {
      throw new EnrollmentAccessExpiredError([row.course_id]);
    }
    return existing;
  }

  try {
    await insertEnrollmentsVerified([row]);
  } catch (error) {
    // A concurrent request or a retry may have created the exact row.
    // Only 23505 is reconciled; all other write errors remain fail-closed.
    if (getDatabaseErrorCode(error) !== "23505") throw error;
  }

  const persisted = await readExactEnrollmentAccess(row.user_id, row.course_id);
  if (!persisted) {
    throw new EnrollmentPersistenceError({
      expectedUserIds: [row.user_id],
      returnedUserIds: [],
      persistedUserIds: [],
    });
  }
  if (isEnrollmentAccessExpired(persisted)) {
    throw new EnrollmentAccessExpiredError([row.course_id]);
  }

  return persisted;
}
