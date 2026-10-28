import { describe, expect, it, vi } from "vitest";
import { createCourseFileModeGateway, parseCourseFileMode, isEmbeddedCourseMedia, safeCourseInlineHtml, isLegacyCourseMediaAllowed } from "../courseFileConsumer";
const id = (n: number) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const selection = { actorId: id(1), organizationId: id(2), courseId: id(3), accessMode: "learner" as const };
const legacy = () => ({ schema_version: 1, actor_id: id(1), organization_id: id(2), course_id: id(3), access_mode: "learner", mode: "legacy", state: "legacy", cohort: null });
const marker = () => ({ schema_version: 1, copy_generation_id: id(4), publication_id: id(5), publication_manifest_sha256: "a".repeat(64), source_course_id: id(6), reference_count: 0, reference_vector_sha256: "b".repeat(64) });
describe("authoritative course mode protocol", () => {
  it("accepts exact legacy and preserves explicit zero-reference or unconfirmed frozen cohorts", () => {
    expect(parseCourseFileMode(legacy(), selection).mode).toBe("legacy");
    const value = parseCourseFileMode({ ...legacy(), mode: "frozen_required", state: "held", cohort: marker() }, selection);
    expect(value.mode === "frozen_required" && value.cohort?.reference_count).toBe(0); expect(Object.isFrozen(value)).toBe(true);
    expect(parseCourseFileMode({ ...legacy(), mode: "frozen_required", state: "held" }, selection).mode).toBe("frozen_required");
  });
  it.each([{ actor_id: id(11) }, { organization_id: id(12) }, { course_id: id(13) }, { access_mode: "staff_preview" }, { extra: "url" }, { mode: "unknown" }, { state: "held" }, { cohort: marker() }])("rejects mismatched or malformed legacy tuple %j", change => {
    expect(() => parseCourseFileMode({ ...legacy(), ...change }, selection)).toThrow();
  });
  it.each([{ reference_count: -1 }, { reference_count: 0.5 }, { source_course_id: id(3) }, { publication_manifest_sha256: "A".repeat(64) }, { extra: true }])("rejects malformed cohort %j", change => {
    expect(() => parseCourseFileMode({ ...legacy(), mode: "frozen_required", state: "held", cohort: { ...marker(), ...change } }, selection)).toThrow();
  });
  it("discovers only a server-validated organization while preserving exact actor/course/access checks", () => {
    const discovery = { ...selection, organizationId: null };
    expect(parseCourseFileMode(legacy(), discovery).organization_id).toBe(selection.organizationId);
    for (const change of [{ organization_id: null }, { organization_id: "profile-org" }, { actor_id: id(8) }, { course_id: id(8) }, { access_mode: "staff_preview" }]) expect(() => parseCourseFileMode({ ...legacy(), ...change }, discovery)).toThrow();
    expect(() => parseCourseFileMode(legacy(), { ...selection, organizationId: id(99) })).toThrow();
  });
  it("never turns missing RPC or cancelled late answer into legacy", async () => {
    const read = vi.fn().mockResolvedValue({ data: legacy(), error: { code: "PGRST202" } });
    await expect(createCourseFileModeGateway({ read })(selection, new AbortController().signal)).rejects.toThrow();
    let resolve!: (value: any) => void; const promise = new Promise<any>(yes => { resolve = yes; });
    const abort = new AbortController(); const pending = createCourseFileModeGateway({ read: () => promise })(selection, abort.signal);
    abort.abort(); resolve({ data: legacy(), error: null }); await expect(pending).rejects.toBeDefined();
  });
  it.each(['[{"type":"document","documentUrl":"urn:bound"}]', '[{"type":"video","videoUrl":"/relative"}]', '[{"type":"audio","audioUrl":"/relative"}]', '[{"type":"button","buttonUrl":"/relative"}]', '[{"type":"slider","sliderSlides":[{"imageUrl":"urn:bound"}]}]'])("detects resource keys without assuming a public URL: %s", content => {
    expect(isEmbeddedCourseMedia("text", content)).toBe(true);
  });
  it("strips loads/links while keeping semantic text and table numbers", () => {
    const safe = safeCourseInlineHtml('<h2>Тема</h2><table><tr><td colspan="2">42</td></tr></table><a href="/raw">источник</a><img src="urn:bound"><span style="background:url(/raw)">текст</span><svg><use href="/x"></use></svg>');
    expect(safe).toContain("42"); expect(safe).toContain("<table>"); expect(safe).toContain('colspan="2"');
    expect(safe).not.toMatch(/href=|src=|style=|<img|<svg|<a\b/i);
    expect(isLegacyCourseMediaAllowed({ state: "held" })).toBe(false); expect(isLegacyCourseMediaAllowed(undefined)).toBe(false);
  });
});
