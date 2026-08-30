import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CourseCreationError,
  courseCreationErrorMessage,
  createCourse,
  normalizeNullableCourseId,
  publishCourse,
} from "@/api/courses";

const db = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: db.from },
}));

describe("createCourse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.from.mockReturnValue({ insert: db.insert });
    db.insert.mockReturnValue({ select: db.select });
    db.select.mockReturnValue({ single: db.single });
  });

  it.each([undefined, null, "", "   ", "none", "NONE", "__none__", "__NONE__"])(
    "normalizes nullable category %j before inserting",
    async (categoryId) => {
      db.single.mockResolvedValue({
        data: { id: "course-1", title: "Course", category_id: null },
        error: null,
      });

      await expect(createCourse("org-1", "  Course  ", "   ", categoryId ?? undefined))
        .resolves.toMatchObject({ id: "course-1" });
      expect(db.from).toHaveBeenCalledWith("courses");
      expect(db.insert).toHaveBeenCalledWith({
        organization_id: "org-1",
        title: "Course",
        description: null,
        category_id: null,
        is_published: false,
      });
    },
  );

  it("keeps a real category UUID", async () => {
    db.single.mockResolvedValue({ data: { id: "course-1" }, error: null });
    await createCourse("org-1", "Course", undefined, "  category-1  ");
    expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ category_id: "category-1" }));
    expect(normalizeNullableCourseId(" category-1 ")).toBe("category-1");
  });

  it("rejects an empty title before touching the database", async () => {
    await expect(createCourse("org-1", "   ")).rejects.toMatchObject({
      name: "CourseCreationError",
      code: "invalid_input",
    });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("maps a foreign-key/category failure to a safe actionable error", async () => {
    db.single.mockResolvedValue({
      data: null,
      error: { code: "23503", message: "violates course_category_id_fkey: secret-row" },
    });

    const promise = createCourse("org-1", "Course", undefined, "deleted-category");
    await expect(promise).rejects.toBeInstanceOf(CourseCreationError);
    await expect(promise).rejects.toMatchObject({ code: "invalid_category" });
    await expect(promise).rejects.not.toThrow(/secret-row/);
  });

  it("maps plan-limit and permission errors without exposing raw database details", () => {
    expect(courseCreationErrorMessage({ message: "maximum course limit reached: internal-trigger" }))
      .toContain("Достигнут лимит курсов");
    expect(courseCreationErrorMessage({ code: "42501", message: "row-level security secret policy" }))
      .toBe("Недостаточно прав для создания курса");
  });
});

describe("publishCourse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.from.mockReturnValue({ update: db.update });
    db.update.mockReturnValue({ eq: db.eq });
    db.eq.mockReturnValue({ select: db.select });
    db.select.mockReturnValue({ maybeSingle: db.maybeSingle });
  });

  it.each([true, false])("persists an explicit publication decision: %s", async (isPublished) => {
    db.maybeSingle.mockResolvedValue({
      data: { is_published: isPublished },
      error: null,
    });

    await expect(publishCourse("course-1", isPublished)).resolves.toBe(true);
    expect(db.from).toHaveBeenCalledWith("courses");
    expect(db.update).toHaveBeenCalledWith({ is_published: isPublished });
    expect(db.eq).toHaveBeenCalledWith("id", "course-1");
  });
});
