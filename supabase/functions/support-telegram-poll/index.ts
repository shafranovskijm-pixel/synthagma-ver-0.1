import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_RUNTIME_MS = 50_000;
const MIN_REMAINING_MS = 5_000;

serve(async () => {
  const startTime = Date.now();
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!botToken) {
    return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN missing" }), { status: 500, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: state } = await supabase
    .from("support_telegram_state")
    .select("update_offset")
    .eq("id", 1).single();

  let offset = state?.update_offset ?? 0;
  let processed = 0;

  while (true) {
    const elapsed = Date.now() - startTime;
    const remaining = MAX_RUNTIME_MS - elapsed;
    if (remaining < MIN_REMAINING_MS) break;
    const timeout = Math.min(45, Math.floor(remaining / 1000) - 5);
    if (timeout < 1) break;

    const resp = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offset, timeout, allowed_updates: ["message"] }),
    });
    const data = await resp.json();
    if (!data.ok) {
      console.error("getUpdates error:", data);
      break;
    }
    const updates = data.result ?? [];
    if (updates.length === 0) continue;

    for (const u of updates) {
      const msg = u.message;
      if (!msg || !msg.message_thread_id || !msg.text) continue;
      // Игнорируем сообщения от самого бота (зеркала)
      if (msg.from?.is_bot) continue;
      // Игнорируем сообщения с эмодзи-префиксами (наши собственные дубликаты)
      if (msg.text.startsWith("👤 ") || msg.text.startsWith("🤖 ") || msg.text.startsWith("⚠️ ")) continue;

      const topicId = msg.message_thread_id;
      const operatorName = msg.from?.first_name
        ? `${msg.from.first_name}${msg.from.last_name ? ' ' + msg.from.last_name : ''}`
        : 'Оператор';

      // Найти диалог по topic_id
      const { data: conv } = await supabase.from("support_conversations")
        .select("id, status").eq("telegram_topic_id", topicId).maybeSingle();
      if (!conv) continue;

      // Сохраняем как сообщение оператора
      await supabase.from("support_messages").insert({
        conversation_id: conv.id,
        role: "operator",
        content: msg.text,
        sender_name: operatorName,
        telegram_message_id: msg.message_id,
      });

      // Если диалог был на ИИ — переводим на человека
      if (conv.status === 'ai') {
        await supabase.from("support_conversations")
          .update({ status: 'human' }).eq("id", conv.id);
      }
      processed++;
    }

    offset = Math.max(...updates.map((u: { update_id: number }) => u.update_id)) + 1;
    await supabase.from("support_telegram_state")
      .update({ update_offset: offset, updated_at: new Date().toISOString() })
      .eq("id", 1);
  }

  return new Response(JSON.stringify({ ok: true, processed, offset }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
