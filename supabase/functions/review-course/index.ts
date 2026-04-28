import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAIWithTools } from "../_shared/gigachat-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { courseId } = await req.json();
    if (!courseId) {
      return new Response(JSON.stringify({ error: "courseId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Load course
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("id, title, description")
      .eq("id", courseId)
      .single();

    if (courseError || !course) {
      return new Response(JSON.stringify({ error: "Course not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load lessons
    const { data: lessons } = await supabase
      .from("lessons")
      .select("id, title, type, content, order_index")
      .eq("course_id", courseId)
      .order("order_index");

    if (!lessons || lessons.length === 0) {
      return new Response(JSON.stringify({ error: "No lessons found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load test questions
    const testLessonIds = lessons.filter(l => l.type === "test").map(l => l.id);
    let testQuestions: Record<string, any[]> = {};
    if (testLessonIds.length > 0) {
      const { data: questions } = await supabase
        .from("test_questions")
        .select("id, lesson_id, question, options, correct_answer, explanation")
        .in("lesson_id", testLessonIds);

      if (questions) {
        for (const q of questions) {
          if (!testQuestions[q.lesson_id]) testQuestions[q.lesson_id] = [];
          testQuestions[q.lesson_id].push(q);
        }
      }
    }

    // Build course summary for AI
    const lessonSummaries = lessons.map((l, i) => {
      let summary = `### Урок ${i + 1}: "${l.title}" (тип: ${l.type})`;

      if (l.type === "test" && testQuestions[l.id]) {
        const qs = testQuestions[l.id];
        summary += `\nВопросы теста (${qs.length} шт.):`;
        for (const q of qs) {
          const opts = Array.isArray(q.options)
            ? q.options.map((o: any, idx: number) =>
                `  ${idx + 1}) ${typeof o === "object" ? o.text : o}${idx === q.correct_answer ? " ✓" : ""}`
              ).join("\n")
            : "";
          summary += `\n- ${q.question}\n${opts}`;
          if (q.explanation) summary += `\n  Пояснение: ${q.explanation}`;
        }
      } else if (l.content) {
        // Extract text from block content
        try {
          const blocks = JSON.parse(l.content);
          if (Array.isArray(blocks)) {
            const textContent = blocks
              .filter((b: any) => b.type === "paragraph" || b.type === "heading" || b.type === "text")
              .map((b: any) => {
                if (typeof b.content === "string") return b.content;
                if (b.content?.text) return b.content.text;
                if (Array.isArray(b.content)) {
                  return b.content.map((c: any) => c.text || c.content || "").join("");
                }
                return "";
              })
              .filter(Boolean)
              .join("\n");
            if (textContent.length > 0) {
              summary += `\nСодержание (текст):\n${textContent.substring(0, 3000)}`;
            }
          }
        } catch {
          if (typeof l.content === "string" && l.content.length > 10) {
            summary += `\nСодержание:\n${l.content.substring(0, 3000)}`;
          }
        }
      }

      return summary;
    });

    const courseContent = `# Курс: "${course.title}"
${course.description ? `Описание: ${course.description}` : ""}

## Уроки (${lessons.length} шт.):

${lessonSummaries.join("\n\n")}`;

    const systemPrompt = `Ты — эксперт по проверке и актуализации учебных курсов в области охраны труда, промышленной безопасности и профессионального обучения в России.

Твоя задача — тщательно проверить содержание курса и найти:

1. **Законодательство**: Проверь все упоминания федеральных законов, постановлений правительства, приказов министерств, ГОСТов, СНиПов, СП, ТР ТС. Убедись, что указаны актуальные редакции и поправки. Если документ был изменен или заменен — укажи это.

2. **Тестовые вопросы**: Проверь корректность формулировок вопросов, правильность указанных ответов, достаточность вариантов ответов. Убедись, что вопросы покрывают ключевые темы урока.

3. **Фактические ошибки**: Найди устаревшую информацию, неточности, противоречия между уроками.

4. **Предложения**: Предложи недостающие темы, дополнительные тестовые вопросы, улучшения формулировок.

Будь конкретным и точным. Указывай номера и даты нормативных актов. Для каждого замечания предлагай конкретное исправление.`;

    const tool = {
      type: "function",
      function: {
        name: "submit_review_findings",
        description: "Submit course review findings with specific issues and suggestions",
        parameters: {
          type: "object",
          properties: {
            findings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "Unique finding ID" },
                  lesson_title: { type: "string", description: "Title of the related lesson" },
                  type: {
                    type: "string",
                    enum: ["legislation", "test", "error", "suggestion"],
                    description: "Type of finding",
                  },
                  severity: {
                    type: "string",
                    enum: ["critical", "warning", "info"],
                    description: "Severity level",
                  },
                  description: { type: "string", description: "Detailed description of the issue" },
                  suggestion: { type: "string", description: "Recommended fix or improvement" },
                  target_kind: {
                    type: "string",
                    enum: ["test_question", "lesson_title", "none"],
                    description: "What entity the patch targets. 'none' if no machine-applicable patch.",
                  },
                  target_id: { type: "string", description: "ID of the test_question or lesson the patch applies to. Empty if target_kind=none." },
                  patch: {
                    type: "object",
                    description: "Concrete machine-applicable change. For test_question: { question?: string, explanation?: string, correct_answer?: number, options?: string[] }. For lesson_title: { title: string }. Empty {} if no patch.",
                    additionalProperties: true,
                  },
                },
                required: ["id", "lesson_title", "type", "severity", "description", "suggestion", "target_kind", "target_id", "patch"],
                additionalProperties: false,
              },
            },
            summary: { type: "string", description: "Brief overall assessment of the course quality" },
          },
          required: ["findings", "summary"],
          additionalProperties: false,
        },
      },
    };

    console.log(`[review-course] Reviewing course "${course.title}" (${lessons.length} lessons)`);

    const result = await callAIWithTools(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Проверь следующий курс и найди все проблемы:\n\n${courseContent}` },
      ],
      tool,
      "GigaChat-Max",
      "google/gemini-2.5-pro",
    );

    console.log(`[review-course] Review complete: ${result.findings?.length || 0} findings`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[review-course] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.includes("402") ? 402 : message.includes("429") ? 429 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
