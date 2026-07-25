import { withAuth } from "../_shared/handler.ts";
import { callAI } from "../_shared/gigachat-client.ts";



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

  let content = "[]";
  try {
    const { text } = await callAI(
      [
        { role: "system", content: "Ты генератор достижений для образовательной LMS-платформы. Отвечай только JSON." },
        { role: "user", content: prompt },
      ],
      4096,
      "gigachat",
    );
    content = text || "[]";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("429")) {
      return new Response(JSON.stringify({ error: "Превышен лимит запросов, попробуйте позже" }), {
        status: 429, headers: { "Content-Type": "application/json" },
      });
    }
    if (msg.includes("402")) {
      return new Response(JSON.stringify({ error: "Необходимо пополнить баланс" }), {
        status: 402, headers: { "Content-Type": "application/json" },
      });
    }
    throw e;
  }


  let achievements;
  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    achievements = JSON.parse(cleaned);
  } catch {
    achievements = [];
  }

  return { achievements };
}));
