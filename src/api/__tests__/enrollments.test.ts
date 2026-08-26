import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  insertedRows: [] as unknown[],
  insertResult: {
    data: [] as Array<{ id: string; user_id: string; course_id: string }>,
    error: null as Error | null,
  },
  readBackResult: {
    data: [] as Array<{ id: string; user_id: string; course_id: string }>,
    error: null as Error | null,
  },
  insertSelect: vi.fn(),
  readBackSelect: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "enrollments") throw new Error(`Unexpected table: ${table}`);
      return {
        insert: (rows: unknown[]) => {
          testState.insertedRows = rows;
          return {
            select: (columns: string) => {
              testState.insertSelect(columns);
              return Promise.resolve(testState.insertResult);
            },
          };
        },
        select: (columns: string) => {
          testState.readBackSelect(columns);
          return {
            eq: (_column: string, _value: string) => ({
              in: (_inColumn: string, _values: string[]) =>
                Promise.resolve(testState.readBackResult),
            }),
          };
        },
      };
    },
  },
}));

import {
  EnrollmentPersistenceError,
  insertEnrollmentsVerified,
} from "@/api/enrollments";

const rows = [
  { user_id: "student-1", course_id: "course-1", status: "active", progress: 0 },
  { user_id: "student-2", course_id: "course-1", status: "active", progress: 0 },
];

const confirmed = [
  { id: "enrollment-1", user_id: "student-1", course_id: "course-1" },
  { id: "enrollment-2", user_id: "student-2", course_id: "course-1" },
];

describe("insertEnrollmentsVerified", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.insertedRows = [];
    testState.insertResult = { data: confirmed, error: null };
    testState.readBackResult = { data: confirmed, error: null };
  });

  it("returns success only after exact RETURNING and a fresh read-back", async () => {
    await expect(insertEnrollmentsVerified(rows)).resolves.toEqual(confirmed);
    expect(testState.insertedRows).toEqual(rows);
    expect(testState.insertSelect).toHaveBeenCalledWith("id, user_id, course_id");
    expect(testState.readBackSelect).toHaveBeenCalledWith("id, user_id, course_id");
  });

  it("rejects a false-success insert that returned no enrollment rows", async () => {
    testState.insertResult = { data: [], error: null };

    await expect(insertEnrollmentsVerified(rows)).rejects.toBeInstanceOf(
      EnrollmentPersistenceError,
    );
  });

  it("rejects when a fresh read-back cannot see every requested enrollment", async () => {
    testState.readBackResult = { data: confirmed.slice(0, 1), error: null };

    await expect(insertEnrollmentsVerified(rows)).rejects.toMatchObject({
      name: "EnrollmentPersistenceError",
      expectedUserIds: ["student-1", "student-2"],
      returnedUserIds: ["student-1", "student-2"],
      persistedUserIds: ["student-1"],
    });
  });

  it("propagates the database insert error", async () => {
    const databaseError = new Error("database unavailable");
    testState.insertResult = { data: [], error: databaseError };

    await expect(insertEnrollmentsVerified(rows)).rejects.toBe(databaseError);
    expect(testState.readBackSelect).not.toHaveBeenCalled();
  });

  it("rejects duplicate users before writing", async () => {
    await expect(insertEnrollmentsVerified([rows[0], rows[0]])).rejects.toThrow(
      "unique non-empty user IDs",
    );
    expect(testState.insertSelect).not.toHaveBeenCalled();
  });
});
