import { describe, expect, it } from "vitest";
import { groupProgramPresentation } from "./groupProgramPresentation";
import { groupEnvelope, ids } from "./programFacts.fixtures";

describe("Pinned programme presentation", () => {
  it("retains the approved group fields but blocks generation until an existing learner is confirmed", () => {
    const result = groupProgramPresentation(groupEnvelope(), ids.org, ids.group, [ids.learner]);
    expect(result.projection?.fields).toEqual({ program_title: "Подтверждённая программа", program_hours: 72, program_form: "Заочная" });
    expect(result.error).toMatch(/участников/);
  });
  it("confirms generation from the exact snapshot without any current course duration input", () => {
    const data = groupEnvelope(); data.enrollments[0] = { ...data.enrollments[0], state: "confirmed", snapshot_id: ids.snapshot };
    const result = groupProgramPresentation(data, ids.org, ids.group, [ids.learner]);
    expect(result.error).toBeNull(); expect(result.projection?.fields?.program_hours).toBe(72);
  });
  it("preserves the explicit legacy unconfirmed state without manufacturing programme facts", () => {
    const data = { ...groupEnvelope(), binding: null, state: "unconfirmed", reason: "no_group_binding", revision: 0 };
    const result = groupProgramPresentation(data, ids.org, ids.group, [ids.learner]);
    expect(result.error).toBeNull(); expect(result.projection?.state).toBe("unconfirmed"); expect(result.projection?.fields).toBeNull();
  });
  it("does not display facts from another tenant or a mutable/unapproved version", () => {
    const data = groupEnvelope(); data.binding!.program_snapshot.state = "draft";
    expect(groupProgramPresentation(data, ids.org, ids.group, []).projection).toBeNull();
    expect(groupProgramPresentation(groupEnvelope(), ids.actor, ids.group, []).projection).toBeNull();
  });
});
