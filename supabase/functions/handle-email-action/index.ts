import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const appUrl = Deno.env.get("APP_URL") || "https://sintagma.com.ru";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const renderResultPage = (status: "success" | "already" | "error", message: string) => {
  const config = {
    success: {
      title: "Запрос принят!",
      icon: "✓",
      accent: "#15803d",
      bg: "#f0fdf4",
      border: "#86efac",
    },
    already: {
      title: "Уже обработано",
      icon: "i",
      accent: "#1d4ed8",
      bg: "#eff6ff",
      border: "#93c5fd",
    },
    error: {
      title: "Ошибка",
      icon: "!",
      accent: "#d97706",
      bg: "#fffbeb",
      border: "#fcd34d",
    },
  }[status];

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${config.title} — Sintagma</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #f8fafc; color: #0f172a; }
    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .card { width: 100%; max-width: 520px; background: ${config.bg}; border: 1px solid ${config.border}; border-radius: 24px; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08); padding: 40px 32px; text-align: center; }
    .icon { width: 72px; height: 72px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: white; color: ${config.accent}; font-size: 36px; font-weight: 700; margin-bottom: 24px; }
    h1 { margin: 0 0 12px; font-size: 34px; }
    p { margin: 0; color: #475569; font-size: 18px; line-height: 1.6; }
    .foot { margin-top: 28px; font-size: 13px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="icon">${config.icon}</div>
      <h1>${config.title}</h1>
      <p>${escapeHtml(message)}</p>
      <div class="foot">Платформа Sintagma — sintagma.com.ru</div>
    </div>
  </div>
</body>
</html>`;
};

const renderFormPage = (params: { token: string; orgName: string; phone: string }) => `<!doctype html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Запрос консультации — Sintagma</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; background: linear-gradient(180deg, #fff7ed 0%, #fff 45%, #f8fafc 100%); color: #0f172a; }
    .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { width: 100%; max-width: 560px; background: #fff; border: 1px solid #fde68a; border-radius: 28px; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.10); padding: 36px 28px; }
    .eyebrow { display: inline-block; padding: 8px 12px; background: #fff7ed; color: #c2410c; border-radius: 999px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    h1 { margin: 18px 0 10px; font-size: 34px; line-height: 1.1; }
    .sub { margin: 0 0 28px; color: #64748b; font-size: 16px; line-height: 1.6; }
    .org { font-weight: 700; color: #0f172a; }
    label { display: block; margin-bottom: 8px; font-size: 14px; font-weight: 700; color: #334155; }
    .field { margin-bottom: 18px; }
    input, textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: 16px; padding: 14px 16px; font-size: 16px; color: #0f172a; background: #fff; outline: none; transition: border-color .2s, box-shadow .2s; }
    input:focus, textarea:focus { border-color: #f59e0b; box-shadow: 0 0 0 4px rgba(245, 158, 11, .15); }
    textarea { min-height: 120px; resize: vertical; }
    .hint { margin-top: 6px; font-size: 12px; color: #94a3b8; }
    button { width: 100%; border: 0; border-radius: 16px; padding: 16px 18px; font-size: 16px; font-weight: 700; color: white; background: linear-gradient(135deg, #f59e0b, #ea580c); cursor: pointer; box-shadow: 0 16px 32px rgba(234, 88, 12, .20); }
    button:disabled { opacity: .7; cursor: wait; }
    .error { display: none; margin-bottom: 16px; padding: 12px 14px; border-radius: 14px; background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
    .foot { margin-top: 22px; text-align: center; font-size: 13px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="eyebrow">Sintagma</div>
      <h1>Запрос консультации</h1>
      <p class="sub">Если хотите, оставьте номер и комментарий — мы свяжемся с <span class="org">${escapeHtml(params.orgName || "вашей организацией")}</span> в удобное время.</p>
      <div id="error" class="error"></div>
      <form id="consultation-form">
        <div class="field">
          <label for="phone">Телефон для связи</label>
          <input id="phone" name="phone" type="tel" placeholder="+7 (___) ___-__-__" value="${escapeHtml(params.phone)}" />
          <div class="hint">Можно указать номер организации или другой удобный номер.</div>
        </div>
        <div class="field">
          <label for="comment">Комментарий</label>
          <textarea id="comment" name="comment" placeholder="Например: удобно перезвонить после 15:00"></textarea>
          <div class="hint">Напишите удобное время для звонка или любые детали.</div>
        </div>
        <button id="submit-button" type="submit">Отправить запрос</button>
      </form>
      <div class="foot">Платформа Sintagma — sintagma.com.ru</div>
    </div>
  </div>
  <script>
    const form = document.getElementById('consultation-form');
    const errorBox = document.getElementById('error');
    const submitButton = document.getElementById('submit-button');
    const token = ${JSON.stringify(params.token)};
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorBox.style.display = 'none';
      submitButton.disabled = true;
      submitButton.textContent = 'Отправляем...';
      try {
        const response = await fetch(window.location.pathname, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            phone: document.getElementById('phone').value.trim(),
            comment: document.getElementById('comment').value.trim(),
          }),
        });
        const data = await response.json();
        if (!response.ok || !data.ok) {
          throw new Error(data.error || data.message || 'Произошла ошибка.');
        }
        window.location.replace(${JSON.stringify(appUrl)} + '/functions/v1/handle-email-action?result=' + encodeURIComponent(data.status || 'success') + '&message=' + encodeURIComponent(data.message || 'Спасибо!'));
      } catch (error) {
        errorBox.textContent = error.message || 'Произошла ошибка.';
        errorBox.style.display = 'block';
        submitButton.disabled = false;
        submitButton.textContent = 'Отправить запрос';
      }
    });
  </script>
</body>
</html>`;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const html = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const result = url.searchParams.get("result");
  const resultMessage = url.searchParams.get("message");

  if (req.method === "GET" && result && resultMessage) {
    const safeStatus = result === "success" || result === "already" ? result : "error";
    return html(renderResultPage(safeStatus, resultMessage));
  }

  const token = req.method === "GET"
    ? url.searchParams.get("token")
    : (() => null)();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  if (req.method === "GET") {
    if (!token) {
      return html(renderResultPage("error", "Неверная ссылка. Токен не указан."), 400);
    }

    try {
      const { data: tokenData, error } = await supabase
        .from("email_action_tokens")
        .select("*")
        .eq("id", token)
        .single();

      if (error || !tokenData) {
        return html(renderResultPage("error", "Ссылка недействительна или срок действия истёк."), 404);
      }

      if (tokenData.used) {
        return html(renderResultPage("already", "Ваш запрос уже был принят ранее. Мы свяжемся с вами в ближайшее время."));
      }

      const { data: org } = await supabase
        .from("organizations")
        .select("name, phone")
        .eq("id", tokenData.organization_id)
        .single();

      return html(renderFormPage({
        token,
        orgName: org?.name || "",
        phone: org?.phone || "",
      }));
    } catch (error) {
      console.error("GET error:", error);
      return html(renderResultPage("error", "Произошла ошибка при открытии формы. Попробуйте позже."), 500);
    }
  }

  if (req.method === "POST") {
    try {
      const body = await req.json();
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
