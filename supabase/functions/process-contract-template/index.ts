import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const systemPrompt = `Ты эксперт по обработке шаблонов договоров на русском языке. Твоя задача - заменить конкретные данные в тексте договора на переменные в формате {{variable_name}}.

Доступные переменные:
${placeholdersList}

ПРАВИЛА ЗАМЕНЫ (строго соблюдай):

1. РЕКВИЗИТЫ:
   - ИНН (10-12 цифр) → {{org_inn}} для исполнителя, {{company_inn}} для заказчика
   - КПП (9 цифр) → {{org_kpp}} или {{company_kpp}}
   - ОГРН/ОГРНИП (13-15 цифр) → {{org_ogrn}} или {{company_ogrn}}
   - БИК (9 цифр) → {{org_bank_bik}}
   - Р/с или расчётный счёт (20 цифр) → {{org_bank_account}}
   - К/с или корр. счёт (20 цифр) → {{org_bank_corr_account}}

2. ОРГАНИЗАЦИИ:
   - Названия типа "ООО «Название»", "АО «Название»", "ПАО «Название»" → {{org_name}} или {{company_name}}
   - ИП Фамилия Имя Отчество → ИП {{org_director_name}}
   - Определяй по контексту: слова "Исполнитель", "образовательная организация" → {{org_name}}; "Заказчик", "клиент" → {{company_name}}

3. ФИО И ДОЛЖНОСТИ:
   - "в лице Генерального директора Иванова Ивана Ивановича" → "в лице {{org_director_position}} {{org_director_name}}"
   - "Директора Петрова П.П." → "{{org_director_position}} {{org_director_name}}"
   - ФИО в сокращённой форме (Иванов И.И.) тоже заменяй

4. АДРЕСА:
   - Полные адреса с индексом → {{org_address}} или {{company_address}}
   - "г. Москва, ул. Примерная, д. 1" → {{org_address}}
   - Юридический/фактический адрес → {{org_address}}

5. БАНКОВСКИЕ РЕКВИЗИТЫ:
   - Название банка (ПАО Сбербанк, АО Тинькофф и т.д.) → {{org_bank_name}}

6. ДОГОВОР:
   - Номер договора (№ 123/2026, № 2026-01-001) → {{contract_number}}
   - Дата договора («12» января 2026 г., 12.01.2026) → {{contract_date}}

7. СУММЫ И КОЛИЧЕСТВА:
   - Денежные суммы (5 000,00 рублей, 50000 руб) → {{price}} или {{total_price}}
   - Количество людей (10 чел., 5 слушателей) → {{students_count}}

8. ОБРАЗОВАТЕЛЬНЫЕ УСЛУГИ:
   - Название курса/программы в кавычках → {{course_title}}
   - Длительность (40 часов, 72 академических часа) → {{course_duration}}

ВАЖНО: 
- Определяй Исполнителя и Заказчика по контексту договора
- Сохраняй структуру и форматирование документа
- НЕ добавляй пояснения - верни ТОЛЬКО обработанный текст
- Если не уверен в замене - оставь оригинальный текст`;

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
