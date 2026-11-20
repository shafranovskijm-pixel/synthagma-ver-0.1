import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchGroupRosterMetadata, isMissingGroupMetadataRpc, readGroupParticipantMetadata } from "../groupFolderMetadata";

const legacy = vi.hoisted(() => vi.fn());
vi.mock("@/api/studentGroupMemberships", () => ({ fetchEffectiveGroupProfiles: (...args: unknown[]) => legacy(...args) }));

const org = "10000000-0000-4000-8000-000000000001";
const group = "20000000-0000-4000-8000-000000000001";
const user = "30000000-0000-4000-8000-000000000001";
const other = "30000000-0000-4000-8000-000000000002";
const course = "40000000-0000-4000-8000-000000000001";
const doc = "50000000-0000-4000-8000-000000000001";
const row = () => ({ user_id: user, full_name: "Иванов Иван", email: null, login: "student", phone: null, archived_at: null, department: " Цех " });
const roster = () => ({ version: 1, organization_id: org, group_id: group, profiles: [row()] });
const details = (linked: string | null = null) => ({ version: 1, organization_id: org, group_id: group, user_ids: [user], linked_course_id: linked,
  identity_rows: [{ user_id: user, type: "passport", organization_id: org }],
  contract_rows: [{ id: doc, student_user_id: user }], attempt_rows: [{ id: doc, user_id: user }],
  frdo_rows: [{ user_id: user, last_name: "Иванов", first_name: "Иван", middle_name: null, birth_date: null, gender: null,
    snils: null, citizenship_code: null, education_level: null, passport_series: null, passport_number: null }],
  enrollment_rows: [{ course_id: course, user_id: user, status: "completed", progress: 100, completed_at: "2026-11-01T00:00:00Z" }] as unknown,
  enrollment_error: false,
});
const client = (data: unknown, error: unknown = null) => ({ rpc: vi.fn().mockResolvedValue({ data, error }) });
const missing = (name: string) => ({ code: "PGRST202", message: `Could not find the function public.${name}(p_group_id, p_organization_id) in the schema cache` });
beforeEach(() => legacy.mockReset().mockResolvedValue([row()]));

describe("group metadata RPC rollout and strict response boundary", () => {
  it("reads the entire roster in one RPC with only the seven permitted fields, including archived rows", async () => {
    const body = roster();
    body.profiles = Array.from({ length: 1276 }, (_, i) => ({ ...row(), user_id: `30000000-0000-4000-8000-${String(i).padStart(12, "0")}`, archived_at: i === 1275 ? "2026-11-01" : null }));
    const db = client(body);
    const result = await fetchGroupRosterMetadata(db, org, group);
    expect(result.source).toBe("rpc"); expect(result.profiles).toHaveLength(1276);
    expect(Object.keys(result.profiles[0]).sort()).toEqual(["user_id", "full_name", "email", "login", "phone", "archived_at", "department"].sort());
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("get_group_roster_metadata", { p_organization_id: org, p_group_id: group });
    expect(legacy).not.toHaveBeenCalled();
  });
  it("uses the original exact-org seven-field roster loader only for the explicitly missing target RPC", async () => {
    const db = client(null, missing("get_group_roster_metadata"));
    expect((await fetchGroupRosterMetadata(db, org, group)).source).toBe("legacy");
    expect(legacy).toHaveBeenCalledExactlyOnceWith(db, org, group, { select: "user_id, full_name, email, login, phone, archived_at, department" });
  });
  it.each(["42501", "57014", "42883", "40001"])("never falls back on %s", async code => {
    const error = { ...missing("get_group_roster_metadata"), code };
    await expect(fetchGroupRosterMetadata(client(null, error), org, group)).rejects.toBe(error);
    expect(legacy).not.toHaveBeenCalled();
  });
  it.each([missing("another_function"), { code: "PGRST202", message: "generic missing function" }, { code: "PGRST202", message: "Could not find the function public.get_group_roster_metadata_extra() in the schema cache" }])("does not treat unrelated or ambiguous schema errors as rollout absence", async error => {
    await expect(fetchGroupRosterMetadata(client(null, error), org, group)).rejects.toBe(error);
    expect(legacy).not.toHaveBeenCalled();
  });
  it.each(["foreign-org", "foreign-group", "extra-secret", "duplicate-user", "missing-field", "wrong-version"])("rejects malformed %s roster without legacy widening", async kind => {
    const body: any = roster();
    if (kind === "foreign-org") body.organization_id = other;
    if (kind === "foreign-group") body.group_id = other;
    if (kind === "extra-secret") body.profiles[0].generated_password = "private";
    if (kind === "duplicate-user") body.profiles.push(row());
    if (kind === "missing-field") delete body.profiles[0].department;
    if (kind === "wrong-version") body.version = 2;
    await expect(fetchGroupRosterMetadata(client(body), org, group)).rejects.toMatchObject({ code: "GROUP_METADATA_INVALID" });
    expect(legacy).not.toHaveBeenCalled();
  });
  it("reads details for the exact initial active IDs and linked-course CAS argument", async () => {
    const body = details(course); const db = client(body);
    expect(await readGroupParticipantMetadata(db, org, group, [user], course)).toEqual(body);
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("get_group_participant_metadata", {
      p_organization_id: org, p_group_id: group, p_user_ids: [user], p_linked_course_id: course,
    });
  });
  it("preserves visible cross-organization same-user identity metadata without widening subject IDs", async () => {
    const body = details(); body.identity_rows.push({ user_id: user, type: "snils", organization_id: other });
    expect((await readGroupParticipantMetadata(client(body), org, group, [user], null))?.identity_rows).toHaveLength(2);
  });
  it("keeps only the explicit linked-enrollment unknown branch nonfatal", async () => {
    const body = details(course); body.enrollment_rows = null; body.enrollment_error = true;
    expect((await readGroupParticipantMetadata(client(body), org, group, [user], course))?.enrollment_error).toBe(true);
    await expect(readGroupParticipantMetadata(client({ ...body, linked_course_id: null }), org, group, [user], null)).rejects.toMatchObject({ code: "GROUP_METADATA_INVALID" });
  });
  it.each(["foreign-org", "foreign-group", "stale-course", "omitted-user", "foreign-user", "duplicate-users", "identity-subject", "contract-subject", "attempt-subject", "frdo-subject", "duplicate-frdo", "enrollment-course", "extra-key", "unknown-with-rows", "null-without-error"])("rejects %s detail responses", async kind => {
    const body: any = details(course);
    if (kind === "foreign-org") body.organization_id = other;
    if (kind === "foreign-group") body.group_id = other;
    if (kind === "stale-course") body.linked_course_id = other;
    if (kind === "omitted-user") body.user_ids = [];
    if (kind === "foreign-user") body.user_ids = [other];
    if (kind === "duplicate-users") body.user_ids = [user, user];
    if (kind === "identity-subject") body.identity_rows[0].user_id = other;
    if (kind === "contract-subject") body.contract_rows[0].student_user_id = other;
    if (kind === "attempt-subject") body.attempt_rows[0].user_id = other;
    if (kind === "frdo-subject") body.frdo_rows[0].user_id = other;
    if (kind === "duplicate-frdo") body.frdo_rows.push({ ...body.frdo_rows[0] });
    if (kind === "enrollment-course") body.enrollment_rows[0].course_id = other;
    if (kind === "extra-key") body.frdo_rows[0].private_data = "private";
    if (kind === "unknown-with-rows") body.enrollment_error = true;
    if (kind === "null-without-error") body.enrollment_rows = null;
    await expect(readGroupParticipantMetadata(client(body), org, group, [user], course)).rejects.toMatchObject({ code: "GROUP_METADATA_INVALID" });
  });
  it("returns rollout absence only for missing participant RPC and propagates denial or malformed data", async () => {
    expect(await readGroupParticipantMetadata(client(null, missing("get_group_participant_metadata")), org, group, [user], null)).toBeNull();
    const error = { code: "42501", message: "not allowed" };
    await expect(readGroupParticipantMetadata(client(null, error), org, group, [user], null)).rejects.toBe(error);
    await expect(readGroupParticipantMetadata(client(null), org, group, [user], null)).rejects.toMatchObject({ code: "GROUP_METADATA_INVALID" });
  });
  it("does not confuse the two target names", () => {
    expect(isMissingGroupMetadataRpc(missing("get_group_roster_metadata"), "get_group_participant_metadata")).toBe(false);
  });
});
