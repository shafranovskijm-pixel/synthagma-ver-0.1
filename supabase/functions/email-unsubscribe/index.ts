// One-Click Unsubscribe (RFC 8058) + страница подтверждения отписки
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, list-unsubscribe",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const HTML_HEAD = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Отписка от рассылки Sintagma</title><style>
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#f7fafc;color:#1a202c;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
.card{background:#fff;border-radius:16px;padding:40px;max-width:480px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.06);text-align:center}
h1{color:#1AAB9B;margin:0 0 12px;font-size:24px}
p{color:#475569;line-height:1.6;margin:8px 0}
.btn{display:inline-block;background:#1AAB9B;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:600;margin-top:20px;border:none;cursor:pointer;font-size:15px}
.btn.secondary{background:#e2e8f0;color:#1a202c}
.success{color:#1AAB9B}
.error{color:#e53e3e}
</style></head><body><div class="card">`;
const HTML_FOOT = `</div></body></html>`;

function htmlPage(content: string, status = 200) {
  return new Response(HTML_HEAD + content + HTML_FOOT, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("t");

    if (!token) return htmlPage(`<h1>Ошибка</h1><p>Токен отписки не указан.</p>`, 400);

    // Найти получателя по токену
    const { data: rec } = await admin
      .from("email_campaign_recipients")
      .select("id, email, campaign_id")
      .eq("open_token", token)
      .maybeSingle();

    if (!rec) return htmlPage(`<h1>Ссылка недействительна</h1><p>Возможно, она уже использована.</p>`, 404);

    const { data: campaign } = await admin
      .from("email_campaigns")
      .select("scope, organization_id, unsubscribe_count")
      .eq("id", rec.campaign_id)
      .maybeSingle();

    const scope = campaign?.scope === "org" && campaign?.organization_id
      ? campaign.organization_id
      : "platform";

    // POST = подтверждение (One-Click из почтового клиента или от формы)
    // GET с ?confirm=1 = клик из браузера после показа формы
    const confirm = url.searchParams.get("confirm") === "1";
    const isPost = req.method === "POST";

    if (isPost || confirm) {
      const ua = req.headers.get("user-agent") || null;
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

      const { error: insErr } = await admin.from("email_suppressions").upsert({
        email: rec.email.toLowerCase(),
        scope,
        reason: "unsubscribe",
        source_campaign_id: rec.campaign_id,
        user_agent: ua,
        ip_address: ip,
      }, { onConflict: "email,scope" });

      if (insErr) console.error("suppression upsert", insErr);

      // Инкрементируем счётчик отписок
      await admin.from("email_campaigns").update({
        unsubscribe_count: (campaign?.unsubscribe_count || 0) + 1,
      }).eq("id", rec.campaign_id);

      if (isPost) {
        // RFC 8058 — почтовый клиент ждёт 200 OK без HTML
        return new Response("ok", { status: 200, headers: corsHeaders });
      }

      return htmlPage(`
        <h1 class="success">✓ Вы отписались</h1>
        <p>Адрес <b>${rec.email}</b> больше не получит писем от Sintagma.</p>
        <p style="font-size:13px;color:#94a3b8;margin-top:20px">Если это произошло по ошибке — просто напишите нам на <a href="mailto:info@sintagma.com.ru">info@sintagma.com.ru</a>.</p>
      `);
    }

    // GET без confirm — показать форму подтверждения (для веб-клика)
    return htmlPage(`
      <h1>Отписка от рассылки</h1>
      <p>Вы хотите отписать адрес <b>${rec.email}</b> от рассылок Sintagma?</p>
      <p style="font-size:13px;color:#94a3b8">Вы перестанете получать наши письма с предложениями и обновлениями.</p>
      <form method="get" style="margin-top:20px">
        <input type="hidden" name="t" value="${token}">
        <input type="hidden" name="confirm" value="1">
        <button class="btn" type="submit">Да, отписаться</button>
      </form>
    `);
  } catch (e) {
    console.error("email-unsubscribe error", e);
    return htmlPage(`<h1 class="error">Ошибка</h1><p>${(e as Error).message}</p>`, 500);
  }
});
