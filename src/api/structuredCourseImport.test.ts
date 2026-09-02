import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStructuredCourseDraft } from "@/api/structuredCourseImport";
import type { StructuredCourseDraftPayload } from "@/utils/structuredCourseImport";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc },
}));

function validPayload(): StructuredCourseDraftPayload {
  const modules = Array.from({ length: 11 }, (_, index) => ({
    key: `module-${index + 1}`,
    title: `Модуль ${index + 1}`,
    order_index: index,
  }));
  const lessons: StructuredCourseDraftPayload["lessons"] = [];
  let order = 0;
  for (let index = 0; index < 11; index += 1) {
    const moduleNumber = index + 1;
    const moduleKey = `module-${moduleNumber}`;
    const base = { module_number: moduleNumber, final_assessment: false };
    lessons.push(
      { key: `${moduleKey}-theory`, module_key: moduleKey, title: "Теория", type: "text", content: "[]", order_index: order++, test_passing_score: 60, metadata: base, questions: [] },
      { key: `${moduleKey}-practice`, module_key: moduleKey, title: "Практика", type: "homework", content: "[]", order_index: order++, test_passing_score: 60, metadata: base, questions: [] },
      { key: `${moduleKey}-self`, module_key: moduleKey, title: "Самостоятельно", type: "text", content: "[]", order_index: order++, test_passing_score: 60, metadata: base, questions: [] },
      {
        key: `${moduleKey}-test`, module_key: moduleKey, title: "Тест", type: "test", content: "", order_index: order++, test_passing_score: 60, metadata: base,
        questions: Array.from({ length: 5 }, (_unused, questionIndex) => ({
          question: `Вопрос ${questionIndex + 1}`,
          options: ["A", "B", "C", "D"].map((text) => ({ text })),
          correct_answer: 0,
          order_index: questionIndex,
          explanation: null,
        })),
      },
    );
  }
  const finalMetadata = { module_number: 11, final_assessment: true, assessment_block: "final_assessment" };
  lessons.push(
    { key: "final-practice", module_key: "module-11", title: "Итоговая практика", type: "homework", content: "[]", order_index: order++, test_passing_score: 60, metadata: finalMetadata, questions: [] },
    {
      key: "final-test", module_key: "module-11", title: "Итоговый тест", type: "test", content: "", order_index: order++, test_passing_score: 75, metadata: finalMetadata,
      questions: Array.from({ length: 12 }, (_unused, questionIndex) => ({
        question: `Итоговый вопрос ${questionIndex + 1}`,
        options: ["A", "B", "C", "D"].map((text) => ({ text })),
        correct_answer: 0,
        order_index: questionIndex,
        explanation: null,
      })),
    },
  );

  return {
    schema_version: 1,
    source_kind: "csz-178h-html",
    title: "Курс",
    description: "Описание",
    modules,
    lessons,
    documents: [
      ...Array.from({ length: 8 }, (_, index) => ({
        name: `Официальный ${index + 1}`, type: "link" as const, description: "Источник", file_url: `https://official.example/${index + 1}`, source_kind: "official" as const, source_module_number: null,
      })),
      ...Array.from({ length: 20 }, (_, index) => ({
        name: `Изготовитель ${index + 1}`, type: "link" as const, description: "РЭ", file_url: `https://manufacturer.example/${index + 1}`, source_kind: "manufacturer" as const, source_module_number: (index % 10) + 2,
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
        lesson_count: 46,
        question_count: 67,
        document_count: 28,
      },
      error: null,
    });
  });

  it("calls the single atomic RPC with a normalized draft payload", async () => {
    const result = await createStructuredCourseDraft({
      organizationId: "  org-1 ",
      title: "  Курс ЦСЗ ",
      payload: validPayload(),
    });

    expect(result.course_id).toBe("course-1");
    expect(result.is_published).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("import_csz_course_draft_v1", expect.objectContaining({
      p_organization_id: "org-1",
      p_payload: expect.objectContaining({ title: "Курс ЦСЗ" }),
    }));
  });

  it("rejects a partial server result instead of claiming success", async () => {
    mocks.rpc.mockResolvedValue({
      data: { course_id: "course-1", is_published: false, module_count: 11, lesson_count: 45 },
      error: null,
    });

    await expect(createStructuredCourseDraft({
      organizationId: "org-1",
      title: "Курс",
      payload: validPayload(),
    })).rejects.toMatchObject({ code: "unknown" });
  });

  it("does not call the RPC when the client graph is incomplete", async () => {
    const payload = validPayload();
    payload.lessons.pop();
    await expect(createStructuredCourseDraft({
      organizationId: "org-1",
      title: "Курс",
      payload,
    })).rejects.toThrow(/ожидалось 46 уроков/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
