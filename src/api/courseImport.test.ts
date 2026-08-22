import { beforeEach, describe, expect, it, vi } from "vitest";
import { createImportedCourseHeader } from "@/api/courseImport";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc },
}));

describe("createImportedCourseHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: "course-1", error: null });
  });

  it("passes only normalized values to the atomic import RPC", async () => {
    await expect(createImportedCourseHeader({
      organizationId: "  org-1  ",
      title: "  Safety course  ",
      description: "  Imported  ",
    })).resolves.toBe("course-1");

    expect(mocks.rpc).toHaveBeenCalledWith("create_imported_course", {
      p_organization_id: "org-1",
      p_title: "Safety course",
      p_description: "Imported",
    });
  });

  it("rejects invalid input before calling the database", async () => {
    await expect(createImportedCourseHeader({
      organizationId: "org-1",
      title: "   ",
    })).rejects.toMatchObject({ code: "invalid_input" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("maps the server tariff gate to an actionable plan-limit error", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "maximum course limit reached" },
    });

    await expect(createImportedCourseHeader({
      organizationId: "org-1",
      title: "Course",
    })).rejects.toMatchObject({ code: "plan_limit" });
  });

  it("maps a revoked courses.write permission without exposing server details", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "secret internal authorization details" },
    });

    const promise = createImportedCourseHeader({
      organizationId: "org-1",
      title: "Course",
    });
    await expect(promise).rejects.toMatchObject({
      code: "permission_denied",
      message: "Недостаточно прав для создания курса",
    });
  });
});
