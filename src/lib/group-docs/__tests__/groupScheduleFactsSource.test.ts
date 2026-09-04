import { describe, expect, it, vi } from "vitest";
import { GROUP_SCHEDULE_FACTS_SELECT, loadGroupScheduleFacts, type GroupScheduleFactsReader } from "../../../../supabase/functions/_shared/docx-ooxml/groupScheduleFactsSource";
import type { GroupScheduleFactRow } from "../../../../supabase/functions/_shared/docx-ooxml/groupScheduleFacts";

const scope = { organizationId: "org", groupId: "group" };
const row = (): GroupScheduleFactRow => ({ group_id: "group", organization_id: "org", course_id: "course", slots: [], revision: 1, updated_by: "editor", updated_at: "2026-09-01T00:00:00Z" });
const reader = (): GroupScheduleFactsReader => ({ schedule: vi.fn<GroupScheduleFactsReader["schedule"]>().mockResolvedValue({ data: row(), error: null }) });

describe("caller-RLS group schedule source", () => {
  it("asks once for the exact tenant/group and retains all required source columns", async () => {
    const r = reader();
    const result = await loadGroupScheduleFacts(scope, r);
    expect(r.schedule).toHaveBeenCalledExactlyOnceWith(scope);
    expect(result).toEqual({ schedule: row(), sourceIssues: [] });
    expect(GROUP_SCHEDULE_FACTS_SELECT.split(", ").sort()).toEqual(Object.keys(row()).sort());
  });
  it("does not expand access or retry when maybeSingle finds no row or RLS hides it", async () => {
    const r = reader(); vi.mocked(r.schedule).mockResolvedValue({ data: null, error: null });
    expect(await loadGroupScheduleFacts(scope, r)).toEqual({ schedule: null, sourceIssues: [] });
    expect(r.schedule).toHaveBeenCalledTimes(1);
  });
  it.each(["returned-error", "thrown", "duplicate-row-error"])("fails only this source for %s without partial data or raw errors", async (kind) => {
    const r = reader();
    vi.mocked(r.schedule).mockImplementation(async () => {
      if (kind === "thrown") throw new Error("PRIVATE_DETAILS");
      return { data: row(), error: { code: kind === "duplicate-row-error" ? "PGRST116" : "57014", message: "PRIVATE_DETAILS" } };
    });
    const result = await loadGroupScheduleFacts(scope, r);
    expect(result.schedule).toBeNull();
    expect(result.sourceIssues).toEqual([expect.objectContaining({ source: "group_document_schedules", code: "read_failed", severity: "warning" })]);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_DETAILS");
    expect(r.schedule).toHaveBeenCalledTimes(1);
  });
  it.each([{ organization_id: "foreign" }, { group_id: "foreign" }])("rejects returned scope mismatch %j", async change => {
    const r = reader(); vi.mocked(r.schedule).mockResolvedValue({ data: { ...row(), ...change }, error: null });
    const result = await loadGroupScheduleFacts(scope, r);
    expect(result.schedule).toBeNull(); expect(result.sourceIssues[0].code).toBe("scope_mismatch");
  });
  it.each([undefined, [], "unexpected"])("rejects malformed maybeSingle data %j", async data => {
    const r = reader(); vi.mocked(r.schedule).mockResolvedValue({ data: data as unknown as GroupScheduleFactRow, error: null });
    const result = await loadGroupScheduleFacts(scope, r);
    expect(result.schedule).toBeNull(); expect(result.sourceIssues[0].code).toBe("malformed_response");
  });
  it.each([{ organizationId: "", groupId: "group" }, { organizationId: "org", groupId: "" }])("does not query an incomplete scope %j", async input => {
    const r = reader(); const result = await loadGroupScheduleFacts(input, r);
    expect(r.schedule).not.toHaveBeenCalled(); expect(result.schedule).toBeNull();
    expect(result.sourceIssues[0].code).toBe("scope_mismatch");
  });
  it("never returns a previous successful row after a later source failure", async () => {
    const r = reader(); expect((await loadGroupScheduleFacts(scope, r)).schedule).toEqual(row());
    vi.mocked(r.schedule).mockResolvedValue({ data: null, error: "network failure" });
    expect((await loadGroupScheduleFacts(scope, r)).schedule).toBeNull();
    expect(r.schedule).toHaveBeenCalledTimes(2);
  });
});
