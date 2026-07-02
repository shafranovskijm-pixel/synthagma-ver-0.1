import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { name, organization, phone, email, slot, message, source } = body || {};

    if (!name || !phone) {
      return new Response(JSON.stringify({ error: "name_and_phone_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const notes = [
      slot ? `Удобное время: ${slot}` : null,
      message ? `Комментарий: ${message}` : null,
      `Источник: ${source || "demonstration_page"}`,
    ].filter(Boolean).join("\n");

    const { data: lead, error: leadErr } = await supabase
      .from("sales_leads")
      .insert({
        contact_name: name,
        company_name: organization || name,
        phone,
        email: email || null,
        notes,
        status: "new",
        source: "demo_request",
      })
      .select()
      .single();

    if (leadErr) console.error("lead insert error", leadErr);

    // Best-effort email notification
    try {
      await supabase.functions.invoke("send-email", {
        body: {
          to: Deno.env.get("SALES_NOTIFY_EMAIL") || "sales@sintagma.com.ru",
          subject: `Новая заявка на демо: ${name}${organization ? ` (${organization})` : ""}`,
          html: `
            <h2>Заявка с /demonstration</h2>
            <p><b>Имя:</b> ${escapeHtml(name)}</p>
            <p><b>Организация:</b> ${escapeHtml(organization || "—")}</p>
            <p><b>Телефон:</b> ${escapeHtml(phone)}</p>
            <p><b>Email:</b> ${escapeHtml(email || "—")}</p>
            <p><b>Слот:</b> ${escapeHtml(slot || "—")}</p>
            <p><b>Комментарий:</b><br/>${escapeHtml(message || "—").replace(/\n/g, "<br/>")}</p>
          `,
        },
      });
    } catch (e) {
      console.error("email notify failed", e);
    }

    return new Response(JSON.stringify({ ok: true, lead_id: lead?.id ?? null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function escapeHtml(s: string): string {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
