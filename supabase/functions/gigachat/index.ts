// GigaChat integration for test answer generation and content creation
// Falls back to Lovable AI when GigaChat certificate errors occur
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Cache for GigaChat OAuth token
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getGigaChatToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && tokenExpiresAt > now + 300) {
    return cachedToken;
  }

  const authKey = Deno.env.get("GIGACHAT_AUTH_KEY");
  if (!authKey) throw new Error("GIGACHAT_AUTH_KEY is not configured");

  const rquid = crypto.randomUUID();

  const response = await fetch("https://ngw.devices.sberbank.ru:9443/api/v2/oauth", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
      "RqUID": rquid,
      "Authorization": `Basic ${authKey}`,
    },
    body: "scope=GIGACHAT_API_PERS",
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("GigaChat OAuth error:", response.status, errorText);
    throw new Error(`GigaChat OAuth failed: ${response.status}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiresAt = data.expires_at;
  return cachedToken!;
}

async function callGigaChat(messages: Array<{ role: string; content: string }>, model = "GigaChat", maxTokens = 4096): Promise<string> {
  const token = await getGigaChatToken();

  const response = await fetch("https://gigachat.devices.sberbank.ru/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("GigaChat API error:", response.status, errorText);
    if (response.status === 429) {
      throw new Error("GigaChat rate limit exceeded, try again later");
    }
    throw new Error(`GigaChat API error: ${response.status}`);
  }

  const result = await response.json();
  return result.choices?.[0]?.message?.content || "";
}

async function callLovableAI(messages: Array<{ role: string; content: string }>, maxTokens = 4096): Promise<string> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = attempt * 3000;
      console.log(`[callLovableAI] retry ${attempt + 1}/${MAX_RETRIES}, waiting ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }

    let response: Response;
    try {
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          temperature: 0.7,
          max_tokens: maxTokens,
        }),
      });
    } catch (fetchErr) {
      console.warn(`[callLovableAI] fetch error attempt ${attempt + 1}:`, fetchErr);
      if (attempt === MAX_RETRIES - 1) throw new Error("AI gateway: network error after retries");
      continue;
    }

    // Surface 402/429 immediately without retry
    if (response.status === 402) {
      try { await response.text(); } catch {}
      throw new Error("Требуется пополнение баланса ИИ-кредитов (402)");
    }
    if (response.status === 429) {
      try { await response.text(); } catch {}
      throw new Error("AI rate limit exceeded (429)");
    }

    let text: string;
    try {
      text = await response.text();
    } catch (bodyErr) {
      console.warn(`[callLovableAI] body read error attempt ${attempt + 1}:`, bodyErr);
      if (attempt === MAX_RETRIES - 1) throw new Error("AI gateway: failed to read response body after retries");
      continue;
    }

    if (!response.ok) {
      console.error("Lovable AI error:", response.status, text);
      if (attempt === MAX_RETRIES - 1) throw new Error(`AI gateway error: ${response.status}`);
      continue;
    }

    if (!text || text.trim() === "") {
      console.warn(`[callLovableAI] empty response attempt ${attempt + 1}`);
      if (attempt === MAX_RETRIES - 1) throw new Error("AI gateway returned empty response");
      continue;
    }

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      console.error("Failed to parse AI response:", text.substring(0, 500));
      if (attempt === MAX_RETRIES - 1) throw new Error("AI gateway returned invalid JSON");
      continue;
    }

    return result.choices?.[0]?.message?.content || "";
  }

  throw new Error("AI gateway: all retries exhausted");
}

async function callAI(messages: Array<{ role: string; content: string }>, maxTokens = 4096): Promise<{ text: string; model: string }> {
  // Try GigaChat first, fallback to Lovable AI on certificate/network errors
  try {
    const text = await callGigaChat(messages, "GigaChat", maxTokens);
    return { text, model: "GigaChat" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("GigaChat unavailable, falling back to Lovable AI:", msg);
    const text = await callLovableAI(messages, maxTokens);
    return { text, model: "Gemini 2.5 Flash" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Role check
    const { data: roleData } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id).single();
    if (!roleData || (roleData.role !== "organization" && roleData.role !== "admin")) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit
    const rl = checkRateLimit(`gigachat:${user.id}`, { maxRequests: 10, windowSeconds: 60 });
    if (!rl.allowed) return rateLimitResponse(rl, corsHeaders);

    const body = await req.json();
    const { action, courseTitle, lessonTitle, questions, existingContent, customSystemPrompt } = body;

    // Log AI usage
    const { data: profile } = await supabase
      .from("profiles").select("organization_id").eq("user_id", user.id).single();
    if (profile?.organization_id) {
      await supabase.from("ai_usage_log").insert({
        user_id: user.id,
        organization_id: profile.organization_id,
        function_name: `gigachat_${action}`,
        tokens_used: 0,
      });
    }

    let result: any;

    if (action === "generate_answers") {
      const questionsText = questions.map((q: any, i: number) => {
        const opts = q.options.map((o: any, j: number) => {
          const text = typeof o === 'string' ? o : (o?.text || o?.label || String(o));
          return `  ${j + 1}) ${text}`;
        }).join("\n");
        return `Вопрос ${i + 1}: ${q.question}\n${opts}`;
      }).join("\n\n");

      const defaultAnswersPrompt = `Ты эксперт в области промышленной безопасности, охраны труда и нормативов Ростехнадзора. 
Тебе даны тестовые вопросы с вариантами ответов. Определи правильный ответ для каждого вопроса.
Отвечай СТРОГО в формате JSON-массива, где каждый элемент — объект с полями:
- "questionIndex": номер вопроса (начиная с 0)
- "correctAnswer": индекс правильного ответа (начиная с 0)
- "explanation": краткое пояснение, почему этот ответ правильный (1-2 предложения)

Пример: [{"questionIndex": 0, "correctAnswer": 2, "explanation": "Согласно ФЗ-116..."}]
Отвечай ТОЛЬКО JSON-массивом, без markdown-обертки.`;
      const systemPrompt = (action === "generate_answers" && customSystemPrompt) ? customSystemPrompt : defaultAnswersPrompt;

      const prompt = `Курс: "${courseTitle}"\nУрок: "${lessonTitle}"\n\n${questionsText}`;
      const { text: response, model } = await callAI([
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ], 16384);

      try {
        const cleaned = response.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        result = { answers: JSON.parse(cleaned), model };
      } catch {
        console.error("Failed to parse AI response:", response);
        result = { answers: [], raw: response, parseError: true, model };
      }

    } else if (action === "generate_content") {
      const contextNote = existingContent
        ? `\n\nВ уроке уже есть контент, НЕ повторяй его:\n${existingContent.slice(0, 1500)}`
        : "";

      const defaultContentPrompt = `Ты эксперт по промышленной безопасности и нормативам Ростехнадзора. Создай подробный учебный материал.
Правила:
1. Структурированный текст с заголовками (используй Markdown)
2. Ссылки на нормативные документы (ФЗ, приказы, постановления)
3. Практические примеры и ситуации
4. Минимум 500 слов
5. На русском языке${contextNote}`;
      const systemPrompt = customSystemPrompt ? (customSystemPrompt + contextNote) : defaultContentPrompt;

      const { text: content, model } = await callAI([
        { role: "system", content: systemPrompt },
        { role: "user", content: `Напиши учебный материал для урока "${lessonTitle}" курса "${courseTitle}"` },
      ]);
      result = { content, model };

    } else if (action === "generate_questions") {
      const systemPrompt = `Ты эксперт по промышленной безопасности и нормативам Ростехнадзора. Создай тестовые вопросы.
Отвечай СТРОГО в формате JSON-массива, каждый элемент:
- "question": текст вопроса
- "options": массив из 4 вариантов ответа
- "correctAnswer": индекс правильного ответа (0-3)
- "explanation": краткое пояснение

Создай 10 вопросов разной сложности. Отвечай ТОЛЬКО JSON-массивом.`; // generate_questions doesn't use customSystemPrompt

      const { text: response, model } = await callAI([
        { role: "system", content: systemPrompt },
        { role: "user", content: `Создай тестовые вопросы для теста "${lessonTitle}" курса "${courseTitle}"` },
      ]);

      try {
        const cleaned = response.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        result = { questions: JSON.parse(cleaned), model };
      } catch {
        result = { questions: [], raw: response, parseError: true, model };
      }

    } else {
      return new Response(JSON.stringify({ error: "Unknown action" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("GigaChat function error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("rate limit") ? 429 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
