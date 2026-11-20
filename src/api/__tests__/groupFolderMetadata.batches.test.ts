import { describe, expect, it, vi } from "vitest";
import { readGroupParticipantMetadata, type GroupParticipantMetadata } from "../groupFolderMetadata";

const org = "10000000-0000-4000-8000-000000000001";
const group = "20000000-0000-4000-8000-000000000001";
const course = "40000000-0000-4000-8000-000000000001";
const other = "90000000-0000-4000-8000-000000000001";
const users = (count: number) => Array.from({ length: count }, (_, index) => `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
interface Args { p_organization_id: string; p_group_id: string; p_user_ids: string[]; p_linked_course_id: string | null }
interface Reply { data: unknown; error: unknown }
function body(args: Args): GroupParticipantMetadata {
  return {
    version: 1, organization_id: args.p_organization_id, group_id: args.p_group_id,
    user_ids: [...args.p_user_ids].sort(), linked_course_id: args.p_linked_course_id,
    identity_rows: args.p_user_ids.map(user_id => ({ user_id, type: "passport", organization_id: org })),
    contract_rows: args.p_user_ids.map(user_id => ({ id: user_id, student_user_id: user_id })),
    attempt_rows: args.p_user_ids.map(user_id => ({ id: user_id, user_id })),
    frdo_rows: args.p_user_ids.map(user_id => ({ user_id, last_name: null, first_name: null, middle_name: null,
      birth_date: null, gender: null, snils: null, citizenship_code: null, education_level: null, passport_series: null, passport_number: null })),
    enrollment_rows: args.p_user_ids.map(user_id => ({ user_id, course_id: course, status: "completed", progress: 100, completed_at: "2026-11-20T00:00:00Z" })),
    enrollment_error: false,
  };
}
function deferredClient() {
  let active = 0; let maximum = 0;
  const calls: Array<{ args: Args; finish: (reply: Reply) => void }> = [];
  const client = { rpc: vi.fn((_name: string, args: Args) => {
    active += 1; maximum = Math.max(maximum, active);
    return new Promise<Reply>(resolve => calls.push({ args, finish: resolve })).finally(() => { active -= 1; });
  }) };
  const success = (index: number) => calls[index].finish({ data: body(calls[index].args), error: null });
  return { client, calls, success, max: () => maximum };
}
const missing = { code: "PGRST202", message: "Could not find the function public.get_group_participant_metadata_batch(p_group_id, p_linked_course_id, p_organization_id, p_user_ids) in the schema cache" };
const tick = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };

describe("bounded all-or-nothing group participant metadata batches", () => {
  it("probes once, merges all1302subjects, never exceeds100IDs/request or4activeRPCs, and waits for the final batch", async () => {
    const f = deferredClient(); const ids = users(1302); let settled = false;
    const read = readGroupParticipantMetadata(f.client, org, group, ids, course).finally(() => { settled = true; });
    await tick(); expect(f.calls).toHaveLength(1); expect(f.calls[0].args.p_user_ids).toHaveLength(100);
    f.success(0);
    await vi.waitFor(() => expect(f.calls).toHaveLength(5));
    expect(f.max()).toBe(4);
    for (let index = 1; index < 14; index += 1) {
      await vi.waitFor(() => expect(f.calls[index]).toBeDefined());
      if (index === 13) expect(settled).toBe(false);
      f.success(index);
    }
    const result = await read;
    expect(f.calls.map(call => call.args.p_user_ids.length)).toEqual([...Array(13).fill(100), 2]);
    expect(f.calls.every(call => call.args.p_organization_id === org && call.args.p_group_id === group && call.args.p_linked_course_id === course)).toBe(true);
    expect(f.calls.flatMap(call => call.args.p_user_ids)).toEqual(ids);
    expect(f.max()).toBe(4);
    expect(result?.user_ids).toEqual([...ids].sort());
    for (const key of ["identity_rows", "contract_rows", "attempt_rows", "frdo_rows", "enrollment_rows"] as const) expect(result?.[key]).toHaveLength(1302);
    expect(result?.attempt_rows.at(-1)?.user_id).toBe(ids.at(-1));
  });
  it("returns one explicit missing-RPC signal before starting any fanout", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: missing });
    expect(await readGroupParticipantMetadata({ rpc }, org, group, users(1302), null)).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["42501", "57014", "42883"])("never treats a %s probe failure as missing rollout", async code => {
    const error = { code, message: missing.message }; const rpc = vi.fn().mockResolvedValue({ data: null, error });
    await expect(readGroupParticipantMetadata({ rpc }, org, group, users(1302), null)).rejects.toBe(error);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("stops queued work on a later timeout and discards every successful partial batch", async () => {
    const f = deferredClient(); const error = { code: "57014", message: "timeout" };
    const result = readGroupParticipantMetadata(f.client, org, group, users(1302), course).then(value => ({ value }), failure => ({ failure }));
    f.success(0); await vi.waitFor(() => expect(f.calls).toHaveLength(5));
    f.calls[1].finish({ data: null, error }); await tick();
    for (let index = 2; index < 5; index += 1) f.success(index);
    expect(await result).toEqual({ failure: error });
    expect(f.calls).toHaveLength(5);
  });
  it.each(["foreign-org", "foreign-group", "foreign-subject", "omitted-subject", "extra-secret"])("rejects %s in a later batch without partial success", async kind => {
    let count = 0;
    const rpc = vi.fn(async (_name: string, args: Args) => {
      const data: any = body(args); count += 1;
      if (count === 2) {
        if (kind === "foreign-org") data.organization_id = other;
        if (kind === "foreign-group") data.group_id = other;
        if (kind === "foreign-subject") data.attempt_rows[0].user_id = other;
        if (kind === "omitted-subject") data.user_ids = [];
        if (kind === "extra-secret") data.frdo_rows[0].secret = "private";
      }
      return { data, error: null };
    });
    await expect(readGroupParticipantMetadata({ rpc }, org, group, users(101), course)).rejects.toMatchObject({ code: "GROUP_METADATA_INVALID" });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it.each(["contract_rows", "attempt_rows"] as const)("rejects duplicate %s primary keys across otherwise valid disjoint batches", async key => {
    const duplicateId = users(1)[0];
    const rpc = vi.fn(async (_name: string, args: Args) => {
      const data = body(args); data[key][0].id = duplicateId;
      return { data, error: null };
    });
    await expect(readGroupParticipantMetadata({ rpc }, org, group, users(101), course)).rejects.toMatchObject({ code: "GROUP_METADATA_INVALID" });
  });
  it("turns one linked-course unknown into unknown for the entire enrollment chain, preserving other complete rows", async () => {
    let count = 0;
    const rpc = vi.fn(async (_name: string, args: Args) => {
      const data = body(args); count += 1;
      if (count === 2) { data.enrollment_error = true; data.enrollment_rows = null; }
      return { data, error: null };
    });
    const result = await readGroupParticipantMetadata({ rpc }, org, group, users(201), course);
    expect(result?.enrollment_error).toBe(true); expect(result?.enrollment_rows).toBeNull();
    expect(result?.attempt_rows).toHaveLength(201); expect(result?.frdo_rows).toHaveLength(201);
  });
  it("does not allow unknown all-course inference to become a successful aggregate", async () => {
    const rpc = vi.fn(async (_name: string, args: Args) => ({ data: { ...body(args), enrollment_error: true, enrollment_rows: null }, error: null }));
    await expect(readGroupParticipantMetadata({ rpc }, org, group, users(101), null)).rejects.toMatchObject({ code: "GROUP_METADATA_INVALID" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("gives concurrent hard denial priority over an exact missing-RPC response", async () => {
    const f = deferredClient(); const denied = { code: "42501", message: "not allowed" };
    const result = readGroupParticipantMetadata(f.client, org, group, users(501), course).then(value => ({ value }), failure => ({ failure }));
    f.success(0); await vi.waitFor(() => expect(f.calls).toHaveLength(5));
    f.calls[1].finish({ data: null, error: missing });
    f.calls[2].finish({ data: null, error: denied });
    await tick(); f.success(3); f.success(4);
    expect(await result).toEqual({ failure: denied }); expect(f.calls).toHaveLength(5);
  });
  it("fails closed without fallback if the batch endpoint disappears after the successful probe", async () => {
    let count = 0;
    const rpc = vi.fn(async (_name: string, args: Args) => ++count === 1 ? { data: body(args), error: null } : { data: null, error: missing });
    await expect(readGroupParticipantMetadata({ rpc }, org, group, users(101), course)).rejects.toBe(missing);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("does not mistake the quarantined old endpoint for absence of the new batch endpoint", async () => {
    const oldMissing = { ...missing, message: missing.message.replace("get_group_participant_metadata_batch", "get_group_participant_metadata") };
    const rpc = vi.fn().mockResolvedValue({ data: null, error: oldMissing });
    await expect(readGroupParticipantMetadata({ rpc }, org, group, users(101), course)).rejects.toBe(oldMissing);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_group_participant_metadata_batch", expect.objectContaining({ p_user_ids: users(100) }));
  });
  it("starts no request after its caller scope was already cancelled", async () => {
    const f = deferredClient();
    await expect(readGroupParticipantMetadata(f.client, org, group, users(101), course, { isCurrent: () => false })).rejects.toMatchObject({ code: "GROUP_METADATA_CANCELLED" });
    expect(f.calls).toEqual([]);
  });
  it("cancels after the probe without starting the worker queue", async () => {
    let current = true; const f = deferredClient();
    const read = readGroupParticipantMetadata(f.client, org, group, users(501), course, { isCurrent: () => current });
    current = false; f.success(0);
    await expect(read).rejects.toMatchObject({ code: "GROUP_METADATA_CANCELLED" });
    expect(f.calls).toHaveLength(1);
  });
  it("cancels an active queue without starting remaining batches or returning stale data", async () => {
    let current = true; const f = deferredClient();
    const read = readGroupParticipantMetadata(f.client, org, group, users(1302), course, { isCurrent: () => current });
    f.success(0); await vi.waitFor(() => expect(f.calls).toHaveLength(5));
    current = false;
    for (let index = 1; index < 5; index += 1) f.success(index);
    await expect(read).rejects.toMatchObject({ code: "GROUP_METADATA_CANCELLED" });
    expect(f.calls).toHaveLength(5);
  });
  it("rejects duplicate requested IDs before creating overlapping batches", async () => {
    const f = deferredClient(); const ids = users(101); ids.push(ids[0]);
    await expect(readGroupParticipantMetadata(f.client, org, group, ids, course)).rejects.toMatchObject({ code: "GROUP_METADATA_INVALID" });
    expect(f.calls).toEqual([]);
  });
});
