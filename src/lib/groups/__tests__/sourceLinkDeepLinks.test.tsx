import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { companiesPath, studentDetailsPath, groupFolderPath, resolveTabParams } from "@/lib/groups/groupContext";

const GROUP = "0cd9dd54-af40-4899-bd94-9d3c1a728d38";
const COURSE = "11111111-2222-3333-4444-555555555555";
const COMPANY = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const STUDENT = "99999999-8888-7777-6666-555555555555";

function q(path: string) {
  return new URLSearchParams(path.split("?")[1] ?? "");
}

describe("companiesPath deep link", () => {
  it("uses the real organization tab key 'organizations', not 'companies'", () => {
    const p = q(companiesPath(COMPANY));
    expect(p.get("tab")).toBe("organizations");
    expect(p.get("companyId")).toBe(COMPANY);
  });

  it("survives resolveTabParams so the exact company card stays addressable", () => {
    const next = resolveTabParams(q(companiesPath(COMPANY)), "organizations");
    expect(next.get("tab")).toBe("organizations");
    expect(next.get("companyId")).toBe(COMPANY);
  });

  it("works without a companyId", () => {
    const p = q(companiesPath());
    expect(p.get("tab")).toBe("organizations");
    expect(p.get("companyId")).toBeNull();
  });
});

describe("studentDetailsPath return path", () => {
  it("carries returnToGroupId and no group/course filters", () => {
    const p = q(studentDetailsPath(STUDENT, { groupId: GROUP, courseId: COURSE }));
    expect(p.get("tab")).toBe("student-details");
    expect(p.get("studentId")).toBe(STUDENT);
    expect(p.get("returnToGroupId")).toBe(GROUP);
    expect(p.get("courseId")).toBeNull();
  });

  it("preserves returnToGroupId when the dashboard re-applies tab=student-details", () => {
    const start = q(studentDetailsPath(STUDENT, { groupId: GROUP, courseId: COURSE }));
    const next = resolveTabParams(start, "student-details");
    expect(next.get("returnToGroupId")).toBe(GROUP);
    expect(next.get("studentId")).toBe(STUDENT);
    // Групповые/курсовые фильтры снимаются, чтобы данные ученика не подменялись
    expect(next.get("groupId")).toBeNull();
    expect(next.get("courseId")).toBeNull();
    expect(next.get("folder")).toBeNull();
  });

  it("does not invent a return path for ordinary student cards", () => {
    const next = resolveTabParams(q(studentDetailsPath(STUDENT)), "student-details");
    expect(next.get("returnToGroupId")).toBeNull();
  });

  it("drops returnToGroupId when leaving to an unrelated tab", () => {
    const start = q(studentDetailsPath(STUDENT, { groupId: GROUP }));
    const next = resolveTabParams(start, "organizations");
    expect(next.get("returnToGroupId")).toBeNull();
    expect(next.get("studentId")).toBeNull();
  });

  it("return action points back to the exact group folder", () => {
    const back = q(studentDetailsPath(STUDENT, { groupId: GROUP })).get("returnToGroupId")!;
    const folder = q(groupFolderPath(back));
    expect(folder.get("tab")).toBe("group-folder");
    expect(folder.get("groupId")).toBe(GROUP);
  });
});

// ── Component proof: карточка компании открывается, страница не пустая ──

vi.mock("@/integrations/supabase/client", () => {
  const chain: any = new Proxy({}, {
    get(_t, prop) {
      if (prop === "then") return (res: any) => Promise.resolve({ data: [], error: null, count: 0 }).then(res);
      if (prop === "single" || prop === "maybeSingle") return () => Promise.resolve({ data: null, error: null });
      return () => chain;
    },
  });
  return {
    supabase: {
      from: vi.fn(() => chain),
      rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
      auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: "u1" } } })) },
      functions: { invoke: vi.fn(() => Promise.resolve({ data: null, error: null })) },
    },
  };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { CompaniesManager } from "@/components/organization/CompaniesManager";
import { createQueryWrapper } from "@/test/queryWrapper";

describe("CompaniesManager deep link mount", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mounts on the organizations tab link without a blank page", async () => {
    const Wrapper = createQueryWrapper();
    render(
      <MemoryRouter initialEntries={[companiesPath(COMPANY)]}>
        <Wrapper>
          <CompaniesManager organizationId="org-1" />
        </Wrapper>
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.body.textContent?.length ?? 0).toBeGreaterThan(0));
    expect(screen.getAllByText(/Компании/i).length).toBeGreaterThan(0);
  });
});
