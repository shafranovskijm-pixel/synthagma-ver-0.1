const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STYLE_HINTS: Record<string, string> = {
  friendly: "тёплый, поддерживающий, использует примеры из жизни",
  strict: "строгий академический преподаватель, требовательный, чёткий",
  mentor: "опытный наставник-практик, делится опытом, задаёт наводящие вопросы",
  peer: "общается на равных, как коллега, без формальностей",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { subject, style, name, courseTitle } = await req.json();
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY не настроен");

    const styleHint = STYLE_HINTS[style] || STYLE_HINTS.friendly;
    const tutorName = name || "виртуальный преподаватель";

    const userPrompt = `Создай system-prompt и приветственную фразу для голосового ИИ-преподавателя.

Имя преподавателя: ${tutorName}
Тема/предмет: ${subject || courseTitle || "общая образовательная программа"}
${courseTitle ? `Курс: ${courseTitle}` : ""}
Стиль общения: ${styleHint}

Требования к system-prompt (на русском, 4-7 предложений):
- Чётко описать роль и предмет
- Указать стиль общения
- Голосовой формат (короткие реплики 1-3 предложения, без markdown, без списков)
- Поощрять вопросы ученика, задавать контрольные вопросы по ходу
- Лимит сессии — 5 минут, темп должен это учитывать
- При вопросах вне темы вежливо возвращать к материалу

Приветствие (1-2 предложения, как первая фраза вживую): представиться, обозначить тему, пригласить задавать вопросы.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Ты помощник для генерации промптов голосовых ИИ-преподавателей. Возвращай только JSON." },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_tutor_config",
            description: "Возвращает system-prompt и приветствие",
            parameters: {
              type: "object",
              properties: {
                systemPrompt: { type: "string", description: "System prompt на русском" },
                greeting: { type: "string", description: "Приветственная фраза" },
              },
              required: ["systemPrompt", "greeting"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_tutor_config" } },
      }),
    });

    if (resp.status === 429) return json({ error: "Превышен лимит запросов, повторите позже" }, 429);
    if (resp.status === 402) return json({ error: "Недостаточно ИИ-кредитов" }, 402);
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI gateway error", resp.status, t);
      return json({ error: "Ошибка генерации" }, 500);
    }
    const data = await resp.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args ? JSON.parse(args) : null;
    if (!parsed?.systemPrompt) return json({ error: "Пустой ответ модели" }, 500);
    return json(parsed);
  } catch (e) {
    console.error("[ai-avatar-generate-prompt]", e);
    return json({ error: (e as Error).message || "Internal" }, 500);
  }
});

function json(d: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(d), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }, status,
  });
}
