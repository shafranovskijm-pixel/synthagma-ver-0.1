import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  if (req.method === "POST") {
    try {
      const body = await req.json();

      // Validate token (check status without marking used)
      if (body.action === "validate") {
        const requestToken = typeof body.token === "string" ? body.token : "";
        if (!requestToken) {
          return json(400, { ok: false, error: "Токен не указан." });
        }

        const { data: tokenData, error } = await supabase
          .from("email_action_tokens")
          .select("*")
          .eq("id", requestToken)
          .single();

        if (error || !tokenData) {
          return json(404, { ok: false, error: "Ссылка недействительна или срок действия истёк." });
        }

        if (tokenData.used) {
          return json(200, {
            ok: false,
            used: true,
            message: "Ваш запрос уже был принят ранее. Мы свяжемся с вами в ближайшее время.",
          });
        }

        const { data: org } = await supabase
          .from("organizations")
          .select("name, phone")
          .eq("id", tokenData.organization_id)
          .single();

        return json(200, {
          ok: true,
          orgName: org?.name || "",
          phone: org?.phone || "",
        });
      }

      // Submit consultation request
      const requestToken = typeof body.token === "string" ? body.token : "";
      const phone = typeof body.phone === "string" ? body.phone.trim() : "";
      const comment = typeof body.comment === "string" ? body.comment.trim() : "";

      if (!requestToken) {
        return json(400, { ok: false, error: "Токен не указан." });
      }

      const { data: tokenData, error: tokenError } = await supabase
        .from("email_action_tokens")
        .select("*")
        .eq("id", requestToken)
        .single();

      if (tokenError || !tokenData) {
        return json(404, { ok: false, error: "Ссылка недействительна или срок действия истёк." });
      }

      if (tokenData.used) {
        return json(200, {
          ok: true,
          status: "already",
          message: "Ваш запрос уже был принят ранее. Мы свяжемся с вами в ближайшее время.",
        });
      }

      await supabase
        .from("email_action_tokens")
        .update({ used: true, used_at: new Date().toISOString() })
        .eq("id", requestToken);

      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", tokenData.organization_id)
        .single();

      const orgName = org?.name || "Неизвестная организация";
      const actionLabel = tokenData.action_type === "consultation_request" ? "консультацию" : "помощь";

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

      return json(200, {
        ok: true,
        status: "success",
        message: "Спасибо за ответ! Мы свяжемся с вами в ближайшее время.",
      });
    } catch (error) {
      console.error("POST error:", error);
      return json(500, { ok: false, error: "Произошла ошибка при отправке формы." });
    }
  }

  return json(405, { ok: false, error: `Метод ${req.method} не поддерживается.` });
});
