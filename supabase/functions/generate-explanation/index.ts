import { withAuth } from "../_shared/handler.ts";
import { callAI } from "../_shared/gigachat-client.ts";



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

  let explanation = "";
  try {
    const { text } = await callAI(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      2048,
      "gigachat",
    );
    explanation = text || "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("AI error:", msg);
    if (msg.includes("429")) {
      return new Response(
        JSON.stringify({ error: "Слишком много запросов. Подождите немного." }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
    if (msg.includes("402")) {
      return new Response(
        JSON.stringify({ error: "Требуется пополнение баланса." }),
        { status: 402, headers: { "Content-Type": "application/json" } }
      );
    }
    throw err;
  }

  console.log(`Generated explanation for user ${user.sub}`);


  return { explanation };
}));
