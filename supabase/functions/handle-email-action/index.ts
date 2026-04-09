import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const appUrl = Deno.env.get("APP_URL") || "https://sintagma.com.ru";

  // GET — validate token and return org info for form pre-fill
  if (req.method === "GET") {
    const token = url.searchParams.get("token");
    if (!token) {
      return Response.json({ error: "Токен не указан" }, { status: 400, headers: corsHeaders });
    }

    try {
      const { data: tokenData, error } = await supabase
        .from("email_action_tokens")
        .select("*")
        .eq("id", token)
        .single();

      if (error || !tokenData) {
        return Response.json({ status: "error", message: "Ссылка недействительна или срок действия истёк." }, { headers: corsHeaders });
      }

      if (tokenData.used) {
        return Response.json({ status: "already", message: "Ваш запрос уже был принят ранее. Мы свяжемся с вами в ближайшее время." }, { headers: corsHeaders });
      }

      // Get org info for pre-fill
      const { data: org } = await supabase
        .from("organizations")
        .select("name, phone, email")
        .eq("id", tokenData.organization_id)
        .single();

      return Response.json({
        status: "pending",
        orgName: org?.name || "",
        orgPhone: org?.phone || "",
        orgEmail: tokenData.organization_email || org?.email || "",
      }, { headers: corsHeaders });
    } catch (err) {
      console.error("GET error:", err);
      return Response.json({ error: "Ошибка сервера" }, { status: 500, headers: corsHeaders });
    }
  }

  // POST — process the action with form data
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const { token, phone, comment } = body;

      if (!token) {
        return Response.json({ error: "Токен не указан" }, { status: 400, headers: corsHeaders });
      }

      const { data: tokenData, error: tokenError } = await supabase
        .from("email_action_tokens")
        .select("*")
        .eq("id", token)
        .single();

      if (tokenError || !tokenData) {
        return Response.json({ status: "error", message: "Ссылка недействительна или срок действия истёк." }, { headers: corsHeaders });
      }

      if (tokenData.used) {
        return Response.json({ status: "already", message: "Ваш запрос уже был принят ранее." }, { headers: corsHeaders });
      }

      // Mark token as used
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
      const actionLabel = tokenData.action_type === "consultation_request" ? "консультацию" : "помощь";

      // Build message with phone/comment
      let messageContent = `📩 Запрос из email-рассылки: организация «${orgName}» запросила ${actionLabel} (шаблон: ${tokenData.template_name})`;
      if (phone) messageContent += `\n📞 Телефон для связи: ${phone}`;
      if (comment) messageContent += `\n💬 Комментарий: ${comment}`;

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
          content: messageContent,
          is_read: false,
        });
      }

      // Telegram notification
      try {
        const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
        const chatId = Deno.env.get("TELEGRAM_SUPPORT_CHAT_ID");
        if (telegramToken && chatId) {
          let tgMessage = `📩 Ответ на email-рассылку!\n\nОрганизация: ${orgName}\nEmail: ${tokenData.organization_email}\nЗапрос: ${actionLabel}\nШаблон: ${tokenData.template_name}`;
          if (phone) tgMessage += `\n📞 Телефон: ${phone}`;
          if (comment) tgMessage += `\n💬 Комментарий: ${comment}`;
          
          await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: tgMessage }),
          });
        }
      } catch (tgErr) {
        console.error("Telegram notification error:", tgErr);
      }

      return Response.json({ status: "success", message: "Спасибо за ответ! Мы свяжемся с вами в ближайшее время." }, { headers: corsHeaders });
    } catch (err) {
      console.error("POST error:", err);
      return Response.json({ error: "Ошибка сервера" }, { status: 500, headers: corsHeaders });
    }
  }

  return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
});
