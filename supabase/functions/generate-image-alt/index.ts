import { withAuth } from "../_shared/handler.ts";

interface AltBody {
  imageUrl?: string;
  hint?: string;
}

Deno.serve(withAuth(async ({ body }) => {
  const { imageUrl, hint } = (body ?? {}) as AltBody;

  if (!imageUrl || typeof imageUrl !== "string") {
    return new Response(JSON.stringify({ error: "imageUrl is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userText = `Опиши изображение коротко (до 120 символов) на русском языке для атрибута alt веб-страницы. Используй нейтральный, описательный стиль, без вводных слов вроде "На картинке". ${hint ? `Контекст: ${hint}.` : ""}`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error("AI gateway error:", resp.status, errText);
    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "Слишком много запросов, попробуйте позже" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "Лимит ИИ исчерпан" }), {
        status: 402,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Не удалось сгенерировать описание" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const data = await resp.json();
  const raw: string = data?.choices?.[0]?.message?.content?.toString().trim() || "";
  const alt = raw.replace(/^["«»']+|["«»']+$/g, "").slice(0, 150);

  return { alt };
}));
