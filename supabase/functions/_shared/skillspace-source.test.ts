// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseSkillspaceSource, resolveSkillspaceRedirect } from "./skillspace-source";

describe("SkillSpace source URL boundary", () => {
  it.each([
    "https://my-school.skillspace.ru/course/123", "https://my-school.skillspace.ru/course/123/lesson/456?view=student#step-1",
    "HTTPS://MY-SCHOOL.SKILLSPACE.RU:443/course/123/", "  https://my-school.skillspace.ru/course/123  ",
  ])("keeps legitimate school/course links compatible: %s", input => {
    expect(parseSkillspaceSource(input)).toEqual({ baseUrl: "https://my-school.skillspace.ru", courseId: "123", schoolSlug: "my-school" });
  });
  it.each([
    "http://school.skillspace.ru/course/123", "https://user@school.skillspace.ru/course/123",
    "https://user:password@school.skillspace.ru/course/123", "https://school.skillspace.ru@evil.test/course/123",
    "https://evil.test/#https://school.skillspace.ru/course/123", "https://evil.test/?next=https://school.skillspace.ru/course/123",
    "https://school.skillspace.ru.evil.test/course/123", "https://sub.school.skillspace.ru/course/123",
    "https://skillspace.ru/course/123", "https://school.skillspace.ru:8443/course/123",
    "https://school.skillspace.ru/#/course/123", "https://school.skillspace.ru/?next=/course/123",
    "https://school.skillspace.ru/course/123evil", "https://school.skillspace.ru/course/123%2f456",
    "https://school.skillspace.ru/course/-123", "https://school.skillspace.ru/course/",
    "https://school.skillspace.ru./course/123", "https://school.skillspace.ru\\@evil.test/course/123",
    "https://sch\nool.skillspace.ru/course/123", "prefix https://school.skillspace.ru/course/123", null,
  ])("rejects ambiguous, insecure or non-course source: %s", input => {
    expect(parseSkillspaceSource(input)).toBeNull();
  });
});

describe("credential-bearing redirect boundary", () => {
  const origin = "https://my-school.skillspace.ru";
  it.each([
    ["/welcome", `${origin}/welcome`], ["../session", `${origin}/api/session`],
    [`${origin}:443/home#ignored`, `${origin}/home`], ["?continue=1", `${origin}/api/user/auth?continue=1`],
    ["//my-school.skillspace.ru/ready", `${origin}/ready`],
  ])("resolves same-origin redirects using the current request path: %s", (location, target) => {
    expect(resolveSkillspaceRedirect(location, `${origin}/api/user/auth`, origin)).toBe(target);
  });
  it.each([
    "https://evil.test/collect", "//evil.test/collect", "https://other.skillspace.ru/collect",
    "http://my-school.skillspace.ru/collect", "https://my-school.skillspace.ru:444/collect",
    "https://user:password@my-school.skillspace.ru/collect", "https://my-school.skillspace.ru@evil.test/collect",
    "javascript:alert(1)", "data:text/plain,fixture", "\\\\evil.test\\collect", "\n//evil.test/collect", "",
  ])("rejects an unsafe redirect: %s", location => {
    expect(resolveSkillspaceRedirect(location, `${origin}/api/user/auth`, origin)).toBeNull();
  });
});
