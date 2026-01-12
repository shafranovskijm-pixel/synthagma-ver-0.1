import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, placeholders } = await req.json();
    
    if (!text) {
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const placeholdersList = placeholders.map((p: { key: string; label: string }) => 
      `${p.key} - ${p.label}`
    ).join("\n");

    const systemPrompt = `Ты помощник для обработки шаблонов договоров. Твоя задача - заменить конкретные данные в тексте договора на переменные в формате {{variable_name}}.

Доступные переменные:
${placeholdersList}

Правила замены:
1. Замени ИНН (10-12 цифр) на {{org_inn}} или {{company_inn}} в зависимости от контекста (исполнитель/заказчик)
2. Замени КПП (9 цифр) на {{org_kpp}} или {{company_kpp}}
3. Замени ОГРН (13-15 цифр) на {{org_ogrn}} или {{company_ogrn}}
4. Замени БИК (9 цифр) на {{org_bank_bik}}
5. Замени расчётные счета (20 цифр) на {{org_bank_account}} или {{org_bank_corr_account}}
6. Замени номер договора на {{contract_number}}
7. Замени дату договора на {{contract_date}}
8. Замени суммы в рублях на {{price}} или {{total_price}}
9. Замени количество обучающихся на {{students_count}}
10. Замени названия организаций на {{org_name}} или {{company_name}}
11. Замени ФИО руководителей на {{org_director_name}} или {{company_director}}
12. Замени адреса на {{org_address}} или {{company_address}}
13. Замени название курса на {{course_title}}

ВАЖНО: Верни ТОЛЬКО обработанный текст договора с переменными, без пояснений.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Обработай следующий текст договора и замени конкретные данные на переменные:\n\n${text}` },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI processing failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const processedText = data.choices?.[0]?.message?.content;

    if (!processedText) {
      console.error("No content in AI response:", data);
      return new Response(
        JSON.stringify({ error: "No response from AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Successfully processed contract template");

    return new Response(
      JSON.stringify({ processedText }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing contract template:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
