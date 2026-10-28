import { beforeEach, describe, expect, it, vi } from "vitest";
import { P, readinessDto } from "@/lib/__tests__/platformCoursePublication.fixtures";
import { parsePublicationReadiness } from "@/lib/platformCoursePublication";
const mock = vi.hoisted(() => ({ readiness: vi.fn(), manual: vi.fn(), simple: vi.fn() }));
vi.mock("@/api/platformCoursePublication", () => ({ platformCoursePublication: { readiness: mock.readiness } }));
vi.mock("../validationHelpers", () => ({ validateCourseIssues: mock.manual, validateCourseIssuesSimple: mock.simple }));
import { checkMarketplacePublicationStructure } from "../publicationStructuralCheck";
const rules = { minLessons: 3, minContentLength: 50, requireText: true, requireTest: true, checkDuplicateTitles: true };
beforeEach(() => {
  vi.clearAllMocks();
  mock.readiness.mockReset().mockResolvedValue(parsePublicationReadiness(readinessDto(), P.target));
  mock.manual.mockReset().mockResolvedValue([]); mock.simple.mockReset().mockResolvedValue([]);
});
describe("exact-edition structural precondition", () => {
  it.each([false, true])("keeps the existing manual/Simple predicate: simple=%s", async simple => {
    await expect(checkMarketplacePublicationStructure(P.target, P.sha, rules, simple)).resolves.toEqual([]);
    expect(simple ? mock.simple : mock.manual).toHaveBeenCalledExactlyOnceWith(P.target.courseId, rules);
    expect(simple ? mock.manual : mock.simple).not.toHaveBeenCalled();
    expect(mock.readiness).toHaveBeenCalledTimes(2);
  });
  it("does not bind a structural result to another initial edition", async () => {
    await expect(checkMarketplacePublicationStructure(P.target, P.changedSha, rules)).rejects.toMatchObject({ code: "stale" });
    expect(mock.manual).not.toHaveBeenCalled();
  });
  it("rejects a source change during the checker instead of publishing its old pass", async () => {
    mock.readiness.mockResolvedValueOnce(parsePublicationReadiness(readinessDto(), P.target))
      .mockResolvedValueOnce(parsePublicationReadiness(readinessDto({ edition_sha256: P.changedSha }), P.target));
    await expect(checkMarketplacePublicationStructure(P.target, P.sha, rules)).rejects.toMatchObject({ code: "stale" });
  });
  it("preserves returned structural issues without turning them into repairs", async () => {
    mock.manual.mockResolvedValueOnce(["Нужна проверка материала"]);
    await expect(checkMarketplacePublicationStructure(P.target, P.sha, rules)).resolves.toEqual(["Нужна проверка материала"]);
  });
});
