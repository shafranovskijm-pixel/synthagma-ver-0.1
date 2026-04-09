import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  const htmlResponse = (title: string, message: string, success: boolean) => {
    return new Response(
      `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f8f9fa; }
    .card { background: white; border-radius: 16px; padding: 48px; max-width: 480px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; color: #1a1a1a; margin: 0 0 12px; }
    p { font-size: 15px; color: #666; line-height: 1.6; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? "✅" : "⚠️"}</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  };

  if (!token) {
    return htmlResponse("Ошибка", "Неверная ссылка. Токен не указан.", false);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find the token
    const { data: tokenData, error: tokenError } = await supabase
      .from("email_action_tokens")
      .select("*")
      .eq("id", token)
      .single();

    if (tokenError || !tokenData) {
      return htmlResponse("Ошибка", "Ссылка недействительна или срок действия истёк.", false);
    }

    if (tokenData.used) {
      return htmlResponse("Уже обработано", "Ваш запрос уже был принят ранее. Мы свяжемся с вами в ближайшее время.", false);
    }

    // Mark as used
    await supabase
      .from("email_action_tokens")
      .update({ used: true, used_at: new Date().toISOString() })
      .eq("id", token);

    // Get organization name
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", tokenData.organization_id)
      .single();

    const orgName = org?.name || "Неизвестная организация";
    const actionLabel = tokenData.action_type === "consultation_request"
      ? "консультацию"
      : "помощь";

    // Insert message into admin_org_messages
    // Find any admin user to use as sender_user_id (the org is responding)
    const { data: orgProfile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("organization_id", tokenData.organization_id)
      .limit(1)
      .single();

    if (orgProfile) {
      await supabase.from("admin_org_messages").insert({
        organization_id: tokenData.organization_id,
        sender_user_id: orgProfile.user_id,
        sender_role: "organization",
        content: `📩 Запрос из email-рассылки: организация «${orgName}» запросила ${actionLabel} (шаблон: ${tokenData.template_name})`,
        is_read: false,
      });
    }

    // Send Telegram notification
    try {
      const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
      const chatId = Deno.env.get("TELEGRAM_SUPPORT_CHAT_ID");
      if (telegramToken && chatId) {
        const tgMessage = `📩 Ответ на email-рассылку!\n\nОрганизация: ${orgName}\nEmail: ${tokenData.organization_email}\nЗапрос: ${actionLabel}\nШаблон: ${tokenData.template_name}`;
        await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: tgMessage, parse_mode: "HTML" }),
        });
      }
    } catch (tgErr) {
      console.error("Telegram notification error:", tgErr);
    }

    return htmlResponse(
      "Запрос принят!",
      "Спасибо за ответ! Мы свяжемся с вами в ближайшее время для консультации.",
      true
    );
  } catch (error) {
    console.error("Error handling email action:", error);
    return htmlResponse("Ошибка", "Произошла ошибка при обработке запроса. Попробуйте позже.", false);
  }
});
