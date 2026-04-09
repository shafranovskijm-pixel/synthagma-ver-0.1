import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  // Get the app URL for redirects
  const appUrl = Deno.env.get("APP_URL") || "https://sintagma.com.ru";

  const redirect = (status: string, message: string) => {
    const redirectUrl = `${appUrl}/email-response?status=${encodeURIComponent(status)}&message=${encodeURIComponent(message)}`;
    return new Response(null, {
      status: 302,
      headers: { "Location": redirectUrl },
    });
  };

  if (!token) {
    return redirect("error", "Неверная ссылка. Токен не указан.");
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: tokenData, error: tokenError } = await supabase
      .from("email_action_tokens")
      .select("*")
      .eq("id", token)
      .single();

    if (tokenError || !tokenData) {
      return redirect("error", "Ссылка недействительна или срок действия истёк.");
    }

    if (tokenData.used) {
      return redirect("already", "Ваш запрос уже был принят ранее. Мы свяжемся с вами в ближайшее время.");
    }

    await supabase
      .from("email_action_tokens")
      .update({ used: true, used_at: new Date().toISOString() })
      .eq("id", token);

    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", tokenData.organization_id)
      .single();

    const orgName = org?.name || "Неизвестная организация";
    const actionLabel = tokenData.action_type === "consultation_request"
      ? "консультацию"
      : "помощь";

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

    return redirect("success", "Спасибо за ответ! Мы свяжемся с вами в ближайшее время для консультации.");
  } catch (error) {
    console.error("Error handling email action:", error);
    return redirect("error", "Произошла ошибка при обработке запроса. Попробуйте позже.");
  }
});
