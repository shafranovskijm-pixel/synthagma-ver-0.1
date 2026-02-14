import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

async function generateWithAI(prompt: string, systemPrompt: string, tool?: any): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const body: any = {
    model: "google/gemini-3-flash-preview",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt }
    ],
  };

  if (tool) {
    body.tools = [tool];
    body.tool_choice = { type: "function", function: { name: tool.function.name } };
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Rate limit exceeded, please try again later");
    }
    if (response.status === 402) {
      throw new Error("Payment required, please add credits");
    }
    const errorText = await response.text();
    console.error("AI error:", response.status, errorText);
    throw new Error(`AI error: ${response.status}`);
  }

  const result = await response.json();
  
  if (tool) {
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");
    return JSON.parse(toolCall.function.arguments);
  } else {
    return { content: result.choices?.[0]?.message?.content || "" };
  }
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

async function generateImage(prompt: string): Promise<string | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  console.log("Generating image for:", prompt);

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image-preview",
      messages: [
        {
          role: "user",
          content: `Generate an educational illustration for: ${prompt}. Style: clean, professional, suitable for educational materials. High quality, detailed.`
        }
      ],
      modalities: ["image", "text"]
    }),
  });

  if (!response.ok) {
    console.error("Image generation error:", response.status, await response.text());
    return null;
  }

  const result = await response.json();
  const imageUrl = result.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  
  console.log("Image generated:", imageUrl ? "success" : "no image in response");
  return imageUrl || null;
}

async function generateSlides(topic: string, courseTitle: string): Promise<any[]> {
  const systemPrompt = `Ты эксперт по созданию презентаций. Создай структуру слайдов.
Правила:
1. 5-8 слайдов
2. Каждый слайд с заголовком и контентом
3. Логическая структура: введение, основная часть, заключение
4. Ключевые тезисы и примеры
5. Для каждого слайда укажи описание изображения для генерации`;

  const tool = {
    type: "function",
    function: {
      name: "create_slides",
      parameters: {
        type: "object",
        properties: {
          slides: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                content: { type: "string" },
                imagePrompt: { type: "string", description: "Description for AI image generation" }
              },
              required: ["title", "content", "imagePrompt"],
              additionalProperties: false
            }
          }
        },
        required: ["slides"],
        additionalProperties: false
      }
    }
  };

  const result = await generateWithAI(
    `Создай презентацию на тему "${topic}" для курса "${courseTitle}"`,
    systemPrompt,
    tool
  );

  const slides = result.slides || [];
  
  // Generate images for slides
  const slidesWithImages = [];
  for (const s of slides) {
    let imageUrl = null;
    if (s.imagePrompt) {
      try {
        imageUrl = await generateImage(s.imagePrompt);
        await new Promise(r => setTimeout(r, 1500)); // Rate limit delay
      } catch (e) {
        console.error("Failed to generate image for slide:", e);
      }
    }
    slidesWithImages.push({
      id: crypto.randomUUID(),
      title: s.title,
      content: s.content,
      imageUrl: imageUrl
    });
  }

  return slidesWithImages;
}

async function generateTextContent(topic: string, courseTitle: string): Promise<string> {
  const systemPrompt = `Ты эксперт по созданию образовательного контента. Напиши подробный текст для лекции.
Правила:
1. Структурированный текст с заголовками
2. Минимум 300 слов
3. Практические примеры
4. Понятный язык`;

  const result = await generateWithAI(
    `Напиши лекцию на тему "${topic}" для курса "${courseTitle}"`,
    systemPrompt
  );

  return result.content || "";
}

async function generateVideoScript(topic: string, courseTitle: string): Promise<string> {
  const systemPrompt = `Ты эксперт по созданию образовательных видео. Напиши сценарий для короткого обучающего видео (1-2 минуты).
Правила:
1. Чёткая структура: вступление, основная часть, заключение
2. Визуальные указания для каждой сцены
3. Текст для озвучки
4. Длительность каждой сцены
5. Практичный и понятный язык`;

  const result = await generateWithAI(
    `Напиши сценарий короткого обучающего видео на тему "${topic}" для курса "${courseTitle}"`,
    systemPrompt
  );

  return result.content || "";
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
    const lessons = await generateCourseStructure(courseTitle);
    console.log(`Generated ${lessons.length} lessons for ${courseTitle}`);

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

      await new Promise(r => setTimeout(r, 2000));

      if (lesson.type === "lesson") {
        const blocks = await generateLessonContent(lesson.title, courseTitle);
        const markdown = blocksToMarkdown(blocks);
        
        await supabase
          .from("lessons")
          .update({ content: markdown })
          .eq("id", lessonData.id);
          
        console.log(`Generated content for lesson: ${lesson.title}`);
      } else {
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
    // SECURITY: Verify authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create authenticated client to verify the caller
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user identity
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user has appropriate role (organization or admin)
    const { data: roleData } = await supabaseAuth
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roleData || (roleData.role !== 'organization' && roleData.role !== 'admin')) {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions. Organization or admin role required." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get caller's organization for authorization
    const { data: callerProfile } = await supabaseAuth
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    // Rate limiting: 10 AI generation requests per minute per user
    const rl = checkRateLimit(`ai:${user.id}`, { maxRequests: 10, windowSeconds: 60 });
    if (!rl.allowed) {
      return rateLimitResponse(rl, corsHeaders);
    }

    const body = await req.json();
    const { courseId, organizationId, lessonTitle, courseTitle, courseDescription, contentType } = body;

    // Handle description generation
    if (contentType === "description" && courseTitle) {
      console.log(`Generating description for course: ${courseTitle} (user: ${user.id})`);
      const systemPrompt = `Ты эксперт по созданию описаний учебных курсов. Напиши привлекательное и информативное описание курса.
Правила:
1. 2-4 абзаца
2. Опиши цели курса, для кого он подходит, что студент получит
3. Профессиональный тон
4. На русском языке`;
      const result = await generateWithAI(
        `Напиши описание для курса: "${courseTitle}"`,
        systemPrompt
      );
      return new Response(
        JSON.stringify({ success: true, content: result.content || "" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle short description generation
    if (contentType === "short_description" && courseTitle) {
      console.log(`Generating short description for course: ${courseTitle} (user: ${user.id})`);
      const systemPrompt = `Ты эксперт по маркетингу образовательных курсов. Напиши краткое, цепляющее описание курса для каталога.
Правила:
1. Максимум 2-3 предложения
2. Ёмко и привлекательно
3. Подчеркни ключевую ценность курса
4. На русском языке`;
      const prompt = courseDescription
        ? `Напиши краткое описание для каталога. Курс: "${courseTitle}". Полное описание: "${courseDescription}"`
        : `Напиши краткое описание для каталога. Курс: "${courseTitle}"`;
      const result = await generateWithAI(prompt, systemPrompt);
      return new Response(
        JSON.stringify({ success: true, content: result.content || "" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle individual content generation requests
    if (contentType && lessonTitle) {
      console.log(`Generating ${contentType} for: ${lessonTitle} (user: ${user.id})`);
      
      switch (contentType) {
        case "test": {
          const questions = await generateTestQuestions(lessonTitle, courseTitle || "Курс");
          return new Response(
            JSON.stringify({ 
              success: true, 
              content: JSON.stringify(questions) 
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        case "slides": {
          const slides = await generateSlides(lessonTitle, courseTitle || "Курс");
          return new Response(
            JSON.stringify({ 
              success: true, 
              content: JSON.stringify(slides) 
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        case "text":
        case "lesson": {
          const content = await generateTextContent(lessonTitle, courseTitle || "Курс");
          return new Response(
            JSON.stringify({ 
              success: true, 
              content 
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        case "image": {
          const imageUrl = await generateImage(`${lessonTitle}. Context: ${courseTitle || "educational course"}`);
          return new Response(
            JSON.stringify({ 
              success: true, 
              imageUrl: imageUrl,
              content: imageUrl || ""
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        case "video_script": {
          const script = await generateVideoScript(lessonTitle, courseTitle || "Курс");
          return new Response(
            JSON.stringify({ 
              success: true, 
              content: script
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        case "quiz": {
          const quizSystemPrompt = `Ты эксперт по созданию образовательных мини-квизов. Создай один вопрос с вариантами ответов для проверки понимания материала.
Правила:
1. Один чёткий вопрос по теме
2. 3-4 варианта ответа
3. Только один правильный ответ
4. Краткое пояснение почему ответ правильный
5. На русском языке`;

          const quizTool = {
            type: "function",
            function: {
              name: "create_quiz",
              description: "Создает мини-квиз с вопросом и вариантами ответов",
              parameters: {
                type: "object",
                properties: {
                  question: { type: "string", description: "Вопрос квиза" },
                  options: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        text: { type: "string" },
                        isCorrect: { type: "boolean" }
                      },
                      required: ["text", "isCorrect"],
                      additionalProperties: false
                    }
                  },
                  explanation: { type: "string", description: "Пояснение к правильному ответу" }
                },
                required: ["question", "options", "explanation"],
                additionalProperties: false
              }
            }
          };

          const quizResult = await generateWithAI(
            `Создай мини-квиз по теме "${lessonTitle}" для курса "${courseTitle || "Курс"}"`,
            quizSystemPrompt,
            quizTool
          );

          return new Response(
            JSON.stringify({ 
              success: true, 
              quiz: quizResult
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        case "callout": {
          const calloutType = body.calloutType || "info";
          const typeLabels: Record<string, string> = { "callout-info": "информационный блок", "callout-warning": "предупреждение", "callout-tip": "полезный совет" };
          const label = typeLabels[calloutType] || "информационный блок";
          const calloutPrompt = `Ты эксперт по образовательному контенту. Напиши краткий ${label} (1-3 предложения) по теме "${lessonTitle}" для курса "${courseTitle || "Курс"}". Только текст, без заголовков и форматирования. На русском языке.`;
          const result = await generateWithAI(calloutPrompt, "Ты пишешь образовательный контент на русском языке.");
          return new Response(
            JSON.stringify({ success: true, content: result.content || "" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        case "quote": {
          const quotePrompt = `Найди или составь вдохновляющую цитату известного человека, связанную с темой "${lessonTitle}" курса "${courseTitle || "Курс"}". Формат: "Текст цитаты" — Автор. На русском языке.`;
          const result = await generateWithAI(quotePrompt, "Ты эксперт по образовательному контенту.");
          return new Response(
            JSON.stringify({ success: true, content: result.content || "" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        case "accordion": {
          const accordionTool = {
            type: "function",
            function: {
              name: "create_accordion",
              description: "Создает сворачиваемую секцию с заголовком и содержимым",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Краткий заголовок секции" },
                  content: { type: "string", description: "Подробное содержимое секции" }
                },
                required: ["title", "content"],
                additionalProperties: false
              }
            }
          };
          const accordionResult = await generateWithAI(
            `Создай сворачиваемую секцию с дополнительной информацией по теме "${lessonTitle}" для курса "${courseTitle || "Курс"}". Заголовок должен быть кратким и интригующим, содержимое — подробным и полезным. На русском языке.`,
            "Ты эксперт по созданию образовательного контента.",
            accordionTool
          );
          return new Response(
            JSON.stringify({ success: true, accordion: accordionResult }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        default:
          return new Response(
            JSON.stringify({ error: `Unknown content type: ${contentType}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
      }
    }

    // Handle full course generation - verify authorization
    const targetOrgId = organizationId || callerProfile?.organization_id;
    
    // SECURITY: Verify the caller has access to the target organization
    if (roleData.role !== 'admin' && callerProfile?.organization_id !== targetOrgId) {
      return new Response(
        JSON.stringify({ error: "You can only generate content for your own organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let coursesToProcess: Array<{ id: string; title: string }> = [];

    if (courseId) {
      // Verify the course belongs to the caller's organization
      const { data: course } = await supabase
        .from("courses")
        .select("id, title, organization_id")
        .eq("id", courseId)
        .single();
      
      if (course) {
        if (roleData.role !== 'admin' && course.organization_id !== callerProfile?.organization_id) {
          return new Response(
            JSON.stringify({ error: "You can only generate content for courses in your organization" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        coursesToProcess = [{ id: course.id, title: course.title }];
      }
    } else if (targetOrgId) {
      const { data: courses } = await supabase
        .from("courses")
        .select("id, title")
        .eq("organization_id", targetOrgId);

      if (courses) {
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

    const backgroundTask = async () => {
      for (const course of coursesToProcess) {
        await processOneCourse(supabase, course.id, course.title);
        await new Promise(r => setTimeout(r, 5000));
      }
      console.log(`Completed processing all ${coursesToProcess.length} courses for user ${user.id}`);
    };

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
