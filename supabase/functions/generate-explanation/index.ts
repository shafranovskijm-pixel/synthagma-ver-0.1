import { withAuth } from "../_shared/handler.ts";

interface ExplainBody {
  question?: string;
  options?: string[];
  correctAnswer?: number | null;
}

Deno.serve(withAuth(async ({ body, user }) => {
  const { question, options = [], correctAnswer } = (body ?? {}) as ExplainBody;

  if (correctAnswer === null || correctAnswer === undefined) {
    return new Response(
      JSON.stringify({ error: "Сначала отметьте правильный ответ" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY is not configured");
  }

  const correctOption = options[correctAnswer];
  const wrongOptions = options.filter((_, i) => i !== correctAnswer);

  const systemPrompt = `Ты — помощник преподавателя. Твоя задача — создавать краткие и понятные пояснения для тестовых вопросов.
Пояснение должно объяснить:
1. Почему правильный ответ верен
2. Почему другие варианты неверны (кратко)

Пиши кратко (2-4 предложения), понятным языком. Используй русский язык.`;

  const userPrompt = `Вопрос: "${question}"

Правильный ответ: "${correctOption}"

Неправильные варианты: ${wrongOptions.map((o) => `"${o}"`).join(", ")}

Напиши краткое пояснение, почему правильный ответ верен и почему другие варианты неверны.`;

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
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI gateway error:", response.status, errorText);

    if (response.status === 429) {
      return new Response(
        JSON.stringify({ error: "Слишком много запросов. Подождите немного." }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
    if (response.status === 402) {
      return new Response(
        JSON.stringify({ error: "Требуется пополнение баланса." }),
        { status: 402, headers: { "Content-Type": "application/json" } }
      );
    }
    throw new Error(`AI gateway error: ${response.status}`);
  }

  const data = await response.json();
  const explanation = data.choices?.[0]?.message?.content || "";

  console.log(`Generated explanation for user ${user.sub}`);

  return { explanation };
}));
