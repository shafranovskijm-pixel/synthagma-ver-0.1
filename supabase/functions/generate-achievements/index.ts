import { withAuth } from "../_shared/handler.ts";

interface AchBody {
  theme?: string;
  count?: number;
}

Deno.serve(withAuth(async ({ body }) => {
  const { theme, count = 6 } = (body ?? {}) as AchBody;
  if (!theme) {
    return new Response(JSON.stringify({ error: "Theme is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

  const prompt = `Сгенерируй ${count} достижений (achievements) для образовательной платформы по тематике: "${theme}".

Каждое достижение должно содержать:
- name: короткое название (2-4 слова)
- description: описание за что выдаётся (1 предложение)
- icon: один подходящий эмодзи
- rarity: одно из "common", "rare", "epic", "legendary" (распредели равномерно)
- category: одно из "start", "progress", "activity", "assessment"
- color: HEX цвет

Ответ должен быть JSON массивом объектов. Только JSON, без markdown.`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "Ты генератор достижений для образовательной LMS-платформы. Отвечай только JSON." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 429) {
      return new Response(JSON.stringify({ error: "Превышен лимит запросов, попробуйте позже" }), {
        status: 429, headers: { "Content-Type": "application/json" },
      });
    }
    if (status === 402) {
      return new Response(JSON.stringify({ error: "Необходимо пополнить баланс" }), {
        status: 402, headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`AI gateway error: ${status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "[]";

  let achievements;
  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    achievements = JSON.parse(cleaned);
  } catch {
    achievements = [];
  }

  return { achievements };
}));
