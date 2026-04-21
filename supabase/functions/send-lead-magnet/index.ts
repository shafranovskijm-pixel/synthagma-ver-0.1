// Edge function: send-lead-magnet
// Отправляет лид-магнит (PDF/файл-подарок) на email пользователя через SMTP-функцию send-email.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Payload {
  email: string;
  full_name: string;
  organization_name: string;
  file_url: string;
  file_label: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json() as Payload;
    if (!body?.email || !body?.file_url) {
      return new Response(JSON.stringify({ error: "email and file_url required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#ffffff;color:#0f172a">
        <h2 style="color:#0d9488;margin:0 0 16px">Спасибо за регистрацию${body.full_name ? `, ${body.full_name}` : ""}!</h2>
        <p style="font-size:15px;line-height:1.6">
          ${body.organization_name} подготовила для вас полезный материал —
          <b>${body.file_label}</b>.
        </p>
        <p style="text-align:center;margin:28px 0">
          <a href="${body.file_url}" target="_blank"
             style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">
            Скачать материал
          </a>
        </p>
        <p style="font-size:13px;color:#64748b;line-height:1.5">
          Если кнопка не работает, скопируйте ссылку:<br>
          <a href="${body.file_url}" style="color:#0d9488;word-break:break-all">${body.file_url}</a>
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
        <p style="font-size:12px;color:#94a3b8">Платформа Синтагма</p>
      </div>
    `;

    const { error } = await admin.functions.invoke("send-email", {
      body: {
        to: body.email,
        subject: `${body.organization_name}: ${body.file_label}`,
        html,
      },
    });
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
