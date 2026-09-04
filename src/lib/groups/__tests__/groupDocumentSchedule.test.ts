import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import {
  compactGroupDocumentScheduleSlots, expandGroupDocumentScheduleSlots, fetchGroupDocumentSchedule,
  GroupDocumentScheduleError, parseGroupDocumentScheduleSlots, saveGroupDocumentSchedule,
  type GroupDocumentScheduleClient, type GroupDocumentScheduleContext, type GroupDocumentScheduleSlot,
} from "@/lib/groups/groupDocumentSchedule";

const scope = { organizationId: "org-1", groupId: "group-1" };
const group = { id: "group-1", organization_id: "org-1", course_id: "course-1", start_date: "2026-09-01", end_date: "2026-09-30" };
const slot: GroupDocumentScheduleSlot = { slot: 1, date: "2026-09-04", time_from: "09:00", time_to: "10:00", topic: " Точная тема " };
const row = { group_id: "group-1", organization_id: "org-1", course_id: "course-1", slots: [slot], revision: 1, updated_at: "2026-09-04T02:00:00Z", updated_by: "operator-1" };
const context: GroupDocumentScheduleContext = { group, schedule: null };

function clientFixture() {
  const reads: Array<{ table: string; filters: Array<[string, string]> }> = [];
  const groups = vi.fn().mockResolvedValue({ data: group, error: null });
  const schedules = vi.fn().mockResolvedValue({ data: row, error: null });
  const rpc = vi.fn().mockResolvedValue({ data: row, error: null });
  const client: GroupDocumentScheduleClient = {
    from(table) {
      const filters: Array<[string, string]> = [];
      const query = { select: () => query, eq: (key: string, value: string) => { filters.push([key, value]); return query; },
        maybeSingle: () => { reads.push({ table, filters }); return table === "student_groups" ? groups() : schedules(); } };
      return query;
    }, rpc,
  };
  return { client, reads, groups, schedules, rpc };
}

describe("group document schedule contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads both sources using organization and group scopes, without falling back to parent settings", async () => {
    const { client, reads } = clientFixture();
    expect(await fetchGroupDocumentSchedule(scope, client)).toEqual({ group, schedule: row });
    expect(reads).toEqual([
      { table: "student_groups", filters: [["organization_id", "org-1"], ["id", "group-1"]] },
      { table: "group_document_schedules", filters: [["organization_id", "org-1"], ["group_id", "group-1"]] },
    ]);
  });

  it("distinguishes no schedule from an unavailable table", async () => {
    const f = clientFixture();
    f.schedules.mockResolvedValueOnce({ data: null, error: null });
    expect((await fetchGroupDocumentSchedule(scope, f.client)).schedule).toBeNull();
    f.schedules.mockResolvedValueOnce({ data: null, error: { code: "42P01" } });
    await expect(fetchGroupDocumentSchedule(scope, f.client)).rejects.toThrow("обновление базы не установлено");
  });

  it.each(["group", "organization"])("rejects foreign %s rows without exposing their data", async target => {
    const f = clientFixture();
    f.schedules.mockResolvedValueOnce({ data: { ...row, [target === "group" ? "group_id" : "organization_id"]: "foreign" }, error: null });
    await expect(fetchGroupDocumentSchedule(scope, f.client)).rejects.toThrow("неподтверждённые данные");
    f.groups.mockResolvedValueOnce({ data: { ...group, [target === "group" ? "id" : "organization_id"]: "foreign" }, error: null });
    await expect(fetchGroupDocumentSchedule(scope, f.client)).rejects.toThrow("этой группы");
  });

  it("supports four fixed blocks, exact topics, partial drafts and [] clearing", () => {
    const expanded = expandGroupDocumentScheduleSlots([slot]);
    expect(expanded.map(item => item.slot)).toEqual([1, 2, 3, 4]);
    expect(compactGroupDocumentScheduleSlots(expanded)).toEqual([slot]);
    expect(compactGroupDocumentScheduleSlots(expandGroupDocumentScheduleSlots([]))).toEqual([]);
    expect(parseGroupDocumentScheduleSlots([{ ...slot, date: "", time_to: "" }])[0].topic).toBe(" Точная тема ");
    expect(parseGroupDocumentScheduleSlots([{ ...slot, topic: "😀".repeat(2000) }])).toHaveLength(1);
    expect(parseGroupDocumentScheduleSlots([{ ...slot, topic: "Русский\t & <текст>\r\n😀" }])[0].topic).toBe("Русский\t & <текст>\r\n😀");
  });

  it.each([0, 1, 8, 11, 12, 14, 31, 0xd800, 0xdfff, 0xfffe, 0xffff])("rejects XML 1.0-invalid topic code point %i without stripping it", code => {
    const topic = `Тема${String.fromCharCode(code)}`;
    const entry = { ...slot, topic };
    expect(() => parseGroupDocumentScheduleSlots([entry])).toThrow("Блок 1: тема содержит недопустимый для XML символ");
    expect(entry.topic).toBe(topic);
  });

  it.each([
    [{ ...slot, slot: 5 }], [slot, slot], [slot, slot, slot, slot, slot],
    [{ ...slot, date: "2026-02-30" }], [{ ...slot, time_from: "24:00" }],
    [{ ...slot, time_to: "08:59" }], [{ ...slot, time_to: "09:00" }],
    [{ ...slot, topic: "a".repeat(2001) }], [{ ...slot, topic: null }], [{ ...slot, teacher: "Invented" }],
  ])("rejects malformed blocks %#", (...entries) => { expect(() => parseGroupDocumentScheduleSlots(entries)).toThrow(GroupDocumentScheduleError); });

  it("saves once with CAS and confirms the exact row and saved current course", async () => {
    const f = clientFixture();
    const saved = await saveGroupDocumentSchedule({ ...scope, context, slots: expandGroupDocumentScheduleSlots([slot]) }, f.client);
    expect(saved.schedule).toEqual(row);
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.rpc).toHaveBeenCalledWith("save_group_document_schedule", {
      p_organization_id: "org-1", p_group_id: "group-1", p_expected_course_id: "course-1", p_expected_revision: null, p_slots: [slot],
    });
    expect(f.reads).toHaveLength(2);
  });

  it("clears existing slots with the loaded revision, without deleting or changing the group", async () => {
    const f = clientFixture();
    const cleared = { ...row, revision: 2, slots: [] };
    f.rpc.mockResolvedValue({ data: cleared, error: null });
    f.schedules.mockResolvedValue({ data: cleared, error: null });
    await saveGroupDocumentSchedule({ ...scope, context: { group, schedule: row }, slots: expandGroupDocumentScheduleSlots([]) }, f.client);
    expect(f.rpc).toHaveBeenCalledWith("save_group_document_schedule", expect.objectContaining({ p_expected_revision: 1, p_slots: [] }));
  });

  it("does not silently adopt a schedule saved for a different course", async () => {
    const f = clientFixture();
    const old = { ...row, course_id: "old-course" };
    await expect(saveGroupDocumentSchedule({ ...scope, context: { group, schedule: old }, slots: [slot] }, f.client)).rejects.toThrow("Курс группы изменился");
    expect(f.rpc).not.toHaveBeenCalled();
    f.rpc.mockResolvedValue({ data: { ...row, revision: 2 }, error: null });
    f.schedules.mockResolvedValue({ data: { ...row, revision: 2 }, error: null });
    await saveGroupDocumentSchedule({ ...scope, context: { group, schedule: old }, slots: [slot], reviewedCourseChange: true }, f.client);
    expect(f.rpc).toHaveBeenCalledWith("save_group_document_schedule", expect.objectContaining({ p_expected_course_id: "course-1", p_expected_revision: 1 }));
  });

  it("rejects a date outside the saved group period before mutation", async () => {
    const f = clientFixture();
    await expect(saveGroupDocumentSchedule({ ...scope, context, slots: [{ ...slot, date: "2026-10-01" }] }, f.client)).rejects.toThrow("сохранённый период группы");
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it.each(["returned", "thrown", "conflict"])("never retries %s write errors and requires reload", async kind => {
    const f = clientFixture();
    if (kind === "thrown") f.rpc.mockRejectedValue(new TypeError("Failed to fetch"));
    else f.rpc.mockResolvedValue({ data: null, error: kind === "conflict" ? { code: "40001", message: "schedule_revision_conflict" } : { message: "Failed to fetch" } });
    await expect(saveGroupDocumentSchedule({ ...scope, context, slots: [slot] }, f.client)).rejects.toMatchObject({ requiresReload: true });
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    { organization_id: "foreign" }, { group_id: "foreign" }, { course_id: "old-course" }, { revision: 9 },
    { slots: [{ ...slot, topic: "other" }] },
  ])("rejects a mismatched RPC response %#", async patch => {
    const f = clientFixture();
    f.rpc.mockResolvedValue({ data: { ...row, ...patch }, error: null });
    await expect(saveGroupDocumentSchedule({ ...scope, context, slots: [slot] }, f.client)).rejects.toMatchObject({ requiresReload: true });
  });

  it.each(["course", "slots", "revision", "unavailable"])("does not report success when read-back %s differs", async kind => {
    const f = clientFixture();
    if (kind === "course") f.groups.mockResolvedValue({ data: { ...group, course_id: "changed-course" }, error: null });
    else if (kind === "unavailable") f.schedules.mockRejectedValue(new TypeError("Failed to fetch"));
    else f.schedules.mockResolvedValue({ data: { ...row, ...(kind === "slots" ? { slots: [] } : { revision: 2 }) }, error: null });
    await expect(saveGroupDocumentSchedule({ ...scope, context, slots: [slot] }, f.client)).rejects.toMatchObject({ requiresReload: true });
  });
});
