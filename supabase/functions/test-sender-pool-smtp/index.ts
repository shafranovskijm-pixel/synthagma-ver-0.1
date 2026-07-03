import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendSmtpEmail } from "../_shared/smtp-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { sender_id, to } = await req.json().catch(() => ({}));
    if (!sender_id) return new Response(JSON.stringify({ error: "sender_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    // Admin-only: check role via has_role
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    if (!isAdmin) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: row, error: rowErr } = await admin.from("email_sender_pool").select("*").eq("id", sender_id).maybeSingle();
    if (rowErr || !row) return new Response(JSON.stringify({ success: false, error: rowErr?.message || "Ящик не найден" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!row.app_password) return new Response(JSON.stringify({ success: false, error: "Не задан app-пароль" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const recipient = to || row.email;
    let testError: string | null = null;
    try {
      await sendSmtpEmail({
        host: row.host, port: row.port, username: row.email, password: row.app_password,
        encryption: row.encryption, from_email: row.email, from_name: row.from_name || "Синтагма",
      }, {
        to: recipient,
        subject: "✅ Проверка ящика пула — Sintagma",
        html: `<div style="font-family:Arial,sans-serif;padding:16px"><h2 style="color:#0EA5A4">SMTP работает</h2><p>Ящик <b>${row.email}</b> успешно авторизовался и отправил тестовое письмо.</p><p style="color:#64748b;font-size:12px">${new Date().toLocaleString("ru-RU")}</p></div>`,
      });
    } catch (e) {
      testError = (e as Error).message;
    }

    await admin.from("email_sender_pool").update({
      last_error: testError,
      last_error_at: testError ? new Date().toISOString() : null,
    }).eq("id", sender_id);

    return new Response(JSON.stringify({ success: !testError, error: testError, sent_to: recipient }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
