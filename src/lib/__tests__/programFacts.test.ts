import { describe, expect, it } from "vitest";
import { emptyProgramFacts, parseProgramEnvelope, parseProgramList, parseCourseBinding, parseGroupProgramFacts, programFactsSchema, programFactsReady } from "../programFacts";
import { programFixture, courseBindingFixture, groupFactsFixture, pfId, pfOrg, pfProgram, pfCourse, pfGroup, pfEnrollment } from "./programFacts.fixture";

describe("approved programme facts and exact learning association", () => {
  it("keeps unknown facts unknown, including both technology declarations", () => {
    const f = programFactsSchema.parse(emptyProgramFacts());
    expect(f.academic_hours).toBeNull(); expect(f.uses_elearning).toBeNull(); expect(f.uses_distance_learning).toBeNull(); expect(programFactsReady(f)).toBe(false);
  });
  it.each(["72 hours", 0, -1, 1.5, true, 1000000])("rejects invented or malformed academic hours %s", hours => {
    expect(programFactsSchema.safeParse({ ...emptyProgramFacts(), academic_hours: hours }).success).toBe(false);
  });
  it("does not interpret the string false as a declaration", () => {
    expect(programFactsSchema.safeParse({ ...emptyProgramFacts(), uses_elearning: "false" }).success).toBe(false);
  });
  it("accepts exact approved facts with independent file and facts decisions", () => {
    const p = parseProgramEnvelope(programFixture(), pfOrg, pfProgram);
    expect(p.current_version!.file_approval.number).toBe("QA-1"); expect(p.current_version!.approved_by).toBe(p.current_version!.reviewer_user_id);
  });
  it("file approval alone does not approve incomplete facts", () => {
    const p = programFixture(); p.current_version!.facts = emptyProgramFacts();
    expect(() => parseProgramEnvelope(p, pfOrg)).toThrow();
  });
  it("requires the named facts reviewer for the approval record", () => {
    const p = programFixture(); p.current_version!.approved_by = pfId(99);
    expect(() => parseProgramEnvelope(p, pfOrg)).toThrow();
  });
  it("rejects foreign organization history even if the displayed current version is local", () => {
    const p = programFixture(); p.versions = [{ ...p.versions[0], organization_id: pfId(99) }];
    expect(() => parseProgramEnvelope(p, pfOrg)).toThrow();
  });
  it("requires the displayed current version to exist in that programme history", () => {
    const p = programFixture(); p.current_version = { ...p.current_version!, id: pfId(99) };
    expect(() => parseProgramEnvelope(p, pfOrg)).toThrow();
  });
  it("rejects duplicate programme identities and duplicate version history", () => {
    const p = programFixture(); expect(() => parseProgramList([p, p], pfOrg)).toThrow();
    p.versions.push(p.versions[0]); expect(() => parseProgramEnvelope(p, pfOrg)).toThrow();
  });
  it("requires course binding and version to agree, including tenant", () => {
    const c = courseBindingFixture(); expect(parseCourseBinding(c, pfOrg, pfCourse).version!.facts.academic_hours).toBe(72);
    c.version = { ...c.version!, organization_id: pfId(99) }; expect(() => parseCourseBinding(c, pfOrg, pfCourse)).toThrow();
  });
  it("does not turn an empty course binding into a confirmed programme", () => {
    expect(parseCourseBinding({ revision: 0, binding: null, version: null }, pfOrg, pfCourse).binding).toBeNull();
    expect(() => parseCourseBinding({ revision: 0, binding: null, version: programFixture().current_version }, pfOrg, pfCourse)).toThrow();
  });
  it("accepts an explicit current association without inventing a legal enrollment date", () => {
    const g = parseGroupProgramFacts(groupFactsFixture(), pfOrg, pfGroup, pfEnrollment);
    expect(g.snapshot!.source).toBe("confirmed_existing_association"); expect(g.snapshot!.legal_enrollment_date).toBeNull();
  });
  it.each(["group_id", "enrollment_id", "course_id", "organization_id", "binding_id", "version_id"] as const)("rejects snapshot with a different %s", field => {
    const g = groupFactsFixture(); g.snapshot = { ...g.snapshot!, [field]: pfId(99) };
    expect(() => parseGroupProgramFacts(g, pfOrg, pfGroup, pfEnrollment)).toThrow();
  });
  it("never borrows another learner's snapshot from the same course", () => {
    const g = groupFactsFixture(); g.snapshot!.user_id = pfId(99);
    expect(() => parseGroupProgramFacts(g, pfOrg, pfGroup, pfEnrollment)).toThrow();
  });
  it("rejects mismatch between frozen group and enrollment programme facts", () => {
    const g = groupFactsFixture(); g.snapshot = { ...g.snapshot!, program_snapshot: { ...g.snapshot!.program_snapshot, facts_hash: "d".repeat(64) } };
    expect(() => parseGroupProgramFacts(g, pfOrg, pfGroup, pfEnrollment)).toThrow();
  });
  it("does not label missing association proof confirmed", () => {
    const g = groupFactsFixture(); g.snapshot = null; expect(() => parseGroupProgramFacts(g, pfOrg, pfGroup, pfEnrollment)).toThrow();
    g.state = "unconfirmed"; g.reason = "Association not confirmed";
    expect(parseGroupProgramFacts(g, pfOrg, pfGroup, pfEnrollment).state).toBe("unconfirmed");
  });
  it("rejects a made-up historical legal enrollment date", () => {
    const g = groupFactsFixture(); (g.snapshot as any).legal_enrollment_date = "2026-10-18";
    expect(() => parseGroupProgramFacts(g, pfOrg, pfGroup, pfEnrollment)).toThrow();
  });
});
