import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TelegramRequest {
  chat_id?: string;
  message: string;
  photo_url?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!TELEGRAM_BOT_TOKEN) {
      throw new Error("TELEGRAM_BOT_TOKEN не настроен");
    }

    const { chat_id, message, photo_url }: TelegramRequest = await req.json();

    // Use provided chat_id or fallback to global support chat
    const targetChatId = chat_id || Deno.env.get("TELEGRAM_SUPPORT_CHAT_ID");

    if (!targetChatId) {
      throw new Error("chat_id не указан и TELEGRAM_SUPPORT_CHAT_ID не настроен");
    }

    if (!message) {
      throw new Error("message обязателен");
    }

    let result;

    if (photo_url) {
      // Send photo with caption
      const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;
      const response = await fetch(telegramUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: targetChatId,
          photo: photo_url,
          caption: message.slice(0, 1024),
          parse_mode: "HTML",
        }),
      });
      result = await response.json();
    } else {
      // Send text message
      const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      const response = await fetch(telegramUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: message,
          parse_mode: "HTML",
        }),
      });
      result = await response.json();
    }

    if (!result.ok) {
      console.error("Telegram API error:", result);

      // If photo failed, try sending as text with link
      if (photo_url) {
        const fallbackUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const fallbackResponse = await fetch(fallbackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: targetChatId,
            text: message,
            parse_mode: "HTML",
          }),
        });
        const fallbackResult = await fallbackResponse.json();
        if (!fallbackResult.ok) {
          throw new Error(fallbackResult.description || "Ошибка отправки в Telegram");
        }
        return new Response(
          JSON.stringify({ success: true, message_id: fallbackResult.result.message_id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      throw new Error(result.description || "Ошибка отправки в Telegram");
    }

    return new Response(
      JSON.stringify({ success: true, message_id: result.result.message_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Неизвестная ошибка";
    console.error("Error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
