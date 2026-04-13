import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { courseTitle, courseDescription, type } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemPrompt = "";
    let userPrompt = "";
    let tools: any[] = [];
    let toolChoice: any = undefined;

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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
          { role: "user", content: userPrompt },
        ],
        tools,
        tool_choice: toolChoice,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Слишком много запросов, попробуйте позже" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Недостаточно средств для ИИ-генерации" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-seo error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
