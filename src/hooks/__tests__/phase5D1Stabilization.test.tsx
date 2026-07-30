import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/* ------------------------------------------------------------------ */
/* 1. Independent result sets in useOrganizationDataLoader             */
/* ------------------------------------------------------------------ */
describe("useOrganizationDataLoader — independent result sets", () => {
  const src = read("src/hooks/useOrganizationDataLoader.ts");

  it("uses Promise.allSettled instead of Promise.all", () => {
    expect(src).toContain("Promise.allSettled");
    expect(src).not.toMatch(/await Promise\.all\(\[/);
  });

  it("optional categories failure does not clear courses", () => {
    const idx = src.indexOf('categoriesResult.status === "fulfilled"');
    expect(idx).toBeGreaterThan(-1);
    const branch = src.slice(idx, src.indexOf("// --- optional: companies"));
    expect(branch).not.toContain("setCourses(");
  });

  it("optional companies failure does not clear courses", () => {
    const idx = src.indexOf("// --- optional: companies");
    const branch = src.slice(idx, src.indexOf("// --- required: courses"));
    expect(branch).not.toContain("setCourses(");
  });

  it("courses failure exposes a diagnosable error + retry action", () => {
    expect(src).toContain("setCoursesError(");
    expect(src).toContain('label: "Повторить"');
  });

  it("courses failure keeps previous courses (no unconditional reset)", () => {
    expect(src).not.toMatch(/setCourses\(\[\]\)/);
  });

  it("retries at most twice and never on non-transient errors", () => {
    expect(src).toContain("attempt < 3");
    expect(src).toContain("if (!isTransientNetworkError(error))");
  });
});

/* ------------------------------------------------------------------ */
/* 2. adminViewAsOrg unknown status                                     */
/* ------------------------------------------------------------------ */
describe("adminViewAsOrg resolution", () => {
  const src = read("src/hooks/useOrganizationDataLoader.ts");

  it("handles unknown explicitly and returns before profile fallback", () => {
    const idx = src.indexOf('resolution.status === "unknown"');
    expect(idx).toBeGreaterThan(-1);
    const branch = src.slice(idx, src.indexOf('// status: "none" | "not_admin"'));
    expect(branch).toContain("setAdminResolutionUnknown(true)");
    expect(branch).toContain("Не удалось подтвердить режим просмотра");
    expect(branch).toContain('label: "Повторить"');
    expect(branch).toContain("return;");
    // must not resolve another organization
    expect(branch).not.toContain('.from("profiles")');
    expect(branch).not.toContain("setOrganizationId(");
  });

  it("admin status uses exactly the stored organization id", () => {
    expect(src).toContain("orgId = resolution.view.id;");
  });

  it("stale responses of a previous organization are ignored", () => {
    expect(src).toContain("let cancelled = false;");
    expect(src).toContain("return () => { cancelled = true; };");
    expect(src).toContain("if (cancelled) return;");
  });
});

/* ------------------------------------------------------------------ */
/* 3. Students counts must not fake zeros                               */
/* ------------------------------------------------------------------ */
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));

import { supabase } from "@/integrations/supabase/client";
import { fetchOrganizationStudentsCounts } from "@/api/students";

describe("fetchOrganizationStudentsCounts", () => {
  beforeEach(() => {
    (supabase.rpc as any).mockReset();
  });

  it("throws a diagnosable error when the RPC returns no row", async () => {
    (supabase.rpc as any).mockResolvedValue({ data: [], error: null });
    await expect(fetchOrganizationStudentsCounts("org-1")).rejects.toThrow(/пустой результат/);
  });

  it("throws when data is null", async () => {
    (supabase.rpc as any).mockResolvedValue({ data: null, error: null });
    await expect(fetchOrganizationStudentsCounts("org-1")).rejects.toThrow();
  });

  it("returns a real zero only after a successful row", async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: [{ active_count: 0, archived_count: 0, total_count: 0 }],
      error: null,
    });
    await expect(fetchOrganizationStudentsCounts("org-1")).resolves.toEqual({
      active_count: 0,
      archived_count: 0,
      total_count: 0,
    });
  });

  it("returns real counts", async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: [{ active_count: 2, archived_count: 1, total_count: 3 }],
      error: null,
    });
    await expect(fetchOrganizationStudentsCounts("org-1")).resolves.toEqual({
      active_count: 2,
      archived_count: 1,
      total_count: 3,
    });
  });
});

/* ------------------------------------------------------------------ */
/* 4. counts>0 + empty page => inconsistency, not empty state           */
/* ------------------------------------------------------------------ */
describe("students inconsistency guard", () => {
  const hook = read("src/hooks/useStudents.ts");
  const tab = read("src/components/organization/tabs/StudentsTab.tsx");

  it("hook computes countsInconsistent from counts + empty first page", () => {
    expect(hook).toContain("const countsInconsistent =");
    expect(hook).toContain("countsQuery.data.active_count > 0");
    expect(hook).toContain("students.length === 0");
    expect(hook).toContain("noFiltersActive");
  });

  it("tab renders the inconsistency block before the empty state", () => {
    const inc = tab.indexOf("countsInconsistent ?");
    const empty = tab.indexOf("students.length === 0 ?");
    expect(inc).toBeGreaterThan(-1);
    expect(inc).toBeLessThan(empty);
    expect(tab).toContain("Данные учеников не согласованы");
  });
});

/* ------------------------------------------------------------------ */
/* 5. Notification bells                                                */
/* ------------------------------------------------------------------ */
describe("header notification affordances", () => {
  const bell = read("src/components/shared/AnnouncementsBell.tsx");
  const orgNotif = read("src/components/organization/OrgNotifications.tsx");
  const header = read("src/components/organization/OrgDashboardHeader.tsx");

  it("both top elements have distinct aria-labels", () => {
    expect(bell).toContain('aria-label="Новости платформы"');
    expect(orgNotif).toContain('aria-label="Уведомления об обучении"');
    expect(bell).not.toContain('aria-label="Уведомления об обучении"');
  });

  it("platform news uses a non-Bell icon", () => {
    const trigger = bell.slice(bell.indexOf('aria-label="Новости платформы"'), bell.indexOf('aria-label="Новости платформы"') + 400);
    expect(trigger).toContain("<Megaphone");
    expect(trigger).not.toContain("<Bell");
  });

  it("tooltips are distinct in the org header", () => {
    expect(header).toContain("<TooltipContent>Новости платформы</TooltipContent>");
    expect(header).toContain("<TooltipContent>Уведомления об обучении</TooltipContent>");
  });

  it("course_completed is part of the learning notifications and filtered by org", () => {
    expect(orgNotif).toContain('"course_completed"');
    expect(orgNotif).toContain('.eq("organization_id", organizationId)');
  });

  it("load error shows retry instead of empty state", () => {
    expect(orgNotif).toContain("Не удалось загрузить уведомления");
    expect(orgNotif).toContain("onClick={loadNotifications}");
  });

  it("realtime INSERT deduplicates by id", () => {
    expect(orgNotif).toContain("prev.some(n => n.id === incoming.id)");
  });
});

/* ------------------------------------------------------------------ */
/* 6. Release version consistency                                       */
/* ------------------------------------------------------------------ */
describe("release 1.0.81", () => {
  it("appVersion, vite pwa cache and index.html manifest agree", () => {
    expect(read("src/lib/appVersion.ts")).toContain('APP_VERSION = "1.0.81"');
    expect(read("src/lib/appVersion.ts")).toContain('BUILD_DATE_SHORT = "30.07"');
    expect(read("vite.config.ts")).toContain('"sintagma-1.0.81"');
    expect(read("index.html")).toContain("manifest.webmanifest?v=1.0.81");
  });
});
