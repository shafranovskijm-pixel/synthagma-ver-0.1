import { describe, it, expect, vi } from "vitest";
import { fetchGroupFolderCounts, countUniqueContracts, countIdentityDocs, type GroupFolderCountSeed } from "../folderCounts";

const ORG = "7237f9d4-3670-4a19-8946-a43c68fd3473";
const GROUP = "0cd9dd54-af40-4899-bd94-9d3c1a728d38";
type Row = Record<string, any>;
type FakeData = Record<string, Row[]>;
type Query = { table: string; columns: string; filters: Array<[string, unknown]>; order?: string; from: number; to: number };

/** Executes filters, stable ordering and page limits just as the API does. */
function makeClient(data: FakeData, calls: Query[] = [], errorFor?: (query: Query) => unknown) {
  return { from: (table: string) => {
    const query: Query = { table, columns: "", filters: [], from: 0, to: 999 };
    calls.push(query);
    const result = () => {
      const error = errorFor?.(query) ?? null;
      let rows = (data[table] ?? []).filter(row => query.filters.every(([field, value]) =>
        Array.isArray(value) ? value.includes(row[field]) : row[field] === value));
      if (query.order) rows = [...rows].sort((a, b) => String(a[query.order!]).localeCompare(String(b[query.order!])));
      return { data: error ? null : rows.slice(query.from, query.to + 1), error };
    };
    const builder = {
      select: (columns: string) => { query.columns = columns; return builder; },
      eq: (field: string, value: unknown) => { query.filters.push([field, value]); return builder; },
      is: (field: string, value: unknown) => { query.filters.push([field, value]); return builder; },
      in: (field: string, values: string[]) => { query.filters.push([field, values]); return builder; },
      order: (field: string) => { query.order = field; return builder; },
      range: (from: number, to: number) => { query.from = from; query.to = to; return builder; },
      then: (resolve: (value: ReturnType<typeof result>) => unknown, reject?: (error: unknown) => unknown) =>
        Promise.resolve().then(result).then(resolve, reject),
    };
    return builder;
  } };
}

const member = (index: number, extra: Row = {}) => ({ user_id: `u${String(index).padStart(4, "0")}`, organization_id: ORG, group_id: GROUP, archived_at: null, ...extra });
function acceptanceData(): FakeData {
  return {
    student_group_profiles_effective: [member(1), member(2)],
    org_contracts: [
      { id: "c1", organization_id: ORG, student_group_id: GROUP, student_user_id: "u0001" },
      { id: "c2", organization_id: ORG, student_group_id: GROUP, student_user_id: "outside-roster" },
      { id: "c3", organization_id: ORG, student_group_id: "other-group", student_user_id: "u0002" },
      { id: "foreign", organization_id: "other-org", student_group_id: GROUP, student_user_id: "u0001" },
    ],
    group_documents: Array.from({ length: 19 }, (_, index) => ({ id: `d${index}`, organization_id: ORG, group_id: GROUP, status: "active" })),
    student_identity_documents: [
      { id: "i1", organization_id: ORG, user_id: "u0001", type: "passport" },
      { id: "i2", organization_id: ORG, user_id: "u0001", type: "snils" },
      { id: "i3", organization_id: ORG, user_id: "u0002", type: "passport" },
    ],
    test_attempts: [{ id: "a1", user_id: "u0001" }],
  };
}

describe("group folder counts", () => {
  it("reuses completed same-scope learner reads and queries only the two group sources", async () => {
    const data = acceptanceData();
    const seed: GroupFolderCountSeed = { organizationId: ORG, groupId: GROUP, studentContractIds: ["c1", "c3"], passports: 2, snils: 1, exams: 1 };
    const calls: Query[] = [];
    const fresh = await fetchGroupFolderCounts(makeClient(data), ORG, GROUP);
    const reused = await fetchGroupFolderCounts(makeClient(data, calls), ORG, GROUP, seed);
    expect(reused).toEqual(fresh);
    expect(calls.map(query => query.table).sort()).toEqual(["group_documents", "org_contracts"]);
    expect(reused.contracts).toBe(3);
  });

  it("discards a seed from another organization or group and reads current data", async () => {
    const data = acceptanceData();
    for (const seed of [
      { organizationId: "foreign", groupId: GROUP, studentContractIds: ["fake"], passports: 99, snils: 99, exams: 99 },
      { organizationId: ORG, groupId: "other", studentContractIds: ["fake"], passports: 99, snils: 99, exams: 99 },
    ]) {
      const calls: Query[] = [];
      expect(await fetchGroupFolderCounts(makeClient(data, calls), ORG, GROUP, seed)).toEqual({ contracts: 3, docs: 19, passports: 2, snils: 1, exams: 1 });
      expect(calls.some(query => query.table === "student_group_profiles_effective")).toBe(true);
    }
  });

  it("counts unique contracts across group and learner matches", () => {
    expect(countUniqueContracts([{ id: "c1" }, { id: "c1" }, { id: "c2" }])).toBe(2);
    expect(countUniqueContracts(null)).toBe(0);
  });

  it("splits identity documents by type", () => {
    expect(countIdentityDocs(acceptanceData().student_identity_documents as Array<{ type: string }>)).toEqual({ passports: 2, snils: 1 });
  });

  it("preserves the group OR learner contract union without duplicates or foreign rows", async () => {
    const calls: Query[] = [];
    expect(await fetchGroupFolderCounts(makeClient(acceptanceData(), calls), ORG, GROUP))
      .toEqual({ contracts: 3, docs: 19, passports: 2, snils: 1, exams: 1 });
    const members = calls.find(query => query.table === "student_group_profiles_effective")!;
    expect(members.filters).toEqual(expect.arrayContaining([["organization_id", ORG], ["group_id", GROUP], ["archived_at", null]]));
    const contracts = calls.filter(query => query.table === "org_contracts");
    expect(contracts).toHaveLength(2);
    expect(contracts.every(query => query.filters.some(([field, value]) => field === "organization_id" && value === ORG))).toBe(true);
    expect(contracts.some(query => query.filters.some(([field, value]) => field === "student_group_id" && value === GROUP))).toBe(true);
  });

  it("keeps group contracts and documents for an empty group without learner queries", async () => {
    const data = acceptanceData(); data.student_group_profiles_effective = [];
    const calls: Query[] = [];
    expect(await fetchGroupFolderCounts(makeClient(data, calls), ORG, GROUP))
      .toEqual({ contracts: 2, docs: 19, passports: 0, snils: 0, exams: 0 });
    expect(calls.filter(query => ["student_identity_documents", "test_attempts"].includes(query.table))).toHaveLength(0);
  });

  it("refetch reflects newly persisted documents", async () => {
    const data = acceptanceData(); data.org_contracts = []; data.group_documents = [];
    const client = makeClient(data);
    expect((await fetchGroupFolderCounts(client, ORG, GROUP)).docs).toBe(0);
    data.org_contracts = acceptanceData().org_contracts; data.group_documents = acceptanceData().group_documents;
    const after = await fetchGroupFolderCounts(client, ORG, GROUP);
    expect(after.contracts).toBe(3); expect(after.docs).toBe(19);
  });

  it.each([358, 1276])("bounds all learner filters for a %i-member group and retains the last member", async count => {
    const data = acceptanceData();
    data.student_group_profiles_effective = Array.from({ length: count }, (_, index) => member(index));
    const lastUser = member(count - 1).user_id;
    data.test_attempts = [{ id: "last-attempt", user_id: lastUser }];
    data.student_identity_documents = [{ id: "last-document", organization_id: ORG, user_id: lastUser, type: "snils" }];
    const calls: Query[] = [];
    const result = await fetchGroupFolderCounts(makeClient(data, calls), ORG, GROUP);
    expect(result.snils).toBe(1); expect(result.exams).toBe(1);
    const batches = calls.flatMap(query => query.filters.filter(([, value]) => Array.isArray(value)).map(([, value]) => value as string[]));
    expect(batches.length).toBeGreaterThan(3); expect(batches.every(ids => ids.length <= 100)).toBe(true);
    expect(calls.filter(query => query.table === "test_attempts")).toHaveLength(Math.ceil(count / 100));
    expect(calls.every(query => Boolean(query.order))).toBe(true);
  });

  it("paginates more than 1000 attempts for one learner and group documents", async () => {
    const data = acceptanceData();
    data.test_attempts = Array.from({ length: 1205 }, (_, index) => ({ id: `a${String(index).padStart(4, "0")}`, user_id: "u0001" }));
    data.group_documents = Array.from({ length: 1007 }, (_, index) => ({ id: `d${String(index).padStart(4, "0")}`, organization_id: ORG, group_id: GROUP, status: "active" }));
    const calls: Query[] = [];
    const result = await fetchGroupFolderCounts(makeClient(data, calls), ORG, GROUP);
    expect(result.exams).toBe(1205); expect(result.docs).toBe(1007);
    expect(calls.filter(query => query.table === "test_attempts").map(query => query.from)).toEqual([0, 1000]);
    expect(calls.filter(query => query.table === "group_documents").map(query => query.from)).toEqual([0, 1000]);
  });

  it("excludes archived, foreign and other-group profiles from learner queries", async () => {
    const data = acceptanceData();
    data.student_group_profiles_effective.push(member(3, { archived_at: "2026-01-01" }), member(4, { organization_id: "other-org" }), member(5, { group_id: "other-group" }));
    data.test_attempts.push({ id: "archive", user_id: "u0003" }, { id: "foreign", user_id: "u0004" }, { id: "other-group", user_id: "u0005" });
    expect((await fetchGroupFolderCounts(makeClient(data), ORG, GROUP)).exams).toBe(1);
  });

  it("rejects a later learner batch rather than returning partial or zero counts", async () => {
    const data = acceptanceData(); data.student_group_profiles_effective = Array.from({ length: 150 }, (_, index) => member(index));
    const error = { code: "57014" };
    const client = makeClient(data, [], query => query.table === "student_identity_documents" && query.filters.some(([, value]) => Array.isArray(value) && value.includes("u0100")) ? error : null);
    await expect(fetchGroupFolderCounts(client, ORG, GROUP)).rejects.toBe(error);
  });

  it("rejects a failed later document page", async () => {
    const data = acceptanceData();
    data.group_documents = Array.from({ length: 1001 }, (_, index) => ({ id: `d${index}`, organization_id: ORG, group_id: GROUP, status: "active" }));
    const error = { code: "42501" };
    await expect(fetchGroupFolderCounts(makeClient(data, [], query => query.table === "group_documents" && query.from === 1000 ? error : null), ORG, GROUP)).rejects.toBe(error);
  });

  it("returns zeros without IDs and makes no request", async () => {
    const from = vi.fn();
    expect(await fetchGroupFolderCounts({ from }, "", GROUP)).toEqual({ contracts: 0, docs: 0, passports: 0, snils: 0, exams: 0 });
    expect(from).not.toHaveBeenCalled();
  });
});
