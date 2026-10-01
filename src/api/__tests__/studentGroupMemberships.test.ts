import { describe, expect, it, vi } from "vitest";
import { addStudentsToGroups, fetchEffectiveGroupProfiles } from "@/api/studentGroupMemberships";

describe("student group persistence", () => {
  it("deduplicates selected users/groups and confirms the complete cross product", async () => {
    const rows = ["g1", "g2"].flatMap(group_id => ["u1", "u2"].map(user_id => ({ organization_id: "org", group_id, user_id })));
    const client = { rpc: vi.fn().mockResolvedValue({ data: rows, error: null }) };
    expect(await addStudentsToGroups(client, "org", ["u1", "u1", "u2"], ["g1", "g2", "g2"])).toEqual(rows);
    expect(client.rpc).toHaveBeenCalledWith("add_students_to_groups", { p_organization_id: "org", p_user_ids: ["u1", "u2"], p_group_ids: ["g1", "g2"] });
  });

  it("fails closed for a partial, foreign or duplicate response", async () => {
    for (const rows of [[],
      [{ organization_id: "other", group_id: "g1", user_id: "u1" }],
      [{ organization_id: "org", group_id: "g1", user_id: "u1" }, { organization_id: "org", group_id: "g1", user_id: "u1" }],
    ]) {
      const client = { rpc: vi.fn().mockResolvedValue({ data: rows, error: null }) };
      await expect(addStudentsToGroups(client, "org", ["u1"], ["g1", "g2"])).rejects.toThrow("не подтвердила");
    }
  });

  it("loads additional group profiles beyond the first 1000 with tenant and archive scope", async () => {
    const profiles = Array.from({ length: 1001 }, (_, index) => ({ user_id: `u${index}`, student_group_id: "original" }));
    const scopes: unknown[][] = [];
    const client = { from: vi.fn(table => {
      const query: any = {
        select: vi.fn(() => query), eq: vi.fn((...args) => { scopes.push(args); return query; }),
        is: vi.fn((...args) => { scopes.push(args); return query; }), order: vi.fn(() => query),
        range: vi.fn((start, end) => Promise.resolve({ data: profiles.slice(start, end + 1), error: null })),
      };
      return query;
    }) };
    const result = await fetchEffectiveGroupProfiles<{ user_id: string; student_group_id: string }>(client, "org", "additional", { activeOnly: true, select: "user_id, student_group_id" });
    expect(result).toHaveLength(1001);
    expect(result.every(row => row.student_group_id === "original")).toBe(true);
    expect(client.from).toHaveBeenCalledTimes(2);
    expect(client.from).toHaveBeenCalledWith("student_group_profiles_effective");
    expect(scopes).toEqual(expect.arrayContaining([["organization_id", "org"], ["group_id", "additional"], ["archived_at", null]]));
  });
});
