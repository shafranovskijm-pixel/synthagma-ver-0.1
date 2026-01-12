import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Lesson {
  title: string;
  type: "lesson" | "test";
  order_index: number;
}

interface TestQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
}

interface ContentBlock {
  type: string;
  content: string;
}

async function generateWithAI(prompt: string, systemPrompt: string, tool: any): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: tool.function.name } }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI error:", response.status, errorText);
    throw new Error(`AI error: ${response.status}`);
  }

  const result = await response.json();
  const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("No tool call in response");
  
  return JSON.parse(toolCall.function.arguments);
}

async function generateCourseStructure(courseTitle: string): Promise<Lesson[]> {
  const systemPrompt = `Ты эксперт по созданию учебных программ. Создай структуру курса с уроками и тестами.
Правила:
1. Создай от 5 до 8 уроков
2. После каждых 2-3 уроков добавь тест
3. В конце обязательно итоговый тест
4. Уроки должны логически следовать друг за другом`;

  const tool = {
    type: "function",
    function: {
      name: "create_course_structure",
      description: "Создает структуру курса",
      parameters: {
        type: "object",
        properties: {
          lessons: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                type: { type: "string", enum: ["lesson", "test"] }
              },
              required: ["title", "type"],
              additionalProperties: false
            }
          }
        },
        required: ["lessons"],
        additionalProperties: false
      }
    }
  };

  const result = await generateWithAI(
    `Создай структуру курса: "${courseTitle}"`,
    systemPrompt,
    tool
  );

  return (result.lessons || []).map((l: any, i: number) => ({
    title: l.title,
    type: l.type,
    order_index: i
  }));
}

async function generateLessonContent(lessonTitle: string, courseTitle: string): Promise<ContentBlock[]> {
  const systemPrompt = `Ты эксперт по созданию образовательного контента. Создай подробный учебный материал.
Правила:
1. Контент должен быть структурированным и понятным
2. Используй заголовки, списки, примеры
3. Минимум 500 слов
4. Практические примеры обязательны`;

  const tool = {
    type: "function",
    function: {
      name: "create_lesson_content",
      parameters: {
        type: "object",
        properties: {
          blocks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["heading1", "heading2", "paragraph", "bulletList", "numberedList"] },
                content: { type: "string" }
              },
              required: ["type", "content"],
              additionalProperties: false
            }
          }
        },
        required: ["blocks"],
        additionalProperties: false
      }
    }
  };

  const result = await generateWithAI(
    `Создай подробный учебный материал для урока "${lessonTitle}" курса "${courseTitle}"`,
    systemPrompt,
    tool
  );

  return result.blocks || [];
}

async function generateTestQuestions(lessonTitle: string, courseTitle: string): Promise<TestQuestion[]> {
  const systemPrompt = `Ты эксперт по созданию тестов. Создай тестовые вопросы.
Правила:
1. 5-10 вопросов
2. 4 варианта ответа на каждый
3. Только один правильный ответ
4. Разная сложность вопросов`;

  const tool = {
    type: "function",
    function: {
      name: "create_test_questions",
      parameters: {
        type: "object",
        properties: {
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                question: { type: "string" },
                options: { type: "array", items: { type: "string" } },
                correctAnswer: { type: "number" }
              },
              required: ["question", "options", "correctAnswer"],
              additionalProperties: false
            }
          }
        },
        required: ["questions"],
        additionalProperties: false
      }
    }
  };

  const result = await generateWithAI(
    `Создай тестовые вопросы для теста "${lessonTitle}" курса "${courseTitle}"`,
    systemPrompt,
    tool
  );

  return result.questions || [];
}

function blocksToMarkdown(blocks: ContentBlock[]): string {
  return blocks.map(block => {
    switch (block.type) {
      case "heading1": return `# ${block.content}\n`;
      case "heading2": return `## ${block.content}\n`;
      case "paragraph": return `${block.content}\n`;
      case "bulletList": return block.content.split('\n').map(item => `- ${item}`).join('\n') + '\n';
      case "numberedList": return block.content.split('\n').map((item, i) => `${i + 1}. ${item}`).join('\n') + '\n';
      default: return `${block.content}\n`;
    }
  }).join('\n');
}

async function processOneCourse(supabase: any, courseId: string, courseTitle: string) {
  console.log(`Starting generation for course: ${courseTitle}`);
  
  try {
    // Generate structure
    const lessons = await generateCourseStructure(courseTitle);
    console.log(`Generated ${lessons.length} lessons for ${courseTitle}`);

    // Insert lessons
    for (const lesson of lessons) {
      const { data: lessonData, error: lessonError } = await supabase
        .from("lessons")
        .insert({
          course_id: courseId,
          title: lesson.title,
          type: lesson.type,
          order_index: lesson.order_index,
          content: null
        })
        .select()
        .single();

      if (lessonError) {
        console.error(`Error inserting lesson: ${lessonError.message}`);
        continue;
      }

      // Add small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 2000));

      if (lesson.type === "lesson") {
        // Generate lesson content
        const blocks = await generateLessonContent(lesson.title, courseTitle);
        const markdown = blocksToMarkdown(blocks);
        
        await supabase
          .from("lessons")
          .update({ content: markdown })
          .eq("id", lessonData.id);
          
        console.log(`Generated content for lesson: ${lesson.title}`);
      } else {
        // Generate test questions
        const questions = await generateTestQuestions(lesson.title, courseTitle);
        
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          await supabase.from("test_questions").insert({
            lesson_id: lessonData.id,
            question: q.question,
            options: q.options,
            correct_answer: q.correctAnswer,
            order_index: i
          });
        }
        
        await supabase
          .from("lessons")
          .update({ test_questions_count: questions.length })
          .eq("id", lessonData.id);
          
        console.log(`Generated ${questions.length} questions for test: ${lesson.title}`);
      }

      // Delay between lessons
      await new Promise(r => setTimeout(r, 3000));
    }

    console.log(`Completed generation for course: ${courseTitle}`);
  } catch (error) {
    console.error(`Error processing course ${courseTitle}:`, error);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { courseId, organizationId } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let coursesToProcess: Array<{ id: string; title: string }> = [];

    if (courseId) {
      // Single course mode
      const { data: course } = await supabase
        .from("courses")
        .select("id, title")
        .eq("id", courseId)
        .single();
      
      if (course) {
        coursesToProcess = [course];
      }
    } else if (organizationId) {
      // All courses for organization that have no lessons
      const { data: courses } = await supabase
        .from("courses")
        .select("id, title")
        .eq("organization_id", organizationId);

      if (courses) {
        // Filter courses without lessons
        for (const course of courses) {
          const { count } = await supabase
            .from("lessons")
            .select("*", { count: "exact", head: true })
            .eq("course_id", course.id);
          
          if (count === 0) {
            coursesToProcess.push(course);
          }
        }
      }
    }

    if (coursesToProcess.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Нет курсов для обработки" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Start background processing
    const backgroundTask = async () => {
      for (const course of coursesToProcess) {
        await processOneCourse(supabase, course.id, course.title);
        // Delay between courses to avoid rate limiting
        await new Promise(r => setTimeout(r, 5000));
      }
      console.log(`Completed processing all ${coursesToProcess.length} courses`);
    };

    // Use waitUntil for background processing
    (globalThis as any).EdgeRuntime?.waitUntil?.(backgroundTask());

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Запущена генерация контента для ${coursesToProcess.length} курсов`,
        courses: coursesToProcess.map(c => c.title)
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
