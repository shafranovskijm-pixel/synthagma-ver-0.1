import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { offlineMemoryStorage } from "@/test/offlineMemoryStorage";
import { cacheCourseData, getCachedCourseData, setOfflineAuthActor, captureOfflineActor, rememberOfflineScope, mayUseOfflineFallback } from "../courseCache";
let storage: ReturnType<typeof offlineMemoryStorage>;
const own = () => rememberOfflineScope({ actorId: "actor", effectiveUserId: "actor", organizationId: "org", mode: "learner" }, "course", captureOfflineActor("actor"))!;
const legacy = { title: "Course", _fileDeliveryMode: "legacy", _fileDeliveryAuthority: 1 };
beforeEach(() => { storage = offlineMemoryStorage(); vi.stubGlobal("indexedDB", storage.factory); setOfflineAuthActor(null); setOfflineAuthActor("actor"); });
afterEach(() => { vi.unstubAllGlobals(); setOfflineAuthActor(null); });
describe("frozen delivery is never an offline file fallback", () => {
  it("accepts classified legacy metadata but stores no frozen/unknown/opaque/blob snapshot", async () => {
    const scope = own(); await cacheCourseData(scope, "course", { title: "unknown" }, [], [], {}); expect(await getCachedCourseData(scope, "course")).toBeNull();
    await cacheCourseData(scope, "course", { ...legacy, _fileDeliveryMode: "frozen_required" }, [], [], {}); expect(await getCachedCourseData(scope, "course")).toBeNull();
    for (const file_url of ["urn:sintagma:course-file-binding:id", "blob:verified", "data:application/pdf;base64,AA=="]) { await cacheCourseData(scope, "course", { ...legacy }, [], [], { lesson: [{ file_url }] }); expect(await getCachedCourseData(scope, "course")).toBeNull(); }
    await cacheCourseData(scope, "course", { ...legacy }, [], [], {}, [{ id: "doc", file_url: "https://ordinary.example/file.pdf" }]); expect((await getCachedCourseData(scope, "course"))?.courseDocuments?.[0].id).toBe("doc");
  });
  it("quarantines earlier scoped metadata without classifying it legacy and preserves stored old bytes", async () => {
    const scope = own(); await cacheCourseData(scope, "course", { ...legacy }, [], [], {}); const rows = storage.rows("sigma-course-cache", "courses_scoped_v2"); const row = [...rows.values()][0]; delete row.course._fileDeliveryAuthority;
    expect(await getCachedCourseData(scope, "course")).toBeNull(); expect(rows.size).toBe(1);
  });
  it("never interprets an exact-file denial with network wording as an offline permission", () => {
    expect(mayUseOfflineFallback({ code: "COURSE_EXACT_FILE_UNAVAILABLE", message: "network timeout" })).toBe(false);
  });
});
