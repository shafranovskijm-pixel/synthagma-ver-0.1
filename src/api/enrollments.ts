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
