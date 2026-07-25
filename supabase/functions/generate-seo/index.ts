import { withAuth } from "../_shared/handler.ts";
import { callAIWithTools } from "../_shared/gigachat-client.ts";



interface SeoBody {
  courseTitle?: string;
  courseDescription?: string;
  type?: "seo" | "form";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolDef = any;

Deno.serve(withAuth(async ({ body }) => {
  const { courseTitle, courseDescription, type } = (body ?? {}) as SeoBody;

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

  let systemPrompt = "";
  let userPrompt = "";
  let tools: ToolDef[] = [];
  let toolChoice: ToolDef = undefined;

  if (type === "seo") {
    systemPrompt = "Ты SEO-специалист. Генерируй мета-теги для страницы онлайн-курса на русском языке.";
    userPrompt = `Курс: "${courseTitle}"\nОписание: "${courseDescription || "не указано"}"\n\nСгенерируй SEO мета-теги для этого курса.`;
    tools = [{
      type: "function",
      function: {
        name: "generate_seo",
        description: "Generate SEO meta tags for a course page",
        parameters: {
          type: "object",
          properties: {
            meta_title: { type: "string", description: "Title tag, max 60 chars, with keyword" },
            meta_description: { type: "string", description: "Meta description, max 160 chars, compelling" },
            keywords: { type: "string", description: "Comma-separated keywords, 5-8 items" },
          },
          required: ["meta_title", "meta_description", "keywords"],
          additionalProperties: false,
        },
      },
    }];
    toolChoice = { type: "function", function: { name: "generate_seo" } };
  } else if (type === "form") {
    systemPrompt = "Ты маркетолог. Создай убедительные тексты для формы записи на курс на русском языке.";
    userPrompt = `Курс: "${courseTitle}"\nОписание: "${courseDescription || "не указано"}"\n\nСоздай тексты для формы записи на этот курс.`;
    tools = [{
      type: "function",
      function: {
        name: "generate_form_texts",
        description: "Generate enrollment form texts",
        parameters: {
          type: "object",
          properties: {
            subtitle: { type: "string", description: "Form subtitle, motivating, 10-20 words" },
            button_text: { type: "string", description: "CTA button text, 2-4 words" },
          },
          required: ["subtitle", "button_text"],
          additionalProperties: false,
        },
      },
    }];
    toolChoice = { type: "function", function: { name: "generate_form_texts" } };
  } else {
    return new Response(JSON.stringify({ error: "Unknown type" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const result = await callAIWithTools(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools[0],
      "GigaChat-Max",
      "google/gemini-3-flash-preview",
      "gigachat",
    );
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("AI error:", msg);
    if (msg.includes("429")) {
      return new Response(JSON.stringify({ error: "Слишком много запросов, попробуйте позже" }), {
        status: 429, headers: { "Content-Type": "application/json" },
      });
    }
    if (msg.includes("402")) {
      return new Response(JSON.stringify({ error: "Недостаточно средств для ИИ-генерации" }), {
        status: 402, headers: { "Content-Type": "application/json" },
      });
    }
    throw err;
  }

}));

