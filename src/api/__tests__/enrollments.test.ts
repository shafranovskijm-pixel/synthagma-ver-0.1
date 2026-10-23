import { beforeEach, describe, expect, it, vi } from "vitest";

type ConfirmedRow = { id: string; user_id: string; course_id: string };
type AccessRow = ConfirmedRow & { status: string | null; expires_at: string | null };
type QueryResult<T> = { data: T; error: unknown };

const testState = vi.hoisted(() => ({
  insertedRows: [] as unknown[],
  authSession: vi.fn(), update: vi.fn(), headers: vi.fn(),
  updateResult: {data:null as AccessRow|null,error:null as unknown,status:200 as number},
  insertResult: {
    data: [] as ConfirmedRow[],
    error: null as unknown,
  },
  readBackResult: {
    data: [] as ConfirmedRow[],
    error: null as unknown,
  },
  exactReadResults: [] as Array<QueryResult<AccessRow | null>>,
  insertSelect: vi.fn(),
  readBackSelect: vi.fn(),
  exactReadSelect: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth:{getSession:testState.authSession},
    from: (table: string) => {
      if (table !== "enrollments") throw new Error(`Unexpected table: ${table}`);
      return {
        update: (patch: unknown) => {
          testState.update(patch);
          const chain:any={eq:()=>chain,select:()=>chain,maybeSingle:()=>({setHeader:(key:string,value:string)=>{testState.headers(key,value);return Promise.resolve(testState.updateResult);}})};
          return chain;
        },
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
            eq: (column: string, _value: string) => {
              if (column === "user_id") {
                testState.exactReadSelect(columns);
                return {
                  eq: (_courseColumn: string, _courseId: string) => ({
                    maybeSingle: () => {
                      const result=Promise.resolve(testState.exactReadResults.shift()??{data:null,error:null});
                      return Object.assign(result,{setHeader:(key:string,value:string)=>{testState.headers(key,value);return result;}});
                    },
                  }),
                };
              }

              return {
                in: (_inColumn: string, _values: string[]) =>
                  Promise.resolve(testState.readBackResult),
              };
            },
          };
        },
      };
    },
  },
}));

import {
  StudentAssignmentQuotaError,
  EnrollmentAccessExpiredError,
  EnrollmentPersistenceError,
  ensureEnrollmentVerified,
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

const activeAccess: AccessRow = {
  id: "enrollment-1",
  user_id: "student-1",
  course_id: "course-1",
  status: "active",
  expires_at: null,
};

describe("insertEnrollmentsVerified", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.insertedRows = [];
    testState.insertResult = { data: confirmed, error: null };
    testState.readBackResult = { data: confirmed, error: null };
    testState.exactReadResults = [];
    testState.authSession.mockResolvedValue({data:{session:{user:{id:"operator"},access_token:"original-A"}},error:null});
    testState.updateResult={data:activeAccess,error:null,status:200};
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

  it.each([
    { code: "P0001", message: "STUDENT_ASSIGNMENT_LIMIT_EXCEEDED", hint: "Лимит назначений" },
    { code: "P0001", message: "Месячный лимит назначений исчерпан", details: "STUDENT_ASSIGNMENT_LIMIT_EXCEEDED" },
  ])("shows an assignment quota failure without treating it as persisted enrollment", async (databaseError) => {
    testState.insertResult = { data: [], error: databaseError };
    const outcome = insertEnrollmentsVerified(rows);
    await expect(outcome).rejects.toBeInstanceOf(StudentAssignmentQuotaError);
    await expect(outcome).rejects.toMatchObject({ code: "STUDENT_ASSIGNMENT_LIMIT_EXCEEDED", databaseError });
    await expect(outcome).rejects.toThrow("месячный лимит");
    expect(testState.readBackSelect).not.toHaveBeenCalled();
  });

  it("rejects duplicate users before writing", async () => {
    await expect(insertEnrollmentsVerified([rows[0], rows[0]])).rejects.toThrow(
      "unique non-empty user IDs",
    );
    expect(testState.insertSelect).not.toHaveBeenCalled();
  });
});

describe("ensureEnrollmentVerified", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.insertedRows = [];
    testState.insertResult = { data: [confirmed[0]], error: null };
    testState.readBackResult = { data: [confirmed[0]], error: null };
    testState.exactReadResults = [];
    testState.authSession.mockResolvedValue({data:{session:{user:{id:"operator"},access_token:"original-A"}},error:null});
    testState.updateResult={data:activeAccess,error:null,status:200};
  });

  it("returns an existing exact active enrollment without inserting", async () => {
    testState.exactReadResults = [{ data: activeAccess, error: null }];

    await expect(ensureEnrollmentVerified(rows[0])).resolves.toEqual(activeAccess);
    expect(testState.insertSelect).not.toHaveBeenCalled();
  });

  it("rejects an existing enrollment whose learner access expired", async () => {
    testState.exactReadResults = [{
      data: {
        ...activeAccess,
        expires_at: "2020-01-01T00:00:00.000Z",
      },
      error: null,
    }];

    await expect(ensureEnrollmentVerified(rows[0])).rejects.toBeInstanceOf(
      EnrollmentAccessExpiredError,
    );
    expect(testState.insertSelect).not.toHaveBeenCalled();
  });

  it("reconciles a 23505 retry only after an exact readable enrollment", async () => {
    testState.exactReadResults = [
      { data: null, error: null },
      { data: activeAccess, error: null },
    ];
    testState.insertResult = {
      data: [],
      error: { code: "23505", message: "duplicate key" },
    };

    await expect(ensureEnrollmentVerified(rows[0])).resolves.toEqual(activeAccess);
    expect(testState.insertSelect).toHaveBeenCalledTimes(1);
    expect(testState.exactReadSelect).toHaveBeenCalledTimes(2);
  });

  it("rejects a 23505 retry when the exact enrollment cannot be read back", async () => {
    testState.exactReadResults = [
      { data: null, error: null },
      { data: null, error: null },
    ];
    testState.insertResult = {
      data: [],
      error: { code: "23505", message: "duplicate key" },
    };

    await expect(ensureEnrollmentVerified(rows[0])).rejects.toBeInstanceOf(
      EnrollmentPersistenceError,
    );
  });

  it("does not mask non-23505 insert errors", async () => {
    const databaseError = Object.assign(new Error("database unavailable"), {
      code: "08006",
    });
    testState.exactReadResults = [{ data: null, error: null }];
    testState.insertResult = { data: [], error: databaseError };

    await expect(ensureEnrollmentVerified(rows[0])).rejects.toBe(databaseError);
  });
});

describe('retained technical cancellation reassignment',()=>{
 beforeEach(()=>{vi.clearAllMocks();testState.authSession.mockResolvedValue({data:{session:{user:{id:'operator'},access_token:'original-A'}},error:null});testState.updateResult={data:activeAccess,error:null,status:200};testState.insertResult={data:[],error:{code:'23505',message:'duplicate'}};testState.exactReadResults=[];});
 it('uses ordinary ensure to restore the same cancelled assignment and rereads it with original JWT',async()=>{
  testState.exactReadResults=[{data:{...activeAccess,status:'cancelled'},error:null},{data:activeAccess,error:null}];
  await expect(ensureEnrollmentVerified(rows[0])).resolves.toEqual(activeAccess);expect(testState.update).toHaveBeenCalledExactlyOnceWith({status:'active'});expect(testState.headers).toHaveBeenNthCalledWith(1,'Authorization','Bearer original-A');expect(testState.headers).toHaveBeenNthCalledWith(2,'Authorization','Bearer original-A');expect(testState.insertSelect).not.toHaveBeenCalled();
 });
 it('reconciles a concurrently discovered retained cancellation through the same ordinary restore path',async()=>{
  testState.exactReadResults=[{data:null,error:null},{data:{...activeAccess,status:'cancelled'},error:null},{data:activeAccess,error:null}];await expect(ensureEnrollmentVerified(rows[0])).resolves.toEqual(activeAccess);expect(testState.insertSelect).toHaveBeenCalledTimes(1);expect(testState.update).toHaveBeenCalledExactlyOnceWith({status:'active'});expect(testState.headers).toHaveBeenNthCalledWith(1,'Authorization','Bearer original-A');
 });
 it('does not claim restored assignment when its original-JWT readback stays cancelled',async()=>{
  testState.exactReadResults=[{data:{...activeAccess,status:'cancelled'},error:null},{data:{...activeAccess,status:'cancelled'},error:null}];await expect(ensureEnrollmentVerified(rows[0])).rejects.toBeInstanceOf(EnrollmentPersistenceError);
 });
 it('keeps the server formal-withdrawal denial and does not issue another insert',async()=>{
  testState.exactReadResults=[{data:{...activeAccess,status:'cancelled'},error:null}];const denied={code:'42501',message:'retained_enrollment_is_immutable'};testState.updateResult={data:null,error:denied,status:400};await expect(ensureEnrollmentVerified(rows[0])).rejects.toBe(denied);expect(testState.insertSelect).not.toHaveBeenCalled();
 });
 it('does not revive expired learner access during reassignment',async()=>{
  testState.exactReadResults=[{data:{...activeAccess,status:'cancelled',expires_at:'2020-01-01T00:00:00Z'},error:null}];await expect(ensureEnrollmentVerified(rows[0])).rejects.toBeInstanceOf(EnrollmentAccessExpiredError);expect(testState.update).not.toHaveBeenCalled();
 });
 it('resumes an explicit single-course insert after the retained unique row is found',async()=>{
  testState.exactReadResults=[{data:{...activeAccess,status:'cancelled'},error:null},{data:activeAccess,error:null}];await expect(insertEnrollmentsVerified([rows[0]])).resolves.toEqual([activeAccess]);expect(testState.insertSelect).toHaveBeenCalledTimes(1);expect(testState.update).toHaveBeenCalledTimes(1);
 });
 it('keeps the original uniqueness error for an existing active assignment',async()=>{
  const duplicate={code:'23505',message:'existing active assignment'};testState.insertResult={data:[],error:duplicate};testState.exactReadResults=[{data:activeAccess,error:null}];await expect(insertEnrollmentsVerified([rows[0]])).rejects.toBe(duplicate);expect(testState.update).not.toHaveBeenCalled();expect(testState.authSession).not.toHaveBeenCalled();
 });
 it('validates all existing batch rows before reactivating an earlier cancelled assignment',async()=>{
  const duplicate={code:'23505',message:'mixed retained and active assignments'};testState.insertResult={data:[],error:duplicate};testState.exactReadResults=[{data:{...activeAccess,status:'cancelled'},error:null},{data:{...activeAccess,id:'enrollment-2',user_id:'student-2'},error:null}];await expect(insertEnrollmentsVerified(rows)).rejects.toBe(duplicate);expect(testState.exactReadSelect).toHaveBeenCalledTimes(2);expect(testState.update).not.toHaveBeenCalled();expect(testState.authSession).not.toHaveBeenCalled();
 });
 it('does not recurse on a second unrelated uniqueness failure for a missing enrollment',async()=>{
  testState.exactReadResults=[{data:null,error:null}];await expect(insertEnrollmentsVerified([rows[0]])).rejects.toMatchObject({code:'23505'});expect(testState.insertSelect).toHaveBeenCalledTimes(2);expect(testState.update).not.toHaveBeenCalled();
 });
 it('does not report successful reassignment after the account changes during update',async()=>{
  testState.exactReadResults=[{data:{...activeAccess,status:'cancelled'},error:null}];testState.authSession.mockResolvedValueOnce({data:{session:{user:{id:'operator'},access_token:'original-A'}},error:null}).mockResolvedValueOnce({data:{session:{user:{id:'other'},access_token:'B'}},error:null});await expect(ensureEnrollmentVerified(rows[0])).rejects.toThrow('Пользователь изменился');
 });
});
