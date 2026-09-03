import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStructuredCourseDraft } from "@/api/structuredCourseImport";
import {
  CSZ_COURSE_TITLE,
  CSZ_MODULE_TITLES,
  type StructuredCourseDraftPayload,
} from "@/utils/structuredCourseImport";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc },
}));

function validPayload(): StructuredCourseDraftPayload {
  const modules = Array.from({ length: 11 }, (_, index) => ({
    key: `module-${index + 1}`,
    title: CSZ_MODULE_TITLES[index],
    order_index: index,
  }));
  const lessons: StructuredCourseDraftPayload["lessons"] = [];
  let order = 0;
  for (let index = 0; index < 11; index += 1) {
    const moduleNumber = index + 1;
    const moduleKey = `module-${moduleNumber}`;
    const base = { module_number: moduleNumber, final_assessment: false };
    lessons.push(
      { key: `${moduleKey}-theory`, module_key: moduleKey, title: CSZ_MODULE_TITLES[index], type: "text", content: "[]", order_index: order++, test_passing_score: 70, metadata: base, questions: [] },
      { key: `${moduleKey}-practice`, module_key: moduleKey, title: `Практическое задание ${moduleNumber}. Тема`, type: "homework", content: "[]", order_index: order++, test_passing_score: 70, metadata: base, questions: [] },
      {
        key: `${moduleKey}-test`, module_key: moduleKey, title: `Промежуточная аттестация. Модуль ${moduleNumber}`, type: "test", content: "", order_index: order++, test_passing_score: 70, metadata: base,
        questions: Array.from({ length: 5 }, (_unused, questionIndex) => ({
          key: `M${String(moduleNumber).padStart(2, "0")}-Q${String(questionIndex + 1).padStart(2, "0")}`,
          question: `Вопрос ${questionIndex + 1}`,
          options: ["A", "B", "C", "D"].map((text) => ({ text })),
          correct_answer: 0,
          correct_option: "A" as const,
          order_index: questionIndex,
          explanation: null,
        })),
      },
    );
  }
  const finalMetadata = { module_number: 11, final_assessment: true, assessment_block: "final_assessment" };
  lessons.push(
    { key: "final-practice", module_key: "module-11", title: "Итоговая практико-ориентированная задача", type: "homework", content: "[]", order_index: order++, test_passing_score: 70, metadata: finalMetadata, questions: [] },
    {
      key: "final-test", module_key: "module-11", title: "Итоговый тест", type: "test", content: "", order_index: order++, test_passing_score: 70, metadata: finalMetadata,
      questions: Array.from({ length: 12 }, (_unused, questionIndex) => ({
        key: `F-Q${String(questionIndex + 1).padStart(2, "0")}`,
        question: `Итоговый вопрос ${questionIndex + 1}`,
        options: ["A", "B", "C", "D"].map((text) => ({ text })),
        correct_answer: 0,
        correct_option: "A" as const,
        order_index: questionIndex,
        explanation: null,
      })),
    },
  );

  return {
    schema_version: 2,
    source_kind: "csz-178h-html-with-closed-keys",
    title: CSZ_COURSE_TITLE,
    description: "Описание",
    modules,
    lessons,
    documents: [
      ...Array.from({ length: 8 }, (_, index) => ({
        name: `Официальный ${index + 1}`,
        type: "link" as const,
        description: "Источник",
        file_url: `https://official.example/${index + 1}`,
        source_name: "official.example",
        source_kind: "official" as const,
        source_module_number: null,
        library_category: "legal_acts" as const,
        usage_basis: "official_open_source" as const,
        library_status: "needs_review" as const,
      })),
    ],
  };
}

describe("createStructuredCourseDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({
      data: {
        course_id: "course-1",
        is_published: false,
        module_count: 11,
        lesson_count: 35,
        question_count: 67,
        document_count: 8,
      },
      error: null,
    });
  });

  it("calls the single atomic RPC with a normalized draft payload", async () => {
    const result = await createStructuredCourseDraft({
      organizationId: "  org-1 ",
      title: `  ${CSZ_COURSE_TITLE}  `,
      payload: validPayload(),
    });

    expect(result.course_id).toBe("course-1");
    expect(result.is_published).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("import_csz_course_draft_v2", expect.objectContaining({
      p_organization_id: "org-1",
      p_payload: expect.objectContaining({ title: CSZ_COURSE_TITLE }),
    }));
  });

  it("rejects a partial server result instead of claiming success", async () => {
    mocks.rpc.mockResolvedValue({
      data: { course_id: "course-1", is_published: false, module_count: 11, lesson_count: 45 },
      error: null,
    });

    await expect(createStructuredCourseDraft({
      organizationId: "org-1",
      title: CSZ_COURSE_TITLE,
      payload: validPayload(),
    })).rejects.toMatchObject({ code: "unknown" });
  });

  it("does not call the RPC when the client graph is incomplete", async () => {
    const payload = validPayload();
    payload.lessons.pop();
    await expect(createStructuredCourseDraft({
      organizationId: "org-1",
      title: CSZ_COURSE_TITLE,
      payload,
    })).rejects.toThrow(/ожидалось 35 уроков/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
