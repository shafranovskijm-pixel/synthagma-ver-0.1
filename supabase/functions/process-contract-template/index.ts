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

    const systemPrompt = `Ты эксперт по обработке шаблонов договоров на русском языке. 

ГЛАВНОЕ ПРАВИЛО: Ты ТОЛЬКО заменяешь конкретные данные (числа, ФИО, названия, адреса, реквизиты) на переменные. Весь остальной текст документа ДОЛЖЕН ОСТАТЬСЯ БЕЗ ИЗМЕНЕНИЙ — слово в слово. НЕ удаляй, НЕ перефразируй, НЕ сокращай, НЕ добавляй ничего нового. Длина результата должна быть примерно равна длине исходного текста.

Доступные переменные:
${placeholdersList}

ПРАВИЛА ЗАМЕНЫ:

1. РЕКВИЗИТЫ (заменяй ТОЛЬКО числа, оставляя окружающий текст):
   - ИНН (10-12 цифр) → {{org_inn}} для исполнителя, {{company_inn}} для заказчика
   - КПП (9 цифр) → {{org_kpp}} или {{company_kpp}}
   - ОГРН/ОГРНИП (13-15 цифр) → {{org_ogrn}} или {{company_ogrn}}
   - БИК (9 цифр) → {{org_bank_bik}}
   - Р/с или расчётный счёт (20 цифр) → {{org_bank_account}}
   - К/с или корр. счёт (20 цифр) → {{org_bank_corr_account}}

2. ОРГАНИЗАЦИИ (заменяй ТОЛЬКО название, оставляя ОПФ):
   - "ООО «Название»" → "ООО «{{org_name}}»" (если Исполнитель) или "ООО «{{company_name}}»" (если Заказчик)
   - Определяй по контексту: "Исполнитель", "образовательная организация", "лицензия" → org_; "Заказчик", "клиент" → company_

3. ФИО И ДОЛЖНОСТИ:
   - "в лице Генерального директора Ивановой Екатерины Владимировны" → "в лице {{org_director_position}} {{org_director_name_genitive}}"
   - Для должности в родительном падеже ("Генерального директора") используй {{org_director_position}}
   - Для ФИО в родительном падеже используй {{org_director_name_genitive}}
   - "действующего/действующей на основании" → "{{org_director_acting}} на основании"
   - ФИО в именительном падеже (в подписях, "/ Иванов И.И. /") → {{org_director_name}}

4. ИП (ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ):
   - Если организация — ИП, то фразу "в лице [должность] [ФИО], действующего/ей на основании Устава," НУЖНО УБРАТЬ ПОЛНОСТЬЮ
   - "ИП Иванов Иван Иванович" → "ИП {{org_director_name}}"
   - Для ИП не нужны КПП

5. АДРЕСА (заменяй ВЕСЬ адрес целиком):
   - Полные адреса с индексом → {{org_address}} или {{company_address}}

6. БАНКОВСКИЕ РЕКВИЗИТЫ:
   - Название банка → {{org_bank_name}}

7. ДОГОВОР:
   - Номер договора → {{contract_number}}
   - Дата договора → {{contract_date}}

8. СУММЫ И КОЛИЧЕСТВА:
   - Денежные суммы → {{price}} или {{total_price}}
   - Количество людей → {{students_count}}

9. ОБРАЗОВАТЕЛЬНЫЕ УСЛУГИ:
   - Название курса/программы → {{course_title}}
   - Длительность → {{course_duration}}

10. ТАБЛИЦЫ ПРОГРАММ:
   - Если в договоре перечислены НЕСКОЛЬКО программ/курсов (в виде таблицы или нумерованного списка с названиями, часами, ценами) → замени ВСЮ таблицу или весь список программ на {{programs_table}}
   - Если программа одна — используй {{course_title}} и {{course_duration}} как обычно
   - Строку "Итого" в таблице программ → {{total_price}}
   - НЕ заменяй каждую строку таблицы отдельно — заменяй всю таблицу/список целиком на {{programs_table}}

КРИТИЧЕСКИ ВАЖНО:
- Верни ВЕСЬ текст документа целиком, заменив только конкретные данные на переменные
- НЕ ПРОПУСКАЙ абзацы, пункты, разделы — всё должно быть на месте
- НЕ добавляй пояснения — верни ТОЛЬКО обработанный текст
- Если не уверен в замене — ОСТАВЬ оригинальный текст как есть`;

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
          { role: "user", content: `Обработай следующий текст договора. Замени ТОЛЬКО конкретные данные на переменные, сохранив весь остальной текст без изменений:\n\n${text}` },
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
