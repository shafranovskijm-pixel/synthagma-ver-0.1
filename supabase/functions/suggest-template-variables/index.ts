// AI-подсказки переменных для шаблона договора.
// Принимает массив слотов { id, context } + справочник допустимых ключей.
// Возвращает [{ id, suggested_key, confidence }].
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      return new Response(JSON.stringify({ suggestions: [], warning: "AI недоступен" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "Не авторизован" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const slots: Array<{ id: string; context: string; hint?: string }> = Array.isArray(body?.slots) ? body.slots : [];
    const catalog: Array<{ key: string; label: string }> = Array.isArray(body?.catalog) ? body.catalog : [];
    if (slots.length === 0 || catalog.length === 0) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Ограничим объём.
    const trimmedSlots = slots.slice(0, 80).map(s => ({
      id: String(s.id),
      context: String(s.context || "").slice(0, 240),
      hint: s.hint ? String(s.hint) : undefined,
    }));

    const catalogText = catalog.map(c => `- ${c.key} — ${c.label}`).join("\n");
    const system = `Ты сопоставляешь пустые поля из юридического договора с каноническими ключами переменных. Возвращай СТРОГО валидный JSON без markdown: {"suggestions":[{"id":"slot_0","suggested_key":"individual_name","confidence":0.92}, ...]}. Используй ТОЛЬКО ключи из справочника. Если подходящего нет — верни "suggested_key": null и confidence 0. confidence ∈ [0,1].`;
    const userPrompt = `Справочник ключей:\n${catalogText}\n\nСлоты (контекст ⟦токен⟧):\n${trimmedSlots
      .map(s => `${s.id}: ${s.context}${s.hint ? ` [подсказка: ${s.hint}]` : ""}`)
      .join("\n")}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": lovableKey,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI error:", aiRes.status, errText);
      return new Response(
        JSON.stringify({ suggestions: [], warning: `AI ${aiRes.status}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const aiData = await aiRes.json();
    const content = aiData?.choices?.[0]?.message?.content || "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {};
    }
    const suggestions = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
    const allowed = new Set(catalog.map(c => c.key.replace(/[{}]/g, "")));
    const clean = suggestions
      .map((s: any) => ({
        id: String(s?.id || ""),
        suggested_key: typeof s?.suggested_key === "string" ? s.suggested_key.replace(/[{}]/g, "") : null,
        confidence: typeof s?.confidence === "number" ? Math.max(0, Math.min(1, s.confidence)) : 0,
      }))
      .filter((s: any) => s.id && (!s.suggested_key || allowed.has(s.suggested_key)));

    return new Response(JSON.stringify({ suggestions: clean }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("suggest-template-variables error:", e);
    return new Response(JSON.stringify({ error: e?.message || "unknown", suggestions: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
